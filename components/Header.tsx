import React, { useMemo } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import Animated, { Layout, FadeIn, FadeOut } from 'react-native-reanimated';
import { Conversation } from '../types';
import { CallIcon, MoreVerticalIcon, ArrowLeftIcon, SearchIcon, XIcon, UsersIcon } from './icons';
import TypingIndicator from './TypingIndicator';

interface HeaderProps {
  conversation: Conversation;
  currentUserId: string;
  typingUser: string | null;
  onBack?: () => void;
  isSearching: boolean;
  onToggleSearch: () => void;
  onSearchChange: (query: string) => void;
  searchTerm: string;
  onStartCall?: () => void;
  isDarkMode: boolean;
  isOffline: boolean;
}

const Header: React.FC<HeaderProps> = ({ conversation, currentUserId, typingUser, onBack, isSearching, onToggleSearch, onSearchChange, searchTerm, onStartCall, isDarkMode, isOffline }) => {
  const styles = getStyles(isDarkMode);

  const displayInfo = useMemo(() => {
    if (conversation.is_group) {
        return {
            name: conversation.display_name,
            avatar: conversation.display_avatar || `https://i.pravatar.cc/150?u=${conversation.id}`,
            status: `${conversation.participants.length} members`
        }
    }
    const otherUser = conversation.participants.find(p => p.id !== currentUserId);
    if (!otherUser) {
        return {
            name: 'Chat',
            avatar: `https://i.pravatar.cc/150?u=unknown`,
            status: 'Offline'
        }
    }
    return {
        name: otherUser.name || 'Chat',
        avatar: otherUser.avatar_url,
        status: otherUser.online ? 'Online' : ''
    }
  }, [conversation, currentUserId]);
  
  const renderDefaultHeader = () => (
    <Animated.View style={styles.headerContent} layout={Layout.duration(250)} entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
      <View style={styles.profileContainer}>
        {conversation.is_group ? (
            <View style={[styles.avatar, styles.groupAvatar]}>
                <UsersIcon color="#FFF" />
            </View>
        ) : (
            <Image source={{ uri: displayInfo.avatar }} style={styles.avatar} />
        )}
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.userName} numberOfLines={1}>{displayInfo.name}</Text>
        <View style={styles.statusContainer}>
          <Text style={styles.userStatus} numberOfLines={1}>
            {isOffline ? 'Offline' : (typingUser ? `${typingUser} is typing` : displayInfo.status)}
          </Text>
          {!isOffline && typingUser && <TypingIndicator isDarkMode={isDarkMode} />}
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={onToggleSearch} accessibilityLabel="Search in conversation">
            <SearchIcon color={isDarkMode ? '#FFF' : '#000'} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={onStartCall} accessibilityLabel="Start video call">
            <CallIcon color={isDarkMode ? '#FFF' : '#000'} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  const renderSearchHeader = () => (
    <Animated.View style={styles.headerContent} layout={Layout.duration(250)} entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
      <TextInput
        placeholder="Search in conversation..."
        placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
        value={searchTerm}
        onChangeText={onSearchChange}
        style={styles.searchInput}
        autoFocus
      />
      <TouchableOpacity style={styles.actionButton} onPress={onToggleSearch} accessibilityLabel="Close search">
        <XIcon size={20} color={isDarkMode ? '#FFF' : '#000'}/>
      </TouchableOpacity>
    </Animated.View>
  );
  
  return (
    <View style={styles.container}>
      {onBack && !isSearching && (
        <TouchableOpacity 
          onPress={onBack}
          style={styles.backButton}
          accessibilityLabel="Go back to chats list"
        >
          <ArrowLeftIcon color={isDarkMode ? '#FFF' : '#000'} />
        </TouchableOpacity>
      )}
      {isSearching ? renderSearchHeader() : renderDefaultHeader()}
    </View>
  );
};

const getStyles = (isDarkMode: boolean) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderColor: isDarkMode ? 'rgba(63, 63, 70, 0.5)' : 'rgba(229, 231, 235, 0.5)',
    backgroundColor: isDarkMode ? 'rgba(24, 24, 27, 0.7)' : 'rgba(249, 250, 251, 0.7)',
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    paddingRight: 8,
  },
  profileContainer: {
    width: 44,
    height: 44,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  },
  groupAvatar: {
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    marginLeft: 16,
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: isDarkMode ? '#FFFFFF' : '#000000',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 18,
  },
  userStatus: {
    fontSize: 14,
    color: isDarkMode ? '#9CA3AF' : '#6B7280',
    maxWidth: '85%',
  },
  actions: {
    flexDirection: 'row',
    gap: 4,
  },
  actionButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: isDarkMode ? '#FFF' : '#000',
    paddingHorizontal: 8,
  },
});

export default Header;