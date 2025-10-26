import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { SpinnerIcon, CheckCircleIcon } from './icons';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/AntDesign';

const Auth: React.FC = () => {
  const [loading, setLoading] = useState<'signin' | 'signup' | 'google' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  const handleLogin = async () => {
    setLoading('signin');
    setError(null);
    setShowSuccessMessage(false);
    try {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setError(error.message);
    } catch (e: any) {
        setError(e.message || 'An unexpected error occurred during sign in.');
    } finally {
        setLoading(null);
    }
  };

  const handleSignUp = async () => {
    setLoading('signup');
    setError(null);
    setShowSuccessMessage(false);
    try {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: email.split('@')[0],
              avatar_url: `https://i.pravatar.cc/150?u=${email}`,
            },
          },
        });
        if (error) {
            if (error.message.includes('User already registered')) {
                setError('An account with this email already exists. Please sign in.');
            } else {
                setError(error.message);
            }
        } else {
            setShowSuccessMessage(true);
        }
    } catch (e: any) {
        setError(e.message || 'An unexpected error occurred during sign up.');
    } finally {
        setLoading(null);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading('google');
    setError(null);
    setShowSuccessMessage(false);
    try {
        const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
        if (error) {
          setError(error.message);
        }
    } catch (e: any) {
        setError(e.message || 'An unexpected error occurred during Google sign in.');
    } finally {
        setLoading(null);
    }
  };
  
  const renderFormContent = () => {
    if (showSuccessMessage) {
        return (
            <View style={styles.successContainer}>
                <CheckCircleIcon size={48} color="#10B981" />
                <Text style={styles.successTitle}>Check your email</Text>
                <Text style={styles.successMessage}>
                    We've sent a confirmation link to <Text style={{fontWeight: 'bold'}}>{email}</Text>. Please check your inbox to complete the sign up.
                </Text>
                <TouchableOpacity onPress={() => setShowSuccessMessage(false)} style={styles.backButton}>
                    <Text style={styles.backButtonText}>Back to Sign In</Text>
                </TouchableOpacity>
            </View>
        );
    }
    
    return (
       <>
          {error && <Text style={styles.errorText}>{error}</Text>}
          <View style={styles.form}>
            <View>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                keyboardType="email-address"
                placeholder="your@email.com"
                placeholderTextColor="#9CA3AF"
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
                placeholderTextColor="#9CA3AF"
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
    
          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.divider} />
          </View>
    
          <TouchableOpacity onPress={handleGoogleLogin} style={styles.googleButton} disabled={!!loading}>
            {loading === 'google' ? <SpinnerIcon /> : <Icon name="google" size={20} color="#4B5563" />}
            <Text style={styles.googleButtonText}>Sign in with Google</Text>
          </TouchableOpacity>
       </>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CalcIta</Text>
      {renderFormContent()}
    </View>
  );
};

const styles = StyleSheet.create({
    container: {
        width: '90%',
        maxWidth: 400,
        padding: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
        borderColor: 'rgba(255, 255, 255, 0.2)',
        borderWidth: 1,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 24,
        color: '#1F2937',
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
        color: '#374151',
    },
    input: {
        width: '100%',
        padding: 12,
        borderRadius: 8,
        backgroundColor: 'rgba(243, 244, 246, 0.5)',
        borderColor: 'rgba(209, 213, 219, 0.5)',
        borderWidth: 1,
        color: '#1F2937',
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
    dividerContainer: {
        marginVertical: 24,
        flexDirection: 'row',
        alignItems: 'center',
    },
    divider: {
        flex: 1,
        height: 1,
        backgroundColor: 'rgba(156, 163, 175, 0.5)',
    },
    dividerText: {
        marginHorizontal: 16,
        fontSize: 14,
        color: '#4B5563',
    },
    googleButton: {
        paddingVertical: 12,
        borderRadius: 8,
        backgroundColor: '#FFFFFF',
        borderColor: '#D1D5DB',
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    googleButtonText: {
        color: '#374151',
        fontWeight: '600',
        marginLeft: 8,
    },
    successContainer: {
        alignItems: 'center',
        padding: 16,
    },
    successTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#1F2937',
        marginTop: 16,
        marginBottom: 8,
    },
    successMessage: {
        fontSize: 15,
        color: '#374151',
        textAlign: 'center',
        lineHeight: 22,
    },
    backButton: {
        marginTop: 24,
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.5)',
        borderColor: 'rgba(209, 213, 219, 0.7)',
        borderWidth: 1,
    },
    backButtonText: {
        color: '#374151',
        fontWeight: '600',
        textAlign: 'center',
    },
});

export default Auth;