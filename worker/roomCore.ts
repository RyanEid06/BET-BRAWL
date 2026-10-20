/**
 * BET & BRAWL Cloudflare Workers + Durable Objects backend.
 *
 * The original Node/Express/WebSocket implementation remains in /server.ts as the
 * local-LAN reference server. This Worker implements the same public WebSocket
 * protocol while allowing many independent online rooms, one Durable Object per
 * room code.
 */

import type {
  Award,
  ClientMessage,
  FighterAction,
  GamePhase,
  Player,
  PublicPlayer,
  PublicRoomState,
  RoundResolutionReason,
  RoundState,
  SecretBet,
  ServerMessage,
  TournamentMatch,
  TournamentSchedule,
  TournamentStage,
} from '../src/engine/types.ts';
import { toPublicPlayer } from '../src/engine/types.ts';
import {
  computeSessionAwards,
  computeTournamentRankings,
  createFreshPlayer,
  generateTournamentSchedule,
  initAuthoritativeRound,
  MAX_PLAYERS_CAPACITY,
  MIN_PLAYERS_TO_START,
  sanitizePlayerAvatar,
  sanitizePlayerName,
} from '../src/engine/roomEngine.ts';
import {
  calculateDynamicOdds,
  computeRoundPayouts,
  validateBetPlacement,
} from '../src/engine/odds.ts';
import {
  type InternalGameState,
  processFighterAction,
  resolveGameTimeout,
} from '../src/engine/gameEngine.ts';

export interface Env {
  BRAWL_ROOMS: DurableObjectNamespace;
  ASSETS: Fetcher;
  /** Test-only. Never configured in production. */
  BRAWL_TEST_FAST?: string;
}

interface TimingConfig {
  revealDurationMs: number;
  bettingDurationSeconds: number;
  countdownDurationMs: number;
  fighterGraceMs: number;
  hostGraceMs: number;
  staleSeatGraceMs: number;
  gameDurationMs?: number;
}

const DEFAULT_TIMING: TimingConfig = {
  revealDurationMs: 4500,
  bettingDurationSeconds: 15,
  countdownDurationMs: 3500,
  fighterGraceMs: 5000,
  hostGraceMs: 60000,
  staleSeatGraceMs: 60000,
};

const FAST_TEST_TIMING: TimingConfig = {
  revealDurationMs: 150,
  bettingDurationSeconds: 1,
  countdownDurationMs: 150,
  fighterGraceMs: 500,
  hostGraceMs: 800,
  staleSeatGraceMs: 500,
  gameDurationMs: 1200,
};

type ScheduledEventKind =
  | 'OPEN_BETTING'
  | 'BET_TICK'
  | 'START_MINIGAME'
  | 'GAME_TIMEOUT'
  | 'BOT_BET'
  | 'BOT_MILLISECOND_STOP'
  | 'BOT_RED_GREEN'
  | 'BOT_SPEED_MATH'
  | 'BOT_HIGHER_LOWER'
  | 'BOT_PINPOINT'
  | 'BOT_QUICK_DRAW'
  | 'STALE_SEAT'
  | 'FIGHTER_GRACE'
  | 'HOST_GRACE';

interface ScheduledEvent {
  id: string;
  kind: ScheduledEventKind;
  at: number;
  payload?: Record<string, unknown>;
}

interface PersistentRoom {
  roomId: string;
  roomCode: string;
  hostToken: string;
  phase: GamePhase;
  debugMode: boolean;
  players: Record<string, Player>; // sessionToken -> Player
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
  scheduledEvents: ScheduledEvent[];
}

interface SocketAttachment {
  connectionId: string;
  sessionToken: string | null;
  routeRoomCode: string;
}

const STORAGE_KEY = 'activeRoom';
const MAX_MESSAGE_BYTES = 65536;
const ROOM_CODE_PATTERN = /^[A-Z0-9]{1,6}$/;
const ROUND_EVENT_KINDS = new Set<ScheduledEventKind>([
  'OPEN_BETTING',
  'BET_TICK',
  'START_MINIGAME',
  'GAME_TIMEOUT',
  'BOT_BET',
  'BOT_MILLISECOND_STOP',
  'BOT_RED_GREEN',
  'BOT_SPEED_MATH',
  'BOT_HIGHER_LOWER',
  'BOT_PINPOINT',
  'BOT_QUICK_DRAW',
  'FIGHTER_GRACE',
]);

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function normalizeRoomCode(raw: string | null | undefined): string {
  return (raw || '').trim().toUpperCase();
}

function eventId(kind: ScheduledEventKind): string {
  return `${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export class BrawlRoomCore {
  private room: PersistentRoom | null = null;
  private readonly timing: TimingConfig;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {
    this.timing = env.BRAWL_TEST_FAST === '1' ? FAST_TEST_TIMING : DEFAULT_TIMING;
    this.ctx.blockConcurrencyWhile(async () => {
      this.room = (await this.ctx.storage.get<PersistentRoom>(STORAGE_KEY)) ?? null;
    });
  }

  async fetch(request: Request): Promise<Response> {
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const url = new URL(request.url);
    const routeRoomCode = normalizeRoomCode(url.searchParams.get('room'));
    if (!ROOM_CODE_PATTERN.test(routeRoomCode)) {
      return new Response('Invalid room code', { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    const attachment: SocketAttachment = {
      connectionId: crypto.randomUUID(),
      sessionToken: null,
      routeRoomCode,
    };

    server.serializeAttachment(attachment);
    this.ctx.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.processOverdueEvents();

    let raw: string;
    if (typeof message === 'string') {
      raw = message;
    } else {
      if (message.byteLength > MAX_MESSAGE_BYTES) return;
      raw = new TextDecoder().decode(message);
    }
    if (raw.length > MAX_MESSAGE_BYTES) return;

    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
      if (!msg || typeof msg !== 'object' || typeof (msg as { type?: unknown }).type !== 'string') return;
    } catch {
      return;
    }

    if (msg.type === 'PING') {
      const clientSentAt = msg.payload?.clientSentAt;
      this.send(ws, {
        type: 'PONG',
        timestamp: Date.now(),
        payload: { clientSentAt, serverNow: Date.now() },
      });
      return;
    }

    const attachment = this.getAttachment(ws);
    if (!attachment) return;

    if (msg.type === 'CREATE_ROOM') {
      await this.handleCreateRoom(ws, attachment, msg);
      return;
    }

    if (msg.type === 'JOIN_ROOM') {
      await this.handleJoinRoom(ws, attachment, msg);
      return;
    }

    if (!this.room || !attachment.sessionToken || !this.room.players[attachment.sessionToken]) {
      return;
    }

    const player = this.room.players[attachment.sessionToken];

    if (msg.type === 'TOGGLE_READY') {
      if (this.room.phase === 'LOBBY') {
        player.isReady = !player.isReady;
        await this.commitAndBroadcast();
      }
      return;
    }

    if (msg.type === 'START_GAME') {
      await this.handleStartGame(ws, player);
      return;
    }

    if (msg.type === 'PLACE_BET') {
      await this.handlePlaceBet(ws, player, msg.payload);
      return;
    }

    if (msg.type === 'FIGHTER_ACTION') {
      await this.handleFighterAction(ws, player, msg.payload);
      return;
    }

    if (msg.type === 'NEXT_ROUND') {
      if (!player.isHost || !this.room.currentRound || this.room.phase !== 'PAYOUT_RECAP') return;
      const sched = this.room.tournamentSchedule;
      if (sched && sched.stage === 'COMPLETE') {
        this.room.phase = 'FINAL_PODIUM';
        this.room.awards = computeSessionAwards(Object.values(this.room.players), sched.championId);
      } else {
        this.startRound(this.room.currentRound.roundNumber + 1);
      }
      await this.commitAndBroadcast();
      return;
    }

    if (msg.type === 'RESTART_GAME') {
      if (!player.isHost || this.room.phase !== 'FINAL_PODIUM') return;
      this.clearRoundEvents();
      for (const p of Object.values(this.room.players)) {
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
      this.room.phase = 'LOBBY';
      this.room.currentRound = null;
      this.room.internalGameState = null;
      this.room.tournamentSchedule = null;
      this.room.roundHistory = [];
      this.room.awards = [];
      await this.commitAndBroadcast();
      return;
    }

    if (msg.type === 'CLOSE_ROOM') {
      if (!player.isHost) return;
      const closeMessage: ServerMessage = {
        type: 'ROOM_CLOSED',
        timestamp: Date.now(),
        payload: { reason: 'The host closed the room.' },
      };
      this.broadcastRaw(JSON.stringify(closeMessage));
      this.room = null;
      await this.persistAndSchedule();
      return;
    }

    if (msg.type === 'DEBUG_ADD_BOT') {
      if (!player.isHost || !this.room.debugMode || this.room.phase !== 'LOBBY') return;
      if (Object.keys(this.room.players).length < MAX_PLAYERS_CAPACITY) {
        const idx = Object.keys(this.room.players).length + 1;
        const bot = createFreshPlayer(`Bot ${idx}`, '🤖', false);
        bot.isBot = true;
        bot.isReady = true;
        this.room.players[bot.sessionToken] = bot;
        await this.commitAndBroadcast();
      }
      return;
    }

    if (msg.type === 'KICK_PLAYER') {
      if (!player.isHost || this.room.phase !== 'LOBBY') return;
      const targetPlayerId = msg.payload?.playerId;
      if (!targetPlayerId) return;
      const targetPlayer = Object.values(this.room.players).find(p => p.id === targetPlayerId);
      if (!targetPlayer || targetPlayer.isHost) return;

      const token = targetPlayer.sessionToken;
      for (const socket of this.ctx.getWebSockets()) {
        const socketAttachment = this.getAttachment(socket);
        if (socketAttachment?.sessionToken !== token) continue;
        this.send(socket, {
          type: 'ROOM_CLOSED',
          timestamp: Date.now(),
          payload: { reason: 'You were removed from the room by the host.' },
        });
        try { socket.close(1000, 'Removed by host'); } catch { /* ignore */ }
      }

      delete this.room.players[token];
      this.removeEvents(e =>
        (e.kind === 'STALE_SEAT' && e.payload?.sessionToken === token) ||
        (e.kind === 'FIGHTER_GRACE' && e.payload?.sessionToken === token),
      );
      await this.commitAndBroadcast();
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.handleSocketDisconnect(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleSocketDisconnect(ws);
  }

  async alarm(): Promise<void> {
    await this.processOverdueEvents();
  }

  private async handleCreateRoom(
    ws: WebSocket,
    attachment: SocketAttachment,
    msg: Extract<ClientMessage, { type: 'CREATE_ROOM' }>,
  ): Promise<void> {
    const payload = msg.payload || {};

    if (this.room && Object.keys(this.room.players).length > 0) {
      if (attachment.sessionToken !== this.room.hostToken) {
        this.send(ws, {
          type: 'JOIN_ERROR',
          timestamp: Date.now(),
          payload: {
            code: 'ROOM_ALREADY_ACTIVE',
            message: `A game room (${this.room.roomCode}) is already running on this server. Join with the code.`,
          },
        });
        return;
      }
    }

    const roomCode = attachment.routeRoomCode;
    const hostPlayer = createFreshPlayer(payload.playerName || 'Host', payload.avatar || '⚡', true);
    this.room = {
      roomId: `room_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      roomCode,
      hostToken: hostPlayer.sessionToken,
      phase: 'LOBBY',
      debugMode: !!payload.debugMode,
      players: { [hostPlayer.sessionToken]: hostPlayer },
      totalRounds: 4,
      currentRound: null,
      internalGameState: null,
      tournamentSchedule: null,
      roundHistory: [],
      awards: [],
      scheduledEvents: [],
    };

    attachment.sessionToken = hostPlayer.sessionToken;
    ws.serializeAttachment(attachment);
    await this.persistAndSchedule();

    this.send(ws, {
      type: 'JOIN_SUCCESS',
      timestamp: Date.now(),
      payload: {
        player: toPublicPlayer(hostPlayer),
        sessionToken: hostPlayer.sessionToken,
        roomCode,
        isHost: true,
      },
    });
    this.broadcastRoomState();
  }

  private async handleJoinRoom(
    ws: WebSocket,
    attachment: SocketAttachment,
    msg: Extract<ClientMessage, { type: 'JOIN_ROOM' }>,
  ): Promise<void> {
    const { roomCode, playerName, avatar, sessionToken } = msg.payload || ({} as never);

    if (!this.room) {
      this.send(ws, {
        type: 'JOIN_ERROR',
        timestamp: Date.now(),
        payload: { code: 'ROOM_NOT_FOUND', message: 'No active room exists for this room code.' },
      });
      return;
    }

    const cleanCode = normalizeRoomCode(roomCode);
    if (!cleanCode || cleanCode !== this.room.roomCode || cleanCode !== attachment.routeRoomCode) {
      this.send(ws, {
        type: 'JOIN_ERROR',
        timestamp: Date.now(),
        payload: { code: 'INVALID_CODE', message: `Invalid room code: ${roomCode}` },
      });
      return;
    }

    if (sessionToken && typeof sessionToken === 'string' && this.room.players[sessionToken]) {
      const existing = this.room.players[sessionToken];

      attachment.sessionToken = sessionToken;
      ws.serializeAttachment(attachment);
      existing.connected = true;

      this.removeEvents(e =>
        (e.kind === 'FIGHTER_GRACE' && e.payload?.playerId === existing.id) ||
        (e.kind === 'HOST_GRACE' && e.payload?.hostToken === sessionToken) ||
        (e.kind === 'STALE_SEAT' && e.payload?.sessionToken === sessionToken),
      );

      // Bind the replacement socket before closing the stale one. webSocketClose then
      // sees another live socket with the same token and does not mark the seat offline.
      for (const oldSocket of this.ctx.getWebSockets()) {
        if (oldSocket === ws) continue;
        const oldAttachment = this.getAttachment(oldSocket);
        if (oldAttachment?.sessionToken === sessionToken) {
          try { oldSocket.close(1000, 'Replaced by new connection'); } catch { /* ignore */ }
        }
      }

      await this.persistAndSchedule();
      this.send(ws, {
        type: 'JOIN_SUCCESS',
        timestamp: Date.now(),
        payload: {
          player: toPublicPlayer(existing),
          sessionToken: existing.sessionToken,
          roomCode: this.room.roomCode,
          isHost: existing.isHost,
        },
      });
      this.broadcastRoomState();
      return;
    }

    if (this.room.phase !== 'LOBBY') {
      this.send(ws, {
        type: 'JOIN_ERROR',
        timestamp: Date.now(),
        payload: { code: 'GAME_IN_PROGRESS', message: 'Match already in progress.' },
      });
      return;
    }

    if (Object.keys(this.room.players).length >= MAX_PLAYERS_CAPACITY) {
      this.send(ws, {
        type: 'JOIN_ERROR',
        timestamp: Date.now(),
        payload: { code: 'ROOM_FULL', message: 'Room is full (max 9 players).' },
      });
      return;
    }

    const safeName = sanitizePlayerName(playerName);
    const safeAvatar = sanitizePlayerAvatar(avatar);
    const newPlayer = createFreshPlayer(safeName, safeAvatar, false);
    this.room.players[newPlayer.sessionToken] = newPlayer;
    attachment.sessionToken = newPlayer.sessionToken;
    ws.serializeAttachment(attachment);

    await this.persistAndSchedule();
    this.send(ws, {
      type: 'JOIN_SUCCESS',
      timestamp: Date.now(),
      payload: {
        player: toPublicPlayer(newPlayer),
        sessionToken: newPlayer.sessionToken,
        roomCode: this.room.roomCode,
        isHost: false,
      },
    });
    this.broadcastRoomState();
  }

  private async handleStartGame(ws: WebSocket, player: Player): Promise<void> {
    if (!this.room) return;
    if (!player.isHost) {
      this.send(ws, {
        type: 'JOIN_ERROR',
        timestamp: Date.now(),
        payload: { code: 'NOT_HOST', message: 'Only the room host can start the match.' },
      });
      return;
    }
    if (this.room.phase !== 'LOBBY') return;

    const playerList = Object.values(this.room.players);
    const connectedPlayers = playerList.filter(p => p.connected);

    if (connectedPlayers.length < MIN_PLAYERS_TO_START && !this.room.debugMode) {
      this.send(ws, {
        type: 'JOIN_ERROR',
        timestamp: Date.now(),
        payload: {
          code: 'NOT_ENOUGH_PLAYERS',
          message: `Need at least ${MIN_PLAYERS_TO_START} connected players to start (currently ${connectedPlayers.length}).`,
        },
      });
      return;
    }

    const allReady = connectedPlayers.every(p => p.isReady || p.isHost);
    if (!allReady && !this.room.debugMode) {
      this.send(ws, {
        type: 'JOIN_ERROR',
        timestamp: Date.now(),
        payload: { code: 'NOT_ALL_READY', message: 'All connected players must be READY before starting.' },
      });
      return;
    }

    let schedule: TournamentSchedule;
    if (connectedPlayers.length < 3 && this.room.debugMode) {
      const pA = connectedPlayers[0];
      const pB = connectedPlayers[1] || connectedPlayers[0];
      schedule = {
        stage: 'QUALIFIERS',
        totalPlayers: connectedPlayers.length,
        qualifierCount: 1,
        qualifiersCompleted: 0,
        totalRounds: 3,
        matches: [{
          matchIndex: 0,
          roundNumber: 1,
          fighterIds: [pA.id, pB.id],
          isChampionship: false,
          completed: false,
          winnerId: null,
        }],
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

    this.room.tournamentSchedule = schedule;
    this.room.totalRounds = schedule.totalRounds;
    for (const p of Object.values(this.room.players)) {
      p.qualifierPoints = 0;
      p.qualifierWins = 0;
      p.qualifierTies = 0;
      p.qualifierLosses = 0;
      p.qualifierMatchesPlayed = 0;
      p.tournamentRank = undefined;
    }
    computeTournamentRankings(Object.values(this.room.players), [], schedule.stableRosterOrder);
    this.startRound(1);
    await this.commitAndBroadcast();
  }

  private async handlePlaceBet(
    ws: WebSocket,
    player: Player,
    payload: Extract<ClientMessage, { type: 'PLACE_BET' }>['payload'],
  ): Promise<void> {
    if (!this.room) return;
    const { fighterId, amount } = payload || ({} as never);
    const error = validateBetPlacement(
      player,
      fighterId,
      amount,
      this.room.currentRound,
      this.room.phase,
      Date.now(),
    );

    if (error) {
      this.send(ws, {
        type: 'BET_REJECTED',
        timestamp: Date.now(),
        payload: { reason: error },
      });
      return;
    }

    player.coins -= amount;
    player.totalBetsPlaced += 1;
    player.highestSingleBet = Math.max(player.highestSingleBet, amount);

    const currentOdds = this.room.currentRound!.odds[fighterId]?.decimalOdds || 2.0;
    const newBet: SecretBet = {
      bettorId: player.id,
      fighterId,
      amount,
      oddsAtBet: currentOdds,
      timestamp: Date.now(),
      potentialReturn: Math.floor(amount * currentOdds),
    };
    this.room.currentRound!.bets.push(newBet);

    const fA = this.findPlayerById(this.room.currentRound!.fighterIds[0])!;
    const fB = this.findPlayerById(this.room.currentRound!.fighterIds[1])!;
    this.room.currentRound!.odds = calculateDynamicOdds(fA, fB, this.room.currentRound!.bets);

    await this.persistAndSchedule();
    this.send(ws, {
      type: 'BET_ACCEPTED',
      timestamp: Date.now(),
      payload: { bet: newBet, myBankroll: player.coins },
    });
    this.broadcastRoomState();
  }

  private async handleFighterAction(ws: WebSocket, player: Player, action: FighterAction): Promise<void> {
    if (!this.room?.currentRound || !this.room.internalGameState || this.room.phase !== 'MINIGAME_ACTIVE') return;
    const now = Date.now();
    if (this.room.currentRound.gameEndsAt && now >= this.room.currentRound.gameEndsAt) return;

    const result = processFighterAction(
      this.room.internalGameState,
      this.room.currentRound.fighterScores,
      player.id,
      action,
      now,
    );

    if (result.gameStatePatch) {
      this.room.currentRound.gameState = {
        ...this.room.currentRound.gameState,
        ...result.gameStatePatch,
      };
    }

    if (result.actionFeedback) {
      this.send(ws, {
        type: 'ACTION_RESULT',
        timestamp: Date.now(),
        payload: result.actionFeedback,
      });
    }

    if (result.resolved) {
      this.resolveCurrentGame(result.winnerId, result.isTie);
    }
    await this.commitAndBroadcast();
  }

  private startRound(roundNum: number): void {
    if (!this.room) return;
    this.clearRoundEvents();

    const playerList = Object.values(this.room.players);
    let explicitFighters: [string, string] | undefined;
    let isChampionship = false;
    let stage: TournamentStage = 'QUALIFIERS';
    let qualifierIndex: number | undefined;
    let qualifierTotal: number | undefined;
    let championshipGameNumber: number | undefined;

    const sched = this.room.tournamentSchedule;
    if (sched) {
      if (sched.qualifiersCompleted < sched.qualifierCount) {
        const match = sched.matches[sched.qualifiersCompleted];
        explicitFighters = match.fighterIds;
        qualifierIndex = sched.qualifiersCompleted + 1;
        qualifierTotal = sched.qualifierCount;
      } else {
        isChampionship = true;
        stage = 'CHAMPIONSHIP';
        sched.stage = 'CHAMPIONSHIP';

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

    const lastMiniGameId = this.room.currentRound?.miniGame.id;
    const { round, internalGame } = initAuthoritativeRound(
      roundNum,
      this.room.totalRounds,
      playerList,
      this.room.lastPairing,
      explicitFighters,
      isChampionship,
      stage,
      qualifierIndex,
      qualifierTotal,
      championshipGameNumber,
      lastMiniGameId,
    );

    const now = Date.now();
    round.revealEndsAt = now + this.timing.revealDurationMs;
    round.bettingEndsAt = round.revealEndsAt + this.timing.bettingDurationSeconds * 1000;
    round.gameStartsAt = round.bettingEndsAt + this.timing.countdownDurationMs;
    round.gameEndsAt = round.gameStartsAt + round.miniGame.durationSeconds * 1000;

    this.room.currentRound = round;
    this.room.internalGameState = internalGame;
    this.room.lastPairing = round.fighterIds;
    this.room.phase = 'FIGHTER_REVEAL';
    this.schedule('OPEN_BETTING', round.revealEndsAt, { roundNumber: roundNum });
  }

  private openBettingWindow(): void {
    if (!this.room?.currentRound) return;
    const round = this.room.currentRound;
    this.room.phase = 'BETTING_WINDOW';
    round.bettingTimeRemaining = this.timing.bettingDurationSeconds;
    round.bettingEndsAt = Date.now() + this.timing.bettingDurationSeconds * 1000;

    const botSpectators = Object.values(this.room.players).filter(
      p => p.isBot && !round.fighterIds.includes(p.id),
    );
    botSpectators.forEach((bot, idx) => {
      const delayMs = Math.max(0, Math.min(
        this.timing.bettingDurationSeconds * 1000 - 500,
        1500 + idx * 1200 + Math.random() * 1500,
      ));
      this.schedule('BOT_BET', Date.now() + delayMs, { playerId: bot.id, roundNumber: round.roundNumber });
    });

    const intervalStepMs = this.timing.bettingDurationSeconds <= 3 ? 200 : 1000;
    this.schedule('BET_TICK', Math.min(round.bettingEndsAt, Date.now() + intervalStepMs), {
      roundNumber: round.roundNumber,
    });
  }

  private startMiniGameCountdown(): void {
    if (!this.room?.currentRound) return;
    this.room.phase = 'MINIGAME_COUNTDOWN';
    this.room.currentRound.gameStartsAt = Date.now() + this.timing.countdownDurationMs;
    this.room.currentRound.gameEndsAt =
      this.room.currentRound.gameStartsAt + this.room.currentRound.miniGame.durationSeconds * 1000;
    this.schedule('START_MINIGAME', this.room.currentRound.gameStartsAt, {
      roundNumber: this.room.currentRound.roundNumber,
    });
  }

  private launchActiveMiniGame(): void {
    if (!this.room?.currentRound || !this.room.internalGameState) return;
    const round = this.room.currentRound;
    const internal = this.room.internalGameState;
    this.room.phase = 'MINIGAME_ACTIVE';
    round.gameStartsAt = Date.now();
    const durationMs = this.timing.gameDurationMs ?? round.miniGame.durationSeconds * 1000;
    round.gameEndsAt = round.gameStartsAt + durationMs;
    internal.gameStartsAt = round.gameStartsAt;

    if (round.miniGame.id === 'quick_draw' && internal.quickDraw) {
      internal.quickDraw.drawAt = round.gameStartsAt + internal.quickDraw.drawDelayMs;
      if (round.gameConfig) round.gameConfig.drawAt = internal.quickDraw.drawAt;
    }

    for (const fighterId of round.fighterIds) {
      const p = this.findPlayerById(fighterId);
      if (!p?.isBot) continue;
      if (round.miniGame.id === 'millisecond_stop') {
        this.schedule('BOT_MILLISECOND_STOP', Date.now() + Math.floor(4850 + Math.random() * 320), {
          playerId: p.id,
          roundNumber: round.roundNumber,
        });
      } else if (round.miniGame.id === 'rapid_red_green') {
        this.schedule('BOT_RED_GREEN', Date.now() + 200 + Math.random() * 80, {
          playerId: p.id,
          roundNumber: round.roundNumber,
        });
      } else if (round.miniGame.id === 'speed_math') {
        this.schedule('BOT_SPEED_MATH', Date.now() + 2400, {
          playerId: p.id,
          roundNumber: round.roundNumber,
          questionIndex: 0,
        });
      } else if (round.miniGame.id === 'higher_lower') {
        this.schedule('BOT_HIGHER_LOWER', Date.now() + 2600, {
          playerId: p.id,
          roundNumber: round.roundNumber,
          questionIndex: 0,
        });
      } else if (round.miniGame.id === 'blind_pinpoint') {
        this.schedule('BOT_PINPOINT', Date.now() + 3000, {
          playerId: p.id,
          roundNumber: round.roundNumber,
        });
      } else if (round.miniGame.id === 'quick_draw') {
        this.schedule('BOT_QUICK_DRAW', Date.now() + internal.quickDraw!.drawDelayMs + 280 + Math.floor(Math.random() * 150), {
          playerId: p.id,
          roundNumber: round.roundNumber,
        });
      }
    }

    this.schedule('GAME_TIMEOUT', round.gameEndsAt, { roundNumber: round.roundNumber });
  }

  private resolveCurrentGame(
    winnerId: string | null,
    isTie: boolean,
    resolutionReason: RoundResolutionReason = isTie ? 'TIE' : (winnerId ? 'PLAYED' : 'VOID'),
  ): void {
    const activeBrawlPhases: GamePhase[] = [
      'FIGHTER_REVEAL',
      'BETTING_WINDOW',
      'MINIGAME_COUNTDOWN',
      'MINIGAME_ACTIVE',
    ];
    if (!this.room?.currentRound || !activeBrawlPhases.includes(this.room.phase)) return;

    this.clearRoundEvents();
    const round = this.room.currentRound;
    round.winnerId = winnerId;
    round.tieResult = isTie;
    round.resolutionReason = resolutionReason;

    const { payouts, updatedPlayers } = computeRoundPayouts(
      winnerId,
      isTie,
      round.fighterIds,
      round.matchPot,
      round.bets,
      Object.values(this.room.players),
      resolutionReason,
    );
    round.payouts = payouts;
    for (const p of updatedPlayers) this.room.players[p.sessionToken] = p;

    if (this.room.tournamentSchedule) {
      const sched = this.room.tournamentSchedule;
      const [f1Id, f2Id] = round.fighterIds;
      const f1 = this.findPlayerById(f1Id);
      const f2 = this.findPlayerById(f2Id);

      if (!round.isChampionship) {
        sched.qualifiersCompleted += 1;
        const matchIndex = sched.matches.findIndex(m => !m.completed && !m.isChampionship);
        if (matchIndex !== -1) {
          sched.matches[matchIndex].completed = true;
          sched.matches[matchIndex].winnerId = winnerId;
          sched.matches[matchIndex].tieResult = isTie;
          sched.matches[matchIndex].resolutionReason = resolutionReason;
        }

        if (resolutionReason === 'PLAYED' || resolutionReason === 'DISCONNECT_FORFEIT') {
          if (f1) f1.qualifierMatchesPlayed += 1;
          if (f2) f2.qualifierMatchesPlayed += 1;
          if (winnerId) {
            const winner = f1?.id === winnerId ? f1 : f2;
            const loser = f1?.id === winnerId ? f2 : f1;
            if (winner) { winner.qualifierPoints += 3; winner.qualifierWins += 1; }
            if (loser) loser.qualifierLosses += 1;
          }
        } else if (isTie) {
          if (f1) { f1.qualifierMatchesPlayed += 1; f1.qualifierPoints += 1; f1.qualifierTies += 1; }
          if (f2) { f2.qualifierMatchesPlayed += 1; f2.qualifierPoints += 1; f2.qualifierTies += 1; }
        }

        const completedQualifiers = sched.matches.filter(m => !m.isChampionship && m.completed);
        computeTournamentRankings(Object.values(this.room.players), completedQualifiers, sched.stableRosterOrder);
      } else {
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

        if (!isTie && resolutionReason !== 'VOID' && winnerId) {
          sched.championshipWins[winnerId] = (sched.championshipWins[winnerId] || 0) + 1;
          if (sched.championshipWins[winnerId] >= 2) {
            sched.championId = winnerId;
            sched.runnerUpId = round.fighterIds[0] === winnerId ? round.fighterIds[1] : round.fighterIds[0];
            sched.stage = 'COMPLETE';
          }
        }
      }
    }

    const winningPlayer = Object.values(this.room.players).find(p => p.id === winnerId);
    this.room.roundHistory.push({
      roundNumber: round.roundNumber,
      miniGameName: round.miniGame.name,
      winnerName: isTie
        ? 'TIE'
        : resolutionReason === 'DISCONNECT_FORFEIT'
          ? `${winningPlayer?.name || 'Winner'} (Forfeit)`
          : winningPlayer?.name || 'Unknown',
      totalPotWon: round.matchPot,
      isChampionship: !!round.isChampionship,
      championshipGameNumber: round.championshipGameNumber,
      resolutionReason,
    });
    this.room.phase = 'PAYOUT_RECAP';
  }

  private async processOverdueEvents(): Promise<void> {
    // Normal heartbeat/gameplay messages should not cause storage writes when no
    // deadline is due. The already-persisted alarm remains authoritative.
    if (!this.room?.scheduledEvents.length) return;

    let processedAny = false;
    // Consume all currently due work. Handlers may enqueue another event that is
    // already due, so loop until the head is in the future.
    while (this.room?.scheduledEvents.length) {
      this.room.scheduledEvents.sort((a, b) => a.at - b.at);
      const next = this.room.scheduledEvents[0];
      if (next.at > Date.now() + 10) break;
      this.room.scheduledEvents.shift();
      processedAny = true;
      await this.handleScheduledEvent(next);
    }

    if (processedAny) {
      await this.persistAndSchedule();
      this.broadcastRoomState();
    }
  }

  private async handleScheduledEvent(event: ScheduledEvent): Promise<void> {
    if (!this.room) return;
    const roundNumber = Number(event.payload?.roundNumber ?? -1);
    const sameRound = !this.room.currentRound || roundNumber < 0 || this.room.currentRound.roundNumber === roundNumber;

    switch (event.kind) {
      case 'OPEN_BETTING':
        if (sameRound && this.room.phase === 'FIGHTER_REVEAL') this.openBettingWindow();
        break;

      case 'BET_TICK': {
        if (!sameRound || this.room.phase !== 'BETTING_WINDOW' || !this.room.currentRound?.bettingEndsAt) break;
        const now = Date.now();
        const remaining = Math.max(0, Math.ceil((this.room.currentRound.bettingEndsAt - now) / 1000));
        this.room.currentRound.bettingTimeRemaining = remaining;
        if (remaining <= 0 || now >= this.room.currentRound.bettingEndsAt) {
          this.startMiniGameCountdown();
        } else {
          const step = this.timing.bettingDurationSeconds <= 3 ? 200 : 1000;
          this.schedule('BET_TICK', Math.min(this.room.currentRound.bettingEndsAt, now + step), { roundNumber });
        }
        break;
      }

      case 'START_MINIGAME':
        if (sameRound && this.room.phase === 'MINIGAME_COUNTDOWN') this.launchActiveMiniGame();
        break;

      case 'GAME_TIMEOUT':
        if (sameRound && this.room.phase === 'MINIGAME_ACTIVE' && this.room.currentRound && this.room.internalGameState) {
          const timeoutResult = resolveGameTimeout(this.room.internalGameState, this.room.currentRound.fighterScores);
          if (timeoutResult.gameStatePatch) {
            this.room.currentRound.gameState = {
              ...this.room.currentRound.gameState,
              ...timeoutResult.gameStatePatch,
            };
          }
          this.resolveCurrentGame(timeoutResult.winnerId, timeoutResult.isTie);
        }
        break;

      case 'BOT_BET':
        this.processBotBet(event);
        break;

      case 'BOT_MILLISECOND_STOP':
        this.processBotAction(event, { type: 'STOP' });
        break;

      case 'BOT_RED_GREEN': {
        const resolved = this.processBotAction(event, { type: 'TAP' });
        if (!resolved && this.room?.phase === 'MINIGAME_ACTIVE' && sameRound) {
          this.schedule('BOT_RED_GREEN', Date.now() + 200 + Math.random() * 80, event.payload);
        }
        break;
      }

      case 'BOT_SPEED_MATH': {
        const qIdx = Number(event.payload?.questionIndex ?? 0);
        if (qIdx >= 3 || !this.room.internalGameState?.speedMath) break;
        const answer = this.room.internalGameState.speedMath.correctAnswers[qIdx];
        const resolved = this.processBotAction(event, { type: 'ANSWER', questionIndex: qIdx, answer });
        if (!resolved && this.room?.phase === 'MINIGAME_ACTIVE' && qIdx + 1 < 3 && sameRound) {
          this.schedule('BOT_SPEED_MATH', Date.now() + 2400, { ...event.payload, questionIndex: qIdx + 1 });
        }
        break;
      }

      case 'BOT_HIGHER_LOWER': {
        const qIdx = Number(event.payload?.questionIndex ?? 0);
        const card = this.room.internalGameState?.higherLower?.cards[qIdx];
        if (!card || qIdx >= 3) break;
        const guess = card.isHigher ? 'HIGHER' : 'LOWER';
        const resolved = this.processBotAction(event, { type: 'GUESS', questionIndex: qIdx, guess });
        if (!resolved && this.room?.phase === 'MINIGAME_ACTIVE' && qIdx + 1 < 3 && sameRound) {
          this.schedule('BOT_HIGHER_LOWER', Date.now() + 2600, { ...event.payload, questionIndex: qIdx + 1 });
        }
        break;
      }

      case 'BOT_PINPOINT': {
        const target = this.room.internalGameState?.blindPinpoint?.targetCity;
        if (!target) break;
        const normX = (target.lon + 180) / 360 + (Math.random() - 0.5) * 0.08;
        const normY = (90 - target.lat) / 180 + (Math.random() - 0.5) * 0.08;
        this.processBotAction(event, {
          type: 'PIN',
          normX: Math.max(0, Math.min(1, normX)),
          normY: Math.max(0, Math.min(1, normY)),
        });
        break;
      }

      case 'BOT_QUICK_DRAW':
        this.processBotAction(event, { type: 'DRAW_TAP' });
        break;

      case 'STALE_SEAT': {
        if (this.room.phase !== 'LOBBY') break;
        const token = String(event.payload?.sessionToken || '');
        const p = this.room.players[token];
        if (p && !p.connected) delete this.room.players[token];
        break;
      }

      case 'FIGHTER_GRACE': {
        const token = String(event.payload?.sessionToken || '');
        const playerId = String(event.payload?.playerId || '');
        const otherFighterId = String(event.payload?.otherFighterId || '');
        if (!sameRound || !this.room.currentRound) break;
        const activePhases: GamePhase[] = ['FIGHTER_REVEAL', 'BETTING_WINDOW', 'MINIGAME_COUNTDOWN', 'MINIGAME_ACTIVE'];
        if (!activePhases.includes(this.room.phase)) break;
        const p = this.room.players[token];
        if (!p || p.connected || p.id !== playerId) break;
        const other = this.findPlayerById(otherFighterId);
        this.resolveCurrentGame(other?.connected ? otherFighterId : null, false, other?.connected ? 'DISCONNECT_FORFEIT' : 'VOID');
        break;
      }

      case 'HOST_GRACE': {
        const hostToken = String(event.payload?.hostToken || '');
        const host = this.room.players[hostToken];
        if (host && !host.connected) {
          const closeMessage: ServerMessage = {
            type: 'ROOM_CLOSED',
            timestamp: Date.now(),
            payload: { reason: 'Host disconnected and did not return.' },
          };
          this.broadcastRaw(JSON.stringify(closeMessage));
          this.room = null;
        }
        break;
      }
    }
  }

  private processBotBet(event: ScheduledEvent): void {
    if (!this.room?.currentRound || this.room.phase !== 'BETTING_WINDOW') return;
    if (Number(event.payload?.roundNumber ?? -1) !== this.room.currentRound.roundNumber) return;
    const bot = this.findPlayerById(String(event.payload?.playerId || ''));
    if (!bot || !bot.isBot || this.room.currentRound.bets.some(b => b.bettorId === bot.id)) return;

    const [fAId, fBId] = this.room.currentRound.fighterIds;
    const targetFighterId = Math.random() < 0.5 ? fAId : fBId;
    const betAmt = Math.min(bot.coins, [50, 100, 150][Math.floor(Math.random() * 3)]);
    if (betAmt <= 0) return;

    bot.coins -= betAmt;
    bot.totalBetsPlaced += 1;
    bot.highestSingleBet = Math.max(bot.highestSingleBet, betAmt);
    const currentOdds = this.room.currentRound.odds[targetFighterId]?.decimalOdds || 2.0;
    this.room.currentRound.bets.push({
      bettorId: bot.id,
      fighterId: targetFighterId,
      amount: betAmt,
      oddsAtBet: currentOdds,
      timestamp: Date.now(),
      potentialReturn: Math.floor(betAmt * currentOdds),
    });
    const fA = this.findPlayerById(fAId)!;
    const fB = this.findPlayerById(fBId)!;
    this.room.currentRound.odds = calculateDynamicOdds(fA, fB, this.room.currentRound.bets);
  }

  private processBotAction(event: ScheduledEvent, action: FighterAction): boolean {
    if (!this.room?.currentRound || !this.room.internalGameState || this.room.phase !== 'MINIGAME_ACTIVE') return false;
    if (Number(event.payload?.roundNumber ?? -1) !== this.room.currentRound.roundNumber) return false;
    const playerId = String(event.payload?.playerId || '');
    const result = processFighterAction(
      this.room.internalGameState,
      this.room.currentRound.fighterScores,
      playerId,
      action,
      Date.now(),
    );
    if (result.gameStatePatch) {
      this.room.currentRound.gameState = {
        ...this.room.currentRound.gameState,
        ...result.gameStatePatch,
      };
    }
    if (result.resolved) this.resolveCurrentGame(result.winnerId, result.isTie);
    return result.resolved;
  }

  private async handleSocketDisconnect(ws: WebSocket): Promise<void> {
    await this.processOverdueEvents();
    const attachment = this.getAttachment(ws);
    const token = attachment?.sessionToken;
    if (!token || !this.room?.players[token]) return;

    // Stale socket protection: a reconnect socket with the same token already exists.
    const replacementExists = this.ctx.getWebSockets().some(other => {
      if (other === ws) return false;
      return this.getAttachment(other)?.sessionToken === token;
    });
    if (replacementExists) return;

    const p = this.room.players[token];
    p.connected = false;

    if (this.room.phase === 'LOBBY' && !p.isHost) {
      this.removeEvents(e => e.kind === 'STALE_SEAT' && e.payload?.sessionToken === token);
      this.schedule('STALE_SEAT', Date.now() + this.timing.staleSeatGraceMs, { sessionToken: token });
    }

    const activePhases: GamePhase[] = ['FIGHTER_REVEAL', 'BETTING_WINDOW', 'MINIGAME_COUNTDOWN', 'MINIGAME_ACTIVE'];
    if (activePhases.includes(this.room.phase) && this.room.currentRound) {
      const [f1, f2] = this.room.currentRound.fighterIds;
      if (p.id === f1 || p.id === f2) {
        const otherFighterId = p.id === f1 ? f2 : f1;
        this.removeEvents(e => e.kind === 'FIGHTER_GRACE' && e.payload?.playerId === p.id);
        this.schedule('FIGHTER_GRACE', Date.now() + this.timing.fighterGraceMs, {
          sessionToken: token,
          playerId: p.id,
          otherFighterId,
          roundNumber: this.room.currentRound.roundNumber,
        });
      }
    }

    if (p.isHost) {
      this.removeEvents(e => e.kind === 'HOST_GRACE' && e.payload?.hostToken === token);
      this.schedule('HOST_GRACE', Date.now() + this.timing.hostGraceMs, { hostToken: token });
    }

    await this.commitAndBroadcast();
  }

  private broadcastRoomState(): void {
    if (!this.room) return;
    const publicPlayers: PublicPlayer[] = Object.values(this.room.players).map(toPublicPlayer);

    let publicRound: RoundState | null = null;
    if (this.room.currentRound) {
      publicRound = {
        ...this.room.currentRound,
        bets: this.room.phase === 'PAYOUT_RECAP' || this.room.phase === 'FINAL_PODIUM'
          ? this.room.currentRound.bets
          : [],
      };
    }

    for (const socket of this.ctx.getWebSockets()) {
      const attachment = this.getAttachment(socket);
      if (!attachment?.sessionToken) continue;
      const player = this.room.players[attachment.sessionToken];
      if (!player) continue;

      let tailoredRound = publicRound;
      if (
        publicRound &&
        publicRound.miniGame.id === 'higher_lower' &&
        publicRound.gameState &&
        this.room.phase === 'MINIGAME_ACTIVE'
      ) {
        const origGameState = publicRound.gameState;
        const origReveals = (origGameState.reveals as Record<string, Record<number, unknown>>) || {};
        const stepIndices = (origGameState.stepIndex as Record<string, number>) || {};
        const myStep = stepIndices[player.id] || 0;
        const sanitizedReveals: Record<string, Record<number, unknown>> = {};

        for (const [fighterId, fighterReveals] of Object.entries(origReveals)) {
          if (fighterId === player.id) {
            sanitizedReveals[fighterId] = fighterReveals;
          } else {
            const filtered: Record<number, unknown> = {};
            for (const [qIdxStr, value] of Object.entries(fighterReveals)) {
              const qIdx = Number(qIdxStr);
              if (qIdx < myStep) filtered[qIdx] = value;
            }
            sanitizedReveals[fighterId] = filtered;
          }
        }

        tailoredRound = {
          ...publicRound,
          gameState: { ...origGameState, reveals: sanitizedReveals },
        };
      }

      const payload: PublicRoomState = {
        roomId: this.room.roomId,
        roomCode: this.room.roomCode,
        phase: this.room.phase,
        players: publicPlayers,
        totalRounds: this.room.totalRounds,
        currentRound: tailoredRound,
        tournamentSchedule: this.room.tournamentSchedule,
        roundHistory: this.room.roundHistory,
        awards: this.room.awards,
        debugMode: this.room.debugMode,
      };
      this.send(socket, { type: 'ROOM_STATE', timestamp: Date.now(), payload });
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try { ws.send(JSON.stringify(message)); } catch { /* disconnected */ }
  }

  private broadcastRaw(raw: string): void {
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(raw); } catch { /* disconnected */ }
    }
  }

  private getAttachment(ws: WebSocket): SocketAttachment | null {
    try {
      return (ws.deserializeAttachment() as SocketAttachment | null) ?? null;
    } catch {
      return null;
    }
  }

  private findPlayerById(playerId: string): Player | undefined {
    return this.room ? Object.values(this.room.players).find(p => p.id === playerId) : undefined;
  }

  private schedule(kind: ScheduledEventKind, at: number, payload?: Record<string, unknown>): void {
    if (!this.room) return;
    this.room.scheduledEvents.push({ id: eventId(kind), kind, at: Math.max(Date.now(), Math.floor(at)), payload });
  }

  private removeEvents(predicate: (event: ScheduledEvent) => boolean): void {
    if (!this.room) return;
    this.room.scheduledEvents = this.room.scheduledEvents.filter(event => !predicate(event));
  }

  private clearRoundEvents(): void {
    this.removeEvents(event => ROUND_EVENT_KINDS.has(event.kind));
  }

  private async commitAndBroadcast(): Promise<void> {
    await this.persistAndSchedule();
    this.broadcastRoomState();
  }

  private async persistAndSchedule(): Promise<void> {
    if (!this.room) {
      await this.ctx.storage.delete(STORAGE_KEY);
      await this.ctx.storage.deleteAlarm();
      return;
    }

    this.room.scheduledEvents.sort((a, b) => a.at - b.at);
    await this.ctx.storage.put(STORAGE_KEY, this.room);
    const next = this.room.scheduledEvents[0];
    if (next) {
      await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, next.at));
    } else {
      await this.ctx.storage.deleteAlarm();
    }
  }
}
