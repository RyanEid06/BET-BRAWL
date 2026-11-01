# V2 production deployment and storage

Production branch: v2-web. Production Worker/site: bet-brawl. React/Vite assets, /api/network-info and /ws share one public HTTPS origin; room-code routing uses BRAWL_ROOMS.idFromName(code). BrawlRoom keeps SQLite storage and the activeRoom key. The Worker name, exported class, binding and storage type match V1; there is no namespace recreation or destructive data migration.

V2 adds optional tournamentId, gameBag and v2ActionIds fields plus per-game state. A synthetic V1 snapshot regression verifies seat identity, bankroll, private bet and schedule retention after restore, exactly-once timeout settlement, and a valid V2 next round. Runtime tests verify SQLite restart and pending alarms. No production data is exported into tests.

V2 requires protocol 2. Existing V1 tabs must refresh; old unscoped fighter actions are rejected. Stored V1 rounds retain their data and can settle from existing alarms; reconnecting V2 clients can resume, and the next round gains current match identity. Do not promise seamless operation of an already-open V1 client during upgrade.

V1 remains recoverable in the preserved history branches/tags. Before deployment record the currently active Cloudflare version. Rollback changes Worker code/assets, not stored data: do not assume older V1 code can interpret an in-progress V2 game. Prefer roll-forward; if rollback is required, use the recorded V1 version during a quiet room boundary and preserve the storage namespace. See [Cloudflare rollback limitations](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

Deployment never runs automatically in CI. Follow README only after all gates pass, then record the deployed version, actual production URL and public smoke evidence in docs/V2_RELEASE.md.
