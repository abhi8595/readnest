# ReadNest — App Override (overrides MASTER.md)

> Scope: entire ReadNest native app (iOS/Android, React Native via Expo SDK 56).
> This file OVERRIDES `../MASTER.md` where they conflict. MASTER.md stays untouched
> (skill rule: no `--force` without authorization). Decisions below merge:
> (a) verified skill search results, (b) the ReadNest master-prompt requirements
> (warm paper palette, Lucide 1.5, Inter chrome + serif reader).

**Product type:** productivity / reading utility (local-first book library + reader)
**Style:** Warm Minimal Editorial — Swiss grid discipline + bookish warmth.
Verified inputs: `Swiss Modernism 2.0` (style), `Book & Reading Tracker`
`#78716C / #92400E / #D97706 on #FFFBEB` (color), `Academic/Research`
Crimson Pro + Atkinson Hyperlegible (typography), react-native Pressable /
hitSlop / accessibilityRole (stack), predictable back + bottom-nav ≤5 (ux).

---

## 1. Final color tokens (semantic — never raw hex in components)

### Light — "Paper" (default)

| Token | Value | Usage |
|---|---|---|
| `background` | `#FBF7F0` | app bg (warm paper) |
| `surface` | `#FFFFFF` | cards, sheets |
| `surface2` | `#F3EDE2` | sunken wells, chips |
| `foreground` | `#1E1B16` | primary text (15.9:1 on bg ✓) |
| `muted` | `#6B6357` | secondary text (5.1:1 on bg ✓) |
| `faint` | `#8A8175` | captions only, never body (3.8:1 — large/caption use) |
| `primary` | `#C4623A` | CTAs, progress, active states (terracotta) |
| `onPrimary` | `#FFFFFF` | text on primary (3.9:1 — large/bold/button use + icon+label pairing) |
| `secondary` | `#7C9070` | sage: success, secondary states |
| `onSecondary` | `#FFFFFF` | |
| `accent` | `#8C3B1B` | deep terracotta: pressed/emphasis text on paper (7.2:1 ✓) |
| `border` | `#E3DACA` | dividers, card strokes |
| `ring` | `#C4623A` | focus rings (2dp + 2dp offset) |
| `destructive` | `#B3261E` | delete (5.9:1 on bg ✓) |
| `scrim` | `rgba(30,27,22,0.55)` | modal/sheet scrim, measured over paper |

> Contrast rule (pro-rules): body ≥4.5:1 both themes; non-text ≥3:1.
> `onPrimary` white-on-terracotta is 3.9:1 → buttons always pair label + icon,
> min 16px semibold, never muted-small on primary.

### Dark — "Ember" (warm charcoal, never pure black)

| Token | Value | Usage |
|---|---|---|
| `background` | `#1C1A17` | app bg |
| `surface` | `#26221D` | cards, sheets |
| `surface2` | `#2E2924` | wells, chips |
| `foreground` | `#F3EDE2` | primary text (13.8:1 ✓) |
| `muted` | `#C9BFAE` | secondary text (7.1:1 ✓) |
| `faint` | `#9A9081` | captions (4.6:1 ✓) |
| `primary` | `#E08A5B` | lightened terracotta for dark (5.0:1 on bg ✓) |
| `onPrimary` | `#1C1A17` | text on primary (5.0:1 ✓) |
| `secondary` | `#9DB493` | lightened sage (6.4:1 ✓) |
| `accent` | `#F0B48A` | emphasis |
| `border` | `#3A342C` | dividers (visible in dark ✓) |
| `ring` | `#E08A5B` | focus rings |
| `destructive` | `#F2A49E` | (6.1:1 ✓) |
| `scrim` | `rgba(0,0,0,0.65)` | |

### Reader themes (full-bleed, separate from app chrome)

| Theme | bg | text | muted | accent |
|---|---|---|---|---|
| Day | `#FBF7F0` | `#1E1B16` | `#6B6357` | `#C4623A` |
| Sepia | `#F4E8D0` | `#433422` | `#7A6A54` | `#8C5A1E` |
| Night | `#1C1A17` | `#E8E0D2` | `#A89D8A` | `#E08A5B` |
| Console | `#0E1A12` | `#B8E6B8` | `#6E9A6E` | `#7CE68A` |
| OLED | `#000000` | `#E8E0D2` | `#A89D8A` | `#E08A5B` |

All reader pairs ≥7:1 except Console muted (decorative line-art only, never body).

---

## 2. Typography

- **UI chrome:** Inter (400/500/600/700) — per master prompt.
- **Reader serif default:** Crimson Pro (400/500/600 + italic).
- **Accessible reader option:** Atkinson Hyperlegible (400/700).
- **Alt serif:** Libre Baskerville (400/700).
- Scale: 12 / 14 / 16 / 18 / 20 / 24 / 32 (display 32 only). Body base 16,
  line-height 1.5–1.75 (UI) / 1.4–2.0 user-adjustable (reader).
- Never body <12px; tabular numerals for stats/progress.

## 3. Spacing / radius / elevation

- 4/8dp rhythm: 4 · 8 · 12 · 16 · 24 · 32 · 48.
- Gutters: 16 phone / 24 tablet-landscape.
- Radius: 8 (chips/inputs) · 12 (cards) · 16 (sheets) · 20 (player cards).
- Elevation: 3 levels only — `rest 0/1`, `raised 4`, `overlay 12`.
  No random shadows; pressed = opacity/elevation, never layout shift.

## 4. Icons (pro-rules: Icons & Visual Elements)

- Lucide only, `strokeWidth={1.5}`, sizes from tokens: `sm 16 · md 20 · lg 24 · xl 32`.
- `Pressable` + `hitSlop ≥ 10` so every icon control ≥48×48dp (Android) / 44pt (iOS).
- Decorative icons `aria-hidden`; standalone-meaning icons get `accessibilityLabel`;
  selected/pressed/expanded exposed. No emoji as icons anywhere.

## 5. Interaction (pro-rules: Interaction App)

- Tap feedback ≤150ms (opacity/ripple/elevation), shared motion tokens:
  `instant 80 · quick 150 · base 220 · emphasis 320`, easing out-cubic enter /
  in-cubic exit, exit ≈65% of enter. Respect `reduce motion` (disable stagger/parallax).
- One primary CTA per screen; one primary gesture per region (reader: horizontal
  swipe = page, vertical = scroll-mode scroll; pinch = PDF zoom only).
- Disabled = reduced emphasis + `disabled` + no action (never fake-tappable).
- Screen-reader order = visual order; every control labelled.

## 6. Navigation (ux: predictable back, ≤5 tabs)

- Tabs (5): Library · Folders · Search · Notes · Settings.
- Reader is full-screen modal stack (gesture-hidden chrome, system back = close
  to exact scroll position; deep link `readnest://book/:id` + `readnest://read/:id`).
- Dictionary = hub screen from Search/Reader selection (not a 6th tab).
- Collections detail + About Document = pushed stack screens with proper history.

## 7. Layout & safe areas

- Safe-area respected for headers/tab bars/CTA bars; content insets so lists
  clear fixed bars; bottom banner ad never overlaps content (reserved slot).
- Reader measure capped (~680dp) on tablets; no edge-to-edge paragraphs.
- 375px small-phone + landscape verified (pre-delivery checklist).

## 8. Anti-patterns (skill + prompt)

- No navy/cold palette (differentiate from ReadEra blue) · no pure-black dark bg
  (except OLED reader option) · no emoji icons · no hover-only affordances ·
  no horizontal scroll · no placeholder-only labels · no instant (0ms) state flips.
