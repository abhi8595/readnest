# ReadNest Privacy Policy (draft for Play Console + in-app link)

**Last updated:** 2026-09-16 · **Package:** com.abhirahtech.readnest

## Local-first

ReadNest works without an account. Your library database, reading progress,
bookmarks, highlights, notes and dictionary history are stored **on your device**
(SQLite + app storage). We do not operate servers that receive your books.

## Files you open

- Imported/scanned files are read locally to render books and extract metadata
  (title, author, cover). Nothing is uploaded unless you use Premium Drive sync.
- Folder access uses Android's Storage Access Framework: you explicitly grant
  folders, and grants can be revoked anytime in system Settings.

## Optional Google Drive sync (Premium)

If you enable sync, ReadNest uploads an encrypted-in-transit JSON snapshot
(library registry, progress, bookmarks, quotes, settings — **not book files**)
to your own Google Drive `appDataFolder` using the least-privilege
`drive.appdata` scope. You can delete it from Drive → Settings → Manage apps.

## Ads (free tier)

The free version shows AdMob banner and interstitial ads using
non-personalized requests (`requestNonPersonalizedAdsOnly`). AdMob may process
device identifiers per Google's policy: https://policies.google.com/privacy.
Premium removes ads entirely.

## Purchases

Handled by Google Play Billing via RevenueCat. We receive only entitlement
status (premium yes/no), never card details.

## Dictionary

Online word lookup queries api.dictionaryapi.dev with the single word only.
No account, no history leaves the device (history stays local).

## Permissions rationale

| Permission | Why |
|---|---|
| Storage (SAF grants) | scan/import your books |
| Foreground service (media playback) | Premium background read-aloud |
| Notifications | playback controls + sleep timer |
| Wake lock | optional keep-screen-on while reading |

## Contact / deletion

Support: support@abhirahtech.example · To delete all data: Settings → Reset
library, then uninstall. Drive snapshot: remove via Drive Manage apps.
