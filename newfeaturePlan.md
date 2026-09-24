# ReadNest — New Feature Plan (Community-Research Driven)

_Date: 2026-09-21. Sources: r/ereader, r/ebooks, r/koreader, r/androidapps, r/audiobooks,_
_r/languagelearning, r/Dyslexia, r/books, r/TheStoryGraph, r/Calibre, r/pdf, r/TextToSpeech,_
_r/SideProject, r/BookFusion, r/Onyx_Boox + competitor threads (Moon+, ReadEra, Librera,_
_KOReader, Readest, BookFusion, StoryGraph/Goodreads). Including effort estimates and raw notes._

---

## 1. Pain-point ranking (frequency × intensity)

| # | Pain | Who feels it | Evidence |
|---|------|--------------|----------|
| 1 | Sync breaks / auth rituals / highlights don't sync (esp. PDF) | Multi-device readers, students | Moon+ Drive v10.5 threads (unlink/re-link via web), KOReader "one highlight then error", Boox silent PDF-annotation non-sync |
| 2 | PDFs miserable on small screens (two-column, margins, no reflow/crop) | Academic/pro readers | r/pdf + r/kindle crop-tool side-projects, "no app does crop + standard annotations together" |
| 3 | Robotic TTS; no audiobook export; no time-left; TTS reads headers/page numbers | Commuters, accessibility users | r/audiobooks, r/ebooks TTS threads, OpenReader/Kokoro demand, Speechify-pricing complaints |
| 4 | Subscription fatigue; forced accounts | Everyone | Everand credit backlash, "$60 lifetime?? Moon+ is $10", Garden Reads traction on no-account |
| 5 | No focus/dyslexia/ADHD modes in mainstream apps | ADHD/dyslexic readers | ClearRead, Speeedy, BionRead launches; KOReader focus-reading patch |
| 6 | No tap-sentence translate / parallel view | Language learners | r/ereader translate threads, Duoreader, Giano Reader, Readest #3599 layout-jump pain |
| 7 | Big libraries crash apps (1300+ books) | Power collectors | Moon+ crash thread; Librera praised at 3000+ |
| 8 | Ugly UI, forced accounts, store lock-in | Indie-reader fans | Garden Reads, post-Marvin readers ("own your books") |
| 9 | Tracking gaps (unfinished series, re-reads, ratings) | Trackers | StoryGraph missing unfinished-series view; Goodreads stagnant |
| 10 | No listen-(MP3)-while-reading-(EPUB) flow; no EPUB3 Media Overlay mobile support | Audiobook + text users | r/audiobooks read-along thread, Flowstate Reader niche |

**ReadNest advantages to protect:** lifetime (not subscription) premium, no-account local-first,
Atkinson accessible font + hyphenation already bundled, TTS sentence-map infra (Phase 2),
RTL groundwork, OPDS catalogs (Phase 3), FTS search, hash dedupe.

---

## 2. Feature pillars

### Pillar A — "Sync that never breaks" (demand rank #1)

| ID | Feature | Notes | Effort |
|----|---------|-------|--------|
| A1 | WebDAV sync backend | KOReader/Nextcloud crowd; also gives Mac/PC file access (the "doesn't exist" workflow). Reuse snapshot+merge infra, new transport | M (3–5d) |
| A2 | Sync health dashboard | Per-device last-sync, conflict count, one-tap re-auth (anti Moon+ unlink ritual), offline queue visibility | S (1–2d) |
| A3 | Hash-based book identity + smart highlight merge | Rename/move-proof notes (cf. KOReader AnnotationSync); LWW per row already partially done — extend to full conflict UI | M (3–4d) |
| A4 | "Bring your own storage" premium framing | S3-compatible endpoint option; marketing + settings copy | S (1d + docs) |

### Pillar B — PDF power (most willing to pay)

| ID | Feature | Notes | Effort |
|----|---------|-------|--------|
| B1 | Article mode (margin-crop presets + two-column detection + reflow) | Biggest academic ask; start with presets + manual crop, auto-detect later | L (1–2w) |
| B2 | Standard PDF annotations embedded in file | Viewable on PC (not sidecars); needs native PDF annotation APIs — spike first | L (1–2w, risky) |
| B3 | In-PDF full-text search + auto-TOC for outline-less PDFs | Search via text layer; TOC from font-size heuristics | M (3–5d) |
| B4 | PDF read-aloud via native text layer | We currently block PDF TTS — unblock per-page narration | S (1–2d) |

### Pillar C — Audio upgrade

| ID | Feature | Notes | Effort |
|----|---------|-------|--------|
| C1 | Audiobook export (m4b/mp3 + chapter marks) | Background generation, progress + cancel; ffmpeg not on RN — use chunked WAV→merge or server-less encoder lib (spike) | L (1–2w, risky) |
| C2 | Smart narration (skip headers/footers/page numbers, chapter pauses, time-left) | Heuristics on chapter HTML; time-left from word-rate estimate | M (3–4d) |
| C3 | Per-book mid-sentence resume + speed memory | Persist ttsIndex+rate per book (reading_settings has tts_rate; add tts_index) | S (1d) |

### Pillar D — Focus reading (cheap, high buzz)

| ID | Feature | Notes | Effort |
|----|---------|-------|--------|
| D1 | Focus mode (dim all but current sentence/paragraph) | Reuse Phase-2 TTS map; CSS class toggle, no TTS required (manual step-through) | S (1–2d) |
| D2 | Bionic-style syllable bolding + Irlen tint overlays | Preprocess words in readerHtml (first-syllable bold); overlay tints as theme accents | S (2d) |
| D3 | E-ink theme (pure B/W, animations off) | New readerTheme + global reduce-motion respect; Moon+ parity | S (1d) |

### Pillar E — Language learning

| ID | Feature | Notes | Effort |
|----|---------|-------|--------|
| E1 | Tap-sentence translate (BYOK DeepL/Google) | Cached per book+sentence in kv; no bundled key = zero cost + privacy story | M (3–4d) |
| E2 | Bilingual accordion paragraph view | Expand-translation control per paragraph (avoids Readest's layout-jump bug); pre-translate chapter for stability | M (4–5d) |
| E3 | Word-book review decks | Save dictionary lookups → SRS-lite list (extends dictionary_history) | S (2d) |

### Pillar F — Library at scale + delight

| ID | Feature | Notes | Effort |
|----|---------|-------|--------|
| F1 | Paged DB loading (cursor pagination, 5000+ books) | Deferred Phase-2 item; directly addresses Moon+ crash switchers | M (3d) |
| F2 | Star ratings + re-read tracking + "unfinished series" shelf | StoryGraph gap; ratings column + series progress view | S-M (2–3d) |
| F3 | Manga spread mode (double-page + RTL paging) | RTL groundwork done; spread layout in ComicViewer for tablets | S (1–2d) |
| F4 | "Explain this passage" via user AI key | BYOK (OpenAI-compatible), selection-sheet action, cached; no server cost | M (3d) |

_Effort key: S = 1–2 days, M = 3–5 days, L = 1–2+ weeks or needs a technical spike._

---

## 3. Suggested build order

- **Phase 4 (quick wins + buzz):** D1 + D2 → F3 → F1
- **Phase 5 (premium upsell):** B1 + B3, then B4
- **Phase 6 (kill complaint #1):** A1 + A2, then A3
- **Phase 7 (depth):** C1 + C2, E1 + E2
- **Stretch / spike-first:** B2 (native annotation SDK limits), C1 encoder path, F4 provider politics

## 4. Open questions (owner decisions)

1. **First audience:** power/academic (PDF + sync + export) vs. casual/focus (bionic, e-ink, manga)?
2. **Premium gating:** gate only sync/export/translate, keep focus/bionic/ratings free as growth hooks?
3. **Keys:** BYOK-only for translate/AI (zero cost + privacy), or bundled service (cost + privacy tradeoff)?
4. **Cuts:** any pillar to drop (e.g. skip manga, skip AI-explain)?

## 5. Positioning notes (from threads)

- Keep lifetime pricing; never credit-cap; no-account stays a headline feature.
- "Handles 5000+ books without crashing" is a proven switching trigger — benchmark + say it.
- Standard-format annotations (viewable on PC) beat sidecars every time — say so in listings.
- Offline-first + BYOK privacy story differentiates vs. Speechify/cloud TTS apps.

---

## Appendix — raw research notes (subreddit → signal)

- r/ereader Moon+ Drive v10.5 (Apr/May 2026): update broke sync; fix = Drive web → Manage Apps → Disconnect → re-link in app; old Android (5.1) gets CharMatcher crash. → A2
- r/ReadEra: attached notes sometimes never appear in Notes. → A3 test coverage
- r/androidapps 1000+ files: Moon+ crashes scrolling 1300 books; Librera fine at 3000+. → F1
- r/ereader ReadEra-vs-Moon+: ReadEra misses chapters in some books; Moon+ e-ink mode praised. → TOC fallback (have), D3
- r/koreader PDF highlights: 2nd highlight breaks sync; epubs fine. → A3, B2
- r/ereader PDF+Mac workflow: "what you want doesn't exist" (annotate + access from Mac). → A1+B2
- r/koreader wishlist: less menu bloat, export/import settings, better sync incl. dictionary words. → A2, E3
- r/readest KOReader plugin: incremental-only annotation push orphans highlights; undeletable synced highlights. → A3
- r/koreader AnnotationSync v1.0-rc3: hash book identity, LWW merge, auto-sync on network. → A3 (validation)
- r/audiobooks read-along: wants MP3+EPUB together, no self-hosted server. → pillar C gap
- r/ebooks iOS TTS pain: robotic voices, reads headers/page numbers, Siri offline voices wanted. → C2
- r/Calibre + r/TextToSpeech EPUB3 Media Overlay: playback tooling barely exists on mobile. → stretch
- r/LocalLLaMA OpenReader: BYO TTS API, audiobook export m4b/mp3 w/ chapters, sentence-aware narration. → C1+C2 (validation)
- r/SideProject browser audiobook maker: on-device, read-along highlight, time-left, 10x speed. → C2+C3
- r/ereader Garden Reads: clean UI + no account + optional local AI explain wins fans; Pro price vs Moon+ criticized. → F4 (BYOK), pricing note
- r/ereader Kindle ad rant / Everand credits / BookFusion $100/yr steep / Marvin $60 lifetime backlash. → pricing notes
- r/pdf + r/kindle + r/ereader academic PDF: smart crop, auto-TOC, reflow, column mode, grayscale; equations block EPUB conversion. → B1+B3
- r/Onyx_Boox manga: no double-page mode complaint. → F3
- r/Dyslexia Speeedy / r/SideProject Focus Reader / r/accessibility ClearRead / r/ADHD BionRead / r/koreader focus patch / r/xteinkereader bionic: bold-first-syllable, focus ruler, tints, dyslexia fonts. → D1+D2 (Atkinson already bundled)
- r/ereader + r/languagelearning + r/koreader + r/Calibre + Readest#3599: sentence/paragraph translate, parallel read, bilingual EPUB; layout-jump is the hard part → accordion + pre-translate. → E1+E2
- r/TheStoryGraph + r/books: unfinished-series view missing; Goodreads stagnant but social; import quality matters. → F2
