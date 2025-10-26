import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TextInput, FlatList, Image, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator, Modal, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Profile } from '../types';
import { CheckIcon, XIcon } from './icons';

interface NewConversationModalProps {
  allProfiles: Profile[];
  onClose: () => void;
  onCreateConversation: (selectedUsers: Profile[], groupName?: string) => void;
  isVisible: boolean;
}

const NewConversationModal: React.FC<NewConversationModalProps> = ({ allProfiles, onClose, onCreateConversation, isVisible }) => {
  const [selectedUsers, setSelectedUsers] = useState<Profile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [groupName, setGroupName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const isDarkMode = true; // For styling consistency
  const styles = getStyles(isDarkMode);
  
  const modalY = useSharedValue(500);
  const modalOpacity = useSharedValue(0);

  const animatedModalStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: modalY.value }],
      opacity: modalOpacity.value,
    };
  });
  
  useEffect(() => {
    if (isVisible) {
      modalY.value = withSpring(0, { damping: 15, stiffness: 120 });
      modalOpacity.value = withSpring(1);
    } else {
      modalY.value = withSpring(500);
      modalOpacity.value = withSpring(0);
    }
  }, [isVisible]);

  const handleClose = () => {
    setSelectedUsers([]);
    setSearchTerm('');
    setGroupName('');
    onClose();
  };

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
    <Modal transparent={true} visible={isVisible} onRequestClose={handleClose} animationType="none">
        <Pressable style={styles.safeArea} onPress={handleClose}>
            <Animated.View style={[styles.modalContainer, animatedModalStyle]} onStartShouldSetResponder={() => true}>
                <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFillObject} />
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>New Conversation</Text>
                    <TouchableOpacity onPress={handleClose}>
                        <XIcon color="#FFF" />
                    </TouchableOpacity>
                </View>

                {selectedUsers.length > 1 && (
                    <View style={styles.groupInputContainer}>
                        <TextInput placeholder="Group Name" value={groupName} onChangeText={setGroupName} style={styles.groupInput} placeholderTextColor="#9CA3AF" />
                    </View>
                )}

                <View style={styles.searchContainer}>
                    <TextInput placeholder="Search users..." value={searchTerm} onChangeText={setSearchTerm} style={styles.searchInput} placeholderTextColor="#9CA3AF" />
                </View>
                
                <FlatList data={filteredProfiles} renderItem={renderItem} keyExtractor={item => item.id} />

                <TouchableOpacity 
                    style={[styles.createButton, (selectedUsers.length === 0 || isLoading) && styles.disabledButton]}
                    onPress={handleCreate}
                    disabled={selectedUsers.length === 0 || isLoading}
                >
                    {isLoading ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <Text style={styles.createButtonText}>{selectedUsers.length > 1 ? `Create Group Chat` : `Create Chat`}</Text>
                    )}
                </TouchableOpacity>
            </Animated.View>
        </Pressable>
    </Modal>
  );
};

const getStyles = (isDarkMode: boolean) => StyleSheet.create({
  safeArea: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalContainer: { height: '90%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.2)' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFF' },
  searchContainer: { paddingVertical: 12 },
  searchInput: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: 12, fontSize: 16, color: '#FFF' },
  groupInputContainer: { paddingVertical: 12 },
  groupInput: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: 12, fontSize: 16, color: '#FFF' },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  userName: { flex: 1, fontSize: 16, color: '#FFF' },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#9CA3AF', justifyContent: 'center', alignItems: 'center' },
  checkboxSelected: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  createButton: { backgroundColor: '#3B82F6', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  disabledButton: { backgroundColor: '#9CA3AF' },
  createButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
});

export default NewConversationModal;