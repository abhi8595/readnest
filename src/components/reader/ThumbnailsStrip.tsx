import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Pressable } from '../ui/pressable';
import { Icon } from '../ui/Icon';

export interface StripItem {
  id: string;
  label: string;
  sub?: string;
}

interface Props {
  items: StripItem[];
  activeIndex: number;
  onJump: (index: number) => void;
  onLockedPress: () => void;
  locked: boolean;
}

/**
 * Premium visual quick-navigation strip. Reflow books: chapter cards.
 * PDF/comics: page cells. Renders above the bottom chrome when visible.
 */
export function ThumbnailsStrip({ items, activeIndex, onJump, onLockedPress, locked }: Props) {
  const { palette } = useTheme();
  if (items.length === 0) return null;

  if (locked) {
    return (
      <Pressable
        onPress={onLockedPress}
        accessibilityRole="button"
        accessibilityLabel="Page thumbnails, premium feature"
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          marginHorizontal: 16, marginBottom: 8, padding: 11,
          borderRadius: 12, backgroundColor: palette.surface2,
          borderWidth: 1, borderColor: palette.border,
        }}
      >
        <Icon name="Crown" size={17} color={palette.goldDeep} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: palette.foreground, fontFamily: 'Inter' }}>
          Visual page strip — Premium
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={{ marginBottom: 6 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {items.map((it, i) => {
          const active = i === activeIndex;
          return (
            <Pressable
              key={it.id}
              onPress={() => onJump(i)}
              accessibilityRole="button"
              accessibilityLabel={`Jump to ${it.label}`}
              accessibilityState={{ selected: active }}
              style={{
                minWidth: 104, maxWidth: 150, borderRadius: 10, padding: 9,
                backgroundColor: active ? palette.primary : palette.surface,
                borderWidth: 1, borderColor: active ? palette.primary : palette.border,
              }}
            >
              <Text
                numberOfLines={2}
                style={{
                  fontSize: 12, fontWeight: active ? '700' : '600',
                  color: active ? palette.onPrimary : palette.foreground, fontFamily: 'Inter',
                }}
              >
                {it.label}
              </Text>
              {it.sub ? (
                <Text style={{ fontSize: 10, color: active ? palette.onPrimary : palette.muted, fontFamily: 'Inter', marginTop: 2 }}>
                  {it.sub}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
