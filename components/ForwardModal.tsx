import React, { useState } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { Conversation } from '../types';
import { CheckIcon, XIcon } from './icons';

interface ForwardModalProps {
  conversations: Conversation[];
  onClose: () => void;
  onForward: (targetConversations: Conversation[]) => void;
}

const ForwardModal: React.FC<ForwardModalProps> = ({ conversations, onClose, onForward }) => {
  const [selected, setSelected] = useState<Conversation[]>([]);
  const isDarkMode = true;
  const styles = getStyles(isDarkMode);

  const toggleSelection = (conversation: Conversation) => {
    setSelected(prev =>
      prev.find(c => c.id === conversation.id)
        ? prev.filter(c => c.id !== conversation.id)
        : [...prev, conversation]
    );
  };
  
  const handleForward = () => {
    if (selected.length === 0) return;
    onForward(selected);
  };

  const renderItem = ({ item }: { item: Conversation }) => {
    const isSelected = selected.some(c => c.id === item.id);
    return (
      <TouchableOpacity onPress={() => toggleSelection(item)} style={styles.row}>
        <Image source={{ uri: item.display_avatar || `https://i.pravatar.cc/150?u=${item.id}` }} style={styles.avatar} />
        <Text style={styles.name}>{item.display_name}</Text>
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
                <Text style={styles.headerTitle}>Forward to...</Text>
                <TouchableOpacity onPress={onClose}>
                    <XIcon color={isDarkMode ? '#FFF' : '#000'} />
                </TouchableOpacity>
            </View>
            
            <FlatList
                data={conversations}
                renderItem={renderItem}
                keyExtractor={item => item.id.toString()}
            />

            <TouchableOpacity 
                style={[styles.forwardButton, selected.length === 0 && styles.disabledButton]}
                onPress={handleForward}
                disabled={selected.length === 0}
            >
                <Text style={styles.forwardButtonText}>
                    Send
                </Text>
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
  row: {
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
  name: {
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
  forwardButton: {
    backgroundColor: '#3B82F6',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  disabledButton: {
    backgroundColor: '#9CA3AF',
  },
  forwardButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default ForwardModal;
