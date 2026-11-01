# V2 verification

Run npm ci, npm run lint and npm run cf:verify on the exact production source. The combined gate includes:

- Shared TypeScript typecheck and engine, odds, room, Node multiplayer, payout and client-reconciliation regressions.
- Worker authoritative handler tests, including V1 activeRoom restoration.
- Vite production build, Worker typecheck and Wrangler deployment dry-run.
- Actual local Wrangler/SQLite/WebSocket tournament, room isolation, replay/privacy, reconnect and restart/pending-deadline verification.

Browser verification uses real Chrome at 360×640, 390×844, 768×1024 and 1366×768 with touch/mouse, fighter/spectator/finished states, focus/reduced motion/orientation, plus delayed Circuit confirmation, rejects, Memory reconnect, stale action errors, allocation presets/sliders, Mirror reveal and collapsed payout. Evidence is under ignored artifacts/v2/ and output/playwright/ in the canonical checkout. Browser automation requires an existing Playwright runtime and Chrome; it is separate from the Worker suite.

Run a local Vite server with `npm exec vite -- --host 127.0.0.1 --port 5175 --strictPort`, then `npm run test:browser`. If Playwright is provided by an external runtime, set BRAWL_PLAYWRIGHT_MODULE to its absolute package.json path; set BRAWL_CHROME_EXECUTABLE to an existing Chrome executable. Otherwise the runner uses locally installed Playwright and its Chromium. CI installs pinned Playwright 1.62.1 as isolated test tooling and runs both browser scripts after the full Worker gate. No browser dependency ships in the game bundle.

After deployment verify the actual HTTPS site and public WSS using at least three isolated clients: create/join, ready/start tournament, launch games, perform accepted actions, reconnect with the same seat, finish, verify payout and advance. Check visible BET & BRAWL V2 and /api/network-info version 2.0.0/protocolVersion 2. Keep local, CI and public evidence distinct. Current exact results and identifiers belong in docs/V2_RELEASE.md and CODEX_WORKLOG.md.
