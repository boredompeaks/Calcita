import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, withDelay } from 'react-native-reanimated';

const Dot: React.FC<{ index: number; isDarkMode: boolean }> = ({ index, isDarkMode }) => {
  const y = useSharedValue(0);
  const styles = getStyles(isDarkMode);

  useEffect(() => {
    y.value = withRepeat(
      withTiming(-5, { duration: 400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: withDelay(index * 150, y.value) }],
    };
  });

  return <Animated.View style={[styles.dot, animatedStyle]} />;
};

const TypingIndicator: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
  const styles = getStyles(isDarkMode);
  return (
    <View style={styles.dotsContainer}>
      <Dot index={0} isDarkMode={isDarkMode} />
      <Dot index={1} isDarkMode={isDarkMode} />
      <Dot index={2} isDarkMode={isDarkMode} />
    </View>
  );
};

const getStyles = (isDarkMode: boolean) =>
  StyleSheet.create({
    dotsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 18, // Match the height of status text
      paddingLeft: 4,
    },
    dot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: isDarkMode ? '#9CA3AF' : '#6B7280',
      marginHorizontal: 1.5,
    },
  });

export default TypingIndicator;