# Cloudflare V1 architecture

Production is browser HTTPS/WSS → Worker `/ws?room=CODE` → deterministic room-code Durable Object. `wrangler.jsonc` declares `BrawlRoom` with SQLite storage and serves the Vite static asset directory. The Worker exposes `/api/network-info` with `online: true`; the UI uses a cloud/LAN mode signal and public invite URLs.

`worker/index.ts` is the platform adapter; `worker/roomCore.ts` owns persisted room state, hibernating WebSocket attachments and durable alarm events. The authoritative TypeScript engine is shared with `server.ts`, which remains a local Node reference. Exact qualifier completion lives in `src/engine/roomEngine.ts` and rejects wrong/replayed match identity.

A replacement socket revokes the old attachment before closure. Only a current open connection has seat authority. Pre-start absent seats never enter the frozen tournament roster; roster fighters who disconnect later retain their scheduled appearances and get grace/forfeit or VOID.

No Android bridge, NSD/UDP discovery, brawl:// guest route, LAN host assumptions or Node production server are introduced into the cloud path. Platform networking intentionally differs from Android; game rules must agree.

The frozen reference remains at `v1-web-final` / tag `v1.0.0-web-final`. Retirement is not part of this implementation and still requires explicit owner confirmation after manual acceptance.

See README for exact verification/deployment commands. Live deployment/public acceptance is owner follow-up, not claimed by local tests.
