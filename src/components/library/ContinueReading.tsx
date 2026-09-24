import React from 'react';
import { Text, View } from 'react-native';
import type { BookRow } from '@/db/schema';
import { useTheme } from '@/theme/ThemeProvider';
import { Pressable } from '../ui/pressable';
import { Cover } from '../ui/Cover';
import { Icon } from '../ui/Icon';
import { ProgressBar } from '../ui/controls';

/** Hero card for the most recently read book. */
export function ContinueReading({ book, onOpen }: { book: BookRow; onOpen: (b: BookRow) => void }) {
  const { palette } = useTheme();
  const pct = Math.round((book.reading_progress ?? 0) * 100);
  return (
    <Pressable
      onPress={() => onOpen(book)}
      accessibilityRole="button"
      accessibilityLabel={`Continue reading ${book.title ?? 'book'}, ${pct} percent complete`}
      style={{
        backgroundColor: palette.surface, borderRadius: 16, padding: 14,
        borderWidth: 1, borderColor: palette.border,
        flexDirection: 'row', gap: 14, alignItems: 'center',
        shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3,
      }}
    >
      <Cover uri={book.cover_uri} title={book.title} format={book.format} width={76} />
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="Flame" size={14} color={palette.primary} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: palette.primary, letterSpacing: 1.2, fontFamily: 'Inter' }}>
            CONTINUE READING
          </Text>
        </View>
        <Text numberOfLines={2} style={{ fontSize: 17, fontWeight: '700', color: palette.foreground, fontFamily: 'CrimsonPro', lineHeight: 22 }}>
          {book.title ?? 'Untitled'}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 13, color: palette.muted, fontFamily: 'Inter' }}>
          {book.author ?? 'Unknown author'}
        </Text>
        <ProgressBar value={book.reading_progress ?? 0} />
        <Text style={{ fontSize: 12, color: palette.muted, fontFamily: 'Inter' }}>{pct}% complete</Text>
      </View>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="Play" size={20} color={palette.onPrimary} />
      </View>
    </Pressable>
  );
}
