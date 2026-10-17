import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFreshPlayer,
  selectRoundFighters,
  initAuthoritativeRound,
  computeSessionAwards,
  generateTournamentSchedule,
  computeTournamentRankings,
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

test('Cryptographic session tokens and player IDs are unique and strong', () => {
  const tokens = new Set<string>();
  const ids = new Set<string>();

  for (let i = 0; i < 50; i++) {
    const p = createFreshPlayer(`Player ${i}`, '⚡', i === 0);
    tokens.add(p.sessionToken);
    ids.add(p.id);
    assert.ok(p.sessionToken.startsWith('tok_'));
    assert.ok(p.id.startsWith('p_'));
  }

  assert.equal(tokens.size, 50, 'All 50 generated session tokens must be unique');
  assert.equal(ids.size, 50, 'All 50 generated player IDs must be unique');
});

test('Room enforces minimum 3 players and maximum 9 players constant', () => {
  assert.equal(MIN_PLAYERS_TO_START, 3);
  assert.equal(MAX_PLAYERS_CAPACITY, 9);
});

test('generateTournamentSchedule creates circular qualifier graph for 3 to 9 players', () => {
  for (let n = 3; n <= 9; n++) {
    const players = createMockRoster(n);
    const schedule = generateTournamentSchedule(players);

    // Exact count properties
    assert.equal(schedule.totalPlayers, n, `Roster count must be ${n}`);
    assert.equal(schedule.qualifierCount, n, `Must have exactly ${n} qualifier matches`);
    assert.equal(schedule.totalRounds, n + 1, `Must have ${n + 1} total rounds (N qualifiers + 1 Championship)`);
    assert.equal(schedule.matches.length, n + 1);

    // Verify qualifier matches (0 to n - 1)
    const appearances: Record<string, number> = {};
    const opponents: Record<string, Set<string>> = {};
    const pairings = new Set<string>();

    for (let i = 0; i < n; i++) {
      const match = schedule.matches[i];
      assert.equal(match.isChampionship, false);
      assert.equal(match.roundNumber, i + 1);
      const [f1, f2] = match.fighterIds;
      assert.notEqual(f1, f2, 'Fighters in match must be distinct');

      appearances[f1] = (appearances[f1] || 0) + 1;
      appearances[f2] = (appearances[f2] || 0) + 1;

      if (!opponents[f1]) opponents[f1] = new Set();
      if (!opponents[f2]) opponents[f2] = new Set();
      opponents[f1].add(f2);
      opponents[f2].add(f1);

      const pairKey = [f1, f2].sort().join(':');
      assert.ok(!pairings.has(pairKey), `Duplicate pairing detected: ${pairKey}`);
      pairings.add(pairKey);
    }

    // Every player gets exactly 2 appearances and faces 2 distinct opponents
    for (const p of players) {
      assert.equal(appearances[p.id], 2, `Player ${p.id} must have exactly 2 qualifier appearances in ${n}-player room`);
      assert.equal(opponents[p.id].size, 2, `Player ${p.id} must face 2 distinct opponents in ${n}-player room`);
    }

    // Championship match placeholder
    const finalMatch = schedule.matches[n];
    assert.equal(finalMatch.isChampionship, true);
    assert.equal(finalMatch.roundNumber, n + 1);
  }
});

test('generateTournamentSchedule strictly rejects fewer than 3 players or more than 9', () => {
  assert.throws(() => generateTournamentSchedule(createMockRoster(2)), /at least 3 connected players/);
  assert.throws(() => generateTournamentSchedule(createMockRoster(10)), /maximum capacity of 9/);
});

test('computeTournamentRankings ranks primarily by Brawl Points with head-to-head tiebreak', () => {
  const players = createMockRoster(3);
  const p1 = players[0];
  const p2 = players[1];
  const p3 = players[2];

  // P1: 6 pts (2W), P2: 3 pts (1W), P3: 0 pts (0W)
  p1.qualifierPoints = 6;
  p1.qualifierWins = 2;
  p2.qualifierPoints = 3;
  p2.qualifierWins = 1;
  p3.qualifierPoints = 0;
  p3.qualifierWins = 0;

  const matches = [
    { matchIndex: 0, roundNumber: 1, fighterIds: [p1.id, p2.id] as [string, string], isChampionship: false, completed: true, winnerId: p1.id },
    { matchIndex: 1, roundNumber: 2, fighterIds: [p2.id, p3.id] as [string, string], isChampionship: false, completed: true, winnerId: p2.id },
    { matchIndex: 2, roundNumber: 3, fighterIds: [p3.id, p1.id] as [string, string], isChampionship: false, completed: true, winnerId: p1.id },
  ];

  const ranked = computeTournamentRankings(players, matches);
  assert.equal(ranked[0].id, p1.id, 'Rank 1 must be P1 (6 pts)');
  assert.equal(ranked[1].id, p2.id, 'Rank 2 must be P2 (3 pts)');
  assert.equal(ranked[2].id, p3.id, 'Rank 3 must be P3 (0 pts)');
  assert.equal(ranked[0].tournamentRank, 1);
  assert.equal(ranked[1].tournamentRank, 2);
  assert.equal(ranked[2].tournamentRank, 3);

  // Test head-to-head tiebreak: P1 and P2 tied on 3 pts, but P1 beat P2 in match 0
  p1.qualifierPoints = 3;
  p2.qualifierPoints = 3;
  const tiedRanked = computeTournamentRankings(players, matches);
  assert.equal(tiedRanked[0].id, p1.id, 'P1 won head-to-head against P2, must rank higher');
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
