import React, { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, Modal } from 'react-native';
import { Message, Conversation, Profile } from '../types';
import Header from './Header';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import VideoCallView from './VideoCallView';
import { MediaStream } from 'react-native-webrtc';
import { WebRTCManager } from '../services/webrtcService';

type MessageWithSender = Message & { sender?: Profile, repliedMessage?: MessageWithSender };

interface ChatViewProps {
  conversation: Conversation;
  messages: Message[];
  allProfiles: Profile[];
  onSendMessage: (text: string, file?: { uri: string; type: string; name: string }, duration?: number, isViewOnce?: boolean) => void;
  onTyping: () => void;
  typingInfo: { user: string, conversationId: number } | null;
  currentUserId: string;
  onBack?: () => void;
  onAddReaction: (messageId: number, emoji: string) => void;
  onRemoveReaction: (reactionId: number, messageId: number) => void;
  onForward: (message: Message) => void;
  onStar: (messageId: number | string) => void;
  onUnstar: (messageId: number | string) => void;
  onMarkAsRead: (messageIds: number[]) => void;
  onViewOnceMessage: (message: Message) => Promise<boolean>;
  replyingTo: Message | null;
  setReplyingTo: (message: Message | null) => void;
  onLoadMoreMessages: () => void;
  isLoadingMore: boolean;
  allMessagesLoaded: boolean;
  onStartCall: () => void;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onEndCall: () => void;
  callState: 'idle' | 'outgoing' | 'incoming' | 'active';
  webRTCManager: WebRTCManager;
  onPanic: () => void;
  onScreenShareChange: (isSharing: boolean) => void;
  isOffline: boolean;
  isDarkMode: boolean;
  onToggleLocalAudio: () => void;
  onToggleLocalVideo: () => void;
  localMediaState: { isMicMuted: boolean; isCameraOff: boolean; };
  remoteMediaState: { isMicMuted: boolean; isCameraOff: boolean; };
  showToast: (message: string, type: 'error' | 'info') => void;
  onRetrySendMessage: (tempId: string) => void;
}

const ChatView: React.FC<ChatViewProps> = (props) => {
  const { setReplyingTo, onStartCall, localStream, remoteStream, onEndCall, callState, webRTCManager, onPanic, onScreenShareChange, isOffline, isDarkMode, onToggleLocalAudio, onToggleLocalVideo, localMediaState, remoteMediaState, showToast, onRetrySendMessage } = props;
  const [isSearching, setIsSearching] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const messagesToDisplay = useMemo(() => {
    if (!searchTerm.trim()) return props.messages;
    return props.messages.filter(m => m.content?.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [props.messages, searchTerm]);

  const toggleSearch = () => {
    setIsSearching(!isSearching);
    setSearchTerm("");
  }

  const typingUser = useMemo(() => {
    if (props.typingInfo && props.typingInfo.conversationId === props.conversation.id) {
      return props.typingInfo.user;
    }
    return null;
  }, [props.typingInfo, props.conversation.id]);

  const messagesWithSenderAndReply = useMemo(() => {
    const messagesWithSender = messagesToDisplay.map(message => {
        const sender = props.allProfiles.find(p => p.id === message.user_id);
        return { ...message, sender };
    });

    return messagesWithSender.map(message => {
        if (message.reply_to_message_id) {
            const repliedMessage = messagesWithSender.find(m => m.id === message.reply_to_message_id);
            return { ...message, repliedMessage };
        }
        return message;
    });
  }, [messagesToDisplay, props.allProfiles]);
  
  const replyingToWithSender = useMemo(() => {
    if (!props.replyingTo) return null;
    const sender = props.allProfiles.find(p => p.id === props.replyingTo.user_id);
    return { ...props.replyingTo, sender };
  }, [props.replyingTo, props.allProfiles]);
  
  const isCallActive = callState === 'active' || callState === 'outgoing';

  return (
    <View style={styles.container}>
      <Header 
        conversation={props.conversation}
        currentUserId={props.currentUserId}
        onBack={props.onBack} 
        typingUser={typingUser}
        isSearching={isSearching}
        onToggleSearch={toggleSearch}
        onSearchChange={setSearchTerm}
        searchTerm={searchTerm}
        onStartCall={onStartCall}
        isDarkMode={isDarkMode}
        isOffline={isOffline}
      />
      <MessageList 
        messages={messagesWithSenderAndReply} 
        currentUserId={props.currentUserId}
        onAddReaction={props.onAddReaction}
        onRemoveReaction={props.onRemoveReaction}
        onForward={props.onForward}
        onStar={props.onStar}
        onUnstar={props.onUnstar}
        onMarkAsRead={props.onMarkAsRead}
        onViewOnceMessage={props.onViewOnceMessage}
        searchTerm={searchTerm}
        onReply={setReplyingTo}
        onLoadMore={props.onLoadMoreMessages}
        isLoadingMore={props.isLoadingMore}
        allMessagesLoaded={props.allMessagesLoaded}
        isDarkMode={isDarkMode}
        onRetry={onRetrySendMessage}
      />
      <MessageInput 
        onSendMessage={props.onSendMessage} 
        onTyping={props.onTyping}
        replyingTo={replyingToWithSender}
        onCancelReply={() => setReplyingTo(null)}
        currentUserId={props.currentUserId}
        isOffline={isOffline}
        isDarkMode={isDarkMode}
        showToast={showToast}
      />
      <Modal visible={isCallActive} animationType="slide" onRequestClose={onEndCall}>
        <VideoCallView 
          onEndCall={onEndCall}
          conversation={props.conversation}
          currentUserId={props.currentUserId}
          localStream={localStream}
          remoteStream={remoteStream}
          webRTCManager={webRTCManager}
          onPanic={onPanic}
          onScreenShareChange={onScreenShareChange}
          onToggleLocalAudio={onToggleLocalAudio}
          onToggleLocalVideo={onToggleLocalVideo}
          localMediaState={localMediaState}
          remoteMediaState={remoteMediaState}
        />
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
  },
});

export default ChatView;