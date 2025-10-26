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
  // FIX: Added missing properties to the returned object to conform to the NotificationBehavior type.
  // The version of expo-notifications in this project requires these properties to be explicitly set.
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const App: React.FC = () => {
  const [appState, setAppState] = useState<'calculator' | 'chat'>('calculator');
  const appStateRef = useRef(AppState.currentState);
  const backgroundedTimeRef = useRef<number | null>(null);
  const [isScreenSharingActive, setIsScreenSharingActive] = useState(false);
  const isScreenSharingRef = useRef(isScreenSharingActive);
  const [isPanicking, setIsPanicking] = useState(false);
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    isScreenSharingRef.current = isScreenSharingActive;
  }, [isScreenSharingActive]);
  
  // This ref pattern ensures the AppState listener always has the latest function
  // without needing to re-subscribe on every render.
  const handleAppStateChangeRef = useRef<((nextAppState: AppStateStatus) => void) | null>(null);

  const handleLock = useCallback(async (shouldSignOut: boolean = false) => {
    setAppState('calculator');
    await AsyncStorage.removeItem(UNLOCKED_KEY);
    if (shouldSignOut) {
        await supabase.auth.signOut();
    }
  }, []);

  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
      const now = Date.now();
      const bgTime = backgroundedTimeRef.current;
      if (bgTime && now - bgTime > LOCK_TIMEOUT_MS && !isScreenSharingRef.current) {
        await handleLock(true); 
      }
      backgroundedTimeRef.current = null;
    } 
    else if (nextAppState.match(/inactive|background/)) {
        const isUnlocked = await AsyncStorage.getItem(UNLOCKED_KEY);
        if (isUnlocked === 'true' && !isScreenSharingRef.current) {
            backgroundedTimeRef.current = Date.now();
        }
    }
    appStateRef.current = nextAppState;
  };

  // Keep the ref updated with the latest handler function
  useEffect(() => {
    handleAppStateChangeRef.current = handleAppStateChange;
  });

  useEffect(() => {
    const checkInitialState = async () => {
      await AsyncStorage.removeItem(UNLOCKED_KEY);
      setAppState('calculator');
    };
    checkInitialState();

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      handleAppStateChangeRef.current?.(nextAppState);
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(_notification => {
      // Required callback
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(_response => {
      handleLock(false);
    });

    return () => {
      subscription.remove();
      // FIX: The 'removeNotificationSubscription' method is deprecated.
      // The correct way to remove a listener is by calling .remove() on the subscription object.
      if (notificationListener.current) notificationListener.current.remove();
      // FIX: The 'removeNotificationSubscription' method is deprecated.
      // The correct way to remove a listener is by calling .remove() on the subscription object.
      if (responseListener.current) responseListener.current.remove();
    };
  }, [handleLock]);


  const handleUnlock = async () => {
    await AsyncStorage.setItem(UNLOCKED_KEY, 'true');
    setAppState('chat');
  };
  
  const handlePanic = async (conversation: Conversation | null, user: Profile | null) => {
    if (isPanicking) return;
    setIsPanicking(true);

    try {
        if (conversation && user) {
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
            
            await supabase.from('messages').insert({
                content: 'Panic button activated.',
                user_id: user.id,
                conversation_id: conversation.id,
            });
        }
    } catch (error) {
        console.error("An error occurred during the panic sequence:", error);
    } finally {
        await handleLock(true);
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