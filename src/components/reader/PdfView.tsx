import React, { useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { useReaderStore } from '@/stores/useReaderStore';
import { Button, EmptyState } from '../ui/controls';
import { Pressable } from '../ui/pressable';

/**
 * PDF viewer — native (react-native-pdf) in dev-client/EAS builds with
 * pinch-zoom; honest fallback in Expo Go with external open.
 */
export function PdfView({ uri, initialPage, onPosition, onTap }: {
  uri: string;
  initialPage: number;
  onPosition: (p: { progress: number; page: number; pageCount: number }) => void;
  /** Fired from the edge tap strips (native view swallows center taps). */
  onTap: () => void;
}) {
  const { palette } = useTheme();
  const pageMode = useReaderStore((s) => s.pageMode);
  const readerTheme = useReaderStore((s) => s.theme);
  const { width } = useWindowDimensions();
  const startPage = initialPage;
  const [error, setError] = useState<string | null>(null);
  // Native PDFs can't be re-themed — soften bright pages under dark reader
  // themes with a touch-transparent dim veil (taps still reach the view).
  const dimOpacity = readerTheme === 'oled' ? 0.22 : readerTheme === 'night' ? 0.14 : readerTheme === 'console' ? 0.16 : 0;

  let Pdf: React.ComponentType<Record<string, unknown>> | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-pdf') as { default: React.ComponentType<Record<string, unknown>> };
    Pdf = mod.default;
  } catch {
    Pdf = null;
  }

  if (!Pdf) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: palette.background }}>
        <EmptyState
          icon="FileText"
          title="PDF needs the dev build"
          desc="Native PDF rendering ships in the EAS dev-client build. You can still open this file externally, or read EPUB/TXT/FB2 right here in Expo Go."
          action={
            <Button
              title="Open externally"
              icon="ExternalLink"
              onPress={() => {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const Sharing = require('expo-sharing') as { shareAsync: (u: string) => Promise<void> };
                void Sharing.shareAsync(uri);
              }}
            />
          }
        />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: palette.background, padding: 24 }}>
        <Text style={{ color: palette.destructive, fontFamily: 'Inter', textAlign: 'center' }}>{error}</Text>
      </View>
    );
  }

  const Cmp = Pdf;
  return (
    <View style={{ flex: 1, backgroundColor: palette.surface2 }}>
      <Cmp
        source={{ uri }}
        style={{ flex: 1, width }}
        page={startPage}
        horizontal={pageMode === 'paginated'}
        enablePaging={pageMode === 'paginated'}
        enableDoubleTapZoom
        enableAnnotationRendering
        fitPolicy={0}
        onLoadComplete={(n: number) => onPosition({ progress: startPage / Math.max(1, n), page: startPage, pageCount: n })}
        onPageChanged={(p: number, n: number) => onPosition({ progress: p / Math.max(1, n), page: p, pageCount: n })}
        onError={(e: unknown) => setError(e instanceof Error ? e.message : 'Could not open this PDF.')}
      />
      {dimOpacity > 0 ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: `rgba(0,0,0,${dimOpacity})` }}
        />
      ) : null}
      {/* Edge tap strips: the native view consumes center taps, so chrome
          toggling lives on the edges. Center stays fully interactive. */}
      <Pressable
        onPress={onTap}
        accessibilityRole="button"
        accessibilityLabel="Toggle reading controls"
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 52 }}
      />
      <Pressable
        onPress={onTap}
        accessibilityRole="button"
        accessibilityLabel="Toggle reading controls"
        style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 52 }}
      />
    </View>
  );
}
