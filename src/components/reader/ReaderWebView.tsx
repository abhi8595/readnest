import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { irlenTints, readerThemes } from '@/theme/tokens';
import { useReaderStore } from '@/stores/useReaderStore';
import { buildReaderHtml, isRtlLang } from './readerHtml';
import type { EpubChapter } from '@/lib/epub';

export interface ReaderHandle {
  gotoChapter: (id: string) => void;
  gotoRatio: (r: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  pushTheme: () => void;
  markTts: (pIndex: number) => void;
  setFocus: (mode: 'off' | 'sentence' | 'paragraph') => void;
  stepFocus: (d: number) => void;
  setBionic: (on: boolean) => void;
  setTint: (overlay: string | null) => void;
  setBilingual: (items: { pIndex: number; text: string }[]) => void;
  clearBilingual: () => void;
}

interface Props {
  chapters: EpubChapter[];
  fontFamilyCss: string;
  fontFaceCss: string;
  /** BCP-47 book language for <html lang> + RTL detection. */
  lang?: string | null;
  /** B1 article-mode crop: override the store margin with tighter text width. */
  marginPxOverride?: number | null;
  onPosition: (p: { progress: number; chapterId: string | null; chapterLabel: string | null }) => void;
  onSelect: (text: string) => void;
  /** Quick tap from the in-page gesture layer (toggle chrome). */
  onTapRequest: () => void;
}

const MARGIN_PX = { S: 16, M: 24, L: 36, XL: 52 } as const;

export const ReaderWebView = forwardRef<ReaderHandle, Props>(function ReaderWebView(
  { chapters, fontFamilyCss, fontFaceCss, lang, marginPxOverride, onPosition, onSelect, onTapRequest },
  ref,
) {
  const webRef = useRef<WebView>(null);
  const theme = useReaderStore((s) => s.theme);
  const fontSize = useReaderStore((s) => s.fontSize);
  const fontWeight = useReaderStore((s) => s.fontWeight);
  const lineSpacing = useReaderStore((s) => s.lineSpacing);
  const margin = useReaderStore((s) => s.margin);
  const hyphenation = useReaderStore((s) => s.hyphenation);
  const pageMode = useReaderStore((s) => s.pageMode);
  const focusMode = useReaderStore((s) => s.focusMode);
  const bionic = useReaderStore((s) => s.bionic);
  const irlenTint = useReaderStore((s) => s.irlenTint);
  const startLocation = useReaderStore((s) => s.location);
  const startProgress = useReaderStore((s) => s.progress);

  const tintOverlay = useMemo(
    () => irlenTints.find((t) => t.id === irlenTint)?.overlay ?? null,
    [irlenTint],
  );

  const html = useMemo(
    () =>
      buildReaderHtml({
        theme: readerThemes[theme],
        fontFamily: fontFamilyCss,
        fontFaceCss,
        fontSize,
        fontWeight,
        lineSpacing,
        marginPx: marginPxOverride ?? MARGIN_PX[margin],
        hyphenation,
        paginated: pageMode === 'paginated',
        chapters,
        startChapterId: startLocation?.startsWith('c') ? startLocation : null,
        startRatio: startProgress,
        lang: lang ?? null,
        rtl: isRtlLang(lang),
        focusMode,
        bionic,
        tintOverlay,
      }),
    // Rebuild when anything the HTML bakes in changes (content, mode, full
    // theme, typography). Live tweaks between rebuilds go through push().
    [chapters, pageMode, fontFamilyCss, fontFaceCss, theme, fontSize, fontWeight, lineSpacing, margin, marginPxOverride, hyphenation, startLocation, startProgress, lang, focusMode, bionic, tintOverlay],
  );

  /**
   * RN → Web: react-native-webview 13 delivers `postMessage(string)` from RN
   * inconsistently across platforms — `injectJavaScript` is the supported
   * channel. The in-page runtime listens on document/window 'message', so we
   * dispatch a MessageEvent with the payload as `data`.
   */
  const send = (payload: unknown) => {
    try {
      const json = JSON.stringify(payload).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      webRef.current?.injectJavaScript(
        `(function(){try{var d='${json}';var e;try{e=new MessageEvent('message',{data:d});}catch(_){e=document.createEvent('Event');e.initEvent('message',false,false);e.data=d;}document.dispatchEvent(e);window.dispatchEvent(e);}catch(_){}})();true;`,
      );
    } catch { /* webview gone */ }
  };

  useImperativeHandle(ref, () => ({
    gotoChapter: (id) => send({ type: 'goto', chapterId: id }),
    gotoRatio: (r) => send({ type: 'goto', ratio: Math.min(1, Math.max(0, r)) }),
    nextPage: () => send({ type: 'pageDelta', d: 1 }),
    prevPage: () => send({ type: 'pageDelta', d: -1 }),
    pushTheme: () => push(),
    markTts: (pIndex) => send({ type: 'ttsMark', pIndex: Math.max(0, Math.floor(pIndex)) }),
    setFocus: (mode) => send({ type: 'focus', mode }),
    stepFocus: (d) => send({ type: 'focusStep', d }),
    setBionic: (on) => send({ type: 'bionic', on }),
    setTint: (overlay) => send({ type: 'tint', overlay }),
    setBilingual: (items) => send({ type: 'bilingual', items }),
    clearBilingual: () => send({ type: 'bilingualClear' }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }));

  const push = () => {
    const t = readerThemes[theme];
    send({
      type: 'theme', bg: t.bg, fg: t.text, muted: t.muted, acc: t.accent,
      fs: fontSize, lh: lineSpacing, mx: marginPxOverride ?? MARGIN_PX[margin], ff: fontFamilyCss, fw: fontWeight,
      hy: hyphenation,
    });
  };

  useEffect(() => {
    push();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, fontSize, fontWeight, lineSpacing, margin, marginPxOverride, hyphenation, fontFamilyCss]);

  // Live Phase-4 toggles (no full HTML rebuild needed).
  useEffect(() => {
    send({ type: 'focus', mode: focusMode });
  }, [focusMode]);
  useEffect(() => {
    send({ type: 'bionic', on: bionic });
  }, [bionic]);
  useEffect(() => {
    send({ type: 'tint', overlay: tintOverlay });
  }, [tintOverlay]);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const raw = e.nativeEvent.data;
      if (typeof raw !== 'string' || raw.length > 8192) return;
      const m = JSON.parse(raw) as
        | { type: 'pos'; progress: number; chapterId: string | null; chapterLabel: string | null }
        | { type: 'link'; href: string }
        | { type: 'select'; text: string }
        | { type: 'tap' };
      if (m.type === 'pos') {
        const progress = typeof m.progress === 'number' && Number.isFinite(m.progress)
          ? Math.min(1, Math.max(0, m.progress)) : 0;
        onPosition({ progress, chapterId: m.chapterId ?? null, chapterLabel: m.chapterLabel ?? null });
      } else if (m.type === 'select') {
        const text = typeof m.text === 'string' ? m.text.slice(0, 2000).trim() : '';
        if (text.length > 1) onSelect(text);
      } else if (m.type === 'tap') onTapRequest();
      else if (m.type === 'link') {
        if (typeof m.href !== 'string' || m.href.length > 512) return;
        // Internal anchors only — external URLs stay inert (no fake navigation).
        if (/^(https?:|javascript:)/i.test(m.href)) return;
        const id = m.href.replace('#', '');
        const found = chapters.find((c) => c.href.endsWith(id) || c.id === id);
        if (found) send({ type: 'goto', chapterId: found.id });
      }
    } catch { /* ignore malformed */ }
  };

  return (
    <View style={{ flex: 1 }}>
      <WebView
        ref={webRef}
        source={{ html, baseUrl: '' }}
        originWhitelist={['*']}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled={false}
        scalesPageToFit={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        overScrollMode="never"
        accessibilityLabel="Book content"
        style={{ flex: 1, backgroundColor: readerThemes[theme].bg }}
      />
    </View>
  );
});
