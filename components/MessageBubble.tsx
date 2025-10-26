import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Image, Pressable, TouchableOpacity, Linking, Modal, Dimensions, NativeSyntheticEvent, NativeTouchEvent, Platform, UIManager } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, FadeIn } from 'react-native-reanimated';
import { Message, Profile, Reaction } from '../types';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { CheckIcon, ClockIcon, AlertTriangleIcon, CheckAllIcon, ReplyIcon, ForwardIcon, StarIcon, StarOutlineIcon, XIcon, PlayIcon, PauseIcon, ViewOnceIcon, PhoneOffIcon } from './icons';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Voice Note Player Component
const VoiceNotePlayer: React.FC<{ uri: string; duration: number; isCurrentUser: boolean, isDarkMode: boolean }> = ({ uri, duration, isCurrentUser, isDarkMode }) => {
    const sound = useRef(new Audio.Sound());
    const [isPlaying, setIsPlaying] = useState(false);
    const [position, setPosition] = useState(0);

    useEffect(() => {
        const loadSound = async () => {
            try {
                await sound.current.loadAsync({ uri });
                sound.current.setOnPlaybackStatusUpdate(onPlaybackStatusUpdate);
            } catch (error) {
                console.error("Failed to load sound", error);
            }
        };
        loadSound();
        return () => {
            sound.current.unloadAsync();
        };
    }, [uri]);

    const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
        if (status.isLoaded) {
            setPosition(status.positionMillis);
            if (status.didJustFinish) {
                setIsPlaying(false);
                sound.current.setPositionAsync(0);
            }
        }
    };

    const handlePlayPause = async () => {
        if (isPlaying) {
            await sound.current.pauseAsync();
        } else {
            await sound.current.playAsync();
        }
        setIsPlaying(!isPlaying);
    };
    
    const formatTime = (millis: number) => {
      const totalSeconds = millis / 1000;
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = Math.floor(totalSeconds % 60);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const styles = getStyles(isCurrentUser, isDarkMode);

    return (
        <View style={styles.voiceNoteContainer}>
            <TouchableOpacity onPress={handlePlayPause}>
                {isPlaying ? <PauseIcon color={isCurrentUser ? '#FFF' : (isDarkMode ? '#F9FAFB' : '#1F2937')} /> : <PlayIcon color={isCurrentUser ? '#FFF' : (isDarkMode ? '#F9FAFB' : '#1F2937')} />}
            </TouchableOpacity>
            <View style={styles.voiceNoteTrack}>
                <View style={[styles.voiceNoteProgress, { width: `${(position / (duration * 1000)) * 100}%` }]} />
            </View>
            <Text style={styles.voiceNoteDuration}>{formatTime(position)} / {formatTime(duration*1000)}</Text>
        </View>
    );
};


interface MessageBubbleProps {
  message: Message & { reactions?: Reaction[], starred?: boolean };
  sender?: Profile;
  isCurrentUser: boolean;
  currentUserId: string;
  onAddReaction: (messageId: number, emoji: string) => void;
  onRemoveReaction: (reactionId: number, messageId: number) => void;
  onForward: (message: Message) => void;
  onStar: (messageId: number) => void;
  onUnstar: (messageId: number) => void;
  onViewOnceMessage: (message: Message) => Promise<boolean>;
  searchTerm: string;
  onReply: (message: Message) => void;
  repliedMessage?: Message & { sender?: Profile };
  isDarkMode: boolean;
  onRetry: (tempId: string) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = (props) => {
  const { message, sender, isCurrentUser, currentUserId, onAddReaction, onRemoveReaction, onForward, onStar, onUnstar, onViewOnceMessage, searchTerm, onReply, repliedMessage, isDarkMode, onRetry } = props;
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [isOpened, setIsOpened] = useState(false);
  const styles = getStyles(isCurrentUser, isDarkMode);
  
  const menuScale = useSharedValue(0);
  const menuAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: menuScale.value }]
  }));

  const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉', '💯', '👏', '🤔', '🤯'];

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isImage = message.media_type?.startsWith('image/');
  const isAudio = message.media_type?.startsWith('audio/');
  
  const aggregatedReactions = useMemo(() => {
    if (!message.reactions) return [];
    const counts: Record<string, { count: number, users: string[], reaction_id?: number }> = {};
    for (const reaction of message.reactions) {
        if (!counts[reaction.emoji]) {
            counts[reaction.emoji] = { count: 0, users: [] };
        }
        counts[reaction.emoji].count++;
        counts[reaction.emoji].users.push(reaction.user_id);
        if(reaction.user_id === currentUserId) {
            counts[reaction.emoji].reaction_id = reaction.id;
        }
    }
    return Object.entries(counts).map(([emoji, data]) => ({ emoji, ...data }));
  }, [message.reactions, currentUserId]);
  
  const closeMenu = () => {
      menuScale.value = withSpring(0, { damping: 20, stiffness: 300 });
      setTimeout(() => setMenuVisible(false), 200);
  }

  const handleReactionClick = (emoji: string) => {
    const existingReaction = aggregatedReactions.find(r => r.emoji === emoji && r.users.includes(currentUserId));
    if (existingReaction && existingReaction.reaction_id && typeof message.id === 'number') {
        onRemoveReaction(existingReaction.reaction_id, message.id);
    } else if (typeof message.id === 'number') {
        onAddReaction(message.id, emoji);
    }
    closeMenu();
  }

  const handleStarClick = () => {
    if (typeof message.id !== 'number') return;
    if (message.starred) {
        onUnstar(message.id);
    } else {
        onStar(message.id);
    }
    closeMenu();
  }
  
  const handleLongPress = (event: NativeSyntheticEvent<NativeTouchEvent>) => {
    // Disable long press for pending/failed messages
    if (typeof message.id === 'string' || message.status === 'pending' || message.status === 'failed') {
      return;
    }

    const { pageX, pageY } = event.nativeEvent;
    const screenWidth = Dimensions.get('window').width;
    const menuWidth = 240;

    const x = pageX + menuWidth > screenWidth ? screenWidth - menuWidth - 10 : pageX;
    const y = pageY;
    
    setMenuPosition({ x, y });
    setMenuVisible(true);
    menuScale.value = withSpring(1, { damping: 15, stiffness: 200 });
  };

  const handleViewOncePress = async () => {
    setIsOpened(true); // Optimistically show the content
    const success = await onViewOnceMessage(message);
    if (!success) {
      setIsOpened(false); // Revert if the server call fails
    }
  };
  
  const handlePress = () => {
    if (message.status === 'failed' && typeof message.id === 'string') {
        onRetry(message.id);
    }
  };


  const renderContentWithHighlight = () => {
    if (!message.content || !searchTerm) {
        return <Text style={styles.contentText}>{message.content}</Text>;
    }
    const parts = message.content.split(new RegExp(`(${searchTerm})`, 'gi'));
    return (
        <Text style={styles.contentText}>
            {parts.map((part, index) => 
                part.toLowerCase() === searchTerm.toLowerCase() ? (
                    <Text key={index} style={styles.highlightText}>{part}</Text>
                ) : (
                    part
                )
            )}
        </Text>
    );
  };

  const isGroupMessage = sender !== undefined;
  const isViewOnceAndUnopened = message.is_view_once && !isCurrentUser && !isOpened;
  const senderName = sender?.name || 'Unknown User';
  const repliedSenderName = repliedMessage?.sender?.id === currentUserId ? 'You' : (repliedMessage?.sender?.name || 'Unknown User');

  const renderDeliveryStatus = () => {
    if (!isCurrentUser) return null;

    const iconStyle = { marginLeft: 4 };
    const pendingColor = isDarkMode ? '#9CA3AF' : '#D1D5DB';
    
    if (message.status === 'pending') {
      return <ClockIcon size={16} style={iconStyle} color={pendingColor} />;
    }
    if (message.status === 'failed') {
      return <AlertTriangleIcon size={16} style={iconStyle} color="#F87171" />;
    }
    if (message.read_at) {
      return <CheckAllIcon size={16} style={iconStyle} color={isDarkMode ? '#60A5FA' : '#3B82F6'} />;
    }
    if (typeof message.id === 'number') { // Only show sent check if it's a real message
      return <CheckIcon size={16} style={iconStyle} color={pendingColor} />;
    }
    
    return null;
  }
  
  if (message.message_type === 'system') {
    return (
        <View style={styles.systemMessageContainer}>
            <PhoneOffIcon size={14} color={isDarkMode ? '#9CA3AF' : '#6B7280'} style={{ marginRight: 8 }} />
            <Text style={styles.systemMessageText}>{message.content}</Text>
        </View>
    );
  }

  const renderMessageContent = () => (
    <>
       {repliedMessage && (
        <View style={styles.replyContainer}>
            <View style={styles.replyBorder} />
            <View style={styles.replyContent}>
                <Text style={styles.replySenderName}>{repliedSenderName}</Text>
                <Text style={styles.replyText} numberOfLines={1}>{repliedMessage.content || 'Media'}</Text>
            </View>
        </View>
      )}
      {message.forwarded_from_name && (
        <View style={styles.forwardedContainer}>
          <ForwardIcon size={14} color={isCurrentUser ? '#BFDBFE' : (isDarkMode ? '#9CA3AF' : '#6B7280')} />
          <Text style={styles.forwardedText}>Forwarded from {message.forwarded_from_name}</Text>
        </View>
      )}
      {message.media_url && isImage && (
        <TouchableOpacity onPress={() => Linking.openURL(message.media_url!)}>
          <Image source={{ uri: message.media_url }} style={styles.mediaImage} />
        </TouchableOpacity>
      )}
      {message.media_url && isAudio && message.media_duration && (
        <VoiceNotePlayer uri={message.media_url} duration={message.media_duration} isCurrentUser={isCurrentUser} isDarkMode={isDarkMode} />
      )}
      {message.content && renderContentWithHighlight()}
      
      <View style={styles.footer}>
        {isCurrentUser && message.is_view_once && (
            <ViewOnceIcon size={14} color={isCurrentUser ? '#BFDBFE' : (isDarkMode ? '#9CA3AF' : '#6B7280')} style={{marginRight: 4}} />
        )}
        <Text style={styles.timestamp}>{formatTimestamp(message.created_at)}</Text>
        {renderDeliveryStatus()}
      </View>
    </>
  );

  return (
    <View style={styles.outerContainer}>
        {isGroupMessage && !isCurrentUser && <Text style={styles.senderName}>{senderName}</Text>}
        
        <Modal
            transparent={true}
            visible={menuVisible}
            onRequestClose={closeMenu}
            animationType="fade"
        >
            <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu}>
                <Animated.View style={[styles.menuContainer, { top: menuPosition.y, left: menuPosition.x }, menuAnimatedStyle]}>
                    <View style={styles.reactionPicker}>
                        {REACTION_EMOJIS.map(emoji => (
                          <TouchableOpacity key={emoji} onPress={() => handleReactionClick(emoji)} style={styles.pickerEmoji}>
                              <Text style={{ fontSize: 24 }}>{emoji}</Text>
                          </TouchableOpacity>
                        ))}
                    </View>
                    <View style={styles.actionsMenu}>
                        <TouchableOpacity style={styles.menuAction} onPress={() => { onReply(message); closeMenu(); }}>
                            <Text style={styles.menuText}>Reply</Text>
                            <ReplyIcon color={isDarkMode ? '#FFF' : '#000'} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.menuAction} onPress={() => { onForward(message); closeMenu(); }}>
                            <Text style={styles.menuText}>Forward</Text>
                            <ForwardIcon color={isDarkMode ? '#FFF' : '#000'} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.menuAction} onPress={handleStarClick}>
                            <Text style={styles.menuText}>{message.starred ? 'Unstar' : 'Star'}</Text>
                            {message.starred ? <StarIcon /> : <StarOutlineIcon color={isDarkMode ? '#FFF' : '#000'}/>}
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </Pressable>
        </Modal>

        <Pressable onLongPress={isViewOnceAndUnopened ? undefined : handleLongPress} onPress={handlePress} style={styles.container}>
            {isViewOnceAndUnopened ? (
                 <TouchableOpacity style={styles.bubble} onPress={handleViewOncePress}>
                    <View style={styles.viewOncePlaceholder}>
                        <ViewOnceIcon size={24} color={isCurrentUser ? '#FFF' : (isDarkMode ? '#F9FAFB' : '#1F2937')} />
                        <Text style={styles.viewOnceText}>View Once</Text>
                    </View>
                 </TouchableOpacity>
            ) : (
                <View style={[styles.bubble, message.status === 'pending' && styles.pendingBubble, message.status === 'failed' && styles.failedBubble]}>
                   {renderMessageContent()}
                   {message.status === 'failed' && <Text style={styles.failedText}>Message failed. Tap to retry.</Text>}
                </View>
            )}

            {aggregatedReactions.length > 0 && !isViewOnceAndUnopened && (
                <View style={styles.reactionsContainer}>
                    {aggregatedReactions.map(({ emoji, count, reaction_id }) => (
                        <Animated.View key={emoji} entering={FadeIn.duration(200).springify()}>
                          <TouchableOpacity onPress={() => handleReactionClick(emoji)} style={[styles.reaction, reaction_id && styles.userReacted]}>
                              <Text>{emoji}</Text> 
                              <Text style={styles.reactionCount}>{count}</Text>
                          </TouchableOpacity>
                        </Animated.View>
                    ))}
                </View>
            )}
        </Pressable>
    </View>
  );
};

const getStyles = (isCurrentUser: boolean, isDarkMode: boolean) => StyleSheet.create({
    outerContainer: {
        alignItems: isCurrentUser ? 'flex-end' : 'flex-start',
        marginVertical: 4,
    },
    senderName: {
        fontSize: 12,
        color: isDarkMode ? '#9CA3AF' : '#6B7280',
        marginBottom: 4,
        marginLeft: 12,
    },
    container: {
        alignItems: isCurrentUser ? 'flex-end' : 'flex-start',
    },
    bubble: {
        backgroundColor: isCurrentUser ? '#3B82F6' : (isDarkMode ? '#374151' : '#E5E7EB'),
        borderRadius: 16,
        paddingVertical: 8,
        paddingHorizontal: 12,
        maxWidth: '80%',
    },
    pendingBubble: {
        opacity: 0.7,
    },
    failedBubble: {
        backgroundColor: isCurrentUser ? '#991B1B' : '#FECACA',
        borderColor: '#F87171',
        borderWidth: 1,
    },
    failedText: {
        color: isCurrentUser ? '#FEE2E2' : '#991B1B',
        fontSize: 12,
        marginTop: 4,
        alignSelf: 'flex-start',
    },
    contentText: {
        color: isCurrentUser ? '#FFFFFF' : (isDarkMode ? '#F9FAFB' : '#1F2937'),
        fontSize: 15,
    },
    highlightText: {
        backgroundColor: isDarkMode ? '#FBBF24' : '#FDE68A',
        color: '#000',
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginTop: 4,
        marginLeft: 16,
    },
    timestamp: {
        fontSize: 12,
        color: isCurrentUser ? '#BFDBFE' : (isDarkMode ? '#9CA3AF' : '#6B7280'),
    },
    mediaImage: {
        width: 200,
        height: 200,
        borderRadius: 12,
        marginBottom: 8,
    },
    reactionsContainer: {
        flexDirection: 'row',
        marginTop: -8,
        marginLeft: isCurrentUser ? 0 : 10,
        marginRight: isCurrentUser ? 10 : 0,
        alignSelf: isCurrentUser ? 'flex-end' : 'flex-start',
        flexWrap: 'wrap',
    },
    reaction: {
        backgroundColor: isDarkMode ? '#4B5563' : '#F3F4F6',
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 2,
        marginHorizontal: 2,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'transparent',
        marginTop: 4,
    },
    userReacted: {
        borderColor: '#3B82F6',
        backgroundColor: isDarkMode ? '#2563EB' : '#BFDBFE'
    },
    reactionCount: {
        marginLeft: 4,
        fontSize: 12,
        color: isDarkMode ? '#D1D5DB' : '#4B5563'
    },
    menuContainer: {
        position: 'absolute',
        backgroundColor: isDarkMode ? '#27272A' : '#fff',
        borderRadius: 12,
        elevation: 10,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 10,
        width: 240,
    },
    reactionPicker: {
        flexDirection: 'row',
        padding: 8,
        borderBottomWidth: 1,
        borderColor: isDarkMode ? '#3F3F46' : '#E5E7EB',
        justifyContent: 'space-around',
        flexWrap: 'wrap',
    },
    pickerEmoji: {
        padding: 4,
        margin: 2,
        borderRadius: 8,
    },
    actionsMenu: {
        padding: 8,
    },
    menuAction: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
    },
    menuText: {
        color: isDarkMode ? '#FFF' : '#000',
        fontSize: 16,
    },
    forwardedContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
        opacity: 0.8,
    },
    forwardedText: {
        fontSize: 12,
        fontStyle: 'italic',
        marginLeft: 4,
        color: isCurrentUser ? '#BFDBFE' : (isDarkMode ? '#9CA3AF' : '#6B7280'),
    },
    voiceNoteContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        width: 220,
        paddingVertical: 4,
    },
    voiceNoteTrack: {
        flex: 1,
        height: 4,
        backgroundColor: isCurrentUser ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)',
        borderRadius: 2,
        marginHorizontal: 8,
    },
    voiceNoteProgress: {
        height: '100%',
        backgroundColor: isCurrentUser ? '#FFF' : '#3B82F6',
        borderRadius: 2,
    },
    voiceNoteDuration: {
        fontSize: 12,
        color: isCurrentUser ? '#BFDBFE' : (isDarkMode ? '#9CA3AF' : '#6B7280'),
        minWidth: 70,
    },
    viewOncePlaceholder: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
    },
    viewOnceText: {
        marginLeft: 8,
        fontSize: 16,
        fontWeight: 'bold',
        color: isCurrentUser ? '#FFFFFF' : (isDarkMode ? '#F9FAFB' : '#1F2937'),
    },
    replyContainer: {
        backgroundColor: isCurrentUser ? 'rgba(255, 255, 255, 0.1)' : (isDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.05)'),
        borderRadius: 8,
        paddingLeft: 12,
        marginBottom: 8,
        flexDirection: 'row',
    },
    replyBorder: {
        width: 4,
        backgroundColor: isCurrentUser ? '#93C5FD' : '#60A5FA',
        borderTopLeftRadius: 4,
        borderBottomLeftRadius: 4,
    },
    replyContent: {
        paddingVertical: 8,
        paddingHorizontal: 8,
        flex: 1,
    },
    replySenderName: {
        fontWeight: 'bold',
        color: isCurrentUser ? '#FFFFFF' : (isDarkMode ? '#F9FAFB' : '#1F2937'),
        fontSize: 13,
    },
    replyText: {
        color: isCurrentUser ? '#E5E7EB' : (isDarkMode ? '#D1D5DB' : '#4B5563'),
        fontSize: 13,
        marginTop: 2,
    },
    systemMessageContainer: {
        alignSelf: 'center',
        backgroundColor: isDarkMode ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 0.5)',
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
    },
    systemMessageText: {
        color: isDarkMode ? '#D1D5DB' : '#4B5563',
        fontSize: 13,
    },
});

export default MessageBubble;