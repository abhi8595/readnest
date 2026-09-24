import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { usePremiumStore } from '@/stores/usePremiumStore';
import { useTTSStore } from '@/stores/useTTSStore';
import type { BookRow } from '@/db/schema';
import { distinctAuthors, findDuplicates, seriesProgress, toggleFavorite, deleteBook } from '@/db/repositories';
import { pickAndImport } from '@/lib/import';
import { markInterstitialShown, shouldShowInterstitial } from '@/lib/ads';
import { BookCard, gridColumns } from '@/components/library/BookCard';
import { ContinueReading } from '@/components/library/ContinueReading';
import { BannerAd } from '@/components/ads/BannerAd';
import { Button, EmptyState, SegmentedControl } from '@/components/ui/controls';
import { SearchBar } from '@/components/ui/SearchBar';
import { Sheet } from '@/components/ui/Sheet';
import { Pressable } from '@/components/ui/pressable';
import { Icon } from '@/components/ui/Icon';

const SORTS = [
  { value: 'last_read', label: 'Recent' },
  { value: 'added', label: 'Added' },
  { value: 'title', label: 'Title' },
  { value: 'author', label: 'Author' },
  { value: 'size', label: 'Size' },
] as const;

export default function Library() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const books = useLibraryStore((s) => s.books);
  const collections = useLibraryStore((s) => s.collections);
  const loading = useLibraryStore((s) => s.loading);
  const refresh = useLibraryStore((s) => s.refresh);
  const loadMore = useLibraryStore((s) => s.loadMore);
  const hasMore = useLibraryStore((s) => s.hasMore);
  const loadingMore = useLibraryStore((s) => s.loadingMore);
  const totalCount = useLibraryStore((s) => s.totalCount);
  const refreshCollections = useLibraryStore((s) => s.refreshCollections);
  const setError = useLibraryStore((s) => s.setError);
  const lastError = useLibraryStore((s) => s.lastError);
  const sortKey = useSettingsStore((s) => s.sortKey);
  const viewMode = useSettingsStore((s) => s.viewMode);
  const tab = useSettingsStore((s) => s.libraryTab);
  const set = useSettingsStore((s) => s.set);
  const isPremium = usePremiumStore((s) => s.isPremium);
  const ttsActive = useTTSStore((s) => s.status !== 'idle');
  const { width: winW } = useWindowDimensions();
  const gridCols = gridColumns(winW);

  const [query, setQuery] = useState('');
  const [sortOpen, setSortOpen] = useState(false);
  const [selected, setSelected] = useState<BookRow | null>(null);
  const [authors, setAuthors] = useState<{ author: string; count: number }[]>([]);
  const [seriesList, setSeriesList] = useState<{ series: string; total: number; finished: number; reads: number }[]>([]);
  const [dupes, setDupes] = useState<BookRow[][]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    void refresh(sortKey);
    void refreshCollections();
  }, [refresh, refreshCollections, sortKey]);

  useEffect(() => {
    if (tab === 'authors') void distinctAuthors().then(setAuthors);
    if (tab === 'series') void seriesProgress().then(setSeriesList);
    if (tab === 'downloads') void findDuplicates().then(setDupes);
  }, [tab, books]);

  const openBook = useCallback((b: BookRow) => {
    if (shouldShowInterstitial(b.id, isPremium, ttsActive)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const ads = require('react-native-google-mobile-ads') as {
          InterstitialAd: { createForAdRequest: (id: string) => { load: () => void; show: () => Promise<void>; addAdEventListener: (e: string, cb: () => void) => () => void } };
          AdEventType: { LOADED: string };
        };
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { AD_UNITS } = require('@/lib/ads') as { AD_UNITS: { interstitial: string } };
        const ad = ads.InterstitialAd.createForAdRequest(AD_UNITS.interstitial);
        let navigated = false;
        const go = () => { if (!navigated) { navigated = true; router.push(`/reader/${b.id}`); } };
        const unsub = ad.addAdEventListener(ads.AdEventType.LOADED, () => {
          markInterstitialShown(b.id);
          unsub();
          void ad.show().then(go, go);
        });
        ad.load();
        setTimeout(go, 2500); // never trap the user
        return;
      } catch { /* ads unavailable → open directly */ }
    }
    router.push(`/reader/${b.id}`);
  }, [router, isPremium, ttsActive]);

  const doImport = useCallback(async () => {
    setImporting(true);
    try {
      const res = await pickAndImport();
      await refresh(sortKey);
      if (res.skipped.length > 0) {
        Alert.alert('Some files skipped', `${res.skipped.length} file(s) use unsupported formats:\n${res.skipped.slice(0, 5).join('\n')}`);
      } else if (res.imported > 0) {
        Alert.alert('Imported', `${res.imported} book${res.imported > 1 ? 's' : ''} added to your library.`);
      }
      if (res.errors.length > 0) setError(res.errors[0] ?? 'Import failed');
    } catch (e) {
      Alert.alert('Import failed', e instanceof Error ? e.message : 'Could not import files.');
    } finally {
      setImporting(false);
    }
  }, [refresh, sortKey, setError]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) =>
        (b.title ?? '').toLowerCase().includes(q) ||
        (b.author ?? '').toLowerCase().includes(q) ||
        (b.series ?? '').toLowerCase().includes(q),
    );
  }, [books, query]);

  const continueBook = useMemo(
    () => [...books].filter((b) => b.last_read_at).sort((a, b) => (b.last_read_at ?? 0) - (a.last_read_at ?? 0))[0],
    [books],
  );

  const renderAction = (b: BookRow) => setSelected(b);

  return (
    <View style={{ flex: 1, backgroundColor: palette.background, paddingTop: insets.top }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Image source={require('@/assets/icon.png')} style={{ width: 34, height: 34, borderRadius: 11 }} accessibilityLabel="ReadNest logo" />
            <View>
              <Text style={{ fontSize: 20, fontWeight: '800', color: palette.foreground, fontFamily: 'CrimsonPro' }}>ReadNest</Text>
              <Text style={{ fontSize: 11, color: palette.muted, fontFamily: 'Inter' }}>
                {totalCount != null && totalCount !== books.length
                  ? `${books.length} of ${totalCount} books`
                  : `${books.length} book${books.length === 1 ? '' : 's'}`}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {!isPremium ? (
              <Pressable
                onPress={() => router.push('/paywall')}
                accessibilityRole="button" accessibilityLabel="Get Premium"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: palette.gold, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
              >
                <Icon name="Crown" size={15} color={palette.onGold} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: palette.onGold, fontFamily: 'Inter' }}>PRO</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => set({ viewMode: viewMode === 'grid' ? 'list' : 'grid' })}
              accessibilityRole="button" accessibilityLabel={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
              style={{ padding: 10, borderRadius: 10, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border }}
            >
              <Icon name={viewMode === 'grid' ? 'List' : 'LayoutGrid'} size={20} color={palette.foreground} />
            </Pressable>
            <Pressable
              onPress={() => setSortOpen(true)}
              accessibilityRole="button" accessibilityLabel="Sort library"
              style={{ padding: 10, borderRadius: 10, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border }}
            >
              <Icon name="ArrowUpDown" size={20} color={palette.foreground} />
            </Pressable>
          </View>
        </View>

        <SearchBar value={query} onChange={setQuery} placeholder="Search title, author, series…" />

        <SegmentedControl
          value={tab}
          onChange={(v) => set({ libraryTab: v })}
          options={[
            { value: 'all', label: 'All' },
            { value: 'authors', label: 'Authors' },
            { value: 'series', label: 'Series' },
            { value: 'collections', label: 'Shelves' },
            { value: 'downloads', label: 'Dupes' },
          ]}
        />
      </View>

      {/* Body */}
      {lastError ? (
        <View style={{ margin: 16, backgroundColor: palette.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: palette.destructive }}>
          <Text style={{ color: palette.destructive, fontFamily: 'Inter', fontSize: 13 }}>{lastError}</Text>
        </View>
      ) : null}

      {tab === 'all' && (
        <FlatList
          data={filtered}
          key={`${viewMode}-${gridCols}`}
          numColumns={viewMode === 'grid' ? gridCols : 1}
          keyExtractor={(b) => b.id}
          removeClippedSubviews
          windowSize={7}
          maxToRenderPerBatch={12}
          initialNumToRender={12}
          updateCellsBatchingPeriod={80}
          onEndReached={() => { if (!query) void loadMore(sortKey); }}
          onEndReachedThreshold={0.6}
          ListFooterComponent={
            loadingMore ? (
              <Text style={{ textAlign: 'center', color: palette.muted, fontFamily: 'Inter', paddingVertical: 12 }}>
                Loading more…
              </Text>
            ) : hasMore && !query ? (
              <Text style={{ textAlign: 'center', color: palette.muted, fontFamily: 'Inter', paddingVertical: 12 }}>
                Scroll for more — {books.length}{totalCount != null ? ` of ${totalCount}` : ''} loaded
              </Text>
            ) : null
          }
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }}
          columnWrapperStyle={viewMode === 'grid' ? { gap: 12 } : undefined}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => refresh(sortKey)} tintColor={palette.primary} />}
          ListHeaderComponent={
            continueBook && !query ? (
              <View style={{ marginBottom: 12 }}>
                <ContinueReading book={continueBook} onOpen={openBook} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="LibraryBig"
              title="Your nest is empty"
              desc="Import your first EPUB, PDF or comic — or scan a folder to find them all at once."
              action={<Button title="Add books" icon="Plus" onPress={doImport} loading={importing} />}
            />
          }
          renderItem={({ item }) => (
            <BookCard book={item} mode={viewMode} onOpen={openBook} onLongPress={renderAction} />
          )}
        />
      )}

      {tab === 'authors' && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 120 }}>
          {authors.length === 0 ? <EmptyState icon="Users" title="No authors yet" desc="Author info appears once books with metadata are imported." /> : null}
          {authors.map((a) => (
            <Pressable
              key={a.author}
              onPress={() => { setQuery(a.author); set({ libraryTab: 'all' }); }}
              accessibilityRole="button" accessibilityLabel={`Books by ${a.author}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: palette.border }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: palette.primary, fontFamily: 'CrimsonPro' }}>
                  {a.author.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: palette.foreground, fontFamily: 'Inter' }}>{a.author}</Text>
              <Text style={{ fontSize: 13, color: palette.muted, fontFamily: 'Inter' }}>{a.count}</Text>
              <Icon name="ChevronRight" size={18} color={palette.muted} />
            </Pressable>
          ))}
        </ScrollView>
      )}

      {tab === 'series' && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 120 }}>
          {seriesList.length === 0 ? <EmptyState icon="Layers" title="No series yet" desc="Series grouping appears for books that carry series metadata." /> : null}
          {seriesList.map((srs) => {
            const unfinished = srs.total > 1 && srs.finished < srs.total;
            return (
              <Pressable
                key={srs.series}
                onPress={() => { setQuery(srs.series); set({ libraryTab: 'all' }); }}
                accessibilityRole="button" accessibilityLabel={`Books in ${srs.series}, ${srs.finished} of ${srs.total} finished`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: palette.border }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="Layers" size={20} color={palette.primary} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: palette.foreground, fontFamily: 'Inter' }}>{srs.series}</Text>
                    {unfinished ? (
                      <View style={{ backgroundColor: palette.gold, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: palette.onGold, fontFamily: 'Inter' }}>UNFINISHED</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={{ fontSize: 13, color: palette.muted, fontFamily: 'Inter' }}>
                    {srs.finished}/{srs.total} finished{srs.reads > srs.finished ? ` · ${srs.reads} finishes incl. re-reads` : ''}
                  </Text>
                </View>
                <Icon name="ChevronRight" size={18} color={palette.muted} />
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {tab === 'collections' && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 120 }}>
          {collections.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => router.push(`/collection/${c.id}`)}
              accessibilityRole="button" accessibilityLabel={`Open shelf ${c.name}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: palette.border }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: c.color ?? palette.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="Bookmark" size={20} color="#FFF" />
              </View>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: palette.foreground, fontFamily: 'Inter' }}>{c.name}</Text>
              <Text style={{ fontSize: 13, color: palette.muted, fontFamily: 'Inter' }}>{c.count}</Text>
              <Icon name="ChevronRight" size={18} color={palette.muted} />
            </Pressable>
          ))}
          <Button title="New shelf" icon="Plus" variant="secondary" onPress={() => router.push('/collection/new')} />
        </ScrollView>
      )}

      {tab === 'downloads' && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }}>
          <Text style={{ fontSize: 13, color: palette.muted, fontFamily: 'Inter' }}>
            Possible duplicates are detected by content fingerprint (not just filename), so renamed copies are caught too.
          </Text>
          {dupes.length === 0 ? <EmptyState icon="CopyCheck" title="No duplicates" desc="Every file in your library looks unique. Nice and tidy." /> : null}
          {dupes.map((g, i) => (
            <View key={i} style={{ backgroundColor: palette.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: palette.border, gap: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: palette.primary, fontFamily: 'Inter' }}>
                {g.length} COPIES · {(g[0]?.title ?? 'Unknown')}
              </Text>
              {g.map((b) => (
                <Pressable
                  key={b.id}
                  onPress={() => router.push(`/book/${b.id}`)}
                  accessibilityRole="button" accessibilityLabel={`Details for ${b.title}`}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}
                >
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: palette.foreground, fontFamily: 'Inter' }}>
                    {b.file_uri.split('/').pop()}
                  </Text>
                  <Icon name="ChevronRight" size={16} color={palette.muted} />
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      {/* FAB */}
      <Pressable
        onPress={doImport}
        accessibilityRole="button" accessibilityLabel="Add books to library"
        style={{
          position: 'absolute', right: 16, bottom: 88, flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: palette.primary, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 14,
          shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 5,
        }}
      >
        <Icon name="Plus" size={20} color={palette.onPrimary} />
        <Text style={{ fontSize: 15, fontWeight: '700', color: palette.onPrimary, fontFamily: 'Inter' }}>Add</Text>
      </Pressable>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
        <BannerAd />
      </View>

      {/* Sort sheet */}
      <Sheet visible={sortOpen} onClose={() => setSortOpen(false)} title="Sort by">
        <View style={{ gap: 4 }}>
          {SORTS.map((s) => (
            <Pressable
              key={s.value}
              onPress={() => { set({ sortKey: s.value }); void refresh(s.value); setSortOpen(false); }}
              accessibilityRole="radio" accessibilityLabel={`Sort by ${s.label}`}
              accessibilityState={{ selected: sortKey === s.value }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 8 }}
            >
              <Text style={{ fontSize: 16, color: palette.foreground, fontFamily: 'Inter', fontWeight: sortKey === s.value ? '700' : '400' }}>
                {s.label}
              </Text>
              {sortKey === s.value ? <Icon name="Check" size={20} color={palette.primary} /> : null}
            </Pressable>
          ))}
        </View>
      </Sheet>

      {/* Book actions sheet */}
      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.title ?? 'Book'}>
        {selected ? (
          <View style={{ gap: 4 }}>
            {[
              { icon: 'BookOpen', label: 'Open', fn: () => { const b = selected; setSelected(null); openBook(b); } },
              { icon: 'Info', label: 'About this document', fn: () => { router.push(`/book/${selected.id}`); setSelected(null); } },
              { icon: 'Heart', label: selected.is_favorite ? 'Remove from favorites' : 'Add to favorites', fn: () => { void toggleFavorite(selected.id).then(() => refresh(sortKey)); setSelected(null); } },
              { icon: 'Trash', label: 'Delete from library', fn: () => {
                Alert.alert('Delete book?', `"${selected.title}" will be removed from ReadNest (the file stays on your device).`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => { void deleteBook(selected.id).then(() => refresh(sortKey)); setSelected(null); } },
                ]);
              } },
            ].map((a) => (
              <Pressable
                key={a.label}
                onPress={a.fn}
                accessibilityRole="menuitem" accessibilityLabel={a.label}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 8 }}
              >
                <Icon name={a.icon as 'BookOpen'} size={20} color={a.label.startsWith('Delete') ? palette.destructive : palette.foreground} />
                <Text style={{ fontSize: 16, color: a.label.startsWith('Delete') ? palette.destructive : palette.foreground, fontFamily: 'Inter' }}>
                  {a.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}
