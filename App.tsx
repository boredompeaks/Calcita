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
const PANIC_QUEUE_KEY = 'panicQueue';
const PANIC_IN_PROGRESS_KEY = 'panic_in_progress';

// Configure notification handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    // FIX: Added missing properties to conform to NotificationBehavior type.
    shouldShowBanner: true,
    shouldShowList: true,
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
  
  const handleAppStateChangeRef = useRef<((nextAppState: AppStateStatus) => void) | null>(null);

  const handleLock = useCallback(async (shouldSignOut: boolean = false) => {
    setAppState('calculator');
    await AsyncStorage.removeItem(UNLOCKED_KEY);
    if (shouldSignOut) {
        // FIX: Cast supabase.auth to any to bypass incorrect TypeScript error.
        await (supabase.auth as any).signOut();
    }
  }, []);

  const processPanicQueue = useCallback(async () => {
    try {
        const queueStr = await AsyncStorage.getItem(PANIC_QUEUE_KEY);
        if (!queueStr) return;

        let queue: { conversation_id: number; user_id: string }[] = [];
        try {
            // Edge Case: Handle corrupted AsyncStorage data.
            queue = JSON.parse(queueStr);
        } catch (e) {
            console.error("Panic queue is corrupted, clearing it.", e);
            await AsyncStorage.removeItem(PANIC_QUEUE_KEY);
            return;
        }

        if (queue.length === 0) return;

        const item = queue[0]; // Process one at a time
        const { data: messages, error: messagesError } = await supabase
            .from('messages')
            .select('id')
            .eq('conversation_id', item.conversation_id)
            .order('created_at', { ascending: false })
            .limit(20);

        if (messagesError) {
            console.error("Panic Queue: Failed to fetch messages:", messagesError);
            return; // Retry will happen on next app open
        }

        if (messages.length > 0) {
            const hiddenMessagesPayload = messages.map(msg => ({ user_id: item.user_id, message_id: msg.id }));
            const { error: hideError } = await supabase.from('hidden_messages').insert(hiddenMessagesPayload);
            if (hideError) {
                console.error("Panic Queue: Failed to hide messages:", hideError);
                return; // Retry will happen on next app open
            }
        }
        
        // Success, remove item from queue
        const newQueue = queue.slice(1);
        await AsyncStorage.setItem(PANIC_QUEUE_KEY, JSON.stringify(newQueue));

    } catch (e) {
        console.error("Error processing panic queue:", e);
    }
  }, []);

  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    // Edge Case: Handle app returning to foreground.
    if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
      const now = Date.now();
      const bgTime = backgroundedTimeRef.current;
      // Auto-lock if backgrounded for too long, unless screen sharing is active.
      if (bgTime && now - bgTime > LOCK_TIMEOUT_MS && !isScreenSharingRef.current) {
        await handleLock(false); 
      }
      backgroundedTimeRef.current = null;
      // Process offline queues on resume.
      processPanicQueue();
    } 
    // Edge Case: Handle app going to background.
    else if (nextAppState.match(/inactive|background/)) {
        const isUnlocked = await AsyncStorage.getItem(UNLOCKED_KEY);
        if (isUnlocked === 'true' && !isScreenSharingRef.current) {
            backgroundedTimeRef.current = Date.now();
        }
    }
    appStateRef.current = nextAppState;
  };

  useEffect(() => {
    handleAppStateChangeRef.current = handleAppStateChange;
  });

  useEffect(() => {
    // Edge Case: Handle app crash during panic.
    const checkInitialState = async () => {
      const panicInProgress = await AsyncStorage.getItem(PANIC_IN_PROGRESS_KEY);
      if (panicInProgress === 'true') {
        // If app crashed mid-panic, force a secure state on next launch.
        await handleLock(true);
        await AsyncStorage.removeItem(PANIC_IN_PROGRESS_KEY);
      } else {
        // Default to a secure, locked state on every fresh start.
        await AsyncStorage.removeItem(UNLOCKED_KEY);
        setAppState('calculator');
      }
    };
    checkInitialState();

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      handleAppStateChangeRef.current?.(nextAppState);
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(_notification => {});
    responseListener.current = Notifications.addNotificationResponseReceivedListener(_response => {
      handleLock(false); // Lock app if user interacts with a notification
    });

    return () => {
      subscription.remove();
      if (notificationListener.current) notificationListener.current.remove();
      if (responseListener.current) responseListener.current.remove();
    };
  }, [handleLock]);


  const handleUnlock = async () => {
    await AsyncStorage.setItem(UNLOCKED_KEY, 'true');
    // Clear the panic flag only on a successful unlock.
    await AsyncStorage.removeItem(PANIC_IN_PROGRESS_KEY);
    setAppState('chat');
  };
  
  const handlePanic = async (conversation: Conversation | null, user: Profile | null) => {
    if (isPanicking) return;
    setIsPanicking(true);

    // Edge Case: Set a flag in storage. If the app crashes mid-panic,
    // it will force a lock/sign-out on the next launch for security.
    await AsyncStorage.setItem(PANIC_IN_PROGRESS_KEY, 'true');

    // Attempt to hide the last 20 messages immediately.
    try {
        if (conversation && user) {
            const { data: messages, error: messagesError } = await supabase
                .from('messages')
                .select('id')
                .eq('conversation_id', conversation.id)
                .order('created_at', { ascending: false })
                .limit(20);

            if (messagesError) throw messagesError;

            if (messages.length > 0) {
                const hiddenMessagesPayload = messages.map(msg => ({ user_id: user.id, message_id: msg.id }));
                const { error: hideError } = await supabase.from('hidden_messages').insert(hiddenMessagesPayload);
                if (hideError) throw hideError;
            }
        }
    } catch (error) {
        // Edge Case: If hiding messages fails (e.g., user is offline), add the task to a persistent queue.
        // This queue ONLY handles hiding messages, not the diversion.
        console.error("An error occurred during panic, queueing message-hiding action:", error);
        if (conversation && user) {
            try {
                const queueStr = await AsyncStorage.getItem(PANIC_QUEUE_KEY);
                const queue = queueStr ? JSON.parse(queueStr) : [];
                queue.push({ conversation_id: conversation.id, user_id: user.id });
                await AsyncStorage.setItem(PANIC_QUEUE_KEY, JSON.stringify(queue));
            } catch (e) {
                console.error("Failed to write to panic queue:", e);
            }
        }
    } finally {
        // CRITICAL: Lock the app and sign out the user immediately, regardless of whether
        // the message hiding or diversion succeeds. This is the primary security action.
        await handleLock(true);
        
        // Edge Case: Handle diversion URL failure.
        // This is a "fire and forget" operation and is NOT queued for retry.
        try {
            const sites = ['https://www.google.com/', 'https://www.bbc.com/news', 'https://www.wikipedia.org/'];
            const randomSite = sites[Math.floor(Math.random() * sites.length)];
            await Linking.openURL(randomSite);
        } catch (err) {
            // If the diversion fails (e.g., offline, no browser), this is a safe failure.
            // The app will simply remain on the locked calculator screen, which is the secure fallback state.
            // Log the error for debugging, but take no further action. The user is secure.
            console.error("Couldn't load external page for diversion, falling back to shell.", err);
        }
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