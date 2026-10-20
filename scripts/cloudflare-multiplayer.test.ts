/**
 * Local integration test for the Cloudflare Workers + Durable Objects backend.
 * This starts Wrangler locally; it never deploys anything.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import type { PublicRoomState, ServerMessage } from '../src/engine/types.ts';

const port = 8799;
const baseUrl = `http://127.0.0.1:${port}`;

async function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/network-info`);
      if (res.ok) return;
    } catch {
      // server not ready yet
    }
    await delay(200);
  }
  throw new Error('Wrangler local server did not become ready');
}

async function createClient(roomCode: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?room=${encodeURIComponent(roomCode)}`);
  const received: ServerMessage[] = [];

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket open timeout')), 5000);
    ws.once('open', () => { clearTimeout(timer); resolve(); });
    ws.once('error', reject);
  });

  ws.on('message', data => {
    try { received.push(JSON.parse(data.toString()) as ServerMessage); } catch { /* ignore */ }
  });

  const waitFor = async (predicate: (m: ServerMessage) => boolean, timeoutMs = 5000): Promise<ServerMessage> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const match = received.find(predicate);
      if (match) return match;
      await delay(20);
    }
    throw new Error(`Timed out. Received: ${received.map(m => m.type).join(', ')}`);
  };

  const waitForType = <T extends ServerMessage['type']>(type: T, timeoutMs = 5000) =>
    waitFor(m => m.type === type, timeoutMs) as Promise<Extract<ServerMessage, { type: T }>>;

  const waitForState = (predicate: (state: PublicRoomState) => boolean, timeoutMs = 5000) =>
    waitFor(m => m.type === 'ROOM_STATE' && predicate(m.payload), timeoutMs) as Promise<Extract<ServerMessage, { type: 'ROOM_STATE' }>>;

  return { ws, received, waitForType, waitForState };
}

async function main() {
  const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const proc = spawn(npxBin, [
    '--yes', 'wrangler@4.151.1', 'dev', '--local', '--port', String(port), '--var', 'BRAWL_TEST_FAST:1', '--log-level', 'error',
  ], { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });

  let logs = '';
  proc.stdout?.on('data', chunk => { logs += chunk.toString(); });
  proc.stderr?.on('data', chunk => { logs += chunk.toString(); });

  const clients: Array<Awaited<ReturnType<typeof createClient>>> = [];
  try {
    await waitForServer();

    const info = await (await fetch(`${baseUrl}/api/network-info`)).json() as any;
    assert.equal(info.online, true);
    assert.equal(info.fullJoinUrl, baseUrl);

    // Room A: full multiplayer lifecycle.
    const roomA = 'A1B2C3';
    const host = await createClient(roomA); clients.push(host);
    host.ws.send(JSON.stringify({ type: 'CREATE_ROOM', payload: { playerName: 'Host', avatar: '⚡' } }));
    const hostJoin = await host.waitForType('JOIN_SUCCESS');
    assert.equal(hostJoin.payload.roomCode, roomA);
    assert.equal(hostJoin.payload.isHost, true);

    const p2 = await createClient(roomA); clients.push(p2);
    p2.ws.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { roomCode: roomA, playerName: 'P2', avatar: '🦊' } }));
    const p2Join = await p2.waitForType('JOIN_SUCCESS');

    const p3 = await createClient(roomA); clients.push(p3);
    p3.ws.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { roomCode: roomA, playerName: 'P3', avatar: '🐯' } }));
    await p3.waitForType('JOIN_SUCCESS');
    const lobby3 = await host.waitForState(s => s.players.length === 3);
    assert.ok(lobby3.payload.players.every(p => !('sessionToken' in p)));

    // Room B proves per-room Durable Object isolation.
    const roomB = 'Z9Y8X7';
    const otherHost = await createClient(roomB); clients.push(otherHost);
    otherHost.ws.send(JSON.stringify({ type: 'CREATE_ROOM', payload: { playerName: 'Other', avatar: '🎮' } }));
    const otherJoin = await otherHost.waitForType('JOIN_SUCCESS');
    assert.equal(otherJoin.payload.roomCode, roomB);
    const isolatedA = await host.waitForState(s => s.roomCode === roomA && s.players.length === 3);
    assert.equal(isolatedA.payload.players.some(p => p.name === 'Other'), false);

    // Non-host security and ready gate.
    p2.ws.send(JSON.stringify({ type: 'START_GAME' }));
    assert.equal((await p2.waitForType('JOIN_ERROR')).payload.code, 'NOT_HOST');
    host.ws.send(JSON.stringify({ type: 'START_GAME' }));
    assert.equal((await host.waitForType('JOIN_ERROR')).payload.code, 'NOT_ALL_READY');

    p2.ws.send(JSON.stringify({ type: 'TOGGLE_READY' }));
    p3.ws.send(JSON.stringify({ type: 'TOGGLE_READY' }));
    await host.waitForState(s => s.players.length === 3 && s.players.every(p => p.isHost || p.isReady));

    host.ws.send(JSON.stringify({ type: 'START_GAME' }));
    const reveal = await host.waitForState(s => s.phase === 'FIGHTER_REVEAL');
    const fighters = reveal.payload.currentRound!.fighterIds;
    const betting = await host.waitForState(s => s.phase === 'BETTING_WINDOW', 5000);
    assert.deepEqual(betting.payload.currentRound!.bets, []);

    const joins = [hostJoin, p2Join, await p3.waitForType('JOIN_SUCCESS')];
    const clientById = new Map([
      [hostJoin.payload.player.id, host],
      [p2Join.payload.player.id, p2],
      [joins[2].payload.player.id, p3],
    ]);
    const spectatorEntry = [...clientById.entries()].find(([id]) => !fighters.includes(id));
    assert.ok(spectatorEntry);
    const spectator = spectatorEntry![1];
    spectator.ws.send(JSON.stringify({ type: 'PLACE_BET', payload: { fighterId: fighters[0], amount: 100 } }));
    const accepted = await spectator.waitForType('BET_ACCEPTED');
    assert.equal(accepted.payload.bet.amount, 100);

    const active = await host.waitForState(s => s.phase === 'MINIGAME_ACTIVE', 5000);
    assert.deepEqual(active.payload.currentRound!.bets, []);
    const recap = await host.waitForState(s => s.phase === 'PAYOUT_RECAP', 5000);
    assert.ok(recap.payload.currentRound!.bets.length >= 1);
    assert.ok(recap.payload.currentRound!.payouts.length >= 1);

    // Reconnect uses the same session seat instead of duplicating a player.
    const reconnectCode = 'R4C5N6';
    const reconnectHost = await createClient(reconnectCode); clients.push(reconnectHost);
    reconnectHost.ws.send(JSON.stringify({ type: 'CREATE_ROOM', payload: { playerName: 'Reconnect', avatar: '🔁' } }));
    const firstJoin = await reconnectHost.waitForType('JOIN_SUCCESS');
    reconnectHost.ws.close();
    await delay(100);
    const replacement = await createClient(reconnectCode); clients.push(replacement);
    replacement.ws.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { roomCode: reconnectCode, sessionToken: firstJoin.payload.sessionToken } }));
    const rejoin = await replacement.waitForType('JOIN_SUCCESS');
    assert.equal(rejoin.payload.player.id, firstJoin.payload.player.id);
    const oneSeat = await replacement.waitForState(s => s.players.length === 1 && s.players[0].connected);
    assert.equal(oneSeat.payload.players[0].id, firstJoin.payload.player.id);

    host.ws.send(JSON.stringify({ type: 'CLOSE_ROOM' }));
    assert.equal((await p2.waitForType('ROOM_CLOSED')).payload.reason, 'The host closed the room.');

    console.log('Cloudflare multiplayer integration: PASS');
  } catch (err) {
    console.error(logs);
    throw err;
  } finally {
    for (const c of clients) {
      try { c.ws.close(); } catch { /* ignore */ }
    }
    proc.kill('SIGTERM');
    await delay(250);
    if (!proc.killed) proc.kill('SIGKILL');
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
