import React, { useState } from 'react';
import { View, Text, TextInput, Image, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { Profile } from '../types';
import { XIcon, EditIcon } from './icons';

interface ProfileModalProps {
  currentUser: Profile;
  onClose: () => void;
  onSave: (name: string, avatarFile?: { uri: string; type: string; name: string }) => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ currentUser, onClose, onSave }) => {
  const [name, setName] = useState(currentUser.name);
  const [avatar, setAvatar] = useState<{ uri: string; type: string; name: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const isDarkMode = true;
  const styles = getStyles(isDarkMode);

  const handleChooseAvatar = () => {
    launchImageLibrary({ mediaType: 'photo', quality: 0.5, maxWidth: 512, maxHeight: 512 }, (response) => {
      if (response.didCancel) return;
      if (response.errorCode) { return; }
      if (response.assets && response.assets[0]) {
        const asset = response.assets[0];
        setAvatar({
          uri: asset.uri || '',
          type: asset.type || 'image/jpeg',
          name: asset.fileName || 'avatar.jpg'
        });
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
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.modalContainer}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <TouchableOpacity onPress={onClose}>
            <XIcon color={isDarkMode ? '#FFF' : '#000'} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.avatarContainer}>
            <Image 
              source={{ uri: avatar?.uri || currentUser.avatar_url }} 
              style={styles.avatar} 
            />
            <TouchableOpacity style={styles.editAvatarButton} onPress={handleChooseAvatar}>
              <EditIcon size={24} color="#FFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Display Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              style={styles.input}
              placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
            />
          </View>
        </View>
        
        <TouchableOpacity 
          style={[styles.saveButton, (!name.trim() || loading) && styles.disabledButton]}
          onPress={handleSave}
          disabled={!name.trim() || loading}
        >
          {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveButtonText}>Save Changes</Text>}
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
    height: '60%',
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
  content: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 24,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 24,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 8,
    borderRadius: 20,
  },
  inputContainer: {
    width: '100%',
  },
  label: {
    color: isDarkMode ? '#A1A1AA' : '#374151',
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    backgroundColor: isDarkMode ? '#27272A' : '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: isDarkMode ? '#FFF' : '#000',
    width: '100%',
  },
  saveButton: {
    backgroundColor: '#3B82F6',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  disabledButton: {
    backgroundColor: '#9CA3AF',
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default ProfileModal;