import '../global.css';
import React, { useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  CrimsonPro_400Regular, CrimsonPro_500Medium, CrimsonPro_600SemiBold,
  CrimsonPro_400Regular_Italic, CrimsonPro_600SemiBold_Italic,
} from '@expo-google-fonts/crimson-pro';
import {
  AtkinsonHyperlegible_400Regular, AtkinsonHyperlegible_700Bold, AtkinsonHyperlegible_400Regular_Italic,
} from '@expo-google-fonts/atkinson-hyperlegible';
import { LibreBaskerville_400Regular, LibreBaskerville_700Bold } from '@expo-google-fonts/libre-baskerville';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { usePremiumStore } from '@/stores/usePremiumStore';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { ensureDirs } from '@/lib/files';
import { getDb } from '@/db/client';
import { importFileFromUri } from '@/lib/import';

void SplashScreen.preventAutoHideAsync();

function Gate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const onboarded = useSettingsStore((s) => s.onboarded);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let removeListener: (() => void) | null = null;
    (async () => {
      try {
        await Promise.all([
          Font.loadAsync({
            Inter: Inter_400Regular, InterMedium: Inter_500Medium, InterSemiBold: Inter_600SemiBold, InterBold: Inter_700Bold,
            CrimsonPro: CrimsonPro_400Regular, CrimsonProMedium: CrimsonPro_500Medium, CrimsonProSemiBold: CrimsonPro_600SemiBold,
            CrimsonProItalic: CrimsonPro_400Regular_Italic, CrimsonProSemiBoldItalic: CrimsonPro_600SemiBold_Italic,
            AtkinsonHyperlegible: AtkinsonHyperlegible_400Regular, AtkinsonHyperlegibleBold: AtkinsonHyperlegible_700Bold,
            AtkinsonHyperlegibleItalic: AtkinsonHyperlegible_400Regular_Italic,
            LibreBaskerville: LibreBaskerville_400Regular, LibreBaskervilleBold: LibreBaskerville_700Bold,
          } as never),
          ensureDirs(),
          getDb(),
        ]);
        // Hydrate persisted settings first (fixes onboarding loop on cold start).
        try { await useSettingsStore.getState().hydrate(); } catch { /* defaults */ }
        // Premium: provisional offline judgment from expiry-anchored cache,
        // then authoritative network check + live entitlement listener.
        try {
          const { addPremiumListener, checkPremium, isCacheEntitled, readPremiumCache } = await import('@/lib/billing');
          const cached = await readPremiumCache();
          if (!cancelled) {
            if (isCacheEntitled(cached)) usePremiumStore.getState().setPremium(true, 'subscription');
            else usePremiumStore.getState().setStatus('loading');
          }
          try {
            const { initPurchases } = await import('@/lib/billing');
            await initPurchases();
            const premium = await checkPremium();
            if (!cancelled) usePremiumStore.getState().setPremium(premium, premium ? 'subscription' : 'free');
          } catch { if (!cancelled && !isCacheEntitled(cached)) usePremiumStore.getState().setStatus('not_entitled'); }
          removeListener = await addPremiumListener((active) => {
            if (!cancelled) usePremiumStore.getState().setPremium(active, active ? 'subscription' : 'free');
          });
        } catch { /* offline / no keys */ }
      } finally {
        if (!cancelled) {
          setReady(true);
          await SplashScreen.hideAsync().catch(() => {});
        }
      }
    })();
    return () => { cancelled = true; removeListener?.(); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const inOnboarding = segments[0] === 'onboarding';
    if (!onboarded && !inOnboarding) router.replace('/onboarding');
    else if (onboarded && inOnboarding) router.replace('/(tabs)');
  }, [ready, onboarded, segments, router]);

  // Android "Open with ReadNest" (VIEW intent) + any file:// / content:// URL:
  // import the file, refresh the library, and open the reader when possible.
  useEffect(() => {
    if (!ready) return;
    const handle = (url: string | null) => {
      if (!url || !/^(file|content):/i.test(url)) return;
      void (async () => {
        try {
          const raw = url.split('/').pop() ?? 'book';
          let name = raw;
          try { name = decodeURIComponent(raw); } catch { /* keep raw */ }
          const book = await importFileFromUri(url, name);
          await useLibraryStore.getState().refresh();
          if (onboarded) router.push(`/reader/${book.id}`);
          else Alert.alert('Book imported', `"${book.title ?? name}" is waiting in your library.`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Import failed';
          if (msg.startsWith('UNSUPPORTED:')) {
            Alert.alert('Unsupported file', 'ReadNest can open EPUB, PDF, TXT, Markdown, FB2, MOBI, DOCX, ODT and CBZ files.');
          } else {
            Alert.alert('Could not open file', msg);
          }
        }
      })();
    };
    void Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, [ready, onboarded, router]);

  if (!ready) return null;
  return <>{children}</>;
}

function ThemedStack() {
  const { scheme } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="reader/[id]" options={{ animation: 'fade', gestureEnabled: true }} />
        <Stack.Screen name="book/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="collection/[id]" />
        <Stack.Screen name="dictionary" options={{ presentation: 'modal' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <Gate>
            <ThemedStack />
          </Gate>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
