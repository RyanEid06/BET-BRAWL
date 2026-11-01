import test from 'node:test';
import assert from 'node:assert/strict';
import { actionScope, isCurrentActionResult, unconfirmedRotations } from './clientReconciliation.ts';
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
