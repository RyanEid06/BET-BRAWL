/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Authoritative Local Wi-Fi Express + WebSocket Server
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import type {
  Player,
  PublicPlayer,
  RoundState,
  GamePhase,
  ClientMessage,
  ServerMessage,
  Award,
  FighterAction,
  SecretBet,
} from './src/engine/types.ts';
import { toPublicPlayer } from './src/engine/types.ts';
import {
  generateRoomCode,
  createFreshPlayer,
  initAuthoritativeRound,
  computeSessionAwards,
  MIN_PLAYERS_TO_START,
  MAX_PLAYERS_CAPACITY,
  sanitizePlayerName,
  sanitizePlayerAvatar,
} from './src/engine/roomEngine.ts';
import {
  calculateDynamicOdds,
  validateBetPlacement,
  computeRoundPayouts,
} from './src/engine/odds.ts';
import {
  discoverLanAddresses,
} from './src/engine/networkDiscovery.ts';
import {
  InternalGameState,
  processFighterAction,
  resolveGameTimeout,
} from './src/engine/gameEngine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// -------------------------------------------------------------
// TIMER TRACKING INTERFACE
// -------------------------------------------------------------

interface RoomTimers {
  phaseTimer?: ReturnType<typeof setTimeout>;
  bettingInterval?: ReturnType<typeof setInterval>;
  botBetTimers: Array<ReturnType<typeof setTimeout>>;
  gameTimeoutTimer?: ReturnType<typeof setTimeout>;
  botGameTimers: Array<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>>;
  fighterGraceTimers: Map<string, ReturnType<typeof setTimeout>>;
  hostGraceTimer?: ReturnType<typeof setTimeout>;
}

interface ServerRoom {
  roomId: string;
  roomCode: string;
  hostToken: string;
  phase: GamePhase;
  players: Map<string, Player>; // sessionToken -> Player (private token kept server-side)
  clientSockets: Map<string, WebSocket>; // sessionToken -> ws
  totalRounds: number;
  currentRound: RoundState | null;
  internalGameState: InternalGameState | null;
  roundHistory: Array<{
    roundNumber: number;
    miniGameName: string;
    winnerName: string;
    totalPotWon: number;
  }>;
  awards: Award[];
  lastPairing?: [string, string];
  timers: RoomTimers;
}

let activeRoom: ServerRoom | null = null;

function clearAllTimers(timers: RoomTimers) {
  if (timers.phaseTimer) clearTimeout(timers.phaseTimer);
  if (timers.bettingInterval) clearInterval(timers.bettingInterval);
  timers.botBetTimers.forEach(clearTimeout);
  timers.botBetTimers = [];
  if (timers.gameTimeoutTimer) clearTimeout(timers.gameTimeoutTimer);
  timers.botGameTimers.forEach(t => {
    clearTimeout(t as any);
    clearInterval(t as any);
  });
  timers.botGameTimers = [];
  timers.fighterGraceTimers.forEach(clearTimeout);
  timers.fighterGraceTimers.clear();
  if (timers.hostGraceTimer) clearTimeout(timers.hostGraceTimer);
}

function createEmptyTimers(): RoomTimers {
  return {
    botBetTimers: [],
    botGameTimers: [],
    fighterGraceTimers: new Map(),
  };
}

/**
 * Broadcasts public room state to all connected clients.
 * NEVER leaks private session tokens or individual secret bets during the betting window.
 */
function broadcastRoomState() {
  if (!activeRoom) return;

  const publicPlayers: PublicPlayer[] = Array.from(activeRoom.players.values()).map(toPublicPlayer);

  // Compute public pool aggregates during betting window
  let publicRound: RoundState | null = null;
  if (activeRoom.currentRound) {
    const round = activeRoom.currentRound;
    const [fAId, fBId] = round.fighterIds;

    let scrubbedBets: SecretBet[] = [];
    if (activeRoom.phase === 'BETTING_WINDOW') {
      // Keep individual bettor details secret
      scrubbedBets = [];
    } else {
      scrubbedBets = round.bets;
    }

    publicRound = {
      ...round,
      bets: scrubbedBets,
    };
  }

  const payload = {
    roomId: activeRoom.roomId,
    roomCode: activeRoom.roomCode,
    phase: activeRoom.phase,
    players: publicPlayers,
    totalRounds: activeRoom.totalRounds,
    currentRound: publicRound,
    roundHistory: activeRoom.roundHistory,
    awards: activeRoom.awards,
  };

  const message: ServerMessage = {
    type: 'ROOM_STATE',
    timestamp: Date.now(),
    payload,
  };

  const data = JSON.stringify(message);
  for (const client of activeRoom.clientSockets.values()) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

// REST endpoint for local network discovery & IP
app.get('/api/network-info', (req, res) => {
  const { primaryIp, candidateIps } = discoverLanAddresses();
  const candidateUrls = candidateIps.map(ip => `http://${ip}:${PORT}`);

  res.json({
    localIp: primaryIp,
    port: PORT,
    hasActiveRoom: !!activeRoom,
    roomCode: activeRoom ? activeRoom.roomCode : null,
    playerCount: activeRoom ? activeRoom.players.size : 0,
    candidateUrls,
  });
});

// -------------------------------------------------------------
// WEBSOCKET AUTHORITATIVE PROTOCOL HANDLERS
// -------------------------------------------------------------

wss.on('connection', (ws: WebSocket) => {
  let boundSessionToken: string | null = null;

  ws.on('message', (raw: string) => {
    try {
      const msg: ClientMessage = JSON.parse(raw.toString());

      // Ping-pong for synchronized server time & clock offset estimation
      if (msg.type === 'PING') {
        const clientSentAt = msg.payload?.clientSentAt;
        ws.send(JSON.stringify({
          type: 'PONG',
          timestamp: Date.now(),
          payload: {
            clientSentAt,
            serverNow: Date.now(),
          },
        }));
        return;
      }

      // 1. CREATE_ROOM (Host action)
      if (msg.type === 'CREATE_ROOM') {
        const { playerName, avatar } = msg.payload || {};

        // Protection: do not allow a random new client to overwrite an active room
        if (activeRoom && activeRoom.players.size > 0 && activeRoom.phase !== 'FINAL_PODIUM') {
          // If the requester is not the existing room's host, reject
          if (boundSessionToken !== activeRoom.hostToken) {
            ws.send(JSON.stringify({
              type: 'JOIN_ERROR',
              timestamp: Date.now(),
              payload: {
                code: 'ROOM_ALREADY_ACTIVE',
                message: `A game room (${activeRoom.roomCode}) is already running on this server. Join with the code.`,
              },
            }));
            return;
          }
        }

        // Clean up previous room timers
        if (activeRoom) {
          clearAllTimers(activeRoom.timers);
        }

        const roomCode = generateRoomCode();
        const roomId = `room_${Date.now()}`;
        const hostPlayer = createFreshPlayer(playerName || 'Host', avatar || '⚡', true);

        activeRoom = {
          roomId,
          roomCode,
          hostToken: hostPlayer.sessionToken,
          phase: 'LOBBY',
          players: new Map([[hostPlayer.sessionToken, hostPlayer]]),
          clientSockets: new Map([[hostPlayer.sessionToken, ws]]),
          totalRounds: 8,
          currentRound: null,
          internalGameState: null,
          roundHistory: [],
          awards: [],
          timers: createEmptyTimers(),
        };

        boundSessionToken = hostPlayer.sessionToken;

        // Deliver private sessionToken ONLY to this specific socket
        const successMsg: ServerMessage = {
          type: 'JOIN_SUCCESS',
          timestamp: Date.now(),
          payload: {
            player: toPublicPlayer(hostPlayer),
            sessionToken: hostPlayer.sessionToken,
            roomCode,
            isHost: true,
          },
        };
        ws.send(JSON.stringify(successMsg));
        broadcastRoomState();
        return;
      }

      // 2. JOIN_ROOM (Client action / reconnect)
      if (msg.type === 'JOIN_ROOM') {
        const { roomCode, playerName, avatar, sessionToken } = msg.payload || {};

        if (!activeRoom) {
          ws.send(JSON.stringify({
            type: 'JOIN_ERROR',
            timestamp: Date.now(),
            payload: { code: 'ROOM_NOT_FOUND', message: 'No active room hosted on this server.' },
          }));
          return;
        }

        if (activeRoom.roomCode.toUpperCase() !== (roomCode || '').trim().toUpperCase()) {
          ws.send(JSON.stringify({
            type: 'JOIN_ERROR',
            timestamp: Date.now(),
            payload: { code: 'INVALID_CODE', message: `Invalid room code: ${roomCode}` },
          }));
          return;
        }

        // RECONNECT: check if reconnecting with an existing valid sessionToken
        if (sessionToken && activeRoom.players.has(sessionToken)) {
          const existing = activeRoom.players.get(sessionToken)!;
          existing.connected = true;
          activeRoom.clientSockets.set(sessionToken, ws);
          boundSessionToken = sessionToken;

          // Clear any disconnect grace timer
          if (activeRoom.timers.fighterGraceTimers.has(existing.id)) {
            clearTimeout(activeRoom.timers.fighterGraceTimers.get(existing.id));
            activeRoom.timers.fighterGraceTimers.delete(existing.id);
          }
          if (existing.isHost && activeRoom.timers.hostGraceTimer) {
            clearTimeout(activeRoom.timers.hostGraceTimer);
            activeRoom.timers.hostGraceTimer = undefined;
          }

          ws.send(JSON.stringify({
            type: 'JOIN_SUCCESS',
            timestamp: Date.now(),
            payload: {
              player: toPublicPlayer(existing),
              sessionToken: existing.sessionToken,
              roomCode: activeRoom.roomCode,
              isHost: existing.isHost,
            },
          }));
          broadcastRoomState();
          return;
        }

        // NEW PLAYER JOIN
        if (activeRoom.phase !== 'LOBBY') {
          ws.send(JSON.stringify({
            type: 'JOIN_ERROR',
            timestamp: Date.now(),
            payload: { code: 'GAME_IN_PROGRESS', message: 'Match already in progress.' },
          }));
          return;
        }

        if (activeRoom.players.size >= MAX_PLAYERS_CAPACITY) {
          ws.send(JSON.stringify({
            type: 'JOIN_ERROR',
            timestamp: Date.now(),
            payload: { code: 'ROOM_FULL', message: 'Room is full (max 9 players).' },
          }));
          return;
        }

        const safeName = sanitizePlayerName(playerName);
        const safeAvatar = sanitizePlayerAvatar(avatar);
        const newPlayer = createFreshPlayer(safeName, safeAvatar, false);

        activeRoom.players.set(newPlayer.sessionToken, newPlayer);
        activeRoom.clientSockets.set(newPlayer.sessionToken, ws);
        boundSessionToken = newPlayer.sessionToken;

        ws.send(JSON.stringify({
          type: 'JOIN_SUCCESS',
          timestamp: Date.now(),
          payload: {
            player: toPublicPlayer(newPlayer),
            sessionToken: newPlayer.sessionToken,
            roomCode: activeRoom.roomCode,
            isHost: false,
          },
        }));
        broadcastRoomState();
        return;
      }

      // SECURITY: all other messages MUST use the session token bound to this WebSocket.
      // Sockets cannot send arbitrary sessionTokens in payloads to impersonate other players!
      if (!activeRoom || !boundSessionToken || !activeRoom.players.has(boundSessionToken)) {
        return;
      }

      const player = activeRoom.players.get(boundSessionToken)!;

      // 3. TOGGLE_READY
      if (msg.type === 'TOGGLE_READY') {
        if (activeRoom.phase === 'LOBBY') {
          player.isReady = !player.isReady;
          broadcastRoomState();
        }
        return;
      }

      // 4. SET_MATCH_LENGTH (Host-only, LOBBY-only)
      if (msg.type === 'SET_MATCH_LENGTH') {
        if (!player.isHost || activeRoom.phase !== 'LOBBY') return;
        const total = msg.payload?.totalRounds;
        if (total === 8 || total === 10) {
          activeRoom.totalRounds = total;
          broadcastRoomState();
        }
        return;
      }

      // 5. START_GAME (Host-only, LOBBY-only)
      if (msg.type === 'START_GAME') {
        if (!player.isHost) {
          ws.send(JSON.stringify({
            type: 'JOIN_ERROR',
            timestamp: Date.now(),
            payload: { code: 'NOT_HOST', message: 'Only the room host can start the match.' },
          }));
          return;
        }
        if (activeRoom.phase !== 'LOBBY') return;

        const playerList = Array.from(activeRoom.players.values());
        const connectedPlayers = playerList.filter(p => p.connected);
        const isDebug = msg.payload?.debug === true;

        if (connectedPlayers.length < MIN_PLAYERS_TO_START && !isDebug) {
          ws.send(JSON.stringify({
            type: 'JOIN_ERROR',
            timestamp: Date.now(),
            payload: {
              code: 'NOT_ENOUGH_PLAYERS',
              message: `Need at least ${MIN_PLAYERS_TO_START} connected players to start (currently ${connectedPlayers.length}).`,
            },
          }));
          return;
        }

        const allReady = connectedPlayers.every(p => p.isReady || p.isHost);
        if (!allReady && !isDebug) {
          ws.send(JSON.stringify({
            type: 'JOIN_ERROR',
            timestamp: Date.now(),
            payload: { code: 'NOT_ALL_READY', message: 'All connected players must be READY before starting.' },
          }));
          return;
        }

        startRound(1);
        return;
      }

      // 6. PLACE_BET
      if (msg.type === 'PLACE_BET') {
        const { fighterId, amount } = msg.payload || {};
        const error = validateBetPlacement(
          player,
          fighterId,
          amount,
          activeRoom.currentRound,
          activeRoom.phase
        );

        if (error) {
          ws.send(JSON.stringify({
            type: 'BET_REJECTED',
            timestamp: Date.now(),
            payload: { reason: error },
          }));
          return;
        }

        // Deduct coins & record secret bet
        player.coins -= amount;
        player.totalBetsPlaced += 1;
        player.highestSingleBet = Math.max(player.highestSingleBet, amount);

        const currentOdds = activeRoom.currentRound!.odds[fighterId]?.decimalOdds || 2.0;
        const newBet: SecretBet = {
          bettorId: player.id,
          fighterId,
          amount,
          oddsAtBet: currentOdds,
          timestamp: Date.now(),
          potentialReturn: Math.floor(amount * currentOdds),
        };
        activeRoom.currentRound!.bets.push(newBet);

        // Notify bettor privately of their accepted wager
        ws.send(JSON.stringify({
          type: 'BET_ACCEPTED',
          timestamp: Date.now(),
          payload: {
            bet: newBet,
            myBankroll: player.coins,
          },
        }));

        // Dynamically update odds with the new bet
        const fA = Array.from(activeRoom.players.values()).find(p => p.id === activeRoom!.currentRound!.fighterIds[0])!;
        const fB = Array.from(activeRoom.players.values()).find(p => p.id === activeRoom!.currentRound!.fighterIds[1])!;
        activeRoom.currentRound!.odds = calculateDynamicOdds(fA, fB, activeRoom.currentRound!.bets);

        broadcastRoomState();
        return;
      }

      // 7. FIGHTER_ACTION (Authoritative Mini-Game Gameplay Action)
      if (msg.type === 'FIGHTER_ACTION') {
        if (!activeRoom.currentRound || !activeRoom.internalGameState || activeRoom.phase !== 'MINIGAME_ACTIVE') {
          return;
        }

        const action: FighterAction = msg.payload;
        const now = Date.now();

        const result = processFighterAction(
          activeRoom.internalGameState,
          activeRoom.currentRound.fighterScores,
          player.id,
          action,
          now
        );

        if (result.gameStatePatch) {
          activeRoom.currentRound.gameState = {
            ...activeRoom.currentRound.gameState,
            ...result.gameStatePatch,
          };
        }

        if (result.resolved) {
          resolveCurrentGame(result.winnerId, result.isTie);
        } else {
          broadcastRoomState();
        }
        return;
      }

      // 8. NEXT_ROUND (Host only, PAYOUT_RECAP only)
      if (msg.type === 'NEXT_ROUND') {
        if (!player.isHost || !activeRoom.currentRound || activeRoom.phase !== 'PAYOUT_RECAP') return;

        if (activeRoom.currentRound.roundNumber >= activeRoom.totalRounds) {
          activeRoom.phase = 'FINAL_PODIUM';
          activeRoom.awards = computeSessionAwards(Array.from(activeRoom.players.values()));
          broadcastRoomState();
        } else {
          startRound(activeRoom.currentRound.roundNumber + 1);
        }
        return;
      }

      // 9. RESTART_GAME (Host only, FINAL_PODIUM only)
      if (msg.type === 'RESTART_GAME') {
        if (!player.isHost || activeRoom.phase !== 'FINAL_PODIUM') return;

        clearAllTimers(activeRoom.timers);

        // Reset players to initial 1000 coins and clean session statistics
        for (const p of activeRoom.players.values()) {
          p.coins = 1000;
          p.matchesWon = 0;
          p.matchesPlayed = 0;
          p.totalBetsPlaced = 0;
          p.totalBetsWon = 0;
          p.totalCoinsWonInBets = 0;
          p.totalCoinsLostInBets = 0;
          p.highestSingleBet = 0;
          p.highestSinglePayout = 0;
          p.isReady = false;
        }
        activeRoom.phase = 'LOBBY';
        activeRoom.currentRound = null;
        activeRoom.internalGameState = null;
        activeRoom.roundHistory = [];
        activeRoom.awards = [];
        broadcastRoomState();
        return;
      }

      // 10. CLOSE_ROOM (Host only)
      if (msg.type === 'CLOSE_ROOM') {
        if (!player.isHost) return;

        clearAllTimers(activeRoom.timers);
        const closeMsg: ServerMessage = {
          type: 'ROOM_CLOSED',
          timestamp: Date.now(),
          payload: { reason: 'The host closed the room.' },
        };
        const rawMsg = JSON.stringify(closeMsg);
        for (const sock of activeRoom.clientSockets.values()) {
          if (sock.readyState === WebSocket.OPEN) {
            sock.send(rawMsg);
          }
        }
        activeRoom = null;
        return;
      }

      // 11. DEBUG_ADD_BOT (Debug mode only, host only, lobby only)
      if (msg.type === 'DEBUG_ADD_BOT') {
        if (!player.isHost || activeRoom.phase !== 'LOBBY') return;
        if (activeRoom.players.size < MAX_PLAYERS_CAPACITY) {
          const idx = activeRoom.players.size + 1;
          const bot = createFreshPlayer(`Bot ${idx}`, '🤖', false);
          bot.isBot = true;
          bot.isReady = true;
          activeRoom.players.set(bot.sessionToken, bot);
          broadcastRoomState();
        }
        return;
      }
    } catch (err) {
      console.error('[BET & BRAWL] WebSocket error handling message:', err);
    }
  });

  ws.on('close', () => {
    if (boundSessionToken && activeRoom && activeRoom.players.has(boundSessionToken)) {
      const p = activeRoom.players.get(boundSessionToken)!;
      p.connected = false;
      activeRoom.clientSockets.delete(boundSessionToken);

      // Disconnect handling during active gameplay
      if (activeRoom.phase === 'MINIGAME_ACTIVE' && activeRoom.currentRound) {
        const [f1, f2] = activeRoom.currentRound.fighterIds;
        if (p.id === f1 || p.id === f2) {
          const otherFighterId = p.id === f1 ? f2 : f1;
          // 5-second grace window for fighter to reconnect
          const graceTimer = setTimeout(() => {
            if (!activeRoom || activeRoom.phase !== 'MINIGAME_ACTIVE') return;
            const stillDisconnected = activeRoom.players.get(boundSessionToken!)?.connected === false;
            if (stillDisconnected) {
              // Forfeit to connected fighter
              resolveCurrentGame(otherFighterId, false);
            }
          }, 5000);
          activeRoom.timers.fighterGraceTimers.set(p.id, graceTimer);
        }
      }

      // Host disconnect handling: 60s grace period
      if (p.isHost) {
        if (activeRoom.timers.hostGraceTimer) clearTimeout(activeRoom.timers.hostGraceTimer);
        activeRoom.timers.hostGraceTimer = setTimeout(() => {
          if (activeRoom && activeRoom.players.get(boundSessionToken!)?.connected === false) {
            // Close room cleanly if host never returns
            clearAllTimers(activeRoom.timers);
            const closeMsg: ServerMessage = {
              type: 'ROOM_CLOSED',
              timestamp: Date.now(),
              payload: { reason: 'Host disconnected and did not return.' },
            };
            const rawMsg = JSON.stringify(closeMsg);
            for (const sock of activeRoom.clientSockets.values()) {
              if (sock.readyState === WebSocket.OPEN) {
                sock.send(rawMsg);
              }
            }
            activeRoom = null;
          }
        }, 60000);
      }

      broadcastRoomState();
    }
  });
});

// -------------------------------------------------------------
// ROUND LIFECYCLE MANAGEMENT
// -------------------------------------------------------------

function startRound(roundNum: number) {
  if (!activeRoom) return;

  clearAllTimers(activeRoom.timers);

  const playerList = Array.from(activeRoom.players.values());
  const { round, internalGame } = initAuthoritativeRound(
    roundNum,
    activeRoom.totalRounds,
    playerList,
    activeRoom.lastPairing
  );

  activeRoom.currentRound = round;
  activeRoom.internalGameState = internalGame;
  activeRoom.lastPairing = round.fighterIds;
  activeRoom.phase = 'FIGHTER_REVEAL';
  broadcastRoomState();

  const currentRoomId = activeRoom.roomId;
  const currentRoundNum = roundNum;

  // Timed reveal countdown -> automatically transition to betting window
  activeRoom.timers.phaseTimer = setTimeout(() => {
    if (!activeRoom || activeRoom.roomId !== currentRoomId || activeRoom.currentRound?.roundNumber !== currentRoundNum) {
      return;
    }
    openBettingWindow();
  }, 4500);
}

function openBettingWindow() {
  if (!activeRoom || !activeRoom.currentRound) return;
  const room = activeRoom;
  const currentRound = room.currentRound;
  if (!currentRound) return;

  const currentRoomId = room.roomId;
  const currentRoundNum = currentRound.roundNumber;

  room.phase = 'BETTING_WINDOW';
  currentRound.bettingTimeRemaining = 15;
  currentRound.bettingEndsAt = Date.now() + 15000;
  broadcastRoomState();

  // If there are server debug bot spectators, schedule realistic wagers
  const botSpectators = Array.from(room.players.values()).filter(
    p => p.isBot && !room.currentRound!.fighterIds.includes(p.id)
  );

  botSpectators.forEach((bot, idx) => {
    const delayMs = 1500 + idx * 1200 + Math.random() * 1500;
    const t = setTimeout(() => {
      if (!activeRoom || activeRoom.roomId !== currentRoomId || activeRoom.phase !== 'BETTING_WINDOW') return;
      if (activeRoom.currentRound?.bets.some(b => b.bettorId === bot.id)) return;

      const [fAId, fBId] = activeRoom.currentRound!.fighterIds;
      const targetFighterId = Math.random() < 0.5 ? fAId : fBId;
      const betAmt = Math.min(bot.coins, [50, 100, 150][Math.floor(Math.random() * 3)]);
      if (betAmt <= 0) return;

      bot.coins -= betAmt;
      bot.totalBetsPlaced += 1;
      bot.highestSingleBet = Math.max(bot.highestSingleBet, betAmt);

      const currentOdds = activeRoom.currentRound!.odds[targetFighterId]?.decimalOdds || 2.0;
      activeRoom.currentRound!.bets.push({
        bettorId: bot.id,
        fighterId: targetFighterId,
        amount: betAmt,
        oddsAtBet: currentOdds,
        timestamp: Date.now(),
        potentialReturn: Math.floor(betAmt * currentOdds),
      });

      const fA = Array.from(activeRoom.players.values()).find(p => p.id === fAId)!;
      const fB = Array.from(activeRoom.players.values()).find(p => p.id === fBId)!;
      activeRoom.currentRound!.odds = calculateDynamicOdds(fA, fB, activeRoom.currentRound!.bets);

      broadcastRoomState();
    }, delayMs);
    room.timers.botBetTimers.push(t);
  });

  room.timers.bettingInterval = setInterval(() => {
    if (!activeRoom || activeRoom.roomId !== currentRoomId || !activeRoom.currentRound) return;
    activeRoom.currentRound.bettingTimeRemaining -= 1;

    if (activeRoom.currentRound.bettingTimeRemaining <= 0) {
      clearInterval(room.timers.bettingInterval);
      startMiniGameCountdown();
    } else {
      broadcastRoomState();
    }
  }, 1000);
}

function startMiniGameCountdown() {
  if (!activeRoom || !activeRoom.currentRound) return;

  const currentRoomId = activeRoom.roomId;
  const currentRoundNum = activeRoom.currentRound.roundNumber;

  activeRoom.phase = 'MINIGAME_COUNTDOWN';
  broadcastRoomState();

  activeRoom.timers.phaseTimer = setTimeout(() => {
    if (!activeRoom || activeRoom.roomId !== currentRoomId || activeRoom.currentRound?.roundNumber !== currentRoundNum) {
      return;
    }
    launchActiveMiniGame();
  }, 3500);
}

function launchActiveMiniGame() {
  if (!activeRoom || !activeRoom.currentRound || !activeRoom.internalGameState) return;
  const room = activeRoom;
  const round = room.currentRound;
  const internal = room.internalGameState;
  if (!round || !internal) return;

  const currentRoomId = room.roomId;
  const currentRoundNum = round.roundNumber;

  room.phase = 'MINIGAME_ACTIVE';
  round.gameStartsAt = Date.now();
  round.gameEndsAt = round.gameStartsAt + round.miniGame.durationSeconds * 1000;
  internal.gameStartsAt = round.gameStartsAt;

  if (round.miniGame.id === 'quick_draw' && internal.quickDraw) {
    internal.quickDraw.drawAt = round.gameStartsAt + internal.quickDraw.drawDelayMs;
    round.gameConfig!.drawAt = internal.quickDraw.drawAt;
  }

  broadcastRoomState();

  const [f1, f2] = round.fighterIds;
  const p1 = Array.from(room.players.values()).find(p => p.id === f1);
  const p2 = Array.from(room.players.values()).find(p => p.id === f2);

  // SERVER-SIDE DEBUG BOT SIMULATION ONLY: if either fighter is a server bot
  [p1, p2].forEach(p => {
    if (!p || !p.isBot) return;

    if (round.miniGame.id === 'millisecond_stop') {
      const stopTargetMs = Math.floor(4850 + Math.random() * 320);
      const t = setTimeout(() => {
        if (!activeRoom || activeRoom.roomId !== currentRoomId || activeRoom.phase !== 'MINIGAME_ACTIVE') return;
        const res = processFighterAction(internal, round.fighterScores, p.id, { type: 'STOP' }, Date.now());
        if (res.resolved) {
          resolveCurrentGame(res.winnerId, res.isTie);
        } else {
          broadcastRoomState();
        }
      }, stopTargetMs);
      room.timers.botGameTimers.push(t);
    } else if (round.miniGame.id === 'rapid_red_green') {
      const interval = setInterval(() => {
        if (!activeRoom || activeRoom.roomId !== currentRoomId || activeRoom.phase !== 'MINIGAME_ACTIVE') {
          clearInterval(interval);
          return;
        }
        const res = processFighterAction(internal, round.fighterScores, p.id, { type: 'TAP' }, Date.now());
        if (res.resolved) {
          clearInterval(interval);
          resolveCurrentGame(res.winnerId, res.isTie);
        } else {
          broadcastRoomState();
        }
      }, 200 + Math.random() * 80);
      room.timers.botGameTimers.push(interval);
    } else if (round.miniGame.id === 'speed_math') {
      let qIdx = 0;
      const stepInterval = setInterval(() => {
        if (!activeRoom || activeRoom.roomId !== currentRoomId || activeRoom.phase !== 'MINIGAME_ACTIVE' || qIdx >= 3) {
          clearInterval(stepInterval);
          return;
        }
        const answer = internal.speedMath!.correctAnswers[qIdx];
        const res = processFighterAction(internal, round.fighterScores, p.id, { type: 'ANSWER', questionIndex: qIdx, answer }, Date.now());
        qIdx++;
        if (res.resolved) {
          clearInterval(stepInterval);
          resolveCurrentGame(res.winnerId, res.isTie);
        } else {
          broadcastRoomState();
        }
      }, 2400);
      room.timers.botGameTimers.push(stepInterval);
    } else if (round.miniGame.id === 'higher_lower') {
      let stepIdx = 0;
      const stepInterval = setInterval(() => {
        if (!activeRoom || activeRoom.roomId !== currentRoomId || activeRoom.phase !== 'MINIGAME_ACTIVE' || stepIdx >= 3) {
          clearInterval(stepInterval);
          return;
        }
        const card = internal.higherLower!.cards[stepIdx];
        const guess = card.isHigher ? 'HIGHER' : 'LOWER';
        const res = processFighterAction(internal, round.fighterScores, p.id, { type: 'GUESS', questionIndex: stepIdx, guess }, Date.now());
        stepIdx++;
        if (res.resolved) {
          clearInterval(stepInterval);
          resolveCurrentGame(res.winnerId, res.isTie);
        } else {
          broadcastRoomState();
        }
      }, 2600);
      room.timers.botGameTimers.push(stepInterval);
    } else if (round.miniGame.id === 'blind_pinpoint') {
      const t = setTimeout(() => {
        if (!activeRoom || activeRoom.roomId !== currentRoomId || activeRoom.phase !== 'MINIGAME_ACTIVE') return;
        const target = internal.blindPinpoint!.targetCity;
        // Bot pins reasonably close
        const normX = (target.lon + 180) / 360 + (Math.random() - 0.5) * 0.08;
        const normY = (90 - target.lat) / 180 + (Math.random() - 0.5) * 0.08;
        const res = processFighterAction(internal, round.fighterScores, p.id, {
          type: 'PIN',
          normX: Math.max(0, Math.min(1, normX)),
          normY: Math.max(0, Math.min(1, normY)),
        }, Date.now());

        if (res.resolved) {
          resolveCurrentGame(res.winnerId, res.isTie);
        } else {
          broadcastRoomState();
        }
      }, 3000);
      room.timers.botGameTimers.push(t);
    } else if (round.miniGame.id === 'quick_draw') {
      const delay = internal.quickDraw!.drawDelayMs;
      const reaction = 280 + Math.floor(Math.random() * 150);
      const t = setTimeout(() => {
        if (!activeRoom || activeRoom.roomId !== currentRoomId || activeRoom.phase !== 'MINIGAME_ACTIVE') return;
        const res = processFighterAction(internal, round.fighterScores, p.id, { type: 'DRAW_TAP' }, Date.now());
        if (res.resolved) {
          resolveCurrentGame(res.winnerId, res.isTie);
        } else {
          broadcastRoomState();
        }
      }, delay + reaction);
      room.timers.botGameTimers.push(t);
    }
  });

  // Global game duration timeout fallback
  const durationMs = round.miniGame.durationSeconds * 1000;
  room.timers.gameTimeoutTimer = setTimeout(() => {
    if (!activeRoom || activeRoom.roomId !== currentRoomId || activeRoom.phase !== 'MINIGAME_ACTIVE') return;
    const timeoutResult = resolveGameTimeout(internal, round.fighterScores);
    if (timeoutResult.gameStatePatch) {
      round.gameState = { ...round.gameState, ...timeoutResult.gameStatePatch };
    }
    resolveCurrentGame(timeoutResult.winnerId, timeoutResult.isTie);
  }, durationMs + 1000);
}

function resolveCurrentGame(winnerId: string | null, isTie: boolean) {
  if (!activeRoom || !activeRoom.currentRound || activeRoom.phase !== 'MINIGAME_ACTIVE') return;

  clearAllTimers(activeRoom.timers);

  const round = activeRoom.currentRound;
  round.winnerId = winnerId;
  round.tieResult = isTie;

  const playerList = Array.from(activeRoom.players.values());
  const { payouts, updatedPlayers } = computeRoundPayouts(
    winnerId,
    isTie,
    round.fighterIds,
    round.matchPot,
    round.bets,
    playerList
  );

  round.payouts = payouts;
  for (const p of updatedPlayers) {
    activeRoom.players.set(p.sessionToken, p);
  }

  const winningPlayer = updatedPlayers.find(p => p.id === winnerId);
  activeRoom.roundHistory.push({
    roundNumber: round.roundNumber,
    miniGameName: round.miniGame.name,
    winnerName: isTie ? 'TIE' : winningPlayer?.name || 'Unknown',
    totalPotWon: round.matchPot,
  });

  activeRoom.phase = 'PAYOUT_RECAP';
  broadcastRoomState();
}

// -------------------------------------------------------------
// VITE DEV MIDDLEWARE / STATIC ASSETS
// -------------------------------------------------------------

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const distPath = path.resolve(__dirname, 'dist');
  const distExists = fs.existsSync(distPath);

  if (isProd || distExists) {
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, HOST, () => {
    const { primaryIp } = discoverLanAddresses();
    console.log(`\n======================================================`);
    console.log(`BET & BRAWL ready`);
    console.log(`Local: http://localhost:${PORT}`);
    console.log(`LAN:   http://${primaryIp}:${PORT}`);
    console.log(`Bound: ${HOST}:${PORT}`);
    console.log(`======================================================\n`);
  });
}

// Export for integration testing
export { app, server, activeRoom };

// Run only when directly invoked
if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  startServer();
}
