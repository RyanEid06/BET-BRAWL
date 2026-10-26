# BET-BRAWL V2 checkpoint

## Objective and boundaries
Deliver the owner-approved [14-game V2 plan](docs/superpowers/plans/2026-10-26-v2-games.md): six V1 plus eight new games, web first then Android/LAN. Preserve tournament/bets/bankroll and V1 refs. Candidate branches only; no merge/deploy/publication, dependencies, new modes/accounts/redesign, device installation or extra Android tooling. User explicitly approved pushing both V2 candidate branches to RyanEid06/BET-BRAWL for CI in this chat.

## State and architecture
- Canonical checkout C:/Users/Administrator/Desktop/Projects/BET-BRAWL. Current branch codex/v2-games-android from main 2ee6d66f4ecd49a66bf31530413919d550055f11. V2 changes dirty/staged; shared patch conflicts resolved by preserving Android LAN routing/deep links/native bridge. No wholesale Cloudflare merge.
- Web candidate codex/v2-games-web at c1e03cfae7078488cc2f44daac0523e34664e84b, pushed; exact-source Cloudflare CI40361090266 SUCCESS. V1 refs unchanged. Same canonical checkout on private branches; no unnecessary worktree/dependency copies.
- Pure TS V2Games and native Kotlin JsonObject V2Games authority; canonical fixtures src/engine/fixtures consumed by both. UI uses recipient projections. Match/action/stage IDs, private immutable commits, absolute deadlines/catch-up, shuffled 14-game bag; no network arrival tiebreaker.
- Version2.0.0/protocol2; Android versionCode2. Candidate Worker bet-brawl-v2-candidate isolates future storage. Native host keeps existing discovery/service/WebView behavior.

## Completed and observed verification
- Full web npm run cf:verify PASS:92 engine/client +18 Worker tests, build/typechecks, dry run, actual local SQLite/WebSocket full tournament and restart/private-action/deadline recovery. artifacts/v2/resumed-cf-verify.log.
- Independent web review found four important defects, all fixed RED→GREEN: logical deadlines/puzzle recovery, varied Circuit routes, post-catch-up stage checks, and visible V2 finished explanation on payout. Focused suite50/50 pass. No deferred reviewer findings.
- Browser32 game/viewport cases pass at360x640/390x844/768x1024/1366x768: touch/mouse, roles/results/study transition, focus/reduced motion/orientation, >=44px targets, no horizontal overflow. Compact Mirror fits short phone; longer boards/results scroll.
- Actual App/browser room smoke passes Memory/Safecracker with three clients plus debug bot, accepted scoped inputs/privacy/payout explanation. Wi-Fi HTTP run passes with getRandomValues IDs (randomUUID unavailable outside secure context). artifacts/v2/browser/REPORT.md; no physical/native acceptance implied.
- Android shared npm run verify PASS100/100, typecheck/build/asset sync. New TS test validates104 canonical full-state checkpoints and312 projections, also used by Kotlin.
- Pure Kotlin staging13/13; host staging37/37. Integrated native full suite75/75 PASS, production/test modules compiled separately with JDK17/compiler2.2.10 language/API1.9. Includes explicit PASS null and HostService trailing callback compatibility. artifacts/v2/native-integrated-final.log; runner artifacts/v2/run-integrated.ps1. No native compiler remains active.

## Pending/failures and useful approaches
- Independent Android review found native hostGame CREATE_ROOM omitted protocolVersion; real bridge-branch browser reproduced rejection RED before fix. Fixed payload; GREEN create/join/bot/start/Memory actions/payout through actual hook with simulated bridge + real Node sockets, zero browser errors. artifacts/v2/browser/bridge-before.json and bridge-after.json. No remaining important review findings; no native Activity/device acceptance implied.
- Local SDK35 is absent (only37 installed); use existing Android CI for Gradle tests/lint/debug+release assemblies. Do not install tooling or touch physical devices.
- Sandboxed loopback tests EACCES require approved escalation; GitHub keyring authentication verified with network access. Initial push auto-review rejection was resolved by direct user approval; web push succeeded. CI operations use git/gh, no GitHub plugin.
- Legacy timing fixtures explicitly pin V1 games; advancing arbitrary +1000ms can skip entire rounds now that deadline catch-up is correct.
- Staging reports: artifacts/v2/android-port/REPORT.md and artifacts/v2/android-host/REPORT.md. Final host + V2ServerProtocolTest recopied after constructor fix. Source files now integrated; keep staging evidence until integrated CI/artifacts verified.

## Exact next action
Commit/push Android branch, inspect exact failing CI job if any, obtain debug/release APKs and verify version/signature/assets/hashes. Record both candidates and pending physical/public acceptance, clean only disposable task scratch. Update docs/worklog on both branches without product drift. Stop at reviewable candidates, no merge/deploy/publication.
