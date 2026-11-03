# BET & BRAWL V2.1 release — 2026-11-03

## Sources and compatibility

- Android source: `a8006311f0d6076d3ae748e71c3a098c71e8e23c` on `main` (gameplay runtime `b8cf80a`). [Android CI 41505649490](https://github.com/RyanEid06/BET-BRAWL/actions/runs/41505649490): both `verify-and-build` and `startup-and-native-smoke` succeeded.
- Web source: `69302dae9f822ad3173839ce832d3c28dad487ed` on `v2-web`. [Cloudflare CI 41506284835](https://github.com/RyanEid06/BET-BRAWL/actions/runs/41506284835) succeeded.
- Android `versionName`: **2.1.0**; `versionCode`: **3 → 4**; package: **com.betbrawl.app**. Same permanent release identity as V2. No uninstall, package change, or stored-data schema migration.
- Protocol remains 2; existing SQLite `BRAWL_ROOMS` / `BrawlRoom` and `activeRoom` storage remain compatible. Persisted Millisecond rounds without a target retain their original five-second scoring.

## Focused changes

- Quick Draw: accessible whole-arena one-shot input, explicit WAIT/DRAW signals, reaction times and false-start explanations.
- Millisecond Stop: random 3/5/7/9-second targets with the requested hide times; target, actual stops, errors and winning reason shown.
- Rapid Red/Green: independently varied sudden, short and long intervals; existing scoring and win rules retained.
- Blind Pinpoint: full-world map, bounded pan/zoom, phone pinch, editable draft before explicit Lock, distance errors and winning reason.
- Short fighter-only instructions for all 14 games during announcement/betting; spectator betting retained.

## Observed verification

- Android: 115 shared tests and typecheck; bundled UI build/sync; 80 Kotlin/server/parity tests with zero failures or ignored tests; debug and signed release builds. Each Android lint variant: 0 errors, 14 existing warnings.
- Web: 107 shared tests, 20 Worker core tests, both typechecks, production build and Wrangler dry run. Real workerd tests covered SQLite restart/recovery, private betting, deadlines, isolation, tournament completion, reconnect/retry and authenticated close.
- Chromium: 32 cases, existing regression groups (11 Android / 8 web), focused gameplay checks at 360×640, 390×844, 768×1024 and 1366×768, and eight Pinpoint gesture/coordinate groups. No recorded page errors.
- CI Android 16/API36: three cold launches each for debug and release, plus native multiplayer/lifecycle smoke. Local API37: three signed-release cold launches and full native smoke, including denied notifications, reconnect, Back cancellation, background hosting, real-timed payout/next round, and owned-room cleanup.
- Exact signed V2 code3 → V2.1 code4 `adb install -r` on owned `emulator-5580`: PASS. UID 10234 and firstInstallTime `2026-11-01 20:09:47` retained. All 11 captured WebView Local Storage / SharedPreferences files were byte-identical before first candidate launch. Seeded name and avatar remained visible in V2.1.

Local evidence: `artifacts/v2.1-a800631/verification.json`, downloaded CI reports, `artifacts/v2.1-upgrade/summary.json`, `artifacts/v2.1-api37-native/summary.json`, `artifacts/v2.1-{cf-verify,web-browser}.log` and `output/playwright/`.

## Signed APK

`artifacts/releases/BET-BRAWL-V2.1-2.1.0-code4.apk` — **5,217,886 bytes**, non-debuggable production release. Downloaded from the successful exact-source CI run; debug/release bundled assets match.

- APK SHA256: `b3d1aff47ba4851e06606de6e0ec98c804309e8a786f044dccb34a995029c7a9`
- Certificate SHA256: `222a2459a560c966ab30ebc7a03d60008a5614692e84e726b7f1568f60caef51`

## Production

Deployed existing Worker `bet-brawl` at https://bet-brawl.northstack-labs.workers.dev after both exact-source CI runs and upgrade/native gates passed. Active version `a6fb8388-b34d-4c3c-aa3f-acbeb0b8e913`, 100% traffic, deployment `1364cf49-ead9-4501-80c3-bc0b534e637f`, activated 2026-11-03 06:30:28 UTC. Used installed Wrangler 4.151.1 with `deploy --strict --keep-vars`; no namespace/schema migration or variables/secrets replacement. Previous V2 version: `d349b03e-b847-4f13-a6b9-445c0c639230`.

Public API reports 2.1.0/protocol2/online. Live HTML, JavaScript and CSS match the verified local build byte-for-byte (`artifacts/v2.1-public-assets.json`). Public three-client Chromium smoke PASS: desktop plus two mobile viewports, one synthetic room, same fighter seat reconnect, two production-timed rounds (Crowd Count and Circuit Sprint), consistent payouts, next-round advancement, two accepted actions/zero rejections, no page errors, and owned-room close requested. Evidence: `output/playwright/production-smoke.json` and `artifacts/v2.1-production-smoke.log`.

## Physical-device limits

No physical device was changed. Real-router discovery, phone-to-phone QR scanning, OEM battery restrictions, long screen-off hosting, vendor gesture navigation/audio and mixed physical phone/tablet acceptance still require real-device testing. Emulator/browser results do not establish those outcomes.
