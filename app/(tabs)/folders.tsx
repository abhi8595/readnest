import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useRouter } from 'expo-router';
import { checkFolderAccess, listGrantedFolders, removeGrantedFolder, requestFolderAccess, scanFolder } from '@/lib/scan';
import { Button, EmptyState, ProgressBar } from '@/components/ui/controls';
import { Pressable } from '@/components/ui/pressable';
import { Icon } from '@/components/ui/Icon';

/** SAF URIs are percent-encoded; never let a malformed one crash render. */
function safeUri(uri: string): string {
  try {
    return decodeURIComponent(uri).slice(0, 80);
  } catch {
    return uri.slice(0, 80);
  }
}

export default function Folders() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const books = useLibraryStore((s) => s.books);
  const refresh = useLibraryStore((s) => s.refresh);
  const scanning = useLibraryStore((s) => s.scanning);
  const progress = useLibraryStore((s) => s.scanProgress);
  const setScanning = useLibraryStore((s) => s.setScanning);
  const sortKey = useSettingsStore((s) => s.sortKey);
  const setSettings = useSettingsStore((s) => s.set);
  const [folders, setFolders] = useState<{ uri: string; label: string | null }[]>([]);

  useEffect(() => {
    void listGrantedFolders().then(setFolders);
    void refresh(sortKey);
  }, [refresh, sortKey]);

  const counts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const b of books) {
      const k = b.folder_path ?? 'Imported';
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [books]);

  const grant = async () => {
    const uri = await requestFolderAccess();
    if (!uri) {
      Alert.alert(
        'Manual import instead',
        'Folder access needs the dev-client build. In Expo Go, use the Add button to import files one batch at a time.',
        [{ text: 'OK' }],
      );
      return;
    }
    setFolders(await listGrantedFolders());
    await scan(uri);
  };

  const scan = async (uri: string) => {
    if (scanning) return;
    setScanning(true, { done: 0, total: 0, current: null });
    try {
      const ok = await checkFolderAccess(uri);
      if (!ok) {
        Alert.alert(
          'Folder access revoked',
          'ReadNest can no longer list this folder (permission revoked or folder moved). Grant it again, or forget it.',
          [
            { text: 'Forget folder', style: 'destructive', onPress: () => { void removeGrantedFolder(uri).then(() => listGrantedFolders().then(setFolders)); } },
            { text: 'Cancel', style: 'cancel' },
          ],
        );
        return;
      }
      const res = await scanFolder(uri, (p) => setScanning(true, p));
      setSettings({ lastScanAt: Date.now() });
      await refresh(sortKey);
      const bits = [`${res.found} indexed`];
      if (res.skipped > 0) bits.push(`${res.skipped} skipped`);
      let desc = `${bits.join(', ')}.`;
      if (res.errors.length > 0) desc += `\n\n${res.errors.length} issue${res.errors.length === 1 ? '' : 's'}:\n${res.errors.slice(0, 3).join('\n')}${res.errors.length > 3 ? '\n…' : ''}`;
      Alert.alert('Scan complete', desc);
    } catch (e) {
      Alert.alert('Scan failed', e instanceof Error ? e.message : 'Could not scan this folder.');
    } finally {
      setScanning(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 4 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: palette.foreground, fontFamily: 'CrimsonPro' }}>Folders</Text>
        <Text style={{ fontSize: 13, color: palette.muted, fontFamily: 'Inter' }}>
          Browse where your books live. Grant a folder once — ReadNest remembers it.
        </Text>
      </View>

      {scanning ? (
        <View style={{ margin: 16, backgroundColor: palette.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: palette.border, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="LoaderCircle" size={18} color={palette.primary} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: palette.foreground, fontFamily: 'Inter' }}>
              Scanning… {progress.total > 0 ? `${progress.done}/${progress.total}` : ''}
            </Text>
          </View>
          <ProgressBar value={progress.total ? progress.done / progress.total : 0} />
          {progress.current ? (
            <Text numberOfLines={1} style={{ fontSize: 12, color: palette.muted, fontFamily: 'Inter' }}>{progress.current}</Text>
          ) : null}
        </View>
      ) : null}

      <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 100 }}>
        <Button title="Grant folder access" icon="FolderPlus" onPress={grant} />
        {folders.map((f) => (
          <Pressable
            key={f.uri}
            onPress={() => scan(f.uri)}
            accessibilityRole="button"
            accessibilityLabel={`Rescan ${f.label ?? 'granted folder'}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: palette.border }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="FolderSync" size={20} color={palette.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: palette.foreground, fontFamily: 'Inter' }}>
                {f.label ?? 'Granted folder'}
              </Text>
              <Text numberOfLines={1} style={{ fontSize: 11, color: palette.faint, fontFamily: 'Inter' }}>
                {safeUri(f.uri)}
              </Text>
            </View>
            <Text style={{ fontSize: 12, fontWeight: '700', color: palette.primary, fontFamily: 'Inter' }}>SCAN</Text>
          </Pressable>
        ))}

        <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1, color: palette.muted, fontFamily: 'Inter', marginTop: 12 }}>
          ON THIS DEVICE
        </Text>
        {counts.length === 0 ? (
          <EmptyState icon="FolderOpen" title="No folders yet" desc="Imported books will appear here grouped by their source folder." />
        ) : null}
        {counts.map(([name, count]) => (
          <Pressable
            key={name}
            onPress={() => router.push('/(tabs)')}
            accessibilityRole="button"
            accessibilityLabel={`${name}, ${count} books`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: palette.border }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="Folder" size={20} color={palette.muted} />
            </View>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: '600', color: palette.foreground, fontFamily: 'Inter' }}>{name}</Text>
            <View style={{ backgroundColor: palette.surface2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: palette.muted, fontFamily: 'Inter' }}>{count}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
