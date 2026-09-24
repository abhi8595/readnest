import React, { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as SecureStore from 'expo-secure-store';
import { useTheme } from '@/theme/ThemeProvider';
import { irlenTints, readerThemes, type ReaderThemeId } from '@/theme/tokens';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { usePremiumStore } from '@/stores/usePremiumStore';
import { googleAuthIds } from '@/lib/config';
import { getReadingStats, getDailySeries, formatDuration, type DayReading, type ReadingStats } from '@/lib/stats';
import { isAuthError, mergeSnapshot, pullFromDrive, pushToDrive } from '@/lib/drive';
import {
  isWebdavAuthError, pullFromWebdav, pushToWebdav, testWebdav,
  type WebdavConfig,
} from '@/lib/webdav';
import { getSyncHealth, lastSyncBaseline, recordSyncError, recordSyncSuccess, type SyncHealth } from '@/lib/syncHealth';
import { TRANSLATE_KEYS_SECURE_KEY } from '@/lib/translate';
import { AI_DEFAULT_BASE_URL, AI_DEFAULT_MODEL, AI_KEYS_SECURE_KEY, normalizeAiBaseUrl } from '@/lib/explain';
import { resetDb } from '@/db/client';
import { useLibraryStore } from '@/stores/useLibraryStore';
import { Chip } from '@/components/ui/controls';
import { Sheet } from '@/components/ui/Sheet';
import { Pressable } from '@/components/ui/pressable';
import { Icon, type IconName } from '@/components/ui/Icon';

WebBrowser.maybeCompleteAuthSession();

const DRIVE_TOKEN_KEY = 'readnest_drive_token';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

interface DriveAuth {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

async function loadDriveAuth(): Promise<DriveAuth | null> {
  try {
    const raw = await SecureStore.getItemAsync(DRIVE_TOKEN_KEY);
    if (!raw) return null;
    // Back-compat: earlier builds stored the bare access token string.
    if (!raw.startsWith('{')) return { accessToken: raw };
    const parsed = JSON.parse(raw) as DriveAuth;
    return parsed.accessToken ? parsed : null;
  } catch {
    return null;
  }
}

async function saveDriveAuth(auth: DriveAuth): Promise<void> {
  await SecureStore.setItemAsync(DRIVE_TOKEN_KEY, JSON.stringify(auth));
}

const WEBDAV_KEY = 'readnest_webdav';
export const TRANSLATE_KEYS_KEY = TRANSLATE_KEYS_SECURE_KEY;

async function loadWebdavConfig(): Promise<WebdavConfig | null> {
  try {
    const raw = await SecureStore.getItemAsync(WEBDAV_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WebdavConfig;
    return parsed.baseUrl ? parsed : null;
  } catch {
    return null;
  }
}

async function saveWebdavConfig(cfg: WebdavConfig): Promise<void> {
  await SecureStore.setItemAsync(WEBDAV_KEY, JSON.stringify(cfg));
}

/** A3 — post-sync summary incl. newest-wins conflicts. */
function syncSummary(merged: number, conflicts: number): string {
  const base = merged > 0
    ? `Pulled ${merged} update${merged === 1 ? '' : 's'} and backed up this device.`
    : 'Backup uploaded. This device was already up to date.';
  return conflicts > 0
    ? `${base}\n\n${conflicts} conflict${conflicts === 1 ? '' : 's'} where both devices changed the same note — newest kept on both sides.`
    : base;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1, color: palette.muted, fontFamily: 'Inter', marginBottom: 6, paddingHorizontal: 4 }}>
        {title.toUpperCase()}
      </Text>
      <View style={{ backgroundColor: palette.surface, borderRadius: 14, borderWidth: 1, borderColor: palette.border, overflow: 'hidden' }}>
        {children}
      </View>
    </View>
  );
}

function Row({ icon, title, desc, right, onPress, danger }: {
  icon: IconName; title: string; desc?: string; right?: React.ReactNode; onPress?: () => void; danger?: boolean;
}) {
  const { palette } = useTheme();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={19} color={danger ? palette.destructive : palette.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: danger ? palette.destructive : palette.foreground, fontFamily: 'Inter' }}>{title}</Text>
        {desc ? <Text style={{ fontSize: 12, color: palette.muted, fontFamily: 'Inter', marginTop: 1 }}>{desc}</Text> : null}
      </View>
      {right ?? (onPress ? <Icon name="ChevronRight" size={18} color={palette.muted} /> : null)}
    </View>
  );
  if (!onPress) return <View style={{ borderBottomWidth: 1, borderBottomColor: palette.border }}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={{ borderBottomWidth: 1, borderBottomColor: palette.border }}>
      {body}
    </Pressable>
  );
}

export default function Settings() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const s = useSettingsStore();
  const isPremium = usePremiumStore((st) => st.isPremium);
  const refresh = useLibraryStore((l) => l.refresh);
  const [stats, setStats] = useState<ReadingStats | null>(null);
  const [series, setSeries] = useState<DayReading[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [driveConnected, setDriveConnected] = useState(false);
  // A1/A2 — WebDAV config + sync health dashboard state.
  const [health, setHealth] = useState<SyncHealth | null>(null);
  const [webdavConfigured, setWebdavConfigured] = useState(false);
  const [webdavOpen, setWebdavOpen] = useState(false);
  const [wdUrl, setWdUrl] = useState('');
  const [wdUser, setWdUser] = useState('');
  const [wdPass, setWdPass] = useState('');
  const [wdPath, setWdPath] = useState('ReadNest');
  const [wdTesting, setWdTesting] = useState(false);
  // E1 — translate key entry (BYOK; key itself lives in SecureStore).
  const [trKey, setTrKey] = useState('');
  const [trKeySaved, setTrKeySaved] = useState(false);
  const [trSaving, setTrSaving] = useState(false);
  // F4 — AI explain key entry (BYOK OpenAI-compatible).
  const [aiBase, setAiBase] = useState(AI_DEFAULT_BASE_URL);
  const [aiModel, setAiModel] = useState(AI_DEFAULT_MODEL);
  const [aiKey, setAiKey] = useState('');
  const [aiSaved, setAiSaved] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);

  const googleIds = googleAuthIds();
  // Gate on the client ID for the running platform (a lone iOS ID must not pass on Android).
  const platformId = Platform.OS === 'ios' ? googleIds.iosClientId : Platform.OS === 'android' ? googleIds.androidClientId : googleIds.webClientId;
  const oauthConfigured = Boolean(platformId);

  const [, response, promptAsync] = Google.useAuthRequest({
    iosClientId: googleIds.iosClientId || undefined,
    androidClientId: googleIds.androidClientId || undefined,
    webClientId: googleIds.webClientId || undefined,
    scopes: [DRIVE_SCOPE],
  });

  useEffect(() => {
    void getReadingStats().then(setStats);
    void getDailySeries(14).then(setSeries);
    void loadDriveAuth().then((t) => setDriveConnected(t != null));
    void getSyncHealth().then(setHealth);
    void loadWebdavConfig().then((c) => {
      setWebdavConfigured(c != null);
      if (c) {
        setWdUrl(c.baseUrl);
        setWdUser(c.username);
        setWdPath(c.path || 'ReadNest');
      }
    });
    void SecureStore.getItemAsync(TRANSLATE_KEYS_KEY).then((raw) => {
      if (!raw) return;
      try {
        const k = JSON.parse(raw) as { deeplKey?: string; googleKey?: string };
        if (k.deeplKey || k.googleKey) setTrKeySaved(true);
      } catch { /* ignore */ }
    });
    void SecureStore.getItemAsync(AI_KEYS_SECURE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const k = JSON.parse(raw) as { baseUrl?: string; model?: string; apiKey?: string };
        if (k.baseUrl) setAiBase(k.baseUrl);
        if (k.model) setAiModel(k.model);
        if (k.apiKey) setAiSaved(true);
      } catch { /* ignore */ }
    });
  }, []);

  const reauth = () => {
    void SecureStore.deleteItemAsync(DRIVE_TOKEN_KEY).then(() => setDriveConnected(false));
    Alert.alert('Session expired', 'Please sign in with Google again to continue syncing.', [
      { text: 'Later', style: 'cancel' },
      { text: 'Sign in', onPress: () => { void promptAsync().catch(() => {}); } },
    ]);
  };

  const runSync = async (auth: DriveAuth) => {
    setSyncing(true);
    try {
      // Fail closed: if pull throws (offline/401), never push — pushing would
      // overwrite the remote backup with stale local state.
      const baseline = lastSyncBaseline(await getSyncHealth());
      const remote = await pullFromDrive(auth.accessToken);
      let merged = 0;
      let conflicts = 0;
      if (remote) ({ merged, conflicts } = await mergeSnapshot(remote, { since: baseline }));
      await pushToDrive(auth.accessToken);
      await recordSyncSuccess('drive', merged, conflicts);
      setHealth(await getSyncHealth());
      void refresh(s.sortKey);
      Alert.alert('Synced', syncSummary(merged, conflicts));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Check your connection and try again.';
      await recordSyncError('drive', msg);
      setHealth(await getSyncHealth());
      if (isAuthError(e)) { reauth(); return; }
      Alert.alert('Sync failed', msg);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (response?.type === 'success') {
      const a = response.authentication;
      if (a?.accessToken) {
        const auth: DriveAuth = {
          accessToken: a.accessToken,
          refreshToken: a.refreshToken ?? undefined,
          expiresAt: a.expiresIn ? Date.now() + a.expiresIn * 1000 : undefined,
        };
        void saveDriveAuth(auth).then(() => {
          setDriveConnected(true);
          void runSync(auth);
        });
      }
    } else if (response?.type === 'error') {
      Alert.alert('Google sign-in failed', 'Please try again.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  const syncNow = async () => {
    if (!isPremium) {
      router.push('/paywall');
      return;
    }
    if (!oauthConfigured) {
      Alert.alert(
        'Google sign-in not configured',
        'Add your Google OAuth client ID for this platform to app.config.js → extra.googleAuth (see README “Google Drive sync”), rebuild, and try again.',
      );
      return;
    }
    const existing = await loadDriveAuth();
    if (existing) {
      await runSync(existing);
      return;
    }
    try {
      await promptAsync();
    } catch {
      Alert.alert('Google sign-in failed', 'The system browser could not be opened.');
    }
  };

  const disconnectDrive = () => {
    Alert.alert('Disconnect Drive?', 'Removes the saved sign-in on this device. Your Drive backup stays untouched.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect', style: 'destructive',
        onPress: () => {
          void SecureStore.deleteItemAsync(DRIVE_TOKEN_KEY).then(() => setDriveConnected(false));
        },
      },
    ]);
  };

  /* ── A1/A2: WebDAV sync (fail-closed pull→merge→push + health) ── */
  const runWebdavSync = async () => {
    if (!isPremium) {
      router.push('/paywall');
      return;
    }
    const cfg = await loadWebdavConfig();
    if (!cfg) {
      setWebdavOpen(true);
      return;
    }
    setSyncing(true);
    try {
      const baseline = lastSyncBaseline(await getSyncHealth());
      const remote = await pullFromWebdav(cfg);
      let merged = 0;
      let conflicts = 0;
      if (remote) ({ merged, conflicts } = await mergeSnapshot(remote, { since: baseline }));
      await pushToWebdav(cfg);
      await recordSyncSuccess('webdav', merged, conflicts);
      setHealth(await getSyncHealth());
      void refresh(s.sortKey);
      Alert.alert('Synced', syncSummary(merged, conflicts));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Check your connection and try again.';
      await recordSyncError('webdav', msg);
      setHealth(await getSyncHealth());
      if (isWebdavAuthError(e)) {
        Alert.alert('WebDAV sign-in rejected', 'Check the username and app password in WebDAV settings.', [
          { text: 'Later', style: 'cancel' },
          { text: 'Open settings', onPress: () => setWebdavOpen(true) },
        ]);
        return;
      }
      Alert.alert('WebDAV sync failed', msg);
    } finally {
      setSyncing(false);
    }
  };

  const saveWebdav = async () => {
    const cfg: WebdavConfig = {
      baseUrl: wdUrl.trim(),
      username: wdUser.trim(),
      password: wdPass,
      path: wdPath.trim() || 'ReadNest',
    };
    setWdTesting(true);
    try {
      await testWebdav(cfg);
      await saveWebdavConfig(cfg);
      setWebdavConfigured(true);
      setWebdavOpen(false);
      setWdPass('');
      Alert.alert('WebDAV connected', 'Connection looks good. Run “Sync now” to back up this device.', [
        { text: 'Later', style: 'cancel' },
        { text: 'Sync now', onPress: () => { void runWebdavSync(); } },
      ]);
    } catch (e) {
      Alert.alert('Connection failed', e instanceof Error ? e.message : 'Check the server URL and credentials.');
    } finally {
      setWdTesting(false);
    }
  };

  const disconnectWebdav = () => {
    Alert.alert('Remove WebDAV?', 'Deletes the saved server sign-in on this device. Your remote backup stays untouched.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: () => {
          void SecureStore.deleteItemAsync(WEBDAV_KEY).then(() => setWebdavConfigured(false));
        },
      },
    ]);
  };

  /* ── E1: save translate key (provider-scoped, SecureStore) ── */
  const saveTranslateKey = async () => {
    const v = trKey.trim();
    if (!v) {
      Alert.alert('Empty key', 'Paste your DeepL or Google API key first.');
      return;
    }
    setTrSaving(true);
    try {
      const raw = await SecureStore.getItemAsync(TRANSLATE_KEYS_KEY);
      const cur = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      cur[s.translateProvider === 'deepl' ? 'deeplKey' : 'googleKey'] = v;
      await SecureStore.setItemAsync(TRANSLATE_KEYS_KEY, JSON.stringify(cur));
      setTrKey('');
      setTrKeySaved(true);
      Alert.alert('Key saved', 'Stored securely on this device. Translations are cached per book.');
    } catch {
      Alert.alert('Save failed', 'The key could not be stored on this device.');
    } finally {
      setTrSaving(false);
    }
  };

  /* ── F4: save AI explain config (BYOK, SecureStore) ── */
  const saveAiConfig = async () => {
    const v = aiKey.trim();
    if (!v) {
      Alert.alert('Empty key', 'Paste your AI API key first.');
      return;
    }
    let base = aiBase.trim() || AI_DEFAULT_BASE_URL;
    try {
      base = normalizeAiBaseUrl(base);
    } catch (e) {
      Alert.alert('Bad base URL', e instanceof Error ? e.message : 'Check the base URL.');
      return;
    }
    setAiSaving(true);
    try {
      await SecureStore.setItemAsync(AI_KEYS_SECURE_KEY, JSON.stringify({
        baseUrl: base, model: aiModel.trim() || AI_DEFAULT_MODEL, apiKey: v,
      }));
      setAiBase(base);
      setAiKey('');
      setAiSaved(true);
      Alert.alert('AI connected', 'Stored securely on this device. Explanations are cached per passage.');
    } catch {
      Alert.alert('Save failed', 'The config could not be stored on this device.');
    } finally {
      setAiSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: palette.foreground, fontFamily: 'CrimsonPro' }}>Settings</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }}>
        {/* Stats card */}
        <View style={{ backgroundColor: palette.primary, borderRadius: 16, padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="Flame" size={18} color={palette.onPrimary} />
            <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: 1, color: palette.onPrimary, fontFamily: 'Inter' }}>
              {stats ? `${stats.streakDays}-DAY STREAK` : 'READING STATS'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            {[
              { v: stats ? formatDuration(stats.todaySeconds) : '—', l: 'Today' },
              { v: stats ? formatDuration(stats.weekSeconds) : '—', l: 'This week' },
              { v: String(stats?.booksFinished ?? '—'), l: 'Finished' },
              { v: String(stats?.quotes ?? '—'), l: 'Quotes' },
            ].map((it) => (
              <View key={it.l} style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: palette.onPrimary, fontFamily: 'Inter' }}>{it.v}</Text>
                <Text style={{ fontSize: 11, color: palette.onPrimary, opacity: 0.8, fontFamily: 'Inter' }}>{it.l}</Text>
              </View>
            ))}
          </View>
          {/* Daily goal progress */}
          {(() => {
            const goalSecs = Math.max(1, s.dailyGoalMinutes) * 60;
            const done = Math.min(1, (stats?.todaySeconds ?? 0) / goalSecs);
            return (
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: palette.onPrimary, opacity: 0.9, fontFamily: 'Inter' }}>
                    DAILY GOAL · {s.dailyGoalMinutes} MIN
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: palette.onPrimary, fontFamily: 'Inter' }}>
                    {Math.round(done * 100)}%
                  </Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' }}>
                  <View style={{ height: 6, borderRadius: 3, width: `${Math.round(done * 100)}%`, backgroundColor: palette.onPrimary }} />
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[10, 20, 30, 60].map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => s.set({ dailyGoalMinutes: m })}
                      accessibilityRole="radio"
                      accessibilityLabel={`${m} minutes daily goal`}
                      accessibilityState={{ selected: s.dailyGoalMinutes === m }}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                        backgroundColor: s.dailyGoalMinutes === m ? palette.onPrimary : 'rgba(255,255,255,0.18)',
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: s.dailyGoalMinutes === m ? palette.primary : palette.onPrimary, fontFamily: 'Inter' }}>
                        {m}m
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })()}
          {/* Last 14 days */}
          {series.length > 0 ? (
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1, color: palette.onPrimary, opacity: 0.9, fontFamily: 'Inter' }}>
                LAST 14 DAYS
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 44 }}>
                {(() => {
                  const max = Math.max(60, ...series.map((d) => d.seconds));
                  return series.map((d) => (
                    <View
                      key={d.day}
                      accessibilityLabel={`${new Date(d.day).toLocaleDateString()}: ${formatDuration(d.seconds)}`}
                      style={{
                        flex: 1, borderRadius: 3,
                        height: Math.max(4, Math.round((d.seconds / max) * 44)),
                        backgroundColor: d.seconds > 0 ? palette.onPrimary : 'rgba(255,255,255,0.25)',
                        opacity: d.seconds > 0 ? 1 : 0.7,
                      }}
                    />
                  ));
                })()}
              </View>
            </View>
          ) : null}
        </View>

        {/* Premium banner */}
        <Pressable
          onPress={() => router.push('/paywall')}
          accessibilityRole="button"
          accessibilityLabel={isPremium ? 'Premium active' : 'Get Premium'}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: palette.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: isPremium ? palette.secondary : palette.primary }}
        >
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: isPremium ? palette.secondary : palette.gold, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="Crown" size={20} color={isPremium ? '#FFF' : palette.onGold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: palette.foreground, fontFamily: 'Inter' }}>
              {isPremium ? 'Premium active' : 'ReadNest Premium'}
            </Text>
            <Text style={{ fontSize: 12, color: palette.muted, fontFamily: 'Inter' }}>
              {isPremium ? 'Thanks for supporting cozy reading.' : 'Sync, background listen, fonts, no ads.'}
            </Text>
          </View>
          {!isPremium ? <Icon name="ChevronRight" size={18} color={palette.muted} /> : <Icon name="BadgeCheck" size={20} color={palette.secondary} />}
        </Pressable>

        <Section title="Appearance">
          <Row
            icon="Palette" title="App theme"
            right={
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['system', 'light', 'dark'] as const).map((t) => (
                  <Chip key={t} label={t[0]!.toUpperCase() + t.slice(1)} active={s.appTheme === t} onPress={() => s.set({ appTheme: t })} />
                ))}
              </View>
            }
          />
        </Section>

        {/* Default reader theme picker (was: misrouted to paywall) */}
        <View style={{ backgroundColor: palette.surface, borderRadius: 14, borderWidth: 1, borderColor: palette.border, padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: palette.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="BookOpen" size={19} color={palette.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: palette.foreground, fontFamily: 'Inter' }}>Default reader theme</Text>
              <Text style={{ fontSize: 12, color: palette.muted, fontFamily: 'Inter', marginTop: 1 }}>Applies to newly opened books</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
            {(Object.keys(readerThemes) as ReaderThemeId[]).map((id) => {
              const t = readerThemes[id];
              const active = s.defaultTheme === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => s.set({ defaultTheme: id })}
                  accessibilityRole="radio"
                  accessibilityLabel={`${t.label} theme`}
                  accessibilityState={{ selected: active }}
                  style={{ alignItems: 'center', gap: 6, padding: 4 }}
                >
                  <View style={{
                    width: 52, height: 52, borderRadius: 26, backgroundColor: t.bg,
                    borderWidth: active ? 3 : 1, borderColor: active ? palette.primary : palette.border,
                    alignItems: 'center', justifyContent: 'center', gap: 3,
                  }}>
                    <View style={{ width: 22, height: 5, borderRadius: 3, backgroundColor: t.text }} />
                    <View style={{ width: 16, height: 5, borderRadius: 3, backgroundColor: t.accent }} />
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: active ? '700' : '500', color: active ? palette.foreground : palette.muted, fontFamily: 'Inter' }}>
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Section title="Reading defaults">
          <Row
            icon="Rows3" title="Page mode" desc={s.pageMode === 'paginated' ? 'Swipe pages' : 'Continuous scroll'}
            right={
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Chip label="Pages" active={s.pageMode === 'paginated'} onPress={() => s.set({ pageMode: 'paginated' })} />
                <Chip label="Scroll" active={s.pageMode === 'scroll'} onPress={() => s.set({ pageMode: 'scroll' })} />
              </View>
            }
          />
          <Row
            icon="Lightbulb" title="Keep screen on" desc="While reading"
            right={<Switch value={s.keepScreenOn} onValueChange={(v) => s.set({ keepScreenOn: v })} trackColor={{ true: palette.primary }} />}
          />
        </Section>

        {/* Phase 4 D1/D2 — Focus & comfort (free growth hooks, per newfeaturePlan.md) */}
        <Section title="Focus & comfort">
          <Row
            icon="Crosshair" title="Focus mode" desc={s.focusMode === 'off' ? 'Read normally' : `Dim all but current ${s.focusMode}`}
            right={
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['off', 'paragraph', 'sentence'] as const).map((m) => (
                  <Chip
                    key={m}
                    label={m === 'off' ? 'Off' : m === 'paragraph' ? 'Para' : 'Sent'}
                    active={s.focusMode === m}
                    onPress={() => s.set({ focusMode: m })}
                  />
                ))}
              </View>
            }
          />
          <Row
            icon="Bold" title="Syllable bolding" desc="Bionic-style reading aid"
            right={<Switch value={s.bionic} onValueChange={(v) => s.set({ bionic: v })} trackColor={{ true: palette.primary }} />}
          />
          <View style={{ padding: 14, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="Palette" size={16} color={palette.primary} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: palette.foreground, fontFamily: 'Inter' }}>
                Tint overlay {s.irlenTint !== 'none' ? `· ${irlenTints.find((t) => t.id === s.irlenTint)?.label}` : ''}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {irlenTints.map((t) => (
                <Chip key={t.id} label={t.label} active={s.irlenTint === t.id} onPress={() => s.set({ irlenTint: t.id })} />
              ))}
            </View>
            <Text style={{ fontSize: 12, color: palette.muted, fontFamily: 'Inter' }}>
              E-Ink pure B/W theme lives under “Default reader theme” above — it also disables animations.
            </Text>
          </View>
        </Section>

        {/* Phase 4 F3 — Manga / comics */}
        <Section title="Manga & comics">
          <Row
            icon="BookOpen" title="Spread mode" desc="Double-page on tablets"
            right={<Switch value={s.mangaSpread} onValueChange={(v) => s.set({ mangaSpread: v })} trackColor={{ true: palette.primary }} />}
          />
          <Row
            icon="ArrowLeftRight" title="Right-to-left paging" desc="Manga reading order"
            right={<Switch value={s.mangaRtl} onValueChange={(v) => s.set({ mangaRtl: v })} trackColor={{ true: palette.primary }} />}
          />
        </Section>

        {/* Phase 5 B1 — PDF defaults */}
        <Section title="PDF">
          <Row
            icon="Newspaper" title="Article view" desc="Reflow text instead of pages"
            right={<Switch value={s.pdfArticleMode} onValueChange={(v) => s.set({ pdfArticleMode: v })} trackColor={{ true: palette.primary }} />}
          />
          <Row
            icon="Crop" title="Margin crop" desc="Tightens text width in Article view"
            right={
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['none', 'narrow', 'wide'] as const).map((c) => (
                  <Chip key={c} label={c[0]!.toUpperCase() + c.slice(1)} active={s.pdfCrop === c} onPress={() => s.set({ pdfCrop: c })} />
                ))}
              </View>
            }
          />
        </Section>

        {/* Phase 7 E1 — Translate (BYOK: zero cost + privacy) */}
        <Section title="Translate">
          <Row
            icon="Languages" title="Provider" desc="Your own key, stored on-device"
            right={
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['deepl', 'google'] as const).map((p) => (
                  <Chip key={p} label={p === 'deepl' ? 'DeepL' : 'Google'} active={s.translateProvider === p} onPress={() => s.set({ translateProvider: p })} />
                ))}
              </View>
            }
          />
          <View style={{ padding: 14, gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: palette.foreground, fontFamily: 'Inter' }}>
              Translate to · {s.translateTarget.toUpperCase()}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {(['es', 'fr', 'de', 'pt', 'hi', 'zh', 'ar', 'en'] as const).map((l) => (
                <Chip key={l} label={l.toUpperCase()} active={s.translateTarget === l} onPress={() => s.set({ translateTarget: l })} />
              ))}
            </View>
            <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1, color: palette.muted, fontFamily: 'Inter' }}>
              {(s.translateProvider === 'deepl' ? 'DEEPL API KEY' : 'GOOGLE API KEY').toUpperCase()}
            </Text>
            <TextInput
              value={trKey}
              onChangeText={setTrKey}
              placeholder={s.translateProvider === 'deepl' ? 'DeepL key (free tier works)' : 'Google Cloud key'}
              placeholderTextColor={palette.faint}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Translation API key"
              style={{ backgroundColor: palette.surface2, borderRadius: 12, padding: 12, fontSize: 15, color: palette.foreground, fontFamily: 'Inter', borderWidth: 1, borderColor: palette.border }}
            />
            <Pressable
              onPress={() => { void saveTranslateKey(); }}
              accessibilityRole="button" accessibilityLabel="Save translation key"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: palette.surface2, borderRadius: 12, padding: 13, justifyContent: 'center', opacity: trSaving ? 0.6 : 1 }}
            >
              <Icon name={trKeySaved ? 'BadgeCheck' : 'KeyRound'} size={18} color={trKeySaved ? palette.secondary : palette.primary} />
              <Text style={{ color: palette.foreground, fontWeight: '700', fontFamily: 'Inter' }}>
                {trSaving ? 'Saving…' : trKeySaved ? 'Key saved on this device' : 'Save key'}
              </Text>
            </Pressable>
            <Text style={{ fontSize: 12, color: palette.muted, fontFamily: 'Inter' }}>
              Bilingual paragraphs live in the reader Display sheet. Translations are cached per book — repeat views cost nothing.
            </Text>
          </View>
        </Section>

        {/* Phase F4 — AI explain (BYOK OpenAI-compatible) */}
        <Section title="AI explain">
          <View style={{ padding: 14, gap: 8 }}>
            <Text style={{ fontSize: 13, color: palette.muted, fontFamily: 'Inter', lineHeight: 20 }}>
              Your key, your provider. Works with OpenAI or any OpenAI-compatible gateway. Answers are cached per passage.
            </Text>
            <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1, color: palette.muted, fontFamily: 'Inter' }}>
              BASE URL
            </Text>
            <TextInput
              value={aiBase}
              onChangeText={setAiBase}
              placeholder={AI_DEFAULT_BASE_URL}
              placeholderTextColor={palette.faint}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="AI base URL"
              style={{ backgroundColor: palette.surface2, borderRadius: 12, padding: 12, fontSize: 15, color: palette.foreground, fontFamily: 'Inter', borderWidth: 1, borderColor: palette.border }}
            />
            <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1, color: palette.muted, fontFamily: 'Inter' }}>
              MODEL
            </Text>
            <TextInput
              value={aiModel}
              onChangeText={setAiModel}
              placeholder={AI_DEFAULT_MODEL}
              placeholderTextColor={palette.faint}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="AI model"
              style={{ backgroundColor: palette.surface2, borderRadius: 12, padding: 12, fontSize: 15, color: palette.foreground, fontFamily: 'Inter', borderWidth: 1, borderColor: palette.border }}
            />
            <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1, color: palette.muted, fontFamily: 'Inter' }}>
              API KEY
            </Text>
            <TextInput
              value={aiKey}
              onChangeText={setAiKey}
              placeholder="sk-…"
              placeholderTextColor={palette.faint}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="AI API key"
              style={{ backgroundColor: palette.surface2, borderRadius: 12, padding: 12, fontSize: 15, color: palette.foreground, fontFamily: 'Inter', borderWidth: 1, borderColor: palette.border }}
            />
            <Pressable
              onPress={() => { void saveAiConfig(); }}
              accessibilityRole="button" accessibilityLabel="Save AI config"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: palette.surface2, borderRadius: 12, padding: 13, justifyContent: 'center', opacity: aiSaving ? 0.6 : 1 }}
            >
              <Icon name={aiSaved ? 'BadgeCheck' : 'Sparkles'} size={18} color={aiSaved ? palette.secondary : palette.primary} />
              <Text style={{ color: palette.foreground, fontWeight: '700', fontFamily: 'Inter' }}>
                {aiSaving ? 'Saving…' : aiSaved ? 'AI ready on this device' : 'Save'}
              </Text>
            </Pressable>
          </View>
        </Section>

        <Section title="Sync & data">
          {/* A2 — Sync health dashboard: per-device last-sync, errors, queue */}
          {health ? (
            <View style={{ padding: 14, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="Activity" size={16} color={palette.primary} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: palette.foreground, fontFamily: 'Inter' }}>
                  Sync health
                </Text>
                <View style={{
                  marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
                  backgroundColor: (health.drive.lastError || health.webdav.lastError) ? palette.destructive : palette.secondary,
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFF', fontFamily: 'Inter' }}>
                    {(health.drive.lastError || health.webdav.lastError) ? 'ATTENTION' : health.pendingOps > 0 ? `${health.pendingOps} QUEUED` : 'HEALTHY'}
                  </Text>
                </View>
              </View>
              {([
                { label: 'Google Drive', h: health.drive, connected: driveConnected },
                { label: 'WebDAV', h: health.webdav, connected: webdavConfigured },
              ] as const).map((row) => (
                <View key={row.label} style={{ gap: 2 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: palette.muted, fontFamily: 'Inter' }}>
                    {row.label.toUpperCase()} · {row.connected ? 'CONNECTED' : 'NOT SET UP'}
                  </Text>
                  <Text style={{ fontSize: 12, color: palette.foreground, fontFamily: 'Inter' }}>
                    {row.h.lastSyncAt ? `Last sync ${new Date(row.h.lastSyncAt).toLocaleString()} · ${row.h.lastMerged} pulled` : 'Never synced on this device'}
                  </Text>
                  {row.h.lastConflicts > 0 ? (
                    <Text style={{ fontSize: 12, color: palette.muted, fontFamily: 'Inter' }}>
                      {row.h.lastConflicts} conflict{row.h.lastConflicts === 1 ? '' : 's'} auto-resolved (newest kept)
                    </Text>
                  ) : null}
                  {row.h.lastError ? (
                    <Text style={{ fontSize: 12, color: palette.destructive, fontFamily: 'Inter' }}>
                      Last error: {row.h.lastError}
                    </Text>
                  ) : null}
                </View>
              ))}
              {health.pendingOps > 0 ? (
                <Text style={{ fontSize: 12, color: palette.muted, fontFamily: 'Inter' }}>
                  {health.pendingOps} change{health.pendingOps === 1 ? '' : 's'} waiting in the offline queue — they upload on the next successful sync.
                </Text>
              ) : null}
            </View>
          ) : null}
          <Row
            icon="CloudDownload" title="Google Drive sync"
            desc={!isPremium ? 'Premium feature' : !oauthConfigured ? 'Needs OAuth client IDs (README)' : driveConnected ? 'Back up & sync now' : 'Sign in with Google'}
            onPress={syncNow}
            right={syncing ? <Icon name="LoaderCircle" size={18} color={palette.primary} /> : undefined}
          />
          {driveConnected ? (
            <Row icon="CloudOff" title="Disconnect Drive" desc="Remove saved sign-in" onPress={disconnectDrive} />
          ) : null}
          {/* A1 — Bring your own storage: WebDAV (Nextcloud etc.) */}
          <Row
            icon="Server" title="WebDAV sync"
            desc={!isPremium ? 'Premium feature' : webdavConfigured ? 'Back up & sync now' : 'Nextcloud, ownCloud, any WebDAV'}
            onPress={runWebdavSync}
            right={syncing ? <Icon name="LoaderCircle" size={18} color={palette.primary} /> : undefined}
          />
          <Row icon="ServerCog" title="WebDAV settings" desc={webdavConfigured ? 'Server, login, folder' : 'Set up your own storage'} onPress={() => setWebdavOpen(true)} />
          {webdavConfigured ? (
            <Row icon="CloudOff" title="Remove WebDAV" desc="Delete saved sign-in" onPress={disconnectWebdav} />
          ) : null}
          <Row icon="BookA" title="Dictionary" desc="Look up words, see history" onPress={() => router.push('/dictionary')} />
          <Row
            icon="Trash" title="Reset library" desc="Clears books, notes and stats on this device" danger
            onPress={() => Alert.alert('Reset everything?', 'This clears your library database on this device. Imported files stay in app storage.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Reset', style: 'destructive', onPress: () => { void resetDb().then(() => refresh(s.sortKey)); } },
            ])}
          />
        </Section>

        <Section title="About">
          <Row icon="Info" title="About ReadNest" desc="Version 1.0.0 · com.abhirahtech.readnest" onPress={() => Alert.alert('ReadNest 1.0.0', 'A cozy home for your ebooks.\nEPUB · PDF · MOBI · AZW3 · CBZ · FB2 · TXT · DOCX · ODT\n\nMade by abhirahtech.')} />
          <Row icon="ShieldCheck" title="Privacy" desc="Local-first · No account · No tracking SDKs" onPress={() => Alert.alert('Privacy', 'ReadNest stores your library on-device. Optional Google Drive sync only runs when you enable Premium sync. Ads (free tier) use non-personalized requests. See privacy-policy.md in the repo for the full text.')} />
        </Section>
      </ScrollView>

      {/* A1 — WebDAV setup sheet */}
      <Sheet visible={webdavOpen} onClose={() => setWebdavOpen(false)} title="WebDAV sync">
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 13, color: palette.muted, fontFamily: 'Inter', lineHeight: 20 }}>
            Bring your own storage: Nextcloud, ownCloud or any WebDAV server. Use an app password. Sign-in is stored
            securely on this device; only Basic auth is supported.
          </Text>
          {([
            { label: 'Server URL', value: wdUrl, set: setWdUrl, hint: 'https://cloud.example.com/remote.php/dav/files/user', secret: false, auto: 'url' as const },
            { label: 'Username', value: wdUser, set: setWdUser, hint: 'you@example.com', secret: false, auto: 'username' as const },
            { label: 'App password', value: wdPass, set: setWdPass, hint: '••••••••', secret: true, auto: 'password' as const },
            { label: 'Folder', value: wdPath, set: setWdPath, hint: 'ReadNest', secret: false, auto: 'username' as const },
          ]).map((f) => (
            <View key={f.label} style={{ gap: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1, color: palette.muted, fontFamily: 'Inter' }}>
                {f.label.toUpperCase()}
              </Text>
              <TextInput
                value={f.value}
                onChangeText={f.set}
                placeholder={f.hint}
                placeholderTextColor={palette.faint}
                secureTextEntry={f.secret}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={f.label}
                style={{ backgroundColor: palette.surface2, borderRadius: 12, padding: 12, fontSize: 15, color: palette.foreground, fontFamily: 'Inter', borderWidth: 1, borderColor: palette.border }}
              />
            </View>
          ))}
          <Pressable
            onPress={() => { void saveWebdav(); }}
            accessibilityRole="button" accessibilityLabel="Test and save WebDAV connection"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: palette.primary, borderRadius: 12, padding: 14, justifyContent: 'center', marginTop: 4, opacity: wdTesting ? 0.6 : 1 }}
          >
            {wdTesting ? <Icon name="LoaderCircle" size={18} color={palette.onPrimary} /> : <Icon name="PlugZap" size={18} color={palette.onPrimary} />}
            <Text style={{ color: palette.onPrimary, fontWeight: '700', fontFamily: 'Inter' }}>
              {wdTesting ? 'Testing…' : 'Test & save'}
            </Text>
          </Pressable>
        </View>
      </Sheet>
    </View>
  );
}
