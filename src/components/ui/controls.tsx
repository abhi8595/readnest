import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Pressable } from './pressable';
import { Icon, type IconName } from './Icon';

/* ── Button ────────────────────────────────────────────── */
interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
}

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, accessibilityHint }: ButtonProps) {
  const { palette } = useTheme();
  const bg =
    variant === 'primary' ? palette.primary
    : variant === 'danger' ? palette.destructive
    : variant === 'secondary' ? palette.surface2 : 'transparent';
  const fg =
    variant === 'primary' ? palette.onPrimary
    : variant === 'danger' ? palette.onPrimary
    : palette.foreground;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      haptic="light"
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={{
        backgroundColor: bg,
        borderRadius: 14,
        ...(variant === 'primary'
          ? { shadowColor: '#000', shadowOpacity: 0.20, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 }
          : {}),
        paddingVertical: 13,
        paddingHorizontal: 20,
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        opacity: disabled ? 0.45 : 1,
        borderWidth: variant === 'secondary' ? 1 : 0,
        borderColor: palette.border,
      }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size="md" color={fg} /> : null}
          <Text style={{ color: fg, fontSize: 16, fontWeight: '600', fontFamily: 'Inter' }}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

/* ── Chip ──────────────────────────────────────────────── */
export function Chip({ label, icon, active, onPress }: { label: string; icon?: IconName; active?: boolean; onPress?: () => void }) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999,
        backgroundColor: active ? palette.primary : palette.surface2,
        borderWidth: 1, borderColor: active ? palette.primary : palette.border,
      }}
    >
      {icon ? <Icon name={icon} size={16} color={active ? palette.onPrimary : palette.muted} /> : null}
      <Text style={{ color: active ? palette.onPrimary : palette.foreground, fontSize: 14, fontWeight: '500', fontFamily: 'Inter' }}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ── Segmented control ─────────────────────────────────── */
export function SegmentedControl<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { palette } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', backgroundColor: palette.surface2, borderRadius: 12, padding: 4, gap: 2 }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: active }}
            style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              paddingVertical: 9, borderRadius: 9,
              backgroundColor: active ? palette.surface : 'transparent',
              ...(active ? { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 } : {}),
            }}
          >
            {o.icon ? <Icon name={o.icon} size={16} color={active ? palette.primary : palette.muted} /> : null}
            <Text style={{ fontSize: 13, fontWeight: active ? '600' : '500', fontFamily: 'Inter', color: active ? palette.foreground : palette.muted }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── Progress bar ──────────────────────────────────────── */
export function ProgressBar({ value, height = 4 }: { value: number; height?: number }) {
  const { palette } = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ now: Math.round(value * 100), min: 0, max: 100 }}
      style={{ height, borderRadius: height / 2, backgroundColor: palette.surface2, overflow: 'hidden' }}
    >
      <View style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, height: '100%', backgroundColor: palette.primary, borderRadius: height / 2 }} />
    </View>
  );
}

/* ── Empty state ───────────────────────────────────────── */
export function EmptyState({ icon, title, desc, action }: { icon: IconName; title: string; desc: string; action?: React.ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 32, paddingVertical: 48, gap: 8 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        <Icon name={icon} size="lg" color={palette.muted} />
      </View>
      <Text style={{ fontSize: 18, fontWeight: '600', color: palette.foreground, fontFamily: 'Inter', textAlign: 'center' }}>{title}</Text>
      <Text style={{ fontSize: 14, color: palette.muted, fontFamily: 'Inter', textAlign: 'center', lineHeight: 21 }}>{desc}</Text>
      {action ? <View style={{ marginTop: 12 }}>{action}</View> : null}
    </View>
  );
}
