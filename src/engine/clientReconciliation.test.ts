import test from 'node:test';
import assert from 'node:assert/strict';
import { actionScope, isCurrentActionResult, unconfirmedRotations, readReconnectTicket } from './clientReconciliation.ts';
import type { RoundState } from './types.ts';

test('action feedback requires a locally sent identity in the current match, stage and phase', () => {
  const round = { matchId: 'one', gameState: { stageIndex: 1, phase: 'puzzle' } } as unknown as RoundState;
  const sent = actionScope('MINIGAME_ACTIVE', round);
  const result = { matchId: 'one', stageIndex: 1, actionId: 'known', accepted: false };
  assert.equal(isCurrentActionResult(result, sent, 'MINIGAME_ACTIVE', round), true);
  assert.equal(isCurrentActionResult(result, undefined, 'MINIGAME_ACTIVE', round), false);
  for (const next of [null, { ...round, matchId: 'two' }, { ...round, gameState: { stageIndex: 2, phase: 'puzzle' } }, { ...round, gameState: { stageIndex: 1, phase: 'reveal' } }]) {
    assert.equal(isCurrentActionResult(result, sent, 'MINIGAME_ACTIVE', next as RoundState | null), false);
  }
  assert.equal(isCurrentActionResult(result, sent, 'PAYOUT_RECAP', round), false);
});

test('rapid optimistic rotations survive partial/batched snapshots without replaying confirmed moves', () => {
  assert.deepEqual(unconfirmedRotations(5, [1, 1, 2], 5), [1, 1, 2]);
  assert.deepEqual(unconfirmedRotations(5, [1, 1, 2], 6), [1, 2]);
  assert.deepEqual(unconfirmedRotations(5, [1, 1, 2], 8), []);
  assert.deepEqual(unconfirmedRotations(5, [1], 0), []);
});

test('Activity recreation resumes only a validated prior LAN or native-host endpoint', () => {
  for (const wsUrl of ['ws://192.168.1.5:8080/ws', 'ws://127.0.0.1:8080/ws']) {
    assert.deepEqual(readReconnectTicket(JSON.stringify({ roomCode: 'ROOM', wsUrl })), { roomCode: 'ROOM', wsUrl });
  }
  for (const wsUrl of ['ws://example.com:8080/ws', 'ws://127.0.0.1:9000/ws', 'ws://192.168.1.5:80/ws', 'ws://user:pass@192.168.1.5:8080/ws', 'ws://192.168.1.5:8080/ws?other=room', 'file:///ws']) {
    assert.equal(readReconnectTicket(JSON.stringify({ roomCode: 'ROOM', wsUrl })), null);
  }
  assert.equal(readReconnectTicket('{broken'), null);
  assert.equal(readReconnectTicket(JSON.stringify({ roomCode: '../bad', wsUrl: 'ws://192.168.1.5:8080/ws' })), null);
});
