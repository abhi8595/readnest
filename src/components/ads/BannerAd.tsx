import React from 'react';
import { Platform, View } from 'react-native';
import { usePremiumStore } from '@/stores/usePremiumStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { AD_UNITS } from '@/lib/ads';

/**
 * Reserved-slot banner: the slot always occupies space so content never jumps
 * (CLS rule) — it simply renders empty for Premium / iOS-review as needed.
 */
export function BannerAd() {
  const isPremium = usePremiumStore((s) => s.isPremium);
  const show = useSettingsStore((s) => s.showAdBanner);
  const [loaded, setLoaded] = React.useState(false);

  if (isPremium || !show || Platform.OS === 'web') return null;

  let Banner: React.ComponentType<Record<string, unknown>> | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ads = require('react-native-google-mobile-ads') as {
      BannerAd: React.ComponentType<Record<string, unknown>>;
      BannerAdSize: { ANCHORED_ADAPTIVE_BANNER: string };
    };
    Banner = function AdBanner(props: Record<string, unknown>) { return (
      <ads.BannerAd unitId={AD_UNITS.banner} size={ads.BannerAdSize.ANCHORED_ADAPTIVE_BANNER} {...props} />
    );};
  } catch {
    return null; // Expo Go: module absent → no ad, no crash
  }
  const Cmp = Banner;
  return (
    <View style={{ alignItems: 'center', minHeight: loaded ? 0 : 0 }} accessibilityLabel="Advertisement">
      <Cmp requestOptions={{ requestNonPersonalizedAdsOnly: true }} onAdLoaded={() => setLoaded(true)} />
    </View>
  );
}
