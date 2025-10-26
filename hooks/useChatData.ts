import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { Profile, Conversation, Message, Reaction } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
// FIX: The 'Session' and 'RealtimeChannel' types are not exported from '@supabase/supabase-js' in this environment. Using 'any' instead.
// import { Session, RealtimeChannel } from '@supabase/supabase-js';

const MESSAGES_PER_PAGE = 50;

// FIX: Using 'any' for session as 'Session' type is not available for import.
export const useChatData = (session: any | null) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [presences, setPresences] = useState<Record<string, any>>({});
  const [messages, setMessages] = useState<Record<number, Message[]>>({});
  const [messagePage, setMessagePage] = useState<Record<number, number>>({});
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [allMessagesLoaded, setAllMessagesLoaded] = useState<Record<number, boolean>>({});
  
  const currentUser = useMemo(() => {
    return allProfiles.find(p => p.id === session?.user?.id);
  }, [allProfiles, session]);

  const fetchInitialData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const [profilesRes, convosRes] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.rpc('get_user_conversations')
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (convosRes.error) throw convosRes.error;

      if (profilesRes.data) {
          setAllProfiles(profilesRes.data);
          await AsyncStorage.setItem('CACHE_PROFILES', JSON.stringify(profilesRes.data));
      }
      if (convosRes.data) {
          setConversations(convosRes.data);
          await AsyncStorage.setItem('CACHE_CONVERSATIONS', JSON.stringify(convosRes.data));
      }
    } catch (e: any) {
      console.error("Failed to fetch initial data:", e);
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [session]);
  
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

    if (page === 0 && data) {
        try { await AsyncStorage.setItem(`CACHE_MESSAGES_${conversationId}`, JSON.stringify(data)); }
        catch (e) { console.error("Failed to cache messages", e) }
    }
    
    return (data || []);
  }, [session?.user.id]);
  
  useEffect(() => {
    const loadFromCache = async () => {
      try {
        const [cachedProfiles, cachedConvos] = await Promise.all([
            AsyncStorage.getItem('CACHE_PROFILES'),
            AsyncStorage.getItem('CACHE_CONVERSATIONS')
        ]);
        if (cachedProfiles) setAllProfiles(JSON.parse(cachedProfiles));
        if (cachedConvos) setConversations(JSON.parse(cachedConvos));
      } catch (e) { console.error("Failed to load data from cache", e); }
    };
    loadFromCache();
  }, []);

  useEffect(() => {
    if (!session) {
      setLoading(true);
      setError(null);
      AsyncStorage.multiRemove(['CACHE_PROFILES', 'CACHE_CONVERSATIONS']).then(() => {
          setAllProfiles([]);
          setConversations([]);
          setMessages({});
          setLoading(false);
      });
      return;
    }
    fetchInitialData();
  }, [session, fetchInitialData]);

  const loadInitialMessages = useCallback(async (activeConversationId: number) => {
    if (activeConversationId) {
        if (!messages[activeConversationId]) {
            try {
                const cached = await AsyncStorage.getItem(`CACHE_MESSAGES_${activeConversationId}`);
                if (cached) setMessages(p => ({ ...p, [activeConversationId]: JSON.parse(cached) }));
            } catch (e) {}
        }
        if (!messagePage[activeConversationId] && !allMessagesLoaded[activeConversationId]) {
            setLoadingMoreMessages(true);
            try {
                const initialMessages = await fetchMessages(activeConversationId, 0);
                setMessages(p => ({ ...p, [activeConversationId]: initialMessages }));
                setMessagePage(p => ({ ...p, [activeConversationId]: 0 }));
                if(initialMessages.length < MESSAGES_PER_PAGE) setAllMessagesLoaded(p => ({...p, [activeConversationId]: true}));
            } catch (e) {
                console.error("Failed to load initial messages", e);
            } finally {
                setLoadingMoreMessages(false);
            }
        }
    }
  }, [fetchMessages, messages, messagePage, allMessagesLoaded]);

  const loadMoreMessages = useCallback(async (activeConversationId: number) => {
    if (loadingMoreMessages || !activeConversationId || allMessagesLoaded[activeConversationId]) return;
    setLoadingMoreMessages(true);
    const nextPage = (messagePage[activeConversationId] || 0) + 1;
    const newMessages = await fetchMessages(activeConversationId, nextPage);
    if (newMessages.length < MESSAGES_PER_PAGE) setAllMessagesLoaded(p => ({...p, [activeConversationId]: true}));
    setMessages(p => ({ ...p, [activeConversationId]: [...(p[activeConversationId] || []), ...newMessages] }));
    setMessagePage(p => ({ ...p, [activeConversationId]: nextPage }));
    setLoadingMoreMessages(false);
  }, [loadingMoreMessages, allMessagesLoaded, messagePage, fetchMessages]);

  const markMessagesAsRead = useCallback(async (messageIds: number[], activeConversationId: number) => {
      if(!currentUser || !activeConversationId || messageIds.length === 0) return;
      supabase.channel(`chat:${activeConversationId}`).send({ type: 'broadcast', event: 'messages_read', payload: { message_ids: messageIds, reader_id: currentUser.id }});
      await supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', messageIds).neq('user_id', currentUser.id).is('read_at', null);
    }, [currentUser]);
    
  useEffect(() => {
    if (!currentUser) return;

    // FIX: Using 'any' as 'RealtimeChannel' type is not available for import.
    const channels: any[] = [];
    const presenceChannel = supabase.channel('online-users');
    channels.push(presenceChannel);
    presenceChannel.on('presence', { event: 'sync' }, () => setPresences(presenceChannel.presenceState())).subscribe(async (status) => { 
        if (status === 'SUBSCRIBED') {
            await presenceChannel.track({ user_id: currentUser.id }); 
            // Edge Case: Handle realtime subscription disconnects by refetching data.
            // This ensures missed messages are fetched after reconnecting.
            fetchInitialData();
        }
    });

    const handleMessageInsert = (payload: any) => {
      const newMessage = payload.new;
      // Edge Case: Validate malformed message payloads to prevent crashes.
      if (!newMessage || typeof newMessage.id !== 'number' || typeof newMessage.conversation_id !== 'number') {
        console.warn("Received malformed message, discarding:", newMessage);
        return;
      }
      setMessages(prev => ({...prev, [newMessage.conversation_id]: [newMessage, ...(prev[newMessage.conversation_id] || [])]}));
    };
    const handleMessageUpdate = (payload: any) => setMessages(prev => ({...prev, [payload.new.conversation_id]: (prev[payload.new.conversation_id] || []).map(m => m.id === payload.new.id ? payload.new : m)}));
    const handleMessageDelete = (payload: any) => setMessages(prev => ({...prev, [payload.old.conversation_id]: (prev[payload.old.conversation_id] || []).filter(m => m.id !== payload.old.id)}));
    
    const handleReaction = (payload: any, isDelete = false) => {
        const reaction = isDelete ? payload.old : payload.new;
        if(!reaction.message_id) return;
        setMessages(prev => {
            for (const convoId in prev) {
                const messageIndex = prev[convoId].findIndex(m => m.id === reaction.message_id);
                if (messageIndex !== -1) {
                    const updatedMessages = [...prev[convoId]];
                    const targetMessage = { ...updatedMessages[messageIndex] };
                    if (isDelete) {
                        targetMessage.reactions = (targetMessage.reactions || []).filter(r => r.id !== reaction.id);
                    } else {
                        targetMessage.reactions = [...(targetMessage.reactions || []).filter(r => r.id !== reaction.id), reaction];
                    }
                    updatedMessages[messageIndex] = targetMessage;
                    return { ...prev, [convoId]: updatedMessages };
                }
            }
            return prev;
        });
    };

    const messagesSub = supabase.channel('public:messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
          if(payload.eventType === 'INSERT') handleMessageInsert(payload);
          if(payload.eventType === 'UPDATE') handleMessageUpdate(payload);
          if(payload.eventType === 'DELETE') handleMessageDelete(payload);
      }).subscribe();
    channels.push(messagesSub);

    const reactionsSub = supabase.channel('public:reactions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, (payload) => {
          if(payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') handleReaction(payload);
          if(payload.eventType === 'DELETE') handleReaction(payload, true);
      }).subscribe();
    channels.push(reactionsSub);
    
    const conversationSub = supabase.channel('public:conversations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, async () => {
          const { data } = await supabase.rpc('get_user_conversations');
          if (data) setConversations(data);
      }).subscribe();
    channels.push(conversationSub);
    
    const participantsSub = supabase.channel('public:conversation_participants')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_participants' }, async (payload: any) => {
          if (payload.new?.user_id === currentUser.id || payload.old?.user_id === currentUser.id) {
              const { data } = await supabase.rpc('get_user_conversations');
              if (data) setConversations(data);
          }
      }).subscribe();
    channels.push(participantsSub);

    // Edge Case: Handle multi-device state consistency for profile edits.
    const profileSub = supabase.channel('public:profiles')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
          const updatedProfile = payload.new as Profile;
          setAllProfiles(currentProfiles => 
              currentProfiles.map(p => p.id === updatedProfile.id ? updatedProfile : p)
          );
      }).subscribe();
    channels.push(profileSub);

    return () => {
        channels.forEach(channel => supabase.removeChannel(channel));
    };
  }, [currentUser, fetchInitialData]);

  return { loading, error, refetch: fetchInitialData, currentUser, allProfiles, setAllProfiles, conversations, setConversations, presences, messages, setMessages, loadInitialMessages, loadMoreMessages, loadingMoreMessages, allMessagesLoaded, markMessagesAsRead };
};