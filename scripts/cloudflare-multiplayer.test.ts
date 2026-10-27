/** Actual local Worker/SQLite Durable Object tests. Never deploys. */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { STABLE_HIGHER_LOWER_BANK } from '../src/engine/miniGamesCatalog.ts';
import type { ClientMessage, PublicRoomState, ServerMessage } from '../src/engine/types.ts';

let baseUrl = '';
const LEGACY_GAME_SEQUENCE = 'millisecond_stop,rapid_red_green,speed_math,millisecond_stop,rapid_red_green,speed_math,higher_lower';
type Join = Extract<ServerMessage, { type: 'JOIN_SUCCESS' }>['payload'];
interface Client {
  ws: WebSocket;
  received: ServerMessage[];
  send(message: ClientMessage): void;
  waitFor<T extends ServerMessage['type']>(type: T, predicate?: (m: Extract<ServerMessage, { type: T }>) => boolean,
    timeoutMs?: number): Promise<Extract<ServerMessage, { type: T }>>;
  state(predicate?: (state: PublicRoomState) => boolean, timeoutMs?: number): Promise<PublicRoomState>;
  latest(): PublicRoomState;
  sync(): Promise<PublicRoomState>;
}
const clients: Client[] = [];

async function connect(code: string): Promise<Client> {
  const ws = new WebSocket(`${baseUrl.replace('http:', 'ws:')}/ws?room=${code}`);
  const received: ServerMessage[] = [];
  ws.on('message', raw => received.push(JSON.parse(raw.toString()) as ServerMessage));
  ws.on('error', () => { /* open/wait failures report the operation */ });
  await Promise.race([once(ws, 'open'), delay(5000).then(() => { throw new Error('WebSocket open timeout'); })]);
  let cursor = 0;
  async function waitFor<T extends ServerMessage['type']>(type: T,
    predicate: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true, timeoutMs = 6000,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (let index = cursor; index < received.length; index++) {
        const message = received[index];
        if (message.type === type && predicate(message as Extract<ServerMessage, { type: T }>)) {
          cursor = index + 1;
          return message as Extract<ServerMessage, { type: T }>;
        }
      }
      await delay(10);
    }
    throw new Error(`Timed out waiting for ${type}: ${received.slice(cursor).map(m => m.type === 'JOIN_ERROR' ? `${m.type}:${m.payload.code}` : m.type).join(', ')}`);
  }
  const client: Client = {
    ws, received, waitFor,
    send(message: ClientMessage) {
      const versioned = message.type === 'CREATE_ROOM' || message.type === 'JOIN_ROOM'
        ? { ...message, payload: { ...message.payload, protocolVersion: 2 } } : message;
      if (versioned.type === 'FIGHTER_ACTION' && versioned.payload && typeof versioned.payload === 'object' && !Array.isArray(versioned.payload)) {
        const round = client.latest()?.currentRound;
        const payload = { matchId: round?.matchId, stageIndex: round?.gameState?.stageIndex ?? 0,
          actionId: crypto.randomUUID(), ...versioned.payload };
        ws.send(JSON.stringify({ ...versioned, payload }));
      } else ws.send(JSON.stringify(versioned));
    },
    async state(predicate: (state: PublicRoomState) => boolean = () => true, timeoutMs = 6000) {
      return (await waitFor('ROOM_STATE', m => predicate(m.payload), timeoutMs)).payload;
    },
    latest() { return [...received].reverse().find(m => m.type === 'ROOM_STATE')?.payload as PublicRoomState; },
    async sync() {
      const marker = Date.now() + Math.random();
      client.send({ type: 'PING', payload: { clientSentAt: marker } });
      await waitFor('PONG', m => m.payload.clientSentAt === marker);
      return client.latest();
    },
  };
  clients.push(client);
  return client;
}

async function join(code: string, playerName: string, host = false) {
  const client = await connect(code);
  client.send(host ? { type: 'CREATE_ROOM', payload: { playerName } }
    : { type: 'JOIN_ROOM', payload: { roomCode: code, playerName } });
  return { client, seat: (await client.waitFor('JOIN_SUCCESS')).payload };
}

async function resume(code: string, seat: Join) {
  const client = await connect(code);
  client.send({ type: 'JOIN_ROOM', payload: { roomCode: code, sessionToken: seat.sessionToken } });
  const recovered = (await client.waitFor('JOIN_SUCCESS')).payload;
  assert.equal(recovered.player.id, seat.player.id);
  assert.equal(recovered.sessionToken, seat.sessionToken);
  return client;
}

async function close(client: Client) {
  if (client.ws.readyState === WebSocket.CLOSED) return;
  const closed = once(client.ws, 'close');
  client.ws.close();
  await Promise.race([closed, delay(2000).then(() => { throw new Error('Server did not complete WebSocket close handshake within 2 seconds'); })]);
}

async function readyStart(code: string) {
  const host = await join(code, 'Host', true);
  const guests = [await join(code, 'P2'), await join(code, 'P3')];
  for (const guest of guests) guest.client.send({ type: 'TOGGLE_READY' });
  await host.client.state(s => s.players.length === 3 && s.players.every(p => p.isHost || p.isReady));
  host.client.send({ type: 'START_GAME' });
  await host.client.state(s => s.phase === 'FIGHTER_REVEAL');
  return { host, guests, seats: [host, ...guests] };
}

function qualifierStats(state: PublicRoomState) {
  return state.players.map(p => ({ id: p.id, points: p.qualifierPoints, wins: p.qualifierWins,
    ties: p.qualifierTies, losses: p.qualifierLosses, played: p.qualifierMatchesPlayed, rank: p.tournamentRank }));
}

async function tournament() {
  const { host, guests, seats } = await readyStart('TOUR01');
  const byId = new Map(seats.map(s => [s.seat.player.id, s.client]));
  const outsider = await connect('TOUR01');
  outsider.send({ type: 'CLOSE_ROOM' });
  guests[0].client.send({ type: 'CLOSE_ROOM' });
  assert.equal((await host.client.sync()).phase, 'FIGHTER_REVEAL');
  let recap: PublicRoomState;
  for (let q = 1; q <= 3; q++) {
    const betting = await host.client.state(s => s.phase === 'BETTING_WINDOW' && s.currentRound?.roundNumber === q);
    const round = betting.currentRound!;
    const bettor = seats.find(s => !round.fighterIds.includes(s.seat.player.id))!.client;
    bettor.send({ type: 'PLACE_BET', payload: { fighterId: round.fighterIds[0], amount: 100 } });
    await bettor.waitFor('BET_ACCEPTED');
    assert.deepEqual((await host.client.sync()).currentRound!.bets, []);
    for (const seat of seats) assert.ok(seat.client.received.every(m => m.type !== 'ROOM_STATE'
      || m.payload.players.every(p => !('sessionToken' in p))));
    const active = await host.client.state(s => s.phase === 'MINIGAME_ACTIVE' && s.currentRound?.roundNumber === q);
    assert.deepEqual(active.currentRound!.bets, []);
    byId.get(round.fighterIds[0])!.send({ type: 'FIGHTER_ACTION', payload: null as any });
    bettor.send({ type: 'PLACE_BET', payload: { fighterId: round.fighterIds[0], amount: 1 } });
    await bettor.waitFor('BET_REJECTED');
    recap = await host.client.state(s => s.phase === 'PAYOUT_RECAP' && s.currentRound?.roundNumber === q);
    assert.equal(recap.currentRound!.resolutionReason, 'TIE');
    assert.equal(recap.tournamentSchedule!.qualifiersCompleted, q);
    assert.deepEqual(recap.tournamentSchedule!.matches.map(m => m.completed), [q >= 1, q >= 2, q >= 3]);
    assert.equal(recap.currentRound!.bets.length, 1);
    assert.equal(recap.currentRound!.payouts.find(p => p.type === 'BET_REFUND')!.stake, 100);
    host.client.send({ type: 'NEXT_ROUND' });
  }
  const frozen = qualifierStats(recap!);
  for (const p of frozen) { assert.equal(p.points, 2); assert.equal(p.played, 2); assert.equal(p.ties, 2); }
  const championship = await host.client.state(s => s.currentRound?.isChampionship === true);
  const finalists = championship.tournamentSchedule!.finalists!;
  assert.deepEqual(finalists, [...recap!.players].sort((a, b) => a.tournamentRank! - b.tournamentRank!).slice(0, 2).map(p => p.id));
  const opponents = new Map<string, Set<string>>();
  for (const match of recap!.tournamentSchedule!.matches) for (const id of match.fighterIds) {
    if (!opponents.has(id)) opponents.set(id, new Set());
    opponents.get(id)!.add(match.fighterIds.find(other => other !== id)!);
  }
  assert.ok([...opponents.values()].every(ids => ids.size === 2));
  for (let game = 1; game <= 4; game++) {
    const active = await host.client.state(s => s.phase === 'MINIGAME_ACTIVE' && s.currentRound?.championshipGameNumber === game);
    const round = active.currentRound!;
    assert.deepEqual(round.fighterIds, finalists);
    if (game === 1) {
      assert.equal(round.miniGame.id, 'millisecond_stop');
      await delay(30);
      const fighter = byId.get(finalists[0])!;
      fighter.send({ type: 'FIGHTER_ACTION', payload: { type: 'STOP', matchId: 'previous-match', actionId: 'legacy-stale' } });
      assert.equal((await fighter.waitFor('GAME_ACTION_RESULT', m => m.payload.actionId === 'legacy-stale')).payload.accepted, false);
      const action = { type: 'FIGHTER_ACTION', payload: { type: 'STOP', actionId: 'legacy-once' } } satisfies ClientMessage;
      fighter.send(action);
      assert.equal((await fighter.waitFor('GAME_ACTION_RESULT', m => m.payload.actionId === 'legacy-once')).payload.accepted, true);
      const score = (await fighter.sync()).currentRound!.fighterScores[finalists[0]];
      fighter.send(action);
      assert.equal((await fighter.waitFor('GAME_ACTION_RESULT', m => m.payload.actionId === 'legacy-once')).payload.accepted, true);
      assert.equal((await fighter.sync()).currentRound!.fighterScores[finalists[0]], score, 'legacy retry must retain the accepted result');
    } else if (game === 3) {
      assert.equal(round.miniGame.id, 'speed_math');
      const q = (round.gameConfig!.questions as Array<{ q: string }>)[0].q;
      const [, left, op, right] = /^(\d+) ([+×-]) (\d+)$/.exec(q)!;
      const answer = op === '+' ? +left + +right : op === '-' ? +left - +right : +left * +right;
      byId.get(finalists[1])!.send({ type: 'FIGHTER_ACTION', payload: { type: 'ANSWER', questionIndex: 0, answer } });
    } else if (game === 4) {
      assert.equal(round.miniGame.id, 'higher_lower');
      const card = (round.gameConfig!.cards as Array<{ baseItem: string; challengerItem: string }>)[0];
      const known = STABLE_HIGHER_LOWER_BANK.find(c => c.baseItem === card.baseItem && c.challengerItem === card.challengerItem)!;
      byId.get(finalists[0])!.send({ type: 'FIGHTER_ACTION', payload: { type: 'GUESS', questionIndex: 0, guess: known.isHigher ? 'HIGHER' : 'LOWER' } });
    }
    recap = await host.client.state(s => s.phase === 'PAYOUT_RECAP' && s.currentRound?.championshipGameNumber === game);
    assert.deepEqual(qualifierStats(recap), frozen, 'championship preserves qualifier scores and ranks');
    assert.deepEqual(recap.tournamentSchedule!.finalists, finalists);
    const wins = recap.tournamentSchedule!.championshipWins;
    assert.equal(wins[finalists[0]], game === 4 ? 2 : 1);
    assert.equal(wins[finalists[1]], game >= 3 ? 1 : 0);
    assert.equal(recap.currentRound!.tieResult, game === 2);
    host.client.send({ type: 'NEXT_ROUND' });
  }
  const podium = await host.client.state(s => s.phase === 'FINAL_PODIUM');
  assert.equal(podium.tournamentSchedule!.championId, finalists[0]);
  assert.equal(podium.tournamentSchedule!.runnerUpId, finalists[1]);
  assert.equal(podium.tournamentSchedule!.thirdPlaceId, podium.players.find(p => !finalists.includes(p.id))!.id);
  console.log('Wrangler: full qualifiers, private bets/deadlines, championship 2–1 with tie, podium PASS');
  return { host, podium };
}

async function v2ProtocolAndPrivacy(restart: () => Promise<void>) {
  const { host, seats } = await readyStart('V2SAFE');
  const active = await host.client.state(s => s.phase === 'MINIGAME_ACTIVE');
  const round = active.currentRound!;
  assert.equal(round.miniGame.id, 'safecracker');
  assert.ok(round.matchId);
  assert.doesNotMatch(JSON.stringify(round), /"secret"\s*:/);
  const fighter = seats.find(s => s.seat.player.id === round.fighterIds[0])!;
  const opponent = seats.find(s => s.seat.player.id === round.fighterIds[1])!;
  const spectator = seats.find(s => !round.fighterIds.includes(s.seat.player.id))!;
  const stageIndex = Number(round.gameState!.stageIndex);
  const actionId = 'v2-safecracker-1';
  const validAction = { type: 'FIGHTER_ACTION', payload: {
    type: 'CODE_GUESS', symbols: [0, 0, 0], matchId: round.matchId!, stageIndex, actionId,
  } } satisfies ClientMessage;
  fighter.client.send(validAction);
  assert.equal((await fighter.client.waitFor('GAME_ACTION_RESULT', m => m.payload.actionId === actionId)).payload.accepted, true);
  const own = await fighter.client.sync();
  assert.equal((own.currentRound!.gameState!.mine as { history: unknown[] }).history.length, 1);
  for (const client of [opponent.client, spectator.client]) {
    const view = await client.sync();
    assert.doesNotMatch(JSON.stringify(view.currentRound), /"secret"\s*:/);
    assert.deepEqual((view.currentRound!.gameState!.mine as { history: unknown[] } | undefined)?.history ?? [], []);
    assert.equal(JSON.stringify(view.currentRound).includes('"symbols":[0,0,0]'), false);
  }
  fighter.client.send(validAction);
  assert.equal((await fighter.client.waitFor('GAME_ACTION_RESULT', m => m.payload.actionId === actionId)).payload.accepted, true);
  assert.equal(((await fighter.client.sync()).currentRound!.gameState!.mine as { history: unknown[] }).history.length, 1);
  fighter.client.send({ type: 'FIGHTER_ACTION', payload: { ...validAction.payload,
    matchId: 'stale-match', actionId: 'v2-stale-1' } });
  assert.equal((await fighter.client.waitFor('GAME_ACTION_RESULT', m => m.payload.actionId === 'v2-stale-1')).payload.accepted, false);
  await restart();
  for (const seat of seats) seat.client = await resume('V2SAFE', seat.seat);
  const recovered = await fighter.client.sync();
  assert.equal(recovered.currentRound!.gameStartsAt, round.gameStartsAt);
  assert.equal(recovered.currentRound!.gameEndsAt, round.gameEndsAt);
  assert.equal((recovered.currentRound!.gameState!.mine as { history: unknown[] }).history.length, 1);
  assert.equal((await spectator.client.sync()).currentRound!.gameState!.mine, undefined);
  const recap = await host.client.state(s => s.phase === 'PAYOUT_RECAP', 35000);
  assert.equal(recap.currentRound!.matchId, round.matchId);
  assert.equal(recap.tournamentSchedule!.qualifiersCompleted, 1);
  host.client.send({ type: 'CLOSE_ROOM' });
  console.log('Wrangler: V2 accepted/duplicate/stale actions, owner-only feedback, settled deadline PASS');
}

async function authorityAndCapacity() {
  const host = await join('AUTH01', 'Host', true);
  host.client.send({ type: 'START_GAME' });
  assert.equal((await host.client.waitFor('JOIN_ERROR')).payload.code, 'NOT_ENOUGH_PLAYERS');
  const guests: Awaited<ReturnType<typeof join>>[] = [];
  for (let i = 0; i < 8; i++) guests.push(await join('AUTH01', `P${i}`));
  guests[0].client.send({ type: 'START_GAME' });
  assert.equal((await guests[0].client.waitFor('JOIN_ERROR')).payload.code, 'NOT_HOST');
  host.client.send({ type: 'START_GAME' });
  assert.equal((await host.client.waitFor('JOIN_ERROR')).payload.code, 'NOT_ALL_READY');
  const extra = await connect('AUTH01');
  extra.send({ type: 'JOIN_ROOM', payload: { roomCode: 'AUTH01', playerName: 'Full' } });
  assert.equal((await extra.waitFor('JOIN_ERROR')).payload.code, 'ROOM_FULL');
  guests[1].client.send({ type: 'JOIN_ROOM', payload: { roomCode: 'AUTH01', playerName: 'Duplicate' } });
  assert.equal((await host.client.sync()).players.length, 9);
  await close(guests[0].client);
  await host.client.state(s => s.players.length === 8);
  assert.equal((await (await join('AUTH01', 'New')).client.state()).players.length, 9);
  const oldClosed = once(host.client.ws, 'close');
  const replacement = await resume('AUTH01', host.seat);
  await oldClosed;
  await close(replacement);
  await guests[1].client.state(s => s.players.find(p => p.isHost)?.connected === false);
  const recovered = await resume('AUTH01', host.seat);
  await delay(5200);
  assert.equal((await recovered.sync()).players.length, 9);
  recovered.send({ type: 'CLOSE_ROOM' });
  await guests[1].client.waitFor('ROOM_CLOSED');
  console.log('Wrangler: min/max, ready/host authority, seat cleanup and replacement disconnect PASS');
}

async function voidAndOfflineFighter() {
  const { host, seats } = await readyStart('VOID01');
  const byId = new Map(seats.map(s => [s.seat.player.id, s]));
  const betting = await host.client.state(s => s.phase === 'BETTING_WINDOW');
  const fighters = betting.currentRound!.fighterIds;
  const spectator = seats.find(s => !fighters.includes(s.seat.player.id))!;
  const before = qualifierStats(betting);
  const bankroll = betting.players.find(p => p.id === spectator.seat.player.id)!.coins;
  spectator.client.send({ type: 'PLACE_BET', payload: { fighterId: fighters[0], amount: 100 } });
  await spectator.client.waitFor('BET_ACCEPTED');
  await Promise.all(fighters.map(id => close(byId.get(id)!.client)));
  let state = await spectator.client.state(s => s.phase === 'PAYOUT_RECAP');
  assert.equal(state.currentRound!.resolutionReason, 'VOID');
  assert.equal(state.tournamentSchedule!.qualifiersCompleted, 1);
  assert.deepEqual(qualifierStats(state).map(({ rank, ...p }) => p), before.map(({ rank, ...p }) => p));
  assert.equal(state.players.find(p => p.id === spectator.seat.player.id)!.coins, bankroll);
  assert.equal(state.currentRound!.payouts.find(p => p.type === 'BET_REFUND')!.stake, 100);
  if (fighters.includes(host.seat.player.id)) host.client = await resume('VOID01', host.seat);
  const nextFighters = state.tournamentSchedule!.matches[1].fighterIds;
  // Leave exactly one Q2 guest offline; restore the other fighter if necessary.
  const absentId = nextFighters.find(id => id !== host.seat.player.id)!;
  for (const seat of seats) {
    if (seat.seat.player.id === absentId) await close(seat.client);
    else if (seat.client.ws.readyState !== WebSocket.OPEN) seat.client = await resume('VOID01', seat.seat);
  }
  host.client.send({ type: 'NEXT_ROUND' });
  state = await host.client.state(s => s.phase === 'PAYOUT_RECAP' && s.currentRound?.roundNumber === 2);
  assert.equal(state.currentRound!.resolutionReason, 'DISCONNECT_FORFEIT');
  assert.equal(state.tournamentSchedule!.qualifiersCompleted, 2);
  assert.equal(state.tournamentSchedule!.matches[2].completed, false);
  host.client.send({ type: 'CLOSE_ROOM' });
  console.log('Wrangler: VOID advances one/refunds/preserves stats; already-offline fighter forfeit PASS');
}

async function frozenRoster() {
  const host = await join('ROSTER', 'Host', true);
  const absent = await join('ROSTER', 'Absent');
  const guests = [await join('ROSTER', 'P2'), await join('ROSTER', 'P3')];
  await close(absent.client);
  for (const guest of guests) guest.client.send({ type: 'TOGGLE_READY' });
  // Ignore earlier join snapshots: every intended participant must be present and ready.
  await host.client.state(s => s.players.length === 4
    && s.players.find(p => p.id === absent.seat.player.id)?.connected === false
    && guests.every(guest => s.players.some(p => p.id === guest.seat.player.id && p.connected && p.isReady)));
  host.client.send({ type: 'START_GAME' });
  for (let q = 1; q <= 3; q++) {
    const reveal = await host.client.state(s => s.phase === 'FIGHTER_REVEAL' && s.currentRound?.roundNumber === q);
    assert.equal(reveal.players.length, 4, 'the disconnected pre-start seat is retained during the tournament');
    const fighters = reveal.currentRound!.fighterIds;
    assert.equal(fighters.includes(absent.seat.player.id), false);
    for (const guest of guests) if (fighters.includes(guest.seat.player.id)) await close(guest.client);
    const recap = await host.client.state(s => s.phase === 'PAYOUT_RECAP' && s.currentRound?.roundNumber === q);
    assert.equal(recap.currentRound!.resolutionReason, fighters.includes(host.seat.player.id) ? 'DISCONNECT_FORFEIT' : 'VOID');
    for (const guest of guests) if (guest.client.ws.readyState !== WebSocket.OPEN) guest.client = await resume('ROSTER', guest.seat);
    host.client.send({ type: 'NEXT_ROUND' });
  }
  const championship = await host.client.state(s => s.currentRound?.isChampionship === true);
  assert.equal(championship.tournamentSchedule!.finalists!.includes(absent.seat.player.id), false);
  assert.notEqual(championship.tournamentSchedule!.thirdPlaceId, absent.seat.player.id);
  host.client.send({ type: 'CLOSE_ROOM' });
  console.log('Wrangler: retained nonparticipant cannot become finalist or third place PASS');
}

async function main() {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = (listener.address() as { port: number }).port;
  await new Promise<void>(resolve => listener.close(() => resolve()));
  baseUrl = `http://127.0.0.1:${port}`;
  await mkdir('.wrangler', { recursive: true });
  const persistence = await mkdtemp(resolve('.wrangler', 'protocol-'));
  let proc: ChildProcess | undefined;
  let logs = '';
  async function start(gameSequence = LEGACY_GAME_SEQUENCE) {
    proc = spawn(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), 'dev', '--local', '--port', String(port),
      '--persist-to', persistence, '--var', 'BRAWL_TEST_FAST:1',
      '--var', `BRAWL_TEST_GAME_SEQUENCE:${gameSequence}`,
      '--log-level', 'error'], { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout!.on('data', data => { logs = (logs + data).slice(-100000); });
    proc.stderr!.on('data', data => { logs = (logs + data).slice(-100000); });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (proc.exitCode !== null) throw new Error(`Wrangler exited ${proc.exitCode}`);
      try { if ((await fetch(`${baseUrl}/api/network-info`)).ok) return; } catch { /* starting */ }
      await delay(100);
    }
    throw new Error('Wrangler startup timeout');
  }
  async function stop() {
    const child = proc;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    const force = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.kill('SIGTERM');
    try { await exited; } finally { clearTimeout(force); proc = undefined; }
  }
  try {
    await start();
    const info = await (await fetch(`${baseUrl}/api/network-info`)).json() as { online: boolean; fullJoinUrl: string };
    assert.equal(info.online, true);
    assert.equal(info.fullJoinUrl, baseUrl);
    assert.equal((await fetch(baseUrl)).status, 200);
    assert.equal((await fetch(`${baseUrl}/ws`)).status, 426);
    await authorityAndCapacity();
    const isolation = await join('ISOL01', 'Isolated', true);
    const result = await tournament();
    assert.equal((await isolation.client.sync()).players.length, 1);
    await voidAndOfflineFighter();
    await frozenRoster();
    const pending = await readyStart('PERS01');
    const betting = await pending.host.client.state(s => s.phase === 'BETTING_WINDOW');
    const bettor = pending.seats.find(s => !betting.currentRound!.fighterIds.includes(s.seat.player.id))!;
    bettor.client.send({ type: 'PLACE_BET', payload: { fighterId: betting.currentRound!.fighterIds[0], amount: 100 } });
    await bettor.client.waitFor('BET_ACCEPTED');
    const active = await pending.host.client.state(s => s.phase === 'MINIGAME_ACTIVE');
    // Restart the actual workerd/SQLite process, then recover the finished tournament.
    await stop();
    await start();
    const restored = await resume('TOUR01', result.host.seat);
    const state = await restored.state(s => s.phase === 'FINAL_PODIUM');
    assert.equal(state.roomId, result.podium.roomId);
    assert.deepEqual(state.tournamentSchedule, result.podium.tournamentSchedule);
    assert.deepEqual(qualifierStats(state), qualifierStats(result.podium));
    const recoveredGame = await resume('PERS01', pending.host.seat);
    const recoveredRecap = await recoveredGame.state(s => s.phase === 'PAYOUT_RECAP');
    assert.equal(recoveredRecap.roomId, active.roomId);
    assert.equal(recoveredRecap.currentRound!.gameEndsAt, active.currentRound!.gameEndsAt);
    assert.equal(recoveredRecap.tournamentSchedule!.qualifiersCompleted, 1);
    assert.deepEqual(recoveredRecap.tournamentSchedule!.matches.map(m => m.completed), [true, false, false]);
    assert.equal(recoveredRecap.currentRound!.bets.length, 1);
    assert.equal(recoveredRecap.currentRound!.payouts.find(p => p.type === 'BET_REFUND')!.stake, 100);
    recoveredGame.send({ type: 'CLOSE_ROOM' });
    restored.send({ type: 'CLOSE_ROOM' });
    await restored.waitFor('ROOM_CLOSED');
    console.log('Wrangler: room isolation, real restart/SQLite recovery, pending deadline/bet recovery, authenticated close PASS');
    await stop();
    await start('safecracker');
    await v2ProtocolAndPrivacy(async () => { await stop(); await start('safecracker'); });
    console.log('Cloudflare multiplayer integration: PASS');
  } catch (error) {
    console.error(logs);
    console.error(error);
    throw error;
  } finally {
    for (const client of clients) client.ws.terminate();
    await stop();
    await rm(persistence, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
