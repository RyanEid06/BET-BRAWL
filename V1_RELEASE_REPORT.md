# BET & BRAWL V1 release checkpoint

2026-10-20. Implementation/local automated checks are complete. Exact-head CI/lint/APKs remain pending; this is a truthful checkpoint, not the final verdict. The owner's scope correction makes Android manual acceptance and Cloudflare deployment/public smoke USER FOLLOW-UP.

## 1. Repository cleanup

One canonical Git repository at `C:/Users/Administrator/Desktop/Projects/BET-BRAWL`. The nested Cloudflare directory was a clean separate clone; every ref was imported/verified before removal. All 40 historical ZIP entries matched frozen Git content exactly, and the modern branch's existing ZIP removal was retained. One temporary managed worktree is outside the root. Generated WebView assets are ignored/rebuilt; dependencies/builds/SQLite/dev vars/signing files/APKs/ZIPs are excluded. No history rewrite or unique work loss.

## 2. Cloudflare web

`v1-web-cloudflare-ready`, based on `9aa66f1`: Worker/SQLite Durable Object architecture retained. Exact qualifier resolution, replacement-socket authority, repeated-join protection, offline fighter grace, frozen-roster finalists, strict deadlines, three-player debug minimum and restart seat cleanup fixed. UI/QR/page metadata now describe online play; local Node reference keeps LAN behavior.

Executed: clean install, typecheck, 58/58 TS tests, 14/14 Worker tests, production build, Worker typecheck, Wrangler dry-run, actual local multi-client full tournament plus SQLite process-restart/deadline/bet recovery, and complete `npm run cf:verify`, all PASS. Evidence remains in the external worktree `artifacts/cloud-final-verify.log`. No deployment or public URL is claimed. README contains exact login/deploy commands.

## 3. Android

`main`, based on `9ac170b`: server previously pre-completed Q1, then its helper selected/completed Q2. The helper now owns one exact scheduled qualifier and rejects replay. Server state/timers are serialized; stale socket authority, offline next-round fighter grace, frozen-roster ranking, Higher/Lower reveal-key crash, disconnected-seat kick and restarted-lobby cleanup fixed. HostService readiness/failure handling, Activity restoration and strict join target validation repaired.

Executed: clean npm install, typecheck, 64/64 TS tests, production frontend build/sync, and 51/51 Kotlin tests via existing compiler/JUnit. Twenty protocol tests drive actual JSON handlers and serialization, including the full qualifier/championship 2–1/tie sequence and VOID/refunds/deadlines/reconnect/authority/graces. No transport/device acceptance is implied.

Local Android lint/APKs are unverified: SDK 35 is absent and existing Gradle daemon cannot establish loopback. No additional Android tooling was installed. CI is configured for unit/lint/debug/release and artifact upload. Signing secrets were absent; no key was created or committed. An unsigned release is not a signed production APK.

## 4. Cross-platform parity

Both modern targets retain 3–9 players, two qualifiers against distinct opponents, 3/1/0 points, deterministic five-level ranking, locked top two, first-to-two decisive wins, tie/VOID non-wins, invariant championship qualifier statistics, private betting/refunds, authoritative deadlines/reconnect ownership and champion/runner-up/best non-finalist podium. Debug also requires three players. Networking deliberately differs: Cloudflare internet rooms versus Android phone/LAN.

## 5. CI

Android workflow removes the stale committed generated-assets gate, always runs unit/lint/debug/unsigned release, and fixes signing-secret scope. Cloud workflow verifies the maintained branch/PR target via clean install/full cf:verify. Neither deploys. Current-head results still must be observed after pushing source commits; prior runs are not current-head proof.

## 6. Documentation

README/V1_STATUS/metadata/build comments were corrected on each target; Cloudflare migration/deploy guidance rewritten. Old Node-only counts, AI Studio compilation claims and unperformed hardware PASS claims are removed by this report.

## 7. Remaining work and user follow-up

Coding task: commit/push, exact-head CI/lint/build, final evidence and temporary-worktree cleanup. Owner follow-up: manual Android/LAN/QR/deep-link acceptance; established release signing if desired; Cloudflare login/deploy/public HTTPS/WSS/QR multi-client acceptance. These manual items are not coding-task blockers.

## 8. V1 verdict

NOT READY — only current-head CI/lint/build and final repository closure remain in this checkpoint.

## 9. Old branch retirement

`v1-web-final safe to retire: NO`. Frozen SHA `e1f948c6c6e46355435fd70ea9ab8ee63031ebea`, tag `v1.0.0-web-final`. Baseline source typecheck/52 tests/build passed using repaired installed dependencies; its original lock cannot clean-install on Windows. No branch/tag deletion performed. Retirement still requires final replacement acceptance, uniqueness comparison and separate explicit owner confirmation.
