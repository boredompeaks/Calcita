import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Profile, Message, Conversation, SignalingPayload, Reaction } from '../types';
import { supabase } from '../services/supabaseClient';
import { WebRTCManager } from '../services/webrtcService';
import Sidebar from './Sidebar';
import ChatView from './ChatView';
import Auth from './Auth';
import NewConversationModal from './NewConversationModal';
import ProfileModal from './ProfileModal';
import ForwardModal from './ForwardModal';
import IncomingCallModal from './IncomingCallModal';
import PanicButton from './PanicButton';
import { SpinnerIcon, AlertTriangleIcon, XIcon, CheckCircleIcon } from './icons';
import { SafeAreaView, View, StyleSheet, ImageBackground, Platform, UIManager, useWindowDimensions, Alert, Text, TouchableOpacity, BackHandler, AppState, AppStateStatus } from 'react-native';
import Animated, { Layout, FadeInUp, FadeOutUp, useSharedValue, useAnimatedStyle, withTiming, runOnJS, FadeIn } from 'react-native-reanimated';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MediaStream } from 'react-native-webrtc';
import { useChatData } from '../hooks/useChatData';
// FIX: The 'Session' type is not exported from '@supabase/supabase-js' in this environment.
// import { Session } from '@supabase/supabase-js';
import { BlurView } from 'expo-blur';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const CALL_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const TOAST_DURATION = 3500;
const PROFILE_UPDATE_QUEUE_KEY = 'profileUpdateQueue';
const MESSAGE_QUEUE_KEY = 'messageQueue';

type QueuedMessage = { tempId: string; payload: Omit<Message, 'id' | 'created_at' | 'reactions' | 'read_at'>; file?: { uri: string; type: string; name: string }; retries: number; };
type QueuedProfileUpdate = { name: string; avatarFile?: { uri: string; type: string; name: string }; retries: number };
type Toast = { id: number, message: string, type: 'error' | 'info' };

const ToastNotification: React.FC<{ toast: Toast, onDismiss: (id: number) => void }> = ({ toast, onDismiss }) => {
    const progress = useSharedValue(1);
    useEffect(() => {
        progress.value = withTiming(0, { duration: TOAST_DURATION }, (isFinished) => { if (isFinished) runOnJS(onDismiss)(toast.id); });
    }, [toast, onDismiss, progress]);
    const animatedStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
    const isInfo = toast.type === 'info';
    return (
        <Animated.View style={[styles.toastContainer, isInfo && styles.infoToast]} entering={FadeInUp} exiting={FadeOutUp}>
            {isInfo ? <CheckCircleIcon size={20} color="#FFF" /> : <AlertTriangleIcon size={20} color="#FFF" />}
            <Text style={styles.toastText}>{toast.message}</Text>
            <TouchableOpacity onPress={() => onDismiss(toast.id)} style={{padding: 4}}><XIcon size={16} color="#FFF" /></TouchableOpacity>
            <Animated.View style={[styles.toastProgress, isInfo && styles.infoToastProgress, animatedStyle]} />
        </Animated.View>
    );
};

async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) return;
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') finalStatus = (await Notifications.requestPermissionsAsync()).status;
  if (finalStatus !== 'granted') { alert('Failed to get push token!'); return; }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) { Alert.alert('Configuration Error', 'Missing Expo projectId. Push notifications will not work.'); return; }
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  if (Platform.OS === 'android') Notifications.setNotificationChannelAsync('default', { name: 'default', importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 250, 250, 250], lightColor: '#FF231F7C' });
  return token;
}

const ChatScreen: React.FC<{ onLock: () => void; onPanic: (c: Conversation | null, u: Profile | null) => void; onSetScreenSharing: (s: boolean) => void; }> = ({ onLock, onPanic: appOnPanic, onSetScreenSharing }) => {
  const { width } = useWindowDimensions();
  const isWideScreen = width > 768;

  const [session, setSession] = useState<any | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [activeView, setActiveView] = useState<'sidebar' | 'chat'>('sidebar');
  
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [typing, setTyping] = useState<{ user: string, conversationId: number } | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  
  const [isNewConvoModalVisible, setIsNewConvoModalVisible] = useState(false);
  const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);
  const [isForwardModalVisible, setIsForwardModalVisible] = useState(false);
  const [messageToForward, setMessageToForward] = useState<Message | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isOffline, setIsOffline] = useState(false);
  
  const [callState, setCallState] = useState<'idle' | 'outgoing' | 'incoming' | 'active'>('idle');
  const [incomingCallData, setIncomingCallData] = useState<{ offer: any, caller: Profile } | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localMediaState, setLocalMediaState] = useState({ isMicMuted: false, isCameraOff: false });
  const [remoteMediaState, setRemoteMediaState] = useState({ isMicMuted: false, isCameraOff: false });
  
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProcessingQueue = useRef(false);
  const typingClearTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const cameraWasOnBeforeBackground = useRef(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const callStateRef = useRef(callState);
  callStateRef.current = callState;

  const { loading, error, refetch, currentUser, allProfiles, setAllProfiles, conversations, setConversations, presences, messages, setMessages, loadInitialMessages, loadMoreMessages, loadingMoreMessages, allMessagesLoaded, markMessagesAsRead } = useChatData(session);
  
  useEffect(() => {
    if (selectedConversation?.id) {
        loadInitialMessages(selectedConversation.id);
    }
  }, [selectedConversation, loadInitialMessages]);

  const showToast = useCallback((message: string, type: 'error' | 'info' = 'error') => {
      setToasts(currentToasts => [...currentToasts, { id: Date.now(), message, type }]);
  }, []);
  const dismissToast = (id: number) => setToasts(currentToasts => currentToasts.filter(t => t.id !== id));

  const updateMessageInState = useCallback((conversationId: number, messageId: number | string, updates: Partial<Message>) => {
    setMessages(prev => ({ ...prev, [conversationId]: (prev[conversationId] || []).map(m => m.id === messageId ? { ...m, ...updates } : m) }));
  }, [setMessages]);

  const processProfileUpdateQueue = useCallback(async () => {
    if (!currentUser) return;
    try {
        const queueStr = await AsyncStorage.getItem(PROFILE_UPDATE_QUEUE_KEY);
        if (!queueStr) return;
        
        let queue: QueuedProfileUpdate[] = [];
        try {
            // Edge Case: Handle corrupted AsyncStorage data.
            queue = JSON.parse(queueStr);
        } catch(e) {
            console.error("Profile update queue is corrupted, clearing it.", e);
            await AsyncStorage.removeItem(PROFILE_UPDATE_QUEUE_KEY);
            return;
        }

        if (queue.length === 0) return;

        const updateToProcess = queue[0];
        try {
            let avatar_url = currentUser.avatar_url;

            if (updateToProcess.avatarFile) {
                const { avatarFile } = updateToProcess;
                const fileExt = avatarFile.name.split('.').pop()?.toLowerCase() || 'jpg';
                const filePath = `${currentUser.id}/profile.${fileExt}`;
                const response = await fetch(avatarFile.uri);
                const blob = await response.blob();
                const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, blob, { contentType: avatarFile.type, upsert: true });
                if (uploadError) throw uploadError;
                const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
                avatar_url = data.publicUrl;
            }

            const { error: updateError } = await supabase.from('profiles').update({ name: updateToProcess.name, avatar_url }).eq('id', currentUser.id);

            if (updateError) throw updateError;
            
            // Success, remove from queue
            const newQueue = queue.slice(1);
            await AsyncStorage.setItem(PROFILE_UPDATE_QUEUE_KEY, JSON.stringify(newQueue));
            showToast('A pending profile update was saved!', 'info');

        } catch(e) {
            console.error("Error processing profile update queue item:", e);
            // Edge Case: Retry logic for failed updates.
            if (updateToProcess.retries < MAX_RETRIES) {
                updateToProcess.retries++;
                const newQueue = [updateToProcess, ...queue.slice(1)];
                await AsyncStorage.setItem(PROFILE_UPDATE_QUEUE_KEY, JSON.stringify(newQueue));
            } else {
                showToast('Failed to save profile after multiple attempts.', 'error');
                const newQueue = queue.slice(1); // Discard after max retries
                await AsyncStorage.setItem(PROFILE_UPDATE_QUEUE_KEY, JSON.stringify(newQueue));
            }
        }
    } catch (e) {
        console.error("Critical error in profile update queue processor:", e);
    }
  }, [currentUser, showToast]);

  const processMessageQueue = useCallback(async () => {
    if (isProcessingQueue.current || !currentUser) return;
    isProcessingQueue.current = true;
  
    try {
      const queueStr = await AsyncStorage.getItem(MESSAGE_QUEUE_KEY);
      if (!queueStr) { isProcessingQueue.current = false; return; }

      let queue: QueuedMessage[] = [];
      try {
          // Edge Case: Handle corrupted AsyncStorage data.
          queue = JSON.parse(queueStr);
      } catch (e) {
          console.error("Message queue is corrupted, clearing it.", e);
          await AsyncStorage.removeItem(MESSAGE_QUEUE_KEY);
          isProcessingQueue.current = false;
          return;
      }
      
      if (queue.length === 0) { isProcessingQueue.current = false; return; }

      let networkErrorOccurred = false;
      const remainingInQueue: QueuedMessage[] = [];
  
      for (const item of queue) {
        if (item.retries >= MAX_RETRIES) {
            updateMessageInState(item.payload.conversation_id, item.tempId, { status: 'failed' });
            continue;
        }
        
        try {
          let finalPayload = { ...item.payload };
          if (item.file) {
            const fileExt = item.file.name.split('.').pop();
            const fileName = `${currentUser.id}-${Date.now()}.${fileExt}`;
            const filePath = `${item.payload.conversation_id}/${fileName}`;
            const response = await fetch(item.file.uri);
            const blob = await response.blob();
            const { error: uploadError } = await supabase.storage.from('media').upload(filePath, blob, { contentType: item.file.type, upsert: true });
            if (uploadError) throw uploadError;
            const { data } = supabase.storage.from('media').getPublicUrl(filePath);
            finalPayload.media_url = data.publicUrl;
            finalPayload.media_type = item.file.type;
          }
  
          const { error: insertError } = await supabase.from('messages').insert(finalPayload);
          if (insertError) throw insertError;
  
          setMessages(prev => ({...prev, [item.payload.conversation_id]: prev[item.payload.conversation_id]?.filter(m => m.id !== item.tempId)}));
        } catch (error) {
            networkErrorOccurred = true;
            item.retries++;
            remainingInQueue.push(item);
        }
      }
  
      await AsyncStorage.setItem(MESSAGE_QUEUE_KEY, JSON.stringify(remainingInQueue));

      const newIsOffline = networkErrorOccurred;
      if (isOffline !== newIsOffline) setIsOffline(newIsOffline);
      if (isOffline && !newIsOffline) showToast("You're back online! Messages sent.", 'info');
      else if (!isOffline && newIsOffline) showToast("Network error. Messages queued.", 'info');
  
    } catch (e) { console.error("Critical queue processing error:", e); } 
    finally { isProcessingQueue.current = false; }
  }, [currentUser, isOffline, showToast, updateMessageInState, setMessages]);
  
  const endCallCleanup = useCallback(() => {
    if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
    webRTCManager.close();
    setLocalStream(null);
    setRemoteStream(null);
    setCallState('idle');
    setIncomingCallData(null);
    onSetScreenSharing(false);
    setLocalMediaState({ isMicMuted: false, isCameraOff: false });
    setRemoteMediaState({ isMicMuted: false, isCameraOff: false });
  }, [onSetScreenSharing]);

  const webRTCManager = useRef(new WebRTCManager(setLocalStream, setRemoteStream)).current;
  webRTCManager.setOnConnectionStateChange((state) => {
    if (state === 'failed' || state === 'disconnected' || state === 'closed') endCallCleanup();
  });
  
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isOffline) interval = setInterval(processMessageQueue, 5000); 
    return () => { if (interval) clearInterval(interval); };
  }, [isOffline, processMessageQueue]);
  
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') { processMessageQueue(); processProfileUpdateQueue(); } });
    return () => sub.remove();
  }, [processMessageQueue, processProfileUpdateQueue]);

  useEffect(() => {
    setAuthLoading(true);
    // FIX: Cast supabase.auth to any to bypass incorrect TypeScript error.
    const { data: { subscription } } = (supabase.auth as any).onAuthStateChange((_event: string, session: any | null) => {
      // Edge Case: Handle graceful session expiration.
      if (_event === 'SIGNED_OUT' && sessionRef.current) {
        showToast("You've been signed out for security.", "info");
      }
      setSession(session);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, [showToast]);
  
  useEffect(() => { if (currentUser) { processMessageQueue(); processProfileUpdateQueue(); } }, [currentUser, processMessageQueue, processProfileUpdateQueue]);

  const sendSignalingMessage = useCallback((type: SignalingPayload['type'], data: any, recipientId: string) => {
    if (!currentUser) return;
    const channel = supabase.channel(`calls:${recipientId}`);
    channel.send({
      type: 'broadcast',
      event: 'webrtc',
      payload: { type, data, from: currentUser.id },
    }).then(() => supabase.removeChannel(channel));
  }, [currentUser]);

  const handleSignalingMessage = useCallback((payload: SignalingPayload) => {
    switch (payload.type) {
      case 'offer':
        if (callState !== 'idle') return;
        const caller = allProfiles.find(p => p.id === payload.from);
        if (caller) {
          setIncomingCallData({ offer: payload.data, caller });
          setCallState('incoming');
          if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
          callTimeoutRef.current = setTimeout(() => { setCallState(cs => cs === 'incoming' ? (setIncomingCallData(null), 'idle') : cs); }, CALL_TIMEOUT_MS + 2000);
        }
        break;
      case 'answer': 
        if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
        webRTCManager.setRemoteDescription(payload.data); 
        setCallState('active'); 
        break;
      case 'ice-candidate': webRTCManager.addIceCandidate(payload.data); break;
      case 'decline-call': if (callState === 'outgoing') { insertSystemMessage('Declined video call'); endCallCleanup(); } break;
      case 'end-call': endCallCleanup(); break;
      case 'audio-toggled': setRemoteMediaState(p => ({ ...p, isMicMuted: payload.data.isMuted })); break;
      case 'video-toggled': setRemoteMediaState(p => ({ ...p, isCameraOff: payload.data.isOff })); break;
    }
  }, [allProfiles, webRTCManager, callState, endCallCleanup]);

  useEffect(() => {
    if (callState === 'incoming' && incomingCallData) {
        const callerId = incomingCallData.caller.id;
        const isCallerOnline = Object.values(presences).some((presence: any) => presence[0]?.user_id === callerId);
        if (!isCallerOnline) {
            handleDeclineCall();
        }
    }
  }, [presences, callState, incomingCallData]);

  useEffect(() => {
    if (currentUser) {
      registerForPushNotificationsAsync().then(token => { if (token && token !== currentUser.push_token) supabase.from('profiles').update({ push_token: token }).eq('id', currentUser.id).then(); });
      const channel = supabase.channel(`calls:${currentUser.id}`);
      channel.on('broadcast', { event: 'webrtc' }, ({ payload }) => { handleSignalingMessage(payload); }).subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [currentUser, handleSignalingMessage]);

  useEffect(() => {
    setTyping(null);
    if (!selectedConversation || !currentUser) return;
    const channel = supabase.channel(`typing:${selectedConversation.id}`);
    const handleTyping = ({ payload }: { payload: { user_id: string }}) => {
      if (payload.user_id !== currentUser.id) {
        const user = allProfiles.find(p => p.id === payload.user_id);
        if (user) {
          if (typingClearTimeouts.current[payload.user_id]) clearTimeout(typingClearTimeouts.current[payload.user_id]);
          setTyping({ user: user.name, conversationId: selectedConversation.id });
          typingClearTimeouts.current[payload.user_id] = setTimeout(() => { setTyping(ct => (ct?.user === user.name) ? null : ct); delete typingClearTimeouts.current[payload.user_id]; }, 3000);
        }
      }
    };
    channel.on('broadcast', { event: 'typing' }, handleTyping).subscribe();
    return () => { Object.values(typingClearTimeouts.current).forEach(clearTimeout); typingClearTimeouts.current = {}; supabase.removeChannel(channel); };
  }, [selectedConversation, currentUser, allProfiles]);
  
  const handleBack = () => { setSelectedConversation(null); setReplyingTo(null); if (!isWideScreen) setActiveView('sidebar'); };
  
  const handleDeclineCall = useCallback(() => {
    if (callStateRef.current !== 'incoming' || !incomingCallData) return; // Guard
    sendSignalingMessage('decline-call', {}, incomingCallData.caller.id);
    setIncomingCallData(null);
    setCallState('idle');
  }, [incomingCallData, sendSignalingMessage]);

  useEffect(() => {
    const backAction = () => {
      if (isNewConvoModalVisible || isProfileModalVisible || isForwardModalVisible) {
        setIsNewConvoModalVisible(false);
        setIsProfileModalVisible(false);
        setIsForwardModalVisible(false);
        return true;
      }
      if (incomingCallData) {
        // FIX: Removed local re-declaration of handleDeclineCall.
        // This now correctly calls the memoized function from the component scope.
        handleDeclineCall();
        return true;
      }
      if (!isWideScreen && activeView === 'chat') {
        handleBack();
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [activeView, isWideScreen, isNewConvoModalVisible, isProfileModalVisible, isForwardModalVisible, incomingCallData, handleDeclineCall]);

  const handleSelectConversation = (c: Conversation) => { setSelectedConversation(c); setReplyingTo(null); if (!isWideScreen) setActiveView('chat'); };
  
  const insertSystemMessage = async (content: string) => {
    if (!currentUser || !selectedConversation) return;
    try { await supabase.from('messages').insert({ content, user_id: currentUser.id, conversation_id: selectedConversation.id, message_type: 'system' }); } 
    catch (e) { console.error("Failed to insert system message:", e); }
  };
  
  const handleSendMessage = async (content: string, fileData?: { uri: string; type: string; name: string }, duration?: number, isViewOnce?: boolean) => {
      if (!content.trim() && !fileData || !currentUser || !selectedConversation) return;
      const tempId = `temp_${Date.now()}`;
      const payload: Omit<Message, 'id' | 'created_at' | 'reactions' | 'read_at' | 'status'> = { content, user_id: currentUser.id, conversation_id: selectedConversation.id, media_url: null, media_type: null, media_duration: duration, is_view_once: isViewOnce, reply_to_message_id: replyingTo ? (replyingTo.id as number) : null, message_type: 'standard' };
      setMessages(p => ({ ...p, [selectedConversation.id]: [{ id: tempId, created_at: new Date().toISOString(), status: 'pending', ...payload, media_url: fileData?.uri, media_type: fileData?.type }, ...(p[selectedConversation.id] || [])] }));
      setReplyingTo(null); setTyping(null);
      const queueItem: QueuedMessage = { tempId, payload, file: fileData, retries: 0 };
      try {
          const currentQueueStr = await AsyncStorage.getItem(MESSAGE_QUEUE_KEY);
          const currentQueue = currentQueueStr ? JSON.parse(currentQueueStr) : [];
          currentQueue.push(queueItem);
          await AsyncStorage.setItem(MESSAGE_QUEUE_KEY, JSON.stringify(currentQueue));
      } catch (e) {
          console.error("Failed to add message to queue:", e);
          updateMessageInState(selectedConversation.id, tempId, { status: 'failed' });
          return;
      }
      processMessageQueue();
  };

  const handleRetrySendMessage = (tempId: string) => {
    AsyncStorage.getItem(MESSAGE_QUEUE_KEY).then(queueStr => {
        if (!queueStr) return;
        const queue: QueuedMessage[] = JSON.parse(queueStr);
        const itemIndex = queue.findIndex(item => item.tempId === tempId);
        if (itemIndex > -1) {
            queue[itemIndex].retries = 0;
            AsyncStorage.setItem(MESSAGE_QUEUE_KEY, JSON.stringify(queue)).then(() => {
                if (selectedConversation) {
                    updateMessageInState(selectedConversation.id, tempId, { status: 'pending' });
                    processMessageQueue();
                }
            });
        }
    });
  };

  const handleTyping = () => {
      if (selectedConversation && currentUser) {
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => {
              const channel = supabase.channel(`typing:${selectedConversation.id}`);
              channel.send({
                  type: 'broadcast',
                  event: 'typing',
                  payload: { user_id: currentUser.id },
              });
          }, 300);
      }
  };

  const handleAddReaction = async (messageId: number, emoji: string) => {
      if (!currentUser || !selectedConversation) return;
      
      // Edge Case: Optimistic UI update for reactions.
      setMessages(prev => {
          const convoMessages = prev[selectedConversation.id] || [];
          const newMessages = convoMessages.map(m => {
              if (m.id === messageId) {
                  const otherReactions = (m.reactions || []).filter(r => r.user_id !== currentUser.id);
                  const newReaction: Reaction = { id: Math.random(), emoji, user_id: currentUser.id, message_id: messageId };
                  return { ...m, reactions: [...otherReactions, newReaction] };
              }
              return m;
          });
          return { ...prev, [selectedConversation.id]: newMessages };
      });
  
      // Server Request
      await supabase.from('reactions').delete().match({ message_id: messageId, user_id: currentUser.id });
      const { error } = await supabase.from('reactions').insert({ message_id: messageId, user_id: currentUser.id, emoji });
      if (error) {
          showToast('Failed to save reaction.', 'error');
          // State will be corrected by realtime subscription.
      }
  };

  const handleRemoveReaction = async (reactionId: number, messageId: number) => {
      if (!currentUser || !selectedConversation) return;
      
      // Edge Case: Optimistic UI update for reactions.
      setMessages(prev => {
          const convoMessages = prev[selectedConversation.id] || [];
          const newMessages = convoMessages.map(m => {
              if (m.id === messageId) {
                  return { ...m, reactions: (m.reactions || []).filter(r => r.user_id !== currentUser.id) };
              }
              return m;
          });
          return { ...prev, [selectedConversation.id]: newMessages };
      });
  
      // Server Request
      const { error } = await supabase.from('reactions').delete().eq('id', reactionId);
      if (error) {
          showToast('Failed to remove reaction.', 'error');
          // State will be corrected by realtime subscription.
      }
  };
  
  const handleStar = async (messageId: number | string) => {
      if(typeof messageId !== 'number' || !currentUser) return;
      await supabase.from('starred_messages').insert({ message_id: messageId, user_id: currentUser.id });
      updateMessageInState(selectedConversation!.id, messageId, { starred: true });
  };
  
  const handleUnstar = async (messageId: number | string) => {
      if(typeof messageId !== 'number' || !currentUser) return;
      await supabase.from('starred_messages').delete().match({ message_id: messageId, user_id: currentUser.id });
      updateMessageInState(selectedConversation!.id, messageId, { starred: false });
  };

  const handleForward = (message: Message) => {
      setMessageToForward(message);
      setIsForwardModalVisible(true);
  };

  const handleConfirmForward = async (targetConversations: Conversation[]) => {
      if (!messageToForward || !currentUser) return;
      const forwardPromises = targetConversations.map(convo =>
          supabase.from('messages').insert({
              content: messageToForward.content,
              user_id: currentUser.id,
              conversation_id: convo.id,
              media_url: messageToForward.media_url,
              media_type: messageToForward.media_type,
              forwarded_from_name: allProfiles.find(p => p.id === messageToForward.user_id)?.name || 'Unknown',
          })
      );
      await Promise.all(forwardPromises);
      setIsForwardModalVisible(false);
      setMessageToForward(null);
      showToast(`Forwarded to ${targetConversations.length} chat(s)!`, 'info');
  };

  const handleViewOnceMessage = async (message: Message): Promise<boolean> => {
      if (message.is_view_once && typeof message.id === 'number') {
          try {
              const { error } = await supabase.functions.invoke('messaging-utils', {
                  body: { type: 'DELETE_VIEW_ONCE', record: message },
              });
              if (error) throw error;
              return true;
          } catch (e) {
              console.error('Failed to process view-once message:', e);
              showToast("Couldn't open this message. It may have already been viewed.", 'error');
              return false;
          }
      }
      return true;
  };

  const handleCreateConversation = async (selectedUsers: Profile[], groupName?: string) => {
    if (!currentUser || selectedUsers.length === 0) return;
    const is_group = selectedUsers.length > 1;

    if (!is_group) {
        const otherUserId = selectedUsers[0].id;
        const existingConvo = conversations.find(c => !c.is_group && c.participants.length === 2 && c.participants.some(p => p.id === currentUser.id) && c.participants.some(p => p.id === otherUserId));
        if (existingConvo) { handleSelectConversation(existingConvo); setIsNewConvoModalVisible(false); return; }
    }

    const participant_ids = [...selectedUsers.map(u => u.id), currentUser.id];

    try {
        const { data: newConversationId, error } = await supabase.rpc('create_conversation', { participant_ids, is_group, group_name: is_group ? (groupName || '').trim() : null });
        if (error) throw error;
        const { data: convos, error: refetchError } = await supabase.rpc('get_user_conversations');
        if (refetchError) throw refetchError;
        if (convos) {
            setConversations(convos);
            const newConvo = convos.find((c: Conversation) => c.id === newConversationId);
            if (newConvo) handleSelectConversation(newConvo);
        }
        setIsNewConvoModalVisible(false);
    } catch (error: any) {
        console.error("Conversation creation failed:", error);
        showToast('Failed to create conversation. Please try again later.', 'error');
    }
  };
  
  const handleProfileSave = async (name: string, avatarFile?: { uri: string; type: string; name: string }) => {
    if (!currentUser) return;

    const tempAvatarUrl = avatarFile ? avatarFile.uri : currentUser.avatar_url;
    const optimisticProfile = { ...currentUser, name, avatar_url: tempAvatarUrl };
    setAllProfiles(profiles => profiles.map(p => p.id === currentUser.id ? optimisticProfile : p));
    setIsProfileModalVisible(false);
    
    const queueItem: QueuedProfileUpdate = { name, avatarFile, retries: 0 };
    try {
        const currentQueueStr = await AsyncStorage.getItem(PROFILE_UPDATE_QUEUE_KEY);
        const currentQueue = currentQueueStr ? JSON.parse(currentQueueStr) : [];
        currentQueue.push(queueItem);
        await AsyncStorage.setItem(PROFILE_UPDATE_QUEUE_KEY, JSON.stringify(currentQueue));
        showToast('Profile will be saved when you reconnect.', 'info');
        processProfileUpdateQueue(); // Attempt to process immediately
    } catch (e) {
        console.error("Failed to add profile update to queue:", e);
        showToast('Failed to save profile. Please try again.', 'error');
        setAllProfiles(profiles => profiles.map(p => p.id === currentUser.id ? currentUser : p)); // Revert
    }
  };

  const handleStartCall = async () => {
    if (callStateRef.current !== 'idle') return; // Guard against rapid calls
    if (!selectedConversation || !currentUser) return;
    const otherParticipant = selectedConversation.participants.find(p => p.id !== currentUser.id);
    if (!otherParticipant) { showToast("Cannot start a call in this chat.", 'error'); return; }

    setCallState('outgoing');
    const started = await webRTCManager.start();
    if (!started) {
        showToast("Could not start call. Please check camera/microphone permissions.", "error");
        endCallCleanup();
        return;
    }

    webRTCManager.setOnIceCandidate(candidate => sendSignalingMessage('ice-candidate', candidate, otherParticipant.id));
    const offer = await webRTCManager.createOffer();
    sendSignalingMessage('offer', offer, otherParticipant.id);

    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    callTimeoutRef.current = setTimeout(() => {
        if (callStateRef.current === 'outgoing') {
            insertSystemMessage('Missed video call');
            endCallCleanup();
        }
    }, CALL_TIMEOUT_MS);
  };
  
  const handleAcceptCall = async () => {
    if (callStateRef.current !== 'incoming' || !incomingCallData) return; // Guard
    setCallState('active');
    const started = await webRTCManager.start();
    if (!started) {
        showToast("Could not start call. Please check camera/microphone permissions.", "error");
        handleDeclineCall();
        return;
    }
    webRTCManager.setOnIceCandidate(candidate => sendSignalingMessage('ice-candidate', candidate, incomingCallData.caller.id));
    const answer = await webRTCManager.createAnswer(incomingCallData.offer);
    sendSignalingMessage('answer', answer, incomingCallData.caller.id);
    setSelectedConversation(conversations.find(c => c.participants.some(p => p.id === incomingCallData.caller.id) && !c.is_group) || null);
    if (!isWideScreen) setActiveView('chat');
    setIncomingCallData(null);
  };

  const handleEndCall = () => {
    if (callStateRef.current === 'idle') return; // Guard
    if (selectedConversation && currentUser) {
        const otherParticipant = selectedConversation.participants.find(p => p.id !== currentUser.id);
        if (otherParticipant) sendSignalingMessage('end-call', {}, otherParticipant.id);
    }
    endCallCleanup();
  };

  const handleToggleLocalAudio = useCallback(() => {
    webRTCManager.toggleAudio(!localMediaState.isMicMuted);
    setLocalMediaState(p => ({...p, isMicMuted: !p.isMicMuted }));
    const otherParticipant = selectedConversation?.participants.find(p => p.id !== currentUser?.id);
    if (otherParticipant) sendSignalingMessage('audio-toggled', { isMuted: !localMediaState.isMicMuted }, otherParticipant.id);
  }, [webRTCManager, localMediaState.isMicMuted, selectedConversation, currentUser, sendSignalingMessage]);

  const handleToggleLocalVideo = useCallback(() => {
      webRTCManager.toggleVideo(!localMediaState.isCameraOff);
      setLocalMediaState(p => ({...p, isCameraOff: !p.isCameraOff }));
      const otherParticipant = selectedConversation?.participants.find(p => p.id !== currentUser?.id);
      if (otherParticipant) sendSignalingMessage('video-toggled', { isOff: !localMediaState.isCameraOff }, otherParticipant.id);
  }, [webRTCManager, localMediaState.isCameraOff, selectedConversation, currentUser, sendSignalingMessage]);
  
  const handlePanic = () => {
    // Edge Case: Critical race condition guard.
    // If a call is active, end it cleanly before proceeding with the panic sequence.
    if (callStateRef.current !== 'idle') {
        handleEndCall();
    }
    appOnPanic(selectedConversation, currentUser || null);
  };

  useEffect(() => {
    // Edge Case: Handle app backgrounding mid-call.
    if (callState !== 'active') return;
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
        if (nextAppState.match(/inactive|background/)) {
            if (!localMediaState.isCameraOff) {
                cameraWasOnBeforeBackground.current = true;
                handleToggleLocalVideo();
            }
        } else if (nextAppState === 'active') {
            if (cameraWasOnBeforeBackground.current) {
                handleToggleLocalVideo();
                cameraWasOnBeforeBackground.current = false;
            }
        }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => { subscription.remove(); };
  }, [callState, localMediaState.isCameraOff, handleToggleLocalVideo]);

  const renderContent = () => {
      if (loading) {
        return <View style={styles.authContainer}><SpinnerIcon size={48} /></View>;
      }
      if (error) {
          return (
              <Animated.View style={styles.authContainer} entering={FadeIn}>
                  <View style={styles.errorContainer}>
                      <AlertTriangleIcon size={48} color="#F87171" />
                      <Text style={styles.errorTitle}>Failed to load your data.</Text>
                      <Text style={styles.errorMessage}>Please check your connection and try again.</Text>
                      <View style={styles.errorActions}>
                          <TouchableOpacity onPress={onLock} style={styles.errorButton}><Text style={styles.errorButtonText}>Sign Out</Text></TouchableOpacity>
                          <TouchableOpacity onPress={refetch} style={[styles.errorButton, styles.primaryErrorButton]}><Text style={[styles.errorButtonText, styles.primaryErrorButtonText]}>Try Again</Text></TouchableOpacity>
                      </View>
                  </View>
              </Animated.View>
          );
      }
      
      const sidebar = <Sidebar conversations={conversations} currentUser={currentUser} presences={presences} onSelectConversation={handleSelectConversation} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} onNewChat={() => setIsNewConvoModalVisible(true)} onLock={onLock} onEditProfile={() => setIsProfileModalVisible(true)} selectedConversationId={selectedConversation?.id || null} />;
      const chat = selectedConversation && <ChatView key={selectedConversation.id} conversation={selectedConversation} messages={messages[selectedConversation.id] || []} allProfiles={allProfiles} onSendMessage={handleSendMessage} onTyping={handleTyping} typingInfo={typing} currentUserId={currentUser!.id} onBack={handleBack} onAddReaction={handleAddReaction} onRemoveReaction={handleRemoveReaction} onForward={handleForward} onStar={handleStar} onUnstar={handleUnstar} onMarkAsRead={(ids) => markMessagesAsRead(ids, selectedConversation.id)} onViewOnceMessage={handleViewOnceMessage} replyingTo={replyingTo} setReplyingTo={setReplyingTo} onLoadMoreMessages={() => loadMoreMessages(selectedConversation.id)} isLoadingMore={loadingMoreMessages} allMessagesLoaded={allMessagesLoaded[selectedConversation.id] || false} onStartCall={handleStartCall} localStream={localStream} remoteStream={remoteStream} onEndCall={handleEndCall} callState={callState} webRTCManager={webRTCManager} onPanic={handlePanic} onScreenShareChange={onSetScreenSharing} isOffline={isOffline} isDarkMode={isDarkMode} onToggleLocalAudio={handleToggleLocalAudio} onToggleLocalVideo={handleToggleLocalVideo} localMediaState={localMediaState} remoteMediaState={remoteMediaState} showToast={showToast} onRetrySendMessage={handleRetrySendMessage} />;
      
      return <View style={styles.contentContainer}>{isWideScreen ? (<><View style={styles.sidebarContainer}>{sidebar}</View><View style={styles.chatContainer}>{chat || <View style={styles.placeholder}><Text style={styles.placeholderText}>Select a conversation to start chatting</Text></View>}</View></>) : (activeView === 'sidebar' ? sidebar : chat)}</View>;
  };
  
  if (authLoading) return <ImageBackground source={require('../assets/bg.jpg')} style={styles.background}><View style={styles.authContainer}><SpinnerIcon size={48} /></View></ImageBackground>;
  if (!session) return <ImageBackground source={require('../assets/bg.jpg')} style={styles.background}><View style={styles.authContainer}><Auth /></View></ImageBackground>;

  return (
    <SafeAreaView style={styles.container}>
      <ImageBackground source={require('../assets/bg.jpg')} style={styles.background} resizeMode="cover">
        <BlurView intensity={30} tint={isDarkMode ? 'dark' : 'light'} style={styles.blurView}>
            {renderContent()}
        </BlurView>
      </ImageBackground>
      
      {isNewConvoModalVisible && <NewConversationModal isVisible={isNewConvoModalVisible} allProfiles={allProfiles.filter(p => p.id !== currentUser?.id)} onClose={() => setIsNewConvoModalVisible(false)} onCreateConversation={handleCreateConversation} />}
      {isProfileModalVisible && currentUser && <ProfileModal isVisible={isProfileModalVisible} currentUser={currentUser} onClose={() => setIsProfileModalVisible(false)} onSave={handleProfileSave} />}
      {isForwardModalVisible && <ForwardModal isVisible={isForwardModalVisible} conversations={conversations} onClose={() => setIsForwardModalVisible(false)} onForward={handleConfirmForward} />}
      {callState === 'incoming' && incomingCallData && <IncomingCallModal caller={incomingCallData.caller} onAccept={handleAcceptCall} onDecline={handleDeclineCall} />}
      {currentUser && <PanicButton onPanic={handlePanic} />}
      <View style={styles.toastArea}>{toasts.map(toast => <ToastNotification key={toast.id} toast={toast} onDismiss={dismissToast} />)}</View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  background: { flex: 1 },
  authContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  blurView: { flex: 1 },
  contentContainer: { flex: 1, flexDirection: 'row', backgroundColor: Platform.OS === 'web' ? 'rgba(24, 24, 27, 0.5)' : 'transparent' },
  sidebarContainer: { width: 350, borderRightWidth: 1, borderColor: 'rgba(128, 128, 128, 0.2)' },
  chatContainer: { flex: 1 },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholderText: { color: '#A1A1AA', fontSize: 16 },
  toastArea: { position: 'absolute', top: 50, left: 0, right: 0, alignItems: 'center', zIndex: 1000 },
  toastContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EF4444', padding: 12, borderRadius: 8, margin: 8, elevation: 5, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 5 },
  infoToast: { backgroundColor: '#22C55E' },
  toastText: { color: '#FFF', fontWeight: '600', marginLeft: 8, flex: 1 },
  toastProgress: { position: 'absolute', bottom: 0, left: 0, height: 4, backgroundColor: 'rgba(0,0,0,0.3)', borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  infoToastProgress: { backgroundColor: 'rgba(255,255,255,0.3)' },
  errorContainer: { backgroundColor: 'rgba(39, 39, 42, 0.8)', padding: 32, borderRadius: 24, alignItems: 'center', width: '90%', maxWidth: 400, borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 1 },
  errorTitle: { fontSize: 22, fontWeight: 'bold', color: '#F9FAFB', marginTop: 16, marginBottom: 8 },
  errorMessage: { fontSize: 15, color: '#D4D4D8', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  errorActions: { flexDirection: 'row', justifyContent: 'center', gap: 16, width: '100%' },
  errorButton: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8, backgroundColor: 'rgba(255, 255, 255, 0.1)', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 1, flex: 1 },
  primaryErrorButton: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  errorButtonText: { color: '#F9FAFB', fontWeight: '600', textAlign: 'center' },
  primaryErrorButtonText: { color: '#FFF' },
});

export default ChatScreen;