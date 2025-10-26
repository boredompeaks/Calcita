import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Image, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator, Modal, Pressable, Alert } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { launchImageLibrary } from 'react-native-image-picker';
import { Profile } from '../types';
import { XIcon, EditIcon } from './icons';

interface ProfileModalProps {
  currentUser: Profile;
  onClose: () => void;
  onSave: (name: string, avatarFile?: { uri: string; type: string; name: string }) => void;
  isVisible: boolean;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ currentUser, onClose, onSave, isVisible }) => {
  const [name, setName] = useState(currentUser.name);
  const [avatar, setAvatar] = useState<{ uri: string; type: string; name: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const styles = getStyles(true);

  const modalY = useSharedValue(400);
  const modalOpacity = useSharedValue(0);

  const animatedModalStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: modalY.value }],
      opacity: modalOpacity.value,
    };
  });
  
  useEffect(() => {
    if (isVisible) {
      setName(currentUser.name);
      setAvatar(null);
      modalY.value = withSpring(0, { damping: 15, stiffness: 120 });
      modalOpacity.value = withSpring(1);
    } else {
      modalY.value = withSpring(400);
      modalOpacity.value = withSpring(0);
    }
  }, [isVisible, currentUser]);

  const handleChooseAvatar = () => {
    launchImageLibrary({ mediaType: 'photo', quality: 0.5, maxWidth: 512, maxHeight: 512 }, (response) => {
      if (response.didCancel) return;
      // Edge Case: Handle permission denial for photo library access.
      if (response.errorCode) {
        if (response.errorCode === 'permission') {
          Alert.alert(
            'Permission Denied',
            'To select a profile picture, please grant access to your photo library in your device settings.',
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert('Error', response.errorMessage || 'An unknown error occurred selecting the image.');
        }
        return;
      }
      if (response.assets && response.assets[0]) {
        const asset = response.assets[0];
        setAvatar({ uri: asset.uri || '', type: asset.type || 'image/jpeg', name: asset.fileName || 'avatar.jpg' });
      }
    });
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setLoading(true);
    await onSave(name, avatar || undefined);
    setLoading(false);
  };

  return (
    <Modal transparent={true} visible={isVisible} onRequestClose={onClose} animationType="none">
      <Pressable style={styles.safeArea} onPress={onClose}>
        <Animated.View style={[styles.modalContainer, animatedModalStyle]} onStartShouldSetResponder={() => true}>
          <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Edit Profile</Text>
            <TouchableOpacity onPress={onClose}>
              <XIcon color="#FFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <View style={styles.avatarContainer}>
              <Image source={{ uri: avatar?.uri || currentUser.avatar_url }} style={styles.avatar} />
              <TouchableOpacity style={styles.editAvatarButton} onPress={handleChooseAvatar}>
                <EditIcon size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Display Name</Text>
              <TextInput value={name} onChangeText={setName} style={styles.input} placeholderTextColor="#9CA3AF" />
            </View>
          </View>
          
          <TouchableOpacity 
            style={[styles.saveButton, (!name.trim() || loading) && styles.disabledButton]}
            onPress={handleSave}
            disabled={!name.trim() || loading}
          >
            {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
          </TouchableOpacity>
        </Animated.View>
      </Pressable>
    </Modal>
  );
};

const getStyles = (isDarkMode: boolean) => StyleSheet.create({
  safeArea: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalContainer: { height: '60%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.2)' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFF' },
  content: { flex: 1, alignItems: 'center', paddingTop: 24 },
  avatarContainer: { position: 'relative', marginBottom: 24 },
  avatar: { width: 120, height: 120, borderRadius: 60 },
  editAvatarButton: { position: 'absolute', bottom: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 20 },
  inputContainer: { width: '100%' },
  label: { color: '#A1A1AA', fontSize: 14, marginBottom: 8 },
  input: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: 12, fontSize: 16, color: '#FFF', width: '100%' },
  saveButton: { backgroundColor: '#3B82F6', padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  disabledButton: { backgroundColor: '#9CA3AF' },
  saveButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
});

export default ProfileModal;