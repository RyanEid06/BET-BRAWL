import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSmoothedWinRate,
  calculateDynamicOdds,
  decimalToFractional,
  calculatePotentialReturn,
  computeRoundPayouts
} from './odds.ts';
import type { Player, SecretBet } from './types.ts';

const mockPlayerA: Player = {
  id: 'p1',
  name: 'Viper',
  avatar: '🐍',
  color: '#ef4444',
  isHost: true,
  isReady: true,
  coins: 1000,
  matchesWon: 4,
  matchesPlayed: 5,
  totalBetsPlaced: 3,
  totalBetsWon: 2,
  totalCoinsWonInBets: 400,
  totalCoinsLostInBets: 100,
  highestSingleBet: 250,
  highestSinglePayout: 500,
};

const mockPlayerB: Player = {
  id: 'p2',
  name: 'Titan',
  avatar: '🦾',
  color: '#3b82f6',
  isHost: false,
  isReady: true,
  coins: 1000,
  matchesWon: 1,
  matchesPlayed: 5,
  totalBetsPlaced: 2,
  totalBetsWon: 1,
  totalCoinsWonInBets: 150,
  totalCoinsLostInBets: 100,
  highestSingleBet: 100,
  highestSinglePayout: 250,
};

test('Laplace smoothing handles zero matches without division by zero', () => {
  const rate = calculateSmoothedWinRate(0, 0);
  assert.equal(rate, 0.5); // (0+1)/(0+2) = 0.5
});

test('Smoothed win rate calculates accurately for experienced players', () => {
  // Player A: 4 wins / 5 played -> (4+1)/(5+2) = 5/7 ~ 0.714
  const rateA = calculateSmoothedWinRate(4, 5);
  assert.ok(Math.abs(rateA - 0.714) < 0.01);

  // Player B: 1 win / 5 played -> (1+1)/(5+2) = 2/7 ~ 0.285
  const rateB = calculateSmoothedWinRate(1, 5);
  assert.ok(Math.abs(rateB - 0.285) < 0.01);
});

test('Dynamic odds assigns underdog higher multiplier and favorite lower multiplier', () => {
  const odds = calculateDynamicOdds(mockPlayerA, mockPlayerB, []);
  
  const oddsA = odds[mockPlayerA.id].decimalOdds;
  const oddsB = odds[mockPlayerB.id].decimalOdds;

  // Favorite (A) should have lower odds than Underdog (B)
  assert.ok(oddsA < oddsB, `Expected favorite A (${oddsA}) to have lower odds than B (${oddsB})`);
  assert.ok(oddsA >= 1.10, 'Odds must never drop below 1.10x floor');
  assert.ok(oddsB <= 9.50, 'Odds must not exceed max ceiling');
});

test('Pari-mutuel bet shift adjusts odds dynamically when spectators place heavy bets', () => {
  // Initial odds without bets
  const initialOdds = calculateDynamicOdds(mockPlayerA, mockPlayerB, []);

  // Now 4 spectators bet heavily on Player B (the underdog)
  const heavyBetsOnB: SecretBet[] = [
    { bettorId: 's1', fighterId: mockPlayerB.id, amount: 300, oddsAtBet: 3.0, timestamp: 1, potentialReturn: 900 },
    { bettorId: 's2', fighterId: mockPlayerB.id, amount: 400, oddsAtBet: 3.0, timestamp: 2, potentialReturn: 1200 },
    { bettorId: 's3', fighterId: mockPlayerB.id, amount: 300, oddsAtBet: 3.0, timestamp: 3, potentialReturn: 900 },
  ];

  const shiftedOdds = calculateDynamicOdds(mockPlayerA, mockPlayerB, heavyBetsOnB);

  // Because heavy pool bets poured into B, B's odds should compress downward compared to initial
  assert.ok(
    shiftedOdds[mockPlayerB.id].decimalOdds < initialOdds[mockPlayerB.id].decimalOdds,
    'Heavy bets on B should compress B payout odds'
  );
});

test('Fractional odds conversion formats correctly', () => {
  assert.equal(decimalToFractional(2.0), '1/1');
  assert.equal(decimalToFractional(1.5), '1/2');
  assert.equal(decimalToFractional(3.0), '2/1');
});

test('Potential return calculation computes floor return', () => {
  assert.equal(calculatePotentialReturn(100, 2.45), 245);
  assert.equal(calculatePotentialReturn(50, 1.33), 66);
});

test('computeRoundPayouts awards match pot to winner and returns to correct bettor', () => {
  const spectator: Player = {
    id: 's1',
    name: 'Lucky',
    avatar: '🎲',
    color: '#10b981',
    isHost: false,
    isReady: true,
    coins: 900, // placed 100c bet already deducted
    matchesWon: 0,
    matchesPlayed: 0,
    totalBetsPlaced: 1,
    totalBetsWon: 0,
    totalCoinsWonInBets: 0,
    totalCoinsLostInBets: 0,
    highestSingleBet: 100,
    highestSinglePayout: 0,
  };

  const bets: SecretBet[] = [
    { bettorId: 's1', fighterId: mockPlayerA.id, amount: 100, oddsAtBet: 1.5, timestamp: 1, potentialReturn: 150 },
  ];

  const matchPot = 250;
  const result = computeRoundPayouts(
    mockPlayerA.id,
    [mockPlayerA.id, mockPlayerB.id],
    matchPot,
    bets,
    [mockPlayerA, mockPlayerB, spectator]
  );

  const updatedWinner = result.updatedPlayers.find(p => p.id === mockPlayerA.id);
  const updatedSpectator = result.updatedPlayers.find(p => p.id === 's1');

  assert.equal(updatedWinner?.coins, 1000 + 250, 'Winner gets match pot');
  assert.equal(updatedWinner?.matchesWon, 5, 'Winner match count incremented');
  assert.equal(updatedSpectator?.coins, 900 + 150, 'Spectator gets 150c payout');
  assert.equal(updatedSpectator?.totalBetsWon, 1, 'Spectator won count incremented');
});
