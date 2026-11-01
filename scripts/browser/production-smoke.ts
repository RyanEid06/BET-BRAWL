/** Explicit public smoke: creates one synthetic three-client room, then closes only that room. */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const origin = new URL(process.argv[2]).origin;
assert.ok(origin.startsWith('https://'), 'Supply the exact public HTTPS production URL');
const require = createRequire(process.env.BRAWL_PLAYWRIGHT_MODULE || import.meta.url);
const { chromium } = require('playwright');
const info = await fetch(`${origin}/api/network-info`).then(r => r.json()) as any;
assert.equal(info.version, '2.0.0'); assert.equal(info.protocolVersion, 2); assert.equal(info.online, true);
mkdirSync('output/playwright', { recursive: true });
const report: any = { origin, version: info.version, roomsCreated: 0, rounds: [], errors: [] };
const browser = await chromium.launch({ executablePath: process.env.BRAWL_CHROME_EXECUTABLE, headless: true });
const clients: any[] = [];
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function wait(check: () => boolean, timeout = 60000) {
  const end = Date.now() + timeout;
  while (!check()) { if (Date.now() > end) throw Error('Public smoke condition timed out'); await pause(100); }
}
function progress(message: string) { console.log(`${new Date().toISOString()} ${message}`); }
try {
  for (let index = 0; index < 3; index++) {
    const context = await browser.newContext({ viewport: index === 0 ? { width: 1366, height: 768 } : { width: 390, height: 844 }, hasTouch: index > 0 });
    await context.addInitScript(() => {
      const NativeSocket = window.WebSocket;
      (window as any).__smokeSockets = [];
      window.WebSocket = class extends NativeSocket { constructor(url: string | URL, protocols?: string | string[]) { super(url, protocols); (window as any).__smokeSockets.push(this); } };
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const client: any = { context, page, id: null, joins: 0, state: null, accepted: 0, rejected: 0 }; clients.push(client);
    page.on('pageerror', (error: any) => report.errors.push(String(error)));
    page.on('websocket', (socket: any) => socket.on('framereceived', (frame: any) => {
      const message = JSON.parse(frame.payload);
      if (message.type === 'JOIN_SUCCESS') { client.id = message.payload.player.id; client.joins++; }
      if (message.type === 'ROOM_STATE') client.state = message.payload;
      if (message.type === 'GAME_ACTION_RESULT') client[message.payload.accepted ? 'accepted' : 'rejected']++;
      if (message.type === 'JOIN_ERROR') report.errors.push(`Client ${index}: ${message.payload.code}`);
    }));
    await page.goto(index ? `${origin}/?room=${clients[0].state.roomCode}` : origin);
    await page.getByText('BET & BRAWL V2', { exact: true }).waitFor();
    await page.getByLabel('YOUR NAME / ALIAS').fill(`V2 Smoke ${index === 0 ? 'Host' : `Guest ${index}`}`);
    if (index === 0) { await page.getByRole('button', { name: 'HOST NEW GAME', exact: true }).click(); report.roomsCreated++; }
    else {
      if (!(await page.getByLabel('ENTER ROOM CODE').count())) await page.getByRole('button', { name: 'JOIN GAME WITH CODE', exact: true }).click();
      await page.getByLabel('ENTER ROOM CODE').fill(clients[0].state.roomCode);
      await page.getByRole('button', { name: 'JOIN ROOM', exact: true }).click();
    }
    await wait(() => client.id && client.state?.phase === 'LOBBY', 20000);
    if (index) await page.getByRole('button', { name: 'SET READY', exact: true }).click();
  }
  const host = clients[0];
  await wait(() => host.state.players.length === 3 && host.state.players.every((p: any) => p.isReady || p.isHost));
  await host.page.screenshot({ path: 'output/playwright/production-lobby.png', fullPage: true });
  await host.page.getByRole('button', { name: 'START BRAWL MATCH!', exact: true }).click();
  progress('Three isolated public clients joined and started tournament');
  let reconnected = false;
  for (let roundIndex = 0; roundIndex < 2; roundIndex++) {
    await wait(() => host.state.phase === 'MINIGAME_ACTIVE');
    const round = host.state.currentRound;
    const summary: any = { number: round.roundNumber, game: round.miniGame.id, matchId: round.matchId, actions: 0, payout: false };
    const fighters = clients.filter(c => round.fighterIds.includes(c.id));
    assert.equal(fighters.length, 2);
    if (!reconnected) {
      const client = fighters[0], id = client.id, joins = client.joins;
      await client.page.evaluate(() => (window as any).__smokeSockets.at(-1).close());
      await wait(() => client.joins > joins && client.state?.phase === 'MINIGAME_ACTIVE', 10000);
      assert.equal(client.id, id); reconnected = true;
      report.reconnect = { sameSeat: true, client: clients.indexOf(client) };
      progress(`Reconnected same fighter seat during ${summary.game}`);
    }
    const attempted = new Set<string>();
    const end = Date.now() + 45000;
    while (host.state.phase !== 'PAYOUT_RECAP') {
      assert.ok(Date.now() < end, 'Game did not finish at its production deadline');
      for (const fighter of fighters) {
        if (fighter.state?.phase !== 'MINIGAME_ACTIVE') continue;
        const state = fighter.state.currentRound.gameState || {}, mine = state.mine || {};
        const key = `${fighter.id}:${state.stageIndex ?? 0}:${state.phase}:${mine.history?.length ?? 0}`;
        if (attempted.has(key) || mine.locked || mine.solved) continue;
        const game = summary.game, page = fighter.page;
        let control: any;
        if (game === 'memory_heist' && state.phase === 'draft') control = page.getByRole('button', { name: 'Lock board', exact: true });
        if (game === 'crowd_count' && state.phase === 'answer') control = page.getByRole('button', { name: 'Lock estimate', exact: true });
        if (game === 'mirror_trouble' && state.phase === 'puzzle') control = page.getByRole('button', { name: /^Choice 1/ });
        if (game === 'safecracker' && state.phase === 'play') control = page.getByRole('button', { name: /^Submit guess/ });
        if (game === 'circuit_sprint' && state.phase === 'play') control = page.getByRole('button', { name: /^Row 1, column 1,/ });
        if (game === 'split_decision' && state.phase === 'commit') control = page.getByRole('button', { name: /^GUARD/ });
        if (game === 'treasure_tug' && state.phase === 'commit') { await page.getByRole('button', { name: 'Balanced 3 / 3 / 4', exact: true }).click(); control = page.getByRole('button', { name: /^Lock allocation/ }); }
        if (game === 'pocket_territory' && state.phase === 'commit') control = page.getByRole('button', { name: 'Pass this turn', exact: true });
        if (game === 'millisecond_stop') control = page.getByRole('button', { name: /^STOP/ });
        if (game === 'rapid_red_green') control = page.getByRole('button', { name: /TAP! TAP! TAP!/ });
        if (game === 'higher_lower') control = page.getByRole('button', { name: /^HIGHER/ });
        if (control && await control.count() && await control.isEnabled()) { await control.click(); attempted.add(key); summary.actions++; }
      }
      await pause(150);
    }
    await wait(() => clients.every(c => c.state?.phase === 'PAYOUT_RECAP'));
    for (const client of clients) {
      await client.page.getByText('YOUR ROUND OUTCOME', { exact: true }).waitFor();
      assert.equal(await client.page.locator('details').getAttribute('open'), null);
      assert.equal(client.state.currentRound.matchId, round.matchId);
    }
    summary.payout = true; summary.accepted = clients.reduce((n, c) => n + c.accepted, 0); summary.rejected = clients.reduce((n, c) => n + c.rejected, 0);
    report.rounds.push(summary); progress(`Public ${summary.game}: finish/payout confirmed`);
    await host.page.screenshot({ path: `output/playwright/production-payout-${roundIndex + 1}.png`, fullPage: true });
    const next = host.page.getByRole('button', { name: /PROCEED TO QUALIFIER|BEGIN CHAMPIONSHIP|PLAY CHAMPIONSHIP/ });
    await next.click(); await wait(() => host.state.currentRound?.matchId !== round.matchId);
    report.nextRound = true;
  }
  assert.equal(reconnected, true); assert.deepEqual(report.errors, []);
  report.pass = true;
} catch (error) { report.errors.push(String(error)); process.exitCode = 1; }
finally {
  if (clients[0]?.id) {
    await clients[0].page.evaluate(() => { const socket = (window as any).__smokeSockets?.at(-1); if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'CLOSE_ROOM' })); }).catch(() => {});
    report.testRoomCloseRequested = true;
  }
  await pause(300); await browser.close();
  writeFileSync('output/playwright/production-smoke.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
