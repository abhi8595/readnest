import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { lookupWord, wiktionaryUrl, type DictEntry } from '@/lib/dictionary';
import { buildDeck, gradeWord, loadWordbook, saveWordbook, type DeckCard, type WordbookState } from '@/lib/wordbook';
import { recentDictLookups } from '@/db/repositories';
import { SearchBar } from '@/components/ui/SearchBar';
import { EmptyState } from '@/components/ui/controls';
import { Pressable } from '@/components/ui/pressable';
import { Icon } from '@/components/ui/Icon';

export default function DictionaryHub() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [entry, setEntry] = useState<DictEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<{ word: string; looked_up_at: number }[]>([]);
  // E3 — word-book review session state.
  const [wb, setWb] = useState<WordbookState>({});
  const [deck, setDeck] = useState<DeckCard[] | null>(null);
  const [cardIdx, setCardIdx] = useState(0);
  const [revealed, setRevealed] = useState<DictEntry | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [sessionKnew, setSessionKnew] = useState(0);

  useEffect(() => {
    void recentDictLookups().then(setHistory);
    void loadWordbook().then(setWb);
  }, [entry]);

  const search = async (w: string) => {
    const word = w.trim();
    if (!word) return;
    setLoading(true);
    try {
      setEntry(await lookupWord(word));
    } finally {
      setLoading(false);
    }
  };

  /* ── E3: SRS-lite review session over lookup history ── */
  const dueDeck = buildDeck(history, wb);
  const activeCard = deck && cardIdx < deck.length ? deck[cardIdx] : null;

  const startReview = () => {
    const d = buildDeck(history, wb);
    if (d.length === 0) return;
    setDeck(d);
    setCardIdx(0);
    setRevealed(null);
    setSessionKnew(0);
  };

  const revealCard = async (word: string) => {
    setRevealing(true);
    try {
      setRevealed(await lookupWord(word));
    } finally {
      setRevealing(false);
    }
  };

  const gradeCard = (knew: boolean) => {
    if (!activeCard) return;
    const next = gradeWord(wb, activeCard.word, knew);
    setWb(next);
    void saveWordbook(next);
    if (knew) setSessionKnew((n) => n + 1);
    setRevealed(null);
    setCardIdx((i) => i + 1);
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, gap: 4 }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close dictionary" style={{ padding: 10 }}>
          <Icon name="X" size={22} color={palette.foreground} />
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '700', color: palette.foreground, fontFamily: 'Inter' }}>Dictionary</Text>
      </View>

      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        <SearchBar value={query} onChange={setQuery} placeholder="Look up a word…" onSubmit={() => search(query)} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}>
        {loading ? (
          <Text style={{ color: palette.muted, fontFamily: 'Inter' }}>Looking up…</Text>
        ) : entry ? (
          <View style={{ backgroundColor: palette.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Text style={{ fontSize: 24, fontWeight: '800', color: palette.foreground, fontFamily: 'CrimsonPro' }}>{entry.word}</Text>
              {entry.phonetic ? <Text style={{ fontSize: 14, color: palette.muted, fontFamily: 'Inter' }}>{entry.phonetic}</Text> : null}
              <View style={{ backgroundColor: palette.surface2, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginLeft: 'auto' }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: palette.muted, fontFamily: 'Inter' }}>
                  {entry.source === 'offline' ? 'OFFLINE' : entry.source === 'api' ? 'ONLINE' : 'WIKTIONARY'}
                </Text>
              </View>
            </View>
            {entry.senses.length === 0 ? (
              <Text style={{ color: palette.muted, fontFamily: 'Inter' }}>
                No definition cached for this word.
              </Text>
            ) : entry.senses.map((s, i) => (
              <View key={i} style={{ gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', fontStyle: 'italic', color: palette.primary, fontFamily: 'Inter' }}>
                  {s.partOfSpeech}
                </Text>
                {s.definitions.map((d, j) => (
                  <Text key={j} style={{ fontSize: 14, color: palette.foreground, fontFamily: 'Inter', lineHeight: 21 }}>
                    {j + 1}. {d}
                  </Text>
                ))}
                {s.example ? (
                  <Text style={{ fontSize: 13, color: palette.muted, fontStyle: 'italic', fontFamily: 'CrimsonPro' }}>“{s.example}”</Text>
                ) : null}
              </View>
            ))}
            <Pressable
              onPress={() => Linking.openURL(wiktionaryUrl(entry.word))}
              accessibilityRole="link" accessibilityLabel={`Open ${entry.word} on Wiktionary`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}
            >
              <Icon name="ExternalLink" size={15} color={palette.primary} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: palette.primary, fontFamily: 'Inter' }}>Full entry on Wiktionary</Text>
            </Pressable>
          </View>
        ) : (
          <EmptyState icon="BookA" title="Look up any word" desc="Works offline for common words; online lookup fills in the rest. Words you tap in the reader land here automatically." />
        )}

        {history.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1, color: palette.muted, fontFamily: 'Inter' }}>
              WORD BOOK · {dueDeck.length} DUE
            </Text>
            <View style={{ backgroundColor: palette.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: palette.border, gap: 10 }}>
              {deck && activeCard ? (
                <>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: palette.muted, fontFamily: 'Inter' }}>
                    CARD {cardIdx + 1} OF {deck.length}{activeCard.isNew ? ' · NEW' : ` · BOX ${activeCard.box}`}
                  </Text>
                  <Text style={{ fontSize: 28, fontWeight: '800', color: palette.foreground, fontFamily: 'CrimsonPro', textAlign: 'center' }}>
                    {activeCard.word}
                  </Text>
                  {!revealed ? (
                    <Pressable
                      onPress={() => void revealCard(activeCard.word)}
                      accessibilityRole="button" accessibilityLabel="Show meaning"
                      style={{ alignItems: 'center', padding: 13, borderRadius: 12, backgroundColor: palette.surface2, opacity: revealing ? 0.6 : 1 }}
                    >
                      <Text style={{ fontWeight: '700', color: palette.primary, fontFamily: 'Inter' }}>
                        {revealing ? 'Looking up…' : 'Show meaning'}
                      </Text>
                    </Pressable>
                  ) : (
                    <>
                      <Text style={{ fontSize: 14, color: palette.foreground, fontFamily: 'Inter', lineHeight: 21 }}>
                        {revealed.senses.length === 0
                          ? 'No offline definition — open the full entry below.'
                          : revealed.senses.slice(0, 2).map((s) => s.definitions[0]).filter(Boolean).join(' / ')}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <Pressable
                          onPress={() => gradeCard(false)}
                          accessibilityRole="button" accessibilityLabel="Forgot this word"
                          style={{ flex: 1, alignItems: 'center', padding: 13, borderRadius: 12, backgroundColor: palette.surface2 }}
                        >
                          <Text style={{ fontWeight: '700', color: palette.destructive, fontFamily: 'Inter' }}>Again</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => gradeCard(true)}
                          accessibilityRole="button" accessibilityLabel="Knew this word"
                          style={{ flex: 1, alignItems: 'center', padding: 13, borderRadius: 12, backgroundColor: palette.primary }}
                        >
                          <Text style={{ fontWeight: '700', color: palette.onPrimary, fontFamily: 'Inter' }}>Knew it</Text>
                        </Pressable>
                      </View>
                    </>
                  )}
                  <Pressable
                    onPress={() => setDeck(null)}
                    accessibilityRole="button" accessibilityLabel="End review session"
                    style={{ alignItems: 'center', padding: 8 }}
                  >
                    <Text style={{ fontSize: 13, color: palette.muted, fontFamily: 'Inter' }}>End session</Text>
                  </Pressable>
                </>
              ) : deck && !activeCard ? (
                <>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: palette.foreground, fontFamily: 'Inter', textAlign: 'center' }}>
                    Session complete
                  </Text>
                  <Text style={{ fontSize: 14, color: palette.muted, fontFamily: 'Inter', textAlign: 'center' }}>
                    {sessionKnew} of {deck.length} known — the rest return tomorrow.
                  </Text>
                  <Pressable
                    onPress={() => setDeck(null)}
                    accessibilityRole="button" accessibilityLabel="Back to dictionary"
                    style={{ alignItems: 'center', padding: 13, borderRadius: 12, backgroundColor: palette.primary }}
                  >
                    <Text style={{ fontWeight: '700', color: palette.onPrimary, fontFamily: 'Inter' }}>Done</Text>
                  </Pressable>
                </>
              ) : dueDeck.length > 0 ? (
                <>
                  <Text style={{ fontSize: 14, color: palette.foreground, fontFamily: 'Inter', lineHeight: 21 }}>
                    {dueDeck.length} word{dueDeck.length === 1 ? '' : 's'} from your reader lookups {dueDeck.length === 1 ? 'is' : 'are'} due for review.
                  </Text>
                  <Pressable
                    onPress={startReview}
                    accessibilityRole="button" accessibilityLabel={`Start review, ${dueDeck.length} cards`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: palette.primary, borderRadius: 12, padding: 13, justifyContent: 'center' }}
                  >
                    <Icon name="GraduationCap" size={18} color={palette.onPrimary} />
                    <Text style={{ color: palette.onPrimary, fontWeight: '700', fontFamily: 'Inter' }}>
                      Review {dueDeck.length} word{dueDeck.length === 1 ? '' : 's'}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <Text style={{ fontSize: 14, color: palette.muted, fontFamily: 'Inter', lineHeight: 21 }}>
                  All caught up — looked-up words return here on a spaced schedule (1 → 3 → 7 → 14 → 30 days).
                </Text>
              )}
            </View>
            <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1, color: palette.muted, fontFamily: 'Inter' }}>
              RECENT LOOKUPS
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {history.map((h) => (
                <Pressable
                  key={h.word}
                  onPress={() => { setQuery(h.word); void search(h.word); }}
                  accessibilityRole="button" accessibilityLabel={`Look up ${h.word} again`}
                  style={{ backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 }}
                >
                  <Text style={{ fontSize: 14, color: palette.foreground, fontFamily: 'Inter' }}>{h.word}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
