# BET & BRAWL V2 — Android

Production Android version **2.0.0**, versionCode **3**, protocol **2**. A native Kotlin foreground service hosts authoritative games on the same Wi-Fi/LAN; the bundled React UI works offline. Fourteen games share the existing tournament, betting, championship and bankroll rules. Minimum Android **7.0 / API24**, target/compile **API35**.

Final branches: **main** is Android V2, **v2-web** is the production online web version, and **v1** preserves the former V1 Android main exactly. Historical V1 web source and frozen reference remain tagged. The online web version is live at [bet-brawl.northstack-labs.workers.dev](https://bet-brawl.northstack-labs.workers.dev); its Worker/deployment configuration belongs to v2-web.

## Play on Android

Install the permanently signed release APK, connect players to the same Wi-Fi, and choose Host New Game. Guests discover the room or open the host's QR/brawl:// join link. At least three players must join and mark ready. Hosting continues in a foreground service while the Activity is backgrounded; notification permission is optional. Back first hides the keyboard, then offers Keep playing or an explicit room exit. Leaving as host closes the room for everyone.

V2 includes Memory Heist, Crowd Count, Mirror Trouble, Safecracker, Circuit Sprint, Split Decision, Treasure Tug and Pocket Territory alongside the six original games. Circuit rotates immediately and reconciles with server authority; Treasure has sliders/presets; results default to a compact summary with View details; Mirror gives a one-second reveal after each puzzle; reconnect restores authoritative drafts and scoped feedback; timer rendering is isolated; Territory uses identities and weighted scores.

## Verify and build

Use Node22+, JDK17 and the existing Android SDK with platform35. No Node server, cloud backend or PWA is required by the APK.

```powershell
npm ci
npm run lint
npm run verify
.\gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:lintRelease :app:assembleDebug --no-daemon
```

CI runs the shared/browser/native/parity/lint/debug/signed-release gates, verifies the pinned production signing certificate, and tests both debug and signed-release cold launches plus native multiplayer/lifecycle on an Android16 emulator. `npm run test:browser` uses a local Vite server and existing Playwright/Chrome, as documented in [release verification](docs/ANDROID_V2_RELEASE.md).

Release builds require the permanent signing configuration and fail if it is missing. Use the configured GitHub Actions workflow or [local signing procedure](docs/ANDROID_SIGNING.md). Never distribute an unsigned or debug APK as the production release.

## Release and history

[Android V2 release record](docs/ANDROID_V2_RELEASE.md), [signing policy](docs/ANDROID_SIGNING.md) and [worklog](CODEX_WORKLOG.md) contain observed results, artifact hashes and physical-phone acceptance limits. `v1` is fixed at2ee6d66f4ecd49a66bf31530413919d550055f11; V1 online source is tagged v1.0.0-production-web at a60a79d, and v1.0.0-web-final preserves e1f948c. Do not rewrite these histories.

Natural Earth map geometry used by Blind Pinpoint is public domain.
