/**
 * Expo config plugin: background TTS (Premium) — Android manifest wiring
 * for the real native module in modules/readnest-tts.
 *
 * The module's own AndroidManifest.xml declares ReadNestTtsService and
 * manifest-merging normally picks it up; this plugin defensively ensures:
 *  1. the foreground service entry exists with mediaPlayback type,
 *  2. FOREGROUND_SERVICE* + POST_NOTIFICATIONS permissions are present.
 *
 * iOS: no manifest work needed — UIBackgroundModes audio is in app.config.js and
 * the Swift module configures an AVAudioSession .playback category.
 *
 * NOTE: permissions live in app.config.js `android.permissions`
 * (@expo/config-plugins has no withPermissions API) — this plugin only
 * ensures the service entry exists.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

const SERVICE = 'com.abhirahtech.readnest.tts.ReadNestTtsService';

function withTtsService(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const app = manifest.application?.[0];
    if (!app) return cfg;

    app.service = app.service ?? [];
    let svc = app.service.find((s) => s.$?.['android:name'] === SERVICE);
    if (!svc) {
      svc = { $: {} };
      app.service.push(svc);
    }
    svc.$['android:name'] = SERVICE;
    svc.$['android:foregroundServiceType'] = 'mediaPlayback';
    svc.$['android:exported'] = 'false';
    return cfg;
  });
}

module.exports = function withBackgroundTts(config) {
  return withTtsService(config);
};
