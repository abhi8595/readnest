import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
import { useTheme } from '@/theme/ThemeProvider';
import type { BookRow } from '@/db/schema';
import {
  addToCollection, createCollection, deleteBook, getBook, listBookmarks,
  listCollections, listQuotes, renameBook, setRating, toggleFavorite,
} from '@/db/repositories';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { formatBytes, formatInfo } from '@/lib/formats';
import { Cover } from '@/components/ui/Cover';
import { Button, ProgressBar } from '@/components/ui/controls';
import { Sheet } from '@/components/ui/Sheet';
import { Pressable } from '@/components/ui/pressable';
import { Icon } from '@/components/ui/Icon';

export default function AboutDocument() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const refresh = useLibraryStore((s) => s.refresh);
  const refreshCollections = useLibraryStore((s) => s.refreshCollections);
  const sortKey = useSettingsStore((s) => s.sortKey);

  const [book, setBook] = useState<BookRow | null>(null);
  const [counts, setCounts] = useState({ marks: 0, quotes: 0 });
  const [renameOpen, setRenameOpen] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);
  const [newShelf, setNewShelf] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [authorDraft, setAuthorDraft] = useState('');

  useEffect(() => {
    (async () => {
      const b = await getBook(id);
      setBook(b);
      if (b) {
        setTitleDraft(b.title ?? '');
        setAuthorDraft(b.author ?? '');
        const [m, q, c] = await Promise.all([listBookmarks(id), listQuotes(id), listCollections()]);
        setCounts({ marks: m.length, quotes: q.length });
        setCollections(c);
      }
    })();
  }, [id]);

  if (!book) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: palette.muted, fontFamily: 'Inter' }}>Loading…</Text>
      </View>
    );
  }

  const info = formatInfo(book.format);
  const rows: [string, string][] = [
    ['Format', info.badge === info.label ? info.label : `${info.label} (${info.badge})`],
    ['Size', formatBytes(book.file_size)],
    ['Author', book.author ?? 'Unknown'],
    ['Series', book.series ?? '—'],
    ['Publisher', book.publisher ?? '—'],
    ['Language', (book.language ?? '—').toUpperCase()],
    ['Pages', book.page_count ? String(book.page_count) : '—'],
    ['Location', book.folder_path ?? 'Imported'],
    ['Added', new Date(book.date_added).toLocaleDateString()],
    ['Last read', book.last_read_at ? new Date(book.last_read_at).toLocaleString() : 'Never'],
    ['File', (book.file_uri.split('/').pop() ?? '').slice(0, 60)],
  ];

  return (
    <View style={{ flex: 1, backgroundColor: palette.background, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, gap: 4 }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" style={{ padding: 10 }}>
          <Icon name="ArrowLeft" size={22} color={palette.foreground} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700', color: palette.foreground, fontFamily: 'Inter' }}>About document</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }}>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <Cover uri={book.cover_uri} title={book.title} format={book.format} width={110} />
          <View style={{ flex: 1, gap: 6, justifyContent: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: palette.foreground, fontFamily: 'CrimsonPro', lineHeight: 25 }}>
              {book.title ?? 'Untitled'}
            </Text>
            <Text style={{ fontSize: 14, color: palette.muted, fontFamily: 'Inter' }}>{book.author ?? 'Unknown author'}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
              <View style={{ backgroundColor: palette.surface2, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: palette.muted, fontFamily: 'Inter' }}>{info.badge}</Text>
              </View>
              <View style={{ backgroundColor: palette.surface2, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: palette.muted, fontFamily: 'Inter' }}>{formatBytes(book.file_size)}</Text>
              </View>
            </View>
            <View style={{ marginTop: 4 }}>
              <ProgressBar value={book.reading_progress} />
              <Text style={{ fontSize: 11, color: palette.muted, fontFamily: 'Inter', marginTop: 3 }}>
                {Math.round(book.reading_progress * 100)}% · {counts.marks} bookmark{counts.marks === 1 ? '' : 's'} · {counts.quotes} quote{counts.quotes === 1 ? '' : 's'}
              </Text>
            </View>
          </View>
        </View>

        <Button title={book.reading_progress > 0 ? 'Continue reading' : 'Start reading'} icon="BookOpen" onPress={() => router.push(`/reader/${book.id}`)} />

        {/* F2 — star rating + re-read tracking */}
        <View style={{ backgroundColor: palette.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: palette.border, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: palette.foreground, fontFamily: 'Inter', marginRight: 6 }}>
              Rating
            </Text>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable
                key={star}
                onPress={() => {
                  const next = book.rating === star ? 0 : star;
                  void setRating(book.id, next).then(async () => setBook(await getBook(id)));
                }}
                accessibilityRole="radio"
                accessibilityLabel={`Rate ${star} star${star === 1 ? '' : 's'}`}
                accessibilityState={{ selected: (book.rating ?? 0) >= star }}
                style={{ padding: 4 }}
              >
                <Icon name="Star" size={24} color={(book.rating ?? 0) >= star ? palette.gold : palette.border} />
              </Pressable>
            ))}
            {(book.rating ?? 0) > 0 ? (
              <Text style={{ fontSize: 13, fontWeight: '700', color: palette.goldDeep, fontFamily: 'Inter', marginLeft: 4 }}>
                {book.rating}/5
              </Text>
            ) : null}
          </View>
          {(book.read_count ?? 0) > 0 ? (
            <Text style={{ fontSize: 13, color: palette.muted, fontFamily: 'Inter' }}>
              Finished {book.read_count} time{book.read_count === 1 ? '' : 's'}
              {book.last_finished_at ? ` · last ${new Date(book.last_finished_at).toLocaleDateString()}` : ''}
            </Text>
          ) : book.reading_progress >= 0.99 ? (
            <Text style={{ fontSize: 13, color: palette.muted, fontFamily: 'Inter' }}>Finished — nice.</Text>
          ) : null}
        </View>

        {book.description ? (
          <Text style={{ fontSize: 14, color: palette.foreground, fontFamily: 'Inter', lineHeight: 22 }}>{book.description}</Text>
        ) : null}

        <View style={{ backgroundColor: palette.surface, borderRadius: 12, borderWidth: 1, borderColor: palette.border, overflow: 'hidden' }}>
          {rows.map(([k, v], i) => (
            <View key={k} style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: palette.border }}>
              <Text style={{ width: 90, fontSize: 13, color: palette.muted, fontFamily: 'Inter' }}>{k}</Text>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '500', color: palette.foreground, fontFamily: 'Inter' }}>{v}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[
            { icon: 'Pencil', label: 'Rename', fn: () => setRenameOpen(true) },
            { icon: 'Bookmark', label: 'Add to shelf', fn: () => setShelfOpen(true) },
            { icon: 'Heart', label: book.is_favorite ? 'Unfavorite' : 'Favorite', fn: () => { void toggleFavorite(book.id).then(async () => setBook(await getBook(id))); } },
            { icon: 'Share2', label: 'Share file', fn: () => { void Sharing.shareAsync(book.file_uri); } },
          ].map((a) => (
            <Pressable
              key={a.label}
              onPress={a.fn}
              accessibilityRole="button" accessibilityLabel={a.label}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 }}
            >
              <Icon name={a.icon as 'Pencil'} size={17} color={palette.foreground} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: palette.foreground, fontFamily: 'Inter' }}>{a.label}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => Alert.alert('Delete book?', 'Removes it from ReadNest. The file stays on your device.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => { void deleteBook(book.id).then(() => refresh(sortKey)).then(() => router.back()); } },
            ])}
            accessibilityRole="button" accessibilityLabel="Delete book"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.destructive, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 }}
          >
            <Icon name="Trash" size={17} color={palette.destructive} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: palette.destructive, fontFamily: 'Inter' }}>Delete</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Rename */}
      <Sheet visible={renameOpen} onClose={() => setRenameOpen(false)} title="Rename">
        <Text style={{ fontSize: 12, fontWeight: '700', color: palette.muted, fontFamily: 'Inter', marginBottom: 6 }}>TITLE</Text>
        <TextInput
          value={titleDraft} onChangeText={setTitleDraft} accessibilityLabel="Book title"
          style={{ backgroundColor: palette.surface2, borderRadius: 12, padding: 12, fontSize: 15, color: palette.foreground, fontFamily: 'Inter', borderWidth: 1, borderColor: palette.border }}
        />
        <Text style={{ fontSize: 12, fontWeight: '700', color: palette.muted, fontFamily: 'Inter', marginBottom: 6, marginTop: 12 }}>AUTHOR</Text>
        <TextInput
          value={authorDraft} onChangeText={setAuthorDraft} accessibilityLabel="Book author"
          style={{ backgroundColor: palette.surface2, borderRadius: 12, padding: 12, fontSize: 15, color: palette.foreground, fontFamily: 'Inter', borderWidth: 1, borderColor: palette.border }}
        />
        <View style={{ marginTop: 14 }}>
          <Button
            title="Save"
            onPress={() => {
              void renameBook(book.id, titleDraft.trim() || 'Untitled', authorDraft.trim() || undefined).then(async () => {
                setBook(await getBook(id));
                setRenameOpen(false);
                void refresh(sortKey);
              });
            }}
          />
        </View>
      </Sheet>

      {/* Shelves */}
      <Sheet visible={shelfOpen} onClose={() => setShelfOpen(false)} title="Add to shelf">
        {collections.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => {
              void addToCollection(c.id, book.id).then(() => {
                setShelfOpen(false);
                Alert.alert('Added', `"${book.title}" added to ${c.name}.`);
              });
            }}
            accessibilityRole="menuitem" accessibilityLabel={`Add to ${c.name}`}
            style={{ paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: palette.border }}
          >
            <Text style={{ fontSize: 16, color: palette.foreground, fontFamily: 'Inter' }}>{c.name}</Text>
          </Pressable>
        ))}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <TextInput
            value={newShelf} onChangeText={setNewShelf} placeholder="New shelf name…" placeholderTextColor={palette.faint}
            accessibilityLabel="New shelf name"
            style={{ flex: 1, backgroundColor: palette.surface2, borderRadius: 12, padding: 12, fontSize: 15, color: palette.foreground, fontFamily: 'Inter', borderWidth: 1, borderColor: palette.border }}
          />
          <Pressable
            onPress={() => {
              if (!newShelf.trim()) return;
              void createCollection(newShelf.trim())
                .then((c) => addToCollection(c.id, book.id))
                .then(async () => {
                  setNewShelf('');
                  setShelfOpen(false);
                  await refreshCollections();
                  setCollections(await listCollections());
                });
            }}
            accessibilityRole="button" accessibilityLabel="Create shelf"
            style={{ backgroundColor: palette.primary, borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center' }}
          >
            <Text style={{ color: palette.onPrimary, fontWeight: '700', fontFamily: 'Inter' }}>Add</Text>
          </Pressable>
        </View>
      </Sheet>
    </View>
  );
}
