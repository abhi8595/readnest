import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import type { BookRow } from '@/db/schema';
import { searchBooks } from '@/db/repositories';
import { FORMATS } from '@/lib/formats';
import { BookCard } from '@/components/library/BookCard';
import { SearchBar } from '@/components/ui/SearchBar';
import { Chip, EmptyState } from '@/components/ui/controls';
import { Pressable } from '@/components/ui/pressable';
import { Icon } from '@/components/ui/Icon';

export default function Search() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState<string | null>(null);
  const [results, setResults] = useState<BookRow[]>([]);
  const [searched, setSearched] = useState(false);
  const searchSeq = useRef(0);

  useEffect(() => {
    if (!query.trim() && !format) {
      setResults([]);
      setSearched(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const seq = ++searchSeq.current;
      try {
        const all = await searchBooks(query.trim());
        // Drop out-of-order responses (slow FTS/LIKE overtaken by newer keystrokes).
        if (cancelled || seq !== searchSeq.current) return;
        setResults(format ? all.filter((b) => b.format === format) : all);
        setSearched(true);
      } catch {
        if (!cancelled && seq === searchSeq.current) { setResults([]); setSearched(true); }
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, format]);

  const hint = useMemo(
    () => (searched ? `${results.length} result${results.length === 1 ? '' : 's'}` : 'Search across your entire nest'),
    [searched, results.length],
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.background, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: palette.foreground, fontFamily: 'CrimsonPro' }}>Search</Text>
          <Pressable
            onPress={() => router.push('/dictionary')}
            accessibilityRole="button" accessibilityLabel="Open dictionary"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}
          >
            <Icon name="BookA" size={16} color={palette.primary} />
            <Text style={{ fontSize: 12, fontWeight: '700', color: palette.foreground, fontFamily: 'Inter' }}>Dictionary</Text>
          </Pressable>
        </View>
        <SearchBar value={query} onChange={setQuery} placeholder="Title, author, series, format…" autoFocus={false} />
        <FlatList
          horizontal
          data={[{ format: '__all', label: 'All', badge: 'ALL' }, ...FORMATS] as { format: string; label: string; badge: string }[]}
          keyExtractor={(f) => f.format}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => {
            const id = item.format;
            const label = item.badge;
            const active = (format ?? '__all') === id;
            return <Chip label={label} active={active} onPress={() => setFormat(id === '__all' ? null : id)} />;
          }}
        />
        <Text style={{ fontSize: 12, color: palette.muted, fontFamily: 'Inter' }}>{hint}</Text>
      </View>

      <FlatList
        data={results}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
        ListEmptyComponent={
          searched ? (
            <EmptyState icon="SearchX" title="No matches" desc="Try a different spelling, or clear the format filter." />
          ) : (
            <EmptyState icon="Search" title="Find anything" desc="Books match on title, author, series, format and folder. Looking up a word instead? Open the dictionary." />
          )
        }
        renderItem={({ item }) => (
          <BookCard book={item} mode="list" onOpen={(b) => router.push(`/reader/${b.id}`)} onLongPress={(b) => router.push(`/book/${b.id}`)} />
        )}
      />
    </View>
  );
}
