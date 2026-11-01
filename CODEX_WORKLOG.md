# BET & BRAWL Android V2 production finalization — 2026-11-01

## Authorized objective / topology
User clarified and approved exactly three final branches: v1 (historical former Android main2ee6d66), v2-web (production Cloudflare), main (production V2 Android). Apply the same nine UI/game fixes to Android plus Back/swipe/IME, lifecycle/reconnect, foreground hosting/notification, LAN/QR/deep links/permissions, small-screen/fullscreen behavior and permanent release signing. Full shared/native/parity/lint/debug/signed-release/startup/emulator checks required. No PWA/iPhone/architecture rewrite. No physical-device mutation.

## Current state / preserved evidence
- main in an uncommitted merge with codex/v2-games-android7fc31ab; tree restored from that existing Android candidate. Preserve Android startup fixes at8b0fc98. Previous mistaken web-main promotion is retained in history, not rewritten.
- v1 branch2ee6d66 and v2-web108d4b6 published. Redundant old branch aliases remain until final histories retain all tips and both releases are green. Preserve tags v1.0.0-pre-v2-main2ee6d66, v1.0.0-production-weba60a79d, v1.0.0-web-finale1f948c.
- Web production is already green/deployed: source00b0572, Worker bet-brawl, https://bet-brawl.northstack-labs.workers.dev, version d349b03e-b847-4f13-a6b9-445c0c639230.98shared+20Worker,32browser cases+8regression groups, actual public3-client two-game/reconnect/payout/next smoke passed12accepted/0rejected. Runtime/public asset SHA matches. Existing production SQLite namespace retained; V1 old Cloudflare version e95923d1-b1e4-4566-9b90-c1cf2fddb49b retained. artifacts/v2/production-* and output/playwright/. v2-web CI validates corrected branch docs/config.

## Plan / ownership
1. Root: port shared UI/helper/engine/client fixes while preserving Android bridge, native host/discovery/join endpoint routing; add Back confirmation/leave and reconnect lifecycle regression.
2. storage_audit (luna high): native Mirror25s/reveal parity, native game tests, regenerate projection fixtures only. android_native (luna high): MainActivity/HostService/manifest/native bridge/IME/fullscreen/lifecycle and focused tests. Neither commits or signs.
3. Root: inspect intended signing configuration without exposing secrets; establish durable release identity if none, ignored protected local keystore and CI secrets, fail-closed signed release build. Never distribute unsigned/debug release. VersionCode must exceed previous candidate2.
4. Run shared/browser/native/parity/lint/debug/release/startup/emulator checks; independent review; exact-source CI green; verify signed APK hashes/certificate/package/min-target/asset provenance; document physical-phone limits; finish branch cleanup exactlyv1/v2-web/main.

## Constraints / architecture
Keep React bundled WebView, native Kotlin authoritative LAN host and foreground service, protocol2 and current scoring. Mirror retains5x4s choices plus1s reveal each (25s total). Never replace Android useBrawlClient wholesale with web client: preserve host startup, discovery/deep links and bounded retry. Existing SDK/JDK/Gradle/runtime only where available; one heavy Gradle at a time. No signing secrets in repo/logs; permanent identity explicitly authorized by latest Android request.

## Completed implementation / current gates
- Shared UI/engine port complete; native LAN/bridge endpoint routing retained. Android Back dialog+explicit host/guest leave, generation cancellation, warm-link handler binding, validated persisted LAN rejoin after Activity recreation, healthy/silent socket resume checks implemented.
- Native Back hides IME first and minimizes entry; predictive Back enabled. Connected-device foreground service starts before optional notification prompt, denied permission does not block host startup, Stop hosting notification action and safe refresh lifecycle added.
- Native Mirror timeline/catalog/test and13updated projection entries now match25s TS authority. Fixed test-fixture regeneration to replay actions before snapshot.106shared tests +typecheck/build/Android asset sync PASS; local Chrome32matrix+10focused groups PASS. Evidence artifacts/v2/android-production-{verify,browser}.log.
- Independent luna-high native/client/signing/CI review reports no actionable blocker. Full native Gradle/lint/signed assembly/emulator gates remain to run in CI; local standalone wrapper currently downloading its pinned Gradle8.7 distribution, SDK35 unavailable locally.
- First permanent RSA4096 release identity established under protected Windows directory outside repo; matching password protected by current-user DPAPI. Certificate SHA256222a2459a560c966ab30ebc7a03d60008a5614692e84e726b7f1568f60caef51 pinned publicly in app/release-signing.sha256. Owner explicitly authorized encrypted signing secrets in RyanEid06/BET-BRAWL after auto-review requested that authorization; all4secrets configured via stdin, no values logged. Release signing failclosed; code3 avoids candidatecode2; CI verifies final certificate.
- Android CI now runs106shared +native/parity, debug/release lint/build, shared browser suite, pinned signed release validation, debug/release3coldlaunches each and native multiplayer/lifecycle smoke (explicit emulator only). No unsigned/debug artifact is a production release.

## Current provenance / CI wait
- Android merge/source eecbf46cfa4afcc5606a6bc342ffc805d5e963b9 pushed main (transient GitHub HTTP408 resolved by normal HTTP/1.1 retry; remote hash verified). Main CI41333416584 running full signed Android pipeline. Corrected web branch CI41310979378 at108d4b6 SUCCESS.
- Local standalone Gradle wrapper download remained0bytes; stopped that task-owned stalled download. No Kotlin assertion ran locally; full native/parity/lint/build gates are assigned to CI with installed SDK35.
- Independent task-owned API37 emulator serial emulator-5580 starting from existing SDK image under artifacts/v2/android-production-avd. Unrelated emulator-5584 was already running and must not be touched. No physical device actions.

- Owned API37 emulator is ready (launcher resumed, explicitserial5580). Confirmed pm check-permission is unsupported on this modern image; native acceptance script now reads actual package permission grants via dumpsys and explicitly enables software IME for emulator hardware-keyboard configurations. Test-only portability fix; production app/runtime unchanged. Preserve current passing build work and use corrected native smoke in next CI.

- CI41333416584 native Gradle compilation failed solely on missing MainActivity HostService import; exact failed log inspected artifacts/v2/android-ci-eecbf46-failed.log. Added the required existing-class import. No game/scoring change. Shared and browser stages already passed. Run7050261 test-script-only update was already in progress; preserve its completed evidence and verify corrected native source via next main CI.

- CI41333894120 atfc4be57 passed all native/Kotlin/parity tests, debug+release lint, debug+permanently signed release builds. Independent apksigner verified APKv2 and exact pinned RSA4096 certificate; CI failed only because current SDK tool labels it V2 Signer rather than Signer#1. Exact failed log inspected; certificate extraction now accepts certificate-digest lines across tool labels while still requiring exactly the pinned unique hash. Runtime unchanged.

## Next action
Observe final signed Android CI and fix exact failed checkpoint only; Retrieve exact signed artifact, independently verify hash/certificate/min-target/assets, test on existing isolated API37 emulator, seal Android docs, then remove redundant branch aliases once all tips are retained in main/v2-web/v1 histories/tags. Work quietly per owner; update this checkpoint at milestones and before waits/compaction. No user updates unless asked.
