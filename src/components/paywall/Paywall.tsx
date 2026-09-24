import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { PREMIUM_FEATURES } from '@/stores/usePremiumStore';
import { Pressable } from '../ui/pressable';
import { Icon, type IconName } from '../ui/Icon';
import { Button } from '../ui/controls';

const ICONS: Record<string, IconName> = {
  'no-ads': 'ShieldCheck',
  'drive-sync': 'CloudDownload',
  'bg-tts': 'Headphones',
  'fonts': 'Type',
  'colors': 'Highlighter',
  'thumbs': 'LayoutGrid',
};

export function PaywallContent({ source, prices, onPurchase, onRestore }: {
  source: string | null;
  /** Live store prices (null until offerings resolve → shows placeholders). */
  prices: { lifetime: string; yearly: string } | null;
  onPurchase: (plan: 'lifetime' | 'yearly') => Promise<void>;
  onRestore: () => Promise<void>;
}) {
  const { palette } = useTheme();
  const [plan, setPlan] = useState<'lifetime' | 'yearly'>('lifetime');
  const [busy, setBusy] = useState(false);

  const buy = async () => {
    setBusy(true);
    try { await onPurchase(plan); } finally { setBusy(false); }
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
      <View style={{ alignItems: 'center', paddingVertical: 20, gap: 8 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="Crown" size={32} color={palette.onPrimary} />
        </View>
        <Text style={{ fontSize: 26, fontWeight: '800', color: palette.foreground, fontFamily: 'CrimsonPro' }}>
          ReadNest Premium
        </Text>
        <Text style={{ fontSize: 14, color: palette.muted, fontFamily: 'Inter', textAlign: 'center', paddingHorizontal: 24 }}>
          {source === 'bg-tts' ? 'Background listening is a Premium feature.'
            : source === 'drive' ? 'Sync your library across every device.'
            : source === 'custom-font' ? 'Bring your own reading fonts.'
            : 'Unlock the full reading nest.'}
        </Text>
      </View>

      <View style={{ gap: 10, paddingHorizontal: 4 }}>
        {PREMIUM_FEATURES.map((f) => (
          <View key={f.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: palette.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: palette.border }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={ICONS[f.id] ?? 'Sparkles'} size={20} color={palette.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: palette.foreground, fontFamily: 'Inter' }}>{f.title}</Text>
              <Text style={{ fontSize: 13, color: palette.muted, fontFamily: 'Inter' }}>{f.desc}</Text>
            </View>
            <Icon name="Check" size={18} color={palette.secondary} />
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        {(['lifetime', 'yearly'] as const).map((id) => {
          const active = plan === id;
          return (
            <Pressable
              key={id}
              onPress={() => setPlan(id)}
              accessibilityRole="radio"
              accessibilityLabel={id === 'lifetime' ? 'Lifetime purchase' : 'Yearly subscription'}
              accessibilityState={{ selected: active }}
              style={{
                flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', gap: 4,
                borderWidth: active ? 2 : 1, borderColor: active ? palette.primary : palette.border,
                backgroundColor: active ? palette.surface : palette.surface2,
              }}
            >
              {id === 'lifetime' ? (
                <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1, color: palette.goldDeep, fontFamily: 'Inter' }}>BEST VALUE</Text>
              ) : null}
              <Text style={{ fontSize: 15, fontWeight: '700', color: palette.foreground, fontFamily: 'Inter' }}>
                {id === 'lifetime' ? 'Lifetime' : 'Yearly'}
              </Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: palette.foreground, fontFamily: 'Inter' }}>
                {prices ? (id === 'lifetime' ? prices.lifetime : prices.yearly) : (id === 'lifetime' ? '$24.99' : '$9.99/yr')}
              </Text>
              <Text style={{ fontSize: 11, color: palette.muted, fontFamily: 'Inter' }}>
                {id === 'lifetime' ? 'Pay once, yours forever' : 'Cancel anytime'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ marginTop: 16, gap: 10 }}>
        <Button title={plan === 'lifetime' ? 'Get Lifetime Access' : 'Start Yearly Plan'} icon="Crown" loading={busy} onPress={buy} />
        <Pressable onPress={onRestore} accessibilityRole="button" accessibilityLabel="Restore purchases" style={{ alignItems: 'center', padding: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: palette.primary, fontFamily: 'Inter' }}>Restore purchases</Text>
        </Pressable>
        <Text style={{ fontSize: 11, color: palette.faint, fontFamily: 'Inter', textAlign: 'center' }}>
          {prices ? (plan === 'lifetime'
            ? `Lifetime ${prices.lifetime} — pay once, yours forever.`
            : `Yearly ${prices.yearly} — auto-renews every year unless cancelled at least 24h before renewal.`)
            : 'Plans load with live store prices when RevenueCat is configured.'}
        </Text>
        <Text style={{ fontSize: 11, color: palette.faint, fontFamily: 'Inter', textAlign: 'center', paddingBottom: 24 }}>
          Prices in USD, may vary by region. Payment is charged to your Google Play / App Store account at confirmation.
          Manage or cancel anytime in Play Store / App Store subscriptions. See Privacy Policy and Terms in Settings.
        </Text>
      </View>
    </ScrollView>
  );
}
