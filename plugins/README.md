# Native plugins

## withBackgroundTts.js

Manifest wiring for Premium background read-aloud. The real playback code
lives in the local Expo module `modules/readnest-tts`:

- Android: `ReadNestTtsService` (foreground service, `mediaPlayback` type)
  driving platform `TextToSpeech` sentence-by-sentence, with a playback
  notification (back / play-pause / next / stop). Declared in the module's
  own `AndroidManifest.xml` (manifest merging) — the plugin defensively
  enforces the same entry + permissions.
- iOS: `AVSpeechSynthesizer` with a `.playback` audio session (continues
  with the screen locked; `UIBackgroundModes: audio` is in `app.json`) plus
  lock-screen / remote-command controls.

The plugin itself is idempotent: it ensures the service entry exists with
the right attributes and adds `FOREGROUND_SERVICE`,
`FOREGROUND_SERVICE_MEDIA_PLAYBACK`, and `POST_NOTIFICATIONS`.

In Expo Go / web the native module is absent: `readnest-tts` resolves to
null, `isBackgroundTtsSupported()` returns false, and the app shows an
honest "dev build required" message instead of failing.
