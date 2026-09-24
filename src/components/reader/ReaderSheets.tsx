import React from 'react';
import { ScrollView, Switch, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { highlightColors, irlenTints, readerFonts, readerThemes, type ReaderThemeId } from '@/theme/tokens';
import { useReaderStore } from '@/stores/useReaderStore';
import { usePremiumStore } from '@/stores/usePremiumStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { Sheet } from '../ui/Sheet';
import { Pressable } from '../ui/pressable';
import { Icon } from '../ui/Icon';
import { Chip } from '../ui/controls';

/* ── Theme picker ──────────────────────────────────────── */
export function ThemeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { palette } = useTheme();
  const theme = useReaderStore((s) => s.theme);
  const apply = useReaderStore((s) => s.applySettings);
  return (
    <Sheet visible={visible} onClose={onClose} title="Reading theme">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {(Object.keys(readerThemes) as ReaderThemeId[]).map((id) => {
          const t = readerThemes[id];
          const active = theme === id;
          return (
            <Pressable
              key={id}
              onPress={() => apply({ theme: id })}
              accessibilityRole="radio"
              accessibilityLabel={`${t.label} theme`}
              accessibilityState={{ selected: active }}
              style={{
                width: '31%', borderRadius: 12, overflow: 'hidden',
                borderWidth: active ? 2 : 1, borderColor: active ? palette.primary : palette.border,
              }}
            >
              <View style={{ backgroundColor: t.bg, padding: 12, gap: 6 }}>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: t.text, opacity: 0.9 }} />
                <View style={{ height: 8, borderRadius: 4, backgroundColor: t.text, opacity: 0.5, width: '75%' }} />
                <View style={{ height: 8, borderRadius: 4, backgroundColor: t.accent, width: '50%' }} />
              </View>
              <Text style={{ textAlign: 'center', paddingVertical: 8, fontSize: 13, fontWeight: active ? '700' : '500', color: palette.foreground, fontFamily: 'Inter' }}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

/* ── Display settings ──────────────────────────────────── */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 8, marginBottom: 16 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1, color: palette.muted, fontFamily: 'Inter' }}>
        {label.toUpperCase()}
      </Text>
      {children}
    </View>
  );
}

function Stepper({ value, min, max, step = 1, format, onChange, label }: {
  value: number; min: number; max: number; step?: number;
  format: (v: number) => string; onChange: (v: number) => void; label: string;
}) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Pressable
        onPress={() => onChange(Math.max(min, value - step))}
        accessibilityRole="button" accessibilityLabel={`Decrease ${label}`}
        style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="Minus" size={20} color={palette.foreground} />
      </Pressable>
      <Text style={{ fontSize: 16, fontWeight: '600', color: palette.foreground, fontFamily: 'Inter' }}>{format(value)}</Text>
      <Pressable
        onPress={() => onChange(Math.min(max, value + step))}
        accessibilityRole="button" accessibilityLabel={`Increase ${label}`}
        style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="Plus" size={20} color={palette.foreground} />
      </Pressable>
    </View>
  );
}

export function DisplaySheet({ visible, onClose, onNeedPremium, onCustomFont, pdfArticle, bilingual }: {
  visible: boolean; onClose: () => void; onNeedPremium: (source: string) => void; onCustomFont: () => void;
  /** B1 — PDF article-view controls (only passed for PDF books). */
  pdfArticle?: {
    enabled: boolean;
    available: boolean;
    crop: 'none' | 'narrow' | 'wide';
    onToggle: (v: boolean) => void;
    onCrop: (c: 'none' | 'narrow' | 'wide') => void;
  };
  /** E2 — bilingual accordion toggle (only passed for reflow books). */
  bilingual?: {
    enabled: boolean;
    target: string;
    onToggle: (v: boolean) => void;
  };
}) {
  const { palette } = useTheme();
  const r = useReaderStore();
  const isPremium = usePremiumStore((s) => s.isPremium);
  const brightnessOverride = useSettingsStore((s) => s.brightnessOverride);
  const setSettings = useSettingsStore((s) => s.set);
  return (
    <Sheet visible={visible} onClose={onClose} title="Display">
      <ScrollView showsVerticalScrollIndicator={false}>
        {bilingual ? (
          <Row label="Bilingual view">
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label="Original" active={!bilingual.enabled} onPress={() => bilingual.onToggle(false)} />
              <Chip label={`+ ${bilingual.target.toUpperCase()}`} icon="Languages" active={bilingual.enabled} onPress={() => bilingual.onToggle(true)} />
            </View>
            <Text style={{ fontSize: 12, color: palette.muted, fontFamily: 'Inter' }}>
              Tucks a translation under each paragraph of the current chapter (cached; needs your key in Settings → Translate).
            </Text>
          </Row>
        ) : null}
        {pdfArticle ? (
          <Row label="PDF article view">
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label="Pages" icon="FileText" active={!pdfArticle.enabled} onPress={() => pdfArticle.onToggle(false)} />
              <Chip label="Article" icon="Newspaper" active={pdfArticle.enabled} onPress={() => pdfArticle.onToggle(true)} />
            </View>
            {!pdfArticle.available ? (
              <Text style={{ fontSize: 12, color: palette.muted, fontFamily: 'Inter' }}>
                No extractable text in this PDF (scanned images need OCR) — Article view needs a text layer.
              </Text>
            ) : (
              <>
                <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1, color: palette.muted, fontFamily: 'Inter', marginTop: 8 }}>
                  MARGIN CROP
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  {(['none', 'narrow', 'wide'] as const).map((c) => (
                    <Chip key={c} label={c[0]!.toUpperCase() + c.slice(1)} active={pdfArticle.crop === c} onPress={() => pdfArticle.onCrop(c)} />
                  ))}
                </View>
                <Text style={{ fontSize: 12, color: palette.muted, fontFamily: 'Inter' }}>
                  Reflows the text layer with reader themes, focus mode and TTS. Crop tightens the text width.
                </Text>
              </>
            )}
          </Row>
        ) : null}
        <Row label="Font">
          <View style={{ gap: 8 }}>
            {readerFonts.map((f) => {
              const locked = f.premium && !isPremium;
              const active = r.font === f.id;
              return (
                <Pressable
                  key={f.id}
                  onPress={() => {
                    if (locked) { onNeedPremium('custom-font'); return; }
                    if (f.id === 'custom') { onCustomFont(); return; }
                    r.applySettings({ font: f.id });
                  }}
                  accessibilityRole="radio"
                  accessibilityLabel={`${f.label}${locked ? ', premium' : ''}`}
                  accessibilityState={{ selected: active }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    padding: 12, borderRadius: 12, borderWidth: active ? 2 : 1,
                    borderColor: active ? palette.primary : palette.border, backgroundColor: palette.surface,
                  }}
                >
                  <Text style={{ fontSize: 17, color: palette.foreground, fontFamily: 'Inter' }}>
                    {f.label} <Text style={{ color: palette.muted, fontSize: 14 }}>— Ag</Text>
                  </Text>
                  {locked ? <Icon name="Crown" size={18} color={palette.primary} /> : active ? <Icon name="Check" size={18} color={palette.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Row>
        <Row label="Text size">
          <Stepper label="text size" value={r.fontSize} min={12} max={32} format={(v) => `${v} pt`} onChange={(v) => r.applySettings({ fontSize: v })} />
        </Row>
        <Row label="Line spacing">
          <Stepper label="line spacing" value={r.lineSpacing} min={1.2} max={2} step={0.1} format={(v) => `${v.toFixed(1)}×`} onChange={(v) => r.applySettings({ lineSpacing: Math.round(v * 10) / 10 })} />
        </Row>
        <Row label="Boldness">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[400, 500, 700].map((w) => (
              <Chip key={w} label={w === 400 ? 'Regular' : w === 500 ? 'Medium' : 'Bold'} active={r.fontWeight === w} onPress={() => r.applySettings({ fontWeight: w })} />
            ))}
          </View>
        </Row>
        <Row label="Margins">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['S', 'M', 'L', 'XL'] as const).map((m) => (
              <Chip key={m} label={m} active={r.margin === m} onPress={() => r.applySettings({ margin: m })} />
            ))}
          </View>
        </Row>
        <Row label="Layout">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="Pages" icon="BookOpen" active={r.pageMode === 'paginated'} onPress={() => r.applySettings({ pageMode: 'paginated' })} />
            <Chip label="Scroll" icon="MoveVertical" active={r.pageMode === 'scroll'} onPress={() => r.applySettings({ pageMode: 'scroll' })} />
            <Chip label="Hyphenate" icon="TextAlignJustify" active={r.hyphenation} onPress={() => r.applySettings({ hyphenation: !r.hyphenation })} />
          </View>
        </Row>
        <Row label="Orientation lock">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['system', 'portrait', 'landscape'] as const).map((o) => (
              <Chip key={o} label={o[0]!.toUpperCase() + o.slice(1)} active={r.orientation === o} onPress={() => r.applySettings({ orientation: o })} />
            ))}
          </View>
        </Row>
        {/* Phase 4 D1 — Focus reading (free growth hook) */}
        <Row label="Focus mode">
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {(['off', 'paragraph', 'sentence'] as const).map((m) => (
              <Chip
                key={m}
                label={m === 'off' ? 'Off' : m === 'paragraph' ? 'Paragraph' : 'Sentence'}
                icon={m === 'off' ? undefined : 'Crosshair'}
                active={r.focusMode === m}
                onPress={() => r.applySettings({ focusMode: m })}
              />
            ))}
          </View>
          <Text style={{ fontSize: 12, color: palette.muted, fontFamily: 'Inter' }}>
            Dims everything but the active {r.focusMode === 'sentence' ? 'sentence' : 'paragraph'}. Tap text to jump focus.
          </Text>
        </Row>
        {/* Phase 4 D2 — Bionic + Irlen (free growth hooks) */}
        <Row label="Reading comfort">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
            <Text style={{ fontSize: 15, color: palette.foreground, fontFamily: 'Inter' }}>Syllable bolding</Text>
            <Switch value={r.bionic} onValueChange={(v) => r.applySettings({ bionic: v })} trackColor={{ true: palette.primary }} />
          </View>
          <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1, color: palette.muted, fontFamily: 'Inter', marginTop: 8 }}>
            TINT OVERLAY
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {irlenTints.map((t) => (
              <Chip
                key={t.id}
                label={t.label}
                active={r.irlenTint === t.id}
                onPress={() => r.applySettings({ irlenTint: t.id })}
              />
            ))}
          </View>
        </Row>
        <Row label="Brightness">
          {brightnessOverride == null ? (
            <Chip label="System brightness" icon="Sun" active onPress={() => setSettings({ brightnessOverride: 0.7 })} />
          ) : (
            <Stepper
              label="brightness"
              value={Math.round(brightnessOverride * 100)}
              min={10} max={100} step={5}
              format={(v) => `${v}%`}
              onChange={(v) => setSettings({ brightnessOverride: v / 100 })}
            />
          )}
          {brightnessOverride != null ? (
            <View style={{ marginTop: 8 }}>
              <Chip label="Back to system" icon="RotateCcw" onPress={() => setSettings({ brightnessOverride: null })} />
            </View>
          ) : null}
        </Row>
        <Row label="Page strip">
          <Chip
            label={isPremium ? 'Visible above the bar' : 'Visual strip — Premium'}
            icon={isPremium ? 'LayoutGrid' : 'Crown'}
            active={isPremium}
            onPress={() => { if (!isPremium) onNeedPremium('thumbs'); }}
          />
        </Row>
        <View style={{ height: 24 }} />
      </ScrollView>
    </Sheet>
  );
}

/* ── Table of contents ─────────────────────────────────── */
export function TocSheet({ visible, onClose, onJump }: {
  visible: boolean; onClose: () => void; onJump: (chapterId: string) => void;
}) {
  const { palette } = useTheme();
  const items = useReaderStore((s) => s.toc);
  return (
    <Sheet visible={visible} onClose={onClose} title="Contents">
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
        {items.length === 0 ? (
          <Text style={{ color: palette.muted, fontFamily: 'Inter', paddingVertical: 16 }}>
            No table of contents in this file — use the progress scrubber to navigate.
          </Text>
        ) : (
          items.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => { onJump(t.href); onClose(); }}
              accessibilityRole="menuitem"
              accessibilityLabel={t.label}
              style={{ paddingVertical: 12, paddingLeft: 8 + t.level * 16, borderBottomWidth: 1, borderBottomColor: palette.border }}
            >
              <Text numberOfLines={2} style={{ fontSize: 15, color: palette.foreground, fontFamily: 'Inter' }}>{t.label}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </Sheet>
  );
}

/* ── Highlight color picker ────────────────────────────── */
export function HighlightColors({ onPick, onNeedPremium }: {
  onPick: (color: string) => void; onNeedPremium: (source: string) => void;
}) {
  const { palette } = useTheme();
  const isPremium = usePremiumStore((s) => s.isPremium);
  return (
    <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
      {highlightColors.map((c) => {
        const locked = c.premium && !isPremium;
        return (
          <Pressable
            key={c.id}
            onPress={() => (locked ? onNeedPremium('highlight-colors') : onPick(c.value))}
            accessibilityRole="button"
            accessibilityLabel={`${c.id} highlight${locked ? ', premium' : ''}`}
            style={{
              width: 44, height: 44, borderRadius: 22, backgroundColor: c.value,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 2, borderColor: palette.surface,
              opacity: locked ? 0.55 : 1,
            }}
          >
            {locked ? <Icon name="Lock" size={16} color="#00000088" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
