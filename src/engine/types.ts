/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Network & Game Protocol Type Definitions (v2.0 Real Wi-Fi)
 */

export type MiniGameId = 
  | 'millisecond_stop' 
  | 'rapid_red_green' 
  | 'speed_math' 
  | 'higher_lower' 
  | 'blind_pinpoint' 
  | 'quick_draw';

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
  | 'LOBBY'                // Waiting for 6-9 players, ready checks, QR display
  | 'FIGHTER_REVEAL'       // VS splash announcing 2 selected brawlers + instructions
  | 'BETTING_WINDOW'       // 15s secret spectator betting phase with dynamic odds
  | 'MINIGAME_COUNTDOWN'   // 3.. 2.. 1.. BRAWL!
  | 'MINIGAME_ACTIVE'      // Real-time mini-game execution
  | 'PAYOUT_RECAP'         // Winner takes match pot, spectator payouts/losses
  | 'FINAL_PODIUM';        // Kahoot podium with 1st, 2nd, 3rd & genuine session awards

export interface Player {
  id: string;
  sessionToken: string;
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

export interface RoundPayoutItem {
  playerId: string;
  playerName: string;
  avatar: string;
  type: 'FIGHTER_BOUNTY' | 'BET_WIN' | 'BET_LOSS';
  stake?: number;
  totalReturn?: number;
  netChange: number;        // e.g. +250, +185, -100
  newBankroll: number;
  summary: string;          // e.g. "360 returned · +160 profit" or "-100 loss"
}

export interface RoundState {
  roundNumber: number;
  maxRounds: number;
  miniGame: MiniGameMeta;
  fighterIds: [string, string];
  matchPot: number; // Virtual stakes awarded to winning fighter (+250c)
  odds: Record<string, FighterOdds>;
  bets: SecretBet[];
  bettingTimeRemaining: number;
  gameTimeRemaining: number;
  winnerId: string | null;
  tieResult?: boolean;
  fighterScores: Record<string, number>;
  payouts: RoundPayoutItem[];
  // Mini-game specific authoritative server config/seed
  gameConfig?: Record<string, unknown>;
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
// REAL WEBSOCKET PROTOCOL SCHEMAS
// -------------------------------------------------------------

export type ClientMessageType =
  | 'CREATE_ROOM'
  | 'JOIN_ROOM'
  | 'TOGGLE_READY'
  | 'START_GAME'
  | 'PLACE_BET'
  | 'FIGHTER_INPUT'
  | 'REPORT_MINIGAME_RESULT'
  | 'NEXT_ROUND'
  | 'RESTART_GAME'
  | 'DEBUG_ADD_BOT'
  | 'PING';

export interface ClientMessage {
  type: ClientMessageType;
  sessionToken?: string;
  roomCode?: string;
  payload?: any;
}

export type ServerMessageType =
  | 'JOIN_SUCCESS'
  | 'JOIN_ERROR'
  | 'ROOM_STATE'
  | 'ROUND_INIT'
  | 'ODDS_SYNC'
  | 'MINIGAME_START'
  | 'MINIGAME_TICK'
  | 'GAME_OVER'
  | 'PAYOUT_SYNC'
  | 'FINAL_LEADERBOARD'
  | 'BET_REJECTED'
  | 'ROOM_CLOSED'
  | 'PONG';

export interface ServerMessage {
  type: ServerMessageType;
  timestamp: number;
  payload: any;
}

export interface RoomNetworkInfo {
  localIp: string;
  port: number;
  roomCode: string;
  fullJoinUrl: string;
}
