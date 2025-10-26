import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
import { SafeAreaView, View, StyleSheet, ImageBackground, Modal, Platform, UIManager, useWindowDimensions, Alert, Text, TouchableOpacity, BackHandler } from 'react-native';
import Animated, { Layout, FadeInUp, FadeOutUp } from 'react-native-reanimated';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MediaStream } from 'react-native-webrtc';
import { useChatData } from '../hooks/useChatData';
import { Session } from '@supabase/supabase-js';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const CALL_TIMEOUT_MS = 30000; // 30 seconds

interface ChatScreenProps {
  onLock: () => void;
  onPanic: (conversation: Conversation | null, user: Profile | null) => void;
  onSetScreenSharing: (isSharing: boolean) => void;
}

type QueuedMessage = {
  tempId: string;
  payload: Omit<Message, 'id' | 'created_at' | 'reactions' | 'read_at'>;
  retries?: number;
};

type Toast = { message: string, type: 'error' | 'info' };

async function registerForPushNotificationsAsync() {
  let token;
  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      alert('Failed to get push token for push notification!');
      return;
    }
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      Alert.alert('Configuration Error', 'Missing Expo projectId in app.json. Push notifications will not work.');
      return;
    }
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  }

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  return token;
}

const ChatScreen: React.FC<ChatScreenProps> = ({ onLock, onPanic: appOnPanic, onSetScreenSharing }) => {
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
  const [toast, setToast] = useState<Toast | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([]);

  const [callState, setCallState] = useState<'idle' | 'outgoing' | 'incoming' | 'active'>('idle');
  const [incomingCallData, setIncomingCallData] = useState<{ offer: any, caller: Profile } | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localMediaState, setLocalMediaState] = useState({ isMicMuted: false, isCameraOff: false });
  const [remoteMediaState, setRemoteMediaState] = useState({ isMicMuted: false, isCameraOff: false });
  const webRTCManager = useRef(new WebRTCManager(
    (stream) => setLocalStream(stream),
    (stream) => setRemoteStream(stream)
  )).current;
  const signalingChannel = useRef<any>(null);
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    loading: dataLoading,
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
    allMessagesLoaded,
    markMessagesAsRead
  } = useChatData(session, selectedConversation?.id || null);
  
  const showToast = useCallback((message: string, type: 'error' | 'info' = 'error') => {
      setToast({ message, type });
      setTimeout(() => setToast(null), 3500);
  }, []);

  const updateMessageInState = useCallback((conversationId: number, messageId: number | string, updates: Partial<Message>) => {
    setMessages(prev => ({
        ...prev,
        [conversationId]: (prev[conversationId] || []).map(m => 
            m.id === messageId ? { ...m, ...updates } : m
        )
    }));
  }, [setMessages]);

  const processMessageQueue = useCallback(async () => {
    const queue = JSON.parse(await AsyncStorage.getItem('messageQueue') || '[]');
    if (queue.length === 0) return;

    const newQueue: QueuedMessage[] = [];
    let successfullySent = false;

    for (const item of queue) {
        try {
            const { error } = await supabase.from('messages').insert(item.payload);
            if (error) {
                const retries = (item.retries || 0) + 1;
                if (retries < 3) {
                    newQueue.push({ ...item, retries });
                } else {
                    updateMessageInState(item.payload.conversation_id, item.tempId, { status: 'failed' });
                }
            } else {
                successfullySent = true;
            }
        } catch (e) {
            newQueue.push(item);
            setIsOffline(true);
            break;
        }
    }

    setMessageQueue(newQueue);
    await AsyncStorage.setItem('messageQueue', JSON.stringify(newQueue));
    if (successfullySent) setIsOffline(false);

  }, [updateMessageInState]);
  
  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const handleOnline = () => {
      setIsOffline(false);
      showToast("You're back online!", 'info');
      processMessageQueue();
    };
    const handleOffline = () => {
      setIsOffline(true);
      showToast("You're offline. Messages will be sent when you reconnect.", 'info');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [processMessageQueue, showToast]);

  useEffect(() => {
    setAuthLoading(true);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (callState === 'active' || callState === 'idle') {
        if (callTimeoutRef.current) {
            clearTimeout(callTimeoutRef.current);
            callTimeoutRef.current = null;
        }
    }
  }, [callState]);
  
  const endCallCleanup = useCallback(() => {
    if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
    }
    webRTCManager.close();
    setLocalStream(null);
    setRemoteStream(null);
    setCallState('idle');
    setIncomingCallData(null);
    onSetScreenSharing(false);
    setLocalMediaState({ isMicMuted: false, isCameraOff: false });
    setRemoteMediaState({ isMicMuted: false, isCameraOff: false });
  }, [webRTCManager, onSetScreenSharing]);
  
  const handleSignalingMessage = useCallback((payload: SignalingPayload) => {
    switch (payload.type) {
      case 'offer':
        if (callState !== 'idle') return;
        const caller = allProfiles.find(p => p.id === payload.from);
        if (caller) {
          setIncomingCallData({ offer: payload.data, caller });
          setCallState('incoming');
        }
        break;
      case 'answer':
        webRTCManager.setRemoteDescription(payload.data);
        setCallState('active');
        break;
      case 'ice-candidate':
        webRTCManager.addIceCandidate(payload.data);
        break;
      case 'decline-call':
        showToast(`${allProfiles.find(p => p.id === payload.from)?.name || 'User'} declined the call.`, 'info');
        endCallCleanup();
        break;
      case 'end-call':
        endCallCleanup();
        break;
      case 'audio-toggled':
        setRemoteMediaState(prev => ({ ...prev, isMicMuted: payload.data.isMuted }));
        break;
      case 'video-toggled':
        setRemoteMediaState(prev => ({ ...prev, isCameraOff: payload.data.isOff }));
        break;
    }
  }, [allProfiles, webRTCManager, showToast, endCallCleanup, callState]);

  useEffect(() => {
    if (currentUser) {
      registerForPushNotificationsAsync().then(token => {
        if (token && token !== currentUser.push_token) {
          supabase.from('profiles').update({ push_token: token }).eq('id', currentUser.id).then();
        }
      });
      
      signalingChannel.current = supabase.channel(`calls:${currentUser.id}`);
      signalingChannel.current
        .on('broadcast', { event: 'webrtc' }, ({ payload }: { payload: SignalingPayload }) => {
          handleSignalingMessage(payload);
        })
        .subscribe();
    }
    return () => {
      if (signalingChannel.current) {
        supabase.removeChannel(signalingChannel.current);
        signalingChannel.current = null;
      }
    };
  }, [currentUser, handleSignalingMessage]);
  
  useEffect(() => {
    const backAction = () => {
      if (isNewConvoModalVisible || isProfileModalVisible || isForwardModalVisible || incomingCallData) {
        setIsNewConvoModalVisible(false);
        setIsProfileModalVisible(false);
        setIsForwardModalVisible(false);
        if (incomingCallData) handleDeclineCall();
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
  }, [activeView, isWideScreen, isNewConvoModalVisible, isProfileModalVisible, isForwardModalVisible, incomingCallData]);


  const handleSelectConversation = (conversation: Conversation) => {
      setSelectedConversation(conversation);
      setReplyingTo(null);
      if (!isWideScreen) setActiveView('chat');
  };

  const handleBack = () => {
      setSelectedConversation(null);
      setReplyingTo(null);
      if (!isWideScreen) setActiveView('sidebar');
  };
  
  const handleSendMessage = async (content: string, fileData?: { uri: string; type: string; name: string }, duration?: number, isViewOnce?: boolean) => {
      if (!content.trim() && !fileData) return;
      if (!currentUser || !selectedConversation) return;

      const tempId = `temp_${Date.now()}`;
      const messagePayload = { content, user_id: currentUser.id, conversation_id: selectedConversation.id, media_url: null, media_type: null, media_duration: duration, is_view_once: isViewOnce, reply_to_message_id: replyingTo ? (replyingTo.id as number) : null };

      const optimisticMessage: Message = {
          id: tempId,
          created_at: new Date().toISOString(),
          status: 'pending',
          ...messagePayload
      };
      setMessages(prev => ({
          ...prev,
          [selectedConversation.id]: [optimisticMessage, ...(prev[selectedConversation.id] || [])]
      }));
      setReplyingTo(null);
      setTyping(null);

      if (isOffline || fileData) {
          if(fileData) {
              showToast("File uploads are disabled while offline.");
              setMessages(prev => ({ ...prev, [selectedConversation.id]: (prev[selectedConversation.id] || []).filter(m => m.id !== tempId) }));
              return;
          }
          const newItem: QueuedMessage = { tempId, payload: messagePayload };
          const newQueue = [...messageQueue, newItem];
          setMessageQueue(newQueue);
          await AsyncStorage.setItem('messageQueue', JSON.stringify(newQueue));
          return;
      }

      try {
          const { error: insertError } = await supabase.from('messages').insert(messagePayload);
          if(insertError) throw insertError;

          setIsOffline(false);
          processMessageQueue();
      } catch (error: any) {
          setIsOffline(true);
          const newItem: QueuedMessage = { tempId, payload: messagePayload };
          const newQueue = [...messageQueue, newItem];
          setMessageQueue(newQueue);
          await AsyncStorage.setItem('messageQueue', JSON.stringify(newQueue));
      }
  };
  
    const handleTyping = () => {
        if (typingTimeoutRef.current) return;
        if (!selectedConversation || !session?.user || isOffline) return;

        const channel = supabase.channel(`chat:${selectedConversation.id}`);
        channel.send({ type: 'broadcast', event: 'typing', payload: { user_id: session.user.id } });
        
        typingTimeoutRef.current = setTimeout(() => {
          typingTimeoutRef.current = null;
        }, 2000); // Throttle for 2 seconds
    }

    const handleAddReaction = async (messageId: number, emoji: string) => {
        if (!currentUser || !selectedConversation || isOffline) return;
    
        const tempReaction: Reaction = { id: Date.now(), emoji, user_id: currentUser.id, message_id: messageId };
        const originalMessages = messages[selectedConversation.id];
        setMessages(prev => ({
            ...prev,
            [selectedConversation.id]: originalMessages.map(m => m.id === messageId ? { ...m, reactions: [...(m.reactions || []), tempReaction] } : m)
        }));

        try {
            const { data, error } = await supabase.from('reactions').insert({ message_id: messageId, user_id: currentUser.id, emoji }).select().single();
            if (error) throw error;
            setMessages(prev => ({
                ...prev,
                [selectedConversation.id]: (prev[selectedConversation.id] || []).map(m => {
                    if (m.id === messageId) {
                        return { ...m, reactions: (m.reactions || []).filter(r => r.id !== tempReaction.id).concat(data as Reaction) };
                    }
                    return m;
                })
            }));
        } catch (error) {
            showToast("Failed to add reaction.");
            setMessages(prev => ({ ...prev, [selectedConversation.id]: originalMessages }));
        }
    };

    const handleRemoveReaction = async (reactionId: number, messageId: number) => {
        if (!currentUser || !selectedConversation || isOffline) return;
        
        const originalMessages = messages[selectedConversation.id];
        setMessages(prev => ({
            ...prev,
            [selectedConversation.id]: originalMessages.map(m => m.id === messageId ? { ...m, reactions: (m.reactions || []).filter(r => r.id !== reactionId) } : m)
        }));

        try {
            const { error } = await supabase.from('reactions').delete().eq('id', reactionId);
            if (error) throw error;
        } catch (error) {
            showToast("Failed to remove reaction.");
            setMessages(prev => ({ ...prev, [selectedConversation.id]: originalMessages }));
        }
    };
    
    const handleStar = async (messageId: number | string) => { 
        if(currentUser && typeof messageId === 'number' && !isOffline) { 
            updateMessageInState(selectedConversation!.id, messageId, { starred: true });
            try {
              const { error } = await supabase.from('starred_messages').insert({ message_id: messageId, user_id: currentUser.id }); 
              if (error) throw error;
            } catch (error) {
              showToast("Failed to star message.");
              updateMessageInState(selectedConversation!.id, messageId, { starred: false });
            }
        } else {
          showToast("Cannot perform this action on an unsent message or while offline.");
        }
    };
    const handleUnstar = async (messageId: number | string) => { 
        if(currentUser && typeof messageId === 'number' && !isOffline) { 
            updateMessageInState(selectedConversation!.id, messageId, { starred: false });
            try {
              const { error } = await supabase.from('starred_messages').delete().match({ message_id: messageId, user_id: currentUser.id }); 
              if (error) throw error;
            } catch (error) {
              showToast("Failed to unstar message.");
              updateMessageInState(selectedConversation!.id, messageId, { starred: true });
            }
        } else {
            showToast("Cannot perform this action on an unsent message or while offline.");
        }
    };
    
    const handleViewOnceMessage = async (message: Message): Promise<boolean> => {
        if (isOffline) {
            showToast("Cannot view this message while offline.");
            return false;
        }
        try {
            const { error } = await supabase.functions.invoke('messaging-utils', { body: { type: 'DELETE_VIEW_ONCE', record: message } });
            if (error) throw error;
            return true;
        } catch (error) {
            showToast("Could not confirm view. Message may reappear.");
            return false;
        }
    };

    const handleCreateConversation = async (selectedUsers: Profile[], groupName?: string) => {
        if (!currentUser || selectedUsers.length === 0 || isOffline) {
            showToast("Cannot create conversation while offline.");
            return;
        }
        const isGroup = selectedUsers.length > 1;
        if (!isGroup) {
            const otherUserId = selectedUsers[0].id;
            const existingConversation = conversations.find(c => !c.is_group && c.participants.length === 2 && c.participants.some(p => p.id === currentUser.id) && c.participants.some(p => p.id === otherUserId));
            if (existingConversation) {
                handleSelectConversation(existingConversation);
                setIsNewConvoModalVisible(false);
                return;
            }
        }
        try {
            const participants = [currentUser, ...selectedUsers];
            const { data: convData, error: convError } = await supabase.from('conversations').insert({ is_group: isGroup, group_name: isGroup ? groupName : null, created_by: currentUser.id }).select().single();
            if (convError || !convData) throw convError || new Error("Failed to create conversation");
            const participantData = participants.map(p => ({ conversation_id: convData.id, user_id: p.id }));
            const { error: participantError } = await supabase.from('conversation_participants').insert(participantData);
            if (participantError) {
              await supabase.from('conversations').delete().eq('id', convData.id);
              throw participantError;
            }
            const newConversationObject: Conversation = { id: convData.id, is_group: isGroup, display_name: isGroup ? groupName! : selectedUsers[0].name, display_avatar: isGroup ? `https://i.pravatar.cc/150?u=${convData.id}` : selectedUsers[0].avatar_url, last_message_content: null, last_message_created_at: new Date().toISOString(), participants: participants };
            setConversations(prev => [newConversationObject, ...prev]);
            handleSelectConversation(newConversationObject);
            setIsNewConvoModalVisible(false);
        } catch (error: any) {
            showToast("Failed to create conversation. Please try again.");
            setIsOffline(true);
        }
    };
    
    const handleUpdateProfile = async (name: string, avatarFile?: { uri: string; type: string; name: string }) => {
        if(!currentUser || isOffline) {
            showToast("Cannot update profile while offline.");
            return;
        }
        let avatar_url = currentUser.avatar_url;
        try {
            if (avatarFile) {
                const fileExt = avatarFile.name.split('.').pop();
                const fileName = `${Date.now()}.${fileExt}`;
                const filePath = `${currentUser.id}/${fileName}`;
                const response = await fetch(avatarFile.uri);
                const blob = await response.blob();
                const { error: uploadError } = await supabase.storage.from('media').upload(filePath, blob, { contentType: avatarFile.type, upsert: true });
                if (uploadError) throw uploadError;
                const { data } = supabase.storage.from('media').getPublicUrl(filePath);
                avatar_url = `${data.publicUrl}?t=${new Date().getTime()}`;
            }
            const { error: updateError } = await supabase.from('profiles').update({ name, avatar_url }).eq('id', currentUser.id);
            if (updateError) throw updateError;
            setAllProfiles(prev => prev.map(p => p.id === currentUser.id ? { ...p, name, avatar_url } : p));
            setIsProfileModalVisible(false);
        } catch (error: any) {
            showToast("Couldn't update profile. Please try again.");
            setIsOffline(true);
        }
    };

  const handleOpenForwardModal = (message: Message) => { setMessageToForward(message); setIsForwardModalVisible(true); };
  const handleForwardMessage = async (targetConversations: Conversation[]) => {
    if (!messageToForward || !currentUser || isOffline) return;
    try {
      const forwardPayloads = targetConversations.map(convo => ({ ...messageToForward, id: undefined, created_at: undefined, conversation_id: convo.id, user_id: currentUser.id, read_at: null, reactions: undefined, forwarded_from_name: allProfiles.find(p => p.id === messageToForward.user_id)?.name || 'Someone' }));
      const { error } = await supabase.from('messages').insert(forwardPayloads);
      if (error) throw error;
      setMessageToForward(null);
      setIsForwardModalVisible(false);
    } catch(error) {
      showToast("Failed to forward message.");
    }
  };

  const sendSignalingMessage = (to: string, payload: Omit<SignalingPayload, 'from'>) => {
    if (!currentUser || isOffline) return;
    const fullPayload: SignalingPayload = { ...payload, from: currentUser.id };
    supabase.channel(`calls:${to}`).send({ type: 'broadcast', event: 'webrtc', payload: fullPayload });
  };
  
  const handleStartCall = async () => {
    if (callState !== 'idle') return;
    if (!selectedConversation || !currentUser || isOffline) { showToast("Cannot start calls while offline."); return; }
    const otherUser = selectedConversation.participants.find(p => p.id !== currentUser.id);
    if (!otherUser) { showToast("Cannot start a call in this chat."); return; }
    try {
        await webRTCManager.start();
        webRTCManager.onIceCandidate((candidate) => sendSignalingMessage(otherUser.id, { type: 'ice-candidate', data: candidate }));
        const offer = await webRTCManager.createOffer();
        sendSignalingMessage(otherUser.id, { type: 'offer', data: offer });
        setCallState('outgoing');
        if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = setTimeout(() => {
            showToast("Call attempt timed out. The user may be unavailable.");
            handleEndCall();
        }, CALL_TIMEOUT_MS);
    } catch(err) {
        showToast("Couldn't start the call. Please check permissions.");
    }
  };

  const handleAcceptCall = async () => {
    if (!incomingCallData || !currentUser || isOffline) return;
    setIsNewConvoModalVisible(false);
    setIsProfileModalVisible(false);
    setIsForwardModalVisible(false);
    try {
        await webRTCManager.start();
        webRTCManager.onIceCandidate((candidate) => sendSignalingMessage(incomingCallData.caller.id, { type: 'ice-candidate', data: candidate }));
        const answer = await webRTCManager.createAnswer(incomingCallData.offer);
        sendSignalingMessage(incomingCallData.caller.id, { type: 'answer', data: answer });
        setCallState('active');
        setIncomingCallData(null);
        setLocalMediaState({ isMicMuted: false, isCameraOff: false });
        setRemoteMediaState({ isMicMuted: false, isCameraOff: false });
    } catch(err) {
        showToast("Couldn't accept the call.");
    }
  };
  
  const handleDeclineCall = () => {
    if (incomingCallData) sendSignalingMessage(incomingCallData.caller.id, { type: 'decline-call', data: null });
    setCallState('idle');
    setIncomingCallData(null);
  };
  
  const handleEndCall = () => {
    if (!selectedConversation || !currentUser) return endCallCleanup();
    const participants = selectedConversation.participants.filter(p => p.id !== currentUser.id);
    participants.forEach(p => sendSignalingMessage(p.id, { type: 'end-call', data: null }));
    endCallCleanup();
  };
  
  const handleToggleLocalAudio = useCallback(() => {
    const muted = !localMediaState.isMicMuted;
    webRTCManager.toggleAudio(muted);
    setLocalMediaState(prev => ({ ...prev, isMicMuted: muted }));
    const otherUser = selectedConversation?.participants.find(p => p.id !== currentUser?.id);
    if (otherUser) sendSignalingMessage(otherUser.id, { type: 'audio-toggled', data: { isMuted: muted } });
  }, [localMediaState.isMicMuted, webRTCManager, selectedConversation, currentUser]);

  const handleToggleLocalVideo = useCallback(() => {
    const off = !localMediaState.isCameraOff;
    webRTCManager.toggleVideo(off);
    setLocalMediaState(prev => ({ ...prev, isCameraOff: off }));
    const otherUser = selectedConversation?.participants.find(p => p.id !== currentUser?.id);
    if (otherUser) sendSignalingMessage(otherUser.id, { type: 'video-toggled', data: { isOff: off } });
  }, [localMediaState.isCameraOff, webRTCManager, selectedConversation, currentUser]);

  const handlePanicPress = () => {
    handleEndCall();
    appOnPanic(selectedConversation, currentUser);
  };

  const renderContent = () => {
    if (authLoading || (session && dataLoading)) {
        return <View style={styles.centerContainer}><SpinnerIcon size={40} color="#FFF" /></View>;
    }
    
    if (!session) {
        return <View style={styles.centerContainer}><Auth /></View>;
    }

    if (!currentUser) {
        return <View style={styles.centerContainer}><SpinnerIcon size={40} color="#FFF" /></View>;
    }

    const handleMessageAction = (action: Function, messageId: number | string) => {
      if(typeof messageId === 'string' || isOffline) {
        showToast("This action is unavailable for unsent messages or while offline.");
        return;
      }
      action(messageId);
    };

    return (
       <View style={[styles.chatContainer, isDarkMode ? styles.darkChatContainer : styles.lightChatContainer]}>
          <Modal visible={isNewConvoModalVisible} transparent={true} animationType="slide" onRequestClose={() => setIsNewConvoModalVisible(false)}>
            <NewConversationModal allProfiles={allProfiles.filter(p => p.id !== currentUser.id)} onClose={() => setIsNewConvoModalVisible(false)} onCreateConversation={handleCreateConversation} />
          </Modal>
          <Modal visible={isProfileModalVisible} transparent={true} animationType="slide" onRequestClose={() => setIsProfileModalVisible(false)}>
            <ProfileModal currentUser={currentUser} onClose={() => setIsProfileModalVisible(false)} onSave={handleUpdateProfile} />
          </Modal>
          <Modal visible={isForwardModalVisible} transparent={true} animationType="slide" onRequestClose={() => setIsForwardModalVisible(false)}>
            <ForwardModal conversations={conversations} onClose={() => setIsForwardModalVisible(false)} onForward={handleForwardMessage} />
          </Modal>
          {incomingCallData && <IncomingCallModal caller={incomingCallData.caller} onAccept={handleAcceptCall} onDecline={handleDeclineCall} />}

          {(isWideScreen || activeView === 'sidebar') && (
            <Sidebar 
              conversations={conversations}
              currentUser={currentUser}
              presences={presences}
              onSelectConversation={handleSelectConversation}
              isDarkMode={isDarkMode}
              setIsDarkMode={setIsDarkMode}
              onNewChat={() => setIsNewConvoModalVisible(true)}
              onLock={onLock}
              onEditProfile={() => setIsProfileModalVisible(true)}
              selectedConversationId={selectedConversation?.id || null}
            />
          )}

          {(isWideScreen || activeView === 'chat') && selectedConversation && (
              <Animated.View style={{flex: 1}} layout={Layout.springify()}>
                <ChatView
                  key={selectedConversation.id}
                  conversation={selectedConversation}
                  messages={messages[selectedConversation.id] || []}
                  onSendMessage={handleSendMessage}
                  currentUserId={currentUser.id}
                  onBack={isWideScreen ? undefined : handleBack}
                  onTyping={handleTyping}
                  typingInfo={typing}
                  onAddReaction={(msgId, emoji) => handleMessageAction(() => handleAddReaction(msgId, emoji), msgId)}
                  onRemoveReaction={(reactionId, msgId) => handleMessageAction(() => handleRemoveReaction(reactionId, msgId), msgId)}
                  onForward={(msg) => handleMessageAction(() => handleOpenForwardModal(msg), msg.id)}
                  onStar={(msgId) => handleStar(msgId)}
                  onUnstar={(msgId) => handleUnstar(msgId)}
                  onMarkAsRead={markMessagesAsRead}
                  onViewOnceMessage={handleViewOnceMessage}
                  allProfiles={allProfiles}
                  replyingTo={replyingTo}
                  setReplyingTo={(msg) => {
                    if(msg && (typeof msg.id === 'string' || isOffline)){
                      showToast("Cannot reply to an unsent message or while offline.");
                      return;
                    }
                    setReplyingTo(msg);
                  }}
                  onLoadMoreMessages={loadMoreMessages}
                  isLoadingMore={loadingMoreMessages}
                  allMessagesLoaded={allMessagesLoaded}
                  onStartCall={handleStartCall}
                  localStream={localStream}
                  remoteStream={remoteStream}
                  onEndCall={handleEndCall}
                  callState={callState}
                  webRTCManager={webRTCManager}
                  onPanic={handlePanicPress}
                  onScreenShareChange={onSetScreenSharing}
                  isOffline={isOffline}
                  isDarkMode={isDarkMode}
                  onToggleLocalAudio={handleToggleLocalAudio}
                  onToggleLocalVideo={handleToggleLocalVideo}
                  localMediaState={localMediaState}
                  remoteMediaState={remoteMediaState}
                />
              </Animated.View>
          )}
       </View>
    )
  }

  return (
    <ImageBackground source={{ uri: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=2070&auto=format&fit=crop' }} style={styles.backgroundImage}>
      <SafeAreaView style={styles.safeArea}>
        {renderContent()}
        {session && (isWideScreen || activeView === 'chat') && selectedConversation && <PanicButton onPanic={handlePanicPress} />}
        
        {toast && (
            <Animated.View style={[styles.toastContainer, toast.type === 'info' && styles.infoToast]} entering={FadeInUp} exiting={FadeOutUp}>
                {toast.type === 'error' ? <AlertTriangleIcon size={20} color="#FFF" /> : <CheckCircleIcon size={20} color="#FFF" />}
                <Text style={styles.toastText}>{toast.message}</Text>
                <TouchableOpacity onPress={() => setToast(null)} style={{padding: 4}}>
                    <XIcon size={16} color="#FFF" />
                </TouchableOpacity>
            </Animated.View>
        )}
      </SafeAreaView>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  backgroundImage: { flex: 1 },
  safeArea: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' },
  chatContainer: { height: '100%', width: '100%', flexDirection: 'row', overflow: 'hidden', backgroundColor: 'rgba(255, 255, 255, 0.5)', borderColor: 'rgba(255, 255, 255, 0.2)', borderWidth: 1 },
  lightChatContainer: { backgroundColor: 'rgba(255, 255, 255, 0.5)', borderColor: 'rgba(255, 255, 255, 0.2)' },
  darkChatContainer: { backgroundColor: 'rgba(0, 0, 0, 0.5)', borderColor: 'rgba(0, 0, 0, 0.2)' },
  toastContainer: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10000,
    elevation: 10,
  },
  infoToast: {
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
  },
  toastText: {
    color: '#FFF',
    fontWeight: 'bold',
    marginLeft: 8,
    flex: 1,
  },
});

export default ChatScreen;