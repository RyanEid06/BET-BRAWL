/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Network & Game Protocol Type Definitions
 */

export type MiniGameId = 
  | 'millisecond_stop' 
  | 'rapid_red_green' 
  | 'speed_math' 
  | 'higher_lower' 
  | 'blind_pinpoint' 
  | 'coin_flip_double';

export interface MiniGameMeta {
  id: MiniGameId;
  name: string;
  tagline: string;
  durationSeconds: number;
  description: string;
  rules: string[];
}

export type GamePhase =
  | 'ROOM_DISCOVERY'       // Local Wi-Fi discovery / connection
  | 'LOBBY'                // 6-9 players joining, ready checks
  | 'FIGHTER_REVEAL'       // VS splash announcing 2 selected brawlers
  | 'BETTING_WINDOW'       // 15s secret spectator betting phase with live odds
  | 'MINIGAME_COUNTDOWN'   // 3.. 2.. 1.. BRAWL!
  | 'MINIGAME_ACTIVE'      // Real-time 15-30s mini-game execution
  | 'PAYOUT_RECAP'         // Winner takes match pot, spectator returns distributed
  | 'FINAL_PODIUM';        // Kahoot podium with 1st, 2nd, 3rd & special awards

export interface Player {
  id: string;
  name: string;
  avatar: string;
  color: string;
  isHost: boolean;
  isReady: boolean;
  isBot?: boolean;
  coins: number;
  // Performance stats for dynamic odds
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
  decimalOdds: number;      // e.g. 2.45
  fractionalOdds: string;   // e.g. "7/5"
  impliedWinProb: number;   // 0.0 - 1.0
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

export interface RoundState {
  roundNumber: number;
  maxRounds: number;
  miniGame: MiniGameMeta;
  fighterIds: [string, string];
  matchPot: number; // Virtual stakes awarded to winning fighter
  odds: Record<string, FighterOdds>;
  bets: SecretBet[];
  bettingTimeRemaining: number;
  gameTimeRemaining: number;
  winnerId: string | null;
  fighterScores: Record<string, number>;
  payouts: Array<{
    playerId: string;
    coinsChange: number;
    reason: string;
    newTotal: number;
  }>;
}

// -------------------------------------------------------------
// WEBSOCKET PROTOCOL SCHEMAS
// -------------------------------------------------------------

export type WebSocketMessageType =
  | 'ROOM_CREATED'
  | 'PLAYER_JOINED'
  | 'PLAYER_LEFT'
  | 'LOBBY_STATE'
  | 'START_GAME'
  | 'ROUND_INIT'
  | 'BET_PLACED'
  | 'ODDS_SYNC'
  | 'MINIGAME_START'
  | 'INPUT_EVENT'
  | 'MINIGAME_TICK'
  | 'GAME_OVER'
  | 'PAYOUT_SYNC'
  | 'FINAL_LEADERBOARD';

export interface BaseSocketMessage {
  type: WebSocketMessageType;
  timestamp: number;
  roomId: string;
}

export interface RoomCreatedPayload extends BaseSocketMessage {
  type: 'ROOM_CREATED';
  hostId: string;
  roomCode: string;
  localIp: string;
  port: number;
}

export interface PlayerJoinedPayload extends BaseSocketMessage {
  type: 'PLAYER_JOINED';
  player: Player;
}

export interface LobbyStatePayload extends BaseSocketMessage {
  type: 'LOBBY_STATE';
  players: Player[];
  roomCode: string;
  canStart: boolean;
  totalRounds: number;
}

export interface RoundInitPayload extends BaseSocketMessage {
  type: 'ROUND_INIT';
  roundNumber: number;
  maxRounds: number;
  fighterIds: [string, string];
  miniGame: MiniGameMeta;
  initialOdds: Record<string, FighterOdds>;
  bettingDuration: number;
}

export interface BetPlacedPayload extends BaseSocketMessage {
  type: 'BET_PLACED';
  bettorId: string;
  fighterId: string;
  amount: number;
}

export interface OddsSyncPayload extends BaseSocketMessage {
  type: 'ODDS_SYNC';
  odds: Record<string, FighterOdds>;
  totalPot: number;
}

export interface MiniGameStartPayload extends BaseSocketMessage {
  type: 'MINIGAME_START';
  miniGameId: MiniGameId;
  fighters: [Player, Player];
  duration: number;
}

export interface InputEventPayload extends BaseSocketMessage {
  type: 'INPUT_EVENT';
  playerId: string;
  action: string;
  value?: number | string | boolean;
}

export interface GameOverPayload extends BaseSocketMessage {
  type: 'GAME_OVER';
  winnerId: string;
  scores: Record<string, number>;
}

export interface PayoutSyncPayload extends BaseSocketMessage {
  type: 'PAYOUT_SYNC';
  winnerId: string;
  payouts: Array<{
    playerId: string;
    coinsChange: number;
    reason: string;
    newTotal: number;
  }>;
  leaderboard: Player[];
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

export interface FinalLeaderboardPayload extends BaseSocketMessage {
  type: 'FINAL_LEADERBOARD';
  rankings: Player[];
  awards: Award[];
}

export type AnyWebSocketMessage =
  | RoomCreatedPayload
  | PlayerJoinedPayload
  | LobbyStatePayload
  | RoundInitPayload
  | BetPlacedPayload
  | OddsSyncPayload
  | MiniGameStartPayload
  | InputEventPayload
  | GameOverPayload
  | PayoutSyncPayload
  | FinalLeaderboardPayload;
