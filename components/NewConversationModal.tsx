import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, FlatList, Image, TouchableOpacity, StyleSheet, SafeAreaView, Button, ActivityIndicator } from 'react-native';
import { Profile } from '../types';
import { CheckIcon, XIcon } from './icons';

interface NewConversationModalProps {
  allProfiles: Profile[];
  onClose: () => void;
  onCreateConversation: (selectedUsers: Profile[], groupName?: string) => void;
}

const NewConversationModal: React.FC<NewConversationModalProps> = ({ allProfiles, onClose, onCreateConversation }) => {
  const [selectedUsers, setSelectedUsers] = useState<Profile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [groupName, setGroupName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const isDarkMode = true;
  const styles = getStyles(isDarkMode);

  const toggleUserSelection = (user: Profile) => {
    setSelectedUsers(prev =>
      prev.find(p => p.id === user.id)
        ? prev.filter(p => p.id !== user.id)
        : [...prev, user]
    );
  };

  const filteredProfiles = useMemo(() => {
    return allProfiles.filter(profile =>
      profile.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allProfiles, searchTerm]);
  
  const handleCreate = async () => {
    if (selectedUsers.length === 0 || isLoading) return;
    if (selectedUsers.length > 1 && !groupName.trim()) {
      alert('Please enter a group name.');
      return;
    }
    setIsLoading(true);
    await onCreateConversation(selectedUsers, groupName);
    setIsLoading(false);
  };

  const renderItem = ({ item }: { item: Profile }) => {
    const isSelected = selectedUsers.some(p => p.id === item.id);
    return (
      <TouchableOpacity onPress={() => toggleUserSelection(item)} style={styles.userRow}>
        <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        <Text style={styles.userName}>{item.name}</Text>
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <CheckIcon size={16} color="#FFF" />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
        <View style={styles.modalContainer}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>New Conversation</Text>
                <TouchableOpacity onPress={onClose}>
                    <XIcon color={isDarkMode ? '#FFF' : '#000'} />
                </TouchableOpacity>
            </View>

            {selectedUsers.length > 1 && (
                <View style={styles.groupInputContainer}>
                    <TextInput
                        placeholder="Group Name"
                        value={groupName}
                        onChangeText={setGroupName}
                        style={styles.groupInput}
                        placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                    />
                </View>
            )}

            <View style={styles.searchContainer}>
                <TextInput
                    placeholder="Search users..."
                    value={searchTerm}
                    onChangeText={setSearchTerm}
                    style={styles.searchInput}
                    placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                />
            </View>
            
            <FlatList
                data={filteredProfiles}
                renderItem={renderItem}
                keyExtractor={item => item.id}
            />

            <TouchableOpacity 
                style={[styles.createButton, (selectedUsers.length === 0 || isLoading) && styles.disabledButton]}
                onPress={handleCreate}
                disabled={selectedUsers.length === 0 || isLoading}
            >
                {isLoading ? (
                    <ActivityIndicator color="#FFF" />
                ) : (
                    <Text style={styles.createButtonText}>
                        {selectedUsers.length > 1 ? `Create Group Chat` : `Create Chat`}
                    </Text>
                )}
            </TouchableOpacity>
        </View>
    </SafeAreaView>
  );
};

const getStyles = (isDarkMode: boolean) => StyleSheet.create({
  safeArea: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContainer: {
    backgroundColor: isDarkMode ? '#18181B' : '#FFFFFF',
    height: '90%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: isDarkMode ? '#3F3F46' : '#E5E7EB',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: isDarkMode ? '#FFF' : '#000',
  },
  searchContainer: {
    paddingVertical: 12,
  },
  searchInput: {
    backgroundColor: isDarkMode ? '#27272A' : '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: isDarkMode ? '#FFF' : '#000',
  },
  groupInputContainer: {
    paddingVertical: 12,
  },
  groupInput: {
    backgroundColor: isDarkMode ? '#27272A' : '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: isDarkMode ? '#FFF' : '#000',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  userName: {
    flex: 1,
    fontSize: 16,
    color: isDarkMode ? '#FFF' : '#000',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: isDarkMode ? '#9CA3AF' : '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  createButton: {
    backgroundColor: '#3B82F6',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  disabledButton: {
    backgroundColor: '#9CA3AF',
  },
  createButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default NewConversationModal;