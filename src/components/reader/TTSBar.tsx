import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { useTTSStore } from '@/stores/useTTSStore';
import { usePremiumStore } from '@/stores/usePremiumStore';
import { Pressable } from '../ui/pressable';
import { Icon } from '../ui/Icon';
import { Chip } from '../ui/controls';

interface Props {
  onPlayPause: () => void;
  onStop: () => void;
  onPrev: () => void;
  onNext: () => void;
  onRate: (r: number) => void;
  onSleep: () => void;
  onBackground: () => void;
}

/** Foreground TTS control bar + Premium background/sleep entries. */
export function TTSBar(p: Props) {
  const { palette } = useTheme();
  const status = useTTSStore((s) => s.status);
  const rate = useTTSStore((s) => s.rate);
  const sleep = useTTSStore((s) => s.sleepMinutes);
  const sentenceIndex = useTTSStore((s) => s.sentenceIndex);
  const totalSentences = useTTSStore((s) => s.totalSentences);
  const timeLeft = useTTSStore((s) => s.timeLeft);
  const isPremium = usePremiumStore((s) => s.isPremium);
  if (status === 'idle') return null;

  return (
    <View
      style={{
        position: 'absolute', left: 16, right: 16, bottom: 96,
        backgroundColor: palette.surface, borderRadius: 20,
        borderWidth: 1, borderColor: palette.border, padding: 12,
        shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16, elevation: 6,
      }}
      accessibilityRole="toolbar"
      accessibilityLabel="Read aloud controls"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={p.onStop} accessibilityRole="button" accessibilityLabel="Stop reading aloud" style={{ padding: 10 }}>
          <Icon name="Square" size={20} color={palette.muted} />
        </Pressable>
        <Pressable onPress={p.onPrev} accessibilityRole="button" accessibilityLabel="Previous sentence" style={{ padding: 10 }}>
          <Icon name="SkipBack" size={22} color={palette.foreground} />
        </Pressable>
        <Pressable
          onPress={p.onPlayPause}
          accessibilityRole="button"
          accessibilityLabel={status === 'speaking' ? 'Pause' : 'Resume'}
          style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name={status === 'speaking' ? 'Pause' : 'Play'} size={24} color={palette.onPrimary} />
        </Pressable>
        <Pressable onPress={p.onNext} accessibilityRole="button" accessibilityLabel="Next sentence" style={{ padding: 10 }}>
          <Icon name="SkipForward" size={22} color={palette.foreground} />
        </Pressable>
        <Pressable onPress={p.onSleep} accessibilityRole="button" accessibilityLabel="Sleep timer" style={{ padding: 10 }}>
          <Icon name="Timer" size={20} color={sleep ? palette.primary : palette.muted} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[0.75, 1, 1.25, 1.5, 2].map((r) => (
            <Chip key={r} label={`${r}×`} active={rate === r} onPress={() => p.onRate(r)} />
          ))}
        </View>
      </View>
      <Pressable
        onPress={p.onBackground}
        accessibilityRole="button"
        accessibilityLabel={isPremium ? 'Play in background' : 'Background playback, premium feature'}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: palette.surface2, borderRadius: 12, padding: 10 }}
      >
        <Icon name={isPremium ? 'Headphones' : 'Crown'} size={18} color={palette.primary} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: palette.foreground, fontFamily: 'Inter' }}>
          {isPremium ? 'Keep playing with screen locked' : 'Background play while locked — Premium'}
        </Text>
      </Pressable>
      {sleep || timeLeft || totalSentences > 0 ? (
        <Text style={{ fontSize: 12, color: palette.muted, fontFamily: 'Inter', marginTop: 6, textAlign: 'center' }}>
          {[
            totalSentences > 0 ? `${Math.min(sentenceIndex + 1, totalSentences)}/${totalSentences}` : null,
            timeLeft,
            sleep ? `Sleep: ${sleep} min` : null,
          ].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
    </View>
  );
}
