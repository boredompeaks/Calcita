import React, { useState, useRef } from 'react';
import { StyleSheet, Animated, PanResponder, View } from 'react-native';
import { AlertTriangleIcon } from './icons';

interface PanicButtonProps {
  onPanic: () => void;
}

const DOUBLE_TAP_DELAY = 300; // ms

const PanicButton: React.FC<PanicButtonProps> = ({ onPanic }) => {
  const [lastTap, setLastTap] = useState<number | null>(null);
  const pan = useRef(new Animated.ValueXY()).current;
  const touchTimestamp = useRef(0);

  const handleTap = () => {
    const now = Date.now();
    if (lastTap && now - lastTap < DOUBLE_TAP_DELAY) {
      // Double tap confirmed
      onPanic();
      setLastTap(null);
    } else {
      // First tap
      setLastTap(now);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        touchTimestamp.current = Date.now();
        // Edge Case Handling & Maintainability:
        // The `setOffset` method is used so that the drag gesture is calculated
        // from the last position of the button, not from the center of the screen.
        // Accessing the internal `_value` property is a common but necessary
        // workaround in `PanResponder` to get the current animated value before
        // setting the new offset.
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (_e, gesture) => {
        pan.flattenOffset();
        const pressDuration = Date.now() - touchTimestamp.current;
        // Edge Case: Distinguish between a drag and a double-tap.
        // If it's a short press and not a significant drag, treat as a tap.
        if (pressDuration < 200 && Math.abs(gesture.dx) < 10 && Math.abs(gesture.dy) < 10) {
          handleTap();
        }
      },
    })
  ).current;

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateX: pan.x }, { translateY: pan.y }] },
      ]}
      {...panResponder.panHandlers}
    >
      <AlertTriangleIcon size={24} color="#FFFFFF" />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(239, 68, 68, 0.8)', // Red with transparency
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 1000,
  },
});

export default PanicButton;