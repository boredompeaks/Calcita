// File: supabase/functions/messaging-utils/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Expo } from 'npm:expo-server-sdk@3.7.0';

const expo = new Expo();

// Admin client for elevated privileges.
// FIX: The Deno global type might not be available in all TypeScript environments, leading to a type error for 'Deno.env'. Casting 'Deno' to 'any' allows access to environment variables without causing a compile-time error.
const supabaseAdminClient = createClient(
  (Deno as any).env.get('SUPABASE_URL')!,
  (Deno as any).env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (req) => {
  const { type, record } = await req.json();

  switch (type) {
    case 'SEND_NOTIFICATION':
      return await handleSendNotification(record);
    case 'DELETE_VIEW_ONCE':
      return await handleDeleteViewOnce(record);
    default:
      return new Response(JSON.stringify({ error: 'Invalid type' }), { status: 400 });
  }
});

async function handleSendNotification(newMessage: any) {
  // 1. Get participants of the conversation except the sender
  const { data: participants, error: pError } = await supabaseAdminClient
    .from('conversation_participants')
    .select('user_id')
    .eq('conversation_id', newMessage.conversation_id)
    .neq('user_id', newMessage.user_id);

  if (pError) return new Response(JSON.stringify({ error: pError.message }), { status: 500 });
  
  const recipientIds = participants.map((p: any) => p.user_id);
  if (recipientIds.length === 0) return new Response(JSON.stringify({ message: 'No recipients.' }), { status: 200 });

  // 2. Get the push tokens of the recipients
  const { data: profiles, error: prError } = await supabaseAdminClient
    .from('profiles')
    .select('push_token')
    .in('id', recipientIds)
    .not('push_token', 'is', null);
    
  if (prError) return new Response(JSON.stringify({ error: prError.message }), { status: 500 });

  const expoPushTokens = profiles.map((p: any) => p.push_token).filter((token: string) => Expo.isExpoPushToken(token));
  if (expoPushTokens.length === 0) return new Response(JSON.stringify({ message: 'No valid push tokens.' }), { status: 200 });
  
  // 3. Create and send the vague notification
  const messages = expoPushTokens.map((pushToken: string) => ({
    to: pushToken,
    sound: 'default',
    title: 'Calculator', // Vague title
    body: 'Notification', // Vague body
  }));

  const chunks = expo.chunkPushNotifications(messages as any);
  for (const chunk of chunks) {
    await expo.sendPushNotificationsAsync(chunk).catch(console.error);
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
}

async function handleDeleteViewOnce(message: any) {
  // This function is called after a user views a one-time message.
  // It securely deletes the message from the database.
  const { error } = await supabaseAdminClient.rpc('delete_viewed_message', {
    message_id_to_delete: message.id
  });

  if (error) {
    console.error('Error deleting view-once message:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
}