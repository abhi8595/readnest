/**
 * ReadNest Expo config — dynamic so secrets/IDs come from the environment.
 * Copy .env.example → .env and fill in keys; everything degrades gracefully
 * when a key is missing (see src/lib/config.ts). Never commit .env.
 *
 * Verified with:  npx expo config --json
 */
const {
  EXPO_PUBLIC_EAS_PROJECT_ID = '00000000-0000-0000-0000-000000000000',
  EXPO_PUBLIC_GOOGLE_IOS_ID = '',
  EXPO_PUBLIC_GOOGLE_ANDROID_ID = '',
  EXPO_PUBLIC_GOOGLE_WEB_ID = '',
  EXPO_PUBLIC_ADMOB_ANDROID_APP_ID = 'ca-app-pub-xxxxxxxxxxxxxxxx~yyyyyyyyyy',
  EXPO_PUBLIC_ADMOB_IOS_APP_ID = 'ca-app-pub-xxxxxxxxxxxxxxxx~yyyyyyyyyy',
  EXPO_PUBLIC_RC_IOS = '',
  EXPO_PUBLIC_RC_ANDROID = '',
} = process.env;

module.exports = {
  expo: {
    name: 'ReadNest: EPUB PDF Reader',
    slug: 'readnest',
    version: '1.0.0',
    orientation: 'default',
    icon: './assets/icon.png',
    scheme: 'readnest',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#FBF7F0',
      dark: {
        image: './assets/splash-dark.png',
        backgroundColor: '#1C1A17',
      },
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.abhirahtech.readnest',
      infoPlist: {
        UIBackgroundModes: ['audio', 'fetch'],
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: 'com.abhirahtech.readnest',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#C05135',
      },
      permissions: [
        'FOREGROUND_SERVICE',
        'FOREGROUND_SERVICE_MEDIA_PLAYBACK',
        'POST_NOTIFICATIONS',
        'WAKE_LOCK',
      ],
      intentFilters: [
        {
          action: 'VIEW',
          data: [
            { mimeType: 'application/epub+zip' },
            { mimeType: 'application/pdf' },
            { mimeType: 'text/plain' },
            { mimeType: 'application/x-fictionbook+xml' },
            { mimeType: 'application/x-mobipocket-ebook' },
            { mimeType: 'application/vnd.comicbook+zip' },
            {
              mimeType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-font',
      'expo-secure-store',
      ['expo-screen-orientation', { initialOrientation: 'DEFAULT' }],
      ['expo-document-picker', { iCloudContainerEnvironment: 'Production' }],
      [
        'react-native-google-mobile-ads',
        {
          androidAppId: EXPO_PUBLIC_ADMOB_ANDROID_APP_ID,
          iosAppId: EXPO_PUBLIC_ADMOB_IOS_APP_ID,
        },
      ],
      './plugins/withBackgroundTts.js',
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: EXPO_PUBLIC_EAS_PROJECT_ID,
      },
      googleAuth: {
        iosClientId: EXPO_PUBLIC_GOOGLE_IOS_ID,
        androidClientId: EXPO_PUBLIC_GOOGLE_ANDROID_ID,
        webClientId: EXPO_PUBLIC_GOOGLE_WEB_ID,
      },
      revenueCat: {
        ios: EXPO_PUBLIC_RC_IOS,
        android: EXPO_PUBLIC_RC_ANDROID,
      },
    },
  },
};
