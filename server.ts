/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Authoritative Local Wi-Fi Express + WebSocket Server
 */

import express from 'express';
import { createServer, Server as HttpServer } from 'http';
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
  PublicRoomState,
  TournamentSchedule,
  TournamentMatch,
  RoundResolutionReason,
  TournamentStage,
} from './src/engine/types.ts';
import { toPublicPlayer } from './src/engine/types.ts';
import {
  generateRoomCode,
  createFreshPlayer,
  initAuthoritativeRound,
  computeSessionAwards,
  generateTournamentSchedule,
  computeTournamentRankings,
  applyQualifierMatchResolution,
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

export interface ServerTimingConfig {
  revealDurationMs: number;
  bettingDurationSeconds: number;
  countdownDurationMs: number;
  fighterGraceMs: number;
  hostGraceMs: number;
  staleSeatGraceMs: number;
  gameDurationMs?: number;
}

export const DEFAULT_TIMING: ServerTimingConfig = {
  revealDurationMs: 4500,
  bettingDurationSeconds: 15,
  countdownDurationMs: 3500,
  fighterGraceMs: 5000,
  hostGraceMs: 60000,
  staleSeatGraceMs: 60000,
};

// -------------------------------------------------------------
// TIMER TRACKING INTERFACES
// -------------------------------------------------------------

export interface RoundTimers {
  phaseTimer?: ReturnType<typeof setTimeout>;
  bettingInterval?: ReturnType<typeof setInterval>;
  botBetTimers: Array<ReturnType<typeof setTimeout>>;
  gameTimeoutTimer?: ReturnType<typeof setTimeout>;
  botGameTimers: Array<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>>;
}

export interface ConnectionTimers {
  fighterGraceTimers: Map<string, ReturnType<typeof setTimeout>>;
  hostGraceTimer?: ReturnType<typeof setTimeout>;
  staleSeatTimers: Map<string, ReturnType<typeof setTimeout>>; // sessionToken -> timer
}

export interface ServerRoom {
  roomId: string;
  roomCode: string;
  hostToken: string;
  phase: GamePhase;
  debugMode: boolean;
  players: Map<string, Player>; // sessionToken -> Player
  clientSockets: Map<string, WebSocket>; // sessionToken -> ws
  totalRounds: number;
  currentRound: RoundState | null;
  internalGameState: InternalGameState | null;
  tournamentSchedule: TournamentSchedule | null;
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
  lastPairing?: [string, string];
  roundTimers: RoundTimers;
  connectionTimers: ConnectionTimers;
}

export interface CreateServerOptions {
  port?: number;
  host?: string;
  isTest?: boolean;
  timingConfig?: Partial<ServerTimingConfig>;
}

export function clearRoundTimers(timers: RoundTimers) {
  if (timers.phaseTimer) clearTimeout(timers.phaseTimer);
  timers.phaseTimer = undefined;

  if (timers.bettingInterval) clearInterval(timers.bettingInterval);
  timers.bettingInterval = undefined;

  timers.botBetTimers.forEach(clearTimeout);
  timers.botBetTimers = [];

  if (timers.gameTimeoutTimer) clearTimeout(timers.gameTimeoutTimer);
  timers.gameTimeoutTimer = undefined;

  timers.botGameTimers.forEach(t => {
    clearTimeout(t as any);
    clearInterval(t as any);
  });
  timers.botGameTimers = [];
}

export function clearConnectionTimers(timers: ConnectionTimers) {
  timers.fighterGraceTimers.forEach(clearTimeout);
  timers.fighterGraceTimers.clear();

  if (timers.hostGraceTimer) clearTimeout(timers.hostGraceTimer);
  timers.hostGraceTimer = undefined;

  timers.staleSeatTimers.forEach(clearTimeout);
  timers.staleSeatTimers.clear();
}

export function clearAllRoomTimers(room: ServerRoom) {
  clearRoundTimers(room.roundTimers);
  clearConnectionTimers(room.connectionTimers);
}

/**
 * Factory creating the production Brawl server.
 * Used by both production runtime (npm start) and production integration tests.
 */
export function createBrawlServer(options: CreateServerOptions = {}) {
  const timing: ServerTimingConfig = { ...DEFAULT_TIMING, ...options.timingConfig };
  const PORT = options.port ?? parseInt(process.env.PORT || '3000', 10);
  const HOST = options.host ?? (process.env.HOST || '0.0.0.0');

  const app = express();
  app.use(express.json());

  const httpServer: HttpServer = createServer(app);
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    maxPayload: 65536, // 64 KB max payload to prevent memory exhaustion
  });

  let activeRoom: ServerRoom | null = null;

  function createEmptyRoundTimers(): RoundTimers {
    return {
      botBetTimers: [],
      botGameTimers: [],
    };
  }

  function createEmptyConnectionTimers(): ConnectionTimers {
    return {
      fighterGraceTimers: new Map(),
      staleSeatTimers: new Map(),
    };
  }

  /**
   * Broadcasts public room state to all connected clients.
   * NEVER leaks private session tokens or individual secret bets before PAYOUT_RECAP.
   */
  function broadcastRoomState() {
    if (!activeRoom) return;

    const publicPlayers: PublicPlayer[] = Array.from(activeRoom.players.values()).map(toPublicPlayer);

    let publicRound: RoundState | null = null;
    if (activeRoom.currentRound) {
      const round = activeRoom.currentRound;

      // Keep individual bettor details secret until PAYOUT_RECAP
      let scrubbedBets: SecretBet[] = [];
      if (activeRoom.phase === 'PAYOUT_RECAP' || activeRoom.phase === 'FINAL_PODIUM') {
        scrubbedBets = round.bets;
      } else {
        scrubbedBets = [];
      }

      publicRound = {
        ...round,
        bets: scrubbedBets,
      };
    }

    for (const [token, client] of activeRoom.clientSockets.entries()) {
      if (client.readyState !== WebSocket.OPEN) continue;
      const player = activeRoom.players.get(token);

      let tailoredRound = publicRound;
      // Per-client answer security: in higher_lower during MINIGAME_ACTIVE,
      // never reveal answers/challengerStats of other fighters for questions this player hasn't yet submitted!
      if (publicRound && publicRound.miniGame.id === 'higher_lower' && publicRound.gameState && activeRoom.phase === 'MINIGAME_ACTIVE') {
        const playerId = player?.id || '';
        const origGameState = publicRound.gameState;
        const origReveals = (origGameState.reveals as Record<string, Record<number, any>>) || {};
        const stepIndices = (origGameState.stepIndex as Record<string, number>) || {};
        const myStep = stepIndices[playerId] || 0;

        const sanitizedReveals: Record<string, Record<number, any>> = {};
        for (const [fId, fReveals] of Object.entries(origReveals)) {
          if (fId === playerId) {
            sanitizedReveals[fId] = fReveals;
          } else {
            const filtered: Record<number, any> = {};
            for (const [qIdxStr, val] of Object.entries(fReveals)) {
              const qIdx = Number(qIdxStr);
              if (qIdx < myStep) {
                filtered[qIdx] = val;
              }
            }
            sanitizedReveals[fId] = filtered;
          }
        }

        tailoredRound = {
          ...publicRound,
          gameState: {
            ...origGameState,
            reveals: sanitizedReveals,
          },
        };
      }

      const payload: PublicRoomState = {
        roomId: activeRoom.roomId,
        roomCode: activeRoom.roomCode,
        phase: activeRoom.phase,
        players: publicPlayers,
        totalRounds: activeRoom.totalRounds,
        currentRound: tailoredRound,
        tournamentSchedule: activeRoom.tournamentSchedule,
        roundHistory: activeRoom.roundHistory,
        awards: activeRoom.awards,
        debugMode: activeRoom.debugMode,
      };

      const message: ServerMessage = {
        type: 'ROOM_STATE',
        timestamp: Date.now(),
        payload,
      };

      client.send(JSON.stringify(message));
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
  // ROUND LIFECYCLE MANAGEMENT
  // -------------------------------------------------------------

  function startRound(roundNum: number) {
    if (!activeRoom) return;

    clearRoundTimers(activeRoom.roundTimers);

    const playerList = Array.from(activeRoom.players.values());
    let explicitFighters: [string, string] | undefined = undefined;
    let isChampionship = false;
    let stage: TournamentStage = 'QUALIFIERS';
    let qualifierIndex: number | undefined = undefined;
    let qualifierTotal: number | undefined = undefined;
    let championshipGameNumber: number | undefined = undefined;

    const sched = activeRoom.tournamentSchedule;
    if (sched) {
      if (sched.qualifiersCompleted < sched.qualifierCount) {
        // Qualifier match from pre-computed schedule
        const match = sched.matches[sched.qualifiersCompleted];
        explicitFighters = match.fighterIds;
        isChampionship = false;
        stage = 'QUALIFIERS';
        qualifierIndex = sched.qualifiersCompleted + 1;
        qualifierTotal = sched.qualifierCount;
      } else {
        // Championship Series (First to 2 Decisive Wins)
        isChampionship = true;
        stage = 'CHAMPIONSHIP';
        sched.stage = 'CHAMPIONSHIP';

        // Select and lock top-two finalists if not already locked
        if (!sched.finalists || sched.finalists.length !== 2) {
          const completedQualifiers = sched.matches.filter(m => !m.isChampionship && m.completed);
          const ranked = computeTournamentRankings(playerList, completedQualifiers, sched.stableRosterOrder);
          const finalists: [string, string] = [ranked[0].id, ranked[1].id];
          sched.finalists = finalists;
          sched.championshipWins = { [finalists[0]]: 0, [finalists[1]]: 0 };
          sched.championshipGamesPlayed = 0;
          sched.thirdPlaceId = ranked[2]?.id || null;
        }

        explicitFighters = sched.finalists;
        championshipGameNumber = sched.championshipGamesPlayed + 1;
      }
    }

    const lastMiniGameId = activeRoom.currentRound?.miniGame.id;

    const { round, internalGame } = initAuthoritativeRound(
      roundNum,
      activeRoom.totalRounds,
      playerList,
      activeRoom.lastPairing,
      explicitFighters,
      isChampionship,
      stage,
      qualifierIndex,
      qualifierTotal,
      championshipGameNumber,
      lastMiniGameId
    );

    const now = Date.now();
    round.revealEndsAt = now + timing.revealDurationMs;
    round.bettingEndsAt = round.revealEndsAt + timing.bettingDurationSeconds * 1000;
    round.gameStartsAt = round.bettingEndsAt + timing.countdownDurationMs;
    round.gameEndsAt = round.gameStartsAt + round.miniGame.durationSeconds * 1000;

    activeRoom.currentRound = round;
    activeRoom.internalGameState = internalGame;
    activeRoom.lastPairing = round.fighterIds;
    activeRoom.phase = 'FIGHTER_REVEAL';
    broadcastRoomState();

    const currentRoomId = activeRoom.roomId;
    const currentRoundNum = roundNum;

    // Timed reveal countdown -> automatically transition to betting window
    activeRoom.roundTimers.phaseTimer = setTimeout(() => {
      if (!activeRoom || activeRoom.roomId !== currentRoomId || activeRoom.currentRound?.roundNumber !== currentRoundNum) {
        return;
      }
      openBettingWindow();
    }, timing.revealDurationMs);
  }

  function openBettingWindow() {
    if (!activeRoom || !activeRoom.currentRound) return;
    const room = activeRoom;
    const currentRound = room.currentRound;
    if (!currentRound) return;

    const currentRoomId = room.roomId;
    const currentRoundNum = currentRound.roundNumber;

    room.phase = 'BETTING_WINDOW';
    currentRound.bettingTimeRemaining = timing.bettingDurationSeconds;
    currentRound.bettingEndsAt = Date.now() + timing.bettingDurationSeconds * 1000;
    broadcastRoomState();

    // If there are server debug bot spectators, schedule realistic wagers
    const botSpectators = Array.from(room.players.values()).filter(
      p => p.isBot && !room.currentRound!.fighterIds.includes(p.id)
    );

    botSpectators.forEach((bot, idx) => {
      const delayMs = Math.min(
        timing.bettingDurationSeconds * 1000 - 500,
        1500 + idx * 1200 + Math.random() * 1500
      );
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
      room.roundTimers.botBetTimers.push(t);
    });

    const intervalStepMs = timing.bettingDurationSeconds <= 3 ? 200 : 1000;
    room.roundTimers.bettingInterval = setInterval(() => {
      if (!activeRoom || activeRoom.roomId !== currentRoomId || !activeRoom.currentRound) return;
      
      const now = Date.now();
      const remainingSeconds = Math.max(0, Math.ceil((activeRoom.currentRound.bettingEndsAt! - now) / 1000));
      activeRoom.currentRound.bettingTimeRemaining = remainingSeconds;

      if (remainingSeconds <= 0 || now >= activeRoom.currentRound.bettingEndsAt!) {
        clearInterval(room.roundTimers.bettingInterval);
        startMiniGameCountdown();
      } else {
        broadcastRoomState();
      }
    }, intervalStepMs);
  }

  function startMiniGameCountdown() {
    if (!activeRoom || !activeRoom.currentRound) return;

    const currentRoomId = activeRoom.roomId;
    const currentRoundNum = activeRoom.currentRound.roundNumber;

    activeRoom.phase = 'MINIGAME_COUNTDOWN';
    activeRoom.currentRound.gameStartsAt = Date.now() + timing.countdownDurationMs;
    activeRoom.currentRound.gameEndsAt = activeRoom.currentRound.gameStartsAt + activeRoom.currentRound.miniGame.durationSeconds * 1000;
    broadcastRoomState();

    activeRoom.roundTimers.phaseTimer = setTimeout(() => {
      if (!activeRoom || activeRoom.roomId !== currentRoomId || activeRoom.currentRound?.roundNumber !== currentRoundNum) {
        return;
      }
      launchActiveMiniGame();
    }, timing.countdownDurationMs);
  }

  function launchActiveMiniGame() {
    if (!activeRoom || !activeRoom.currentRound || !activeRoom.internalGameState) return;
    const room = activeRoom;
    const round = room.currentRound;
    const internal = room.internalGameState;
    if (!round || !internal) return;

    const currentRoomId = room.roomId;

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
        room.roundTimers.botGameTimers.push(t);
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
        room.roundTimers.botGameTimers.push(interval);
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
        room.roundTimers.botGameTimers.push(stepInterval);
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
        room.roundTimers.botGameTimers.push(stepInterval);
      } else if (round.miniGame.id === 'blind_pinpoint') {
        const t = setTimeout(() => {
          if (!activeRoom || activeRoom.roomId !== currentRoomId || activeRoom.phase !== 'MINIGAME_ACTIVE') return;
          const target = internal.blindPinpoint!.targetCity;
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
        room.roundTimers.botGameTimers.push(t);
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
        room.roundTimers.botGameTimers.push(t);
      }
    });

    // Authoritative game duration timeout (no +1000ms gameplay extension!)
    const durationMs = timing.gameDurationMs ?? (round.miniGame.durationSeconds * 1000);
    room.roundTimers.gameTimeoutTimer = setTimeout(() => {
      if (!activeRoom || activeRoom.roomId !== currentRoomId || activeRoom.phase !== 'MINIGAME_ACTIVE') return;
      const timeoutResult = resolveGameTimeout(internal, round.fighterScores);
      if (timeoutResult.gameStatePatch) {
        round.gameState = { ...round.gameState, ...timeoutResult.gameStatePatch };
      }
      resolveCurrentGame(timeoutResult.winnerId, timeoutResult.isTie);
    }, durationMs);
  }

  function resolveCurrentGame(
    winnerId: string | null,
    isTie: boolean,
    resolutionReason: RoundResolutionReason = isTie ? 'TIE' : (winnerId ? 'PLAYED' : 'VOID')
  ) {
    const activeBrawlPhases: GamePhase[] = ['FIGHTER_REVEAL', 'BETTING_WINDOW', 'MINIGAME_COUNTDOWN', 'MINIGAME_ACTIVE'];
    if (!activeRoom || !activeRoom.currentRound || !activeBrawlPhases.includes(activeRoom.phase)) return;

    // CRITICAL: Clear round timers and active fighter grace timers so this round cannot double-resolve!
    clearRoundTimers(activeRoom.roundTimers);
    activeRoom.connectionTimers.fighterGraceTimers.forEach(clearTimeout);
    activeRoom.connectionTimers.fighterGraceTimers.clear();

    const round = activeRoom.currentRound;
    round.winnerId = winnerId;
    round.tieResult = isTie;
    round.resolutionReason = resolutionReason;

    const playerList = Array.from(activeRoom.players.values());
    const { payouts, updatedPlayers } = computeRoundPayouts(
      winnerId,
      isTie,
      round.fighterIds,
      round.matchPot,
      round.bets,
      playerList,
      resolutionReason
    );

    round.payouts = payouts;
    for (const p of updatedPlayers) {
      activeRoom.players.set(p.sessionToken, p);
    }

    // Update Tournament Schedule and Brawl Points
    if (activeRoom.tournamentSchedule) {
      const sched = activeRoom.tournamentSchedule;
      const [f1Id, f2Id] = round.fighterIds;
      const f1 = Array.from(activeRoom.players.values()).find(p => p.id === f1Id);
      const f2 = Array.from(activeRoom.players.values()).find(p => p.id === f2Id);

      if (!round.isChampionship) {
        // QUALIFIER BRAWL:
        applyQualifierMatchResolution(
          sched,
          Array.from(activeRoom.players.values()),
          round.fighterIds,
          winnerId,
          isTie,
          resolutionReason
        );
      } else {
        // CHAMPIONSHIP SERIES (First to 2 Decisive Wins):
        sched.championshipGamesPlayed += 1;

        const champMatch: TournamentMatch = {
          matchIndex: sched.matches.length,
          roundNumber: round.roundNumber,
          fighterIds: round.fighterIds,
          isChampionship: true,
          championshipGameNumber: round.championshipGameNumber,
          completed: true,
          winnerId,
          tieResult: isTie,
          resolutionReason,
        };
        sched.matches.push(champMatch);

        // Ties or VOID games do NOT award series wins and tournament NEVER crowns champion from tied game
        if (!isTie && resolutionReason !== 'VOID' && winnerId) {
          sched.championshipWins[winnerId] = (sched.championshipWins[winnerId] || 0) + 1;

          // Check if finalist reached 2 decisive wins!
          if (sched.championshipWins[winnerId] >= 2) {
            sched.championId = winnerId;
            const loserId = round.fighterIds[0] === winnerId ? round.fighterIds[1] : round.fighterIds[0];
            sched.runnerUpId = loserId;
            sched.stage = 'COMPLETE';
          }
        }
      }
    }

    const winningPlayer = updatedPlayers.find(p => p.id === winnerId);
    activeRoom.roundHistory.push({
      roundNumber: round.roundNumber,
      miniGameName: round.miniGame.name,
      winnerName: isTie ? 'TIE' : (resolutionReason === 'DISCONNECT_FORFEIT' ? `${winningPlayer?.name || 'Winner'} (Forfeit)` : winningPlayer?.name || 'Unknown'),
      totalPotWon: round.matchPot,
      isChampionship: !!round.isChampionship,
      championshipGameNumber: round.championshipGameNumber,
      resolutionReason,
    });

    activeRoom.phase = 'PAYOUT_RECAP';
    broadcastRoomState();
  }

  // -------------------------------------------------------------
  // WEBSOCKET AUTHORITATIVE PROTOCOL HANDLERS
  // -------------------------------------------------------------

  wss.on('connection', (ws: WebSocket) => {
    let boundSessionToken: string | null = null;

    ws.on('message', (raw: string) => {
      try {
        if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) return;
        const rawStr = raw.toString();
        if (rawStr.length > 65536) return;

        const msg: ClientMessage = JSON.parse(rawStr);
        if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;

        // Ping-pong for synchronized server time
        if (msg.type === 'PING') {
          const clientSentAt = (msg as any).payload?.clientSentAt;
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
          const payload = (msg as any).payload || {};
          const { playerName, avatar, debugMode } = payload;

          // Room safety: An active room cannot be replaced by an unauthenticated client in ANY phase (including FINAL_PODIUM!)
          if (activeRoom && activeRoom.players.size > 0) {
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

          if (activeRoom) {
            clearAllRoomTimers(activeRoom);
          }

          const roomCode = generateRoomCode();
          const roomId = `room_${Date.now()}`;
          const hostPlayer = createFreshPlayer(playerName || 'Host', avatar || '⚡', true);

          activeRoom = {
            roomId,
            roomCode,
            hostToken: hostPlayer.sessionToken,
            phase: 'LOBBY',
            debugMode: !!debugMode,
            players: new Map([[hostPlayer.sessionToken, hostPlayer]]),
            clientSockets: new Map([[hostPlayer.sessionToken, ws]]),
            totalRounds: 4,
            currentRound: null,
            internalGameState: null,
            tournamentSchedule: null,
            roundHistory: [],
            awards: [],
            roundTimers: createEmptyRoundTimers(),
            connectionTimers: createEmptyConnectionTimers(),
          };

          boundSessionToken = hostPlayer.sessionToken;

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
          const { roomCode, playerName, avatar, sessionToken } = (msg as any).payload || {};

          if (!activeRoom) {
            ws.send(JSON.stringify({
              type: 'JOIN_ERROR',
              timestamp: Date.now(),
              payload: { code: 'ROOM_NOT_FOUND', message: 'No active room hosted on this server.' },
            }));
            return;
          }

          if (!roomCode || typeof roomCode !== 'string' || activeRoom.roomCode.toUpperCase() !== roomCode.trim().toUpperCase()) {
            ws.send(JSON.stringify({
              type: 'JOIN_ERROR',
              timestamp: Date.now(),
              payload: { code: 'INVALID_CODE', message: `Invalid room code: ${roomCode}` },
            }));
            return;
          }

          // RECONNECT: check if reconnecting with an existing valid sessionToken
          if (sessionToken && typeof sessionToken === 'string' && activeRoom.players.has(sessionToken)) {
            const existing = activeRoom.players.get(sessionToken)!;
            const oldSocket = activeRoom.clientSockets.get(sessionToken);

            // Bind new socket FIRST
            activeRoom.clientSockets.set(sessionToken, ws);
            boundSessionToken = sessionToken;
            existing.connected = true;

            // Safely close old socket if different
            if (oldSocket && oldSocket !== ws && oldSocket.readyState === WebSocket.OPEN) {
              try {
                oldSocket.close(1000, 'Replaced by new connection');
              } catch {
                // ignore
              }
            }

            // Clear any connection grace timers for this player
            if (activeRoom.connectionTimers.fighterGraceTimers.has(existing.id)) {
              clearTimeout(activeRoom.connectionTimers.fighterGraceTimers.get(existing.id));
              activeRoom.connectionTimers.fighterGraceTimers.delete(existing.id);
            }
            if (existing.isHost && activeRoom.connectionTimers.hostGraceTimer) {
              clearTimeout(activeRoom.connectionTimers.hostGraceTimer);
              activeRoom.connectionTimers.hostGraceTimer = undefined;
            }
            if (activeRoom.connectionTimers.staleSeatTimers.has(sessionToken)) {
              clearTimeout(activeRoom.connectionTimers.staleSeatTimers.get(sessionToken));
              activeRoom.connectionTimers.staleSeatTimers.delete(sessionToken);
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

        // 4. START_GAME (Host-only, LOBBY-only)
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

          // Use authoritative room debugMode property — do NOT allow arbitrary payload bypass!
          if (connectedPlayers.length < MIN_PLAYERS_TO_START && !activeRoom.debugMode) {
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
          if (!allReady && !activeRoom.debugMode) {
            ws.send(JSON.stringify({
              type: 'JOIN_ERROR',
              timestamp: Date.now(),
              payload: { code: 'NOT_ALL_READY', message: 'All connected players must be READY before starting.' },
            }));
            return;
          }

          // Authoritative Tournament Schedule Generation:
          // Freeze session roster, shuffle once, generate N circular qualifiers + Championship Series (First to 2 Decisive Wins)
          let schedule: TournamentSchedule;
          if (connectedPlayers.length < 3 && activeRoom.debugMode) {
            const pA = connectedPlayers[0];
            const pB = connectedPlayers[1] || connectedPlayers[0];
            schedule = {
              stage: 'QUALIFIERS',
              totalPlayers: connectedPlayers.length,
              qualifierCount: 1,
              qualifiersCompleted: 0,
              totalRounds: 3,
              matches: [
                {
                  matchIndex: 0,
                  roundNumber: 1,
                  fighterIds: [pA.id, pB.id],
                  isChampionship: false,
                  completed: false,
                  winnerId: null,
                },
              ],
              championshipWins: {},
              championshipGamesPlayed: 0,
              championId: null,
              runnerUpId: null,
              thirdPlaceId: null,
              stableRosterOrder: [pA.id, pB.id],
            };
          } else {
            schedule = generateTournamentSchedule(connectedPlayers);
          }
          activeRoom.tournamentSchedule = schedule;
          activeRoom.totalRounds = schedule.totalRounds;

          // Reset all players' tournament stats for fresh tournament
          for (const p of activeRoom.players.values()) {
            p.qualifierPoints = 0;
            p.qualifierWins = 0;
            p.qualifierTies = 0;
            p.qualifierLosses = 0;
            p.qualifierMatchesPlayed = 0;
            p.tournamentRank = undefined;
          }

          // Initialize authoritative initial tournament rankings based on frozen roster seed
          computeTournamentRankings(Array.from(activeRoom.players.values()), [], schedule.stableRosterOrder);

          startRound(1);
          return;
        }

        // 6. PLACE_BET
        if (msg.type === 'PLACE_BET') {
          const { fighterId, amount } = (msg as any).payload || {};
          const nowMs = Date.now();
          const error = validateBetPlacement(
            player,
            fighterId,
            amount,
            activeRoom.currentRound,
            activeRoom.phase,
            nowMs
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

          const now = Date.now();
          // Authoritative game deadline: Reject any actions at or after gameEndsAt
          if (activeRoom.currentRound.gameEndsAt && now >= activeRoom.currentRound.gameEndsAt) {
            return;
          }

          const action: FighterAction = (msg as any).payload;
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

          if (result.actionFeedback) {
            ws.send(JSON.stringify({
              type: 'ACTION_RESULT',
              timestamp: Date.now(),
              payload: result.actionFeedback,
            }));
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

          const sched = activeRoom.tournamentSchedule;
          if (sched && sched.stage === 'COMPLETE') {
            activeRoom.phase = 'FINAL_PODIUM';
            const champId = sched.championId;
            activeRoom.awards = computeSessionAwards(Array.from(activeRoom.players.values()), champId);
            broadcastRoomState();
          } else {
            startRound(activeRoom.currentRound.roundNumber + 1);
          }
          return;
        }

        // 9. RESTART_GAME (Host only, FINAL_PODIUM only)
        if (msg.type === 'RESTART_GAME') {
          if (!player.isHost || activeRoom.phase !== 'FINAL_PODIUM') return;

          clearRoundTimers(activeRoom.roundTimers);

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
            p.qualifierPoints = 0;
            p.qualifierWins = 0;
            p.qualifierTies = 0;
            p.qualifierLosses = 0;
            p.qualifierMatchesPlayed = 0;
            p.tournamentRank = undefined;
            p.isReady = false;
          }
          activeRoom.phase = 'LOBBY';
          activeRoom.currentRound = null;
          activeRoom.internalGameState = null;
          activeRoom.tournamentSchedule = null;
          activeRoom.roundHistory = [];
          activeRoom.awards = [];
          broadcastRoomState();
          return;
        }

        // 10. CLOSE_ROOM (Host only)
        if (msg.type === 'CLOSE_ROOM') {
          if (!player.isHost) return;

          clearAllRoomTimers(activeRoom);
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

        // 11. DEBUG_ADD_BOT (Debug room only, host only, lobby only)
        if (msg.type === 'DEBUG_ADD_BOT') {
          if (!player.isHost || !activeRoom.debugMode || activeRoom.phase !== 'LOBBY') return;
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

        // 12. KICK_PLAYER (Host only, lobby only, cannot kick self)
        if (msg.type === 'KICK_PLAYER') {
          if (!player.isHost || activeRoom.phase !== 'LOBBY') return;
          const targetPlayerId = (msg as any).payload?.playerId;
          if (!targetPlayerId) return;

          const targetPlayer = Array.from(activeRoom.players.values()).find(p => p.id === targetPlayerId);
          if (targetPlayer && !targetPlayer.isHost) {
            const token = targetPlayer.sessionToken;
            const sock = activeRoom.clientSockets.get(token);
            if (sock && sock.readyState === WebSocket.OPEN) {
              sock.send(JSON.stringify({
                type: 'ROOM_CLOSED',
                timestamp: Date.now(),
                payload: { reason: 'You were removed from the room by the host.' },
              }));
              try { sock.close(); } catch { /* ignore */ }
            }
            activeRoom.clientSockets.delete(token);
            activeRoom.players.delete(token);
            if (activeRoom.connectionTimers.staleSeatTimers.has(token)) {
              clearTimeout(activeRoom.connectionTimers.staleSeatTimers.get(token));
              activeRoom.connectionTimers.staleSeatTimers.delete(token);
            }
            broadcastRoomState();
          }
          return;
        }
      } catch (err) {
        console.error('[BET & BRAWL] WebSocket error handling message:', err);
      }
    });

    ws.on('close', () => {
      if (!boundSessionToken || !activeRoom) return;

      // STALE SOCKET PROTECTION:
      // If this closing socket is NOT the currently registered socket for boundSessionToken, ignore it!
      // This happens when a player reconnects on a new socket and the old socket later finishes closing.
      if (activeRoom.clientSockets.get(boundSessionToken) !== ws) {
        return;
      }

      activeRoom.clientSockets.delete(boundSessionToken);
      const p = activeRoom.players.get(boundSessionToken);
      if (!p) return;

      p.connected = false;

      // 1. Lobby seat lifecycle: Disconnected seat reserved for reconnect window
      // After grace period expires, stale seat is deleted to free 9-player capacity!
      if (activeRoom.phase === 'LOBBY' && !p.isHost) {
        const tokenToCleanup = boundSessionToken;
        const staleTimer = setTimeout(() => {
          if (activeRoom && activeRoom.phase === 'LOBBY') {
            const currentP = activeRoom.players.get(tokenToCleanup);
            if (currentP && currentP.connected === false) {
              activeRoom.players.delete(tokenToCleanup);
              activeRoom.connectionTimers.staleSeatTimers.delete(tokenToCleanup);
              broadcastRoomState();
            }
          }
        }, timing.staleSeatGraceMs);
        activeRoom.connectionTimers.staleSeatTimers.set(boundSessionToken, staleTimer);
      }

      // 2. Active brawl fighter disconnect handling across entire active brawl lifecycle:
      // FIGHTER_REVEAL, BETTING_WINDOW, MINIGAME_COUNTDOWN, MINIGAME_ACTIVE
      const activeBrawlPhases: GamePhase[] = ['FIGHTER_REVEAL', 'BETTING_WINDOW', 'MINIGAME_COUNTDOWN', 'MINIGAME_ACTIVE'];
      if (activeBrawlPhases.includes(activeRoom.phase) && activeRoom.currentRound) {
        const [f1, f2] = activeRoom.currentRound.fighterIds;
        if (p.id === f1 || p.id === f2) {
          const otherFighterId = p.id === f1 ? f2 : f1;
          const token = boundSessionToken;
          const currentRoundNum = activeRoom.currentRound.roundNumber;

          // Clear any existing grace timer for this fighter
          if (activeRoom.connectionTimers.fighterGraceTimers.has(p.id)) {
            clearTimeout(activeRoom.connectionTimers.fighterGraceTimers.get(p.id));
          }

          const graceTimer = setTimeout(() => {
            if (!activeRoom || !activeRoom.currentRound || activeRoom.currentRound.roundNumber !== currentRoundNum) return;
            if (!activeBrawlPhases.includes(activeRoom.phase)) return;

            const stillDisconnected = activeRoom.players.get(token)?.connected === false;
            if (stillDisconnected) {
              const otherPlayer = Array.from(activeRoom.players.values()).find(pl => pl.id === otherFighterId);
              const isOtherConnected = otherPlayer && otherPlayer.connected;

              if (isOtherConnected) {
                // Connected opponent wins by disconnect forfeit; spectator bets are refunded
                resolveCurrentGame(otherFighterId, false, 'DISCONNECT_FORFEIT');
              } else {
                // Both fighters disconnected; VOID round, no fake winner, spectator bets refunded
                resolveCurrentGame(null, false, 'VOID');
              }
            }
          }, timing.fighterGraceMs);
          activeRoom.connectionTimers.fighterGraceTimers.set(p.id, graceTimer);
        }
      }

      // 3. Host disconnect handling: host grace period
      if (p.isHost) {
        if (activeRoom.connectionTimers.hostGraceTimer) {
          clearTimeout(activeRoom.connectionTimers.hostGraceTimer);
        }
        const hostToken = boundSessionToken;
        activeRoom.connectionTimers.hostGraceTimer = setTimeout(() => {
          if (activeRoom && activeRoom.players.get(hostToken)?.connected === false) {
            clearAllRoomTimers(activeRoom);
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
        }, timing.hostGraceMs);
      }

      broadcastRoomState();
    });
  });

  async function setupStaticAndVite() {
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
  }

  function listen(port = PORT, host = HOST): Promise<{ port: number; host: string; close: () => Promise<void> }> {
    return new Promise((resolve, reject) => {
      httpServer.listen(port, host, () => {
        const addr = httpServer.address();
        const actualPort = typeof addr === 'object' && addr ? addr.port : port;
        resolve({
          port: actualPort,
          host,
          close: () => close(),
        });
      });
      httpServer.once('error', reject);
    });
  }

  function close(): Promise<void> {
    return new Promise((resolve) => {
      if (activeRoom) {
        clearAllRoomTimers(activeRoom);
        activeRoom = null;
      }
      wss.close(() => {
        httpServer.close(() => resolve());
      });
    });
  }

  return {
    app,
    httpServer,
    wss,
    listen,
    close,
    setupStaticAndVite,
    getActiveRoom: () => activeRoom,
    resolveCurrentGame: (winnerId: string | null, isTie: boolean) => {
      resolveCurrentGame(winnerId, isTie);
    },
    resetActiveRoom: () => {
      if (activeRoom) {
        clearAllRoomTimers(activeRoom);
        activeRoom = null;
      }
    },
    timing,
  };
}

// -------------------------------------------------------------
// STANDALONE LAUNCHER
// -------------------------------------------------------------

async function startServer() {
  const PORT = parseInt(process.env.PORT || '3000', 10);
  const HOST = process.env.HOST || '0.0.0.0';

  const serverInstance = createBrawlServer({ port: PORT, host: HOST });
  await serverInstance.setupStaticAndVite();

  await serverInstance.listen(PORT, HOST);
  const { primaryIp } = discoverLanAddresses();

  console.log(`\n======================================================`);
  console.log(`BET & BRAWL production server ready`);
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`LAN:   http://${primaryIp}:${PORT}`);
  console.log(`Bound: ${HOST}:${PORT}`);
  console.log(`======================================================\n`);
}

// Run only when directly invoked
if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  startServer().catch(err => {
    console.error('Failed to start BET & BRAWL server:', err);
    process.exit(1);
  });
}
