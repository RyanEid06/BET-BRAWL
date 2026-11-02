# Android V2 release record — 2.0.0 / code3

Android source lives on main; v2-web is the independently deployed Cloudflare web version; v1 is historical Android V1. The production APK uses the permanent release certificate pinned in app/release-signing.sha256. Package com.betbrawl.app; minimumAPI24; target/compileAPI35; protocol2.

## Changes

- Same V2 UI fixes as web: immediate reconciled Circuit rotations, Treasure sliders/presets with unchanged10-energy scoring, compact payout/details and reachable host action, Mirror4-second puzzle plus1-second authoritative reveal, scoped stale-error filtering, Memory reconnect draft/undo reset, independent deadline clock and identity/weighted-score Territory board.
- Native Back/predictive Back hides IME first, then delegates to a confirmation dialog; cancellation preserves the room/tournament, explicit host exit closes hosting, and entry Back minimizes rather than finishing the Activity. Explicit exit clears stale room discovery metadata so the entry screen does not reopen the closed room's join form.
- Lifecycle resume checks a healthy socket before replacing silent connections. A validated prior LAN endpoint can restore the seat after Activity recreation; explicit deep-link targets take precedence. Warm join callback is connected to the existing join handler.
- Connected-device foreground hosting starts before the optional notification prompt; denial does not block hosting. Notification can return to the app or Stop hosting. Fullscreen is restored after focus/resume. Existing native LAN discovery, QR validation and private-network routing remain intact.
- Permanent release signing established and pinned; release assembly fails without it, versionCode advanced from reserved candidate2 to3, and CI verifies the actual signed APK before upload.

## Verification / delivery

Runtime source: `c8a8ab0b845378e08536c4abaa78ea2b8b3b1531` on `main`. [GitHub Actions run 41409082650](https://github.com/RyanEid06/BET-BRAWL/actions/runs/41409082650) passed both build/verification and native acceptance jobs. Later documentation-only commits retain this APK source identity.

- Shared typecheck and 106 tests passed; bundled UI build and Android asset sync passed.
- Kotlin/server/parity suite: 77 tests passed, 0 failed or ignored.
- Debug and release Android Lint: each 0 errors, 14 nonblocking warnings. Debug and permanently signed release assembly passed.
- Browser verification: 32 cases, 0 layout issues or console errors; all 11 regression groups passed, including native-discovery cleanup after explicit leave.
- CI API36 (Android16): debug and signed release each passed 3 cold launches. Full native smoke passed, including notification denial, three-player same-seat reconnect, Back cancellation, background/foreground host continuity, production-timed payout, next round and owned-room cleanup.
- Local API37: the exact downloaded signed APK passed 3 cold launches and the full native smoke, including closing its room through the host UI and removing its test forward. Evidence: `artifacts/v2/android-final-c8a8ab0/api37-startup/` and `api37-native/summary.json`.

Deliverable: `artifacts/releases/BET-BRAWL-V2-2.0.0-code3.apk`, **5,206,966 bytes**. It is a non-debuggable production APK signed by the permanent RSA4096 identity; APK Signature Scheme v2 verifies. Minimum Android7.0/API24; target and compile Android15/API35.

APK SHA256: `dc7778c4746acfba706d872a6a55a5a49dc051ecb465475cc58a64436d3681df`.

Certificate SHA256: `222a2459a560c966ab30ebc7a03d60008a5614692e84e726b7f1568f60caef51`.

Independent local verification matched the downloaded APK hash to CI, the release certificate to the committed pin, and every bundled debug/release asset. CI JavaScript/CSS are byte-identical to the verified local build; HTML matches except blank lines. Evidence is retained in `artifacts/v2/android-final-c8a8ab0/verification.json`, the downloaded `reports/`, and `native-ci/`. CI artifacts are named `android-v2-release`, `android-debug-apk`, `android-verification-reports`, and `android-native-acceptance` on the linked immutable run. The release APK and its SHA256/verification manifest are copied to `artifacts/releases/`; build artifacts remain ignored by Git.

Browser reproduction: start `npm exec vite -- --host 127.0.0.1 --port 5175 --strictPort`, then npm run test:browser. If using an external Playwright runtime set BRAWL_PLAYWRIGHT_MODULE to its absolute package.json; BRAWL_CHROME_EXECUTABLE selects existing Chrome. CI installs pinned Playwright1.62.1 in isolated tooling and never ships it in the APK.

Native smoke rejects physical serials, uses UI-tree-derived taps, verifies keyboard/Back/hosting with denied notifications/background/same-seat reconnect and real-timing payout/next-round through two synthetic WebSocket guests. It closes only its own room and removes only its adb forward. Both debug and permanently signed release receive repeated cold launches.

## Physical-phone acceptance

Emulator/browser evidence does not prove real-router NSD/UDP discovery, OEM battery restrictions/long screen-off hosting, QR scanning between actual phones, gesture navigation on vendor skins, audio behavior or mixed phone/tablet multiplayer. Test3+physical phones on the same Wi-Fi and keep the host out of aggressive battery optimization during initial acceptance. No physical phone is installed, wiped or reconfigured by this task.
