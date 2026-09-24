/** Expo module stubs for the screenshot harness (jsdom, no native side). */
const secureMap = new Map();

const constants = {
  expoConfig: { name: 'ReadNest', version: '1.0.0' },
  appOwnership: 'standalone',
  deviceName: 'ShotDevice',
};

const expoStubs = {
  'expo-font': {
    loadAsync: async () => undefined,
    isLoaded: () => true,
    isLoading: () => false,
  },
  'expo-splash-screen': {
    preventAutoHideAsync: async () => undefined,
    hideAsync: async () => undefined,
  },
  'expo-haptics': {
    impactAsync: async () => undefined,
    ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  },
  'expo-clipboard': {
    setStringAsync: async () => undefined,
    getStringAsync: async () => '',
  },
  'expo-brightness': {
    getBrightnessAsync: async () => 1,
    setBrightnessAsync: async () => undefined,
    getSystemBrightnessAsync: async () => 1,
  },
  'expo-screen-orientation': {
    lockAsync: async () => undefined,
    unlockAsync: async () => undefined,
    getOrientationAsync: async () => 1,
    OrientationLock: { PORTRAIT_UP: 1, LANDSCAPE: 2, PORTRAIT: 3, DEFAULT: 0 },
    Orientation: { PORTRAIT_UP: 1, UNKNOWN: 0 },
  },
  'expo-keep-awake': {
    activateKeepAwakeAsync: async () => undefined,
    deactivateKeepAwake: () => undefined,
  },
  'expo-document-picker': {
    getDocumentAsync: async () => ({ canceled: true, assets: [] }),
  },
  'expo-secure-store': {
    getItemAsync: async (k) => (secureMap.has(k) ? secureMap.get(k) : null),
    setItemAsync: async (k, v) => { secureMap.set(k, String(v)); },
    deleteItemAsync: async (k) => { secureMap.delete(k); },
  },
  'expo-web-browser': {
    openBrowserAsync: async () => ({ type: 'dismiss' }),
    dismissBrowser: async () => undefined,
    maybeCompleteAuthSession: () => undefined,
  },
  'expo-auth-session': {
    makeRedirectUri: () => 'readnest://',
    ResponseType: { Token: 'token', Code: 'code' },
  },
  'expo-auth-session/providers/google': {
    useAuthRequest: () => [{}, null, async () => ({ type: 'dismiss' })],
  },
  'expo-speech': {
    speak: (text, opts) => {
      (global.__speechCalls ??= []).push({ text, opts });
    },
    stop: async () => undefined,
    isSpeakingAsync: async () => false,
    getAvailableVoicesAsync: async () => [],
  },
  'expo-crypto': {
    randomUUID: () => `shot-${Math.random().toString(36).slice(2, 10)}`,
    digestStringAsync: async () => '0'.repeat(64),
    CryptoDigestAlgorithm: { SHA256: 'sha256', SHA1: 'sha1', MD5: 'md5' },
    CryptoEncoding: { HEX: 'hex', BASE64: 'base64' },
  },
  'expo-constants': { __esModule: true, default: constants, ...constants },
  'expo-status-bar': { StatusBar: () => null },
  'expo-asset': {
    Asset: {
      fromModule: () => { throw new Error('shots: no bundled assets'); },
      fromURI: () => { throw new Error('shots: no bundled assets'); },
    },
  },
  'expo-sharing': {
    shareAsync: async () => undefined,
    isAvailableAsync: async () => false,
  },
  'expo-sqlite': {},
  'expo-modules-core': {
    requireNativeModule: () => { throw new Error('shots: no native modules'); },
    EventEmitter: class {
      addListener() { return { remove: () => undefined }; }
      removeListener() { /* noop */ }
      removeAllListeners() { /* noop */ }
    },
    NativeModule: class {},
  },
  expo: {},
};

module.exports = expoStubs;
