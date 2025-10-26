import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { SpinnerIcon, CheckCircleIcon } from './icons';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing, FadeIn, FadeOut } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';

// Utility to create a timeout for network requests.
const createTimeout = (ms: number, message: string) => {
    return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));
};

// Utility to convert raw Supabase errors into user-friendly messages.
const getFriendlyErrorMessage = (error: Error): string => {
    const message = error.message.toLowerCase();
    if (message.includes('invalid login credentials')) {
        return 'Incorrect email or password. Please try again.';
    }
    if (message.includes('network request failed') || message.includes('request timed out')) {
        return 'Network error. Please check your connection and try again.';
    }
    if (message.includes('for security reasons')) { // Supabase rate-limit message
        return 'Too many requests. Please try again in a few moments.';
    }
    if (message.includes('email not confirmed')) {
        return 'Please verify your email before signing in. Check your inbox for a confirmation link.';
    }
    if (message.includes('user already registered')) {
        return 'An account with this email already exists. Please sign in.';
    }
    return 'An unexpected error occurred. Please try again.';
}

const Auth: React.FC = () => {
  const [loading, setLoading] = useState<'signin' | 'signup' | 'google' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  const containerOpacity = useSharedValue(0);
  const containerScale = useSharedValue(0.9);
  const titleY = useSharedValue(20);
  const formOpacity = useSharedValue(0);

  const animatedContainerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
    transform: [{ scale: containerScale.value }],
  }));

  const animatedTitleStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: titleY.value }],
  }));
  
  const animatedFormStyle = useAnimatedStyle(() => ({
    opacity: formOpacity.value,
  }));

  useEffect(() => {
    containerOpacity.value = withTiming(1, { duration: 500 });
    containerScale.value = withTiming(1, { duration: 500 });
    titleY.value = withDelay(200, withTiming(0, { duration: 400, easing: Easing.out(Easing.ease) }));
    formOpacity.value = withDelay(400, withTiming(1, { duration: 500 }));
  }, []);

  const handleLogin = async () => {
    setLoading('signin');
    setError(null);
    setShowSuccessMessage(false);
    try {
        // Edge Case: Handle network flaps/offline login with a 10-second timeout.
        const { error: signInError } = await Promise.race([
            // FIX: Cast `supabase.auth` to `any` to bypass incorrect TypeScript error.
            (supabase.auth as any).signInWithPassword({ email, password }),
            createTimeout(10000, "Request timed out. Please check your connection.")
        ]) as { error: Error | null };

        if (signInError) throw signInError;

    } catch (e: any) {
        setError(getFriendlyErrorMessage(e));
    } finally {
        setLoading(null);
    }
  };

  const handleSignUp = async () => {
    setLoading('signup');
    setError(null);
    setShowSuccessMessage(false);
    try {
        // Edge Case: Handle network flaps/offline signup with a 10-second timeout.
        const { error: signUpError } = await Promise.race([
            // FIX: Cast `supabase.auth` to `any` to bypass incorrect TypeScript error.
            (supabase.auth as any).signUp({
                email,
                password,
                options: {
                    data: {
                        name: email.split('@')[0],
                        avatar_url: `https://i.pravatar.cc/150?u=${email}`,
                    },
                }
            }),
            createTimeout(10000, "Request timed out. Please check your connection.")
        ]) as { error: Error | null };
        
        if (signUpError) {
           throw signUpError;
        } else {
            setShowSuccessMessage(true);
        }
    } catch (e: any) {
        setError(getFriendlyErrorMessage(e));
    } finally {
        setLoading(null);
    }
  };
  
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{width: '90%', maxWidth: 400}}>
        <Animated.View style={[styles.container, animatedContainerStyle]}>
          <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
            <Animated.Text style={[styles.title, animatedTitleStyle]}>CalcIta</Animated.Text>
            
            {showSuccessMessage ? (
                <Animated.View key="success" style={styles.successContainer} entering={FadeIn.duration(400)} exiting={FadeOut.duration(400)}>
                    <CheckCircleIcon size={48} color="#10B981" />
                    <Text style={styles.successTitle}>Check your email</Text>
                    <Text style={styles.successMessage}>
                        We've sent a confirmation link to <Text style={{fontWeight: 'bold'}}>{email}</Text>. Please check your inbox to complete the sign up.
                    </Text>
                    <TouchableOpacity onPress={() => setShowSuccessMessage(false)} style={styles.backButton}>
                        <Text style={styles.backButtonText}>Back to Sign In</Text>
                    </TouchableOpacity>
                </Animated.View>
            ) : (
               <Animated.View key="form" style={animatedFormStyle} entering={FadeIn.duration(400)} exiting={FadeOut.duration(400)}>
                  {error && <Text style={styles.errorText}>{error}</Text>}
                  <View style={styles.form}>
                    <View>
                      <Text style={styles.label}>Email</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="email-address"
                        placeholder="your@email.com"
                        placeholderTextColor="#A1A1AA"
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                      />
                    </View>
                    <View>
                      <Text style={styles.label}>Password</Text>
                      <TextInput
                        style={styles.input}
                        secureTextEntry
                        placeholder="••••••••"
                        placeholderTextColor="#A1A1AA"
                        value={password}
                        onChangeText={setPassword}
                      />
                    </View>
                    <View style={styles.buttonGroup}>
                        <TouchableOpacity style={[styles.button, styles.signInButton]} onPress={handleLogin} disabled={!!loading}>
                            {loading === 'signin' ? <SpinnerIcon /> : <Text style={styles.buttonText}>Sign In</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.button, styles.signUpButton]} onPress={handleSignUp} disabled={!!loading}>
                             {loading === 'signup' ? <SpinnerIcon /> : <Text style={styles.buttonText}>Sign Up</Text>}
                        </TouchableOpacity>
                    </View>
                  </View>
               </Animated.View>
            )}
        </Animated.View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
    container: {
        padding: 32,
        borderRadius: 24,
        overflow: 'hidden',
        borderColor: 'rgba(255, 255, 255, 0.2)',
        borderWidth: 1,
    },
    title: {
        fontSize: 40,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 24,
        color: '#F9FAFB',
    },
    errorText: {
        backgroundColor: 'rgba(239, 68, 68, 0.5)',
        color: 'white',
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
        textAlign: 'center',
    },
    form: {
        gap: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 4,
        color: '#A1A1AA',
    },
    input: {
        width: '100%',
        padding: 12,
        borderRadius: 8,
        backgroundColor: 'rgba(39, 39, 42, 0.8)',
        borderColor: 'rgba(63, 63, 70, 0.8)',
        borderWidth: 1,
        color: '#F9FAFB',
    },
    buttonGroup: {
        flexDirection: 'row',
        gap: 8,
    },
    button: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    signInButton: {
        backgroundColor: '#3B82F6',
    },
    signUpButton: {
        backgroundColor: '#10B981',
    },
    buttonText: {
        color: 'white',
        fontWeight: '600',
    },
    successContainer: {
        alignItems: 'center',
        padding: 16,
    },
    successTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#F9FAFB',
        marginTop: 16,
        marginBottom: 8,
    },
    successMessage: {
        fontSize: 15,
        color: '#D4D4D8',
        textAlign: 'center',
        lineHeight: 22,
    },
    backButton: {
        marginTop: 24,
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderColor: 'rgba(255, 255, 255, 0.2)',
        borderWidth: 1,
    },
    backButtonText: {
        color: '#F9FAFB',
        fontWeight: '600',
        textAlign: 'center',
    },
});

export default Auth;