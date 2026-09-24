import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import type { BookRow } from '@/db/schema';
import { formatBytes, formatInfo } from '@/lib/formats';
import { useTheme } from '@/theme/ThemeProvider';
import { Pressable } from '../ui/pressable';
import { Cover } from '../ui/Cover';
import { Icon } from '../ui/Icon';
import { ProgressBar } from '../ui/controls';

interface Props {
  book: BookRow;
  mode: 'grid' | 'list';
  onOpen: (b: BookRow) => void;
  onLongPress: (b: BookRow) => void;
}

/** Adaptive grid columns: 3 on phones, more on wide tablets/foldables. */
export function gridColumns(win: number): number {
  if (win >= 900) return 6;
  if (win >= 700) return 5;
  if (win >= 550) return 4;
  return 3;
}

export function BookCard({ book, mode, onOpen, onLongPress }: Props) {
  const { palette } = useTheme();
  const { width: win } = useWindowDimensions();
  const info = formatInfo(book.format);
  const cols = gridColumns(win);
  // screen minus list padding (16x2) minus column gaps (12 x (cols - 1))
  const gridW = Math.max(96, Math.floor((win - 32 - 12 * (cols - 1)) / cols));

  if (mode === 'list') {
    return (
      <Pressable
        onPress={() => onOpen(book)}
        onLongPress={() => onLongPress(book)}
        accessibilityRole="button"
        accessibilityLabel={`${book.title ?? 'Untitled'} by ${book.author ?? 'unknown author'}`}
        accessibilityHint="Opens the book"
        style={{
          flexDirection: 'row', gap: 12, backgroundColor: palette.surface,
          borderRadius: 12, padding: 10, borderWidth: 1, borderColor: palette.border,
        }}
      >
        <Cover uri={book.cover_uri} title={book.title} format={book.format} width={56} ratio={1.45} />
        <View style={{ flex: 1, justifyContent: 'center', gap: 3 }}>
          <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', color: palette.foreground, fontFamily: 'Inter' }}>
            {book.title ?? 'Untitled'}
          </Text>
          <Text numberOfLines={1} style={{ fontSize: 13, color: palette.muted, fontFamily: 'Inter' }}>
            {book.author ?? 'Unknown author'} · {formatBytes(book.file_size)}
          </Text>
          {book.reading_progress > 0 ? (
            <View style={{ marginTop: 4 }}>
              <ProgressBar value={book.reading_progress} />
            </View>
          ) : null}
        </View>
        <View style={{ justifyContent: 'center', alignItems: 'flex-end', gap: 6 }}>
          <View style={{ backgroundColor: palette.surface2, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: palette.muted, fontFamily: 'Inter' }}>{info.badge}</Text>
          </View>
          {book.is_favorite ? <Icon name="Heart" size={16} color={palette.primary} /> : null}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => onOpen(book)}
      onLongPress={() => onLongPress(book)}
      accessibilityRole="button"
      accessibilityLabel={`${book.title ?? 'Untitled'} by ${book.author ?? 'unknown author'}`}
      style={{ width: gridW, gap: 6 }}
    >
      <View>
        <Cover uri={book.cover_uri} title={book.title} format={book.format} width={gridW} />
        <View style={{ position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
          <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFF', fontFamily: 'Inter' }}>{info.badge}</Text>
        </View>
        {book.is_favorite ? (
          <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 999, padding: 4 }}>
            <Icon name="Heart" size={14} color="#FFF" />
          </View>
        ) : null}
      </View>
      <View style={{ gap: 2 }}>
        <Text numberOfLines={2} style={{ fontSize: 13, fontWeight: '600', color: palette.foreground, fontFamily: 'Inter', lineHeight: 17 }}>
          {book.title ?? 'Untitled'}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 11, color: palette.muted, fontFamily: 'Inter' }}>
          {book.author ?? 'Unknown author'}
        </Text>
        {book.reading_progress > 0 ? <ProgressBar value={book.reading_progress} height={3} /> : null}
      </View>
    </Pressable>
  );
}
