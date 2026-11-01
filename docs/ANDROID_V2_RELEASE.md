# Android V2 release record — 2.0.0 / code3

Android source lives on main; v2-web is the independently deployed Cloudflare web version; v1 is historical Android V1. The production APK uses the permanent release certificate pinned in app/release-signing.sha256. Package com.betbrawl.app; minimumAPI24; target/compileAPI35; protocol2.

## Changes

- Same V2 UI fixes as web: immediate reconciled Circuit rotations, Treasure sliders/presets with unchanged10-energy scoring, compact payout/details and reachable host action, Mirror4-second puzzle plus1-second authoritative reveal, scoped stale-error filtering, Memory reconnect draft/undo reset, independent deadline clock and identity/weighted-score Territory board.
- Native Back/predictive Back hides IME first, then delegates to a confirmation dialog; cancellation preserves the room/tournament, explicit host exit closes hosting, and entry Back minimizes rather than finishing the Activity.
- Lifecycle resume checks a healthy socket before replacing silent connections. A validated prior LAN endpoint can restore the seat after Activity recreation; explicit deep-link targets take precedence. Warm join callback is connected to the existing join handler.
- Connected-device foreground hosting starts before the optional notification prompt; denial does not block hosting. Notification can return to the app or Stop hosting. Fullscreen is restored after focus/resume. Existing native LAN discovery, QR validation and private-network routing remain intact.
- Permanent release signing established and pinned; release assembly fails without it, versionCode advanced from reserved candidate2 to3, and CI verifies the actual signed APK before upload.

## Verification / delivery

Implementation and verification are ongoing. Final exact-source CI, Kotlin/server parity counts, lint results, emulator evidence, APK filename/size/hash and certificate verification will be recorded here after observed success. Current local browser matrix32cases and10focused regression groups pass, including Back and socket resume. Shared/native full tests follow the updated Mirror projection fixtures.

Browser reproduction: start `npm exec vite -- --host 127.0.0.1 --port 5175 --strictPort`, then npm run test:browser. If using an external Playwright runtime set BRAWL_PLAYWRIGHT_MODULE to its absolute package.json; BRAWL_CHROME_EXECUTABLE selects existing Chrome. CI installs pinned Playwright1.62.1 in isolated tooling and never ships it in the APK.

Native smoke rejects physical serials, uses UI-tree-derived taps, verifies keyboard/Back/hosting with denied notifications/background/same-seat reconnect and real-timing payout/next-round through two synthetic WebSocket guests. It closes only its own room and removes only its adb forward. Both debug and permanently signed release receive repeated cold launches.

## Physical-phone acceptance

Emulator/browser evidence does not prove real-router NSD/UDP discovery, OEM battery restrictions/long screen-off hosting, QR scanning between actual phones, gesture navigation on vendor skins, audio behavior or mixed phone/tablet multiplayer. Test3+physical phones on the same Wi-Fi and keep the host out of aggressive battery optimization during initial acceptance. No physical phone is installed, wiped or reconfigured by this task.
