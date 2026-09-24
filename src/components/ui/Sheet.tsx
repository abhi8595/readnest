import React, { useEffect } from 'react';
import { AccessibilityInfo, Modal, Text, View, useWindowDimensions } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { motion } from '@/theme/tokens';
import { Pressable } from './pressable';
import { Icon } from './Icon';

/** Accessible bottom sheet: scrim (measured), focus-visible close, reduced-motion aware. */
export function Sheet({ visible, onClose, title, children, wide }: {
  visible: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean;
}) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const progress = useSharedValue(0);
  const [reducedMotion, setReducedMotion] = React.useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled?.().then((v) => setReducedMotion(v === true)).catch(() => {});
  }, []);

  useEffect(() => {
    const dur = reducedMotion ? 0 : visible ? motion.base : motion.quick;
    progress.value = withTiming(visible ? 1 : 0, { duration: dur });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reducedMotion]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * 320 }],
    opacity: progress.value,
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const [rendered, setRendered] = React.useState(visible);
  useEffect(() => {
    if (visible) {
      setRendered(true);
      return;
    }
    const t = setTimeout(() => setRendered(false), motion.quick + 30);
    return () => clearTimeout(t);
  }, [visible]);
  if (!rendered) return null;

  return (
    <Modal transparent visible={rendered} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View style={[{ ...{ position: 'absolute' }, top: 0, bottom: 0, left: 0, right: 0, backgroundColor: palette.scrim }, scrimStyle]}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close dialog"
            style={{ flex: 1 }}
          />
        </Animated.View>
        <Animated.View
          accessibilityLabel={title}
          style={[
            {
              backgroundColor: palette.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16,
              paddingTop: 8, paddingBottom: Math.max(insets.bottom, 16), paddingHorizontal: 16,
              maxHeight: height * 0.85, width: '100%', maxWidth: wide ? 640 : 520, alignSelf: 'center',
            },
            sheetStyle,
          ]}
        >
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: palette.border, alignSelf: 'center', marginBottom: 12 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: palette.foreground, fontFamily: 'Inter' }}>{title}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={{ padding: 13, borderRadius: 999, backgroundColor: palette.surface2 }}>
              <Icon name="X" size={18} color={palette.foreground} />
            </Pressable>
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

export function runOnJSHelper() {
  return runOnJS;
}
