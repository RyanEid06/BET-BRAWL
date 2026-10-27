/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Client WebSocket Engine, Reconnect & Time Synchronization
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { BRAWL_PROTOCOL_VERSION } from './types.ts';
import { V2_GAME_IDS, type V2Action, type V2GameId } from './v2Games.ts';
import type {
  PublicPlayer,
  RoundState,
  GamePhase,
  Award,
  ClientMessage,
  ServerMessage,
  RoomNetworkInfo,
  FighterAction,
  SecretBet,
  TournamentSchedule,
} from './types.ts';
import { sound } from './audio.ts';
import { resolveJoinEndpoint, resolveWsUrl as resolveWsUrlHelper } from './networkDiscovery.ts';

const SESSION_TOKEN_KEY = 'betnbrawl_session_token';
const PLAYER_NAME_KEY = 'betnbrawl_player_name';
const PLAYER_AVATAR_KEY = 'betnbrawl_player_avatar';

export interface BrawlClientState {
  status: 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  errorMessage: string | null;
  networkInfo: RoomNetworkInfo | null;
  isHost: boolean;
  myPlayer: PublicPlayer | null;
  myBet: SecretBet | null;
  phase: GamePhase;
  roomCode: string;
  players: PublicPlayer[];
  totalRounds: number;
  currentRound: RoundState | null;
  tournamentSchedule: TournamentSchedule | null;
  roundHistory: Array<{
    roundNumber: number;
    miniGameName: string;
    winnerName: string;
    totalPotWon: number;
    isChampionship?: boolean;
  }>;
  awards: Award[];
  lastRejectedBetReason: string | null;
  lastActionFeedback: { questionIndex: number; isCorrect: boolean; challengerStat: string } | null;
  lastGameActionError: string | null;
  serverTimeOffset: number; // in ms
  isDebug: boolean;
}

export function useBrawlClient() {
  const [state, setState] = useState<BrawlClientState>(() => {
    const isDebug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';
    return {
      status: 'IDLE',
      errorMessage: null,
      networkInfo: null,
      isHost: false,
      myPlayer: null,
      myBet: null,
      phase: 'ENTRY',
      roomCode: '',
      players: [],
      totalRounds: 4,
      currentRound: null,
      tournamentSchedule: null,
      roundHistory: [],
      awards: [],
      lastRejectedBetReason: null,
      lastActionFeedback: null,
      lastGameActionError: null,
      serverTimeOffset: 0,
      isDebug,
    };
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep refs for latest values to prevent stale closures in WebSocket event listeners
  const phaseRef = useRef<GamePhase>(state.phase);
  phaseRef.current = state.phase;
  const roomCodeRef = useRef<string>(state.roomCode);
  roomCodeRef.current = state.roomCode;
  const sessionTokenRef = useRef<string | null>(null);
  const timeOffsetSamplesRef = useRef<number[]>([]);
  const targetWsEndpointRef = useRef<string | null>(null);
  const discoveredRoomsRef = useRef<Map<string, { hostIp: string; port: number; lastSeen: number }>>(new Map());
  const joinGameRef = useRef<(roomCode: string, playerName: string, avatar: string, targetHost?: string) => void>(() => {});

  // Load network info on mount (checks native Android bridge first, then /api/network-info)
  useEffect(() => {
    // Check if cold deep-link URL params supplied room, host, port on mount
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const qRoom = (params.get('room') || params.get('code') || '').trim().toUpperCase();
      const qHost = (params.get('host') || '').trim();
      const qPort = parseInt(params.get('port') || '8080', 10) || 8080;
      if (qRoom && qHost) {
        discoveredRoomsRef.current.set(qRoom, { hostIp: qHost, port: qPort, lastSeen: Date.now() });
        setState(prev => ({
          ...prev,
          networkInfo: {
            localIp: qHost,
            port: qPort,
            roomCode: qRoom,
            fullJoinUrl: `brawl://join?host=${qHost}&port=${qPort}&room=${qRoom}`,
            hasActiveRoom: true,
            playerCount: prev.networkInfo?.playerCount || 1,
            candidateUrls: [`brawl://join?host=${qHost}&port=${qPort}&room=${qRoom}`],
          },
        }));
      }
    }

    // 1. Canonical window.onDeepLinkJoin callback from native shell (warm deep link: { room, host, port })
    (window as unknown as { onDeepLinkJoin?: (data: unknown) => void }).onDeepLinkJoin = (data: unknown) => {
      let room = '';
      let host = '';
      let port = 8080;
      if (typeof data === 'object' && data !== null) {
        const obj = data as { room?: string; host?: string; port?: number };
        room = (obj.room || '').trim().toUpperCase();
        host = (obj.host || '').trim();
        port = typeof obj.port === 'number' ? obj.port : 8080;
      }
      if (room && host) {
        discoveredRoomsRef.current.set(room, { hostIp: host, port, lastSeen: Date.now() });
        setState(prev => ({
          ...prev,
          networkInfo: {
            localIp: host,
            port,
            roomCode: room,
            fullJoinUrl: `brawl://join?host=${host}&port=${port}&room=${room}`,
            hasActiveRoom: true,
            playerCount: prev.networkInfo?.playerCount || 1,
            candidateUrls: [`brawl://join?host=${host}&port=${port}&room=${room}`],
          },
        }));
        const savedName = localStorage.getItem(PLAYER_NAME_KEY) || 'You (Ace)';
        const savedAvatar = localStorage.getItem(PLAYER_AVATAR_KEY) || '⚡';
        joinGameRef.current(room, savedName, savedAvatar, `${host}:${port}`);
      }
    };

    // 2. Check for native Android bridge injected network info & discovered rooms
    const androidBridge = (window as unknown as { BetBrawlAndroid?: { getNetworkInfoJson?: () => string; getDiscoveredHostsJson?: () => string } }).BetBrawlAndroid;
    if (androidBridge && typeof androidBridge.getDiscoveredHostsJson === 'function') {
      try {
        const list = JSON.parse(androidBridge.getDiscoveredHostsJson());
        list.forEach((item: { ip?: string; host?: string; port?: number; roomCode?: string }) => {
          const code = (item.roomCode || '').trim().toUpperCase();
          const ip = item.host || item.ip;
          if (code && ip) {
            discoveredRoomsRef.current.set(code, { hostIp: ip, port: item.port || 8080, lastSeen: Date.now() });
          }
        });
      } catch {}
    }

    // Register live window.onHostDiscovered callback from native shell
    (window as unknown as { onHostDiscovered?: (data: unknown, port?: number, roomCode?: string) => void }).onHostDiscovered = (data: unknown, port?: number, roomCode?: string) => {
      let ip = '';
      let p = 8080;
      let code = '';
      if (typeof data === 'object' && data !== null) {
        const obj = data as Record<string, unknown>;
        ip = (obj.host || obj.ip || '') as string;
        p = typeof obj.port === 'number' ? obj.port : 8080;
        code = (obj.roomCode || '') as string;
      } else if (typeof data === 'string') {
        if (data.startsWith('{')) {
          try {
            const parsed = JSON.parse(data);
            ip = parsed.host || parsed.ip || '';
            p = typeof parsed.port === 'number' ? parsed.port : 8080;
            code = parsed.roomCode || '';
          } catch {
            ip = data;
            p = port || 8080;
            code = roomCode || '';
          }
        } else {
          ip = data;
          p = port || 8080;
          code = roomCode || '';
        }
      }
      const cleanCode = code.trim().toUpperCase();
      if (cleanCode && ip) {
        discoveredRoomsRef.current.set(cleanCode, { hostIp: ip, port: p, lastSeen: Date.now() });
        setState(prev => {
          if (!prev.networkInfo?.hasActiveRoom || prev.networkInfo.roomCode === cleanCode) {
            return {
              ...prev,
              networkInfo: {
                localIp: ip,
                port: p,
                roomCode: cleanCode,
                fullJoinUrl: `brawl://join?host=${ip}&port=${p}&room=${cleanCode}`,
                hasActiveRoom: true,
                playerCount: prev.networkInfo?.playerCount || 1,
                candidateUrls: [`brawl://join?host=${ip}&port=${p}&room=${cleanCode}`],
              },
            };
          }
          return prev;
        });
      }
    };

    // Stale discovered rooms cleanup interval (15s TTL)
    const pruneInterval = setInterval(() => {
      const now = Date.now();
      for (const [code, info] of discoveredRoomsRef.current.entries()) {
        if (now - info.lastSeen > 15000) {
          discoveredRoomsRef.current.delete(code);
        }
      }
    }, 5000);

    if (androidBridge && typeof androidBridge.getNetworkInfoJson === 'function') {
      try {
        const nativeInfo = JSON.parse(androidBridge.getNetworkInfoJson());
        if (nativeInfo && nativeInfo.localIp) {
          const fullUrl = `brawl://join?host=${nativeInfo.localIp}&port=${nativeInfo.port || 8080}&room=${nativeInfo.roomCode || ''}`;
          setState(prev => ({
            ...prev,
            networkInfo: {
              localIp: nativeInfo.localIp,
              port: nativeInfo.port || 8080,
              roomCode: nativeInfo.roomCode || '',
              fullJoinUrl: fullUrl,
              hasActiveRoom: nativeInfo.hasActiveRoom || false,
              playerCount: nativeInfo.playerCount || 0,
              candidateUrls: nativeInfo.candidateUrls || [fullUrl],
            },
          }));
          return () => clearInterval(pruneInterval);
        }
      } catch {
        // Fall back to HTTP fetch
      }
    }

    // 2. Browser / Node server fetch
    fetch('/api/network-info')
      .then(res => res.json())
      .then(info => {
        const fullUrl = `http://${info.localIp}:${info.port}`;
        setState(prev => ({
          ...prev,
          networkInfo: {
            localIp: info.localIp,
            port: info.port,
            roomCode: info.roomCode || '',
            fullJoinUrl: fullUrl,
            hasActiveRoom: info.hasActiveRoom,
            playerCount: info.playerCount,
            candidateUrls: info.candidateUrls,
          },
        }));
      })
      .catch(() => {
        // Fallback to window.location or local Android host
        const isFile = typeof window !== 'undefined' && window.location.protocol === 'file:';
        const defaultHost = isFile ? '127.0.0.1' : (window.location.hostname || '127.0.0.1');
        const defaultPort = isFile ? 8080 : (window.location.port ? parseInt(window.location.port, 10) : 3000);
        const origin = isFile ? `http://${defaultHost}:${defaultPort}` : window.location.origin;

        setState(prev => ({
          ...prev,
          networkInfo: {
            localIp: defaultHost,
            port: defaultPort,
            roomCode: '',
            fullJoinUrl: origin,
            hasActiveRoom: false,
            playerCount: 0,
            candidateUrls: [origin],
          },
        }));
      });
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Compute WebSocket URL cleanly across Android WebView, local host, LAN guest, or browser
  const resolveWsUrl = useCallback((customHost?: string, customPort?: number): string => {
    if (targetWsEndpointRef.current && !customHost) {
      return targetWsEndpointRef.current;
    }
    const search = typeof window !== 'undefined' ? window.location.search : undefined;
    const globalConfig = typeof window !== 'undefined'
      ? (window as unknown as { BETBRAWL_CONFIG?: { wsUrl?: string; hostIp?: string; wsPort?: number } }).BETBRAWL_CONFIG
      : undefined;
    const loc = typeof window !== 'undefined' ? window.location : undefined;
    return resolveWsUrlHelper(customHost, customPort || 8080, search, globalConfig, loc);
  }, []);

  // Connect WebSocket with immediate callback if already open and optional bounded retry
  const connectWs = useCallback((
    targetUrlOrHost?: string | (() => void),
    onConnected?: () => void,
    options?: { maxRetries?: number; retryDelayMs?: number; retryErrorMessage?: string }
  ) => {
    let callback = onConnected;
    let targetUrl: string | undefined;

    if (typeof targetUrlOrHost === 'function') {
      callback = targetUrlOrHost;
    } else if (typeof targetUrlOrHost === 'string') {
      if (targetUrlOrHost.startsWith('ws://') || targetUrlOrHost.startsWith('wss://')) {
        targetUrl = targetUrlOrHost;
      } else {
        targetUrl = resolveWsUrl(targetUrlOrHost);
      }
      targetWsEndpointRef.current = targetUrl;
    }

    const wsUrl = targetUrl || resolveWsUrl();
    targetWsEndpointRef.current = wsUrl;

    // If socket is already OPEN to the same target, invoke the callback immediately!
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && wsRef.current.url === wsUrl) {
      if (callback) callback();
      return;
    }

    // Clean up any existing socket before opening a new one
    if (wsRef.current) {
      try {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }

    setState(prev => ({ ...prev, status: 'CONNECTING', errorMessage: null }));

    let attempts = 0;
    const maxRetries = options?.maxRetries ?? 0;
    const retryDelay = options?.retryDelayMs ?? 200;
    let isConnected = false;

    const tryConnect = () => {
      if (isConnected) return;
      attempts++;

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        if (attempts <= maxRetries) {
          setTimeout(tryConnect, retryDelay);
          return;
        }
        setState(prev => ({
          ...prev,
          status: 'ERROR',
          errorMessage: options?.retryErrorMessage || "Couldn’t connect to the game.",
        }));
        return;
      }

      wsRef.current = ws;

      ws.onopen = () => {
        isConnected = true;
        setState(prev => ({ ...prev, status: 'CONNECTED', errorMessage: null }));
        if (callback) callback();

        // Start ping heartbeat with timestamps for server-time synchronization
        if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'PING',
              payload: { clientSentAt: Date.now() },
            }));
          }
        }, 5000);
      };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);

        // 1. Time Synchronization PONG
        if (msg.type === 'PONG') {
          const clientReceivedAt = Date.now();
          const clientSentAt = msg.payload?.clientSentAt;
          const serverNow = msg.payload?.serverNow;
          if (clientSentAt && serverNow) {
            const midpoint = (clientSentAt + clientReceivedAt) / 2;
            const offset = serverNow - midpoint;
            const samples = timeOffsetSamplesRef.current;
            samples.push(offset);
            if (samples.length > 5) samples.shift();
            // Median sample
            const sorted = [...samples].sort((a, b) => a - b);
            const medianOffset = sorted[Math.floor(sorted.length / 2)];
            setState(prev => ({ ...prev, serverTimeOffset: medianOffset }));
          }
          return;
        }

        // 2. JOIN_SUCCESS
        if (msg.type === 'JOIN_SUCCESS') {
          if (msg.payload.protocolVersion !== BRAWL_PROTOCOL_VERSION) {
            wsRef.current = null;
            try { ws.close(); } catch { /* ignore */ }
            setState(prev => ({ ...prev, status: 'ERROR', phase: 'ENTRY',
              errorMessage: 'This host uses an older BET-BRAWL version. Update the host to V2.' }));
            return;
          }
          const { player, sessionToken, roomCode, isHost } = msg.payload;
          localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
          sessionTokenRef.current = sessionToken;
          setState(prev => ({
            ...prev,
            myPlayer: player,
            isHost,
            roomCode,
            phase: 'LOBBY',
            errorMessage: null,
          }));
          return;
        }

        // 3. JOIN_ERROR
        if (msg.type === 'JOIN_ERROR') {
          setState(prev => ({
            ...prev,
            errorMessage: msg.payload.message || 'Failed to join room',
          }));
          return;
        }

        // 4. ROOM_STATE
        if (msg.type === 'ROOM_STATE') {
          const payload = msg.payload;
          setState(prev => {
            const myUpdated = prev.myPlayer
              ? payload.players.find((p: PublicPlayer) => p.id === prev.myPlayer?.id) || prev.myPlayer
              : null;

            // Clear myBet if moving to a new round or lobby
            const isBettingOrPlaying = payload.phase === 'BETTING_WINDOW' || payload.phase === 'MINIGAME_COUNTDOWN' || payload.phase === 'MINIGAME_ACTIVE';
            const preservedBet = isBettingOrPlaying ? prev.myBet : null;

            return {
              ...prev,
              phase: payload.phase,
              roomCode: payload.roomCode,
              players: payload.players,
              totalRounds: payload.totalRounds,
              currentRound: payload.currentRound,
              tournamentSchedule: payload.tournamentSchedule || null,
              roundHistory: payload.roundHistory,
              awards: payload.awards || [],
              myPlayer: myUpdated,
              myBet: preservedBet,
              lastActionFeedback: isBettingOrPlaying ? prev.lastActionFeedback : null,
              lastGameActionError: payload.currentRound?.matchId === prev.currentRound?.matchId ? prev.lastGameActionError : null,
            };
          });
          return;
        }

        // 5. ACTION_RESULT (Authoritative feedback for fighter action)
        if (msg.type === 'ACTION_RESULT') {
          setState(prev => ({
            ...prev,
            lastActionFeedback: msg.payload,
          }));
          return;
        }

        if (msg.type === 'GAME_ACTION_RESULT') {
          setState(prev => ({ ...prev, lastGameActionError: msg.payload.accepted ? null : (msg.payload.reason || 'Action rejected') }));
          return;
        }

        // 6. BET_ACCEPTED
        if (msg.type === 'BET_ACCEPTED') {
          setState(prev => ({
            ...prev,
            myBet: msg.payload.bet,
            lastRejectedBetReason: null,
            myPlayer: prev.myPlayer ? { ...prev.myPlayer, coins: msg.payload.myBankroll } : null,
          }));
          return;
        }

        // 7. BET_REJECTED
        if (msg.type === 'BET_REJECTED') {
          setState(prev => ({
            ...prev,
            lastRejectedBetReason: msg.payload.reason,
          }));
          sound.playBuzzer();
          return;
        }

        // 8. ROOM_CLOSED
        if (msg.type === 'ROOM_CLOSED') {
          setState(prev => ({
            ...prev,
            phase: 'ENTRY',
            roomCode: '',
            currentRound: null,
            myPlayer: null,
            myBet: null,
            lastActionFeedback: null,
            errorMessage: msg.payload.reason || 'The room has been closed.',
          }));
          return;
        }
      } catch (err) {
        console.error('Error handling WS message:', err);
      }
    };

    ws.onclose = () => {
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      const wasInRoom = phaseRef.current !== 'ENTRY';

      setState(prev => ({
        ...prev,
        status: wasInRoom ? 'DISCONNECTED' : 'IDLE',
      }));

      // Reconnect automatically using latest ref state
      if (wasInRoom) {
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          const savedToken = sessionTokenRef.current || localStorage.getItem(SESSION_TOKEN_KEY);
          const currentCode = roomCodeRef.current;
          if (savedToken && currentCode) {
            connectWs(() => {
              send({
                type: 'JOIN_ROOM',
                  payload: { roomCode: currentCode, sessionToken: savedToken, protocolVersion: BRAWL_PROTOCOL_VERSION },
              });
            });
          }
        }, 2000);
      }
    };

    ws.onerror = () => {
      if (!isConnected && attempts <= maxRetries) {
        try { ws.close(); } catch {}
        setTimeout(tryConnect, retryDelay);
        return;
      }
      setState(prev => ({
        ...prev,
        status: 'ERROR',
        errorMessage: options?.retryErrorMessage || "Couldn’t connect to the game.",
      }));
    };
  };

  tryConnect();
}, [resolveWsUrl, send]);

// Actions
const hostGame = useCallback((playerName: string, avatar: string) => {
  localStorage.setItem(PLAYER_NAME_KEY, playerName);
  localStorage.setItem(PLAYER_AVATAR_KEY, avatar);
  setState(prev => ({ ...prev, status: 'CONNECTING', errorMessage: null }));

  const isAndroid = typeof window !== 'undefined' && (
    window.location.protocol === 'file:' ||
    !!(window as unknown as { BetBrawlAndroid?: unknown }).BetBrawlAndroid
  );

  if (isAndroid) {
    // Notify Android native shell to start Host Foreground Service
    const androidBridge = (window as unknown as { BetBrawlAndroid?: { startHosting?: (name: string, av: string) => void } }).BetBrawlAndroid;
    if (androidBridge && typeof androidBridge.startHosting === 'function') {
      androidBridge.startHosting(playerName, avatar);
    }

    // Single application WebSocket with bounded retry while native server starts
    connectWs('ws://127.0.0.1:8080/ws', () => {
      send({
        type: 'CREATE_ROOM',
        payload: { playerName, avatar, debugMode: state.isDebug, protocolVersion: BRAWL_PROTOCOL_VERSION },
      });
    }, {
      maxRetries: 15,
      retryDelayMs: 200,
      retryErrorMessage: 'Failed to start local host service. Please try again.',
    });
  } else {
    // Normal browser flow
    connectWs(undefined, () => {
      send({
        type: 'CREATE_ROOM',
        payload: { playerName, avatar, debugMode: state.isDebug, protocolVersion: BRAWL_PROTOCOL_VERSION },
      });
    });
  }
}, [connectWs, send, state.isDebug]);

  const joinGame = useCallback((roomCode: string, playerName: string, avatar: string, targetHost?: string) => {
    const cleanCode = roomCode.trim().toUpperCase();
    localStorage.setItem(PLAYER_NAME_KEY, playerName);
    localStorage.setItem(PLAYER_AVATAR_KEY, avatar);
    const savedToken = localStorage.getItem(SESSION_TOKEN_KEY) || undefined;
    setState(prev => ({ ...prev, errorMessage: null }));

    // Check if target host was provided or is in cold deep-link URL params or discovered rooms
    const search = typeof window !== 'undefined' ? window.location.search : undefined;
    const globalConfig = typeof window !== 'undefined'
      ? (window as unknown as { BETBRAWL_CONFIG?: { hostIp?: string; discoveredHosts?: Array<{ ip: string; port?: number; roomCode?: string }> } }).BETBRAWL_CONFIG
      : undefined;
    const { hostToConnect } = resolveJoinEndpoint(cleanCode, targetHost, search, discoveredRoomsRef.current, globalConfig);

    const isAndroid = typeof window !== 'undefined' && (
      window.location.protocol === 'file:' ||
      !!(window as unknown as { BetBrawlAndroid?: unknown }).BetBrawlAndroid
    );

    // On Android guest, NEVER default to 127.0.0.1 if room code is unknown!
    if (isAndroid && !hostToConnect) {
      setState(prev => ({
        ...prev,
        status: 'IDLE',
        errorMessage: "Can't find that room on this Wi-Fi. Make sure you're on the same Wi-Fi or scan the host's QR code.",
      }));
      return;
    }

    connectWs(hostToConnect, () => {
      send({
        type: 'JOIN_ROOM',
        payload: { roomCode: cleanCode, playerName, avatar, sessionToken: savedToken, protocolVersion: BRAWL_PROTOCOL_VERSION },
      });
    });
  }, [connectWs, send]);

  const toggleReady = useCallback(() => {
    send({ type: 'TOGGLE_READY' });
  }, [send]);

  const startGame = useCallback(() => {
    send({
      type: 'START_GAME',
    });
  }, [send]);

  const placeBet = useCallback((fighterId: string, amount: number) => {
    setState(prev => ({ ...prev, lastRejectedBetReason: null }));
    send({
      type: 'PLACE_BET',
      payload: { fighterId, amount },
    });
  }, [send]);

  const sendFighterAction = useCallback((action: FighterAction | V2Action) => {
    const round = state.currentRound;
    const stageIndex = round && V2_GAME_IDS.includes(round.miniGame.id as V2GameId) ? round.gameState?.stageIndex : 0;
    if (!round?.matchId || !Number.isInteger(stageIndex)) {
      setState(prev => ({ ...prev, lastGameActionError: 'Game state is not ready yet.' }));
      return;
    }
    send({ type: 'FIGHTER_ACTION', payload: { ...action, matchId: round.matchId,
      stageIndex: stageIndex as number,
      actionId: Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, '0')).join('') } as FighterAction });
  }, [send, state.currentRound]);

  const nextRound = useCallback(() => {
    send({ type: 'NEXT_ROUND' });
  }, [send]);

  const restartGame = useCallback(() => {
    send({ type: 'RESTART_GAME' });
  }, [send]);

  const closeRoom = useCallback(() => {
    send({ type: 'CLOSE_ROOM' });
  }, [send]);

  const addDebugBot = useCallback(() => {
    send({ type: 'DEBUG_ADD_BOT' });
  }, [send]);

  const kickPlayer = useCallback((playerId: string) => {
    send({
      type: 'KICK_PLAYER',
      payload: { playerId },
    });
  }, [send]);

  return {
    ...state,
    hostGame,
    joinGame,
    toggleReady,
    startGame,
    placeBet,
    sendFighterAction,
    nextRound,
    restartGame,
    closeRoom,
    addDebugBot,
    kickPlayer,
  };
}
