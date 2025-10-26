import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image, Pressable, SafeAreaView } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';
import { Profile } from '../types';
import { CallIcon, PhoneOffIcon } from './icons';

interface IncomingCallModalProps {
  caller: Profile;
  onAccept: () => void;
  onDecline: () => void;
}

const IncomingCallModal: React.FC<IncomingCallModalProps> = ({ caller, onAccept, onDecline }) => {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1.05, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    return () => cancelAnimation(pulse);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  return (
    <View style={styles.overlay}>
      <SafeAreaView style={styles.container}>
        <Text style={styles.callerName}>{caller.name}</Text>
        <Text style={styles.callStatus}>Incoming Call...</Text>
        
        <Animated.View style={[styles.avatarContainer, animatedStyle]}>
          <Image source={{ uri: caller.avatar_url }} style={styles.avatar} />
        </Animated.View>

        <View style={styles.controls}>
          <View style={styles.controlButtonWrapper}>
            <Pressable style={[styles.controlButton, styles.declineButton]} onPress={onDecline}>
              <PhoneOffIcon size={32} color="#FFF" />
            </Pressable>
            <Text style={styles.buttonLabel}>Decline</Text>
          </View>
          <View style={styles.controlButtonWrapper}>
            <Pressable style={[styles.controlButton, styles.acceptButton]} onPress={onAccept}>
              <CallIcon size={32} color="#FFF" />
            </Pressable>
            <Text style={styles.buttonLabel}>Accept</Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.85)',
    zIndex: 9999,
  },
  container: {
    flex: 1,
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: 20,
  },
  callerName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFF',
    textAlign: 'center',
  },
  callStatus: {
    fontSize: 18,
    color: '#A1A1AA',
    marginTop: 8,
  },
  avatarContainer: {
    // For pulse effect
  },
  avatar: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  controlButtonWrapper: {
    alignItems: 'center',
  },
  controlButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  declineButton: {
    backgroundColor: '#EF4444',
  },
  acceptButton: {
    backgroundColor: '#22C55E',
  },
  buttonLabel: {
    color: '#FFF',
    fontSize: 16,
  },
});

export default IncomingCallModal;