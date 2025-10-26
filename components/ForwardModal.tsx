import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet, SafeAreaView, Modal, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Conversation } from '../types';
import { CheckIcon, XIcon } from './icons';

interface ForwardModalProps {
  conversations: Conversation[];
  onClose: () => void;
  onForward: (targetConversations: Conversation[]) => void;
  isVisible: boolean;
}

const ForwardModal: React.FC<ForwardModalProps> = ({ conversations, onClose, onForward, isVisible }) => {
  const [selected, setSelected] = useState<Conversation[]>([]);
  const styles = getStyles(true);

  const modalY = useSharedValue(500);
  const modalOpacity = useSharedValue(0);

  const animatedModalStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: modalY.value }],
    opacity: modalOpacity.value,
  }));

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
    setSelected([]);
    onClose();
  };

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
    <Modal transparent={true} visible={isVisible} onRequestClose={handleClose} animationType="none">
        <Pressable style={styles.safeArea} onPress={handleClose}>
            <Animated.View style={[styles.modalContainer, animatedModalStyle]} onStartShouldSetResponder={() => true}>
                <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFillObject} />
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Forward to...</Text>
                    <TouchableOpacity onPress={handleClose}>
                        <XIcon color="#FFF" />
                    </TouchableOpacity>
                </View>
                
                <FlatList data={conversations} renderItem={renderItem} keyExtractor={item => item.id.toString()} />

                <TouchableOpacity 
                    style={[styles.forwardButton, selected.length === 0 && styles.disabledButton]}
                    onPress={handleForward}
                    disabled={selected.length === 0}
                >
                    <Text style={styles.forwardButtonText}>Send</Text>
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
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12 },
  name: { flex: 1, fontSize: 16, color: '#FFF' },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#9CA3AF', justifyContent: 'center', alignItems: 'center' },
  checkboxSelected: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  forwardButton: { backgroundColor: '#3B82F6', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  disabledButton: { backgroundColor: '#9CA3AF' },
  forwardButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
});

export default ForwardModal;