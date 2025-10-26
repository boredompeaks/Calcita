import React, { useCallback } from 'react';
import { FlatList, StyleSheet, View, Text, ViewToken, ActivityIndicator } from 'react-native';
import Animated, { Layout } from 'react-native-reanimated';
import { Message, Profile, Reaction } from '../types';
import MessageBubble from './MessageBubble';

type MessageWithSender = Message & { sender?: Profile, reactions?: Reaction[], starred?: boolean, repliedMessage?: MessageWithSender };

interface MessageListProps {
  messages: MessageWithSender[];
  currentUserId: string;
  onAddReaction: (messageId: number, emoji: string) => void;
  onRemoveReaction: (reactionId: number, messageId: number) => void;
  onForward: (message: Message) => void;
  onStar: (messageId: number) => void;
  onUnstar: (messageId: number) => void;
  onMarkAsRead: (messageIds: number[]) => void;
  onViewOnceMessage: (message: Message) => Promise<boolean>;
  searchTerm: string;
  onReply: (message: Message) => void;
  onLoadMore: () => void;
  isLoadingMore: boolean;
  allMessagesLoaded: boolean;
  isDarkMode: boolean;
  onRetry: (tempId: string) => void;
}

const MessageList: React.FC<MessageListProps> = (props) => {
  const { messages, currentUserId, onAddReaction, onRemoveReaction, onForward, onStar, onUnstar, onMarkAsRead, onViewOnceMessage, searchTerm, onReply, onLoadMore, isLoadingMore, allMessagesLoaded, isDarkMode, onRetry } = props;

  const viewabilityConfig = {
    itemVisiblePercentThreshold: 50,
  };

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const unreadMessageIds = viewableItems
      .map(item => item.item as Message)
      .filter(msg => !msg.read_at && msg.user_id !== currentUserId && typeof msg.id === 'number')
      .map(msg => msg.id as number);

    if (unreadMessageIds.length > 0) {
      onMarkAsRead(unreadMessageIds);
    }
  }, [currentUserId, onMarkAsRead]);

  const renderItem = ({ item }: { item: MessageWithSender }) => (
    <Animated.View layout={Layout.springify()}>
      <MessageBubble 
        message={item}
        sender={item.sender}
        isCurrentUser={item.user_id === currentUserId}
        currentUserId={currentUserId}
        onAddReaction={onAddReaction}
        onRemoveReaction={onRemoveReaction}
        onForward={onForward}
        onStar={onStar}
        onUnstar={onUnstar}
        onViewOnceMessage={onViewOnceMessage}
        searchTerm={searchTerm}
        onReply={onReply}
        repliedMessage={item.repliedMessage}
        isDarkMode={isDarkMode}
        onRetry={onRetry}
      />
    </Animated.View>
  );
  
  const renderListHeader = () => {
    if (isLoadingMore) {
        return <ActivityIndicator size="small" color="#9CA3AF" style={{ marginVertical: 20 }} />;
    }
    if(allMessagesLoaded && messages.length > 0) {
        return <Text style={styles.emptyText}>Beginning of conversation.</Text>
    }
    return null;
  }

  if (messages.length === 0 && !isLoadingMore) {
    return (
        <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No messages yet. Be the first to start the conversation!</Text>
        </View>
    );
  }

  return (
    <FlatList
      data={messages}
      renderItem={renderItem}
      keyExtractor={(item) => item.id.toString()}
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      inverted
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      onEndReached={onLoadMore}
      onEndReachedThreshold={0.5}
      ListFooterComponent={renderListHeader}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    padding: 16,
  },
});

export default MessageList;