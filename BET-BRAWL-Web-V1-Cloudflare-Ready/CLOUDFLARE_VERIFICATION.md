# Cloudflare migration verification

Status: **implemented, not deployed**.

## Preserved V1 reference

The original source bundle included a duplicate release ZIP containing the V1 source. The following important files in the migrated tree are byte-for-byte identical to that embedded V1 reference:

- `server.ts` — SHA-256 `ab276ead5d822ef12544084f956bac2e92635833fe786afa78f5aba9cf450e02`
- `src/engine/types.ts` — SHA-256 `c22b3bc3794ce13f7b0c1104fab1eded875504fd4d4a1db37be7b1b012ea661c`
- `src/engine/roomEngine.ts` — SHA-256 `4663119094df5ea3d5986661a81c4aa58a55b40e0f3d6c6503fa66c2ccafd20f`
- `src/engine/odds.ts` — SHA-256 `7b9660c881bc9a3881e6416bbdcb500f1698720a3618fdaeecd78bc85b7bd39d`
- `src/engine/gameEngine.ts` — SHA-256 `fb7e2656fc50766b7a28ee8d27ff72857712d128be172e8b9001afcc76aa6283`

The duplicate `BET-BRAWL-v1.0.0.zip` is intentionally omitted from the final source ZIP because it is not needed at runtime or for the preserved Node reference; `server.ts` and the original source files remain directly in the repository.

## Tests executed in this workspace

- Existing pure V1 engine/network tests: **46/46 passed**.
- Durable Object core suite: **4/4 passed**.
  - independent room isolation
  - persistent room state across object re-instantiation
  - ready/start authorization and gating
  - secret betting visibility before/after recap
  - alarm-driven phase progression and payout resolution
  - reconnect seat reuse / stale socket protection
  - disconnected lobby-seat expiry
  - active fighter disconnect forfeit
- Worker/core strict TypeScript check using sandbox runtime stubs: **passed**.
- Parse/emit check across `server.ts`, all `src/**/*.ts(x)`, `worker/**/*.ts`, and `scripts/**/*.ts`: **passed**.
- `package.json` dependency/devDependency/engine declarations still match the existing `package-lock.json`: **passed**.

## Runtime integration test included but not executed here

`scripts/cloudflare-multiplayer.test.ts` starts Wrangler locally and exercises the actual Worker + Durable Object runtime with multiple WebSocket clients, two simultaneous isolated rooms, host authorization, ready gating, betting privacy, payout, reconnect and room closure.

This sandbox could not download npm packages from `registry.npmjs.org` (DNS/network access was unavailable), so `npm ci`, the Vite production build, `wrangler dev`, and `wrangler deploy --dry-run` could not be run here. No production deployment was attempted.

Before the real deployment, run:

```bash
npm ci
npm run cf:verify
```

A passing `cf:verify` is the final local runtime gate before `wrangler deploy`.
