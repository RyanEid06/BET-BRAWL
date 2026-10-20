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
  serializeAttachment(value: unknown) { this.attachment = structuredClone(value); }
  deserializeAttachment() { return structuredClone(this.attachment); }
  send(raw: string) { this.messages.push(JSON.parse(raw) as ServerMessage); }
  close() { this.closed = true; }
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
  getWebSockets() { return this.sockets.filter(s => !s.closed) as unknown as WebSocket[]; }
  add(ws: FakeSocket) { this.acceptWebSocket(ws); }
  remove(ws: FakeSocket) { this.sockets = this.sockets.filter(s => s !== ws); ws.closed = true; }
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

async function send(room: BrawlRoom, ws: FakeSocket, message: unknown) {
  await room.webSocketMessage(ws as unknown as WebSocket, JSON.stringify(message));
}

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
