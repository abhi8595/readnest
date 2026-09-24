import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Brightness from 'expo-brightness';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Font from 'expo-font';
import * as SecureStore from 'expo-secure-store';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useTheme } from '@/theme/ThemeProvider';
import { highlightColors } from '@/theme/tokens';
import { useReaderStore } from '@/stores/useReaderStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { usePremiumStore } from '@/stores/usePremiumStore';
import { useTTSStore } from '@/stores/useTTSStore';
import { addBookmark, getBook, getReadingSettings, listBookmarks, logSession, saveReadingSettings, updateProgress, upsertQuote } from '@/db/repositories';
import { parseEpub, type EpubChapter } from '@/lib/epub';
import { extractTextChapters } from '@/lib/textextract';
import { extractCbz, tryExtractCbr, type ComicPage } from '@/lib/comic';
import { extractMobiChapters, parseMobiHeader } from '@/lib/mobi';
import { MAX_BOOK_BYTES } from '@/lib/import';
import {
  bgJump, bgPause, bgResume, buildTtsMap, estimateTimeLeft, isBackgroundTtsSupported, speakSentences,
  splitSentences, startBackgroundTts, stopBackgroundTts, stopSpeaking,
} from '@/lib/tts';
import { lookupWord } from '@/lib/dictionary';
import { AI_KEYS_SECURE_KEY, explainPassage, type AiConfig } from '@/lib/explain';
import { TRANSLATE_KEYS_SECURE_KEY, extractParagraphs, translateText } from '@/lib/translate';
import { autoTocFromPdfPages, extractPdfText, searchPdfPages } from '@/lib/pdf';
import { getReaderFontCss, readerFontFamily } from '@/lib/readerFonts';
import { AppDirs, ensureDirs } from '@/lib/files';
import { ReaderWebView, type ReaderHandle } from '@/components/reader/ReaderWebView';
import { PdfView } from '@/components/reader/PdfView';
import { ComicViewer, type ComicViewerHandle } from '@/components/reader/ComicViewer';
import { ReaderChrome } from '@/components/reader/ReaderChrome';
import { ThumbnailsStrip } from '@/components/reader/ThumbnailsStrip';
import { DisplaySheet, HighlightColors, ThemeSheet, TocSheet } from '@/components/reader/ReaderSheets';
import { TTSBar } from '@/components/reader/TTSBar';
import { ProgressBar } from '@/components/ui/controls';
import { Sheet } from '@/components/ui/Sheet';
import { Pressable } from '@/components/ui/pressable';
import { Icon } from '@/components/ui/Icon';

type DocKind = 'reflow' | 'pdf' | 'comic' | 'external';

export default function Reader() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const readerRef = useRef<ReaderHandle>(null);

  const book = useReaderStore((s) => s.book);
  const openBook = useReaderStore((s) => s.openBook);
  const setPosition = useReaderStore((s) => s.setPosition);
  const setToc = useReaderStore((s) => s.setToc);
  const toggleChrome = useReaderStore((s) => s.toggleChrome);
  const applySettings = useReaderStore((s) => s.applySettings);
  const font = useReaderStore((s) => s.font);
  const orientation = useReaderStore((s) => s.orientation);
  const page = useReaderStore((s) => s.page);
  const pageCount = useReaderStore((s) => s.pageCount);
  const location = useReaderStore((s) => s.location);
  const customFontUri = useReaderStore((s) => s.customFontUri);
  const settings = useSettingsStore();
  const setPaywallSource = usePremiumStore((s) => s.setPaywallSource);
  const isPremium = usePremiumStore((s) => s.isPremium);
  const tts = useTTSStore();
  const comicRef = useRef<ComicViewerHandle>(null);
  const [fontFaceCss, setFontFaceCss] = useState('');
  const [pdfTarget, setPdfTarget] = useState<number | null>(null);

  const [kind, setKind] = useState<DocKind>('reflow');
  const [chapters, setChapters] = useState<EpubChapter[]>([]);
  const [comicPages, setComicPages] = useState<ComicPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [externalMsg, setExternalMsg] = useState<string | null>(null);

  const [themeOpen, setThemeOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [marksOpen, setMarksOpen] = useState(false);
  const [marks, setMarks] = useState<{ id: string; location: string; label: string | null }[]>([]);
  const [selectOpen, setSelectOpen] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  // E1 — tap-sentence translate result for the current selection.
  const [transResult, setTransResult] = useState<string | null>(null);
  const [transLoading, setTransLoading] = useState(false);
  // F4 — AI explanation for the current selection.
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [dictOpen, setDictOpen] = useState(false);
  const [dictWord, setDictWord] = useState('');
  const [dictResult, setDictResult] = useState<string>('…');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [sleepOpen, setSleepOpen] = useState(false);
  // B3 — PDF text layer (lazy): per-page text + whether a layer exists.
  // null = not extracted yet; [] = extracted but no text layer found.
  const [pdfPages, setPdfPages] = useState<string[] | null>(null);

  const ttsSentences = useRef<string[]>([]);
  const ttsPara = useRef<number[]>([]);
  const ttsBreaks = useRef<number[]>([]);
  const ttsIndex = useRef(0);
  const sessionStart = useRef<number>(Date.now());
  const progressStart = useRef<number>(0);
  const origBrightness = useRef<number | null>(null);

  const needPremium = useCallback((source: string) => {
    setPaywallSource(source);
    router.push('/paywall');
  }, [router, setPaywallSource]);

  /* ── Load book ─────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const b = await getBook(id);
        if (!b) throw new Error('Book not found in library.');
        const saved = await getReadingSettings(id);
        openBook(b, {
          theme: (saved?.theme as never) ?? settings.defaultTheme,
          font: (saved?.font_family as never) ?? settings.defaultFont,
          customFontUri: saved?.custom_font_uri ?? null,
          fontSize: saved?.font_size ?? settings.defaultFontSize,
          fontWeight: saved?.font_weight ?? 400,
          lineSpacing: saved?.line_spacing ?? settings.defaultLineSpacing,
          margin: (saved?.margin as never) ?? settings.defaultMargin,
          hyphenation: (saved?.hyphenation ?? 1) === 1,
          pageMode: (saved?.page_mode as never) ?? settings.pageMode,
          orientation: (saved?.orientation as never) ?? 'system',
          focusMode: (saved?.focus_mode as never) ?? settings.focusMode ?? 'off',
          bionic: (saved?.bionic ?? 0) === 1 ? true : settings.bionic ?? false,
          irlenTint: (saved?.irlen_tint as never) ?? settings.irlenTint ?? 'none',
        });
        progressStart.current = b.reading_progress ?? 0;
        sessionStart.current = Date.now();
        // C3 — per-book mid-sentence resume (persisted as tts_index).
        ttsIndex.current = typeof saved?.tts_index === 'number' ? Math.max(0, saved.tts_index) : 0;

        // Pure-JS parsers load the whole file as base64 on the JS thread —
        // refuse oversized reflow/comic files before they can OOM the app.
        if ((b.format === 'epub' || b.format === 'cbz' || b.format === 'mobi' || b.format === 'azw3') &&
            b.file_size > MAX_BOOK_BYTES) {
          throw new Error(`This file (${Math.round(b.file_size / 1048576)}MB) exceeds the 300MB in-app limit. Split it or read it on desktop.`);
        }

        if (b.format === 'epub') {
          const parsed = await parseEpub(b.file_uri);
          if (cancelled) return;
          setChapters(parsed.chapters);
          setToc(parsed.toc.map((t) => ({ id: t.id, label: t.label, href: t.href, level: t.level })));
          setKind('reflow');
        } else if (b.format === 'txt' || b.format === 'fb2' || b.format === 'docx' || b.format === 'odt') {
          const ch = await extractTextChapters(b.file_uri, b.format);
          if (cancelled) return;
          setChapters(ch);
          setToc(ch.map((c, i) => ({ id: c.id, label: c.label, href: c.href, level: 0 })));
          setKind('reflow');
        } else if (b.format === 'mobi' || b.format === 'azw3') {
          const meta = await parseMobiHeader(b.file_uri).catch(() => null);
          if (meta?.hasDrm) {
            setExternalMsg('This Kindle file is DRM-protected and locked to another device. ReadNest cannot open DRM files — try the Kindle app or import a DRM-free copy.');
            setKind('external');
          } else {
            const { chapters: ch } = await extractMobiChapters(b.file_uri);
            if (cancelled) return;
            setChapters(ch);
            setToc(ch.map((c) => ({ id: c.id, label: c.label, href: c.href, level: 0 })));
            setKind('reflow');
          }
        } else if (b.format === 'pdf') {
          setKind('pdf');
        } else if (b.format === 'cbz') {
          const pages = await extractCbz(b.file_uri, b.id);
          if (cancelled) return;
          setComicPages(pages);
          setKind('comic');
          const pMatch = /^p:(\d+)$/.exec(b.last_location ?? '');
          const initPage = pMatch?.[1] ? Math.max(1, parseInt(pMatch[1], 10)) : 1;
          const pageTarget = pages.length > 0 ? Math.min(pages.length, initPage) : 1;
          if (pages.length > 0) setPosition({ progress: b.reading_progress ?? 0, page: pageTarget, pageCount: pages.length, location: `p:${pageTarget}` });
        } else if (b.format === 'cbr') {
          const pages = await tryExtractCbr(b.file_uri, b.id);
          if (pages) {
            if (cancelled) return;
            setComicPages(pages);
            setKind('comic');
          } else {
            setExternalMsg('CBR (RAR-compressed comics) need conversion on this device. Tip: convert to CBZ or PDF on your computer and re-import — CBZ opens natively with fast paging.');
            setKind('external');
          }
        } else {
          const names: Record<string, string> = {
            doc: 'Legacy Word (.doc)', chm: 'Compiled Help (.chm)', djvu: 'DjVu',
          };
          setExternalMsg(`${names[b.format] ?? b.format.toUpperCase()} files are kept in your library with full metadata, but in-app rendering isn't available. Open with an external app, or convert to EPUB/PDF for the full ReadNest experience (themes, TTS, highlights).`);
          setKind('external');
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not open this book.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /* ── B3: PDF text layer + auto-TOC (background, never blocks open) ── */
  useEffect(() => {
    if (kind !== 'pdf' || !book) return;
    let cancelled = false;
    setPdfPages(null);
    void (async () => {
      const pages = await extractPdfText(book.file_uri);
      if (cancelled) return;
      setPdfPages(pages);
      if (pages.some((p) => p.trim().length > 0)) {
        const auto = autoTocFromPdfPages(pages);
        if (auto.length > 0 && useReaderStore.getState().toc.length === 0) {
          setToc(auto);
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, book?.id]);

  /* ── E2: bilingual accordion — pre-translate current chapter ── */
  useEffect(() => {
    if (!settings.bilingual || kind !== 'reflow' || chapters.length === 0 || !book) {
      if (!settings.bilingual) readerRef.current?.clearBilingual();
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const raw = await SecureStore.getItemAsync(TRANSLATE_KEYS_SECURE_KEY);
        const stored = raw ? (JSON.parse(raw) as { deeplKey?: string; googleKey?: string }) : {};
        const gs = useSettingsStore.getState();
        const hasKey = gs.translateProvider === 'deepl' ? stored.deeplKey : stored.googleKey;
        if (!hasKey) return; // no key — DisplaySheet explains; stay monolingual.
        const loc = useReaderStore.getState().location;
        const items = extractParagraphs(chapters, loc);
        const out: { pIndex: number; text: string }[] = [];
        for (const it of items) {
          if (cancelled) return;
          try {
            const tr = await translateText(it.text, gs.translateTarget, { provider: gs.translateProvider, ...stored }, book.id);
            out.push({ pIndex: it.index, text: tr });
          } catch { /* one bad paragraph must not kill the chapter */ }
        }
        if (!cancelled && out.length > 0) readerRef.current?.setBilingual(out);
      } catch { /* offline — stay monolingual */ }
    })();
    return () => { cancelled = true; };
  }, [settings.bilingual, settings.translateTarget, kind, chapters, book, location]);

  /* ── Persist position + session on exit / background ── */
  const persist = useCallback(async () => {
    const st = useReaderStore.getState();
    if (!st.book) return;
    const secs = Math.max(0, Math.round((Date.now() - sessionStart.current) / 1000));
    await updateProgress(st.book.id, st.progress, st.location ?? (st.pageCount ? `p:${st.page}` : undefined)).catch(() => {});
    if (secs >= 5) {
      await logSession(st.book.id, secs, progressStart.current, st.progress).catch(() => {});
    }
    await saveReadingSettings({
      book_id: st.book.id,
      theme: useReaderStore.getState().theme,
      font_family: useReaderStore.getState().font,
      custom_font_uri: useReaderStore.getState().customFontUri,
      font_size: useReaderStore.getState().fontSize,
      font_weight: useReaderStore.getState().fontWeight,
      line_spacing: useReaderStore.getState().lineSpacing,
      margin: useReaderStore.getState().margin,
      hyphenation: useReaderStore.getState().hyphenation ? 1 : 0,
      brightness: null,
      orientation: useReaderStore.getState().orientation,
      page_mode: useReaderStore.getState().pageMode,
      tts_rate: useTTSStore.getState().rate,
      tts_voice: null,
      focus_mode: useReaderStore.getState().focusMode,
      bionic: useReaderStore.getState().bionic ? 1 : 0,
      irlen_tint: useReaderStore.getState().irlenTint,
      tts_index: ttsIndex.current,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') void persist();
    });
    return () => {
      sub.remove();
      void persist();
      // Background narration intentionally survives leaving the reader —
      // only foreground speech is tied to this screen's lifetime.
      if (!useTTSStore.getState().background) {
        void stopSpeaking();
        tts.reset();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist]);

  const goBack = useCallback(() => {
    void persist().finally(() => {
      if (!useTTSStore.getState().background) {
        void stopSpeaking();
        tts.reset();
      }
      router.back();
    });
  }, [persist, router, tts]);

  /* ── Device integrations: brightness, orientation, keep-awake ── */
  useEffect(() => {
    void Brightness.getBrightnessAsync()
      .then((v) => { origBrightness.current = v; })
      .catch(() => { origBrightness.current = null; });
    return () => {
      if (origBrightness.current != null) {
        void Brightness.setBrightnessAsync(origBrightness.current).catch(() => {});
      }
      void ScreenOrientation.unlockAsync().catch(() => {});
      deactivateKeepAwake('readnest-reader');
    };
  }, []);

  useEffect(() => {
    if (settings.brightnessOverride != null) {
      void Brightness.setBrightnessAsync(settings.brightnessOverride).catch(() => {});
    } else if (origBrightness.current != null) {
      void Brightness.setBrightnessAsync(origBrightness.current).catch(() => {});
    }
  }, [settings.brightnessOverride]);

  useEffect(() => {
    void (async () => {
      try {
        if (orientation === 'portrait') {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        } else if (orientation === 'landscape') {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        } else {
          await ScreenOrientation.unlockAsync();
        }
      } catch { /* unsupported device */ }
    })();
  }, [orientation]);

  useEffect(() => {
    if (settings.keepScreenOn) void activateKeepAwakeAsync('readnest-reader').catch(() => {});
    else deactivateKeepAwake('readnest-reader');
  }, [settings.keepScreenOn]);

  useEffect(() => {
    let live = true;
    void getReaderFontCss(font, customFontUri).then((css) => {
      if (live) setFontFaceCss(css);
    });
    return () => { live = false; };
  }, [font, customFontUri]);

  /* ── B1: Article mode — reflow extracted PDF text through the WebView ── */
  const pdfArticleChapters = useMemo(() => {
    if (kind !== 'pdf' || !settings.pdfArticleMode || !pdfPages) return null;
    if (!pdfPages.some((t) => t.trim().length > 0)) return null;
    return pdfPages.map((t, i) => {
      const paras = t.split(/\n+/).map((s) => s.trim()).filter(Boolean);
      const html = paras.length > 0
        ? paras.slice(0, 200).map((s) => `<p>${escHtml(s.slice(0, 2000))}</p>`).join('')
        : '<p></p>';
      return { id: `pdf-p${i + 1}`, href: `pdf:${i + 1}`, label: `Page ${i + 1}`, html };
    });
  }, [kind, settings.pdfArticleMode, pdfPages]);

  /** B1 crop presets tighten reflow width (native pages can't be cropped). */
  const articleMarginPx = useMemo(() => {
    if (!pdfArticleChapters) return null;
    const order = [52, 36, 24, 16];
    const base = { S: 16, M: 24, L: 36, XL: 52 }[useReaderStore.getState().margin] ?? 24;
    const step = settings.pdfCrop === 'none' ? 0 : settings.pdfCrop === 'narrow' ? 1 : 2;
    const idx = Math.min(order.length - 1, Math.max(0, order.indexOf(base) - step));
    return order[idx] ?? base;
  }, [pdfArticleChapters, settings.pdfCrop]);

  const onPdfArticlePosition = useCallback((p: { progress: number; chapterId: string | null; chapterLabel: string | null }) => {
    const m = /^pdf-p(\d+)$/.exec(p.chapterId ?? '');
    const page = m?.[1] ? parseInt(m[1], 10) : undefined;
    setPosition({
      progress: p.progress,
      location: page ? `p:${page}` : undefined,
      page,
      pageCount: pdfPages?.length ?? undefined,
      chapterLabel: p.chapterLabel,
    });
  }, [setPosition, pdfPages]);

  /* ── Premium strip model ─────────────────────────────── */
  const strip = useMemo(() => {
    if (kind === 'reflow' && chapters.length > 0) {
      const items = chapters.map((c, i) => ({
        id: c.id,
        label: c.label || `Chapter ${i + 1}`,
        sub: `${i + 1} of ${chapters.length}`,
      }));
      return { items, active: Math.max(0, chapters.findIndex((c) => c.id === location)) };
    }
    if ((kind === 'pdf' || kind === 'comic') && pageCount) {
      const lo = Math.max(1, page - 14);
      const hi = Math.min(pageCount, page + 14);
      const items: { id: string; label: string }[] = [];
      for (let p = lo; p <= hi; p++) items.push({ id: `p${p}`, label: `p. ${p}` });
      return { items, active: page - lo };
    }
    return { items: [] as { id: string; label: string; sub?: string }[], active: 0 };
  }, [kind, chapters, location, page, pageCount]);

  const startPageNum = useMemo(() => {
    const m = /^p:(\d+)$/.exec(book?.last_location ?? '');
    return m?.[1] ? Math.max(1, parseInt(m[1], 10)) : 1;
  }, [book?.last_location]);

  const jumpStrip = useCallback((i: number) => {
    const it = strip.items[i];
    if (!it) return;
    if (kind === 'reflow') {
      readerRef.current?.gotoChapter(it.id);
    } else if (kind === 'pdf') {
      const m = /^p(\d+)$/.exec(it.id);
      if (m?.[1]) {
        const page = parseInt(m[1], 10);
        if (pdfArticleChapters) readerRef.current?.gotoChapter(`pdf-p${page}`);
        else setPdfTarget(page);
      }
    } else if (kind === 'comic') {
      const m = /^p(\d+)$/.exec(it.id);
      if (m?.[1]) comicRef.current?.scrollTo(parseInt(m[1], 10) - 1);
    }
  }, [strip.items, kind, pdfArticleChapters]);

  const pickCustomFont = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['font/ttf', 'font/otf', 'application/octet-stream'],
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const asset = res.assets[0];
      if (!asset) return;
      const name = (asset.name ?? 'font.ttf').toLowerCase();
      if (!name.endsWith('.ttf') && !name.endsWith('.otf')) {
        Alert.alert('Unsupported file', 'Please choose a .ttf or .otf font file.');
        return;
      }
      await ensureDirs();
      const dest = `${AppDirs.fonts}${Date.now()}_${asset.name ?? 'font.ttf'}`;
      await FileSystem.copyAsync({ from: asset.uri, to: dest });
      await Font.loadAsync({ CustomUpload: dest });
      applySettings({ font: 'custom', customFontUri: dest });
      Alert.alert('Font installed', 'Your custom font is now applied to this book.');
    } catch (e) {
      Alert.alert('Font install failed', e instanceof Error ? e.message : 'Could not install this font.');
    }
  }, [applySettings]);

  /* ── Position handlers ─────────────────────────────── */
  const onReflowPosition = useCallback((p: { progress: number; chapterId: string | null; chapterLabel: string | null }) => {
    setPosition({ progress: p.progress, location: p.chapterId ?? undefined, chapterLabel: p.chapterLabel });
  }, [setPosition]);

  const onPagedPosition = useCallback((p: { progress: number; page: number; pageCount: number }) => {
    setPosition({ progress: p.progress, page: p.page, pageCount: p.pageCount, location: `p:${p.page}` });
  }, [setPosition]);

  /* ── Selection → highlight / note / dictionary ─────── */
  const onSelect = useCallback((text: string) => {
    setSelectedText(text);
    setNoteDraft('');
    setTransResult(null);
    setAiResult(null);
    setSelectOpen(true);
  }, []);

  /* ── E1: translate the current selection (BYOK, cached per book) ── */
  const translateSelection = useCallback(async () => {
    const st = useReaderStore.getState();
    if (!st.book || transLoading) return;
    setTransLoading(true);
    setTransResult(null);
    try {
      const raw = await SecureStore.getItemAsync(TRANSLATE_KEYS_SECURE_KEY);
      const stored = raw ? (JSON.parse(raw) as { deeplKey?: string; googleKey?: string }) : {};
      const gs = useSettingsStore.getState();
      const out = await translateText(
        selectedText, gs.translateTarget,
        { provider: gs.translateProvider, ...stored },
        st.book.id,
      );
      setTransResult(out);
    } catch (e) {
      setTransResult(e instanceof Error ? `Could not translate: ${e.message}` : 'Translation failed.');
    } finally {
      setTransLoading(false);
    }
  }, [selectedText, transLoading]);

  /* ── F4: explain the current selection (BYOK AI, cached per book) ── */
  const explainSelection = useCallback(async () => {
    const st = useReaderStore.getState();
    if (!st.book || aiLoading) return;
    setAiLoading(true);
    setAiResult(null);
    try {
      const raw = await SecureStore.getItemAsync(AI_KEYS_SECURE_KEY);
      const stored = raw ? (JSON.parse(raw) as Partial<AiConfig>) : {};
      const out = await explainPassage(
        selectedText, st.book.title ?? null,
        {
          baseUrl: stored.baseUrl ?? '',
          model: stored.model ?? '',
          apiKey: stored.apiKey ?? '',
        },
        st.book.id,
      );
      setAiResult(out);
    } catch (e) {
      setAiResult(e instanceof Error ? `Could not explain: ${e.message}` : 'Explanation failed.');
    } finally {
      setAiLoading(false);
    }
  }, [selectedText, aiLoading]);

  const saveHighlight = useCallback(async (color: string) => {
    const st = useReaderStore.getState();
    if (!st.book) return;
    const curLoc = st.location ?? (st.pageCount ? `p:${st.page}` : null);
    const curChap = st.chapterLabel ?? (st.pageCount ? `Page ${st.page}` : null);
    await upsertQuote({
      book_id: st.book.id, text: selectedText, note: noteDraft || null,
      color, location: curLoc, chapter: curChap,
    });
    setSelectOpen(false);
    setSelectedText('');
  }, [selectedText, noteDraft]);

  const openDict = useCallback(async (word: string) => {
    const w = word.split(/\s+/)[0] ?? word;
    setDictWord(w);
    setDictResult('…');
    setDictOpen(true);
    const entry = await lookupWord(w, useReaderStore.getState().book?.id);
    if (!entry) setDictResult('No definition found.');
    else if (entry.senses.length === 0) setDictResult(`No offline definition for “${w}”. Open Wiktionary from the Dictionary hub for the full entry.`);
    else {
      setDictResult(
        entry.senses.map((s) => `${s.partOfSpeech}\n• ${s.definitions.join('\n• ')}${s.example ? `\n“${s.example}”` : ''}`).join('\n\n'),
      );
    }
  }, []);

  /* ── TTS ───────────────────────────────────────────── */
  const ttsMap = useMemo(() => {
    // B4 — Article-mode PDFs narrate like reflow books (full text map).
    const ch = kind === 'reflow' ? chapters : (pdfArticleChapters ?? []);
    if (ch.length === 0) return { sentences: [] as string[], paraIndex: [] as number[], chapterBreaks: [] as number[] };
    return buildTtsMap(ch);
  }, [kind, chapters, pdfArticleChapters]);

  const markSpoken = useCallback((i: number) => {
    ttsIndex.current = i;
    // C2 — live time-left from word-rate estimate.
    const left = estimateTimeLeft(ttsSentences.current, i + 1, useTTSStore.getState().rate);
    tts.set({ sentenceIndex: i, timeLeft: left });
    const p = ttsPara.current[i];
    readerRef.current?.markTts(typeof p === 'number' ? p : i);
  }, [tts]);

  const startTts = useCallback((fromStart = false) => {
    if (kind === 'comic' || kind === 'external') {
      Alert.alert('Read-aloud unavailable', 'This format has no extractable text for speech.');
      return;
    }
    // B4 — PDF read-aloud via the extracted text layer. Article view
    // narrates the whole document; native page view narrates the current page.
    if (kind === 'pdf' && !pdfArticleChapters) {
      const st = useReaderStore.getState();
      const pageNum = pdfTarget ?? st.page ?? startPageNum;
      const text = pdfPages?.[pageNum - 1]?.trim();
      if (pdfPages === null) {
        Alert.alert('Still reading…', 'The text layer is being extracted — try again in a moment.');
        return;
      }
      if (!text) {
        Alert.alert('No text on this page', 'This PDF has no extractable text here (scanned images need OCR on desktop). Try Article view from Display settings.');
        return;
      }
      const sentences = splitSentences(text);
      if (sentences.length === 0) {
        Alert.alert('Nothing to read', 'No readable sentences on this page.');
        return;
      }
      stopBackgroundTts();
      ttsSentences.current = sentences;
      ttsPara.current = sentences.map((_, i) => i);
      ttsBreaks.current = [];
      ttsIndex.current = 0;
      tts.set({ status: 'speaking', showBar: true, background: false, totalSentences: sentences.length, timeLeft: estimateTimeLeft(sentences, 0, tts.rate) });
      void speakSentences({
        sentences,
        fromIndex: 0,
        rate: tts.rate,
        language: book?.language ?? 'en',
        sleepMinutes: tts.sleepMinutes,
        onSentence: (i) => markSpoken(i),
        onDone: () => tts.set({ status: 'idle' }),
        onStopped: () => tts.set({ status: 'idle' }),
      });
      return;
    }
    const usingFreshMap = fromStart || ttsSentences.current.length === 0;
    const { sentences, paraIndex } = usingFreshMap
      ? ttsMap
      : { sentences: ttsSentences.current, paraIndex: ttsPara.current };
    if (sentences.length === 0) {
      Alert.alert('Nothing to read', 'No extractable text found in this book.');
      return;
    }
    stopBackgroundTts();
    ttsSentences.current = sentences;
    ttsPara.current = paraIndex;
    if (usingFreshMap) ttsBreaks.current = ttsMap.chapterBreaks;
    // C3 — resume mid-sentence unless explicitly restarting.
    const from = fromStart ? 0 : Math.max(0, Math.min(sentences.length - 1, ttsIndex.current));
    ttsIndex.current = from;
    tts.set({ status: 'speaking', showBar: true, background: false, totalSentences: sentences.length, timeLeft: estimateTimeLeft(sentences, from, tts.rate) });
    void speakSentences({
      sentences,
      fromIndex: from,
      rate: tts.rate,
      language: book?.language ?? 'en',
      sleepMinutes: tts.sleepMinutes,
      chapterBreaks: ttsBreaks.current,
      onSentence: (i) => markSpoken(i),
      onDone: () => tts.set({ status: 'idle' }),
      onStopped: () => {
        if (useTTSStore.getState().status !== 'paused') tts.set({ status: 'idle' });
      },
    });
  }, [kind, ttsMap, tts, book?.language, markSpoken, pdfArticleChapters, pdfPages, pdfTarget, startPageNum]);

  const startBg = useCallback(async () => {
    if (!isPremium) { needPremium('bg-tts'); return; }
    if (!isBackgroundTtsSupported()) {
      Alert.alert('Dev build required', 'Background listening needs the native module (dev-client or store build). Foreground read-aloud works everywhere.');
      return;
    }
    if (kind !== 'reflow' && !pdfArticleChapters) {
      Alert.alert('Read-aloud unavailable', 'Background narration is available for EPUB, text and Article-view PDF formats.');
      return;
    }
    let sentences = ttsSentences.current;
    if (sentences.length === 0) {
      const map = ttsMap;
      if (map.sentences.length === 0) {
        Alert.alert('Nothing to read', 'No extractable text found in this book.');
        return;
      }
      ttsSentences.current = map.sentences;
      ttsPara.current = map.paraIndex;
      ttsBreaks.current = map.chapterBreaks;
      sentences = map.sentences;
      ttsIndex.current = 0;
    }
    void stopSpeaking();
    const ok = await startBackgroundTts({
      sentences,
      fromIndex: ttsIndex.current,
      rate: tts.rate,
      language: book?.language ?? 'en',
      title: book?.title ?? 'ReadNest',
      sleepMinutes: tts.sleepMinutes,
      onSentence: (i) => markSpoken(i),
      onDone: () => tts.set({ status: 'idle', background: false }),
      onStopped: () => tts.set({ status: 'idle', background: false }),
    });
    if (ok) tts.set({ status: 'speaking', showBar: true, background: true });
    else Alert.alert('Background play failed', 'The audio service could not start on this device.');
  }, [isPremium, kind, ttsMap, tts, book?.language, book?.title, needPremium, markSpoken, pdfArticleChapters]);

  const toggleTts = useCallback(() => {
    if (tts.background) {
      if (tts.status === 'speaking') {
        bgPause();
        tts.set({ status: 'paused' });
      } else if (tts.status === 'paused') {
        bgResume();
        tts.set({ status: 'speaking' });
      } else {
        startBg();
      }
      return;
    }
    if (tts.status === 'speaking') {
      void stopSpeaking();
      tts.set({ status: 'paused' });
    } else if (tts.status === 'paused') {
      tts.set({ status: 'speaking' });
      void speakSentences({
        sentences: ttsSentences.current,
        fromIndex: ttsIndex.current,
        rate: tts.rate,
        language: book?.language ?? 'en',
        sleepMinutes: tts.sleepMinutes,
        chapterBreaks: ttsBreaks.current,
        onSentence: (i) => markSpoken(i),
        onDone: () => tts.set({ status: 'idle' }),
        onStopped: () => {
          if (useTTSStore.getState().status !== 'paused') tts.set({ status: 'idle' });
        },
      });
    } else {
      startTts();
    }
  }, [tts, startTts, startBg, book?.language, markSpoken]);

  const jumpTts = useCallback((dir: 1 | -1) => {
    if (tts.background) {
      bgJump(dir === 1 ? 3 : -3);
      return;
    }
    const next = Math.max(0, Math.min(ttsSentences.current.length - 1, ttsIndex.current + dir * 3));
    ttsIndex.current = next;
    if (tts.status === 'speaking') {
      void stopSpeaking();
      tts.set({ timeLeft: estimateTimeLeft(ttsSentences.current, next, tts.rate) });
      void speakSentences({
        sentences: ttsSentences.current, fromIndex: next, rate: tts.rate,
        language: book?.language ?? 'en',
        chapterBreaks: ttsBreaks.current,
        onSentence: (i) => markSpoken(i),
        onDone: () => tts.set({ status: 'idle' }),
        onStopped: () => {
          if (useTTSStore.getState().status !== 'paused') tts.set({ status: 'idle' });
        },
      });
    } else if (tts.status === 'paused') {
      tts.set({ timeLeft: estimateTimeLeft(ttsSentences.current, next, tts.rate) });
      markSpoken(next);
    }
  }, [tts, book?.language, markSpoken]);

  /** Rate applies immediately when foreground narration is active. */
  const changeRate = useCallback((r: number) => {
    tts.set({ rate: r });
    if (!tts.background && tts.status === 'speaking' && ttsSentences.current.length > 0) {
      const at = ttsIndex.current;
      void speakSentences({
        sentences: ttsSentences.current, fromIndex: at, rate: r,
        language: book?.language ?? 'en',
        chapterBreaks: ttsBreaks.current,
        onSentence: (i) => markSpoken(i),
        onDone: () => tts.set({ status: 'idle' }),
        onStopped: () => {},
      });
    }
  }, [tts, book?.language, markSpoken]);

  const stopTts = useCallback(() => {
    if (useTTSStore.getState().background) {
      stopBackgroundTts();
      tts.set({ status: 'idle', background: false });
    } else {
      void stopSpeaking();
      tts.set({ status: 'idle' });
    }
  }, [tts]);

  /* ── Render ────────────────────────────────────────── */
  const fontCss = readerFontFamily(font);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator size="large" color={palette.primary} />
        <Text style={{ color: palette.muted, fontFamily: 'Inter' }}>Opening your book…</Text>
      </View>
    );
  }

  if (loadError || !book) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.background, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
        <Icon name="BookX" size={40} color={palette.destructive} />
        <Text style={{ color: palette.foreground, fontSize: 17, fontWeight: '700', fontFamily: 'Inter', textAlign: 'center' }}>
          Couldn't open this book
        </Text>
        <Text style={{ color: palette.muted, fontFamily: 'Inter', textAlign: 'center' }}>{loadError ?? 'Unknown error.'}</Text>
        <Pressable onPress={goBack} accessibilityRole="button" accessibilityLabel="Back to library" style={{ backgroundColor: palette.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, marginTop: 8 }}>
          <Text style={{ color: palette.onPrimary, fontWeight: '700', fontFamily: 'Inter' }}>Back to library</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      {kind === 'reflow' ? (
        <ReaderWebView
          ref={readerRef}
          chapters={chapters}
          fontFamilyCss={fontCss}
          fontFaceCss={fontFaceCss}
          lang={book.language}
          onPosition={onReflowPosition}
          onSelect={onSelect}
          onTapRequest={toggleChrome}
        />
      ) : kind === 'pdf' ? (
        pdfArticleChapters ? (
          <ReaderWebView
            ref={readerRef}
            chapters={pdfArticleChapters}
            fontFamilyCss={fontCss}
            fontFaceCss={fontFaceCss}
            lang={book.language}
            marginPxOverride={articleMarginPx}
            onPosition={onPdfArticlePosition}
            onSelect={onSelect}
            onTapRequest={toggleChrome}
          />
        ) : (
          <PdfView
            key={pdfTarget ?? startPageNum}
            uri={book.file_uri}
            initialPage={pdfTarget ?? startPageNum}
            onPosition={onPagedPosition}
            onTap={toggleChrome}
          />
        )
      ) : kind === 'comic' ? (
        <ComicViewer ref={comicRef} pages={comicPages} onPosition={onPagedPosition} onTap={toggleChrome} />
      ) : (
        <View style={{ flex: 1, justifyContent: 'center', padding: 32, gap: 12 }}>
          <Icon name="TriangleAlert" size={40} color={palette.primary} />
          <Text style={{ fontSize: 17, fontWeight: '700', color: palette.foreground, fontFamily: 'Inter' }}>
            Limited preview for this format
          </Text>
          <Text style={{ fontSize: 14, color: palette.muted, fontFamily: 'Inter', lineHeight: 22 }}>{externalMsg}</Text>
          <Pressable
            onPress={() => {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const Sharing = require('expo-sharing') as { shareAsync: (u: string) => Promise<void> };
              void Sharing.shareAsync(book.file_uri);
            }}
            accessibilityRole="button" accessibilityLabel="Open with another app"
            style={{ backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8 }}
          >
            <Text style={{ color: palette.foreground, fontWeight: '600', fontFamily: 'Inter' }}>Open with another app</Text>
          </Pressable>
        </View>
      )}

      <ReaderChrome
        onBack={goBack}
        onToc={() => setTocOpen(true)}
        onTheme={() => setThemeOpen(true)}
        onTts={toggleTts}
        onBookmark={async () => {
          setMarks(await listBookmarks(book.id));
          setMarksOpen(true);
        }}
        onSettings={() => setDisplayOpen(true)}
        onSearch={() => setSearchOpen(true)}
        onFocusPrev={() => readerRef.current?.stepFocus(-1)}
        onFocusNext={() => readerRef.current?.stepFocus(1)}
        strip={kind === 'external' ? undefined : (
          <ThumbnailsStrip
            items={strip.items}
            activeIndex={strip.active}
            locked={!isPremium}
            onLockedPress={() => needPremium('thumbs')}
            onJump={jumpStrip}
          />
        )}
      />

      <TTSBar
        onPlayPause={toggleTts}
        onStop={stopTts}
        onPrev={() => jumpTts(-1)}
        onNext={() => jumpTts(1)}
        onRate={changeRate}
        onSleep={() => setSleepOpen(true)}
        onBackground={startBg}
      />

      <ThemeSheet visible={themeOpen} onClose={() => setThemeOpen(false)} />
      <DisplaySheet
        visible={displayOpen} onClose={() => setDisplayOpen(false)} onNeedPremium={needPremium} onCustomFont={pickCustomFont}
        pdfArticle={kind === 'pdf' ? {
          enabled: settings.pdfArticleMode,
          available: !!pdfPages?.some((t) => t.trim().length > 0),
          crop: settings.pdfCrop,
          onToggle: (v) => settings.set({ pdfArticleMode: v }),
          onCrop: (c) => settings.set({ pdfCrop: c }),
        } : undefined}
        bilingual={kind === 'reflow' ? {
          enabled: settings.bilingual,
          target: settings.translateTarget,
          onToggle: (v) => settings.set({ bilingual: v }),
        } : undefined}
      />
      <TocSheet
        visible={tocOpen}
        onClose={() => setTocOpen(false)}
        onJump={(href) => {
          const pdf = /^pdf:(\d+)$/.exec(href);
          if (pdf?.[1]) {
            const page = Math.max(1, parseInt(pdf[1], 10));
            if (pdfArticleChapters) readerRef.current?.gotoChapter(`pdf-p${page}`);
            else setPdfTarget(page);
            return;
          }
          const target = chapters.find((c) => href.includes(c.href.split('#')[0] ?? '') || c.id === href);
          if (target) readerRef.current?.gotoChapter(target.id);
        }}
      />

      {/* Bookmarks */}
      <Sheet visible={marksOpen} onClose={() => setMarksOpen(false)} title="Bookmarks">
        <Pressable
          onPress={async () => {
            const st = useReaderStore.getState();
            await addBookmark(book.id, st.location ?? `p:${st.page}`, st.chapterLabel ?? `Page ${st.page}`);
            setMarks(await listBookmarks(book.id));
          }}
          accessibilityRole="button" accessibilityLabel="Bookmark this position"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: palette.primary, borderRadius: 12, padding: 13, justifyContent: 'center', marginBottom: 12 }}
        >
          <Icon name="BookmarkPlus" size={18} color={palette.onPrimary} />
          <Text style={{ color: palette.onPrimary, fontWeight: '700', fontFamily: 'Inter' }}>Bookmark this position</Text>
        </Pressable>
        {marks.length === 0 ? (
          <Text style={{ color: palette.muted, fontFamily: 'Inter', paddingVertical: 8 }}>No bookmarks yet — your reading position is always saved automatically.</Text>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }}>
            {marks.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => {
                  const pMatch = /^p:(\d+)$/.exec(m.location);
                  if (pMatch?.[1]) {
                    const pageNum = parseInt(pMatch[1], 10);
                    if (kind === 'pdf') {
                      if (pdfArticleChapters) readerRef.current?.gotoChapter(`pdf-p${pageNum}`);
                      else setPdfTarget(pageNum);
                    } else if (kind === 'comic') {
                      comicRef.current?.scrollTo(pageNum - 1);
                    }
                  } else if (m.location.startsWith('c')) {
                    readerRef.current?.gotoChapter(m.location);
                  }
                  setMarksOpen(false);
                }}
                accessibilityRole="menuitem" accessibilityLabel={m.label ?? m.location}
                style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.border }}
              >
                <Text style={{ fontSize: 15, color: palette.foreground, fontFamily: 'Inter' }}>{m.label ?? m.location}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </Sheet>

      {/* Selection → highlight/note/dictionary */}
      <Sheet visible={selectOpen} onClose={() => setSelectOpen(false)} title="Selected text">
        <Text numberOfLines={4} style={{ fontSize: 15, color: palette.foreground, fontFamily: 'CrimsonPro', fontStyle: 'italic', marginBottom: 12 }}>
          “{selectedText}”
        </Text>
        <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1, color: palette.muted, fontFamily: 'Inter', marginBottom: 8 }}>
          HIGHLIGHT COLOR
        </Text>
        <HighlightColors onPick={saveHighlight} onNeedPremium={needPremium} />
        <TextInput
          value={noteDraft}
          onChangeText={setNoteDraft}
          placeholder="Add a note (optional)…"
          placeholderTextColor={palette.faint}
          accessibilityLabel="Note for highlight"
          style={{ backgroundColor: palette.surface2, borderRadius: 12, padding: 12, fontSize: 14, color: palette.foreground, fontFamily: 'Inter', marginTop: 12, borderWidth: 1, borderColor: palette.border }}
        />
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <Pressable
            onPress={() => { setSelectOpen(false); void openDict(selectedText); }}
            accessibilityRole="button" accessibilityLabel="Look up in dictionary"
            style={{ flex: 1, alignItems: 'center', padding: 13, borderRadius: 12, backgroundColor: palette.surface2 }}
          >
            <Text style={{ fontWeight: '600', color: palette.foreground, fontFamily: 'Inter' }}>Dictionary</Text>
          </Pressable>
          <Pressable
            onPress={() => void translateSelection()}
            accessibilityRole="button" accessibilityLabel="Translate selection"
            style={{ flex: 1, alignItems: 'center', padding: 13, borderRadius: 12, backgroundColor: palette.surface2 }}
          >
            <Text style={{ fontWeight: '600', color: palette.foreground, fontFamily: 'Inter' }}>
              {transLoading ? 'Translating…' : 'Translate'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void saveHighlight(highlightColors[0]!.value)}
            accessibilityRole="button" accessibilityLabel="Save highlight"
            style={{ flex: 1, alignItems: 'center', padding: 13, borderRadius: 12, backgroundColor: palette.primary }}
          >
            <Text style={{ fontWeight: '700', color: palette.onPrimary, fontFamily: 'Inter' }}>Save</Text>
          </Pressable>
        </View>
        {transResult ? (
          <View style={{ marginTop: 12, backgroundColor: palette.surface2, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: palette.border }}>
            <Text style={{ fontSize: 14, color: palette.foreground, fontFamily: 'Inter', lineHeight: 21 }}>{transResult}</Text>
          </View>
        ) : null}
        <Pressable
          onPress={() => void explainSelection()}
          accessibilityRole="button" accessibilityLabel="Explain this passage with AI"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: palette.surface2, borderRadius: 12, padding: 13, justifyContent: 'center' }}
        >
          <Icon name="Sparkles" size={17} color={palette.primary} />
          <Text style={{ fontWeight: '600', color: palette.foreground, fontFamily: 'Inter' }}>
            {aiLoading ? 'Explaining…' : 'Explain this passage'}
          </Text>
        </Pressable>
        {aiResult ? (
          <View style={{ marginTop: 12, backgroundColor: palette.surface2, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: palette.border }}>
            <Text style={{ fontSize: 14, color: palette.foreground, fontFamily: 'Inter', lineHeight: 21 }}>{aiResult}</Text>
          </View>
        ) : null}
      </Sheet>

      {/* Dictionary quick view */}
      <Sheet visible={dictOpen} onClose={() => setDictOpen(false)} title={dictWord || 'Dictionary'}>
        <Text style={{ fontSize: 14, color: palette.foreground, fontFamily: 'Inter', lineHeight: 22 }}>{dictResult}</Text>
      </Sheet>

      {/* Search in book (reflow + PDF text layer) */}
      <Sheet visible={searchOpen} onClose={() => setSearchOpen(false)} title="Search in book">
        {kind === 'reflow' ? (
          <>
            <TextInput
              value={searchQ}
              onChangeText={setSearchQ}
              placeholder="Find a passage…"
              placeholderTextColor={palette.faint}
              accessibilityLabel="Search in book"
              style={{ backgroundColor: palette.surface2, borderRadius: 12, padding: 12, fontSize: 15, color: palette.foreground, fontFamily: 'Inter', borderWidth: 1, borderColor: palette.border }}
            />
            {searchQ.trim().length > 1 ? (
              <SearchResults query={searchQ} chapters={chapters} onJump={(cid) => { readerRef.current?.gotoChapter(cid); setSearchOpen(false); }} />
            ) : null}
          </>
        ) : kind === 'pdf' ? (
          <>
            <TextInput
              value={searchQ}
              onChangeText={setSearchQ}
              placeholder="Search this PDF…"
              placeholderTextColor={palette.faint}
              accessibilityLabel="Search in PDF"
              style={{ backgroundColor: palette.surface2, borderRadius: 12, padding: 12, fontSize: 15, color: palette.foreground, fontFamily: 'Inter', borderWidth: 1, borderColor: palette.border }}
            />
            {searchQ.trim().length > 1 ? (
              <PdfSearchResults
                query={searchQ}
                pages={pdfPages}
                onJump={(page) => { setPdfTarget(page); setSearchOpen(false); }}
              />
            ) : (
              <Text style={{ color: palette.muted, fontFamily: 'Inter', marginTop: 12 }}>
                {pdfPages === null ? 'Reading the text layer…' : pdfPages.length === 0 || pdfPages.every((p) => !p.trim()) ? 'This PDF has no extractable text (scanned images need OCR on desktop).' : 'Matches jump straight to the page.'}
              </Text>
            )}
          </>
        ) : (
          <Text style={{ color: palette.muted, fontFamily: 'Inter' }}>In-book search is available for EPUB, text and PDF formats.</Text>
        )}
      </Sheet>

      {/* Sleep timer */}
      <Sheet visible={sleepOpen} onClose={() => setSleepOpen(false)} title="Sleep timer">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[5, 10, 15, 30, 45, 60].map((m) => (
            <Pressable
              key={m}
              onPress={() => { tts.set({ sleepMinutes: m }); setSleepOpen(false); }}
              accessibilityRole="radio" accessibilityLabel={`${m} minutes`}
              style={{ paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: tts.sleepMinutes === m ? palette.primary : palette.surface2 }}
            >
              <Text style={{ fontWeight: '700', color: tts.sleepMinutes === m ? palette.onPrimary : palette.foreground, fontFamily: 'Inter' }}>{m}m</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => { tts.set({ sleepMinutes: null }); setSleepOpen(false); }}
            accessibilityRole="button" accessibilityLabel="Clear sleep timer"
            style={{ paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: palette.surface2 }}
          >
            <Text style={{ fontWeight: '600', color: palette.muted, fontFamily: 'Inter' }}>Off</Text>
          </Pressable>
        </View>
        <Text style={{ fontSize: 12, color: palette.muted, fontFamily: 'Inter', marginTop: 10 }}>
          Applies to the current session. Background playback with screen locked is Premium.
        </Text>
      </Sheet>
    </View>
  );
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function SearchResults({ query, chapters, onJump }: {
  query: string; chapters: EpubChapter[]; onJump: (cid: string) => void;
}) {
  const { palette } = useTheme();
  // Debounce heavy per-keystroke HTML stripping over all chapters.
  const [deferred, setDeferred] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDeferred(query), 300);
    return () => clearTimeout(t);
  }, [query]);
  const results = useMemo(() => {
    const q = deferred.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: { chapterId: string; label: string; snippet: string }[] = [];
    for (const c of chapters) {
      const plain = c.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const idx = plain.toLowerCase().indexOf(q);
      if (idx >= 0 && out.length < 20) {
        out.push({
          chapterId: c.id, label: c.label,
          snippet: `…${plain.slice(Math.max(0, idx - 60), idx + 120).trim()}…`,
        });
      }
    }
    return out;
  }, [deferred, chapters]);

  if (results.length === 0) {
    return <Text style={{ color: palette.muted, fontFamily: 'Inter', marginTop: 12 }}>No matches for “{query}”.</Text>;
  }
  return (
    <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380, marginTop: 8 }}>
      {results.map((r, i) => (
        <Pressable
          key={i}
          onPress={() => onJump(r.chapterId)}
          accessibilityRole="menuitem" accessibilityLabel={`Jump to ${r.label}`}
          style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.border }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: palette.primary, fontFamily: 'Inter' }}>{r.label}</Text>
          <Text numberOfLines={2} style={{ fontSize: 14, color: palette.foreground, fontFamily: 'Inter', marginTop: 2 }}>{r.snippet}</Text>
        </Pressable>
      ))}
      <View style={{ marginTop: 8 }}>
        <ProgressBar value={0} height={0} />
      </View>
    </ScrollView>
  );
}

function PdfSearchResults({ query, pages, onJump }: {
  query: string; pages: string[] | null; onJump: (page: number) => void;
}) {
  const { palette } = useTheme();
  const [deferred, setDeferred] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDeferred(query), 300);
    return () => clearTimeout(t);
  }, [query]);
  const results = useMemo(
    () => (pages ? searchPdfPages(pages, deferred) : []),
    [pages, deferred],
  );

  if (pages === null) {
    return <Text style={{ color: palette.muted, fontFamily: 'Inter', marginTop: 12 }}>Reading the text layer…</Text>;
  }
  if (results.length === 0) {
    return <Text style={{ color: palette.muted, fontFamily: 'Inter', marginTop: 12 }}>No matches for “{query}”.</Text>;
  }
  return (
    <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380, marginTop: 8 }}>
      {results.map((r) => (
        <Pressable
          key={r.page}
          onPress={() => onJump(r.page)}
          accessibilityRole="menuitem" accessibilityLabel={`Jump to page ${r.page}`}
          style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.border }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: palette.primary, fontFamily: 'Inter' }}>
            PAGE {r.page}
          </Text>
          <Text numberOfLines={2} style={{ fontSize: 14, color: palette.foreground, fontFamily: 'Inter', marginTop: 2 }}>{r.snippet}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
