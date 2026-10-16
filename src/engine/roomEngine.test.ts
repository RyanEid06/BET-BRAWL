import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFreshPlayer,
  selectRoundFighters,
  initAuthoritativeRound,
  computeSessionAwards,
  MIN_PLAYERS_TO_START,
  MAX_PLAYERS_CAPACITY,
} from './roomEngine.ts';
import type { Player } from './types.ts';

function createMockRoster(count: number): Player[] {
  const players: Player[] = [];
  for (let i = 0; i < count; i++) {
    players.push(createFreshPlayer(`Player ${i + 1}`, '⚡', i === 0));
  }
  return players;
}

test('Fresh player starts with clean statistics and 1000 coins', () => {
  const p = createFreshPlayer('Ace', '⚡', true);
  assert.equal(p.name, 'Ace');
  assert.equal(p.avatar, '⚡');
  assert.equal(p.isHost, true);
  assert.equal(p.coins, 1000);
  assert.equal(p.matchesWon, 0);
  assert.equal(p.matchesPlayed, 0);
  assert.equal(p.totalBetsPlaced, 0);
  assert.equal(p.totalBetsWon, 0);
  assert.equal(p.totalCoinsWonInBets, 0);
  assert.equal(p.totalCoinsLostInBets, 0);
  assert.equal(p.highestSingleBet, 0);
  assert.equal(p.highestSinglePayout, 0);
  assert.ok(p.id.length > 3);
  assert.ok(p.sessionToken.length > 5);
});

test('Room enforces minimum 6 players and maximum 9 players constant', () => {
  assert.equal(MIN_PLAYERS_TO_START, 6);
  assert.equal(MAX_PLAYERS_CAPACITY, 9);
});

test('selectRoundFighters never selects the same player as both fighters', () => {
  const players = createMockRoster(6);
  for (let i = 0; i < 20; i++) {
    const [f1, f2] = selectRoundFighters(players);
    assert.notEqual(f1, f2, 'Fighters must be distinct');
  }
});

test('Fighter rotation fairness over 8 rounds for 6 players', () => {
  const players = createMockRoster(6);
  let lastPairing: [string, string] | undefined = undefined;

  for (let round = 1; round <= 8; round++) {
    const [f1, f2] = selectRoundFighters(players, lastPairing);
    lastPairing = [f1, f2];
    const p1 = players.find(p => p.id === f1)!;
    const p2 = players.find(p => p.id === f2)!;
    p1.matchesPlayed += 1;
    p2.matchesPlayed += 1;
  }

  // Over 8 rounds (16 fighter slots) across 6 players:
  // 16 / 6 = 2.66 -> every player plays either 2 or 3 matches. Max diff is 1!
  const playedCounts = players.map(p => p.matchesPlayed);
  const minPlayed = Math.min(...playedCounts);
  const maxPlayed = Math.max(...playedCounts);
  assert.ok(maxPlayed - minPlayed <= 1, `Expected max diff <= 1, got min=${minPlayed}, max=${maxPlayed}`);
});

test('Fighter rotation fairness over 8 rounds for 7, 8, and 9 players', () => {
  for (const playerCount of [7, 8, 9]) {
    const players = createMockRoster(playerCount);
    let lastPairing: [string, string] | undefined = undefined;

    for (let round = 1; round <= 8; round++) {
      const [f1, f2] = selectRoundFighters(players, lastPairing);
      lastPairing = [f1, f2];
      const p1 = players.find(p => p.id === f1)!;
      const p2 = players.find(p => p.id === f2)!;
      p1.matchesPlayed += 1;
      p2.matchesPlayed += 1;
    }

    const playedCounts = players.map(p => p.matchesPlayed);
    const minPlayed = Math.min(...playedCounts);
    const maxPlayed = Math.max(...playedCounts);
    assert.ok(maxPlayed - minPlayed <= 1, `Count ${playerCount}: min=${minPlayed}, max=${maxPlayed}`);
  }
});

test('Fighter rotation fairness over 10 rounds for 6, 7, 8, and 9 players', () => {
  for (const playerCount of [6, 7, 8, 9]) {
    const players = createMockRoster(playerCount);
    let lastPairing: [string, string] | undefined = undefined;

    for (let round = 1; round <= 10; round++) {
      const [f1, f2] = selectRoundFighters(players, lastPairing);
      lastPairing = [f1, f2];
      const p1 = players.find(p => p.id === f1)!;
      const p2 = players.find(p => p.id === f2)!;
      p1.matchesPlayed += 1;
      p2.matchesPlayed += 1;
    }

    const playedCounts = players.map(p => p.matchesPlayed);
    const minPlayed = Math.min(...playedCounts);
    const maxPlayed = Math.max(...playedCounts);
    assert.ok(maxPlayed - minPlayed <= 1, `Count ${playerCount}: min=${minPlayed}, max=${maxPlayed}`);
  }
});

test('initAuthoritativeRound initializes clean round state and mini-game config', () => {
  const players = createMockRoster(6);
  const { round, internalGame } = initAuthoritativeRound(1, 8, players);

  assert.equal(round.roundNumber, 1);
  assert.equal(round.maxRounds, 8);
  assert.equal(round.matchPot, 250);
  assert.equal(round.bets.length, 0);
  assert.equal(round.winnerId, null);
  assert.equal(round.bettingTimeRemaining, 15);
  assert.ok(round.miniGame !== undefined);
  assert.ok(Object.keys(round.odds).length === 2);
  assert.ok(internalGame !== undefined);
});

test('selectRoundFighters excludes disconnected players from fighter selection', () => {
  const players = createMockRoster(6);
  players[0].connected = false;
  players[1].connected = false;

  for (let i = 0; i < 20; i++) {
    const [f1, f2] = selectRoundFighters(players);
    assert.notEqual(f1, players[0].id);
    assert.notEqual(f2, players[0].id);
    assert.notEqual(f1, players[1].id);
    assert.notEqual(f2, players[1].id);
  }
});

test('computeSessionAwards derives awards strictly from genuine session statistics', () => {
  const players = createMockRoster(6);

  // Before any bets or games, no fake awards should be given
  const initialAwards = computeSessionAwards(players);
  assert.equal(initialAwards.length, 0, 'No awards before genuine gameplay');

  // Simulate genuine session statistics
  players[0].highestSingleBet = 500;
  players[1].totalCoinsLostInBets = 350;
  players[2].matchesPlayed = 3;
  players[2].matchesWon = 3;
  players[3].totalBetsPlaced = 3;
  players[3].totalBetsWon = 3;
  players[4].highestSinglePayout = 750;

  const sessionAwards = computeSessionAwards(players);
  assert.ok(sessionAwards.length >= 4);

  const awardIds = sessionAwards.map(a => a.id);
  assert.ok(awardIds.includes('risk_taker'));
  assert.ok(awardIds.includes('unlucky_bettor'));
  assert.ok(awardIds.includes('brawl_king'));
  assert.ok(awardIds.includes('the_oracle'));
  assert.ok(awardIds.includes('high_roller'));
});
