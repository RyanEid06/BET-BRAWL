You are the FINAL RELEASE ENGINEER for BET & BRAWL V1.

This is not an audit-only task. Inspect the real repository, perform the required fixes, run the real verification gates, clean the repository/environment, and leave me with two trustworthy V1 production targets:

1. ONLINE WEB V1
   - React/Vite frontend
   - hosted on Cloudflare
   - Cloudflare Worker
   - SQLite Durable Objects
   - one authoritative Durable Object per room
   - internet multiplayer

2. ANDROID V1
   - React/Vite UI bundled inside the APK
   - Kotlin authoritative `BrawlWebSocketServer`
   - host Android phone runs the room
   - guests connect over same Wi-Fi/LAN
   - no Cloudflare/Render/laptop/internet backend required during gameplay

There are currently three historical branches/snapshots:

- `main`
  Current Android/LAN implementation.

- `v1-web-cloudflare-ready`
  Current Cloudflare web migration.

- `v1-web-final`
  Old frozen Node/LAN web V1 reference.

IMPORTANT FINAL DIRECTION:

`v1-web-final` is TEMPORARY now.

Keep it untouched while finishing and verifying the other two targets because it is useful as a golden behavioral reference.

ONLY AFTER:
- Android is completely green,
- Cloudflare web is completely green,
- the new Cloudflare deployment is remotely verified,
- no unique code/data remains only in the frozen branch,
- and I explicitly confirm deletion,

we will delete `v1-web-final`.

Do NOT delete that branch automatically before my confirmation.

============================================================
0. FIRST: UNDERSTAND AND CLEAN THE REPOSITORY ENVIRONMENT
============================================================

The canonical repository is currently expected to be around:

`C:\Users\Administrator\Desktop\Projects\BET-BRAWL`

The repository/environment has accumulated leftovers.

For example the root may currently contain things such as:

- `.git`
- `.agents`
- `BET-BRAWL-Cloudflare/`
- `src/`
- an old `BET-BRAWL-v1.0.0.zip`
- source/config files from older snapshots
- generated files
- possibly nested clones/worktrees
- historical release artifacts

DO NOT start deleting blindly.

Before modifying application code, perform a complete repository topology audit.

Run and inspect:

`git status`
`git branch -vv`
`git branch -a`
`git remote -v`
`git log --oneline --graph --decorate --all --max-count=100`
`git worktree list`
`git stash list`

Also inspect the repository filesystem.

Determine:

1. Which directory is the REAL canonical Git repository.
2. Whether `BET-BRAWL-Cloudflare/` is:
   - a nested Git repository,
   - another clone,
   - a worktree,
   - or merely copied files.
3. Whether that nested directory contains any uncommitted or unique work.
4. Whether old ZIP files contain anything not committed to Git.
5. Whether generated build folders are incorrectly present/tracked.
6. Whether APKs/build artifacts are incorrectly stored in normal source history.
7. Whether `.gitignore` is sufficient.
8. Whether multiple copies of the same source tree exist inside the repository.

CRITICAL SAFETY RULE:

Before removing ANY nested folder, archive, duplicate project copy or stale source:

- compare it against the actual branches,
- inspect its Git state if it has `.git`,
- check for uncommitted changes,
- check file hashes/diffs,
- preserve any unique legitimate work by moving/committing it into the appropriate real branch.

Never destroy unique work.

============================================================
1. TARGET REPOSITORY STRUCTURE
============================================================

The final development environment must have ONE canonical Git repository.

Branches represent product variants.

Folders inside the repository must NOT represent cloned branches.

The target should conceptually be:

BET-BRAWL/
    .git/
    .github/
    .agents/                  only if actually used
    app/                      Android project where applicable
    src/
    worker/                   Cloudflare branch where applicable
    package.json
    package-lock.json
    ...
    
NOT:

BET-BRAWL/
    .git/
    BET-BRAWL-Cloudflare/
        .git/
        src/
        ...
    BET-BRAWL-v1.0.0.zip
    another-project-copy/
    duplicated source trees

If parallel branch development is genuinely needed, Git worktrees are acceptable, but they must live OUTSIDE the canonical repository root, e.g.:

`C:\Users\Administrator\Desktop\Projects\BET-BRAWL-worktrees\cloudflare`

Never nest another repository/worktree inside:

`BET-BRAWL\`

Clean stale worktree metadata with:

`git worktree prune`

only when safe.

============================================================
2. CLEAN REPOSITORY HYGIENE
============================================================

Audit and fix `.gitignore`.

Normally exclude generated/local content such as:

- `node_modules/`
- `dist/`
- `.wrangler/`
- `.dev.vars`
- `.env`
- `.env.*` where secrets could exist
- Android `.gradle/`
- Android `build/`
- `app/build/`
- IDE caches
- temporary files
- test output
- local logs
- generated APKs/AABs
- temporary ZIP snapshots

Do NOT ignore legitimate source/config files needed for builds.

Cloudflare config such as `wrangler.jsonc` / `wrangler.toml` SHOULD remain source-controlled when it contains no secrets.

Never commit:
- Cloudflare API tokens
- Android keystores
- signing passwords
- private keys
- `.dev.vars`
- machine-specific secrets

If secret-looking files are currently tracked, remove them safely from the working tree/index as appropriate and document the issue.

Do not rewrite historical Git history unless absolutely necessary.

============================================================
3. REMOVE STALE NESTED PROJECT COPIES
============================================================

Once verified safe:

Remove redundant nested copies such as:

`BET-BRAWL-Cloudflare/`

IF AND ONLY IF all useful work from it exists on the real:

`v1-web-cloudflare-ready`

branch.

Do not leave duplicate project trees inside the canonical repo.

Also inspect:

`BET-BRAWL-v1.0.0.zip`

or similar historical archives.

If the archive is merely an old release/source snapshot already represented by Git:

remove it from the repository/workspace.

Git is the source of truth.

Do not use ZIP snapshots as pseudo-branches.

If a binary release archive should be preserved, it belongs in a GitHub Release or external artifact location, not normal source history.

At the end:

`git status`

must make sense and the repository root should be clean and understandable.

============================================================
4. BASELINE THE OLD FROZEN WEB BRANCH
============================================================

Before touching its replacement, inspect:

`v1-web-final`

This branch is the behavioral golden reference only.

Do NOT modernize it.

Do NOT merge random Cloudflare/Android code into it.

Record:

- commit SHA
- test count
- verification result
- important game behavior implemented there

Use it to detect regressions.

After this baseline, return to the active branches.

============================================================
5. IMMUTABLE V1 GAME RULES
============================================================

Both Android and Cloudflare must maintain the same core game behavior.

Required V1 rules include:

- 3–9 players
- exactly 2 qualifier appearances per player
- the two appearances must be against two distinct opponents
- qualifier win = 3 points
- qualifier tie = 1 point each
- qualifier loss = 0
- deterministic qualifier ranking
- five-level/tier tiebreak logic already defined by the project
- top two qualifier players become finalists
- finalists lock when championship begins
- championship is first to 2 decisive wins
- championship ties do NOT count as wins
- VOID does NOT count as a championship win
- qualifier scores never change during championship
- bets remain private before payout/reveal
- disconnect-forfeit behavior remains correct
- VOID refunds bets appropriately
- VOID must not modify qualifier fighter statistics
- Quick Draw rejects pre-draw taps
- authoritative server deadlines
- reconnect reuses the correct seat
- stale socket closure cannot disconnect a newer replacement connection
- podium:
  Champion
  Runner-Up
  best-ranked non-finalist

Compare:

- original Node server
- Cloudflare Durable Object implementation
- Kotlin Android server
- shared TS game engines
- Kotlin game engines

Port genuine correctness fixes between implementations where relevant.

DO NOT force platform-specific networking code to be identical.

============================================================
6. FINISH `v1-web-cloudflare-ready`
============================================================

Checkout:

`v1-web-cloudflare-ready`

The intended architecture is already correct:

Browser
    |
    HTTPS/WSS
    |
Cloudflare Worker
    |
    room code
    |
SQLite Durable Object
    |
authoritative room state

Keep this architecture.

DO NOT add:
- Render
- Express production server
- laptop host
- Android host
- Firebase
- another backend

for Web V1.

------------------------------------------------------------
6A. RECONCILE LATEST SHARED FIXES
------------------------------------------------------------

The Cloudflare branch was created before some newer fixes on `main`.

Perform a deliberate diff.

Inspect at minimum:

- `src/engine/roomEngine.ts`
- `src/engine/roomEngine.test.ts`
- `src/engine/gameEngine.ts`
- `src/engine/odds.ts`
- `src/engine/types.ts`
- mini-game logic
- tournament logic
- Node server reference logic
- Worker/Durable Object logic

Bring over only legitimate shared game-engine fixes.

DO NOT blindly copy Android-specific:

- LAN discovery
- Android native bridge behavior
- `brawl://`
- local host/port routing
- Android lobby wording
- Android `useBrawlClient` assumptions

Preserve Cloudflare routing.

------------------------------------------------------------
6B. QUALIFIER RESOLUTION
------------------------------------------------------------

Ensure one qualifier resolution causes EXACTLY one tournament match to complete.

A qualifier result must:

- resolve exactly the intended match
- increment qualifier completion once
- update fighter stats once
- calculate points once
- reveal bets at the correct time
- update rankings correctly
- never skip the next qualifier
- VOID advances exactly one scheduled qualifier
- VOID does not alter qualifier fighter statistics

Add regression tests.

Avoid duplicated qualifier-resolution implementations where possible.

Prefer one shared authoritative TS helper used by relevant TS backends.

------------------------------------------------------------
6C. CLOUD UI MUST ACT LIKE AN ONLINE PRODUCT
------------------------------------------------------------

The Cloudflare web version must stop pretending it is LAN-only.

Audit all visible copy.

Cloud mode must NOT display statements such as:

- “Same Wi-Fi”
- “No internet needed”
- “ACTIVE ROOM ON THIS WI-FI”
- “Alternative LAN Addresses”
- router AP-isolation help
- local-server troubleshooting
- “Finding your local game…”

when running on Cloudflare.

Introduce a clean mode signal if needed, e.g.:

`deploymentMode: "cloud" | "lan"`

or equivalent.

For Cloudflare communicate:

- 3–9 players
- share room code or QR
- players can join from different networks
- internet connection required

The old local Node implementation can retain LAN wording.

Android also retains LAN wording.

------------------------------------------------------------
6D. QR / JOIN LINKS
------------------------------------------------------------

Cloud web QR codes should generate something equivalent to:

`https://<deployment-origin>/?room=ABCDEF`

Joining that URL must:

- load the web app
- prefill the room
- not require LAN discovery
- connect to the corresponding Worker/Durable Object
- work from another network

Never generate:
- localhost
- `file://`
- Android `brawl://`
for Cloudflare web QR codes.

------------------------------------------------------------
6E. CLOUDFLARE BACKEND TESTS
------------------------------------------------------------

Go beyond pure helper tests.

Test actual Wrangler/Durable Object behavior where possible.

Required coverage:

- Room A/B isolation
- create
- join
- min players
- max players
- host-only actions
- ready/start rules
- secret bets
- payout reveal
- deadlines
- reconnect
- stale socket protection
- seat reuse
- stale lobby cleanup
- fighter disconnect
- forfeit
- VOID
- qualifier progression
- no skipped qualifier
- ranking
- locked finalists
- championship
- championship tie
- first-to-2
- qualifier invariance in championship
- podium
- room close
- Durable Object persistence/re-instantiation

Use short timing in TEST MODE only.

Production timings remain unchanged.

------------------------------------------------------------
6F. CLOUD VERIFICATION
------------------------------------------------------------

From clean dependencies run:

`npm ci`

Then run all available/appropriate commands, including:

`npm run typecheck`
`npm test`
`npm run test:worker-core`
`npm run build`
`npm run cf:typecheck`
`npm run cf:dry-run`
`npm run test:cloudflare`
`npm run cf:verify`

If names differ, inspect `package.json` and use the real equivalents.

Do not claim a command passed unless it actually ran.

Fix all failures.

------------------------------------------------------------
6G. CLOUD CI
------------------------------------------------------------

Audit:

`.github/workflows/`

CI for the Cloudflare branch must test the actual Cloudflare release architecture.

At minimum:

- clean install
- TS typecheck
- unit tests
- Worker/DO tests
- build
- Wrangler validation/dry-run

Do not accidentally deploy from every branch.

Separate verification and deployment if that is cleaner.

No credentials in Git.

------------------------------------------------------------
6H. DEPLOY CLOUD WEB V1
------------------------------------------------------------

Once green:

Deploy if Cloudflare authentication is available.

Use the existing account/configuration.

After deployment verify the REAL site:

- `/`
- static assets
- `/api/network-info`
- WSS connection
- room create
- room join
- state synchronization

Perform a multi-client test.

Prefer at least 3 clients.

Verify clients can connect from the public HTTPS deployment, not merely localhost.

Record:

- deployment URL
- deployment identifier/version if available
- smoke-test result

If authentication is unavailable:

DO NOT fake deployment.

Report exactly what remains and the command I need to run.

============================================================
7. FINISH ANDROID `main`
============================================================

Checkout:

`main`

Android V1 architecture stays:

React UI
    |
WebView
    |
127.0.0.1 / host LAN
    |
HostService
    |
Kotlin BrawlWebSocketServer
    |
Wi-Fi guests

There is NO remote backend required for Android V1.

No Render.
No Cloudflare gameplay dependency.
No laptop.
No Node server during gameplay.

------------------------------------------------------------
7A. FIX CURRENT TOURNAMENT BLOCKER
------------------------------------------------------------

Inspect:

`BrawlWebSocketServer.resolveCurrentGame()`

and:

`RoomEngine.applyQualifierMatchResolution(...)`

There is a known risk/bug:

The server may mark the current qualifier completed BEFORE calling a helper which looks for the first unfinished qualifier.

That can result in:

Q1 resolves
Q1 is marked complete
helper finds Q2
Q2 becomes complete as well
Q2 is skipped

Fix this properly.

Exactly ONE code path owns qualifier match completion.

Preferred design:

Pass the exact qualifier/match identity to the resolution helper,

OR let the helper completely own qualifier completion.

Never infer the current match by “first unfinished” after another layer has already modified state.

------------------------------------------------------------
7B. REAL SERVER-LEVEL ANDROID TEST
------------------------------------------------------------

The current tests are not enough if they manually manipulate tournament engines.

Add a real integration-style test driving:

`BrawlWebSocketServer`

through its actual protocol.

Test a complete three-player tournament.

Required sequence:

Create host
Join guest 1
Join guest 2
Ready
Start

Play Q1
assert only Q1 completed

Play Q2
assert only Q1 + Q2 completed

Play Q3
assert all three played

Verify:
- statistics
- points
- ranking
- two finalists

Then championship:

Game 1 decisive
Game 2 tie
Game 3 opposite finalist wins
Game 4 clinching win

Verify:
- tie did not increment championship score
- final championship = 2–1
- qualifier scores never changed
- third player never entered championship
- final podium correct

Also test qualifier VOID:

- only one match advances
- no qualifier fighter stats added

If production timers make testing slow, create clean dependency-injected/test-only timing configuration.

Do NOT weaken production timers.

------------------------------------------------------------
7C. ANDROID SERVER SECURITY / AUTHORITY
------------------------------------------------------------

Test the actual server for:

- non-host start rejected
- min 3
- max 9
- ready gating
- token secrecy
- private bets
- authoritative betting deadline
- authoritative gameplay deadline
- malformed fighter action rejection
- reconnect seat recovery
- stale socket protection
- lobby stale-seat cleanup
- host grace
- fighter grace
- DISCONNECT_FORFEIT
- VOID
- unauthorized room-close rejected

A random unauthenticated connection must never be able to destroy an active room.

------------------------------------------------------------
7D. ANDROID LAN / QR / DEEP LINK
------------------------------------------------------------

Preserve and verify:

- mDNS/NSD
- UDP discovery fallback
- TTL cleanup
- RFC1918 host validation
- rejection of loopback for guest QR
- rejection of link-local invalid targets
- direct QR host/port join
- discovery fallback
- manual room-code entry
- cold deep-link launch
- warm deep-link handling

Android URI:

`brawl://join?host=...&port=...&room=...`

must remain correct.

Prevent:

- `null?room=...`
- malformed query strings
- file URLs
- 127.0.0.1 guest QR
- wrong port
- duplicate room parameters

------------------------------------------------------------
7E. HOSTSERVICE
------------------------------------------------------------

Verify:

- starts once
- correctly binds the port
- failure to bind becomes visible to user
- no fake “hosting” state
- survives Activity recreation
- behaves correctly when app backgrounds
- advertises after room creation
- stops advertising after closure
- server shuts down cleanly
- foreground notification behavior valid

------------------------------------------------------------
7F. ANDROID WEB ASSETS
------------------------------------------------------------

After frontend changes:

`npm run build`
`npm run sync:android`

or the real repository equivalents.

`app/src/main/assets/web/`

must exactly match the intended Android frontend build.

Do not manually edit generated bundled JS.

Fix source, rebuild, sync.

Android copy should continue saying:

- same Wi-Fi
- no internet needed
- local room

Do NOT copy Cloudflare online wording into Android.

------------------------------------------------------------
7G. ANDROID BUILD VERIFICATION
------------------------------------------------------------

Perform clean verification.

At minimum:

`npm ci`
`npm run typecheck`
`npm test`
`npm run build:android`

Then appropriate Gradle commands:

Windows:
`.\gradlew.bat :app:testDebugUnitTest --no-daemon`
`.\gradlew.bat :app:lintDebug --no-daemon`
`.\gradlew.bat :app:assembleDebug --no-daemon`
`.\gradlew.bat :app:assembleRelease --no-daemon`

Use the repository's real tasks if naming differs.

Every failure must be investigated and fixed.

Record REAL test counts.

------------------------------------------------------------
7H. ANDROID RELEASE APK
------------------------------------------------------------

Verify:

`versionName = "1.0.0"`

and appropriate V1 `versionCode`.

Use the established release signing identity if available.

Never commit:
- `.jks`
- keystore
- passwords
- secret environment variables

Do NOT create a throwaway permanent identity if a real one is expected.

Produce:

- debug APK
- signed release APK if signing environment exists

Record paths.

If ADB hardware/emulator is connected:

install the APK,
launch,
verify startup,
host a room,
verify WebView/server connection,
and perform available device smoke tests.

============================================================
8. CLEAN BOTH ACTIVE BRANCHES
============================================================

After functionality is complete, perform branch-specific cleanup.

For both:

`main`

and:

`v1-web-cloudflare-ready`

audit:

- unused source
- obsolete migration scripts
- stale comments
- duplicate files
- old reports
- obsolete deployment configs
- tracked generated output
- dead tests
- accidental archives
- temporary debug code

Do NOT remove something merely because it looks old.

Prove it is unused first.

Use search/references/build/tests before deletion.

The target is small, understandable V1 source trees.

============================================================
9. DOCUMENTATION MUST MATCH REALITY
============================================================

Current documentation may contain outdated Node/LAN assumptions.

Rewrite documentation AFTER code/testing.

ANDROID `main` docs must state:

- Android host phone is authoritative server
- Kotlin WebSocket server
- same-Wi-Fi guests
- internet not required
- no laptop required
- actual test counts
- actual build commands

CLOUDFLARE docs must state:

- online hosted web application
- Worker
- SQLite Durable Objects
- one room per DO
- WSS
- players may use different networks
- internet required
- deployment process
- real deployed URL where available
- real tests

Do not copy stale counts.

Do not write PASS if not executed.

============================================================
10. FINAL CROSS-BRANCH PARITY AUDIT
============================================================

Once both active branches are green, compare the actual game behavior again.

Cloudflare Web and Android must agree on:

- tournament scheduling
- scoring
- ties
- VOID
- disconnects
- bets
- rankings
- finalists
- championship
- podium
- limits
- reconnect semantics

Networking is intentionally different.

Game rules must not accidentally diverge.

If divergence is deliberate, document why.

============================================================
11. FINAL ENVIRONMENT CLEANUP
============================================================

Return to the canonical repository root.

Confirm there are no accidental nested repositories.

Confirm no obsolete folder like:

`BET-BRAWL-Cloudflare/`

remains IF it was only a duplicate copy.

Confirm obsolete ZIP snapshots are gone IF Git fully supersedes them.

Confirm:

`git status`

is clean on each finished branch after commits.

Run:

`git worktree list`
`git worktree prune`

where appropriate.

Check:

`git fsck`

if useful.

Do NOT run aggressive GC/pruning that risks recoverability during the release task.

============================================================
12. FINAL V1 GATE
============================================================

DO NOT call V1 finished unless ALL appropriate gates below are green.

================
CLOUDFLARE WEB
================

[ ] clean install
[ ] typecheck
[ ] TS tests
[ ] Worker tests
[ ] Durable Object integration tests
[ ] production build
[ ] Wrangler typecheck
[ ] Wrangler dry-run
[ ] full qualifier progression
[ ] championship progression
[ ] reconnect
[ ] bets
[ ] VOID
[ ] room isolation
[ ] deployed HTTPS site
[ ] deployed WSS
[ ] public multi-client smoke test
[ ] online-specific UI wording correct
[ ] QR public join works
[ ] CI green

================
ANDROID
================

[ ] clean JS install
[ ] TS typecheck
[ ] TS tests
[ ] Android server integration tournament test
[ ] Kotlin unit tests
[ ] lint
[ ] frontend build
[ ] Android asset sync
[ ] debug build
[ ] release build
[ ] release signing where environment exists
[ ] qualifier double-completion bug fixed
[ ] LAN discovery verified
[ ] QR/deep-link behavior verified
[ ] reconnect logic verified
[ ] HostService verified
[ ] CI green

================
REPOSITORY
================

[ ] one canonical repository
[ ] no nested branch clone
[ ] no unnecessary ZIP snapshots
[ ] no secrets
[ ] no generated junk tracked
[ ] `.gitignore` correct
[ ] branch docs correct
[ ] clean git status

============================================================
13. FROZEN `v1-web-final` RETIREMENT PROCEDURE
============================================================

Once BOTH modern targets pass every available V1 gate:

DO NOT immediately delete the frozen branch.

First perform one final comparison against:

`v1-web-final`

Determine whether it contains ANY:

- unique source
- tests
- docs worth preserving
- behavior not implemented in the new targets
- release information
- Git tag/reference we still need

If anything valuable exists:
port/archive it appropriately first.

Then report:

`v1-web-final is safe to retire: YES/NO`

If YES:

show me:
- frozen branch SHA
- replacement Cloudflare SHA
- replacement Android SHA
- reason it is safe to delete
- any relevant Git tags that preserve historical V1

THEN STOP AND WAIT FOR MY EXPLICIT CONFIRMATION.

Only AFTER I explicitly approve deletion may you remove:

local:
`git branch -D v1-web-final`

remote, if it exists:
`git push origin --delete v1-web-final`

Before deletion, preferably preserve historical provenance with an immutable tag if no suitable tag already exists, for example:

`legacy-web-v1-final`

BUT do not create unnecessary tags blindly.
Inspect existing tags first.

Never delete the branch while either replacement is uncertain.

============================================================
14. GIT STRATEGY
============================================================

Make logical commits.

Do NOT:

- force-push
- rewrite shared history unnecessarily
- commit secrets
- commit `node_modules`
- commit normal build outputs
- commit random APKs/ZIPs as source
- blindly merge Android into Cloudflare
- blindly merge Cloudflare into Android
- delete the frozen branch early
- delete unique nested work
- fake verification results

Push finished commits if credentials/remote access permit.

============================================================
15. FINAL REPORT
============================================================

When the work is complete, give me ONE detailed final report.

Use these sections:

1. REPOSITORY CLEANUP
   - what duplicate/nested folders existed
   - whether they were repos/clones/worktrees
   - what was removed
   - what was preserved
   - `.gitignore` fixes
   - final canonical structure

2. CLOUDFLARE WEB
   - branch
   - final SHA
   - bugs fixed
   - files changed
   - tests
   - build
   - deployment
   - deployed URL
   - remote smoke test

3. ANDROID
   - branch
   - final SHA
   - bugs fixed
   - qualifier bug explanation
   - server integration coverage
   - Kotlin test count
   - TS test count
   - lint
   - APK paths
   - signing state
   - hardware smoke tests

4. CROSS-PLATFORM PARITY
   - important behavior comparison
   - any intentional differences

5. CI
   - workflows changed
   - results

6. DOCUMENTATION
   - files corrected
   - stale claims removed

7. REMAINING BLOCKERS
   Only real external blockers such as:
   - missing Cloudflare credentials
   - no Android device attached
   - missing release signing secrets

8. V1 VERDICT

Give exactly one:

GREEN
GREEN EXCEPT EXTERNAL BLOCKER
NOT READY

Explain why.

9. OLD BRANCH RETIREMENT

State:

`v1-web-final safe to retire: YES/NO`

If YES, provide the exact deletion commands BUT DO NOT execute them until I explicitly approve.

============================================================
FINAL PRINCIPLE
============================================================

By the end of this task I want:

ONE clean repository.

TWO maintained V1 targets:

`main`
= Android local/LAN V1

`v1-web-cloudflare-ready`
= Cloudflare online Web V1

ZERO confusing nested project copies.

ZERO ZIP files pretending to be branches.

ZERO stale architecture documentation.

ZERO hidden known tournament bugs.

And once I personally confirm that both modern V1 targets are green:

the old frozen `v1-web-final` branch can be retired.