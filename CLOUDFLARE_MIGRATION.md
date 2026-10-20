# Cloudflare backend migration (not deployed)

BET & BRAWL Web V1's Node/Express/WebSocket backend is preserved in `server.ts` as the original local/LAN reference implementation. Its authoritative shared game, tournament, betting, odds and mini-game engines are also unchanged.

The online backend is additive:

- `worker/index.ts` — Cloudflare Worker gateway + official `DurableObject` runtime adapter.
- `worker/roomCore.ts` — authoritative Durable Object multiplayer implementation.
- `wrangler.jsonc` — static assets + Worker + SQLite-backed Durable Object configuration.
- `worker/BrawlRoom.test.ts` — deterministic Durable Object core tests.
- `scripts/cloudflare-multiplayer.test.ts` — real local Wrangler/WebSocket integration harness (no deployment).
- `tsconfig.worker.json` / `worker/cloudflare-runtime.d.ts` — Worker-specific type checking.

## Architecture

Every room code maps to its own `BrawlRoom` Durable Object. This removes the original Node process limitation of one active room while preserving the existing client/server message protocol and V1 gameplay rules.

The Durable Object persists the authoritative room state and uses Cloudflare alarms for reveal, betting, countdown, game deadlines, bot actions, fighter disconnect grace, host disconnect grace and stale lobby-seat cleanup. WebSockets use the hibernation API (`ctx.acceptWebSocket`) and serialized attachments so the room can be evicted and recreated without losing player/session bindings.

The browser still talks to `/api/network-info` and `/ws`. The only routing-specific client change is that `/ws` includes the room code in the query string so Cloudflare can select the correct Durable Object before accepting the socket. The original Node server ignores that query string and continues to work as before.

For Cloudflare hosting, a host route code is generated before `CREATE_ROOM` so the first socket can be routed. It remains a short uppercase room code and does not alter game rules or the WebSocket protocol.

## Commands

- `npm run verify` — Node V1 typecheck/tests, Durable Object core tests, frontend build and Worker typecheck.
- `npm run cf:dry-run` — build frontend and ask Wrangler to produce a deployment bundle without deploying.
- `npm run test:cloudflare` — build frontend, start Wrangler locally, then run real multi-client WebSocket integration tests against the local Worker/Durable Objects runtime.
- `npm run cf:verify` — full local verification: normal verification + Wrangler dry-run + Cloudflare multiplayer integration.
- `npm run cf:dev` — build and run the Cloudflare version locally.

## Deployment status

No Cloudflare deployment has been performed. When deployment is approved later, the declarative `exports` entry in `wrangler.jsonc` will provision the new SQLite-backed `BrawlRoom` Durable Object namespace.
