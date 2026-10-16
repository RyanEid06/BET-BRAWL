/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Core Game State Machine & Local Network Server Engine
 */

import type {
  Player,
  GamePhase,
  RoundState,
  SecretBet,
  Award,
  AnyWebSocketMessage,
  MiniGameId,
} from './types.ts';
import { calculateDynamicOdds, computeRoundPayouts } from './odds.ts';
import { MINI_GAMES } from './miniGamesCatalog.ts';

export const INITIAL_PLAYERS: Player[] = [
  {
    id: 'p1',
    name: 'You (Ace)',
    avatar: '⚡',
    color: '#06b6d4',
    isHost: true,
    isReady: true,
    coins: 1000,
    matchesWon: 2,
    matchesPlayed: 3,
    totalBetsPlaced: 3,
    totalBetsWon: 2,
    totalCoinsWonInBets: 320,
    totalCoinsLostInBets: 150,
    highestSingleBet: 250,
    highestSinglePayout: 540,
  },
  {
    id: 'p2',
    name: 'Maya',
    avatar: '🦊',
    color: '#f97316',
    isHost: false,
    isReady: true,
    isBot: true,
    coins: 1000,
    matchesWon: 3,
    matchesPlayed: 4,
    totalBetsPlaced: 2,
    totalBetsWon: 2,
    totalCoinsWonInBets: 480,
    totalCoinsLostInBets: 50,
    highestSingleBet: 300,
    highestSinglePayout: 620,
  },
  {
    id: 'p3',
    name: 'Jax',
    avatar: '🦾',
    color: '#ef4444',
    isHost: false,
    isReady: true,
    isBot: true,
    coins: 1000,
    matchesWon: 1,
    matchesPlayed: 3,
    totalBetsPlaced: 4,
    totalBetsWon: 1,
    totalCoinsWonInBets: 120,
    totalCoinsLostInBets: 450,
    highestSingleBet: 400,
    highestSinglePayout: 280,
  },
  {
    id: 'p4',
    name: 'Zoe',
    avatar: '🎯',
    color: '#ec4899',
    isHost: false,
    isReady: true,
    isBot: true,
    coins: 1000,
    matchesWon: 2,
    matchesPlayed: 2,
    totalBetsPlaced: 3,
    totalBetsWon: 2,
    totalCoinsWonInBets: 360,
    totalCoinsLostInBets: 100,
    highestSingleBet: 200,
    highestSinglePayout: 460,
  },
  {
    id: 'p5',
    name: 'Leo',
    avatar: '🦁',
    color: '#eab308',
    isHost: false,
    isReady: true,
    isBot: true,
    coins: 1000,
    matchesWon: 0,
    matchesPlayed: 2,
    totalBetsPlaced: 4,
    totalBetsWon: 1,
    totalCoinsWonInBets: 80,
    totalCoinsLostInBets: 500,
    highestSingleBet: 500,
    highestSinglePayout: 180,
  },
  {
    id: 'p6',
    name: 'Kira',
    avatar: '🔮',
    color: '#8b5cf6',
    isHost: false,
    isReady: true,
    isBot: true,
    coins: 1000,
    matchesWon: 1,
    matchesPlayed: 2,
    totalBetsPlaced: 3,
    totalBetsWon: 3,
    totalCoinsWonInBets: 510,
    totalCoinsLostInBets: 0,
    highestSingleBet: 200,
    highestSinglePayout: 420,
  },
  {
    id: 'p7',
    name: 'Brock',
    avatar: '🥊',
    color: '#10b981',
    isHost: false,
    isReady: true,
    isBot: true,
    coins: 1000,
    matchesWon: 1,
    matchesPlayed: 1,
    totalBetsPlaced: 2,
    totalBetsWon: 1,
    totalCoinsWonInBets: 150,
    totalCoinsLostInBets: 200,
    highestSingleBet: 250,
    highestSinglePayout: 320,
  },
];

export interface ServerState {
  roomId: string;
  roomCode: string;
  hostIp: string;
  port: number;
  phase: GamePhase;
  players: Player[];
  currentRound: RoundState | null;
  roundHistory: Array<{
    roundNumber: number;
    miniGameName: string;
    winnerName: string;
    totalPotWon: number;
  }>;
  totalRounds: number;
  awards: Award[];
  messageLog: AnyWebSocketMessage[];
  clientPerspective: string; // 'host_tv' or player id like 'p1'
}

const MINI_GAME_ROTATION: MiniGameId[] = [
  'millisecond_stop',
  'rapid_red_green',
  'speed_math',
  'higher_lower',
  'blind_pinpoint',
  'coin_flip_double',
];

export function createInitialServerState(): ServerState {
  return {
    roomId: 'room_wi_fi_' + Math.floor(1000 + Math.random() * 9000),
    roomCode: 'BRAWL',
    hostIp: '192.168.1.104',
    port: 8080,
    phase: 'LOBBY',
    players: JSON.parse(JSON.stringify(INITIAL_PLAYERS)),
    currentRound: null,
    roundHistory: [],
    totalRounds: 8,
    awards: [],
    messageLog: [
      {
        type: 'ROOM_CREATED',
        timestamp: Date.now() - 5000,
        roomId: 'room_wi_fi_7429',
        hostId: 'p1',
        roomCode: 'BRAWL',
        localIp: '192.168.1.104',
        port: 8080,
      },
      {
        type: 'LOBBY_STATE',
        timestamp: Date.now() - 2000,
        roomId: 'room_wi_fi_7429',
        players: INITIAL_PLAYERS,
        roomCode: 'BRAWL',
        canStart: true,
        totalRounds: 8,
      },
    ],
    clientPerspective: 'p1',
  };
}

/**
 * Selects 2 balanced fighters based on match count history and rotation.
 */
export function selectRoundFighters(players: Player[], currentRoundIndex: number): [string, string] {
  // Sort players by fewest matches played first to ensure fair rotation among all 7 friends
  const sorted = [...players].sort((a, b) => a.matchesPlayed - b.matchesPlayed);
  // Pick from the lowest played pool
  const fighterA = sorted[0];
  const fighterB = sorted[1] || sorted[0];
  return [fighterA.id, fighterB.id];
}

/**
 * Initializes a new round with fighter pair, mini-game, and initial odds.
 */
export function initNewRound(state: ServerState): ServerState {
  const nextRoundNum = (state.currentRound?.roundNumber || 0) + 1;
  const gameIndex = (nextRoundNum - 1) % MINI_GAME_ROTATION.length;
  const miniGameKey = MINI_GAME_ROTATION[gameIndex];
  const miniGame = MINI_GAMES[miniGameKey];

  const fighterIds = selectRoundFighters(state.players, nextRoundNum);
  const fighterA = state.players.find(p => p.id === fighterIds[0])!;
  const fighterB = state.players.find(p => p.id === fighterIds[1])!;

  const initialOdds = calculateDynamicOdds(fighterA, fighterB, []);
  const matchPot = 250; // Base bounty for winning fighter

  const newRound: RoundState = {
    roundNumber: nextRoundNum,
    maxRounds: state.totalRounds,
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
  };

  const roundInitMsg: AnyWebSocketMessage = {
    type: 'ROUND_INIT',
    timestamp: Date.now(),
    roomId: state.roomId,
    roundNumber: nextRoundNum,
    maxRounds: state.totalRounds,
    fighterIds,
    miniGame,
    initialOdds,
    bettingDuration: 15,
  };

  return {
    ...state,
    phase: 'FIGHTER_REVEAL',
    currentRound: newRound,
    messageLog: [roundInitMsg, ...state.messageLog].slice(0, 30),
  };
}

/**
 * Places a secret bet for a spectator and updates live dynamic odds.
 */
export function placeBet(
  state: ServerState,
  bettorId: string,
  fighterId: string,
  amount: number
): ServerState {
  if (!state.currentRound || state.phase !== 'BETTING_WINDOW') return state;

  const bettor = state.players.find(p => p.id === bettorId);
  if (!bettor || bettor.coins < amount) return state;

  // Deduct coins from bettor
  const updatedPlayers = state.players.map(p => {
    if (p.id === bettorId) {
      return {
        ...p,
        coins: p.coins - amount,
        totalBetsPlaced: p.totalBetsPlaced + 1,
        highestSingleBet: Math.max(p.highestSingleBet, amount),
      };
    }
    return p;
  });

  const oddsAtBet = state.currentRound.odds[fighterId]?.decimalOdds || 2.0;
  const potentialReturn = Math.floor(amount * oddsAtBet);

  const newBet: SecretBet = {
    bettorId,
    fighterId,
    amount,
    oddsAtBet,
    timestamp: Date.now(),
    potentialReturn,
  };

  const updatedBets = [...state.currentRound.bets, newBet];

  // Re-calculate dynamic odds with the updated pool
  const fighterA = updatedPlayers.find(p => p.id === state.currentRound!.fighterIds[0])!;
  const fighterB = updatedPlayers.find(p => p.id === state.currentRound!.fighterIds[1])!;
  const dynamicOdds = calculateDynamicOdds(fighterA, fighterB, updatedBets);

  const betMsg: AnyWebSocketMessage = {
    type: 'BET_PLACED',
    timestamp: Date.now(),
    roomId: state.roomId,
    bettorId,
    fighterId,
    amount,
  };

  const oddsMsg: AnyWebSocketMessage = {
    type: 'ODDS_SYNC',
    timestamp: Date.now(),
    roomId: state.roomId,
    odds: dynamicOdds,
    totalPot: updatedBets.reduce((sum, b) => sum + b.amount, 0),
  };

  return {
    ...state,
    players: updatedPlayers,
    currentRound: {
      ...state.currentRound,
      bets: updatedBets,
      odds: dynamicOdds,
    },
    messageLog: [oddsMsg, betMsg, ...state.messageLog].slice(0, 30),
  };
}

/**
 * Generates automated secret bets from other simulated friends in the room.
 */
export function simulateSpectatorBets(state: ServerState): ServerState {
  if (!state.currentRound || state.phase !== 'BETTING_WINDOW') return state;
  const [f1, f2] = state.currentRound.fighterIds;
  let currentState = state;

  // Let simulated bots place bets if they haven't already
  for (const player of currentState.players) {
    if (player.id === f1 || player.id === f2) continue; // Fighters don't bet on own match
    if (currentState.currentRound?.bets.some(b => b.bettorId === player.id)) continue;

    // 85% chance bot places a bet
    if (Math.random() < 0.85) {
      const pickFighter = Math.random() < 0.52 ? f1 : f2;
      const betOptions = [50, 100, 150, 200, 250];
      const maxAffordable = Math.min(player.coins, 250);
      const possible = betOptions.filter(o => o <= maxAffordable);
      const amount = possible.length > 0 ? possible[Math.floor(Math.random() * possible.length)] : 50;

      if (player.coins >= amount) {
        currentState = placeBet(currentState, player.id, pickFighter, amount);
      }
    }
  }

  return currentState;
}

/**
 * Resolves the mini-game winner and computes payouts.
 */
export function resolveMiniGame(
  state: ServerState,
  winnerId: string,
  scores: Record<string, number>
): ServerState {
  if (!state.currentRound) return state;

  const { payouts, updatedPlayers } = computeRoundPayouts(
    winnerId,
    state.currentRound.fighterIds,
    state.currentRound.matchPot,
    state.currentRound.bets,
    state.players
  );

  const winner = updatedPlayers.find(p => p.id === winnerId);

  const gameOverMsg: AnyWebSocketMessage = {
    type: 'GAME_OVER',
    timestamp: Date.now(),
    roomId: state.roomId,
    winnerId,
    scores,
  };

  const payoutMsg: AnyWebSocketMessage = {
    type: 'PAYOUT_SYNC',
    timestamp: Date.now() + 50,
    roomId: state.roomId,
    winnerId,
    payouts,
    leaderboard: [...updatedPlayers].sort((a, b) => b.coins - a.coins),
  };

  const updatedHistory = [
    ...state.roundHistory,
    {
      roundNumber: state.currentRound.roundNumber,
      miniGameName: state.currentRound.miniGame.name,
      winnerName: winner?.name || 'Unknown',
      totalPotWon: state.currentRound.matchPot,
    },
  ];

  return {
    ...state,
    phase: 'PAYOUT_RECAP',
    players: updatedPlayers,
    currentRound: {
      ...state.currentRound,
      winnerId,
      fighterScores: scores,
      payouts,
    },
    roundHistory: updatedHistory,
    messageLog: [payoutMsg, gameOverMsg, ...state.messageLog].slice(0, 30),
  };
}

/**
 * Generates fun end-of-game awards for the Kahoot podium.
 */
export function computePodiumAwards(players: Player[]): Award[] {
  const awards: Award[] = [];

  // 1. Biggest Risk Taker: highest average bet or highest single bet
  const riskTaker = [...players].sort((a, b) => b.highestSingleBet - a.highestSingleBet)[0];
  if (riskTaker) {
    awards.push({
      id: 'risk_taker',
      title: 'Biggest Risk Taker',
      icon: '🔥',
      badgeColor: '#ef4444',
      recipientId: riskTaker.id,
      recipientName: riskTaker.name,
      description: 'Fearlessly tossed massive stacks into the brawl pot.',
      metric: `Peak Bet: ${riskTaker.highestSingleBet} coins`,
    });
  }

  // 2. Unluckiest Bettor: most coins lost in bets
  const unluckiest = [...players].sort((a, b) => b.totalCoinsLostInBets - a.totalCoinsLostInBets)[0];
  if (unluckiest && unluckiest.totalCoinsLostInBets > 0) {
    awards.push({
      id: 'unlucky_bettor',
      title: 'Unluckiest Bettor',
      icon: '📉',
      badgeColor: '#f97316',
      recipientId: unluckiest.id,
      recipientName: unluckiest.name,
      description: 'The betting odds defied their every calculation.',
      metric: `Lost ${unluckiest.totalCoinsLostInBets} coins in bets`,
    });
  }

  // 3. The Clutch King: best brawl record
  const clutchKing = [...players].sort((a, b) => {
    const aRate = a.matchesPlayed > 0 ? a.matchesWon / a.matchesPlayed : 0;
    const bRate = b.matchesPlayed > 0 ? b.matchesWon / b.matchesPlayed : 0;
    return bRate - aRate;
  })[0];
  if (clutchKing) {
    awards.push({
      id: 'clutch_king',
      title: 'The Clutch King',
      icon: '👑',
      badgeColor: '#eab308',
      recipientId: clutchKing.id,
      recipientName: clutchKing.name,
      description: 'Dominant 1v1 execution under pressure.',
      metric: `${clutchKing.matchesWon} Brawl Victories`,
    });
  }

  // 4. The Oracle: best betting win rate
  const oracle = [...players]
    .filter(p => p.totalBetsPlaced >= 2)
    .sort((a, b) => (b.totalBetsWon / (b.totalBetsPlaced || 1)) - (a.totalBetsWon / (a.totalBetsPlaced || 1)))[0];
  if (oracle) {
    const accuracy = Math.round((oracle.totalBetsWon / (oracle.totalBetsPlaced || 1)) * 100);
    awards.push({
      id: 'the_oracle',
      title: 'The Oracle',
      icon: '🔮',
      badgeColor: '#8b5cf6',
      recipientId: oracle.id,
      recipientName: oracle.name,
      description: 'Reads the arena better than anyone in the room.',
      metric: `${accuracy}% Bet Accuracy`,
    });
  }

  // 5. High Roller: highest single payout
  const highRoller = [...players].sort((a, b) => b.highestSinglePayout - a.highestSinglePayout)[0];
  if (highRoller && highRoller.highestSinglePayout > 0) {
    awards.push({
      id: 'high_roller',
      title: 'High Roller',
      icon: '💎',
      badgeColor: '#06b6d4',
      recipientId: highRoller.id,
      recipientName: highRoller.name,
      description: 'Cashed in the largest single jackpot payout of the night.',
      metric: `Biggest Payout: +${highRoller.highestSinglePayout} coins`,
    });
  }

  return awards;
}
