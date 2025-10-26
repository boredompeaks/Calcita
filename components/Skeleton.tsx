import React, { useEffect } from 'react';
// FIX: Imported DimensionValue to use the correct type for the width prop.
import { View, StyleSheet, StyleProp, ViewStyle, DimensionValue } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';

interface SkeletonProps {
  // FIX: Changed type from `number | string` to `DimensionValue` to match React Native style types.
  width: DimensionValue;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  isDarkMode: boolean;
}

const Skeleton: React.FC<SkeletonProps> = ({ width, height, borderRadius = 4, style, isDarkMode }) => {
  const opacity = useSharedValue(0.5);
  const styles = getStyles(isDarkMode);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width, height, borderRadius },
        style,
        animatedStyle,
      ]}
    />
  );
};

const getStyles = (isDarkMode: boolean) => StyleSheet.create({
  skeleton: {
    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  },
});

export default Skeleton;
