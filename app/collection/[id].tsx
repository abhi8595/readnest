import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import type { BookRow } from '@/db/schema';
import {
  booksInCollection, createCollection, deleteCollection,
  listCollections, removeFromCollection,
} from '@/db/repositories';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { BookCard } from '@/components/library/BookCard';
import { Button, EmptyState } from '@/components/ui/controls';
import { Pressable } from '@/components/ui/pressable';
import { Icon } from '@/components/ui/Icon';

export default function CollectionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const refreshCollections = useLibraryStore((s) => s.refreshCollections);

  const [name, setName] = useState('');
  const [books, setBooks] = useState<BookRow[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (id === 'new') return;
    (async () => {
      const all = await listCollections();
      const found = all.find((c) => c.id === id);
      setName(found?.name ?? 'Shelf');
      setBooks(await booksInCollection(id));
    })();
  }, [id]);

  if (id === 'new') {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background, paddingTop: insets.top, padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: palette.foreground, fontFamily: 'CrimsonPro' }}>New shelf</Text>
        <TextInput
          value={draft} onChangeText={setDraft} placeholder="e.g. Sci-fi to read" placeholderTextColor={palette.faint}
          autoFocus accessibilityLabel="Shelf name"
          style={{ backgroundColor: palette.surface, borderRadius: 12, padding: 14, fontSize: 16, color: palette.foreground, fontFamily: 'Inter', borderWidth: 1, borderColor: palette.border }}
        />
        <Button
          title="Create shelf"
          icon="Plus"
          onPress={() => {
            if (!draft.trim()) return;
            void createCollection(draft.trim()).then(async (c) => {
              await refreshCollections();
              router.replace(`/collection/${c.id}`);
            });
          }}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.background, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6 }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" style={{ padding: 10 }}>
          <Icon name="ArrowLeft" size={22} color={palette.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: palette.foreground, fontFamily: 'Inter' }}>{name}</Text>
          <Text style={{ fontSize: 12, color: palette.muted, fontFamily: 'Inter' }}>{books.length} books</Text>
        </View>
        <Pressable
          onPress={() => Alert.alert('Delete shelf?', 'Books stay in your library — only the shelf is removed.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => { void deleteCollection(id).then(() => refreshCollections()).then(() => router.back()); } },
          ])}
          accessibilityRole="button" accessibilityLabel="Delete shelf"
          style={{ padding: 10 }}
        >
          <Icon name="Trash" size={20} color={palette.destructive} />
        </Pressable>
      </View>

      <FlatList
        data={books}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 60 }}
        ListEmptyComponent={
          <EmptyState icon="Bookmark" title="Empty shelf" desc="Open any book's About page and tap “Add to shelf” to fill it." />
        }
        renderItem={({ item }) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <BookCard book={item} mode="list" onOpen={(b) => router.push(`/reader/${b.id}`)} onLongPress={() => {}} />
            </View>
            <Pressable
              onPress={() => { void removeFromCollection(id, item.id).then(() => booksInCollection(id)).then(setBooks); }}
              accessibilityRole="button" accessibilityLabel={`Remove ${item.title} from shelf`}
              style={{ padding: 10 }}
            >
              <Icon name="X" size={18} color={palette.muted} />
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}
