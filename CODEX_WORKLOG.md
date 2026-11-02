# BET & BRAWL V2.1 web release — in progress 2026-11-02

## Objective / constraints
User requests focused V2.1 gameplay polish and same-package/permanent-key Android V2→V2.1 update retaining data; full shared/Worker/Android/browser/mobile checks, green CI, then existing Cloudflare production deployment. Pushes to main/v2-web explicitly approved. Preserve main(Android),v2-web(web),v1(history), protocol2 and existing SQLite BRAWL_ROOMS/BrawlRoom/activeRoom storage. No physical-device mutation. User requests no progress updates unless asked/input needed; delegated agents Luna high. Canonical plan: docs/superpowers/plans/2026-11-02-v2.1-polish.md.

## Current state / changes
One canonical checkout C:/Users/Administrator/Desktop/Projects/BET-BRAWL, currently v2-web starting108d4b6; only task changes dirty. Android runtime b8cf80a; main helper/checkpoint a800631. Exact Android CI41505649490 (and earlier same-runtime41505327748) running. Focused TS/Kotlin timings, dynamic Millisecond UI/target/countdown/results, Quick Draw whole arena/one-shot/false-start/reaction result, Pinpoint full world/boundedpan/pinch/zoom/editabledraft+Lock, fighter-only instructions14games ported. Keep web-specific client/routing/config unchanged; web package/API now2.1.0. Existing persisted Millisecond rounds missing targetSeconds retain their original5-second scoring via backward fallback+regression. No namespace/schema migration.

## Observed checks
Android main local115sharedtests/typecheck/build/sync PASS; browser32cases+11groups+4viewportpolishmatrices+8mapgroups PASS; Luna review no important regressions. Local Kotlin fails before execution due Windows JVM UnixDomainSocketPipe loopback; exact Linux CI pending.
Web local npm run lint +cf:verify PASS:107shared+20Worker tests, both typechecks/build/dry-run and real workerd SQLite/WebSocket tournament/privacy/retry/reconnect/restart/alarm tests. Full web browser PASS:32cases+8existinggroups+4viewportpolishmatrices+8mapgroups, no page errors. Evidence artifacts/v2.1-{cf-verify,web-browser}.log and output/playwright/.
Owned API37 emulator5580 running with original signedV2code3, UID10234/firstInstallTime2026-11-01 20:09:47; never uninstalled/reset. Preflight saved real V2 name V2UpgradeQA/avatarfox throughUI, closed itsownroom, captured10WebView/SharedPreferencesfiles in memory. Exact signedcandidate upgrade/data retention/native smoke pending. Script onmain: scripts/android-upgrade-smoke.py; real Python313.

## Production / recovery baseline
Current production Worker bet-brawl, https://bet-brawl.northstack-labs.workers.dev; source00b0572, Cloudflare versiond349b03e-b847-4f13-a6b9-445c0c639230, previously verified V2.0.0/protocol2. v1 remains2ee6d66; historical tags retained. No V2.1 deployment yet. Native Wrangler auth uses existing protected setup; no secrets read/exported.

## Exact next action
Finish web browser, commit/push v2-web to run exact CI. Require both platformCIgreen; download main signedAPK, verify certificate/package2.1.0/code4 and exact artifact provenance; run V2code3→4 install-r/dataretention then full native smoke/cold launches on5580. Deploy existing Cloudflare ONLY after all gates pass, verify public assets/API and three-client multiplayer. Seal release report/worklog/APKmanifest, returncheckoutmainclean, stop only ownedVite/emulator and remove clearly disposable taskclutter.
