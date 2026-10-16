/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Dynamic Odds & Payout Engine
 * 
 * Implements the core mathematical formulas:
 *   Odds_PlayerA = 1 + (WinRate_PlayerB / WinRate_PlayerA) * RiskFactor
 * combined with Laplace smoothing and live pari-mutuel pool balancing.
 */

import type { FighterOdds, Player, SecretBet } from './types.ts';

export interface OddsCalculationConfig {
  riskFactor?: number;      // Default 1.0 (scales underdog vs favorite disparity)
  laplaceAlpha?: number;    // Prior wins (default 1)
  laplaceBeta?: number;     // Prior total matches (default 2)
  minOdds?: number;         // Minimum floor (default 1.10x)
  maxOdds?: number;         // Maximum ceiling (default 9.50x)
  houseVig?: number;        // House buffer/cut (default 0.05 = 5%)
}

const DEFAULT_CONFIG: Required<OddsCalculationConfig> = {
  riskFactor: 1.0,
  laplaceAlpha: 1,
  laplaceBeta: 2,
  minOdds: 1.10,
  maxOdds: 9.50,
  houseVig: 0.05,
};

/**
 * Calculates Laplace-smoothed win rate for stable zero-division prevention.
 * Formula: (wins + alpha) / (played + beta)
 */
export function calculateSmoothedWinRate(
  matchesWon: number,
  matchesPlayed: number,
  alpha = 1,
  beta = 2
): number {
  const safeWon = Math.max(0, matchesWon);
  const safePlayed = Math.max(safeWon, matchesPlayed);
  return (safeWon + alpha) / (safePlayed + beta);
}

/**
 * Converts decimal odds to common fractional representation.
 */
export function decimalToFractional(decimalOdds: number): string {
  const profit = Math.max(0.1, decimalOdds - 1);
  if (Math.abs(profit - 1.0) < 0.05) return '1/1';
  if (Math.abs(profit - 0.5) < 0.05) return '1/2';
  if (Math.abs(profit - 1.5) < 0.05) return '3/2';
  if (Math.abs(profit - 2.0) < 0.05) return '2/1';
  if (Math.abs(profit - 2.5) < 0.05) return '5/2';
  if (Math.abs(profit - 3.0) < 0.05) return '3/1';
  if (Math.abs(profit - 4.0) < 0.05) return '4/1';
  if (Math.abs(profit - 5.0) < 0.05) return '5/1';

  // Approximate fraction with denominator up to 10
  let bestNum = Math.round(profit);
  let bestDen = 1;
  let minError = Math.abs(profit - bestNum);

  for (let den = 2; den <= 8; den++) {
    const num = Math.round(profit * den);
    const error = Math.abs(profit - num / den);
    if (error < minError) {
      minError = error;
      bestNum = num;
      bestDen = den;
    }
  }

  return `${bestNum}/${bestDen}`;
}

/**
 * Calculates dynamic odds for two competing fighters, factoring in
 * historical win rates and current live spectator bets in the pool.
 */
export function calculateDynamicOdds(
  fighterA: Player,
  fighterB: Player,
  currentBets: SecretBet[] = [],
  config: OddsCalculationConfig = {}
): Record<string, FighterOdds> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // 1. Calculate smoothed win rates
  const winRateA = calculateSmoothedWinRate(
    fighterA.matchesWon,
    fighterA.matchesPlayed,
    cfg.laplaceAlpha,
    cfg.laplaceBeta
  );
  const winRateB = calculateSmoothedWinRate(
    fighterB.matchesWon,
    fighterB.matchesPlayed,
    cfg.laplaceAlpha,
    cfg.laplaceBeta
  );

  // 2. Base formula: Odds_A = 1 + (WinRate_B / WinRate_A) * RiskFactor
  const ratioA = winRateB / winRateA;
  const ratioB = winRateA / winRateB;

  const baseOddsA = 1 + ratioA * cfg.riskFactor;
  const baseOddsB = 1 + ratioB * cfg.riskFactor;

  // 3. Pool analysis from live bets
  let poolCoinsA = 0;
  let poolCoinsB = 0;
  let countA = 0;
  let countB = 0;

  for (const bet of currentBets) {
    if (bet.fighterId === fighterA.id) {
      poolCoinsA += bet.amount;
      countA++;
    } else if (bet.fighterId === fighterB.id) {
      poolCoinsB += bet.amount;
      countB++;
    }
  }

  const totalPool = poolCoinsA + poolCoinsB;

  let finalOddsA = baseOddsA;
  let finalOddsB = baseOddsB;

  // 4. Pari-mutuel blend if bets have been placed
  if (totalPool > 0) {
    const virtualSeed = 300; // Stabilizing seed coins
    const effectiveTotal = totalPool + virtualSeed * 2;
    const effectiveA = poolCoinsA + virtualSeed;
    const effectiveB = poolCoinsB + virtualSeed;

    const poolOddsA = (effectiveTotal / effectiveA) * (1 - cfg.houseVig);
    const poolOddsB = (effectiveTotal / effectiveB) * (1 - cfg.houseVig);

    // Blending weight shifts toward pool as bet volume grows (max 65% pool influence)
    const poolWeight = Math.min(0.65, totalPool / 1500);
    finalOddsA = (1 - poolWeight) * baseOddsA + poolWeight * poolOddsA;
    finalOddsB = (1 - poolWeight) * baseOddsB + poolWeight * poolOddsB;
  }

  // 5. Apply floor and ceiling clamping
  finalOddsA = Math.max(cfg.minOdds, Math.min(cfg.maxOdds, Math.round(finalOddsA * 100) / 100));
  finalOddsB = Math.max(cfg.minOdds, Math.min(cfg.maxOdds, Math.round(finalOddsB * 100) / 100));

  // Implied probabilities (sum normalized)
  const rawProbA = 1 / finalOddsA;
  const rawProbB = 1 / finalOddsB;
  const probSum = rawProbA + rawProbB;
  const impliedWinProbA = Math.round((rawProbA / probSum) * 100) / 100;
  const impliedWinProbB = Math.round((rawProbB / probSum) * 100) / 100;

  return {
    [fighterA.id]: {
      fighterId: fighterA.id,
      decimalOdds: finalOddsA,
      fractionalOdds: decimalToFractional(finalOddsA),
      impliedWinProb: impliedWinProbA,
      smoothedWinRate: Math.round(winRateA * 100) / 100,
      totalPoolCoins: poolCoinsA,
      bettorCount: countA,
    },
    [fighterB.id]: {
      fighterId: fighterB.id,
      decimalOdds: finalOddsB,
      fractionalOdds: decimalToFractional(finalOddsB),
      impliedWinProb: impliedWinProbB,
      smoothedWinRate: Math.round(winRateB * 100) / 100,
      totalPoolCoins: poolCoinsB,
      bettorCount: countB,
    },
  };
}

/**
 * Calculates net return for a placed bet.
 */
export function calculatePotentialReturn(amount: number, decimalOdds: number): number {
  return Math.floor(amount * decimalOdds);
}

/**
 * Computes all payouts at the conclusion of a round.
 */
export function computeRoundPayouts(
  winnerId: string,
  fighterIds: [string, string],
  matchPot: number,
  bets: SecretBet[],
  players: Player[]
): {
  payouts: Array<{
    playerId: string;
    coinsChange: number;
    reason: string;
    newTotal: number;
  }>;
  updatedPlayers: Player[];
} {
  const playerMap = new Map<string, Player>(players.map(p => [p.id, { ...p }]));
  const payouts: Array<{
    playerId: string;
    coinsChange: number;
    reason: string;
    newTotal: number;
  }> = [];

  // 1. Process winning fighter match pot
  const winningFighter = playerMap.get(winnerId);
  const losingFighterId = fighterIds[0] === winnerId ? fighterIds[1] : fighterIds[0];
  const losingFighter = playerMap.get(losingFighterId);

  if (winningFighter) {
    winningFighter.coins += matchPot;
    winningFighter.matchesWon += 1;
    winningFighter.matchesPlayed += 1;
    payouts.push({
      playerId: winningFighter.id,
      coinsChange: matchPot,
      reason: `BRAWL VICTORY: Match Pot (+${matchPot}c)`,
      newTotal: winningFighter.coins,
    });
  }

  if (losingFighter) {
    losingFighter.matchesPlayed += 1;
  }

  // 2. Process spectator secret bets
  for (const bet of bets) {
    const bettor = playerMap.get(bet.bettorId);
    if (!bettor) continue;

    if (bet.fighterId === winnerId) {
      // Won bet! Total return = amount * oddsAtBet
      const totalReturn = Math.floor(bet.amount * bet.oddsAtBet);
      const netGain = totalReturn - bet.amount;
      bettor.coins += totalReturn; // bet amount was deducted when bet was placed
      bettor.totalBetsWon += 1;
      bettor.totalCoinsWonInBets += netGain;

      if (totalReturn > bettor.highestSinglePayout) {
        bettor.highestSinglePayout = totalReturn;
      }

      payouts.push({
        playerId: bettor.id,
        coinsChange: totalReturn,
        reason: `Winning Bet: ${bet.amount}c on ${winningFighter?.name || 'Winner'} @ ${bet.oddsAtBet.toFixed(2)}x`,
        newTotal: bettor.coins,
      });
    } else {
      // Lost bet
      bettor.totalCoinsLostInBets += bet.amount;
      payouts.push({
        playerId: bettor.id,
        coinsChange: 0, // already deducted at placement
        reason: `Lost Bet: ${bet.amount}c on ${losingFighter?.name || 'Opponent'}`,
        newTotal: bettor.coins,
      });
    }
  }

  const updatedPlayers = Array.from(playerMap.values());
  return { payouts, updatedPlayers };
}
