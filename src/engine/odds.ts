/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Dynamic Odds & Payout Engine
 * 
 * Implements:
 *   Odds_PlayerA = 1 + (WinRate_PlayerB / WinRate_PlayerA) * RiskFactor
 * combined with Laplace smoothing, live spectator pool weighting,
 * strict bet validation, authoritative timestamp boundaries, and honest net profit/loss calculations.
 */

import type { FighterOdds, Player, SecretBet, RoundState, RoundPayoutItem } from './types.ts';

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
 * Calculates dynamic odds for two competing fighters, factoring in
 * session win rates and current live spectator bets in the pool.
 */
export function calculateDynamicOdds(
  fighterA: Player,
  fighterB: Player,
  currentBets: SecretBet[] = [],
  config: OddsCalculationConfig = {}
): Record<string, FighterOdds> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // 1. Calculate smoothed win rates from genuine session stats
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
    const virtualSeed = 300;
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

  return {
    [fighterA.id]: {
      fighterId: fighterA.id,
      decimalOdds: finalOddsA,
      smoothedWinRate: Math.round(winRateA * 100) / 100,
      totalPoolCoins: poolCoinsA,
      bettorCount: countA,
    },
    [fighterB.id]: {
      fighterId: fighterB.id,
      decimalOdds: finalOddsB,
      smoothedWinRate: Math.round(winRateB * 100) / 100,
      totalPoolCoins: poolCoinsB,
      bettorCount: countB,
    },
  };
}

/**
 * Validates a secret bet request server-side before execution.
 * Checks authoritative timestamps as well as remaining integer countdown.
 * Returns null if valid, or a descriptive error string if invalid.
 */
export function validateBetPlacement(
  bettor: Player | undefined,
  fighterId: string,
  amount: number,
  round: RoundState | null,
  currentPhase: string,
  serverNowMs?: number
): string | null {
  if (currentPhase !== 'BETTING_WINDOW') {
    return 'Betting window is closed';
  }
  if (!round) {
    return 'No active round';
  }

  const now = serverNowMs ?? Date.now();
  if (round.bettingEndsAt !== undefined && now >= round.bettingEndsAt) {
    return 'Betting time has expired';
  }
  if (round.bettingTimeRemaining <= 0) {
    return 'Betting time has expired';
  }

  if (!bettor) {
    return 'Player not found';
  }
  if (!Number.isInteger(amount) || amount <= 0 || !Number.isFinite(amount)) {
    return 'Bet amount must be a positive whole number';
  }
  if (bettor.coins < amount) {
    return `Insufficient coins: bankroll is ${bettor.coins}`;
  }
  if (bettor.id === round.fighterIds[0] || bettor.id === round.fighterIds[1]) {
    return 'Fighters cannot place bets on their own brawl';
  }
  if (fighterId !== round.fighterIds[0] && fighterId !== round.fighterIds[1]) {
    return 'Invalid target fighter';
  }
  if (round.bets.some(b => b.bettorId === bettor.id)) {
    return 'You have already placed a bet for this round';
  }

  return null;
}

/**
 * Calculates potential return for a placed bet.
 */
export function calculatePotentialReturn(amount: number, decimalOdds: number): number {
  return Math.floor(amount * decimalOdds);
}

/**
 * Computes all payouts at the conclusion of a round.
 * Distinctly separates fighter bounties, gross returns, and net profit/loss.
 */
export function computeRoundPayouts(
  winnerId: string | null,
  isTie: boolean,
  fighterIds: [string, string],
  matchPot: number,
  bets: SecretBet[],
  players: Player[]
): {
  payouts: RoundPayoutItem[];
  updatedPlayers: Player[];
} {
  const playerMap = new Map<string, Player>(players.map(p => [p.id, { ...p }]));
  const payouts: RoundPayoutItem[] = [];

  const fighterA = playerMap.get(fighterIds[0]);
  const fighterB = playerMap.get(fighterIds[1]);

  if (isTie || !winnerId) {
    // Tie handling: split match pot, refund bets
    if (fighterA) {
      const splitPot = Math.floor(matchPot / 2);
      fighterA.coins += splitPot;
      fighterA.matchesPlayed += 1;
      payouts.push({
        playerId: fighterA.id,
        playerName: fighterA.name,
        avatar: fighterA.avatar,
        type: 'FIGHTER_BOUNTY',
        netChange: splitPot,
        newBankroll: fighterA.coins,
        summary: `TIE SPLIT: +${splitPot} coins`,
      });
    }
    if (fighterB) {
      const splitPot = Math.floor(matchPot / 2);
      fighterB.coins += splitPot;
      fighterB.matchesPlayed += 1;
      payouts.push({
        playerId: fighterB.id,
        playerName: fighterB.name,
        avatar: fighterB.avatar,
        type: 'FIGHTER_BOUNTY',
        netChange: splitPot,
        newBankroll: fighterB.coins,
        summary: `TIE SPLIT: +${splitPot} coins`,
      });
    }

    // Refund bets on tie
    for (const bet of bets) {
      const bettor = playerMap.get(bet.bettorId);
      if (!bettor) continue;
      bettor.coins += bet.amount; // Refund
      payouts.push({
        playerId: bettor.id,
        playerName: bettor.name,
        avatar: bettor.avatar,
        type: 'BET_REFUND',
        stake: bet.amount,
        totalReturn: bet.amount,
        netChange: 0,
        newBankroll: bettor.coins,
        summary: `BRAWL TIE: ${bet.amount} coins refunded · 0 net`,
      });
    }

    return { payouts, updatedPlayers: Array.from(playerMap.values()) };
  }

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
      playerName: winningFighter.name,
      avatar: winningFighter.avatar,
      type: 'FIGHTER_BOUNTY',
      netChange: matchPot,
      newBankroll: winningFighter.coins,
      summary: `BRAWL VICTOR (+${matchPot}c bounty)`,
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
      // Won bet! Total return = floor(amount * oddsAtBet)
      const totalReturn = Math.floor(bet.amount * bet.oddsAtBet);
      const netGain = totalReturn - bet.amount;
      bettor.coins += totalReturn; // (stake was deducted when bet was placed)
      bettor.totalBetsWon += 1;
      bettor.totalCoinsWonInBets += netGain;

      if (totalReturn > bettor.highestSinglePayout) {
        bettor.highestSinglePayout = totalReturn;
      }

      payouts.push({
        playerId: bettor.id,
        playerName: bettor.name,
        avatar: bettor.avatar,
        type: 'BET_WIN',
        stake: bet.amount,
        totalReturn,
        netChange: netGain,
        newBankroll: bettor.coins,
        summary: `${totalReturn} returned · +${netGain} profit`,
      });
    } else {
      // Lost bet: Stake was already deducted, net loss is -stake
      bettor.totalCoinsLostInBets += bet.amount;
      payouts.push({
        playerId: bettor.id,
        playerName: bettor.name,
        avatar: bettor.avatar,
        type: 'BET_LOSS',
        stake: bet.amount,
        totalReturn: 0,
        netChange: -bet.amount,
        newBankroll: bettor.coins,
        summary: `-${bet.amount} loss on ${losingFighter?.name || 'Fighter'}`,
      });
    }
  }

  const updatedPlayers = Array.from(playerMap.values());
  return { payouts, updatedPlayers };
}
