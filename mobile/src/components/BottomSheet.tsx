/**
 * Draggable bottom sheet over the map, with snap points. Dragging runs on the UI thread
 * (Gesture Handler + Reanimated). The sheet's height animates (not its position), so scrollable
 * content always fits the visible area. Drag the handle/header to resize; tap the handle to cycle.
 * With `onClose`, a flick or drag well below the lowest snap point dismisses the sheet.
 */
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, radius } from '@/theme';

interface Props {
  /** Heights in px, ascending. */
  snapPoints: number[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose?: () => void;
  header?: React.ReactNode;
  children: React.ReactNode;
}

const SPRING = { damping: 26, stiffness: 260, mass: 0.9 };

export function BottomSheet({ snapPoints, index, onIndexChange, onClose, header, children }: Props) {
  const closable = Boolean(onClose);
  const height = useSharedValue(snapPoints[index]);
  const dragStart = useSharedValue(0);

  useEffect(() => {
    height.set(withSpring(snapPoints[index], SPRING));
  }, [height, index, snapPoints]);

  const pan = usePanGesture({
    activeOffsetY: [-6, 6],
    onBegin: () => {
      'worklet';
      dragStart.set(height.get());
    },
    onUpdate: e => {
      'worklet';
      const min = closable ? 0 : snapPoints[0] * 0.8;
      const max = snapPoints[snapPoints.length - 1];
      height.set(Math.max(min, Math.min(max, dragStart.get() - e.translationY)));
    },
    onDeactivate: e => {
      'worklet';
      const projected = height.get() - e.velocityY * 0.12;
      if (closable && projected < snapPoints[0] * 0.55) {
        height.set(withSpring(0, SPRING));
        if (onClose) scheduleOnRN(onClose);
        return;
      }
      let nearest = 0;
      for (let i = 1; i < snapPoints.length; i++) {
        if (Math.abs(snapPoints[i] - projected) < Math.abs(snapPoints[nearest] - projected)) nearest = i;
      }
      height.set(withSpring(snapPoints[nearest], { ...SPRING, velocity: -e.velocityY }));
      if (nearest !== index) scheduleOnRN(onIndexChange, nearest);
    },
  });

  const animatedStyle = useAnimatedStyle(() => ({ height: height.get() }));
  const cycle = () => onIndexChange(index >= snapPoints.length - 1 ? 0 : index + 1);

  return (
    <Animated.View style={[styles.sheet, animatedStyle]}>
      <GestureDetector gesture={pan}>
        <View>
          <Pressable
            onPress={cycle}
            style={styles.handleArea}
            accessibilityRole="adjustable"
            accessibilityLabel="Resize panel"
            hitSlop={8}
          >
            <View style={styles.handle} />
          </Pressable>
          {header}
        </View>
      </GestureDetector>
      <View style={styles.body}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    overflow: 'hidden',
  },
  handleArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 8 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.muted },
  body: { flex: 1 },
});
