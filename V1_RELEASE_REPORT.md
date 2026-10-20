# BET & BRAWL V1 release checkpoint — 2026-10-20

Local code verification is complete. Current-head CI is still pending. Manual Android acceptance and Cloudflare deployment/public smoke are USER FOLLOW-UP by the owner's later scope correction.

## 1. Repository cleanup

Canonical Git root: `C:/Users/Administrator/Desktop/Projects/BET-BRAWL`. The nested `BET-BRAWL-Cloudflare/` was a clean separate clone with no local/ignored/stashed or fsck-unique work. All refs were imported/verified before removal. All 40 ZIP entries matched frozen Git content; modern upstream's archive removal was retained. Temporary parallel worktree is outside the root. Generated assets/builds/dependencies/SQLite/dev vars/secrets/APKs/ZIPs are ignored; no history rewrite or unique work discarded.

## 2. Cloudflare web

Branch: `v1-web-cloudflare-ready`, initial 9aa66f1. One authoritative SQLite Durable Object per room behind Worker HTTPS/WSS remains the production architecture. Fixed exact qualifier resolution, closing-socket authority/handshake, duplicate seats, disconnected next-round fighters, frozen-roster qualification, strict deadlines, debug minimum 3 and restarted-lobby expiry. Online copy/QR/loading/socket guards and public page metadata corrected. Shared TS helper serves Worker and the local Node reference.

Clean install, typecheck, 60/60 TS tests, 14/14 Worker tests, build, Worker typecheck, dry-run, full actual local Wrangler tournament/restart/pending-deadline-and-bet recovery, and complete cf:verify all PASS. Exact commands/evidence are in CLOUDFLARE_VERIFICATION.md. No public deployment performed or URL invented; README documents `npm exec wrangler whoami`, interactive login if needed, and `npm run cf:deploy` after verification.

## 3. Android

Partner branch: `main`, source commit 833a67d. Exact-round ownership fixes Q1/Q2 double completion. Kotlin state/timers/socket authority, offline fighter grace/roster ranking, Higher/Lower reveals and disconnected kick/restart cleanup corrected; HostService readiness/error lifecycle, Activity restore and strict join targets repaired. Observed main 66/66 TS tests/typecheck/build/sync and 51/51 Kotlin tests via existing compiler/JUnit. No device/transport acceptance claimed.

Local SDK 35 absent; existing Gradle daemon loopback unavailable, so local lint/APKs are not claimed. CI checks unit/lint/debug/release. No signing secrets available, no replacement identity created. Device/LAN/QR/deep-link acceptance is owner follow-up.

## 4. Cross-platform parity

Preserved 3–9 players; two qualifiers/distinct opponents; 3/1/0 scoring; five-tier deterministic rankings; locked top two; first-to-two decisive championship wins; tie/VOID non-wins and qualifier-stat invariance; secret bets/refunds; server deadlines/reconnect ownership; champion/runner-up/best non-finalist podium. Debug now also requires three players. Internet Worker/DO vs Android phone/LAN networking intentionally differs.

## 5. CI

Cloud workflow targets this maintained branch and PRs into it; clean install runs cf:verify. Android workflow removes generated-asset tracking failures, runs unit/lint/debug/unsigned release, fixes signing scope and uploads artifacts. Neither deploys. New current-head CI results must be observed after source commits are pushed; local green is not CI evidence.

## 6. Documentation

Branch README, migration, verification, status, metadata and this report now describe online Cloudflare reality. Android docs separately describe Kotlin/LAN. Old Node-only/AI Studio/container/hardware PASS claims removed; historical reports remain in Git.

## 7. Remaining work and user follow-up

Coding task: commit/push, observe exact-head CI, final evidence/cleanup. Owner: established signing identity if desired, manual Android acceptance, Cloudflare login/deploy and public multi-client/QR smoke. Manual items are not coding-task blockers.

## 8. V1 verdict

NOT READY — current-head CI/lint/APK evidence and repository closure remain in this checkpoint.

## 9. Old branch retirement

`v1-web-final safe to retire: NO`. SHA `e1f948c6c6e46355435fd70ea9ab8ee63031ebea`, preserved tag `v1.0.0-web-final`. Baseline 52 source tests/typecheck/build passed. No deletion or new tag performed. Final replacement acceptance, uniqueness audit and separate owner confirmation are still required.
