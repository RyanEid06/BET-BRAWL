import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSmoothedWinRate,
  calculateDynamicOdds,
  validateBetPlacement,
  calculatePotentialReturn,
  computeRoundPayouts,
} from './odds.ts';
import type { Player, SecretBet, RoundState } from './types.ts';
import { MINI_GAMES } from './miniGamesCatalog.ts';

const mockFighterA: Player = {
  id: 'f1',
  sessionToken: 'tok_f1',
  name: 'Viper',
  avatar: '🐍',
  color: '#ef4444',
  isHost: true,
  isReady: true,
  connected: true,
  coins: 1000,
  matchesWon: 4,
  matchesPlayed: 5,
  totalBetsPlaced: 0,
  totalBetsWon: 0,
  totalCoinsWonInBets: 0,
  totalCoinsLostInBets: 0,
  highestSingleBet: 0,
  highestSinglePayout: 0,
  qualifierPoints: 6,
  qualifierWins: 2,
  qualifierTies: 0,
  qualifierLosses: 0,
  qualifierMatchesPlayed: 2,
};

const mockFighterB: Player = {
  id: 'f2',
  sessionToken: 'tok_f2',
  name: 'Titan',
  avatar: '🦾',
  color: '#3b82f6',
  isHost: false,
  isReady: true,
  connected: true,
  coins: 1000,
  matchesWon: 1,
  matchesPlayed: 5,
  totalBetsPlaced: 0,
  totalBetsWon: 0,
  totalCoinsWonInBets: 0,
  totalCoinsLostInBets: 0,
  highestSingleBet: 0,
  highestSinglePayout: 0,
  qualifierPoints: 3,
  qualifierWins: 1,
  qualifierTies: 0,
  qualifierLosses: 1,
  qualifierMatchesPlayed: 2,
};

const mockSpectator: Player = {
  id: 's1',
  sessionToken: 'tok_s1',
  name: 'Lucky',
  avatar: '🎲',
  color: '#10b981',
  isHost: false,
  isReady: true,
  connected: true,
  coins: 800,
  matchesWon: 0,
  matchesPlayed: 0,
  totalBetsPlaced: 0,
  totalBetsWon: 0,
  totalCoinsWonInBets: 0,
  totalCoinsLostInBets: 0,
  highestSingleBet: 0,
  highestSinglePayout: 0,
  qualifierPoints: 0,
  qualifierWins: 0,
  qualifierTies: 0,
  qualifierLosses: 0,
  qualifierMatchesPlayed: 0,
};

const mockRound: RoundState = {
  roundNumber: 1,
  maxRounds: 8,
  miniGame: MINI_GAMES.millisecond_stop,
  fighterIds: ['f1', 'f2'],
  matchPot: 250,
  odds: {},
  bets: [],
  bettingTimeRemaining: 15,
  gameTimeRemaining: 9,
  winnerId: null,
  fighterScores: {},
  payouts: [],
};

test('Laplace smoothing handles zero matches without division by zero', () => {
  const rate = calculateSmoothedWinRate(0, 0);
  assert.equal(rate, 0.5); // (0+1)/(0+2) = 0.5
});

test('Smoothed win rate calculates accurately for experienced players', () => {
  const rateA = calculateSmoothedWinRate(4, 5);
  assert.ok(Math.abs(rateA - 0.714) < 0.01);

  const rateB = calculateSmoothedWinRate(1, 5);
  assert.ok(Math.abs(rateB - 0.285) < 0.01);
});

test('Dynamic odds assigns underdog higher multiplier and favorite lower multiplier', () => {
  const odds = calculateDynamicOdds(mockFighterA, mockFighterB, []);
  const oddsA = odds[mockFighterA.id].decimalOdds;
  const oddsB = odds[mockFighterB.id].decimalOdds;

  assert.ok(oddsA < oddsB, `Expected favorite A (${oddsA}) < underdog B (${oddsB})`);
  assert.ok(oddsA >= 1.10, 'Odds must never drop below 1.10x floor');
  assert.ok(oddsB <= 9.50, 'Odds must not exceed max ceiling');
});

// Strict Bet Validation Tests
test('validateBetPlacement rejects bets outside BETTING_WINDOW', () => {
  const err = validateBetPlacement(mockSpectator, 'f1', 100, mockRound, 'LOBBY');
  assert.equal(err, 'Betting window is closed');
});

test('validateBetPlacement rejects bets when timer expired', () => {
  const expiredRound = { ...mockRound, bettingTimeRemaining: 0 };
  const err = validateBetPlacement(mockSpectator, 'f1', 100, expiredRound, 'BETTING_WINDOW');
  assert.equal(err, 'Betting time has expired');
});

test('validateBetPlacement authoritative deadline boundaries (bettingEndsAt)', () => {
  const deadline = 100000;
  const timedRound = { ...mockRound, bettingEndsAt: deadline, bettingTimeRemaining: 5 };

  // 1ms before deadline -> allowed
  const beforeErr = validateBetPlacement(mockSpectator, 'f1', 100, timedRound, 'BETTING_WINDOW', deadline - 1);
  assert.equal(beforeErr, null, '1ms before deadline must be allowed');

  // Exactly at deadline -> rejected
  const atErr = validateBetPlacement(mockSpectator, 'f1', 100, timedRound, 'BETTING_WINDOW', deadline);
  assert.equal(atErr, 'Betting time has expired', 'At deadline must be rejected');

  // 1ms after deadline -> rejected
  const afterErr = validateBetPlacement(mockSpectator, 'f1', 100, timedRound, 'BETTING_WINDOW', deadline + 1);
  assert.equal(afterErr, 'Betting time has expired', 'After deadline must be rejected');
});

test('validateBetPlacement rejects non-positive, non-integer, or non-finite amounts', () => {
  assert.ok(validateBetPlacement(mockSpectator, 'f1', 0, mockRound, 'BETTING_WINDOW') !== null);
  assert.ok(validateBetPlacement(mockSpectator, 'f1', -50, mockRound, 'BETTING_WINDOW') !== null);
  assert.ok(validateBetPlacement(mockSpectator, 'f1', 50.5, mockRound, 'BETTING_WINDOW') !== null);
  assert.ok(validateBetPlacement(mockSpectator, 'f1', NaN, mockRound, 'BETTING_WINDOW') !== null);
  assert.ok(validateBetPlacement(mockSpectator, 'f1', Infinity, mockRound, 'BETTING_WINDOW') !== null);
});

test('validateBetPlacement rejects bets exceeding bankroll', () => {
  const err = validateBetPlacement(mockSpectator, 'f1', 1200, mockRound, 'BETTING_WINDOW');
  assert.ok(err?.includes('Insufficient coins'));
});

test('validateBetPlacement rejects fighters betting on own match', () => {
  const errA = validateBetPlacement(mockFighterA, 'f1', 100, mockRound, 'BETTING_WINDOW');
  const errB = validateBetPlacement(mockFighterB, 'f2', 100, mockRound, 'BETTING_WINDOW');
  assert.ok(errA?.includes('Fighters cannot place bets'));
  assert.ok(errB?.includes('Fighters cannot place bets'));
});

test('validateBetPlacement rejects betting on a non-competing player', () => {
  const err = validateBetPlacement(mockSpectator, 'unknown_id', 100, mockRound, 'BETTING_WINDOW');
  assert.equal(err, 'Invalid target fighter');
});

test('validateBetPlacement rejects duplicate bets from same spectator in one round', () => {
  const roundWithBet: RoundState = {
    ...mockRound,
    bets: [
      {
        bettorId: mockSpectator.id,
        fighterId: 'f1',
        amount: 100,
        oddsAtBet: 1.5,
        timestamp: Date.now(),
        potentialReturn: 150,
      },
    ],
  };

  const err = validateBetPlacement(mockSpectator, 'f2', 100, roundWithBet, 'BETTING_WINDOW');
  assert.ok(err?.includes('already placed a bet'));
});

// Payout and Net Profit/Loss Tests
test('computeRoundPayouts computes honest net profit on win and negative net on loss', () => {
  const spectatorWin: Player = { ...mockSpectator, id: 's_win', coins: 800 }; // 200c staked
  const spectatorLose: Player = { ...mockSpectator, id: 's_lose', coins: 900 }; // 100c staked

  const bets: SecretBet[] = [
    { bettorId: 's_win', fighterId: 'f1', amount: 200, oddsAtBet: 1.80, timestamp: 1, potentialReturn: 360 },
    { bettorId: 's_lose', fighterId: 'f2', amount: 100, oddsAtBet: 2.20, timestamp: 2, potentialReturn: 220 },
  ];

  const result = computeRoundPayouts(
    'f1', // Fighter A wins
    false,
    ['f1', 'f2'],
    250,
    bets,
    [mockFighterA, mockFighterB, spectatorWin, spectatorLose]
  );

  const winningPayout = result.payouts.find(p => p.playerId === 's_win')!;
  const losingPayout = result.payouts.find(p => p.playerId === 's_lose')!;
  const fighterPayout = result.payouts.find(p => p.playerId === 'f1')!;

  // Winning bet
  assert.equal(winningPayout.type, 'BET_WIN');
  assert.equal(winningPayout.totalReturn, 360);
  assert.equal(winningPayout.netChange, 160); // +160 net profit!
  assert.equal(winningPayout.newBankroll, 800 + 360);
  assert.ok(winningPayout.summary.includes('+160 profit'));

  // Losing bet
  assert.equal(losingPayout.type, 'BET_LOSS');
  assert.equal(losingPayout.totalReturn, 0);
  assert.equal(losingPayout.netChange, -100); // Honest -100 loss!
  assert.ok(losingPayout.summary.includes('-100 loss'));

  // Fighter bounty
  assert.equal(fighterPayout.type, 'FIGHTER_BOUNTY');
  assert.equal(fighterPayout.netChange, 250);
});

test('computeRoundPayouts handles tie by splitting pot and refunding bets', () => {
  const bets: SecretBet[] = [
    { bettorId: 's1', fighterId: 'f1', amount: 150, oddsAtBet: 1.80, timestamp: 1, potentialReturn: 270 },
  ];

  const result = computeRoundPayouts(
    null,
    true, // isTie
    ['f1', 'f2'],
    250,
    bets,
    [mockFighterA, mockFighterB, { ...mockSpectator, coins: 650 }]
  );

  const refund = result.payouts.find(p => p.playerId === 's1')!;
  assert.equal(refund.type, 'BET_REFUND');
  assert.equal(refund.netChange, 0);
  assert.equal(refund.totalReturn, 150);
  assert.equal(refund.newBankroll, 650 + 150); // Refunded
  assert.ok(refund.summary.includes('refunded'));
  assert.ok(refund.summary.includes('0 net'));
});
