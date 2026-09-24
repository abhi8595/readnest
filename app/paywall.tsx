import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { usePremiumStore } from '@/stores/usePremiumStore';
import { getOfferings, isUserCancelled, purchasePackage, rcApiKey, restorePurchases, type BillingPackage } from '@/lib/billing';
import { PaywallContent } from '@/components/paywall/Paywall';
import { Pressable } from '@/components/ui/pressable';
import { Icon } from '@/components/ui/Icon';

export default function Paywall() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const source = usePremiumStore((s) => s.lastPaywallSource);
  const setPremium = usePremiumStore((s) => s.setPremium);
  const [pkgs, setPkgs] = useState<{ lifetime?: BillingPackage; annual?: BillingPackage } | null>(null);
  const [offerState, setOfferState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let live = true;
    // Fail fast with an honest state when RevenueCat is unconfigured.
    if (!rcApiKey()) { setOfferState('error'); return () => { live = false; }; }
    void getOfferings()
      .then((o) => { if (live) { setPkgs(o); setOfferState(!o.lifetime && !o.annual ? 'error' : 'ready'); } })
      .catch(() => { if (live) setOfferState('error'); });
    return () => { live = false; };
  }, []);

  const buy = async (plan: 'lifetime' | 'yearly') => {
    try {
      const pkg = plan === 'lifetime' ? pkgs?.lifetime : pkgs?.annual;
      if (!pkg) {
        Alert.alert(
          'Not available yet',
          'This product is not configured in RevenueCat yet. Add the $rc_lifetime / $rc_annual packages to the current offering, then test in a store build.',
        );
        return;
      }
      const ok = await purchasePackage(pkg);
      if (ok) {
        setPremium(true, plan);
        Alert.alert('Welcome to Premium', 'All features unlocked. Happy reading!', [{ text: 'Read now', onPress: () => router.back() }]);
      }
    } catch (e) {
      if (isUserCancelled(e)) return;
      Alert.alert(
        'Purchase unavailable',
        'Billing is wired via RevenueCat — add your API keys and products, then test in a store build. (Expo Go cannot process real purchases.)',
      );
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12 }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close paywall" style={{ padding: 10, borderRadius: 999, backgroundColor: palette.surface2 }}>
          <Icon name="X" size={20} color={palette.foreground} />
        </Pressable>
      </View>
      <View style={{ flex: 1, paddingHorizontal: 16 }}>
        {offerState === 'loading' ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <ActivityIndicator size="large" color={palette.primary} />
            <Text style={{ color: palette.muted, fontFamily: 'Inter' }}>Loading plans…</Text>
          </View>
        ) : (
          <PaywallContent
            source={source}
            prices={pkgs ? {
              lifetime: pkgs.lifetime?.price ?? '—',
              yearly: pkgs.annual?.price ?? '—',
            } : null}
            onPurchase={buy}
            onRestore={async () => {
              try {
                const ok = await restorePurchases();
                if (ok) {
                  setPremium(true, 'restored');
                  Alert.alert('Restored', 'Your Premium access is back.');
                } else {
                  Alert.alert('Nothing to restore', 'No active Premium found on this account.');
                }
              } catch {
                Alert.alert('Restore failed', 'Check your connection and try again.');
              }
            }}
          />
        )}
      </View>
    </View>
  );
}
