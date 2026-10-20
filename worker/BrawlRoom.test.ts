import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { BrawlRoomCore } from './roomCore.ts';
import type { PublicRoomState, ServerMessage } from '../src/engine/types.ts';

class FakeStorage {
  values = new Map<string, unknown>();
  alarmAt: number | null = null;
  async get<T>(key: string): Promise<T | undefined> { return this.values.get(key) as T | undefined; }
  async put(key: string, value: unknown): Promise<void> { this.values.set(key, structuredClone(value)); }
  async delete(key: string): Promise<boolean> { return this.values.delete(key); }
  async setAlarm(at: number | Date): Promise<void> { this.alarmAt = at instanceof Date ? at.getTime() : at; }
  async deleteAlarm(): Promise<void> { this.alarmAt = null; }
  async getAlarm(): Promise<number | null> { return this.alarmAt; }
}

class FakeSocket {
  attachment: unknown = null;
  messages: ServerMessage[] = [];
  closed = false;
  readyState = 1;
  serializeAttachment(value: unknown) { this.attachment = structuredClone(value); }
  deserializeAttachment() { return structuredClone(this.attachment); }
  send(raw: string) { this.messages.push(JSON.parse(raw) as ServerMessage); }
  close() { this.closed = true; this.readyState = 2; }
  lastState(): PublicRoomState | undefined {
    return [...this.messages].reverse().find(m => m.type === 'ROOM_STATE')?.payload as PublicRoomState | undefined;
  }
  find<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    return this.messages.find(m => m.type === type) as Extract<ServerMessage, { type: T }> | undefined;
  }
}

class FakeContext {
  storage = new FakeStorage();
  sockets: FakeSocket[] = [];
  blockers: Promise<unknown>[] = [];
  blockConcurrencyWhile<T>(fn: () => Promise<T>) { this.blockers.push(fn()); }
  acceptWebSocket(ws: FakeSocket) { if (!this.sockets.includes(ws)) this.sockets.push(ws); }
  getWebSockets() { return this.sockets.filter(s => s.readyState !== 3) as unknown as WebSocket[]; }
  add(ws: FakeSocket) { this.acceptWebSocket(ws); }
  remove(ws: FakeSocket) { this.sockets = this.sockets.filter(s => s !== ws); ws.closed = true; ws.readyState = 3; }
  async ready() { await Promise.all(this.blockers); this.blockers = []; }
}

const env = {
  BRAWL_TEST_FAST: '1',
  BRAWL_ROOMS: {} as DurableObjectNamespace,
  ASSETS: {} as Fetcher,
};

function attach(ctx: FakeContext, roomCode: string): FakeSocket {
  const ws = new FakeSocket();
  ws.serializeAttachment({ connectionId: `c_${Math.random()}`, sessionToken: null, routeRoomCode: roomCode });
  ctx.add(ws);
  return ws;
}

async function send(room: BrawlRoomCore, ws: FakeSocket, message: unknown) {
  await room.webSocketMessage(ws as unknown as WebSocket, JSON.stringify(message));
}

async function lobby(names = ['Host', 'P2', 'P3'], debugMode = false) {
  const ctx = new FakeContext();
  const room = new BrawlRoomCore(ctx as unknown as DurableObjectState, env);
  await ctx.ready();
  const sockets: FakeSocket[] = [];
  for (const [index, playerName] of names.entries()) {
    const ws = attach(ctx, 'REGRES');
    sockets.push(ws);
    await send(room, ws, index === 0
      ? { type: 'CREATE_ROOM', payload: { playerName, debugMode } }
      : { type: 'JOIN_ROOM', payload: { roomCode: 'REGRES', playerName } });
    if (index > 0) await send(room, ws, { type: 'TOGGLE_READY' });
  }
  return { ctx, room, sockets, host: sockets[0] };
}

test('debug rooms still require three distinct players and a valid qualifier schedule', async () => {
  for (const count of [1, 2, 3]) {
    const { room, host } = await lobby(['Host', 'P2', 'P3'].slice(0, count), true);
    await send(room, host, { type: 'START_GAME' });
    if (count < 3) {
      assert.equal(host.find('JOIN_ERROR')?.payload.code, 'NOT_ENOUGH_PLAYERS');
      assert.equal(host.lastState()!.phase, 'LOBBY');
    } else {
      const state = host.lastState()!;
      assert.equal(state.phase, 'FIGHTER_REVEAL');
      assert.equal(state.tournamentSchedule!.qualifierCount, 3);
      assert.ok(state.tournamentSchedule!.matches.every(m => m.fighterIds[0] !== m.fighterIds[1]));
    }
  }
});

async function runAlarmAt(room: BrawlRoomCore, at: number) {
  const originalNow = Date.now;
  Date.now = () => at;
  try { await room.alarm(); } finally { Date.now = originalNow; }
}

test('replaced socket cannot close a room or reclaim its token while closing', async () => {
  const { ctx, room, host } = await lobby();
  const token = host.find('JOIN_SUCCESS')!.payload.sessionToken;
  const replacement = attach(ctx, 'REGRES');
  await send(room, replacement, { type: 'JOIN_ROOM', payload: { roomCode: 'REGRES', sessionToken: token } });
  await send(room, host, { type: 'JOIN_ROOM', payload: { roomCode: 'REGRES', sessionToken: token } });
  await send(room, host, { type: 'CLOSE_ROOM' });
  assert.ok(ctx.storage.values.get('activeRoom'), 'stale host connection must have no authority');
  assert.equal(replacement.find('ROOM_CLOSED'), undefined);
});

test('closing replaced socket cannot hide replacement disconnect', async () => {
  const { ctx, room, host } = await lobby();
  const replacement = attach(ctx, 'REGRES');
  await send(room, replacement, {
    type: 'JOIN_ROOM', payload: { roomCode: 'REGRES', sessionToken: host.find('JOIN_SUCCESS')!.payload.sessionToken },
  });
  ctx.remove(replacement);
  await room.webSocketClose(replacement as unknown as WebSocket);
  const saved = ctx.storage.values.get('activeRoom') as { players: Record<string, { isHost: boolean; connected: boolean }> };
  assert.equal(Object.values(saved.players).find(p => p.isHost)!.connected, false);
});

test('unrecovered host disconnect closes the room at its server deadline', async () => {
  const { ctx, room, host, sockets } = await lobby();
  ctx.remove(host);
  await room.webSocketClose(host as unknown as WebSocket);
  await runAlarmAt(room, ctx.storage.alarmAt!);
  assert.equal(ctx.storage.values.has('activeRoom'), false);
  assert.equal(sockets[1].find('ROOM_CLOSED')!.payload.reason, 'Host disconnected and did not return.');
});

test('repeated JOIN_ROOM cannot orphan a connected seat', async () => {
  const { room, host, sockets } = await lobby();
  await send(room, sockets[1], { type: 'JOIN_ROOM', payload: { roomCode: 'REGRES', playerName: 'Duplicate' } });
  assert.equal(host.lastState()!.players.length, 3);
});

test('alarms never transition reveal or countdown before the published deadline', async () => {
  const { ctx, room, host } = await lobby();
  await send(room, host, { type: 'START_GAME' });
  const revealEnd = host.lastState()!.currentRound!.revealEndsAt!;
  await runAlarmAt(room, revealEnd - 1);
  assert.equal(host.lastState()!.phase, 'FIGHTER_REVEAL');
  await runAlarmAt(room, revealEnd);
  assert.equal(host.lastState()!.phase, 'BETTING_WINDOW');
  await runAlarmAt(room, host.lastState()!.currentRound!.bettingEndsAt!);
  assert.equal(host.lastState()!.phase, 'MINIGAME_COUNTDOWN');
  const gameStart = host.lastState()!.currentRound!.gameStartsAt!;
  await runAlarmAt(room, gameStart - 1);
  assert.equal(host.lastState()!.phase, 'MINIGAME_COUNTDOWN');
  await runAlarmAt(room, gameStart);
  assert.equal(host.lastState()!.phase, 'MINIGAME_ACTIVE');
});

test('fighter actions before authoritative gameStartsAt cannot score', async () => {
  const { ctx, room, host, sockets } = await lobby();
  await send(room, host, { type: 'START_GAME' });
  for (let i = 0; i < 3; i++) await runAlarmAt(room, ctx.storage.alarmAt! + 1000);
  const state = host.lastState()!;
  assert.equal(state.phase, 'MINIGAME_ACTIVE');
  const fighterId = state.currentRound!.fighterIds[0];
  const fighter = sockets.find(s => s.find('JOIN_SUCCESS')!.payload.player.id === fighterId)!;
  const originalNow = Date.now;
  Date.now = () => state.currentRound!.gameStartsAt! - 1;
  try {
    await send(room, fighter, { type: 'FIGHTER_ACTION', payload: { type: 'STOP' } });
    Date.now = () => state.currentRound!.gameStartsAt! + 100;
    await send(room, fighter, { type: 'FIGHTER_ACTION', payload: { type: 'STOP' } });
  }
  finally { Date.now = originalNow; }
  const saved = ctx.storage.values.get('activeRoom') as { currentRound: { fighterScores: Record<string, number> } };
  assert.equal(saved.currentRound.fighterScores[fighterId], 0.1, 'early STOP must not consume the later valid STOP');
});

test('fighter already offline when the next round starts forfeits after grace', async () => {
  const { ctx, room, host, sockets } = await lobby();
  await send(room, host, { type: 'START_GAME' });
  // Disconnect during recap, when there is no active fighter grace to carry over.
  for (let i = 0; i < 4; i++) await runAlarmAt(room, ctx.storage.alarmAt! + 2000);
  let state = host.lastState()!;
  assert.equal(state.phase, 'PAYOUT_RECAP');
  const nextFighters = state.tournamentSchedule!.matches[1].fighterIds;
  const absent = sockets.find(s => s !== host && nextFighters.includes(s.find('JOIN_SUCCESS')!.payload.player.id))!;
  ctx.remove(absent);
  await room.webSocketClose(absent as unknown as WebSocket);
  await send(room, host, { type: 'NEXT_ROUND' });
  await runAlarmAt(room, Date.now() + 600);
  state = host.lastState()!;
  assert.equal(state.phase, 'PAYOUT_RECAP');
  assert.equal(state.currentRound!.resolutionReason, 'DISCONNECT_FORFEIT');
  assert.equal(state.tournamentSchedule!.qualifiersCompleted, 2);
});

test('returning to the lobby releases seats that disconnected during the tournament', async () => {
  const { ctx, room, host, sockets } = await lobby();
  await send(room, host, { type: 'START_GAME' });
  ctx.remove(sockets[1]);
  await room.webSocketClose(sockets[1] as unknown as WebSocket);
  for (let i = 0; i < 5; i++) {
    const round = host.lastState()!.currentRound!;
    (room as any).resolveCurrentGame(round.isChampionship ? round.fighterIds[0] : null,
      false, round.isChampionship ? 'PLAYED' : 'VOID');
    await send(room, host, { type: 'NEXT_ROUND' });
  }
  assert.equal(host.lastState()!.phase, 'FINAL_PODIUM');
  await send(room, host, { type: 'RESTART_GAME' });
  assert.equal(host.lastState()!.phase, 'LOBBY');
  await runAlarmAt(room, Date.now() + 600);
  assert.equal(host.lastState()!.players.length, 2);
});

test('retained offline lobby seat cannot become finalist or third place', async () => {
  const { ctx, room, host, sockets } = await lobby(['Host', 'Absent', 'P2', 'P3']);
  const absent = sockets[1];
  const absentId = absent.find('JOIN_SUCCESS')!.payload.player.id;
  ctx.remove(absent);
  await room.webSocketClose(absent as unknown as WebSocket);
  await send(room, host, { type: 'START_GAME' });
  // Resolve through the core's authoritative entry point to isolate frozen-roster selection.
  for (let q = 0; q < 3; q++) {
    const state = host.lastState()!;
    const hostId = host.find('JOIN_SUCCESS')!.payload.player.id;
    const winner = state.currentRound!.fighterIds.includes(hostId) ? hostId : null;
    (room as any).resolveCurrentGame(winner, false, winner ? 'PLAYED' : 'VOID');
    await send(room, host, { type: 'NEXT_ROUND' });
  }
  const schedule = host.lastState()!.tournamentSchedule!;
  assert.equal(schedule.finalists!.includes(absentId), false);
  assert.notEqual(schedule.thirdPlaceId, absentId);
});

test('Durable Object backend preserves protocol, room isolation, alarms and persistence', async () => {
  const ctxA = new FakeContext();
  let roomA = new BrawlRoomCore(ctxA as unknown as DurableObjectState, env as any);
  await ctxA.ready();

  const host = attach(ctxA, 'A1B2C3');
  await send(roomA, host, { type: 'CREATE_ROOM', payload: { playerName: 'Host', avatar: '⚡' } });
  const hostJoin = host.find('JOIN_SUCCESS')!;
  assert.equal(hostJoin.payload.roomCode, 'A1B2C3');
  assert.equal(hostJoin.payload.isHost, true);

  const p2 = attach(ctxA, 'A1B2C3');
  await send(roomA, p2, { type: 'JOIN_ROOM', payload: { roomCode: 'A1B2C3', playerName: 'P2', avatar: '🦊' } });
  const p2Join = p2.find('JOIN_SUCCESS')!;
  const p3 = attach(ctxA, 'A1B2C3');
  await send(roomA, p3, { type: 'JOIN_ROOM', payload: { roomCode: 'A1B2C3', playerName: 'P3', avatar: '🐯' } });
  const p3Join = p3.find('JOIN_SUCCESS')!;
  assert.equal(host.lastState()!.players.length, 3);
  assert.ok(host.lastState()!.players.every(p => !('sessionToken' in p)));

  // A second Durable Object is a genuinely isolated online room.
  const ctxB = new FakeContext();
  const roomB = new BrawlRoomCore(ctxB as unknown as DurableObjectState, env as any);
  await ctxB.ready();
  const otherHost = attach(ctxB, 'Z9Y8X7');
  await send(roomB, otherHost, { type: 'CREATE_ROOM', payload: { playerName: 'Other', avatar: '🎮' } });
  assert.equal(otherHost.find('JOIN_SUCCESS')!.payload.roomCode, 'Z9Y8X7');
  assert.equal(host.lastState()!.players.some(p => p.name === 'Other'), false);

  // Simulate Durable Object hibernation/re-instantiation from persisted storage.
  roomA = new BrawlRoomCore(ctxA as unknown as DurableObjectState, env as any);
  await ctxA.ready();
  await send(roomA, p2, { type: 'START_GAME' });
  assert.equal(p2.find('JOIN_ERROR')!.payload.code, 'NOT_HOST');

  await send(roomA, host, { type: 'START_GAME' });
  assert.equal([...host.messages].reverse().find(m => m.type === 'JOIN_ERROR')!.payload.code, 'NOT_ALL_READY');
  await send(roomA, p2, { type: 'TOGGLE_READY' });
  await send(roomA, p3, { type: 'TOGGLE_READY' });
  await send(roomA, host, { type: 'START_GAME' });
  assert.equal(host.lastState()!.phase, 'FIGHTER_REVEAL');

  await delay(180);
  await roomA.alarm();
  assert.equal(host.lastState()!.phase, 'BETTING_WINDOW');
  assert.deepEqual(host.lastState()!.currentRound!.bets, []);

  const fighters = host.lastState()!.currentRound!.fighterIds;
  const clients = new Map([
    [hostJoin.payload.player.id, host],
    [p2Join.payload.player.id, p2],
    [p3Join.payload.player.id, p3],
  ]);
  const spectator = [...clients.entries()].find(([id]) => !fighters.includes(id))![1];
  await send(roomA, spectator, { type: 'PLACE_BET', payload: { fighterId: fighters[0], amount: 100 } });
  assert.equal(spectator.find('BET_ACCEPTED')!.payload.bet.amount, 100);

  await delay(1050);
  await roomA.alarm();
  assert.equal(host.lastState()!.phase, 'MINIGAME_COUNTDOWN');
  await delay(180);
  await roomA.alarm();
  assert.equal(host.lastState()!.phase, 'MINIGAME_ACTIVE');
  assert.deepEqual(host.lastState()!.currentRound!.bets, []);

  await delay(1250);
  await roomA.alarm();
  assert.equal(host.lastState()!.phase, 'PAYOUT_RECAP');
  assert.ok(host.lastState()!.currentRound!.bets.length >= 1);
  assert.ok(host.lastState()!.currentRound!.payouts.length >= 1);
});

test('Durable Object reconnect cancels disconnect grace and reuses the same seat', async () => {
  const ctx = new FakeContext();
  const room = new BrawlRoomCore(ctx as unknown as DurableObjectState, env as any);
  await ctx.ready();
  const host = attach(ctx, 'R4C5N6');
  await send(room, host, { type: 'CREATE_ROOM', payload: { playerName: 'Reconnect', avatar: '🔁' } });
  const join = host.find('JOIN_SUCCESS')!;

  // Reconnect while the old socket is still alive. The new socket must bind first,
  // then the stale close event from the replaced socket must be ignored.
  const replacement = attach(ctx, 'R4C5N6');
  await send(room, replacement, {
    type: 'JOIN_ROOM',
    payload: { roomCode: 'R4C5N6', sessionToken: join.payload.sessionToken },
  });
  const rejoin = replacement.find('JOIN_SUCCESS')!;
  assert.equal(rejoin.payload.player.id, join.payload.player.id);
  assert.equal(host.closed, true);
  await room.webSocketClose(host as unknown as WebSocket);
  assert.equal(replacement.lastState()!.players.length, 1);
  assert.equal(replacement.lastState()!.players[0].connected, true);

  // If the stale close scheduled host grace, this would close the room after 800ms.
  await delay(900);
  await room.alarm();
  assert.notEqual(replacement.lastState()!.phase, 'ENTRY');
  assert.equal(replacement.lastState()!.players.length, 1);
});

test('Durable Object releases disconnected lobby seats after grace expiry', async () => {
  const ctx = new FakeContext();
  const room = new BrawlRoomCore(ctx as unknown as DurableObjectState, env as any);
  await ctx.ready();
  const host = attach(ctx, 'S3A4T5');
  await send(room, host, { type: 'CREATE_ROOM', payload: { playerName: 'Host', avatar: '⚡' } });

  const guests: FakeSocket[] = [];
  for (let i = 0; i < 8; i++) {
    const guest = attach(ctx, 'S3A4T5');
    guests.push(guest);
    await send(room, guest, {
      type: 'JOIN_ROOM',
      payload: { roomCode: 'S3A4T5', playerName: `G${i + 1}`, avatar: '🦊' },
    });
    assert.ok(guest.find('JOIN_SUCCESS'));
  }
  assert.equal(host.lastState()!.players.length, 9);

  const gone = guests[0];
  ctx.remove(gone);
  await room.webSocketClose(gone as unknown as WebSocket);

  const tooSoon = attach(ctx, 'S3A4T5');
  await send(room, tooSoon, {
    type: 'JOIN_ROOM',
    payload: { roomCode: 'S3A4T5', playerName: 'TooSoon', avatar: '🐯' },
  });
  assert.equal(tooSoon.find('JOIN_ERROR')!.payload.code, 'ROOM_FULL');

  await delay(550);
  await room.alarm();
  assert.equal(host.lastState()!.players.length, 8);

  const afterGrace = attach(ctx, 'S3A4T5');
  await send(room, afterGrace, {
    type: 'JOIN_ROOM',
    payload: { roomCode: 'S3A4T5', playerName: 'Replacement', avatar: '🐯' },
  });
  assert.ok(afterGrace.find('JOIN_SUCCESS'));
  assert.equal(host.lastState()!.players.length, 9);
});

test('Durable Object fighter disconnect resolves by forfeit before game timeout', async () => {
  const ctx = new FakeContext();
  const room = new BrawlRoomCore(ctx as unknown as DurableObjectState, env as any);
  await ctx.ready();
  const host = attach(ctx, 'F6G7H8');
  await send(room, host, { type: 'CREATE_ROOM', payload: { playerName: 'Host', avatar: '⚡' } });
  const hJoin = host.find('JOIN_SUCCESS')!;
  const p2 = attach(ctx, 'F6G7H8');
  await send(room, p2, { type: 'JOIN_ROOM', payload: { roomCode: 'F6G7H8', playerName: 'P2', avatar: '🦊' } });
  const p2Join = p2.find('JOIN_SUCCESS')!;
  const p3 = attach(ctx, 'F6G7H8');
  await send(room, p3, { type: 'JOIN_ROOM', payload: { roomCode: 'F6G7H8', playerName: 'P3', avatar: '🐯' } });
  const p3Join = p3.find('JOIN_SUCCESS')!;

  await send(room, p2, { type: 'TOGGLE_READY' });
  await send(room, p3, { type: 'TOGGLE_READY' });
  await send(room, host, { type: 'START_GAME' });
  await delay(180); await room.alarm(); // betting
  await delay(1050); await room.alarm(); // countdown
  await delay(180); await room.alarm(); // active
  assert.equal(host.lastState()!.phase, 'MINIGAME_ACTIVE');

  const fighters = host.lastState()!.currentRound!.fighterIds;
  const playerSockets = new Map([
    [hJoin.payload.player.id, host],
    [p2Join.payload.player.id, p2],
    [p3Join.payload.player.id, p3],
  ]);
  const disconnectedId = fighters.find(id => id !== hJoin.payload.player.id) ?? fighters[0];
  const disconnectedSocket = playerSockets.get(disconnectedId)!;
  const otherFighterId = fighters.find(id => id !== disconnectedId)!;

  ctx.remove(disconnectedSocket);
  await room.webSocketClose(disconnectedSocket as unknown as WebSocket);
  await delay(550);
  await room.alarm();

  const state = host.lastState()!;
  assert.equal(state.phase, 'PAYOUT_RECAP');
  assert.equal(state.currentRound!.winnerId, otherFighterId);
  assert.equal(state.currentRound!.resolutionReason, 'DISCONNECT_FORFEIT');
});
