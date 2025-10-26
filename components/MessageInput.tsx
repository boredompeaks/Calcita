import React, { useState, useRef, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Image, Platform, Text, AppState, AppStateStatus } from 'react-native';
import Animated, { Layout } from 'react-native-reanimated';
import { launchImageLibrary } from 'react-native-image-picker';
import { Audio } from 'expo-av';
import { SendIcon, PaperclipIcon, MicIcon, XIcon, ViewOnceIcon } from './icons';
import { Message, Profile } from '../types';

interface MessageInputProps {
  onSendMessage: (text: string, file?: { uri: string; type: string; name: string }, duration?: number, isViewOnce?: boolean) => void;
  onTyping: () => void;
  replyingTo: (Message & { sender?: Profile }) | null;
  onCancelReply: () => void;
  currentUserId: string;
  isOffline: boolean;
  isDarkMode: boolean;
}

const MessageInput: React.FC<MessageInputProps> = ({ onSendMessage, onTyping, replyingTo, onCancelReply, currentUserId, isOffline, isDarkMode }) => {
  const [text, setText] = useState('');
  const [file, setFile] = useState<{ uri: string; type: string; name: string } | null>(null);
  const [inputHeight, setInputHeight] = useState(48);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recording = useRef<Audio.Recording | null>(null);
  const recordingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isViewOnce, setIsViewOnce] = useState(false);
  const styles = getStyles(isDarkMode, isRecording);

  // Ref to track recording state for AppState listener
  const isRecordingRef = useRef(isRecording);
  isRecordingRef.current = isRecording;

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      // If app is backgrounded while recording, cancel it.
      if (nextAppState.match(/inactive|background/) && isRecordingRef.current) {
        stopRecording(true); // true = discard recording
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, []);

  const handleFileChange = () => {
    if (isOffline) {
        alert("Cannot send files while offline.");
        return;
    }
    launchImageLibrary({ mediaType: 'photo', quality: 0.7, maxWidth: 1024, maxHeight: 1024 }, (response) => {
      if (response.didCancel) {
        // User cancelled image picker
      } else if (response.errorCode) {
        // ImagePicker Error
      } else if (response.assets && response.assets[0]) {
        const asset = response.assets[0];
        setFile({
          uri: asset.uri || '',
          type: asset.type || 'image/jpeg',
          name: asset.fileName || 'image.jpg'
        });
      }
    });
  };

  const handleRemoveFile = () => {
    setFile(null);
  }

  const handleSubmit = () => {
    if (text.trim() || file) {
      onSendMessage(text, file || undefined, undefined, isViewOnce);
      setText('');
      handleRemoveFile();
      setInputHeight(48);
      setIsViewOnce(false);
    }
  };

  const handleInputChange = (newText: string) => {
    setText(newText);
    onTyping();
  }
  
  const startRecording = async () => {
    if (isOffline) {
        alert("Cannot send voice notes while offline.");
        return;
    }
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        alert('Permission to access microphone is required!');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recording.current = newRecording;
      setIsRecording(true);
      setRecordingDuration(0);
      recordingInterval.current = setInterval(() => {
          setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      // Failed to start recording
    }
  };

  const stopRecording = async (shouldDiscard = false) => {
    if (!recording.current) return;
    
    setIsRecording(false);
    if(recordingInterval.current) clearInterval(recordingInterval.current);

    try {
      await recording.current.stopAndUnloadAsync();
      if (!shouldDiscard) {
        const uri = recording.current.getURI();
        if (uri) {
          const finalDuration = recordingDuration;
          onSendMessage('', { uri, type: 'audio/m4a', name: `recording-${Date.now()}.m4a` }, finalDuration, isViewOnce);
        }
      }
    } catch (error) {
        // Error stopping recording
    } finally {
        recording.current = null;
        setRecordingDuration(0);
        setIsViewOnce(false);
    }
  };
  
  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const canSend = text.trim() || file;

  return (
    <Animated.View style={styles.container} layout={Layout.springify()}>
       {replyingTo && (
        <Animated.View style={styles.replyingToContainer} layout={Layout.springify()}>
            <View style={{flex: 1}}>
                <Text style={styles.replyingToTitle}>
                  Replying to {replyingTo.sender?.id === currentUserId ? 'Yourself' : replyingTo.sender?.name}
                </Text>
                <Text style={styles.replyingToContent} numberOfLines={1}>
                  {replyingTo.content || 'Media'}
                </Text>
            </View>
            <TouchableOpacity onPress={onCancelReply} style={{padding: 4}} accessibilityLabel="Cancel reply">
                <XIcon size={20} color={isDarkMode ? '#9CA3AF' : '#6B7280'} />
            </TouchableOpacity>
        </Animated.View>
       )}
       {file && (
        <Animated.View style={styles.previewContainer} layout={Layout.springify()}>
          <Image source={{ uri: file.uri }} style={styles.previewImage} />
          <TouchableOpacity
            onPress={handleRemoveFile}
            style={styles.removeButton}
            accessibilityLabel="Remove attached file"
          >
            <XIcon size={16} color="#FFFFFF"/>
          </TouchableOpacity>
        </Animated.View>
      )}
      <View style={styles.inputRow}>
        <View style={styles.inputWrapper}>
            {isRecording ? (
                <View style={styles.recordingIndicator}>
                    <View style={styles.redDot} />
                    <Text style={styles.recordingTimer}>{formatDuration(recordingDuration)}</Text>
                </View>
            ) : (
                <>
                    <TextInput
                      multiline
                      value={text}
                      onChangeText={handleInputChange}
                      placeholder="Type a message..."
                      placeholderTextColor={isDarkMode ? '#9CA3AF' : '#6B7280'}
                      style={[styles.textInput, { height: Math.min(120, inputHeight) }]}
                      onContentSizeChange={(e) => {
                        setInputHeight(e.nativeEvent.contentSize.height);
                      }}
                    />
                    <TouchableOpacity onPress={handleFileChange} style={styles.iconButtonAttachment} accessibilityLabel="Attach file">
                        <PaperclipIcon />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setIsViewOnce(!isViewOnce)} style={styles.iconButtonViewOnce} accessibilityLabel="Toggle view once message">
                        <ViewOnceIcon color={isViewOnce ? '#3B82F6' : '#9CA3AF'} />
                    </TouchableOpacity>
                </>
            )}
        </View>
        <TouchableOpacity
          onPress={canSend ? handleSubmit : undefined}
          onPressIn={!canSend ? startRecording : undefined}
          onPressOut={!canSend ? () => stopRecording(false) : undefined}
          style={[styles.sendButton, !canSend && styles.micButton]}
          accessibilityLabel={canSend ? "Send message" : "Record voice message"}
        >
          {canSend ? <SendIcon /> : <MicIcon />}
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const getStyles = (isDarkMode: boolean, isRecording: boolean) => StyleSheet.create({
  container: {
    padding: 12,
    borderTopWidth: 1,
    borderColor: isDarkMode ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'transparent'
  },
  replyingToContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    marginBottom: 8,
    backgroundColor: isDarkMode ? 'rgba(55, 65, 81, 0.3)' : 'rgba(243, 244, 246, 0.3)',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6'
  },
  replyingToTitle: {
    color: isDarkMode ? '#F9FAFB' : '#1F2937',
    fontWeight: 'bold',
    fontSize: 13
  },
  replyingToContent: {
    color: isDarkMode ? '#D1D5DB' : '#4B5563',
    fontSize: 13,
    marginTop: 2
  },
  previewContainer: {
    width: 96,
    height: 96,
    marginBottom: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: isDarkMode ? 'rgba(107, 114, 128, 0.5)' : 'rgba(209, 213, 219, 0.5)',
    borderRadius: 8,
  },
  previewImage: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  removeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(55, 65, 81, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  inputWrapper: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
  },
  textInput: {
    paddingLeft: 16,
    paddingRight: 84,
    paddingTop: Platform.OS === 'ios' ? 14 : 10,
    paddingBottom: Platform.OS === 'ios' ? 14 : 10,
    borderRadius: 24,
    backgroundColor: isDarkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(243, 244, 246, 0.5)',
    borderColor: isDarkMode ? 'rgba(75, 85, 99, 0.5)' : 'rgba(209, 213, 219, 0.5)',
    borderWidth: 1,
    color: isDarkMode ? '#F9FAFB' : '#1F2937',
    fontSize: 16,
    maxHeight: 120,
  },
  iconButtonAttachment: {
    position: 'absolute',
    right: 48,
    bottom: 12,
    zIndex: 1,
  },
  iconButtonViewOnce: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    zIndex: 1,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButton: {
    backgroundColor: isRecording ? '#EF4444' : '#3B82F6',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 16,
    backgroundColor: isDarkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(243, 244, 246, 0.5)',
    borderRadius: 24,
  },
  redDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    marginRight: 8,
  },
  recordingTimer: {
    color: isDarkMode ? '#F9FAFB' : '#1F2937',
    fontSize: 16,
  },
});


export default MessageInput;