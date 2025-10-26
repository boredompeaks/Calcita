import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus, StatusBar, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import CalculatorScreen from './components/CalculatorScreen';
import ChatScreen from './components/ChatScreen';
import { supabase } from './services/supabaseClient';
import { Conversation, Profile } from './types';

const LOCK_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
const UNLOCKED_KEY = 'isUnlocked';

// Configure notification handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const App: React.FC = () => {
  const [appState, setAppState] = useState<'calculator' | 'chat'>('calculator');
  const appStateRef = useRef(AppState.currentState);
  const backgroundedTimeRef = useRef<number | null>(null);
  const [isScreenSharingActive, setIsScreenSharingActive] = useState(false);
  const [isPanicking, setIsPanicking] = useState(false);
  const notificationListener = useRef<{ remove: () => void } | null>(null);
  const responseListener = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    const checkInitialState = async () => {
      await AsyncStorage.removeItem(UNLOCKED_KEY);
      setAppState('calculator');
    };
    checkInitialState();

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Listen for incoming notifications
    notificationListener.current = Notifications.addNotificationReceivedListener(_notification => {
      // Callback is required. Can be used for foreground notification handling.
    });

    // Listen for user tapping on a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(_response => {
      // Regardless of the notification content, force the app to the calculator screen
      handleLock(false);
    });

    return () => {
      subscription.remove();
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  const handleAppStateChange = useCallback(async (nextAppState: AppStateStatus) => {
    // Check for coming to foreground
    if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
      const now = Date.now();
      const bgTime = backgroundedTimeRef.current;
      // Only lock if timeout has passed AND we are not screen sharing
      if (bgTime && now - bgTime > LOCK_TIMEOUT_MS && !isScreenSharingActive) {
        await handleLock(true); // Force sign out on timeout
      }
      backgroundedTimeRef.current = null;
    } 
    // Check for going to background
    else if (nextAppState.match(/inactive|background/)) {
        // If app is in chat mode when backgrounded, start the timer
        const isUnlocked = await AsyncStorage.getItem(UNLOCKED_KEY);
        // Only start the lock timer if we are not screen sharing
        if (isUnlocked === 'true' && !isScreenSharingActive) {
            backgroundedTimeRef.current = Date.now();
        }
    }
    appStateRef.current = nextAppState;
  }, [isScreenSharingActive]);

  const handleUnlock = async () => {
    await AsyncStorage.setItem(UNLOCKED_KEY, 'true');
    setAppState('chat');
  };

  const handleLock = async (shouldSignOut: boolean = false) => {
    setAppState('calculator');
    await AsyncStorage.removeItem(UNLOCKED_KEY);
    if (shouldSignOut) {
        await supabase.auth.signOut();
    }
  };
  
  const handlePanic = async (conversation: Conversation | null, user: Profile | null) => {
    if (isPanicking) return;
    setIsPanicking(true);

    try {
        if (conversation && user) {
            // 1. Get last 20 message IDs in the current conversation
            const { data: messages, error: messagesError } = await supabase
                .from('messages')
                .select('id')
                .eq('conversation_id', conversation.id)
                .order('created_at', { ascending: false })
                .limit(20);

            if (messagesError) {
                console.error("Failed to fetch messages for panic:", messagesError);
            } else if (messages.length > 0) {
                const hiddenMessagesPayload = messages.map(msg => ({ user_id: user.id, message_id: msg.id }));
                const { error: hideError } = await supabase.from('hidden_messages').insert(hiddenMessagesPayload);
                if (hideError) console.error("Failed to hide messages:", hideError);
            }
            
            // 2. Send a final message to alert other user
            await supabase.from('messages').insert({
                content: 'Panic button activated.',
                user_id: user.id,
                conversation_id: conversation.id,
            });
        }
    } catch (error) {
        console.error("An error occurred during the panic sequence:", error);
    } finally {
        // 3. CRITICAL: Lock the UI and sign out, regardless of whether the above steps succeeded.
        await handleLock(true);
        // 4. Open an external website
        const sites = ['https://www.google.com/', 'https://www.bbc.com/news', 'https://www.wikipedia.org/'];
        const randomSite = sites[Math.floor(Math.random() * sites.length)];
        Linking.openURL(randomSite).catch(err => console.error("Couldn't load external page", err));
    }
  };

  return (
    <>
      <StatusBar barStyle="light-content" />
      {appState === 'calculator' ? (
        <CalculatorScreen onUnlock={handleUnlock} />
      ) : (
        <ChatScreen onLock={() => handleLock(true)} onPanic={handlePanic} onSetScreenSharing={setIsScreenSharingActive} />
      )}
    </>
  );
};

export default App;