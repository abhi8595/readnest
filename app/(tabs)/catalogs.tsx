import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { useLibraryStore } from '@/stores/useLibraryStore';
import {
  downloadOpdsEntry, fetchOpdsFeed, getOpdsPassword, listOpdsFeeds, removeOpdsFeed,
  saveOpdsFeed, setOpdsPassword, type OpdsAuth, type OpdsEntry, type OpdsFeed, type SavedOpdsFeed,
} from '@/lib/opds';
import { importFileFromUri } from '@/lib/import';
import { Button, EmptyState } from '@/components/ui/controls';
import { Sheet } from '@/components/ui/Sheet';
import { Pressable } from '@/components/ui/pressable';
import { Icon } from '@/components/ui/Icon';

/**
 * Catalogs — OPDS ebook sources (Standard Ebooks, Project Gutenberg,
 * self-hosted Calibre / Calibre-Web at http://server:8083/opds).
 * Browse, paginate, download straight into the library.
 */
export default function Catalogs() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const refresh = useLibraryStore((s) => s.refresh);
  const [feeds, setFeeds] = useState<SavedOpdsFeed[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [feed, setFeed] = useState<OpdsFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [draftUrl, setDraftUrl] = useState('');
  const [draftLabel, setDraftLabel] = useState('');
  const [draftUser, setDraftUser] = useState('');
  const [draftPass, setDraftPass] = useState('');
  const [crumbs, setCrumbs] = useState<{ title: string; url: string }[]>([]);

  const reloadFeeds = useCallback(async () => {
    const list = await listOpdsFeeds();
    setFeeds(list);
    if (!activeId && list[0]) setActiveId(list[0].id);
  }, [activeId]);
  useEffect(() => { void reloadFeeds(); }, [reloadFeeds]);

  const authFor = useCallback(async (f: SavedOpdsFeed): Promise<OpdsAuth | undefined> => {
    if (!f.username) return undefined;
    const password = (await getOpdsPassword(f.id)) ?? '';
    return { username: f.username, password };
  }, []);

  const openUrl = useCallback(async (saved: SavedOpdsFeed, url: string, title?: string) => {
    setLoading(true);
    setError(null);
    try {
      const auth = await authFor(saved);
      const next = await fetchOpdsFeed(url, auth);
      setFeed(next);
      setCrumbs((c) => (title ? [...c, { title, url }] : c));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this catalog.');
    } finally {
      setLoading(false);
    }
  }, [authFor]);

  const openFeed = useCallback(async (saved: SavedOpdsFeed) => {
    setActiveId(saved.id);
    setCrumbs([]);
    setFeed(null);
    await openUrl(saved, saved.url);
  }, [openUrl]);

  useEffect(() => {
    const first = feeds.find((f) => f.id === activeId) ?? feeds[0];
    if (first && !feed && !loading && !error) void openFeed(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeds]);

  const download = async (entry: OpdsEntry) => {
    const saved = feeds.find((f) => f.id === activeId);
    if (!saved) return;
    setDownloading(entry.id);
    try {
      const auth = await authFor(saved);
      const { localUri, filename } = await downloadOpdsEntry(entry, auth);
      const book = await importFileFromUri(localUri, filename);
      await refresh();
      Alert.alert('Downloaded', `"${book.title ?? entry.title}" is now in your library.`);
    } catch (e) {
      Alert.alert('Download failed', e instanceof Error ? e.message : 'Could not download this book.');
    } finally {
      setDownloading(null);
    }
  };

  const addFeed = async () => {
    const url = draftUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      Alert.alert('Invalid URL', 'Catalog URLs start with http:// or https:// (e.g. http://192.168.1.5:8083/opds).');
      return;
    }
    const id = `custom-${Date.now()}`;
    const saved: SavedOpdsFeed = {
      id,
      label: draftLabel.trim() || url.replace(/^https?:\/\//, '').split('/')[0]!,
      url,
      username: draftUser.trim() || undefined,
      hasPassword: draftPass.length > 0,
    };
    await saveOpdsFeed(saved);
    if (draftPass) await setOpdsPassword(id, draftPass);
    setDraftUrl(''); setDraftLabel(''); setDraftUser(''); setDraftPass('');
    setAddOpen(false);
    const list = await listOpdsFeeds();
    setFeeds(list);
    const created = list.find((f) => f.id === id);
    if (created) void openFeed(created);
  };

  const forgetFeed = (f: SavedOpdsFeed) => {
    Alert.alert('Remove catalog?', `"${f.label}" will be forgotten on this device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: () => {
          void (async () => {
            await removeOpdsFeed(f.id);
            await setOpdsPassword(f.id, '');
            const list = await listOpdsFeeds();
            setFeeds(list);
            if (activeId === f.id && list[0]) void openFeed(list[0]);
          })();
        },
      },
    ]);
  };

  const active = feeds.find((f) => f.id === activeId);

  return (
    <View style={{ flex: 1, backgroundColor: palette.background, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 4 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: palette.foreground, fontFamily: 'CrimsonPro' }}>Catalogs</Text>
        <Text style={{ fontSize: 13, color: palette.muted, fontFamily: 'Inter' }}>
          Free ebooks (OPDS) + your Calibre library. Downloads land in your nest.
        </Text>
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <FlatList
          horizontal
          data={feeds}
          keyExtractor={(f) => f.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 8 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => void openFeed(item)}
              onLongPress={() => { if (!item.id.startsWith('builtin-')) forgetFeed(item); }}
              accessibilityRole="tab"
              accessibilityLabel={`${item.label} catalog`}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10,
                borderRadius: 999, borderWidth: 1,
                borderColor: item.id === activeId ? palette.primary : palette.border,
                backgroundColor: item.id === activeId ? palette.surface : palette.surface2,
              }}
            >
              <Icon name="Globe" size={15} color={item.id === activeId ? palette.primary : palette.muted} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: item.id === activeId ? palette.foreground : palette.muted, fontFamily: 'Inter' }}>
                {item.label}
              </Text>
            </Pressable>
          )}
          ListFooterComponent={
            <Pressable
              onPress={() => setAddOpen(true)}
              accessibilityRole="button" accessibilityLabel="Add catalog"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.border }}
            >
              <Icon name="Plus" size={15} color={palette.muted} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: palette.muted, fontFamily: 'Inter' }}>Add</Text>
            </Pressable>
          }
        />
        {crumbs.length > 0 ? (
          <Pressable
            onPress={() => {
              const prev = crumbs[crumbs.length - 2];
              setCrumbs((c) => c.slice(0, -1));
              if (active && prev) void openUrl(active, prev.url);
              else if (active) void openFeed(active);
            }}
            accessibilityRole="button" accessibilityLabel="Back in catalog"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8 }}
          >
            <Icon name="ArrowLeft" size={15} color={palette.primary} />
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: palette.primary, fontFamily: 'Inter' }}>
              {crumbs[crumbs.length - 1]?.title ?? 'Back'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <ActivityIndicator size="large" color={palette.primary} />
          <Text style={{ color: palette.muted, fontFamily: 'Inter' }}>Loading catalog…</Text>
        </View>
      ) : error ? (
        <View style={{ flex: 1, padding: 24 }}>
          <EmptyState icon="CloudOff" title="Catalog unavailable" desc={error} action={<Button title="Retry" icon="RefreshCw" onPress={() => { if (active) void openFeed(active); }} />} />
        </View>
      ) : (
        <FlatList
          data={feed?.entries ?? []}
          keyExtractor={(e, i) => `${e.id || e.title}-${i}`}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 120 }}
          ListHeaderComponent={feed ? (
            <Text style={{ fontSize: 12, color: palette.muted, fontFamily: 'Inter' }}>
              {feed.title} · {feed.entries.length} entr{feed.entries.length === 1 ? 'y' : 'ies'}
            </Text>
          ) : null}
          ListEmptyComponent={
            <EmptyState icon="Globe" title="Pick a catalog" desc="Choose a source above, or add your Calibre-Web OPDS URL (long-press a custom feed to remove it)." />
          }
          ListFooterComponent={feed?.nextUrl && active ? (
            <Button title="More results" icon="ChevronDown" onPress={() => void openUrl(active, feed.nextUrl!, 'More')} />
          ) : undefined}
          renderItem={({ item }) => (
            <View style={{ flexDirection: 'row', gap: 12, backgroundColor: palette.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: palette.border }}>
              {item.coverUrl ? (
                <Image source={{ uri: item.coverUrl }} style={{ width: 52, height: 78, borderRadius: 6, backgroundColor: palette.surface2 }} resizeMode="cover" />
              ) : (
                <View style={{ width: 52, height: 78, borderRadius: 6, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="BookOpen" size={20} color={palette.muted} />
                </View>
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <Text numberOfLines={2} style={{ fontSize: 15, fontWeight: '700', color: palette.foreground, fontFamily: 'Inter' }}>{item.title}</Text>
                {item.authors.length > 0 ? (
                  <Text numberOfLines={1} style={{ fontSize: 12, color: palette.muted, fontFamily: 'Inter' }}>{item.authors.join(', ')}</Text>
                ) : null}
                {item.summary ? (
                  <Text numberOfLines={2} style={{ fontSize: 12, color: palette.muted, fontFamily: 'Inter' }}>{item.summary}</Text>
                ) : null}
              </View>
              {item.acquisitions.length > 0 ? (
                <Pressable
                  onPress={() => void download(item)}
                  disabled={downloading === item.id}
                  accessibilityRole="button" accessibilityLabel={`Download ${item.title}`}
                  style={{ alignSelf: 'center', backgroundColor: palette.primary, borderRadius: 999, padding: 12, opacity: downloading === item.id ? 0.6 : 1 }}
                >
                  {downloading === item.id
                    ? <ActivityIndicator size="small" color={palette.onPrimary} />
                    : <Icon name="Download" size={18} color={palette.onPrimary} />}
                </Pressable>
              ) : item.navUrl && active ? (
                <Pressable
                  onPress={() => void openUrl(active, item.navUrl!, item.title)}
                  accessibilityRole="button" accessibilityLabel={`Open ${item.title}`}
                  style={{ alignSelf: 'center', backgroundColor: palette.surface2, borderRadius: 999, padding: 12 }}
                >
                  <Icon name="ChevronRight" size={18} color={palette.foreground} />
                </Pressable>
              ) : null}
            </View>
          )}
        />
      )}

      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title="Add catalog">
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 13, color: palette.muted, fontFamily: 'Inter' }}>
            Any OPDS URL works — e.g. Calibre-Web at http://192.168.1.5:8083/opds
          </Text>
          {[
            { label: 'Catalog URL', value: draftUrl, set: setDraftUrl, placeholder: 'https://…/opds', secure: false },
            { label: 'Label (optional)', value: draftLabel, set: setDraftLabel, placeholder: 'My Calibre', secure: false },
            { label: 'Username (optional)', value: draftUser, set: setDraftUser, placeholder: 'user', secure: false },
            { label: 'Password (optional)', value: draftPass, set: setDraftPass, placeholder: '••••••', secure: true },
          ].map((f) => (
            <View key={f.label} style={{ gap: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: palette.muted, fontFamily: 'Inter' }}>{f.label.toUpperCase()}</Text>
              <TextInput
                value={f.value}
                onChangeText={f.set}
                placeholder={f.placeholder}
                placeholderTextColor={palette.faint}
                secureTextEntry={f.secure}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={f.label}
                style={{ backgroundColor: palette.surface2, borderRadius: 12, padding: 12, fontSize: 15, color: palette.foreground, fontFamily: 'Inter', borderWidth: 1, borderColor: palette.border }}
              />
            </View>
          ))}
          <Button title="Add catalog" icon="Plus" onPress={addFeed} />
          <View style={{ height: 40 }} />
        </View>
      </Sheet>
    </View>
  );
}
