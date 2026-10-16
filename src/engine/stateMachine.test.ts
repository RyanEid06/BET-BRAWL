import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialServerState,
  selectRoundFighters,
  initNewRound,
  placeBet,
  resolveMiniGame,
  computePodiumAwards,
} from './stateMachine.ts';

test('createInitialServerState creates valid lobby with 7 players', () => {
  const state = createInitialServerState();
  assert.equal(state.phase, 'LOBBY');
  assert.equal(state.players.length, 7);
  assert.equal(state.players[0].coins, 1000);
  assert.equal(state.totalRounds, 8);
  assert.ok(state.messageLog.length >= 2);
});

test('selectRoundFighters selects 2 distinct players with fewest matches', () => {
  const state = createInitialServerState();
  const [f1, f2] = selectRoundFighters(state.players, 1);
  assert.notEqual(f1, f2, 'Fighters must be distinct');
  assert.ok(state.players.some(p => p.id === f1));
  assert.ok(state.players.some(p => p.id === f2));
});

test('initNewRound sets phase to FIGHTER_REVEAL and initializes round state', () => {
  const state = createInitialServerState();
  const next = initNewRound(state);

  assert.equal(next.phase, 'FIGHTER_REVEAL');
  assert.ok(next.currentRound !== null);
  assert.equal(next.currentRound?.roundNumber, 1);
  assert.equal(next.currentRound?.miniGame.id, 'millisecond_stop');
  assert.equal(next.currentRound?.matchPot, 250);
  assert.ok(Object.keys(next.currentRound?.odds || {}).length === 2);
});

test('placeBet deducts coins from bettor and records secret bet', () => {
  let state = createInitialServerState();
  state = initNewRound(state);
  state.phase = 'BETTING_WINDOW'; // simulate betting window open

  const spectatorId = 'p4'; // Zoe
  const targetFighterId = state.currentRound!.fighterIds[0];
  const initialCoins = state.players.find(p => p.id === spectatorId)!.coins;

  const afterBet = placeBet(state, spectatorId, targetFighterId, 200);

  const bettorAfter = afterBet.players.find(p => p.id === spectatorId)!;
  assert.equal(bettorAfter.coins, initialCoins - 200, 'Coins deducted on bet');
  assert.equal(afterBet.currentRound?.bets.length, 1);
  assert.equal(afterBet.currentRound?.bets[0].amount, 200);
});

test('resolveMiniGame completes round, distributes payouts, and updates round history', () => {
  let state = createInitialServerState();
  state = initNewRound(state);
  state.phase = 'BETTING_WINDOW';

  const [f1, f2] = state.currentRound!.fighterIds;
  // Place bet on f1
  state = placeBet(state, 'p3', f1, 100);

  // Winner is f1
  const afterGame = resolveMiniGame(state, f1, { [f1]: 5.012, [f2]: 5.234 });

  assert.equal(afterGame.phase, 'PAYOUT_RECAP');
  assert.equal(afterGame.currentRound?.winnerId, f1);
  assert.equal(afterGame.roundHistory.length, 1);
  assert.ok(afterGame.currentRound?.payouts.length! >= 2);
});

test('computePodiumAwards generates fun awards based on statistics', () => {
  const state = createInitialServerState();
  const awards = computePodiumAwards(state.players);

  assert.ok(awards.length >= 3);
  const titles = awards.map(a => a.title);
  assert.ok(titles.includes('Biggest Risk Taker'));
  assert.ok(titles.includes('The Clutch King'));
});
