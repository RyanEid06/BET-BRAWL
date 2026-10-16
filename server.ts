/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Authoritative Local Wi-Fi Express + WebSocket Server
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import type {
  Player,
  RoundState,
  GamePhase,
  ClientMessage,
  ServerMessage,
  Award,
} from './src/engine/types.ts';
import {
  generateRoomCode,
  createFreshPlayer,
  initAuthoritativeRound,
  computeSessionAwards,
  MIN_PLAYERS_TO_START,
  MAX_PLAYERS_CAPACITY,
} from './src/engine/roomEngine.ts';
import {
  calculateDynamicOdds,
  validateBetPlacement,
  computeRoundPayouts,
} from './src/engine/odds.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

/**
 * Detects the real usable local network IPv4 address for Wi-Fi peers.
 */
export function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      // Find non-internal IPv4 address
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const app = express();
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// -------------------------------------------------------------
// AUTHORITATIVE SERVER ROOM STATE
// -------------------------------------------------------------

interface ServerRoom {
  roomId: string;
  roomCode: string;
  hostToken: string;
  phase: GamePhase;
  players: Map<string, Player>; // sessionToken -> Player
  clientSockets: Map<string, WebSocket>; // sessionToken -> ws
  totalRounds: number;
  currentRound: RoundState | null;
  roundHistory: Array<{
    roundNumber: number;
    miniGameName: string;
    winnerName: string;
    totalPotWon: number;
  }>;
  awards: Award[];
  lastPairing?: [string, string];
  bettingTimer?: NodeJS.Timeout;
  gameTimer?: NodeJS.Timeout;
}

let activeRoom: ServerRoom | null = null;

function broadcastRoomState() {
  if (!activeRoom) return;

  const playerList = Array.from(activeRoom.players.values());
  const payload = {
    roomId: activeRoom.roomId,
    roomCode: activeRoom.roomCode,
    phase: activeRoom.phase,
    players: playerList,
    totalRounds: activeRoom.totalRounds,
    currentRound: activeRoom.currentRound
      ? {
          ...activeRoom.currentRound,
          // Keep individual bets secret during betting window:
          bets: activeRoom.phase === 'BETTING_WINDOW'
            ? activeRoom.currentRound.bets.map(b => ({
                bettorId: 'hidden',
                fighterId: b.fighterId,
                amount: b.amount,
                oddsAtBet: b.oddsAtBet,
                timestamp: b.timestamp,
                potentialReturn: 0,
              }))
            : activeRoom.currentRound.bets,
        }
      : null,
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

function sendToToken(token: string, message: ServerMessage) {
  if (!activeRoom) return;
  const ws = activeRoom.clientSockets.get(token);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// REST endpoint for local network discovery & IP
app.get('/api/network-info', (req, res) => {
  const localIp = getLocalIpAddress();
  res.json({
    localIp,
    port: PORT,
    hasActiveRoom: !!activeRoom,
    roomCode: activeRoom ? activeRoom.roomCode : null,
    playerCount: activeRoom ? activeRoom.players.size : 0,
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

      if (msg.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now(), payload: {} }));
        return;
      }

      // 1. CREATE_ROOM (Host action)
      if (msg.type === 'CREATE_ROOM' as any) {
        const { playerName, avatar } = msg.payload || {};
        const roomCode = generateRoomCode();
        const roomId = `room_${Date.now()}`;
        const hostPlayer = createFreshPlayer(playerName || 'Host', avatar || '⚡', true);

        // Cancel previous room timers if any
        if (activeRoom?.bettingTimer) clearInterval(activeRoom.bettingTimer);
        if (activeRoom?.gameTimer) clearInterval(activeRoom.gameTimer);

        activeRoom = {
          roomId,
          roomCode,
          hostToken: hostPlayer.sessionToken,
          phase: 'LOBBY',
          players: new Map([[hostPlayer.sessionToken, hostPlayer]]),
          clientSockets: new Map([[hostPlayer.sessionToken, ws]]),
          totalRounds: 8,
          currentRound: null,
          roundHistory: [],
          awards: [],
        };

        boundSessionToken = hostPlayer.sessionToken;

        const successMsg: ServerMessage = {
          type: 'JOIN_SUCCESS',
          timestamp: Date.now(),
          payload: {
            player: hostPlayer,
            sessionToken: hostPlayer.sessionToken,
            roomCode,
            isHost: true,
          },
        };
        ws.send(JSON.stringify(successMsg));
        broadcastRoomState();
        return;
      }

      // 2. JOIN_ROOM (Client action)
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

        if (activeRoom.roomCode.toUpperCase() !== (roomCode || '').toUpperCase()) {
          ws.send(JSON.stringify({
            type: 'JOIN_ERROR',
            timestamp: Date.now(),
            payload: { code: 'INVALID_CODE', message: `Invalid room code: ${roomCode}` },
          }));
          return;
        }

        // Check if reconnecting existing session token
        if (sessionToken && activeRoom.players.has(sessionToken)) {
          const existing = activeRoom.players.get(sessionToken)!;
          existing.connected = true;
          activeRoom.clientSockets.set(sessionToken, ws);
          boundSessionToken = sessionToken;

          ws.send(JSON.stringify({
            type: 'JOIN_SUCCESS',
            timestamp: Date.now(),
            payload: {
              player: existing,
              sessionToken: existing.sessionToken,
              roomCode: activeRoom.roomCode,
              isHost: existing.isHost,
            },
          }));
          broadcastRoomState();
          return;
        }

        // New player joins
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

        const newPlayer = createFreshPlayer(playerName || 'Player', avatar || '🦊', false);
        activeRoom.players.set(newPlayer.sessionToken, newPlayer);
        activeRoom.clientSockets.set(newPlayer.sessionToken, ws);
        boundSessionToken = newPlayer.sessionToken;

        ws.send(JSON.stringify({
          type: 'JOIN_SUCCESS',
          timestamp: Date.now(),
          payload: {
            player: newPlayer,
            sessionToken: newPlayer.sessionToken,
            roomCode: activeRoom.roomCode,
            isHost: false,
          },
        }));
        broadcastRoomState();
        return;
      }

      // Session authentication check for gameplay messages
      const token = msg.sessionToken || boundSessionToken;
      if (!activeRoom || !token || !activeRoom.players.has(token)) {
        return;
      }

      const player = activeRoom.players.get(token)!;

      // 3. TOGGLE_READY
      if (msg.type === 'TOGGLE_READY') {
        if (activeRoom.phase === 'LOBBY') {
          player.isReady = !player.isReady;
          broadcastRoomState();
        }
        return;
      }

      // 4. START_GAME (Host-only)
      if (msg.type === 'START_GAME') {
        if (!player.isHost) {
          ws.send(JSON.stringify({
            type: 'JOIN_ERROR',
            timestamp: Date.now(),
            payload: { code: 'NOT_HOST', message: 'Only the room host can start the match.' },
          }));
          return;
        }

        const playerList = Array.from(activeRoom.players.values());
        const isDebug = msg.payload?.debug === true;

        if (playerList.length < MIN_PLAYERS_TO_START && !isDebug) {
          ws.send(JSON.stringify({
            type: 'JOIN_ERROR',
            timestamp: Date.now(),
            payload: {
              code: 'NOT_ENOUGH_PLAYERS',
              message: `Need at least ${MIN_PLAYERS_TO_START} players to start (currently ${playerList.length}).`,
            },
          }));
          return;
        }

        const allReady = playerList.every(p => p.isReady || p.isHost);
        if (!allReady && !isDebug) {
          ws.send(JSON.stringify({
            type: 'JOIN_ERROR',
            timestamp: Date.now(),
            payload: { code: 'NOT_ALL_READY', message: 'All players must be READY before starting.' },
          }));
          return;
        }

        // Initialize round 1
        startRound(1);
        return;
      }

      // 5. PLACE_BET
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

        // Valid bet: deduct coins and record secret bet
        player.coins -= amount;
        player.totalBetsPlaced += 1;
        player.highestSingleBet = Math.max(player.highestSingleBet, amount);

        const currentOdds = activeRoom.currentRound!.odds[fighterId]?.decimalOdds || 2.0;
        activeRoom.currentRound!.bets.push({
          bettorId: player.id,
          fighterId,
          amount,
          oddsAtBet: currentOdds,
          timestamp: Date.now(),
          potentialReturn: Math.floor(amount * currentOdds),
        });

        // Rebalance odds dynamically with updated pool
        const fA = Array.from(activeRoom.players.values()).find(p => p.id === activeRoom!.currentRound!.fighterIds[0])!;
        const fB = Array.from(activeRoom.players.values()).find(p => p.id === activeRoom!.currentRound!.fighterIds[1])!;
        activeRoom.currentRound!.odds = calculateDynamicOdds(fA, fB, activeRoom.currentRound!.bets);

        broadcastRoomState();
        return;
      }

      // 6. FIGHTER_INPUT
      if (msg.type === 'FIGHTER_INPUT') {
        if (!activeRoom.currentRound || activeRoom.phase !== 'MINIGAME_ACTIVE') return;
        const { action, value, timestamp } = msg.payload || {};
        const [f1, f2] = activeRoom.currentRound.fighterIds;

        if (player.id !== f1 && player.id !== f2) {
          return; // Spectators cannot send fighter inputs
        }

        // Record fighter score/input
        activeRoom.currentRound.fighterScores[player.id] = typeof value === 'number' ? value : 1;

        // Mini-game specific resolution checks
        const gameId = activeRoom.currentRound.miniGame.id;

        if (gameId === 'millisecond_stop') {
          // If both have stopped, resolve immediately
          const s1 = activeRoom.currentRound.fighterScores[f1];
          const s2 = activeRoom.currentRound.fighterScores[f2];
          if (s1 && s2) {
            resolveCurrentGame();
          }
        } else if (gameId === 'quick_draw') {
          if (action === 'DRAW') {
            resolveCurrentGame();
          }
        } else if (gameId === 'speed_math' || gameId === 'higher_lower') {
          if (typeof value === 'number' && value >= 3) {
            resolveCurrentGame();
          }
        } else if (gameId === 'rapid_red_green') {
          if (typeof value === 'number' && value >= 40) {
            resolveCurrentGame();
          }
        }

        broadcastRoomState();
        return;
      }

      // 6b. REPORT_MINIGAME_RESULT (Host-only authoritative resolution)
      if (msg.type === 'REPORT_MINIGAME_RESULT') {
        if (!player.isHost) return;
        if (!activeRoom.currentRound || activeRoom.phase !== 'MINIGAME_ACTIVE') return;
        const { winnerId, scores } = msg.payload || {};
        resolveCurrentGame(winnerId, scores);
        return;
      }

      // 7. NEXT_ROUND (Host only)
      if (msg.type === 'NEXT_ROUND') {
        if (!player.isHost) return;
        if (!activeRoom.currentRound) return;

        if (activeRoom.currentRound.roundNumber >= activeRoom.totalRounds) {
          // Final podium!
          activeRoom.phase = 'FINAL_PODIUM';
          activeRoom.awards = computeSessionAwards(Array.from(activeRoom.players.values()));
          broadcastRoomState();
        } else {
          startRound(activeRoom.currentRound.roundNumber + 1);
        }
        return;
      }

      // 8. RESTART_GAME (Host only)
      if (msg.type === 'RESTART_GAME') {
        if (!player.isHost) return;
        // Reset players to initial 1000 coins and clean session stats
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
        activeRoom.roundHistory = [];
        activeRoom.awards = [];
        broadcastRoomState();
        return;
      }

      // 9. DEBUG_ADD_BOT (Developer testing only when ?debug=1)
      if (msg.type === 'DEBUG_ADD_BOT' as any) {
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
      console.error('WebSocket message parsing error:', err);
    }
  });

  ws.on('close', () => {
    if (boundSessionToken && activeRoom && activeRoom.players.has(boundSessionToken)) {
      const p = activeRoom.players.get(boundSessionToken)!;
      p.connected = false;
      activeRoom.clientSockets.delete(boundSessionToken);
      broadcastRoomState();
    }
  });
});

function startRound(roundNum: number) {
  if (!activeRoom) return;

  const playerList = Array.from(activeRoom.players.values());
  const round = initAuthoritativeRound(roundNum, activeRoom.totalRounds, playerList, activeRoom.lastPairing);
  activeRoom.currentRound = round;
  activeRoom.lastPairing = round.fighterIds;
  activeRoom.phase = 'FIGHTER_REVEAL';
  broadcastRoomState();

  // 4s reveal countdown, then automatically open betting window
  setTimeout(() => {
    if (!activeRoom || activeRoom.currentRound?.roundNumber !== roundNum) return;
    openBettingWindow();
  }, 4500);
}

function openBettingWindow() {
  if (!activeRoom || !activeRoom.currentRound) return;

  activeRoom.phase = 'BETTING_WINDOW';
  activeRoom.currentRound.bettingTimeRemaining = 15;
  broadcastRoomState();

  if (activeRoom.bettingTimer) clearInterval(activeRoom.bettingTimer);

  // If there are bot spectators, simulate their bets during the 15s window
  const botSpectators = Array.from(activeRoom.players.values()).filter(
    p => p.isBot && !activeRoom!.currentRound!.fighterIds.includes(p.id)
  );

  botSpectators.forEach((bot, idx) => {
    const delayMs = 1500 + idx * 1200 + Math.random() * 1500;
    setTimeout(() => {
      if (!activeRoom || !activeRoom.currentRound || activeRoom.phase !== 'BETTING_WINDOW') return;
      if (activeRoom.currentRound.bets.some(b => b.bettorId === bot.id)) return;

      const [fAId, fBId] = activeRoom.currentRound.fighterIds;
      const targetFighterId = Math.random() < 0.5 ? fAId : fBId;
      const betAmt = Math.min(bot.coins, [50, 100, 150][Math.floor(Math.random() * 3)]);
      if (betAmt <= 0) return;

      bot.coins -= betAmt;
      bot.totalBetsPlaced += 1;
      bot.highestSingleBet = Math.max(bot.highestSingleBet, betAmt);

      const currentOdds = activeRoom.currentRound.odds[targetFighterId]?.decimalOdds || 2.0;
      activeRoom.currentRound.bets.push({
        bettorId: bot.id,
        fighterId: targetFighterId,
        amount: betAmt,
        oddsAtBet: currentOdds,
        timestamp: Date.now(),
        potentialReturn: Math.floor(betAmt * currentOdds),
      });

      // Recalculate dynamic odds
      const fA = Array.from(activeRoom.players.values()).find(p => p.id === fAId)!;
      const fB = Array.from(activeRoom.players.values()).find(p => p.id === fBId)!;
      activeRoom.currentRound.odds = calculateDynamicOdds(fA, fB, activeRoom.currentRound.bets);

      broadcastRoomState();
    }, delayMs);
  });

  activeRoom.bettingTimer = setInterval(() => {
    if (!activeRoom || !activeRoom.currentRound) return;
    activeRoom.currentRound.bettingTimeRemaining -= 1;

    if (activeRoom.currentRound.bettingTimeRemaining <= 0) {
      clearInterval(activeRoom.bettingTimer);
      startMiniGameCountdown();
    } else {
      broadcastRoomState();
    }
  }, 1000);
}

function startMiniGameCountdown() {
  if (!activeRoom || !activeRoom.currentRound) return;

  activeRoom.phase = 'MINIGAME_COUNTDOWN';
  broadcastRoomState();

  setTimeout(() => {
    if (!activeRoom || !activeRoom.currentRound) return;
    activeRoom.phase = 'MINIGAME_ACTIVE';
    broadcastRoomState();

    const round = activeRoom.currentRound;
    const [f1, f2] = round.fighterIds;
    const p1 = Array.from(activeRoom.players.values()).find(p => p.id === f1);
    const p2 = Array.from(activeRoom.players.values()).find(p => p.id === f2);

    // If any fighter is a bot, simulate their performance
    [p1, p2].forEach(p => {
      if (!p || !p.isBot) return;
      const gameId = round.miniGame.id;
      if (gameId === 'millisecond_stop') {
        const botStop = 5.0 + (Math.random() - 0.48) * 0.35;
        setTimeout(() => {
          if (!activeRoom || !activeRoom.currentRound || activeRoom.phase !== 'MINIGAME_ACTIVE') return;
          round.fighterScores[p.id] = botStop;
          const s1 = round.fighterScores[f1];
          const s2 = round.fighterScores[f2];
          if (s1 !== undefined && s2 !== undefined && s1 > 0 && s2 > 0) {
            resolveCurrentGame();
          } else {
            broadcastRoomState();
          }
        }, botStop * 1000);
      } else if (gameId === 'quick_draw') {
        const delay = (round.gameConfig?.drawDelayMs as number) || 2500;
        const botReaction = 280 + Math.floor(Math.random() * 150);
        setTimeout(() => {
          if (!activeRoom || !activeRoom.currentRound || activeRoom.phase !== 'MINIGAME_ACTIVE') return;
          round.fighterScores[p.id] = botReaction;
          const s1 = round.fighterScores[f1];
          const s2 = round.fighterScores[f2];
          if (s1 !== undefined && s2 !== undefined && s1 > 0 && s2 > 0) {
            resolveCurrentGame();
          } else {
            broadcastRoomState();
          }
        }, delay + botReaction);
      } else if (gameId === 'speed_math' || gameId === 'higher_lower') {
        setTimeout(() => {
          if (!activeRoom || !activeRoom.currentRound || activeRoom.phase !== 'MINIGAME_ACTIVE') return;
          round.fighterScores[p.id] = 3;
          resolveCurrentGame();
        }, 7500);
      } else if (gameId === 'rapid_red_green') {
        setTimeout(() => {
          if (!activeRoom || !activeRoom.currentRound || activeRoom.phase !== 'MINIGAME_ACTIVE') return;
          round.fighterScores[p.id] = 40;
          resolveCurrentGame();
        }, 11000);
      } else if (gameId === 'blind_pinpoint') {
        setTimeout(() => {
          if (!activeRoom || !activeRoom.currentRound || activeRoom.phase !== 'MINIGAME_ACTIVE') return;
          round.fighterScores[p.id] = 450 + Math.floor(Math.random() * 800);
          const s1 = round.fighterScores[f1];
          const s2 = round.fighterScores[f2];
          if (s1 !== undefined && s2 !== undefined && s1 > 0 && s2 > 0) {
            resolveCurrentGame();
          } else {
            broadcastRoomState();
          }
        }, 3500);
      }
    });

    // Set game timeout fallback
    const duration = round.miniGame.durationSeconds;
    if (activeRoom.gameTimer) clearTimeout(activeRoom.gameTimer);
    activeRoom.gameTimer = setTimeout(() => {
      resolveCurrentGame();
    }, duration * 1000 + 1000);
  }, 3500);
}

function resolveCurrentGame(forcedWinnerId?: string | null, customScores?: Record<string, number>) {
  if (!activeRoom || !activeRoom.currentRound || activeRoom.phase !== 'MINIGAME_ACTIVE') return;

  if (activeRoom.gameTimer) clearTimeout(activeRoom.gameTimer);

  const round = activeRoom.currentRound;
  if (customScores) {
    round.fighterScores = { ...round.fighterScores, ...customScores };
  }
  const [f1, f2] = round.fighterIds;
  const s1 = round.fighterScores[f1] || 0;
  const s2 = round.fighterScores[f2] || 0;

  let winnerId: string | null = null;
  let isTie = false;

  if (forcedWinnerId !== undefined) {
    winnerId = forcedWinnerId;
    isTie = winnerId === null;
  } else {
    const gameId = round.miniGame.id;
    if (gameId === 'millisecond_stop') {
      // Closest to 5.000s wins (smallest delta)
      const d1 = Math.abs(s1 - 5.0);
      const d2 = Math.abs(s2 - 5.0);
      if (Math.abs(d1 - d2) < 0.001) {
        isTie = true;
      } else {
        winnerId = d1 < d2 ? f1 : f2;
      }
    } else if (gameId === 'blind_pinpoint') {
      // Smallest km error wins
      if (s1 === s2) {
        isTie = true;
      } else {
        winnerId = s1 < s2 ? f1 : f2;
      }
    } else {
      // Higher score wins (red_green, speed_math, higher_lower, quick_draw)
      if (s1 === s2) {
        isTie = true;
      } else {
        winnerId = s1 > s2 ? f1 : f2;
      }
    }
  }

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
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  server.listen(PORT, HOST, () => {
    const localIp = getLocalIpAddress();
    console.log(`[BET & BRAWL] Server running at http://${localIp}:${PORT} (bound to ${HOST}:${PORT})`);
  });
}

startServer();
