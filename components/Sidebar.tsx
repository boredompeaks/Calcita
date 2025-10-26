import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TextInput, FlatList, Image, TouchableOpacity, StyleSheet, Platform, UIManager } from 'react-native';
import Animated, { Layout, FadeIn, FadeOut } from 'react-native-reanimated';
import { Profile, Conversation } from '../types';
import { MoonIcon, SearchIcon, SunIcon, LogoutIcon, SendIcon, EditIcon } from './icons';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList as new () => FlatList<Conversation>);

interface SidebarProps {
  conversations: Conversation[];
  currentUser: Profile;
  presences: Record<string, any>;
  onSelectConversation: (conversation: Conversation) => void;
  isDarkMode: boolean;
  setIsDarkMode: (value: boolean) => void;
  onNewChat: () => void;
  onLock: () => void;
  onEditProfile: () => void;
  selectedConversationId: number | null;
}

const Sidebar: React.FC<SidebarProps> = ({ conversations, currentUser, presences, onSelectConversation, isDarkMode, setIsDarkMode, onNewChat, onLock, onEditProfile, selectedConversationId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  const conversationsWithOnlineStatus = useMemo(() => {
    return conversations.map(convo => {
      if (convo.is_group) return convo;
      const otherParticipant = convo.participants.find(p => p.id !== currentUser.id);
      const isOnline = otherParticipant ? Object.values(presences).some((presence: any) => presence[0]?.user_id === otherParticipant.id) : false;
      return { ...convo, online: isOnline };
    });
  }, [conversations, presences, currentUser.id]);

  const filteredConversations = useMemo(() => {
    return conversationsWithOnlineStatus.filter(convo => 
      convo.display_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [conversationsWithOnlineStatus, searchTerm]);

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const diffDays = Math.floor(diff / (1000 * 3600 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (diffDays === 1) {
      return 'Yesterday';
    }
    return date.toLocaleDateString();
  };
  
  const styles = getStyles(isDarkMode);

  const renderItem = ({ item }: { item: Conversation }) => (
    <Animated.View layout={Layout.springify()} entering={FadeIn.duration(300)} exiting={FadeOut.duration(300)}>
      <TouchableOpacity
        onPress={() => onSelectConversation(item)}
        style={[styles.profileItem, item.id === selectedConversationId && styles.activeProfileItem]}
        accessibilityLabel={`Chat with ${item.display_name}. Last message: ${item.last_message_content || 'No messages yet'}`}
      >
        <View>
          <Image source={{ uri: item.display_avatar || `https://i.pravatar.cc/150?u=${item.id}` }} style={styles.avatar} />
          {item.online && (
            <View style={[styles.onlineIndicator, isDarkMode ? styles.darkOnlineIndicator : styles.lightOnlineIndicator]} />
          )}
        </View>
        <View style={styles.profileTextContainer}>
          <View style={styles.profileNameRow}>
              <Text style={[styles.profileName, isDarkMode && styles.darkText]} numberOfLines={1}>{item.display_name}</Text>
              <Text style={[styles.timestamp, isDarkMode && styles.darkSubtleText]}>{formatTimestamp(item.last_message_created_at)}</Text>
          </View>
          <Text style={[styles.lastMessage, isDarkMode && styles.darkSubtleText]} numberOfLines={1}>{item.last_message_content || 'No messages yet'}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onEditProfile} style={styles.headerLeft} accessibilityLabel="Edit your profile">
            <Image source={{ uri: currentUser.avatar_url }} style={styles.currentUserAvatar} />
            <Text style={styles.headerTitle}>Chats</Text>
            <EditIcon size={16} color={isDarkMode ? '#9CA3AF' : '#6B7280'} style={{ marginLeft: 8 }} />
        </TouchableOpacity>
        <View style={styles.headerIcons}>
            <TouchableOpacity onPress={() => setIsDarkMode(!isDarkMode)} style={styles.iconButton} accessibilityLabel={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
                {isDarkMode ? <SunIcon color="#FFF" /> : <MoonIcon color="#000" />}
            </TouchableOpacity>
            <TouchableOpacity onPress={onLock} style={styles.iconButton} accessibilityLabel="Lock and log out">
                <LogoutIcon color={isDarkMode ? '#FFF' : '#000'} />
            </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <SearchIcon style={styles.searchIcon} />
          <TextInput
            placeholder="Search..."
            placeholderTextColor={isDarkMode ? '#6B7280' : '#9CA3AF'}
            value={searchTerm}
            onChangeText={setSearchTerm}
            style={styles.searchInput}
          />
        </View>
      </View>

      {/* User List */}
      <AnimatedFlatList
        data={filteredConversations}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContainer}
      />

      <TouchableOpacity onPress={onNewChat} style={styles.fab} accessibilityLabel="Create new chat">
        <SendIcon size={24} color="#FFF"/>
      </TouchableOpacity>
    </View>
  );
};

const getStyles = (isDarkMode: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDarkMode ? 'rgba(24, 24, 27, 0.7)' : 'rgba(249, 250, 251, 0.7)',
    borderRightWidth: 1,
    borderColor: isDarkMode ? 'rgba(63, 63, 70, 0.5)' : 'rgba(229, 231, 235, 0.5)',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderColor: isDarkMode ? 'rgba(63, 63, 70, 0.5)' : 'rgba(229, 231, 235, 0.5)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currentUserAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginLeft: 12,
    color: isDarkMode ? '#F9FAFB' : '#1F2937',
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
  },
  searchContainer: {
    padding: 16,
  },
  searchInputWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  searchInput: {
    width: '100%',
    paddingLeft: 40,
    paddingRight: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: isDarkMode ? 'rgba(39, 39, 42, 0.8)' : 'rgba(243, 244, 246, 0.8)',
    color: isDarkMode ? '#F9FAFB' : '#1F2937',
  },
  searchIcon: {
    position: 'absolute',
    left: 12,
  },
  listContainer: {
    padding: 8,
  },
  profileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
  },
  activeProfileItem: {
    backgroundColor: isDarkMode ? 'rgba(55, 65, 81, 0.7)' : 'rgba(229, 231, 235, 0.7)',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22C55E',
    borderWidth: 2,
  },
  lightOnlineIndicator: { borderColor: '#F9FAFB' },
  darkOnlineIndicator: { borderColor: '#18181B' },
  profileTextContainer: {
    marginLeft: 16,
    flex: 1,
  },
  profileNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  profileName: {
    fontWeight: '600',
    color: '#1F2937',
    flexShrink: 1,
  },
  timestamp: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 8,
  },
  lastMessage: {
    fontSize: 14,
    color: '#6B7280',
  },
  darkText: { color: '#F9FAFB' },
  darkSubtleText: { color: '#9CA3AF' },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
  }
});


export default Sidebar;