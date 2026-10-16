/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Authoritative Room, Session & Fighter Rotation Engine
 */

import type { Player, RoundState, Award, MiniGameId } from './types.ts';
import { calculateDynamicOdds } from './odds.ts';
import { MINI_GAMES, generateMathQuestions, STABLE_HIGHER_LOWER_BANK, WORLD_CITIES } from './miniGamesCatalog.ts';

const PLAYER_COLORS = [
  '#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6',
  '#ec4899', '#3b82f6', '#14b8a6', '#f97316'
];

export const MIN_PLAYERS_TO_START = 6;
export const MAX_PLAYERS_CAPACITY = 9;

export function getRandomPlayerColor(): string {
  return PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
}

export function generateRoomCode(): string {
  const words = ['BRAWL', 'FIGHT', 'CLASH', 'VIPER', 'TITAN', 'SWIFT', 'SPARK', 'TURBO', 'BLITZ', 'ARENA'];
  return words[Math.floor(Math.random() * words.length)];
}

export function createFreshPlayer(
  name: string,
  avatar: string,
  isHost = false,
  sessionToken?: string
): Player {
  const token = sessionToken || `tok_${Math.random().toString(36).substring(2, 12)}`;
  return {
    id: `p_${Math.random().toString(36).substring(2, 9)}`,
    sessionToken: token,
    name: name.trim() || (isHost ? 'Host' : 'Brawler'),
    avatar: avatar || '⚡',
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
  };
}

/**
 * Fair fighter selection algorithm:
 * - Uses ONLY current session appearances
 * - Strictly prioritizes players with the minimum matches played
 * - Shuffles ties randomly so array index never dictates who fights
 * - Avoids repeating the exact same pairing consecutively when possible
 */
export function selectRoundFighters(
  players: Player[],
  lastPairing?: [string, string]
): [string, string] {
  if (players.length < 2) {
    throw new Error('Need at least 2 players to select fighters');
  }

  // 1. Group players by matchesPlayed
  const minPlayed = Math.min(...players.map(p => p.matchesPlayed));
  const poolMin = players.filter(p => p.matchesPlayed === minPlayed);
  
  // Fair shuffle
  const shuffledMin = [...poolMin].sort(() => Math.random() - 0.5);

  let fighterA = shuffledMin[0];

  // Candidates for Fighter B:
  // Remaining players sorted by matchesPlayed, shuffled within same count
  const remaining = players.filter(p => p.id !== fighterA.id);
  const remainingMin = Math.min(...remaining.map(p => p.matchesPlayed));
  const poolB = remaining.filter(p => p.matchesPlayed === remainingMin);
  const shuffledB = [...poolB].sort(() => Math.random() - 0.5);

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

const MINI_GAME_ROTATION: MiniGameId[] = [
  'millisecond_stop',
  'rapid_red_green',
  'speed_math',
  'higher_lower',
  'blind_pinpoint',
  'quick_draw',
];

/**
 * Initializes a new authoritative round.
 */
export function initAuthoritativeRound(
  roundNumber: number,
  totalRounds: number,
  players: Player[],
  lastPairing?: [string, string]
): RoundState {
  const gameIndex = (roundNumber - 1) % MINI_GAME_ROTATION.length;
  const miniGameId = MINI_GAME_ROTATION[gameIndex];
  const miniGame = MINI_GAMES[miniGameId];

  const fighterIds = selectRoundFighters(players, lastPairing);
  const fighterA = players.find(p => p.id === fighterIds[0])!;
  const fighterB = players.find(p => p.id === fighterIds[1])!;

  const initialOdds = calculateDynamicOdds(fighterA, fighterB, []);
  const matchPot = 250; // virtual coin bounty for winner

  // Generate mini-game authoritative config based on type
  const gameConfig: Record<string, unknown> = {};

  if (miniGameId === 'rapid_red_green') {
    // Synchronized light sequence: alternating green (1.5-2.5s) and red (0.8-1.5s)
    const sequence: Array<{ light: 'GREEN' | 'RED'; durationMs: number }> = [];
    let accumulatedMs = 0;
    let currentLight: 'GREEN' | 'RED' = 'GREEN';

    while (accumulatedMs < 16000) {
      const dur = currentLight === 'GREEN'
        ? Math.floor(1400 + Math.random() * 1200)
        : Math.floor(800 + Math.random() * 800);
      sequence.push({ light: currentLight, durationMs: dur });
      accumulatedMs += dur;
      currentLight = currentLight === 'GREEN' ? 'RED' : 'GREEN';
    }
    gameConfig.lightSchedule = sequence;
  } else if (miniGameId === 'speed_math') {
    gameConfig.mathQuestions = generateMathQuestions(3);
  } else if (miniGameId === 'higher_lower') {
    // Randomize starting trivia index
    const startIdx = Math.floor(Math.random() * STABLE_HIGHER_LOWER_BANK.length);
    gameConfig.triviaIndex = startIdx;
  } else if (miniGameId === 'blind_pinpoint') {
    const cityIdx = Math.floor(Math.random() * WORLD_CITIES.length);
    gameConfig.targetCity = WORLD_CITIES[cityIdx];
  } else if (miniGameId === 'quick_draw') {
    // Future GO delay between 2.2 and 4.8 seconds
    gameConfig.drawDelayMs = Math.floor(2200 + Math.random() * 2600);
  }

  return {
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
    fighterScores: {
      [fighterIds[0]]: 0,
      [fighterIds[1]]: 0,
    },
    payouts: [],
    gameConfig,
  };
}

/**
 * Computes end-of-game superlative awards using ONLY genuine current session stats.
 */
export function computeSessionAwards(players: Player[]): Award[] {
  const awards: Award[] = [];

  // 1. Biggest Risk Taker
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

  // 2. Unluckiest Bettor
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

  // 3. Brawl King / The Clutch Fighter
  const brawlKing = [...players]
    .filter(p => p.matchesPlayed > 0)
    .sort((a, b) => b.matchesWon - a.matchesWon)[0];
  if (brawlKing && brawlKing.matchesWon > 0) {
    awards.push({
      id: 'brawl_king',
      title: 'Brawl King',
      icon: '👑',
      badgeColor: '#eab308',
      recipientId: brawlKing.id,
      recipientName: brawlKing.name,
      description: 'Most 1v1 brawl mini-game victories.',
      metric: `${brawlKing.matchesWon} Brawl Victories`,
    });
  }

  // 4. The Oracle (highest betting win rate, min 2 bets placed)
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

  // 5. High Roller (largest single payout)
  const highRoller = [...players].sort((a, b) => b.highestSinglePayout - a.highestSinglePayout)[0];
  if (highRoller && highRoller.highestSinglePayout > 0) {
    awards.push({
      id: 'high_roller',
      title: 'High Roller',
      icon: '💎',
      badgeColor: '#06b6d4',
      recipientId: highRoller.id,
      recipientName: highRoller.name,
      description: 'Cashed in the largest single winning payout.',
      metric: `+${highRoller.highestSinglePayout} coin payout`,
    });
  }

  return awards;
}
