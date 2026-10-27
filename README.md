# BET & BRAWL — Android/LAN V2 candidate

V2 adds eight games to V1's six: **Memory Heist, Crowd Count, Mirror Trouble, Safecracker, Circuit Sprint, Split Decision, Treasure Tug, and Pocket Territory**. Phone touch and PC mouse/keyboard clients share the same tournament, bets and championship rules. Private drafts/guesses/choices remain on the host until their permitted reveal; all 14 games rotate through a shuffled bag.

This branch is the reviewable `codex/v2-games-android` candidate, version **2.0.0 / code 2**, protocol **2**. Use the same V2 version on all clients; older clients/hosts receive an update message. No merge or public release has occurred. See the [approved plan](docs/superpowers/plans/2026-10-26-v2-games.md), [candidate evidence](docs/V2_CANDIDATE.md), and [worklog](CODEX_WORKLOG.md).

A local party game for 3–9 players. The host Android phone runs the authoritative Kotlin `BrawlWebSocketServer` inside `HostService`. The React/Vite interface is bundled in the APK and displayed in a WebView. Guests use the same Wi-Fi/LAN; gameplay needs no internet, laptop, Node server, Render, or Cloudflare.

## Maintained targets

- `codex/v2-games-android`: Android/LAN V2 candidate, application ID `com.betbrawl.app`, version `2.0.0` / code `2`.
- `codex/v2-games-web`: separate online V2 candidate; exact-source Cloudflare CI passes at `d20ccc4`.
- `main`: Android local/LAN V1, application ID `com.betbrawl.app`, version `1.0.0` / code `1`.
- `v1-web-cloudflare-ready`: online web V1, Cloudflare Worker and one SQLite Durable Object per room. Internet required.
- `v1-web-final`: preserved Node/LAN behavioral reference at `e1f948c`, tagged `v1.0.0-web-final`. Do not modify or delete without separate owner approval.

## Build and verify

Use Node 22+, JDK 17, and the project's existing Android SDK 35/Gradle setup. Do not install extra Android tooling merely to run this release task.

```powershell
npm ci
npm run typecheck
npm test
npm run build:android
.\gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleRelease --no-daemon
```

`build:android` builds `dist/` then synchronizes it into `app/src/main/assets/web/`. Both directories are generated and ignored; never manually edit bundled JavaScript. Build/sync before opening or assembling Android. APKs are generated under `app/build/outputs/apk/`, not committed as source.

The optional standalone JVM suite compiles the same Kotlin server/tests without the Android Gradle plugin: `gradle -p scripts/kotlin-tests test` (JDK 17 and an existing platform `android.jar` are required only as API stubs). It does not launch Android or test service lifecycle on a device.

`server.ts` is retained as a tested Node protocol reference/development server. It is not used by the APK. `npm start` is for that reference only.

## Game rules

Every frozen roster member plays two qualifiers against distinct opponents. Wins award 3 points, ties 1, losses 0. Ranking uses points, qualifier wins, applicable two-player decisive head-to-head, bankroll, then frozen roster order. Top two finalists lock for a first-to-two decisive-win championship; ties and VOID grant no series win. Qualifier statistics stay unchanged during championship. Podium: champion, runner-up, highest-ranked non-finalist.

Bets stay private until payout. VOID refunds bets and adds no qualifier fighter statistics; disconnect-forfeit awards the surviving fighter and refunds spectators. Server deadlines and reconnect tokens are authoritative. Old sockets lose authority when replaced.

## Android joining and lifecycle

Native NSD/mDNS discovery has UDP fallback and stale-entry cleanup. QR invites use `brawl://join?host=<RFC1918-IP>&port=<port>&room=<code>`; invalid addresses, loopback/link-local guest targets, ambiguous parameters and invalid ports are rejected. Cold and warm intents share the parser. HostService publishes hosting readiness only after bind success and keeps serving through Activity recreation.

[V2 candidate evidence and verified APKs](docs/V2_CANDIDATE.md) distinguish automated tests/CI from manual Android acceptance; [V1 release evidence](V1_RELEASE_REPORT.md) remains historical. The startup follow-up fixes a window-initialization crash and blank bundled WebView. Isolated emulator checks now require a visible home screen on three cold launches and also exercised the native hosting lobby; final Android 16 CI 40522679066 passed 103 shared/76 Kotlin tests, lint/build and three visible-home cold launches. The exact final APK also passed the local API37 startup and hosting checks. Current APK provenance and Desktop handoff are recorded in the candidate evidence. Release assembly remains unsigned. Physical Honor/LAN/QR/deep-link acceptance and established signing remain pending.

## Signing

Release assembly without an established signing configuration produces an unsigned APK. CI signs only if all four existing `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` secrets are configured. No signing key or passwords belong in Git. The owner supplies the established identity; do not replace it with a throwaway key.

## Repository

One canonical Git database, with variants represented by branches. External managed worktrees may be used temporarily; never nest a clone/worktree or ZIP pseudo-branch under this root. See [CODEX_WORKLOG.md](CODEX_WORKLOG.md) for the checkpoint and the [V2 plan](docs/superpowers/plans/2026-10-26-v2-games.md) for current scope. Historical V1 release documents remain unchanged.

Natural Earth map geometry used by Blind Pinpoint is public domain.
