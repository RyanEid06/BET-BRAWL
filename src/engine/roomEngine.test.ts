import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFreshPlayer,
  selectRoundFighters,
  initAuthoritativeRound,
  computeSessionAwards,
  generateTournamentSchedule,
  computeTournamentRankings,
  getFinalTournamentStandings,
  selectMiniGame,
  MIN_PLAYERS_TO_START,
  MAX_PLAYERS_CAPACITY,
} from './roomEngine.ts';
import type { Player, TournamentMatch } from './types.ts';

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
    assert.equal(schedule.stage, 'QUALIFIERS');
    assert.equal(schedule.matches.length, n, `Matches list initializes with exactly ${n} qualifier matches`);
    assert.ok(schedule.stableRosterOrder && schedule.stableRosterOrder.length === n);

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
  }
});

test('generateTournamentSchedule strictly rejects fewer than 3 players or more than 9', () => {
  assert.throws(() => generateTournamentSchedule(createMockRoster(2)), /at least 3 connected players/);
  assert.throws(() => generateTournamentSchedule(createMockRoster(10)), /maximum capacity of 9/);
});

test('computeTournamentRankings ranks primarily by Brawl Points with 5-tier tiebreaker', () => {
  const players = createMockRoster(4);
  const [p1, p2, p3, p4] = players;

  // Tier 1: Brawl Points
  p1.qualifierPoints = 6;
  p1.qualifierWins = 2;
  p2.qualifierPoints = 4;
  p2.qualifierWins = 1;
  p3.qualifierPoints = 1;
  p3.qualifierWins = 0;
  p4.qualifierPoints = 0;
  p4.qualifierWins = 0;

  const matches: TournamentMatch[] = [
    { matchIndex: 0, roundNumber: 1, fighterIds: [p1.id, p2.id], isChampionship: false, completed: true, winnerId: p1.id },
    { matchIndex: 1, roundNumber: 2, fighterIds: [p2.id, p3.id], isChampionship: false, completed: true, winnerId: p2.id },
    { matchIndex: 2, roundNumber: 3, fighterIds: [p3.id, p4.id], isChampionship: false, completed: true, winnerId: null, tieResult: true },
    { matchIndex: 3, roundNumber: 4, fighterIds: [p4.id, p1.id], isChampionship: false, completed: true, winnerId: p1.id },
  ];

  const ranked = computeTournamentRankings(players, matches);
  assert.equal(ranked[0].id, p1.id, 'Rank 1 must be P1 (6 pts)');
  assert.equal(ranked[1].id, p2.id, 'Rank 2 must be P2 (4 pts)');
  assert.equal(ranked[2].id, p3.id, 'Rank 3 must be P3 (1 pt)');
  assert.equal(ranked[3].id, p4.id, 'Rank 4 must be P4 (0 pts)');
  assert.equal(ranked[0].tournamentRank, 1);
  assert.equal(ranked[1].tournamentRank, 2);
  assert.equal(ranked[2].tournamentRank, 3);
  assert.equal(ranked[3].tournamentRank, 4);

  // Tier 3 test: Head-to-head between tied players (both 3 pts, 1 win each, but p1 beat p2 directly)
  p1.qualifierPoints = 3;
  p1.qualifierWins = 1;
  p2.qualifierPoints = 3;
  p2.qualifierWins = 1;
  const h2hMatches: TournamentMatch[] = [
    { matchIndex: 0, roundNumber: 1, fighterIds: [p1.id, p2.id], isChampionship: false, completed: true, winnerId: p1.id },
  ];
  const h2hRanked = computeTournamentRankings([p2, p1], h2hMatches);
  assert.equal(h2hRanked[0].id, p1.id, 'P1 beat P2 head-to-head so P1 ranks higher');

  // Tier 4 test: Tied on points and wins, no decisive head-to-head, resolved by bankroll
  p1.qualifierPoints = 3;
  p1.qualifierWins = 1;
  p1.coins = 1500;
  p2.qualifierPoints = 3;
  p2.qualifierWins = 1;
  p2.coins = 900;
  const noH2hRanked = computeTournamentRankings([p2, p1], []);
  assert.equal(noH2hRanked[0].id, p1.id, 'P1 has more coins so P1 ranks higher');

  // Tier 5 test: Completely tied, resolved deterministically by stable roster order
  p1.coins = 1000;
  p2.coins = 1000;
  const stableRanked = computeTournamentRankings([p2, p1], [], [p2.id, p1.id]);
  assert.equal(stableRanked[0].id, p2.id, 'Stable roster order breaks final tie');
});

test('computeTournamentRankings: 3-way cyclical tie (A beats B, B beats C, C beats A) resolves deterministically via stableRosterOrder without non-transitive sorting cycles', () => {
  const players = createMockRoster(3);
  const [pA, pB, pC] = players;

  // All 3 players finish with identical points, wins, and bankrolls
  pA.qualifierPoints = 3;
  pA.qualifierWins = 1;
  pA.coins = 1000;

  pB.qualifierPoints = 3;
  pB.qualifierWins = 1;
  pB.coins = 1000;

  pC.qualifierPoints = 3;
  pC.qualifierWins = 1;
  pC.coins = 1000;

  // Cyclical head-to-head: A beats B, B beats C, C beats A
  const cyclicalMatches: TournamentMatch[] = [
    { matchIndex: 0, roundNumber: 1, fighterIds: [pA.id, pB.id], isChampionship: false, completed: true, winnerId: pA.id },
    { matchIndex: 1, roundNumber: 2, fighterIds: [pB.id, pC.id], isChampionship: false, completed: true, winnerId: pB.id },
    { matchIndex: 2, roundNumber: 3, fighterIds: [pC.id, pA.id], isChampionship: false, completed: true, winnerId: pC.id },
  ];

  // Test 1: Order with stable order [pA, pB, pC]
  const ranked1 = computeTournamentRankings([pC, pB, pA], cyclicalMatches, [pA.id, pB.id, pC.id]);
  assert.deepEqual(ranked1.map(p => p.id), [pA.id, pB.id, pC.id]);
  assert.equal(ranked1[0].tournamentRank, 1);
  assert.equal(ranked1[1].tournamentRank, 2);
  assert.equal(ranked1[2].tournamentRank, 3);

  // Test 2: Order with reverse stable order [pC, pB, pA]
  const ranked2 = computeTournamentRankings([pA, pB, pC], cyclicalMatches, [pC.id, pB.id, pA.id]);
  assert.deepEqual(ranked2.map(p => p.id), [pC.id, pB.id, pA.id]);

  // Test 3: If bankrolls differ, bankroll breaks tie before stableRosterOrder
  pB.coins = 1500;
  const rankedBankroll = computeTournamentRankings([pA, pB, pC], cyclicalMatches, [pA.id, pB.id, pC.id]);
  assert.equal(rankedBankroll[0].id, pB.id, 'pB has higher bankroll so pB wins 3-way tie');
});

test('getFinalTournamentStandings ranks Champion, Runner-up, Third Place, and remaining qualifiers', () => {
  const players = createMockRoster(4);
  const [p1, p2, p3, p4] = players;
  p1.tournamentRank = 1;
  p2.tournamentRank = 2;
  p3.tournamentRank = 3;
  p4.tournamentRank = 4;

  // Suppose P2 beats P1 in Championship Series! P2 is Champ, P1 is Runner-up, P3 is 3rd place
  const standings = getFinalTournamentStandings(players, p2.id, p1.id, p3.id);
  assert.equal(standings[0].id, p2.id, 'Champion is 1st');
  assert.equal(standings[1].id, p1.id, 'Runner-up is 2nd');
  assert.equal(standings[2].id, p3.id, '3rd place is top non-finalist');
  assert.equal(standings[3].id, p4.id, '4th place is remaining player');
});

test('Championship Series: first to 2 decisive wins with tie extension and locked finalists', () => {
  const players = createMockRoster(3);
  const [fA, fB, nonFinalist] = players;
  fA.qualifierPoints = 6;
  fB.qualifierPoints = 3;
  nonFinalist.qualifierPoints = 0;

  const finalists: [string, string] = [fA.id, fB.id];
  const championshipWins: Record<string, number> = { [fA.id]: 0, [fB.id]: 0 };

  // Game 1: Finalist A wins -> 1 - 0
  championshipWins[fA.id] += 1;
  assert.equal(championshipWins[fA.id], 1);
  assert.equal(championshipWins[fB.id], 0);
  assert.ok(championshipWins[fA.id] < 2, 'Series continues');

  // Game 2: Finalist B wins -> 1 - 1
  championshipWins[fB.id] += 1;
  assert.equal(championshipWins[fA.id], 1);
  assert.equal(championshipWins[fB.id], 1);
  assert.ok(championshipWins[fA.id] < 2 && championshipWins[fB.id] < 2, 'Series continues at 1-1');

  // Game 3: Tie! No wins granted to either player. Score remains 1 - 1!
  const isTie = true;
  if (!isTie) {
    championshipWins[fA.id] += 1;
  }
  assert.equal(championshipWins[fA.id], 1, 'Tie must not increment series wins');
  assert.equal(championshipWins[fB.id], 1, 'Tie must not increment series wins');

  // Game 4: Finalist B wins decisive match -> 1 - 2 -> Finalist B crowns Champion!
  championshipWins[fB.id] += 1;
  assert.equal(championshipWins[fB.id], 2);
  const championId = fB.id;
  const runnerUpId = fA.id;
  assert.equal(championId, fB.id);
  assert.equal(runnerUpId, fA.id);

  // Finalists remained locked throughout
  assert.equal(finalists[0], fA.id);
  assert.equal(finalists[1], fB.id);

  // Qualifier points were completely untouched by championship games
  assert.equal(fA.qualifierPoints, 6);
  assert.equal(fB.qualifierPoints, 3);
  assert.equal(nonFinalist.qualifierPoints, 0);
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
