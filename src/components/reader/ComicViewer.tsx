import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Text, View, useWindowDimensions, type ViewToken } from 'react-native';
import { useReaderStore } from '@/stores/useReaderStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import type { ComicPage } from '@/lib/comic';
import { EmptyState } from '../ui/controls';
import { Pressable } from '../ui/pressable';

export interface ComicViewerHandle {
  scrollTo: (index: number) => void;
}

interface Props {
  pages: ComicPage[];
  onPosition: (p: { progress: number; page: number; pageCount: number }) => void;
  onTap: () => void;
}

export const ComicViewer = forwardRef<ComicViewerHandle, Props>(function ComicViewer(
  { pages, onPosition, onTap },
  ref,
) {
  const pageMode = useReaderStore((s) => s.pageMode);
  const startPage = useReaderStore((s) => s.page);
  // F3 — manga spread (double-page) + RTL paging live in global settings.
  const spread = useSettingsStore((s) => s.mangaSpread);
  const rtlPaging = useSettingsStore((s) => s.mangaRtl);
  const [index, setIndex] = useState(Math.max(0, startPage - 1));
  const listRef = useRef<FlatList>(null);
  const { width, height } = useWindowDimensions();
  const paged = pageMode === 'paginated';

  // Spread pairs: [0,1],[2,3]… (LTR) — in RTL the pair order inside a
  // spread is mirrored but the reading advance stays swipe-driven.
  const spreads = useMemo<{ key: string; pages: ComicPage[] }[]>(() => {
    if (!spread || !paged) return pages.map((p) => ({ key: `s${p.index}`, pages: [p] }));
    const out: { key: string; pages: ComicPage[] }[] = [];
    for (let i = 0; i < pages.length; i += 2) {
      out.push({ key: `s${i}`, pages: pages.slice(i, i + 2) });
    }
    return out;
  }, [pages, spread, paged]);

  useImperativeHandle(ref, () => ({
    scrollTo: (i: number) => {
      const target = spread && paged ? Math.floor(Math.max(0, Math.min(pages.length - 1, i)) / 2) : Math.max(0, Math.min(pages.length - 1, i));
      try {
        listRef.current?.scrollToIndex({ index: target, animated: true });
      } catch {
        listRef.current?.scrollToOffset({
          offset: target * (paged ? width : height * 0.9),
          animated: true,
        });
      }
    },
  }), [pages.length, paged, width, height, spread]);

  if (pages.length === 0) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <EmptyState icon="ImageOff" title="No images found" desc="This archive has no readable images." />
      </View>
    );
  }

  const onViewable = ({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const v = viewableItems[0];
    if (v?.index != null) {
      const pageIdx = spread && paged ? v.index * 2 : v.index;
      setIndex(pageIdx);
      onPosition({ progress: (pageIdx + 1) / pages.length, page: pageIdx + 1, pageCount: pages.length });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <FlatList
        ref={listRef}
        data={spreads}
        key={`${paged ? 'paged' : 'scroll'}-${spread ? 'spread' : 'single'}`}
        horizontal={paged}
        pagingEnabled={paged}
        inverted={paged && rtlPaging}
        initialScrollIndex={Math.min(index, Math.max(0, spreads.length - 1))}
        getItemLayout={(_, i) => ({ length: paged ? width : height * 0.9, offset: (paged ? width : height * 0.9) * i, index: i })}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        // Full-res page images are heavy — keep only neighbours mounted and
        // retry failed jumps via offset instead of swallowing them.
        windowSize={3}
        maxToRenderPerBatch={2}
        initialNumToRender={2}
        removeClippedSubviews={false}
        onScrollToIndexFailed={({ index: failed }) => {
          listRef.current?.scrollToOffset({ offset: failed * (paged ? width : height * 0.9), animated: false });
        }}
        keyExtractor={(s) => s.key}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable
            onPress={onTap}
            accessibilityRole="imagebutton"
            accessibilityLabel={item.pages.length > 1
              ? `Pages ${item.pages[0]!.index + 1} and ${item.pages[1]!.index + 1} of ${pages.length}. Activate to toggle controls.`
              : `Page ${item.pages[0]!.index + 1} of ${pages.length}. Activate to toggle controls.`}
            style={{
              width, height: paged ? '100%' : height * 0.9,
              flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
            }}
          >
            {(rtlPaging ? [...item.pages].reverse() : item.pages).map((pg: ComicPage) => (
              <Image
                key={pg.index}
                source={{ uri: pg.uri }}
                style={{ width: item.pages.length > 1 ? width / 2 : width, height: '100%' }}
                resizeMode="contain"
              />
            ))}
          </Pressable>
        )}
      />
      <View style={{ position: 'absolute', bottom: 16, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
        <Text style={{ color: '#FFF', fontSize: 12, fontFamily: 'Inter' }}>{index + 1} / {pages.length}</Text>
      </View>
    </View>
  );
});
