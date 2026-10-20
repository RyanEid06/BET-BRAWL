# BET & BRAWL V1 release checkpoint — 2026-10-20

**GREEN** under the corrected coding scope. Both maintained source heads passed CI, including Android lint/APKs and full Cloudflare verification. Manual Android acceptance and Cloudflare deployment/public smoke are USER FOLLOW-UP.

## 1. Repository cleanup

Canonical Git root: `C:/Users/Administrator/Desktop/Projects/BET-BRAWL`. The nested `BET-BRAWL-Cloudflare/` was a clean separate clone with no local/ignored/stashed or fsck-unique work. All refs were imported/verified before removal. All 40 ZIP entries matched frozen Git content; modern upstream's archive removal was retained. Temporary managed worktree is outside the root and archived at final closure after preserving evidence. Generated assets/builds/dependencies/SQLite/dev vars/secrets/APKs/ZIPs are ignored; no history rewrite or unique work discarded.

## 2. Cloudflare web

Verified source: `v1-web-cloudflare-ready` at `51a7adf6af295a868760c37cc94ea5788797d774` (initial9aa66f1). Frozen web history is fully contained; no frozen-only commits need merging. One authoritative SQLite Durable Object per room behind Worker HTTPS/WSS remains the production architecture. Fixed exact qualifier resolution, closing-socket authority/handshake, duplicate seats, disconnected next-round fighters, frozen-roster qualification, strict deadlines, debug minimum 3 and restarted-lobby expiry. Online copy/QR/loading/socket guards and public page metadata corrected. Shared recap now distinguishes VOID, championship ties, a first decisive win and title victory; two SSR regressions pass. The runtime readiness fixture waits for all intended participants rather than an earlier vacuous snapshot. Shared TS helper serves Worker and the local Node reference.

Clean install, typecheck, 61/61 TS tests, 14/14 Worker tests, build, Worker typecheck, dry-run, full actual local Wrangler tournament/restart/pending-deadline-and-bet recovery, and complete cf:verify all PASS. Exact commands/evidence are in CLOUDFLARE_VERIFICATION.md. No public deployment performed or URL invented; README documents `npm exec wrangler whoami`, interactive login if needed, and `npm run cf:deploy` after verification.

## 3. Android

Partner branch: `main`, verified source `2ee6d66f4ecd49a66bf31530413919d550055f11`. Exact-round ownership fixes Q1/Q2 double completion. Kotlin state/timers/socket authority, offline fighter grace/roster ranking, Higher/Lower reveals, zero-time STOP/DNF handling and disconnected kick/restart cleanup corrected; HostService readiness/error lifecycle, Activity restore and strict join targets repaired. Observed main 67/67 TS tests/typecheck/build/sync and 52/52 Kotlin tests via existing compiler/JUnit. No device/transport acceptance claimed.

Local SDK35 absent and existing Gradle daemon loopback unavailable; no tooling added. CI successfully ran52 Kotlin tests (0 failures/ignored), lint (0 errors/14 warnings) and debug/release assembly. APKs downloaded to canonical `artifacts/android-v1/final/apks/debug/app-debug.apk` and `release/app-release-unsigned.apk`. Both inspected: com.betbrawl.app1.0.0/code1,min24/target35,matching three bundled assets. Debug signature verifies; release is confirmed unsigned because established secrets were absent. No identity created. Exact hashes/provenance are in canonical `artifacts/android-v1/final/verification.json` and main release report. Physical/LAN/QR/deep-link acceptance remains owner follow-up.

## 4. Cross-platform parity

Preserved 3–9 players; two qualifiers/distinct opponents; 3/1/0 scoring; five-tier deterministic rankings; locked top two; first-to-two decisive championship wins; tie/VOID non-wins and qualifier-stat invariance; secret bets/refunds; server deadlines/reconnect ownership; champion/runner-up/best non-finalist podium. Debug now also requires three players. Internet Worker/DO vs Android phone/LAN networking intentionally differs.

## 5. CI

Cloud workflow targets this maintained branch and PRs into it; clean install runs cf:verify. Android workflow removes generated-asset tracking failures, runs unit/lint/debug/unsigned release, fixes signing scope and uploads artifacts. Neither deploys. Verified source CI SUCCESS: [Cloud39485599127](https://github.com/RyanEid06/BET-BRAWL/actions/runs/39485599127) at 51a7adf and [Android39486340786](https://github.com/RyanEid06/BET-BRAWL/actions/runs/39486340786) at 2ee6d66. Earlier Android test smart-cast compilation failure was reproduced with separate modules and repaired; the final zero-time action regression also observed RED then52/52 GREEN locally. Final main CI must pass before handoff; exact terminal results are preserved in canonical artifacts/v1-closure.json. Final documentation commits do not change tested source; see Actions for documentation-head reruns.

## 6. Documentation

Branch README, migration, verification, status, metadata and this report now describe online Cloudflare reality. Android docs separately describe Kotlin/LAN. Old Node-only/AI Studio/container/hardware PASS claims removed; historical reports remain in Git.

## 7. Remaining work and user follow-up

No coding-scope blocker. Owner: established signing identity if desired, manual Android acceptance, Cloudflare login/deploy and public multi-client/QR smoke. Manual items are USER FOLLOW-UP. Useful logs preserved in canonical artifacts before temporary managed worktree archive; final tracked states must be clean.

## 8. V1 verdict

**GREEN** — reconciled source, tests/typechecks/builds, Android lint/APKs and Cloudflare dry-run/runtime/CI pass. Live deployment, production signing and physical acceptance are not claimed.

## 9. Old branch retirement

`v1-web-final safe to retire: NO`. SHA `e1f948c6c6e46355435fd70ea9ab8ee63031ebea`, preserved tag `v1.0.0-web-final`. Baseline 52 source tests/typecheck/build passed. No deletion or new tag performed. Frozen is an ancestor of 51a7adf with no frozen-only commits; existing tag target verified identical. Owner personal acceptance and separate explicit deletion confirmation are still required.

Final boundary follow-up: both engines use recorded Millisecond Stop actions, so a valid 0ms stop is not DNF. TS/native regressions observed RED then GREEN; full local Cloud gate61TS+14Worker/all runtime PASS and exact CI39485599127 SUCCESS at51a7adf. Main67TS+52Kotlin local PASS at2ee6d66; final source CI39486340786 supplies fresh lint/APKs. Node championship tie fixture uses no actions instead of assuming sub5ms socket delivery. Exact final heads/terminal results and final APK provenance are preserved in canonical artifacts/v1-closure.json. Earlier83d3cdf artifacts are historical only.
