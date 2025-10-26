import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { Profile, Conversation, Message } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session } from '@supabase/supabase-js';

const MESSAGES_PER_PAGE = 50;

export const useChatData = (session: Session | null, activeConversationId: number | null) => {
  const [loading, setLoading] = useState(true);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [presences, setPresences] = useState<Record<string, any>>({});
  const [messages, setMessages] = useState<Record<number, Message[]>>({});
  const [messagePage, setMessagePage] = useState<Record<number, number>>({});
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [allMessagesLoaded, setAllMessagesLoaded] = useState<Record<number, boolean>>({});

  const presenceChannel = useRef<any>(null);
  const subscriptions = useRef<any[]>([]);

  const currentUser = useMemo(() => {
    return allProfiles.find(p => p.id === session?.user?.id);
  }, [allProfiles, session]);
  
  const fetchMessages = useCallback(async (conversationId: number, page: number) => {
    if (!session?.user.id) return [];
    const from = page * MESSAGES_PER_PAGE;
    const to = from + MESSAGES_PER_PAGE - 1;

    const { data: hiddenMessageIdsData } = await supabase.from('hidden_messages').select('message_id').eq('user_id', session.user.id);
    const hiddenIds = (hiddenMessageIdsData || []).map(h => h.message_id);

    let query = supabase.from('messages').select('*, reactions(*)').eq('conversation_id', conversationId);
    if (hiddenIds.length > 0) query = query.not('id', 'in', `(${hiddenIds.join(',')})`);
    
    const { data, error } = await query.order('created_at', { ascending: false }).range(from, to);
    if (error) { console.error('Error fetching messages', error); throw error; }
    
    return (data || []);
  }, [session?.user.id]);

  useEffect(() => {
    if (!session) {
      setLoading(false);
      setAllProfiles([]);
      setConversations([]);
      setPresences({});
      setMessages({});
      return;
    }

    setLoading(true);
    Promise.all([
      supabase.from('profiles').select('*'),
      supabase.rpc('get_user_conversations')
    ]).then(([profilesRes, convosRes]) => {
      if (profilesRes.error) throw profilesRes.error;
      setAllProfiles(profilesRes.data || []);
      if (convosRes.error) throw convosRes.error;
      setConversations(convosRes.data || []);
    }).catch(error => {
      console.error("Failed to fetch initial data:", error);
    }).finally(() => {
      setLoading(false);
    });
  }, [session]);

  useEffect(() => {
    if (activeConversationId && !messages[activeConversationId] && !allMessagesLoaded[activeConversationId]) {
      setLoadingMoreMessages(true);
      fetchMessages(activeConversationId, 0).then(initialMessages => {
        setMessages(prev => ({ ...prev, [activeConversationId]: initialMessages }));
        setMessagePage(prev => ({ ...prev, [activeConversationId]: 0 }));
        if(initialMessages.length < MESSAGES_PER_PAGE) {
            setAllMessagesLoaded(prev => ({...prev, [activeConversationId]: true}));
        }
      }).catch(e => console.error("Failed to fetch initial messages", e))
      .finally(() => setLoadingMoreMessages(false));
    }
  }, [activeConversationId, fetchMessages, messages, allMessagesLoaded]);

  const loadMoreMessages = useCallback(async () => {
    if (loadingMoreMessages || !activeConversationId || allMessagesLoaded[activeConversationId]) return;
    setLoadingMoreMessages(true);
    const nextPage = (messagePage[activeConversationId] || 0) + 1;
    try {
        const newMessages = await fetchMessages(activeConversationId, nextPage);
        if (newMessages.length < MESSAGES_PER_PAGE) {
            setAllMessagesLoaded(prev => ({...prev, [activeConversationId]: true}));
        }
        setMessages(prev => ({
            ...prev,
            [activeConversationId]: [...(prev[activeConversationId] || []), ...newMessages]
        }));
        setMessagePage(prev => ({ ...prev, [activeConversationId]: nextPage }));
    } catch (error) {
       console.error("Couldn't load older messages.");
    }
    setLoadingMoreMessages(false);
  }, [loadingMoreMessages, allMessagesLoaded, activeConversationId, messagePage, fetchMessages]);

  const markMessagesAsRead = useCallback(async (messageIds: number[]) => {
      if(!currentUser || !activeConversationId || messageIds.length === 0) return;
      
      const channel = supabase.channel(`chat:${activeConversationId}`);
      channel.send({ type: 'broadcast', event: 'messages_read', payload: { message_ids: messageIds, reader_id: currentUser.id }});

      try {
        await supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', messageIds).neq('user_id', currentUser.id).is('read_at', null);
      } catch (error) {
        // Fail silently
      }
    }, [currentUser, activeConversationId]);

  useEffect(() => {
    if (!currentUser) return;

    // Clear previous subscriptions
    subscriptions.current.forEach(sub => supabase.removeChannel(sub));
    subscriptions.current = [];

    // Setup presence
    presenceChannel.current = supabase.channel('online-users');
    presenceChannel.current
        .on('presence', { event: 'sync' }, () => setPresences(presenceChannel.current.presenceState()))
        .subscribe(async (status: string) => {
            if (status === 'SUBSCRIBED') await presenceChannel.current.track({ user_id: currentUser.id });
        });
    subscriptions.current.push(presenceChannel.current);

    // Subscribe to changes for all conversations
    const conversationIds = conversations.map(c => c.id);
    if (conversationIds.length > 0) {
      const allConvosChannel = supabase.channel('all-conversations-channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=in.(${conversationIds.join(',')})` },
          (payload) => {
            const newMessage = payload.new as Message;
            // Update message list if it's loaded
            setMessages(prev => ({
              ...prev,
              [newMessage.conversation_id]: [newMessage, ...(prev[newMessage.conversation_id] || [])]
            }));
            // Update sidebar
            setConversations(currentConvos => {
              const convoIndex = currentConvos.findIndex(c => c.id === newMessage.conversation_id);
              if (convoIndex === -1) return currentConvos;
              const updatedConvo = { ...currentConvos[convoIndex], last_message_content: newMessage.content || (newMessage.media_type ? 'Media' : ''), last_message_created_at: newMessage.created_at };
              return [updatedConvo, ...currentConvos.slice(0, convoIndex), ...currentConvos.slice(convoIndex + 1)];
            });
          }
        )
        .on('broadcast', { event: 'messages_read' }, ({ payload }) => {
            const { message_ids, reader_id } = payload;
            if (reader_id === currentUser.id) return;
            // Update messages in state
            const convoId = conversations.find(c => c.participants.some(p => p.id === reader_id))?.id;
            if(convoId && messages[convoId]) {
                setMessages(prev => ({
                    ...prev,
                    [convoId]: (prev[convoId] || []).map(m => message_ids.includes(m.id) ? { ...m, read_at: new Date().toISOString() } : m)
                }));
            }
        })
        .subscribe();
      subscriptions.current.push(allConvosChannel);
    }
    
    return () => {
        subscriptions.current.forEach(sub => supabase.removeChannel(sub));
    };
  }, [currentUser, conversations]);


  return { 
    loading, 
    currentUser, 
    allProfiles, 
    setAllProfiles, 
    conversations, 
    setConversations, 
    presences,
    messages,
    setMessages,
    loadMoreMessages,
    loadingMoreMessages,
    allMessagesLoaded: allMessagesLoaded[activeConversationId || -1] || false,
    markMessagesAsRead
  };
};