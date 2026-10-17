/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Authoritative Room, Session & Fighter Rotation Engine
 */

import crypto from 'crypto';
import type { Player, RoundState, Award, MiniGameId, TournamentMatch, TournamentSchedule } from './types.ts';
import { calculateDynamicOdds } from './odds.ts';
import { MINI_GAMES } from './miniGamesCatalog.ts';
import { initMiniGameServerState, InternalGameState } from './gameEngine.ts';

const PLAYER_COLORS = [
  '#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6',
  '#ec4899', '#3b82f6', '#14b8a6', '#f97316'
];

export const MIN_PLAYERS_TO_START = 3;
export const MAX_PLAYERS_CAPACITY = 9;

export function getRandomPlayerColor(): string {
  return PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
}

export function generateRoomCode(): string {
  const words = ['BRAWL', 'FIGHT', 'CLASH', 'VIPER', 'TITAN', 'SWIFT', 'SPARK', 'TURBO', 'BLITZ', 'ARENA'];
  return words[Math.floor(Math.random() * words.length)];
}

/**
 * Generates a cryptographically strong session token.
 */
export function generateSecureToken(): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      return `tok_${crypto.randomUUID()}`;
    }
    if (typeof crypto.randomBytes === 'function') {
      return `tok_${crypto.randomBytes(16).toString('hex')}`;
    }
  }
  return `tok_${Math.random().toString(36).substring(2, 12)}_${Date.now()}`;
}

/**
 * Generates a cryptographically strong player ID.
 */
export function generateSecurePlayerId(): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      return `p_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
    }
    if (typeof crypto.randomBytes === 'function') {
      return `p_${crypto.randomBytes(5).toString('hex')}`;
    }
  }
  return `p_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Real Fisher-Yates shuffle algorithm.
 */
export function fisherYatesShuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function sanitizePlayerName(raw: string | undefined, isHost = false): string {
  if (!raw || typeof raw !== 'string') return isHost ? 'Host' : 'Brawler';
  const trimmed = raw.trim();
  if (!trimmed) return isHost ? 'Host' : 'Brawler';
  return trimmed.slice(0, 16);
}

export function sanitizePlayerAvatar(raw: string | undefined): string {
  if (!raw || typeof raw !== 'string') return '⚡';
  const trimmed = raw.trim();
  if (!trimmed) return '⚡';
  return trimmed.slice(0, 4);
}

export function createFreshPlayer(
  name: string,
  avatar: string,
  isHost = false,
  sessionToken?: string
): Player {
  const token = sessionToken || generateSecureToken();
  return {
    id: generateSecurePlayerId(),
    sessionToken: token,
    name: sanitizePlayerName(name, isHost),
    avatar: sanitizePlayerAvatar(avatar),
    color: getRandomPlayerColor(),
    isHost,
    isReady: false,
    connected: true,
    coins: 1000,
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
}

/**
 * Fair fighter selection algorithm:
 * - Selects ONLY from connected, eligible players
 * - Strictly prioritizes players with the minimum matches played
 * - Uses Fisher-Yates shuffle so array index never dictates who fights
 * - Avoids repeating the exact same pairing consecutively when possible
 */
export function selectRoundFighters(
  players: Player[],
  lastPairing?: [string, string]
): [string, string] {
  // Only connected players are eligible
  const eligible = players.filter(p => p.connected !== false);
  if (eligible.length < 2) {
    throw new Error('Need at least 2 connected players to select fighters');
  }

  // 1. Group players by matchesPlayed
  const minPlayed = Math.min(...eligible.map(p => p.matchesPlayed));
  const poolMin = eligible.filter(p => p.matchesPlayed === minPlayed);
  
  // Fair Fisher-Yates shuffle
  const shuffledMin = fisherYatesShuffle(poolMin);
  const fighterA = shuffledMin[0];

  // Candidates for Fighter B:
  // Remaining players sorted by matchesPlayed, shuffled within same count
  const remaining = eligible.filter(p => p.id !== fighterA.id);
  const remainingMin = Math.min(...remaining.map(p => p.matchesPlayed));
  const poolB = remaining.filter(p => p.matchesPlayed === remainingMin);
  const shuffledB = fisherYatesShuffle(poolB);

  // Avoid repeating exact pairing if an alternative candidate with same score exists
  let fighterB = shuffledB[0];
  if (
    lastPairing &&
    shuffledB.length > 1 &&
    ((lastPairing[0] === fighterA.id && lastPairing[1] === fighterB.id) ||
     (lastPairing[1] === fighterA.id && lastPairing[0] === fighterB.id))
  ) {
    fighterB = shuffledB[1];
  }

  return [fighterA.id, fighterB.id];
}

export const MINI_GAME_ROTATION: MiniGameId[] = [
  'millisecond_stop',
  'rapid_red_green',
  'speed_math',
  'higher_lower',
  'blind_pinpoint',
  'quick_draw',
];

/**
 * Order circular qualifier matches to minimize back-to-back appearances.
 */
export function orderTournamentMatches(pairs: Array<[string, string]>): Array<[string, string]> {
  if (pairs.length <= 1) return [...pairs];
  const remaining = pairs.map(p => [...p] as [string, string]);
  const ordered: Array<[string, string]> = [];

  // Start with the first pairing
  ordered.push(remaining.shift()!);

  while (remaining.length > 0) {
    const prev = ordered[ordered.length - 1];
    // Find candidate that shares 0 players with the previous match
    let bestIdx = remaining.findIndex(
      p => p[0] !== prev[0] && p[0] !== prev[1] && p[1] !== prev[0] && p[1] !== prev[1]
    );

    // If 0 overlap is not possible (e.g. 3 players or edge cases), pick first
    if (bestIdx === -1) {
      bestIdx = 0;
    }

    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }

  return ordered;
}

/**
 * Constructs a circular qualifier graph from a fairly shuffled roster.
 * Exactly N qualifier brawls for N players (where N is 3-9).
 * - Every player gets exactly 2 qualifier appearances.
 * - Every player faces 2 different opponents.
 * - No duplicate qualifier pairing.
 * - Round N+1 is the Championship Final between the top 2 ranked brawlers.
 */
export function generateTournamentSchedule(players: Player[]): TournamentSchedule {
  const eligible = players.filter(p => p.connected !== false);
  if (eligible.length < MIN_PLAYERS_TO_START) {
    throw new Error(`Tournament requires at least ${MIN_PLAYERS_TO_START} connected players (got ${eligible.length})`);
  }
  if (eligible.length > MAX_PLAYERS_CAPACITY) {
    throw new Error(`Tournament exceeds maximum capacity of ${MAX_PLAYERS_CAPACITY} players`);
  }

  // 1. Freeze and fairly shuffle the session roster
  const shuffled = fisherYatesShuffle(eligible);
  const n = shuffled.length;

  // 2. Construct circular qualifier graph: P0 vs P1, P1 vs P2, ..., P(n-1) vs P0
  const circularPairs: Array<[string, string]> = [];
  for (let i = 0; i < n; i++) {
    circularPairs.push([shuffled[i].id, shuffled[(i + 1) % n].id]);
  }

  // 3. Order matches to minimize back-to-back fighter appearances
  const orderedPairs = orderTournamentMatches(circularPairs);

  // 4. Construct N qualifier matches
  const matches: TournamentMatch[] = orderedPairs.map((pair, idx) => ({
    matchIndex: idx,
    roundNumber: idx + 1,
    fighterIds: pair,
    isChampionship: false,
    completed: false,
    winnerId: null,
  }));

  // 5. Championship Final (Round N+1) placeholder
  matches.push({
    matchIndex: n,
    roundNumber: n + 1,
    fighterIds: ['', ''],
    isChampionship: true,
    completed: false,
    winnerId: null,
  });

  return {
    totalPlayers: n,
    qualifierCount: n,
    totalRounds: n + 1,
    matches,
  };
}

/**
 * Authoritatively computes tournament rankings based primarily on fighting performance:
 * 1. Qualifier Brawl Points DESC (Win = 3, Tie = 1, Loss = 0)
 * 2. Head-to-head match result between tied players
 * 3. Total bankroll / coins DESC
 * 4. Qualifier wins DESC
 * 5. Deterministic fallback (id comparison)
 */
export function computeTournamentRankings(
  players: Player[],
  qualifierMatches: TournamentMatch[]
): Player[] {
  const sorted = [...players].sort((a, b) => {
    // 1. Brawl Points DESC
    if (b.qualifierPoints !== a.qualifierPoints) {
      return b.qualifierPoints - a.qualifierPoints;
    }

    // 2. Head-to-head match tiebreaker: if they fought each other in a completed qualifier
    const h2h = qualifierMatches.find(
      m =>
        m.completed &&
        ((m.fighterIds[0] === a.id && m.fighterIds[1] === b.id) ||
         (m.fighterIds[0] === b.id && m.fighterIds[1] === a.id))
    );
    if (h2h && h2h.winnerId) {
      if (h2h.winnerId === a.id) return -1;
      if (h2h.winnerId === b.id) return 1;
    }

    // 3. Bankroll / coins DESC
    if (b.coins !== a.coins) {
      return b.coins - a.coins;
    }

    // 4. Qualifier wins DESC
    if (b.qualifierWins !== a.qualifierWins) {
      return b.qualifierWins - a.qualifierWins;
    }

    // 5. Stable ID fallback
    return a.id.localeCompare(b.id);
  });

  sorted.forEach((p, idx) => {
    p.tournamentRank = idx + 1;
  });

  return sorted;
}

/**
 * Initializes a new authoritative round along with internal private game state.
 */
export function initAuthoritativeRound(
  roundNumber: number,
  totalRounds: number,
  players: Player[],
  lastPairing?: [string, string],
  explicitFighters?: [string, string],
  isChampionship = false
): { round: RoundState; internalGame: InternalGameState } {
  const gameIndex = (roundNumber - 1) % MINI_GAME_ROTATION.length;
  const miniGameId = MINI_GAME_ROTATION[gameIndex];
  const miniGame = MINI_GAMES[miniGameId];

  const fighterIds = explicitFighters || selectRoundFighters(players, lastPairing);
  const fighterA = players.find(p => p.id === fighterIds[0])!;
  const fighterB = players.find(p => p.id === fighterIds[1])!;

  const initialOdds = calculateDynamicOdds(fighterA, fighterB, []);
  const matchPot = isChampionship ? 500 : 250; // 500c championship bounty, 250c qualifier bounty

  const now = Date.now();
  const revealDurationMs = 4500;
  const revealEndsAt = now + revealDurationMs;
  const bettingEndsAt = revealEndsAt + 15000;
  const countdownDurationMs = 3500;
  const gameStartsAt = bettingEndsAt + countdownDurationMs;
  const gameEndsAt = gameStartsAt + miniGame.durationSeconds * 1000;

  // Initialize server authoritative state and public config via gameEngine
  const { internal: internalGame, publicConfig } = initMiniGameServerState(
    miniGameId,
    fighterIds,
    gameStartsAt
  );

  const round: RoundState = {
    roundNumber,
    maxRounds: totalRounds,
    miniGame,
    fighterIds,
    matchPot,
    odds: initialOdds,
    bets: [],
    bettingTimeRemaining: 15,
    gameTimeRemaining: miniGame.durationSeconds,
    winnerId: null,
    isChampionship,
    fighterScores: {
      [fighterIds[0]]: 0,
      [fighterIds[1]]: 0,
    },
    payouts: [],
    revealEndsAt,
    bettingEndsAt,
    gameStartsAt,
    gameEndsAt,
    gameConfig: publicConfig,
    gameState: {},
  };

  return { round, internalGame };
}

/**
 * Computes end-of-game superlative awards using ONLY genuine current session stats.
 */
export function computeSessionAwards(players: Player[], championId?: string | null): Award[] {
  const awards: Award[] = [];

  // 1. Tournament Champion
  if (championId) {
    const champ = players.find(p => p.id === championId);
    if (champ) {
      awards.push({
        id: 'tournament_champion',
        title: 'Tournament Champion',
        icon: '🏆',
        badgeColor: '#eab308',
        recipientId: champ.id,
        recipientName: champ.name,
        description: 'Crowned Bet & BRAWL Tournament Champion in the Final!',
        metric: `Champion (${champ.qualifierPoints} Brawl Pts)`,
      });
    }
  }

  // 2. Brawl King (most matches won in the ring)
  const mostWins = [...players].sort((a, b) => b.matchesWon - a.matchesWon)[0];
  if (mostWins && mostWins.matchesWon > 0) {
    awards.push({
      id: 'brawl_king',
      title: 'Brawl King',
      icon: '👑',
      badgeColor: '#eab308',
      recipientId: mostWins.id,
      recipientName: mostWins.name,
      description: 'Dominated the arena with the most brawl victories.',
      metric: `${mostWins.matchesWon} Brawl Wins`,
    });
  }

  // 3. High Roller (largest single winning payout)
  const largestPayout = [...players].sort((a, b) => b.highestSinglePayout - a.highestSinglePayout)[0];
  if (largestPayout && largestPayout.highestSinglePayout > 0) {
    awards.push({
      id: 'high_roller',
      title: 'High Roller',
      icon: '💎',
      badgeColor: '#06b6d4',
      recipientId: largestPayout.id,
      recipientName: largestPayout.name,
      description: 'Cashed in the largest single winning payout.',
      metric: `+${largestPayout.highestSinglePayout} coin payout`,
    });
  }

  // 4. Wealth Champion (highest total coin bankroll)
  const highRollerCoins = [...players].sort((a, b) => b.coins - a.coins)[0];
  if (highRollerCoins && highRollerCoins.coins > 1000) {
    awards.push({
      id: 'wealth_champion',
      title: 'Money Bags',
      icon: '💰',
      badgeColor: '#10b981',
      recipientId: highRollerCoins.id,
      recipientName: highRollerCoins.name,
      description: 'Amassed the largest coin fortune of the session.',
      metric: `${highRollerCoins.coins.toLocaleString()} Coins`,
    });
  }

  // 5. Biggest Risk Taker
  const riskTaker = [...players].sort((a, b) => b.highestSingleBet - a.highestSingleBet)[0];
  if (riskTaker && riskTaker.highestSingleBet > 0) {
    awards.push({
      id: 'risk_taker',
      title: 'Biggest Risk Taker',
      icon: '🔥',
      badgeColor: '#ef4444',
      recipientId: riskTaker.id,
      recipientName: riskTaker.name,
      description: 'Placed the single largest wager of the session.',
      metric: `Peak Bet: ${riskTaker.highestSingleBet} coins`,
    });
  }

  // 6. The Oracle (highest betting win rate, min 2 bets placed)
  const oracle = [...players]
    .filter(p => p.totalBetsPlaced >= 2)
    .sort((a, b) => (b.totalBetsWon / b.totalBetsPlaced) - (a.totalBetsWon / a.totalBetsPlaced))[0];
  if (oracle) {
    const accuracy = Math.round((oracle.totalBetsWon / oracle.totalBetsPlaced) * 100);
    awards.push({
      id: 'the_oracle',
      title: 'The Oracle',
      icon: '🔮',
      badgeColor: '#8b5cf6',
      recipientId: oracle.id,
      recipientName: oracle.name,
      description: 'Highest betting accuracy of the night.',
      metric: `${accuracy}% Bet Accuracy (${oracle.totalBetsWon}/${oracle.totalBetsPlaced})`,
    });
  }

  // 7. Unluckiest Bettor
  const unluckiest = [...players].sort((a, b) => b.totalCoinsLostInBets - a.totalCoinsLostInBets)[0];
  if (unluckiest && unluckiest.totalCoinsLostInBets > 0) {
    awards.push({
      id: 'unlucky_bettor',
      title: 'Unluckiest Bettor',
      icon: '📉',
      badgeColor: '#f97316',
      recipientId: unluckiest.id,
      recipientName: unluckiest.name,
      description: 'Defied the odds in the worst possible way.',
      metric: `Lost ${unluckiest.totalCoinsLostInBets} coins in bets`,
    });
  }

  return awards;
}
