import React from 'react';
import { Pressable as RNPressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { touch } from '@/theme/tokens';

/**
 * App-wide Pressable: instant opacity feedback (≤150ms), 48dp Android /
 * 44pt iOS minimum via hitSlop, optional haptic. Use for ALL touchables.
 */
interface Props extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  haptic?: 'light' | 'medium' | false;
  minTouch?: boolean;
}

export function Pressable({ style, haptic = false, minTouch = true, onPress, ...rest }: Props) {
  return (
    <RNPressable
      hitSlop={minTouch ? touch.hitSlop : undefined}
      onPress={(e) => {
        if (haptic === 'light') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (haptic === 'medium') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress?.(e);
      }}
      style={({ pressed }) => [
        { opacity: pressed ? 0.55 : 1 },
        typeof style === 'function' ? undefined : style,
      ]}
      {...rest}
    />
  );
}
