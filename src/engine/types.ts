/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Network & Game Protocol Type Definitions (v2.1 Authoritative Hardened)
 */

import type { V2Action } from './v2Games.ts';

export const BRAWL_PROTOCOL_VERSION = 2;

export type MiniGameId = 
  | 'millisecond_stop' 
  | 'rapid_red_green' 
  | 'speed_math' 
  | 'higher_lower' 
  | 'blind_pinpoint' 
  | 'quick_draw'
  | 'memory_heist'
  | 'crowd_count'
  | 'mirror_trouble'
  | 'safecracker'
  | 'circuit_sprint'
  | 'split_decision'
  | 'treasure_tug'
  | 'pocket_territory';

export interface MiniGameMeta {
  id: MiniGameId;
  name: string;
  tagline: string;
  durationSeconds: number;
  description: string;
  rules: string[];
}

export type GamePhase =
  | 'ENTRY'                // Start screen: Host vs Join
  | 'LOBBY'                // Waiting for 3-9 players, ready checks, QR display
  | 'FIGHTER_REVEAL'       // VS splash announcing 2 selected brawlers + instructions
  | 'BETTING_WINDOW'       // 15s secret spectator betting phase with dynamic odds
  | 'MINIGAME_COUNTDOWN'   // 3.. 2.. 1.. BRAWL!
  | 'MINIGAME_ACTIVE'      // Real-time mini-game execution
  | 'PAYOUT_RECAP'         // Winner takes match pot, spectator payouts/losses
  | 'FINAL_PODIUM';        // Kahoot podium with 1st, 2nd, 3rd & genuine session awards

/**
 * Public player representation broadcast over the network to all clients.
 * NEVER contains private credentials or sessionToken.
 */
export interface PublicPlayer {
  id: string;
  name: string;
  avatar: string;
  color: string;
  isHost: boolean;
  isReady: boolean;
  connected: boolean;
  isBot?: boolean; // ONLY in ?debug=1 mode
  coins: number;
  // Current session stats ONLY (All start at 0)
  matchesWon: number;
  matchesPlayed: number;
  totalBetsPlaced: number;
  totalBetsWon: number;
  totalCoinsWonInBets: number;
  totalCoinsLostInBets: number;
  highestSingleBet: number;
  highestSinglePayout: number;

  // Tournament & Brawl Points
  qualifierPoints: number;
  qualifierWins: number;
  qualifierTies: number;
  qualifierLosses: number;
  qualifierMatchesPlayed: number;
  tournamentRank?: number;
}

/**
 * Full server-side player representation containing the private sessionToken.
 */
export interface Player extends PublicPlayer {
  sessionToken: string;
}

export function toPublicPlayer(p: Player): PublicPlayer {
  const { sessionToken, ...publicData } = p;
  return publicData;
}

export interface FighterOdds {
  fighterId: string;
  decimalOdds: number;      // e.g. 1.85x
  smoothedWinRate: number;  // Laplace smoothed
  totalPoolCoins: number;   // Total coins bet on this fighter
  bettorCount: number;
}

export interface SecretBet {
  bettorId: string;
  fighterId: string;
  amount: number;
  oddsAtBet: number;
  timestamp: number;
  potentialReturn: number;
}

export interface PublicFighterPool {
  totalPool: number;
  bettorCount: number;
  decimalOdds: number;
}

export interface RoundPayoutItem {
  playerId: string;
  playerName: string;
  avatar: string;
  type: 'FIGHTER_BOUNTY' | 'BET_WIN' | 'BET_LOSS' | 'BET_REFUND';
  stake?: number;
  totalReturn?: number;
  netChange: number;        // e.g. +250, +185, -100, 0
  newBankroll: number;
  summary: string;          // e.g. "360 returned · +160 profit" or "150 refunded · 0 net"
}

export type TournamentStage = 'QUALIFIERS' | 'CHAMPIONSHIP' | 'COMPLETE';
export type RoundResolutionReason = 'PLAYED' | 'TIE' | 'DISCONNECT_FORFEIT' | 'VOID';

export interface TournamentMatch {
  matchIndex: number;
  roundNumber: number;
  fighterIds: [string, string];
  isChampionship: boolean;
  championshipGameNumber?: number; // 1, 2, 3...
  completed: boolean;
  winnerId: string | null;
  tieResult?: boolean;
  resolutionReason?: RoundResolutionReason;
}

export interface TournamentSchedule {
  stage: TournamentStage;
  totalPlayers: number;
  qualifierCount: number; // Exactly N qualifiers for N players
  qualifiersCompleted: number;
  totalRounds: number;    // Estimated or legacy field
  matches: TournamentMatch[];
  finalists?: [string, string];
  championshipWins: Record<string, number>; // finalistId -> wins (first to 2)
  championshipGamesPlayed: number;
  championId?: string | null;
  runnerUpId?: string | null;
  thirdPlaceId?: string | null;
  stableRosterOrder: string[]; // Deterministic frozen session seed
}

export interface RoundState {
  matchId?: string;
  roundNumber: number;
  maxRounds: number;
  stage?: TournamentStage;
  qualifierIndex?: number;
  qualifierTotal?: number;
  championshipGameNumber?: number;
  miniGame: MiniGameMeta;
  fighterIds: [string, string];
  matchPot: number; // Virtual stakes awarded to winning fighter (+250c qualifier, +500c championship)
  odds: Record<string, FighterOdds>;
  bets: SecretBet[];
  bettingTimeRemaining: number;
  gameTimeRemaining: number;
  winnerId: string | null;
  tieResult?: boolean;
  resolutionReason?: RoundResolutionReason;
  isChampionship?: boolean;
  fighterScores: Record<string, number>;
  payouts: RoundPayoutItem[];
  // Timestamps for synchronized client clock tracking
  revealEndsAt?: number;
  bettingEndsAt?: number;
  gameStartsAt?: number;
  gameEndsAt?: number;
  // Mini-game public config (scrubbed of private answers)
  gameConfig?: Record<string, unknown>;
  // Authoritative live state for the active mini-game
  gameState?: Record<string, unknown>;
}

export interface Award {
  id: string;
  title: string;
  icon: string;
  badgeColor: string;
  recipientId: string;
  recipientName: string;
  description: string;
  metric: string;
}

// -------------------------------------------------------------
// TYPED FIGHTER ACTIONS
// -------------------------------------------------------------

export interface FighterActionIdentity { matchId: string; stageIndex: number; actionId: string }

// Components/pure rules accept decisions; the client adds the mandatory wire identity for every game.
export type FighterAction = (
  | { type: 'STOP' }
  | { type: 'TAP' }
  | { type: 'ANSWER'; questionIndex: number; answer: number }
  | { type: 'GUESS'; questionIndex: number; guess: 'HIGHER' | 'LOWER' }
  | { type: 'PIN'; normX: number; normY: number }
  | { type: 'DRAW_TAP' }
) & Partial<FighterActionIdentity> | (V2Action & FighterActionIdentity);

// -------------------------------------------------------------
// DISCRIMINATED UNION PROTOCOL SCHEMAS
// -------------------------------------------------------------

export interface PublicRoomState {
  roomId: string;
  roomCode: string;
  phase: GamePhase;
  players: PublicPlayer[];
  totalRounds: number;
  currentRound: RoundState | null;
  tournamentSchedule?: TournamentSchedule | null;
  roundHistory: Array<{
    roundNumber: number;
    miniGameName: string;
    winnerName: string;
    totalPotWon: number;
    isChampionship?: boolean;
    championshipGameNumber?: number;
    resolutionReason?: RoundResolutionReason;
  }>;
  awards: Award[];
  debugMode?: boolean;
}

export type ClientMessage =
  | { type: 'CREATE_ROOM'; payload?: { playerName?: string; avatar?: string; debugMode?: boolean; protocolVersion?: number } }
  | { type: 'JOIN_ROOM'; payload: { roomCode: string; playerName?: string; avatar?: string; sessionToken?: string; protocolVersion?: number } }
  | { type: 'TOGGLE_READY' }
  | { type: 'START_GAME'; payload?: { debug?: boolean } }
  | { type: 'PLACE_BET'; payload: { fighterId: string; amount: number } }
  | { type: 'FIGHTER_ACTION'; payload: FighterAction }
  | { type: 'NEXT_ROUND' }
  | { type: 'RESTART_GAME' }
  | { type: 'CLOSE_ROOM' }
  | { type: 'DEBUG_ADD_BOT' }
  | { type: 'KICK_PLAYER'; payload: { playerId: string } }
  | { type: 'PING'; payload?: { clientSentAt: number } };

export type ServerMessage =
  | { type: 'JOIN_SUCCESS'; timestamp: number; payload: { player: PublicPlayer; sessionToken: string; roomCode: string; isHost: boolean; protocolVersion: number } }
  | { type: 'JOIN_ERROR'; timestamp: number; payload: { code: string; message: string } }
  | { type: 'ROOM_STATE'; timestamp: number; payload: PublicRoomState }
  | { type: 'BET_ACCEPTED'; timestamp: number; payload: { bet: SecretBet; myBankroll: number } }
  | { type: 'BET_REJECTED'; timestamp: number; payload: { reason: string } }
  | { type: 'ROOM_CLOSED'; timestamp: number; payload: { reason: string } }
  | { type: 'PONG'; timestamp: number; payload: { clientSentAt?: number; serverNow: number } }
  | { type: 'ACTION_RESULT'; timestamp: number; payload: { fighterId?: string; questionIndex: number; isCorrect: boolean; challengerStat: string } }
  | { type: 'GAME_ACTION_RESULT'; timestamp: number; payload: { matchId: string; stageIndex: number; actionId: string; accepted: boolean; reason?: string } };

export interface RoomNetworkInfo {
  localIp: string;
  port: number;
  roomCode: string;
  fullJoinUrl: string;
  hasActiveRoom?: boolean;
  playerCount?: number;
  candidateUrls?: string[];
}
