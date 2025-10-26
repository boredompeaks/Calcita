import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Image, Pressable } from 'react-native';
import { RTCView, MediaStream } from 'react-native-webrtc';
import { Conversation } from '../types';
import { MicIcon, MicOffIcon, VideoIcon, VideoOffIcon, MonitorIcon, PhoneOffIcon } from './icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { WebRTCManager } from '../services/webrtcService';
import PanicButton from './PanicButton';

interface VideoCallViewProps {
  onEndCall: () => void;
  conversation: Conversation;
  currentUserId: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  webRTCManager: WebRTCManager;
  onPanic: () => void;
  onScreenShareChange: (isSharing: boolean) => void;
  onToggleLocalAudio: () => void;
  onToggleLocalVideo: () => void;
  localMediaState: { isMicMuted: boolean; isCameraOff: boolean; };
  remoteMediaState: { isMicMuted: boolean; isCameraOff: boolean; };
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const ControlButton: React.FC<{onPress: () => void, style?: any, children: React.ReactNode, accessibilityLabel: string}> = ({ onPress, style, children, accessibilityLabel }) => {
    const scale = useSharedValue(1);
    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }]
    }));
    
    const handlePressIn = () => { scale.value = withSpring(0.9); };
    const handlePressOut = () => { scale.value = withSpring(1); };

    return (
        <AnimatedPressable
            onPress={onPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            accessibilityLabel={accessibilityLabel}
            style={[styles.controlButton, style, animatedStyle]}
        >
            {children}
        </AnimatedPressable>
    )
}

const VideoCallView: React.FC<VideoCallViewProps> = ({ onEndCall, conversation, currentUserId, localStream, remoteStream, webRTCManager, onPanic, onScreenShareChange, onToggleLocalAudio, onToggleLocalVideo, localMediaState, remoteMediaState }) => {
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const otherUser = useMemo(() => {
    return conversation.participants.find(p => p.id !== currentUserId);
  }, [conversation, currentUserId]);

  const localStreamUrl = localStream?.toURL();
  const remoteStreamUrl = remoteStream?.toURL();
  
  const controlsAnim = useSharedValue(0);
  useEffect(() => {
    controlsAnim.value = withTiming(1, { duration: 300 });
  }, []);
  const animatedControlsStyle = useAnimatedStyle(() => {
    return {
        opacity: controlsAnim.value,
        transform: [{ translateY: (1 - controlsAnim.value) * 100 }],
    };
  });
  
  const handleToggleScreenShare = async () => {
    const sharing = await webRTCManager.toggleScreenShare();
    setIsScreenSharing(sharing);
    onScreenShareChange(sharing);
    if(sharing && localMediaState.isCameraOff) {
      onToggleLocalVideo();
    }
  };

  const mainStreamUrl = isScreenSharing ? localStreamUrl : remoteStreamUrl;
  const pipStreamUrl = isScreenSharing ? remoteStreamUrl : localStreamUrl;
  const isPipMirrored = !isScreenSharing;

  return (
    <SafeAreaView style={styles.container}>
      {mainStreamUrl ? (
          <View style={StyleSheet.absoluteFill}>
            <RTCView 
                streamURL={mainStreamUrl} 
                style={styles.remoteVideo} 
                objectFit={isScreenSharing ? "contain" : "cover"}
            />
            {!isScreenSharing && remoteMediaState.isCameraOff && (
                <View style={styles.remoteCameraOffOverlay}>
                    <VideoOffIcon size={64} color="#FFF" />
                    <Text style={styles.placeholderText}>{otherUser?.name}'s camera is off</Text>
                </View>
            )}
          </View>
      ) : (
          <View style={styles.remoteVideoPlaceholder}>
            <Image source={{ uri: otherUser?.avatar_url }} style={styles.avatar} />
            <Text style={styles.placeholderText}>Connecting to {otherUser?.name}...</Text>
          </View>
      )}

      {pipStreamUrl && (
        <View style={styles.localVideoContainer}>
            <RTCView 
              streamURL={pipStreamUrl}
              style={styles.localVideo} 
              objectFit="cover"
              mirror={isPipMirrored}
            />
            {!isScreenSharing && localMediaState.isCameraOff && (
                <View style={styles.cameraOffOverlay}>
                    <VideoOffIcon size={48} color="#FFF" />
                </View>
            )}
        </View>
      )}

      <Animated.View style={[styles.controlsContainer, animatedControlsStyle]}>
        <ControlButton onPress={handleToggleScreenShare} accessibilityLabel={isScreenSharing ? "Stop screen sharing" : "Start screen sharing"}>
          <MonitorIcon color={isScreenSharing ? '#3B82F6' : '#FFF'} />
        </ControlButton>
        <ControlButton onPress={onToggleLocalAudio} accessibilityLabel={localMediaState.isMicMuted ? "Unmute microphone" : "Mute microphone"}>
          {localMediaState.isMicMuted ? <MicOffIcon color="#FFF" /> : <MicIcon color="#FFF" />}
        </ControlButton>
        <ControlButton onPress={onToggleLocalVideo} accessibilityLabel={localMediaState.isCameraOff ? "Turn camera on" : "Turn camera off"}>
          {localMediaState.isCameraOff || isScreenSharing ? <VideoOffIcon color="#FFF" /> : <VideoIcon color="#FFF" />}
        </ControlButton>
        <ControlButton style={styles.endCallButton} onPress={onEndCall} accessibilityLabel="End call">
          <PhoneOffIcon color="#FFF" />
        </ControlButton>
      </Animated.View>
      <PanicButton onPanic={onPanic} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', justifyContent: 'flex-end', alignItems: 'center' },
  remoteVideo: { width: '100%', height: '100%' },
  remoteCameraOffOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  remoteVideoPlaceholder: { position: 'absolute', width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  avatar: { width: 120, height: 120, borderRadius: 60, marginBottom: 16 },
  placeholderText: { color: '#FFF', fontSize: 18, fontWeight: '600', marginTop: 8 },
  localVideoContainer: { position: 'absolute', top: 60, right: 20, width: 120, height: 180, borderRadius: 12, overflow: 'hidden', borderColor: 'rgba(255,255,255,0.3)', borderWidth: 1, backgroundColor: '#000' },
  localVideo: { width: '100%', height: '100%' },
  cameraOffOverlay: { position: 'absolute', width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  controlsContainer: { flexDirection: 'row', backgroundColor: 'rgba(0, 0, 0, 0.5)', padding: 20, borderRadius: 30, marginBottom: 40, gap: 16 },
  controlButton: { backgroundColor: 'rgba(255, 255, 255, 0.2)', padding: 16, borderRadius: 999 },
  endCallButton: { backgroundColor: '#EF4444' },
});

export default VideoCallView;