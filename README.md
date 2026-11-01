# BET & BRAWL V2

Play at **[bet-brawl.northstack-labs.workers.dev](https://bet-brawl.northstack-labs.workers.dev)**.

Production web version **2.0.0**, protocol **2**, with 14 games for 3–9 players. The eight V2 games are Memory Heist, Crowd Count, Mirror Trouble, Safecracker, Circuit Sprint, Split Decision, Treasure Tug and Pocket Territory. Tournament, betting, championship and bankroll rules are unchanged.

The production branch is `v2-web`. Cloudflare Worker **bet-brawl** serves React/Vite assets and authoritative SQLite Durable Objects over the same HTTPS/WSS origin. Internet is required; players can join from different networks. `server.ts` is the local Node/LAN reference, not the production backend. Android/LAN V2 is maintained on `main`; `v1` preserves the former V1 Android main.

[V2 release and verification](docs/V2_RELEASE.md), [deployment/storage notes](CLOUDFLARE_MIGRATION.md), [verification commands](CLOUDFLARE_VERIFICATION.md) and [worklog](CODEX_WORKLOG.md) distinguish observed results from pending gates.

## Play

Host a room and share its code, link or QR. Have at least three players join and mark ready, then start the tournament. Each player fights two qualifiers; the top two play a best-of-series championship requiring two decisive wins. Spectators bet privately. The host advances after payout. All clients must use V2; refresh an old V1 tab before joining.

Circuit rotations respond locally and reconcile with the server. Treasure allocation has sliders and a balanced preset, still requiring exactly ten energy. Mirror shows a one-second answer reveal after each four-second puzzle. Results keep your outcome and host continuation visible; expand **View details** for standings and full game results. Pocket Territory shows fighter avatars, names and weighted scores. The visible **BET & BRAWL V2** badge identifies this version.

## Verify

Use Node 22+ and the committed lockfile; Wrangler 4.151.1 is pinned locally.

```powershell
npm ci
npm run lint
npm run cf:verify
```

`cf:verify` runs shared tests/typecheck, Worker tests, build, Worker typecheck, deployment dry-run and actual local Wrangler/SQLite/WebSocket tournament/restart tests. See [browser verification](CLOUDFLARE_VERIFICATION.md) for touch/mouse and reconnect coverage. Production has no test timing variables.

## Deploy production

Deploy only after all required local, browser and exact-source CI checks are green:

```powershell
git switch v2-web
git pull --ff-only
npm ci
npm run lint
npm run cf:verify
npm exec wrangler whoami
npm run cf:deploy
```

Use the existing authenticated Cloudflare account. If login is needed, run `npm exec wrangler login` interactively; never put a token in source or chat. The committed configuration targets the existing **bet-brawl** Worker, keeping **BRAWL_ROOMS**, **BrawlRoom**, SQLite storage and room-code routing. Do not deploy another Worker name, recreate the namespace, or enable test variables in production. Record Wrangler's actual URL/version, then run the public multi-client smoke in the release report.

## Preserved V1 history

V1 is historical and recoverable: `v1-web-cloudflare-ready` at `a60a79d007b6c93acb49d49483b9f1c343f76d76`, `v1-web-final` at `e1f948c6c6e46355435fd70ea9ab8ee63031ebea`, and tag `v1.0.0-web-final`. The former Android/LAN main is `2ee6d66f4ecd49a66bf31530413919d550055f11`; preserved as tag `v1.0.0-pre-v2-main`. The online V1 source also has tag `v1.0.0-production-web`. These histories must not be deleted or rewritten. Historical V1 reports are not current deployment instructions.

Natural Earth map geometry used by Blind Pinpoint is public domain.
