import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/theme/ThemeProvider';
import { deleteQuote, listQuotes, upsertQuote } from '@/db/repositories';
import type { QuoteRow } from '@/db/schema';
import { quotesToMarkdown, shareMarkdown } from '@/lib/export';
import { EmptyState } from '@/components/ui/controls';
import { SearchBar } from '@/components/ui/SearchBar';
import { Sheet } from '@/components/ui/Sheet';
import { Pressable } from '@/components/ui/pressable';
import { Icon } from '@/components/ui/Icon';

type Item = QuoteRow & { book_title: string | null };

export default function NotesHub() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Item | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const load = useCallback(async () => {
    setItems(await listQuotes());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const filtered = items.filter((q) => {
    const s = query.trim().toLowerCase();
    if (!s) return true;
    return q.text.toLowerCase().includes(s) || (q.note ?? '').toLowerCase().includes(s) || (q.book_title ?? '').toLowerCase().includes(s);
  });

  const copy = async (q: Item) => {
    await Clipboard.setStringAsync(`“${q.text}”${q.book_title ? ` — ${q.book_title}` : ''}${q.note ? `\nNote: ${q.note}` : ''}`);
    Alert.alert('Copied', 'Quote copied to clipboard.');
  };

  const exportAll = async () => {
    if (filtered.length === 0) {
      Alert.alert('Nothing to export', 'No highlights match the current filter.');
      return;
    }
    const md = quotesToMarkdown(filtered, { title: query.trim() ? `ReadNest export — “${query.trim()}”` : 'ReadNest export' });
    const how = await shareMarkdown('readnest-highlights.md', md);
    if (how === 'copied') Alert.alert('Copied', 'Sharing is unavailable — the export was copied to your clipboard instead.');
  };

  const saveNote = async () => {
    if (!editing) return;
    await upsertQuote({ id: editing.id, book_id: editing.book_id, text: editing.text, note: noteDraft, color: editing.color, location: editing.location, chapter: editing.chapter });
    setEditing(null);
    await load();
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: palette.foreground, fontFamily: 'CrimsonPro' }}>Quotes & Notes</Text>
            <Text style={{ fontSize: 13, color: palette.muted, fontFamily: 'Inter' }}>
              Every highlight across every book, in one searchable place.
            </Text>
          </View>
          <Pressable
            onPress={exportAll}
            accessibilityRole="button" accessibilityLabel="Export highlights as Markdown"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 10 }}
          >
            <Icon name="Share2" size={16} color={palette.primary} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: palette.foreground, fontFamily: 'Inter' }}>Export</Text>
          </Pressable>
        </View>
        <SearchBar value={query} onChange={setQuery} placeholder="Search quotes and notes…" />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(q) => q.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
        ListEmptyComponent={
          <EmptyState
            icon="Highlighter"
            title="No highlights yet"
            desc="Long-press any word while reading to highlight it, add a note, or look it up."
            action={undefined}
          />
        }
        renderItem={({ item }) => (
          <View style={{ backgroundColor: palette.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: palette.border, borderLeftWidth: 4, borderLeftColor: item.color ?? palette.primary, gap: 8 }}>
            <Text style={{ fontSize: 16, color: palette.foreground, fontFamily: 'CrimsonPro', lineHeight: 24 }}>
              “{item.text}”
            </Text>
            {item.note ? (
              <View style={{ backgroundColor: palette.surface2, borderRadius: 8, padding: 10 }}>
                <Text style={{ fontSize: 13, color: palette.foreground, fontFamily: 'Inter', lineHeight: 19 }}>{item.note}</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Pressable
                onPress={() => router.push(`/reader/${item.book_id}`)}
                accessibilityRole="link" accessibilityLabel={`Open ${item.book_title ?? 'book'}`}
              >
                <Text numberOfLines={1} style={{ fontSize: 12, color: palette.primary, fontWeight: '600', fontFamily: 'Inter', maxWidth: 180 }}>
                  {item.book_title ?? 'Unknown book'}{item.chapter ? ` · ${item.chapter}` : ''}
                </Text>
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 2 }}>
                <Pressable onPress={() => { setEditing(item); setNoteDraft(item.note ?? ''); }} accessibilityRole="button" accessibilityLabel="Edit note" style={{ padding: 8 }}>
                  <Icon name="Pencil" size={17} color={palette.muted} />
                </Pressable>
                <Pressable onPress={() => copy(item)} accessibilityRole="button" accessibilityLabel="Copy quote" style={{ padding: 8 }}>
                  <Icon name="Copy" size={17} color={palette.muted} />
                </Pressable>
                <Pressable
                  onPress={() => Alert.alert('Delete quote?', 'This highlight and its note will be removed.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => { void deleteQuote(item.id).then(load); } },
                  ])}
                  accessibilityRole="button" accessibilityLabel="Delete quote"
                  style={{ padding: 8 }}
                >
                  <Icon name="Trash" size={17} color={palette.destructive} />
                </Pressable>
              </View>
            </View>
          </View>
        )}
      />

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title="Edit note">
        <Text numberOfLines={3} style={{ fontSize: 14, color: palette.muted, fontFamily: 'CrimsonPro', fontStyle: 'italic', marginBottom: 12 }}>
          “{editing?.text}”
        </Text>
        <TextInput
          value={noteDraft}
          onChangeText={setNoteDraft}
          placeholder="Your thoughts on this passage…"
          placeholderTextColor={palette.faint}
          multiline
          numberOfLines={4}
          accessibilityLabel="Note text"
          style={{ backgroundColor: palette.surface2, borderRadius: 12, padding: 12, fontSize: 15, color: palette.foreground, fontFamily: 'Inter', minHeight: 100, textAlignVertical: 'top', borderWidth: 1, borderColor: palette.border }}
        />
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <Pressable onPress={() => setEditing(null)} accessibilityRole="button" accessibilityLabel="Cancel" style={{ flex: 1, alignItems: 'center', padding: 14, borderRadius: 12, backgroundColor: palette.surface2 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: palette.foreground, fontFamily: 'Inter' }}>Cancel</Text>
          </Pressable>
          <Pressable onPress={saveNote} accessibilityRole="button" accessibilityLabel="Save note" style={{ flex: 1, alignItems: 'center', padding: 14, borderRadius: 12, backgroundColor: palette.primary }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: palette.onPrimary, fontFamily: 'Inter' }}>Save</Text>
          </Pressable>
        </View>
      </Sheet>
    </View>
  );
}
