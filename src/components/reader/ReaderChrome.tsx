import React from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { useReaderStore } from '@/stores/useReaderStore';
import { Pressable } from '../ui/pressable';
import { Icon, type IconName } from '../ui/Icon';
import { ProgressBar } from '../ui/controls';

interface Props {
  onBack: () => void;
  onToc: () => void;
  onTheme: () => void;
  onTts: () => void;
  onBookmark: () => void;
  onSettings: () => void;
  onSearch: () => void;
  /** D1 focus step-through (shown only when focusMode is on). */
  onFocusPrev?: () => void;
  onFocusNext?: () => void;
  /** Premium page/chapter strip, rendered above the scrubber when provided. */
  strip?: React.ReactNode;
}

function BarButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 8, paddingHorizontal: 10, minWidth: 56, minHeight: 48 }}
    >
      <Icon name={icon} size={22} color={palette.foreground} />
      <Text style={{ fontSize: 10, color: palette.muted, fontFamily: 'Inter' }}>{label}</Text>
    </Pressable>
  );
}

/** Top + bottom reader chrome (revealed on tap, auto-hides while reading). */
export function ReaderChrome({ onBack, onToc, onTheme, onTts, onBookmark, onSettings, onSearch, onFocusPrev, onFocusNext, strip }: Props) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const book = useReaderStore((s) => s.book);
  const progress = useReaderStore((s) => s.progress);
  const chapterLabel = useReaderStore((s) => s.chapterLabel);
  const page = useReaderStore((s) => s.page);
  const pageCount = useReaderStore((s) => s.pageCount);
  const visible = useReaderStore((s) => s.chromeVisible);
  const focusMode = useReaderStore((s) => s.focusMode);

  if (!visible) {
    // slim progress hairline in hidden state
    return (
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top, opacity: 0.9 }} pointerEvents="none">
        <ProgressBar value={progress} height={2} />
      </View>
    );
  }

  return (
    <>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top, backgroundColor: palette.background, borderBottomWidth: 1, borderBottomColor: palette.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, gap: 4 }}>
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to library" style={{ padding: 12 }}>
            <Icon name="ArrowLeft" size={22} color={palette.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: palette.foreground, fontFamily: 'Inter' }}>
              {book?.title ?? 'Reader'}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 12, color: palette.muted, fontFamily: 'Inter' }}>
              {chapterLabel ?? (pageCount ? `Page ${page} of ${pageCount}` : `${Math.round(progress * 100)}%`)}
            </Text>
          </View>
          <Pressable onPress={onSearch} accessibilityRole="button" accessibilityLabel="Search in book" style={{ padding: 12 }}>
            <Icon name="Search" size={20} color={palette.foreground} />
          </Pressable>
          <Pressable onPress={onBookmark} accessibilityRole="button" accessibilityLabel="Add bookmark" style={{ padding: 12 }}>
            <Icon name="Bookmark" size={20} color={palette.foreground} />
          </Pressable>
        </View>
      </View>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: Math.max(insets.bottom, 8), backgroundColor: palette.background, borderTopWidth: 1, borderTopColor: palette.border }}>
        {strip ? <View style={{ paddingTop: 10 }}>{strip}</View> : null}
        {focusMode !== 'off' && onFocusPrev && onFocusNext ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 10 }}>
            <Pressable
              onPress={onFocusPrev}
              accessibilityRole="button" accessibilityLabel="Previous focused unit"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: palette.surface2, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 }}
            >
              <Icon name="ChevronLeft" size={18} color={palette.foreground} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: palette.foreground, fontFamily: 'Inter' }}>Prev</Text>
            </Pressable>
            <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1, color: palette.muted, fontFamily: 'Inter' }}>
              FOCUS · {focusMode.toUpperCase()}
            </Text>
            <Pressable
              onPress={onFocusNext}
              accessibilityRole="button" accessibilityLabel="Next focused unit"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: palette.primary, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: palette.onPrimary, fontFamily: 'Inter' }}>Next</Text>
              <Icon name="ChevronRight" size={18} color={palette.onPrimary} />
            </Pressable>
          </View>
        ) : null}
        <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
          <ProgressBar value={progress} />
          <Text style={{ fontSize: 11, color: palette.muted, fontFamily: 'Inter', textAlign: 'center', marginTop: 4 }}>
            {pageCount ? `Page ${page} of ${pageCount} · ` : ''}{Math.round(progress * 100)}%
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingTop: 4 }}>
          <BarButton icon="List" label="Contents" onPress={onToc} />
          <BarButton icon="Palette" label="Theme" onPress={onTheme} />
          <BarButton icon="AudioLines" label="Listen" onPress={onTts} />
          <BarButton icon="Bookmark" label="Marks" onPress={onBookmark} />
          <BarButton icon="Settings2" label="Display" onPress={onSettings} />
        </View>
      </View>
    </>
  );
}
