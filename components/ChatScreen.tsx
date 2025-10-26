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
import Animated, { Layout, FadeInUp, FadeOutUp, useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MediaStream, RTCIceConnectionState } from 'react-native-webrtc';
import { useChatData } from '../hooks/useChatData';
import { Session } from '@supabase/supabase-js';
import { BlurView } from 'expo-blur';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const CALL_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const TOAST_DURATION = 3500;

type QueuedMessage = { tempId: string; payload: Omit<Message, 'id' | 'created_at' | 'reactions' | 'read_at'>; file?: { uri: string; type: string; name: string }; retries: number; };
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

  const [session, setSession] = useState<Session | null>(null);
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

  const { loading, currentUser, allProfiles, setAllProfiles, conversations, setConversations, presences, messages, setMessages, loadMoreMessages, loadingMoreMessages, allMessagesLoaded, markMessagesAsRead } = useChatData(session, selectedConversation?.id || null);
  
  const showToast = useCallback((message: string, type: 'error' | 'info' = 'error') => {
      setToasts(currentToasts => [...currentToasts, { id: Date.now(), message, type }]);
  }, []);
  const dismissToast = (id: number) => setToasts(currentToasts => currentToasts.filter(t => t.id !== id));

  const updateMessageInState = useCallback((conversationId: number, messageId: number | string, updates: Partial<Message>) => {
    setMessages(prev => ({ ...prev, [conversationId]: (prev[conversationId] || []).map(m => m.id === messageId ? { ...m, ...updates } : m) }));
  }, [setMessages]);

  const processMessageQueue = useCallback(async () => {
    if (isProcessingQueue.current || !currentUser) return;
    isProcessingQueue.current = true;
  
    try {
      let queue: QueuedMessage[] = JSON.parse(await AsyncStorage.getItem('messageQueue') || '[]');
      if (queue.length === 0) { isProcessingQueue.current = false; return; }

      let networkErrorOccurred = false;
      const remainingInQueue: QueuedMessage[] = [];
  
      for (const item of queue) {
        if (item.retries >= MAX_RETRIES) {
            updateMessageInState(item.payload.conversation_id, item.tempId, { status: 'failed' });
            continue; // Skip this message, it's permanently failed
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
  
          // On success, remove from UI
          setMessages(prev => ({...prev, [item.payload.conversation_id]: prev[item.payload.conversation_id]?.filter(m => m.id !== item.tempId)}));
        } catch (error) {
            networkErrorOccurred = true;
            item.retries++;
            remainingInQueue.push(item);
        }
      }
  
      await AsyncStorage.setItem('messageQueue', JSON.stringify(remainingInQueue));

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
  webRTCManager.setOnConnectionStateChange((state: RTCIceConnectionState) => {
    if (state === 'failed' || state === 'disconnected' || state === 'closed') endCallCleanup();
  });
  
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isOffline) interval = setInterval(processMessageQueue, 5000); 
    return () => { if (interval) clearInterval(interval); };
  }, [isOffline, processMessageQueue]);
  
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') processMessageQueue(); });
    return () => sub.remove();
  }, [processMessageQueue]);

  useEffect(() => {
    setAuthLoading(true);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { setSession(session); setAuthLoading(false); });
    return () => subscription.unsubscribe();
  }, []);
  
  useEffect(() => { if (currentUser) processMessageQueue(); }, [currentUser, processMessageQueue]);

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
  
  useEffect(() => {
    const backAction = () => {
      if (isNewConvoModalVisible || isProfileModalVisible || isForwardModalVisible || incomingCallData) { setIsNewConvoModalVisible(false); setIsProfileModalVisible(false); setIsForwardModalVisible(false); if (incomingCallData) handleDeclineCall(); return true; }
      if (!isWideScreen && activeView === 'chat') { handleBack(); return true; }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [activeView, isWideScreen, isNewConvoModalVisible, isProfileModalVisible, isForwardModalVisible, incomingCallData]);

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
      const queue = JSON.parse(await AsyncStorage.getItem('messageQueue') || '[]');
      await AsyncStorage.setItem('messageQueue', JSON.stringify([...queue, { tempId, payload, file: fileData, retries: 0 }]));
      processMessageQueue();
  };
  
  const handleTyping = () => {
    if (typingTimeoutRef.current || !selectedConversation || !session?.user || isOffline) return;
    supabase.channel(`typing:${selectedConversation.id}`).send({ type: 'broadcast', event: 'typing', payload: { user_id: session.user.id } });
    typingTimeoutRef.current = setTimeout(() => { typingTimeoutRef.current = null; }, 2000);
  }

  const handleStar = async (messageId: number | string) => {
    if (typeof messageId !== 'number' || !currentUser || isOffline || !selectedConversation) return;
    updateMessageInState(selectedConversation.id, messageId, { starred: true });
    const { error } = await supabase.from('starred_messages').insert({ message_id: messageId, user_id: currentUser.id });
    if (error) { showToast("Failed to star message."); updateMessageInState(selectedConversation.id, messageId, { starred: false }); }
  };

  const handleUnstar = async (messageId: number | string) => {
    if (typeof messageId !== 'number' || !currentUser || isOffline || !selectedConversation) return;
    updateMessageInState(selectedConversation.id, messageId, { starred: false });
    const { error } = await supabase.from('starred_messages').delete().match({ message_id: messageId, user_id: currentUser.id });
    if (error) { showToast("Failed to unstar message."); updateMessageInState(selectedConversation.id, messageId, { starred: true }); }
  };

  const handleCreateConversation = async (users: Profile[], groupName?: string) => {
    if (!currentUser || users.length === 0 || isOffline) { showToast("Cannot create conversation offline."); return; }
    if (users.length === 1) {
      const existing = conversations.find(c => !c.is_group && c.participants.length === 2 && c.participants.some(p => p.id === users[0].id));
      if (existing) { handleSelectConversation(existing); setIsNewConvoModalVisible(false); return; }
    }
    const { data: conv, error: convErr } = await supabase.from('conversations').insert({ is_group: users.length > 1, group_name: groupName, created_by: currentUser.id }).select().single();
    if (convErr || !conv) { showToast("Failed to create conversation."); return; }
    const participants = [currentUser, ...users].map(p => ({ conversation_id: conv.id, user_id: p.id }));
    const { error: partErr } = await supabase.from('conversation_participants').insert(participants);
    if (partErr) { await supabase.from('conversations').delete().eq('id', conv.id); showToast("Failed to add participants."); return; }
    setIsNewConvoModalVisible(false);
  };
  
  const handleOpenForwardModal = (message: Message) => { setMessageToForward(message); setIsForwardModalVisible(true); };
  const handleForwardMessage = async (targets: Conversation[]) => {
    if (!messageToForward || !currentUser || isOffline) return;
    const payloads = targets.map(c => ({ ...messageToForward, id: undefined, conversation_id: c.id, user_id: currentUser.id, forwarded_from_name: allProfiles.find(p => p.id === messageToForward.user_id)?.name }));
    const { error } = await supabase.from('messages').insert(payloads);
    if (error) showToast("Failed to forward message.");
    setIsForwardModalVisible(false);
  };

  const sendSignalingMessage = (to: string, payload: Omit<SignalingPayload, 'from'>) => {
    if (!currentUser || isOffline) return;
    supabase.channel(`calls:${to}`).send({ type: 'broadcast', event: 'webrtc', payload: { ...payload, from: currentUser.id } });
  };
  
  const handleStartCall = async () => {
    if (callState !== 'idle' || !selectedConversation || !currentUser || isOffline) return;
    const other = selectedConversation.participants.find(p => p.id !== currentUser.id);
    if (!other) { showToast("Cannot start call in this chat."); return; }
    try {
        await webRTCManager.start();
        webRTCManager.setOnIceCandidate((c) => sendSignalingMessage(other.id, { type: 'ice-candidate', data: c }));
        const offer = await webRTCManager.createOffer();
        sendSignalingMessage(other.id, { type: 'offer', data: offer });
        setCallState('outgoing');
        callTimeoutRef.current = setTimeout(() => {
            setCallState(currentCallState => {
                if (currentCallState === 'outgoing') {
                    insertSystemMessage('Missed video call');
                    endCallCleanup();
                    return 'idle';
                }
                return currentCallState;
            });
        }, CALL_TIMEOUT_MS);
    } catch(err) { showToast("Couldn't start call. Check permissions."); }
  };

  const handleAcceptCall = async () => {
    if (!incomingCallData || !currentUser || isOffline) return;
    setIsNewConvoModalVisible(false); setIsProfileModalVisible(false); setIsForwardModalVisible(false);
    try {
        await webRTCManager.start();
        webRTCManager.setOnIceCandidate((c) => sendSignalingMessage(incomingCallData.caller.id, { type: 'ice-candidate', data: c }));
        const answer = await webRTCManager.createAnswer(incomingCallData.offer);
        sendSignalingMessage(incomingCallData.caller.id, { type: 'answer', data: answer });
        setCallState('active'); setIncomingCallData(null);
    } catch(err) { showToast("Couldn't accept call."); }
  };
  
  const handleDeclineCall = () => { if (incomingCallData) sendSignalingMessage(incomingCallData.caller.id, { type: 'decline-call', data: null }); setCallState('idle'); setIncomingCallData(null); };
  const handleEndCall = () => { if (!selectedConversation || !currentUser) return endCallCleanup(); selectedConversation.participants.filter(p => p.id !== currentUser.id).forEach(p => sendSignalingMessage(p.id, { type: 'end-call', data: null })); endCallCleanup(); };
  
  const handlePanicPress = () => { handleEndCall(); appOnPanic(selectedConversation, currentUser); };
  
  const handleRetrySendMessage = async (tempId: string) => {
    let queue: QueuedMessage[] = JSON.parse(await AsyncStorage.getItem('messageQueue') || '[]');
    const index = queue.findIndex(item => item.tempId === tempId);
    if (index > -1) {
      updateMessageInState(queue[index].payload.conversation_id, tempId, { status: 'pending' });
      queue[index].retries = 0;
      await AsyncStorage.setItem('messageQueue', JSON.stringify(queue));
      processMessageQueue();
    }
  };

  if (authLoading) return <ImageBackground source={{ uri: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=2070&auto=format&fit=crop' }} style={styles.backgroundImage}><View style={styles.centerContainer}><SpinnerIcon size={40} color="#FFF" /></View></ImageBackground>;
  if (!session) return <ImageBackground source={{ uri: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=2070&auto=format&fit=crop' }} style={styles.backgroundImage}><View style={styles.centerContainer}><Auth /></View></ImageBackground>;

  return (
    <ImageBackground source={{ uri: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=2070&auto=format&fit=crop' }} style={styles.backgroundImage}>
      <SafeAreaView style={styles.safeArea}>
          <BlurView intensity={50} tint={isDarkMode ? 'dark' : 'light'} style={styles.chatContainer}>
            <NewConversationModal isVisible={isNewConvoModalVisible} allProfiles={allProfiles.filter(p => p.id !== currentUser?.id)} onClose={() => setIsNewConvoModalVisible(false)} onCreateConversation={handleCreateConversation} />
            {currentUser && <ProfileModal isVisible={isProfileModalVisible} currentUser={currentUser} onClose={() => setIsProfileModalVisible(false)} onSave={async (n, f) => { await supabase.from('profiles').update({ name: n }).eq('id', currentUser.id); setIsProfileModalVisible(false); }} />}
            <ForwardModal isVisible={isForwardModalVisible} conversations={conversations} onClose={() => setIsForwardModalVisible(false)} onForward={handleForwardMessage} />
            {incomingCallData && <IncomingCallModal caller={incomingCallData.caller} onAccept={handleAcceptCall} onDecline={handleDeclineCall} />}
            {(isWideScreen || activeView === 'sidebar') && (
              <Sidebar conversations={conversations} currentUser={currentUser} presences={presences} onSelectConversation={handleSelectConversation} isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} onNewChat={() => setIsNewConvoModalVisible(true)} onLock={onLock} onEditProfile={() => setIsProfileModalVisible(true)} selectedConversationId={selectedConversation?.id || null} isLoading={loading} />
            )}
            {(isWideScreen || activeView === 'chat') && selectedConversation && currentUser && (
                <Animated.View style={{flex: 1}} layout={Layout.springify()}>
                  <ChatView key={selectedConversation.id} conversation={selectedConversation} messages={messages[selectedConversation.id] || []} onSendMessage={handleSendMessage} currentUserId={currentUser.id} onBack={isWideScreen ? undefined : handleBack} onTyping={handleTyping} typingInfo={typing} onAddReaction={async (mId, e) => await supabase.from('reactions').insert({ message_id: mId, user_id: currentUser.id, emoji: e })} onRemoveReaction={async (rId) => await supabase.from('reactions').delete().eq('id', rId)} onForward={handleOpenForwardModal} onStar={handleStar} onUnstar={handleUnstar} onMarkAsRead={markMessagesAsRead} onViewOnceMessage={async(m) => {await supabase.functions.invoke('messaging-utils',{body:{type:'DELETE_VIEW_ONCE',record:m}});return true}} allProfiles={allProfiles} replyingTo={replyingTo} setReplyingTo={setReplyingTo} onLoadMoreMessages={loadMoreMessages} isLoadingMore={loadingMoreMessages} allMessagesLoaded={allMessagesLoaded} onStartCall={handleStartCall} localStream={localStream} remoteStream={remoteStream} onEndCall={handleEndCall} callState={callState} webRTCManager={webRTCManager} onPanic={handlePanicPress} onScreenShareChange={onSetScreenSharing} isOffline={isOffline} isDarkMode={isDarkMode} onToggleLocalAudio={() => {webRTCManager.toggleAudio(!localMediaState.isMicMuted); setLocalMediaState(p => ({...p, isMicMuted: !p.isMicMuted}));}} onToggleLocalVideo={() => {webRTCManager.toggleVideo(!localMediaState.isCameraOff); setLocalMediaState(p => ({...p, isCameraOff: !p.isCameraOff}));}} localMediaState={localMediaState} remoteMediaState={remoteMediaState} showToast={showToast} onRetrySendMessage={handleRetrySendMessage} />
                </Animated.View>
            )}
          </BlurView>
        {session && (isWideScreen || activeView === 'chat') && selectedConversation && <PanicButton onPanic={handlePanicPress} />}
        <View style={styles.toastArea}>{toasts.map((t) => <ToastNotification key={t.id} toast={t} onDismiss={dismissToast} />)}</View>
      </SafeAreaView>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  backgroundImage: { flex: 1 },
  safeArea: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  chatContainer: { height: '100%', width: '100%', flexDirection: 'row', overflow: 'hidden' },
  toastArea: { position: 'absolute', top: 50, left: 20, right: 20, zIndex: 10000 },
  toastContainer: { backgroundColor: 'rgba(239, 68, 68, 0.9)', padding: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', elevation: 10, marginTop: 8, overflow: 'hidden' },
  infoToast: { backgroundColor: 'rgba(59, 130, 246, 0.9)' },
  toastText: { color: '#FFF', fontWeight: 'bold', marginLeft: 8, flex: 1 },
  toastProgress: { position: 'absolute', bottom: 0, left: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  infoToastProgress: { backgroundColor: 'rgba(255,255,255,0.4)' }
});

export default ChatScreen;