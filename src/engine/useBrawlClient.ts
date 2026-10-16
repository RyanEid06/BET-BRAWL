/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Client WebSocket Engine, Reconnect & Time Synchronization
 */

import { useState, useEffect, useRef, useCallback } from 'react';
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
} from './types.ts';
import { sound } from './audio.ts';

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
  roundHistory: Array<{
    roundNumber: number;
    miniGameName: string;
    winnerName: string;
    totalPotWon: number;
  }>;
  awards: Award[];
  lastRejectedBetReason: string | null;
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
      totalRounds: 8,
      currentRound: null,
      roundHistory: [],
      awards: [],
      lastRejectedBetReason: null,
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

  // Load network info on mount
  useEffect(() => {
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
        // Fallback to window.location
        const port = window.location.port ? parseInt(window.location.port, 10) : 3000;
        setState(prev => ({
          ...prev,
          networkInfo: {
            localIp: window.location.hostname || '127.0.0.1',
            port,
            roomCode: '',
            fullJoinUrl: window.location.origin,
            hasActiveRoom: false,
            playerCount: 0,
            candidateUrls: [window.location.origin],
          },
        }));
      });
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Connect WebSocket with immediate callback if already open
  const connectWs = useCallback((onConnected?: () => void) => {
    // If socket is already OPEN, invoke the callback immediately!
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      if (onConnected) onConnected();
      return;
    }

    // If socket is CONNECTING, wait for it
    if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
      const checkInterval = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          clearInterval(checkInterval);
          if (onConnected) onConnected();
        } else if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          clearInterval(checkInterval);
        }
      }, 50);
      return;
    }

    setState(prev => ({ ...prev, status: 'CONNECTING', errorMessage: null }));

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setState(prev => ({ ...prev, status: 'CONNECTED', errorMessage: null }));
      if (onConnected) onConnected();

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
              roundHistory: payload.roundHistory,
              awards: payload.awards || [],
              myPlayer: myUpdated,
              myBet: preservedBet,
            };
          });
          return;
        }

        // 5. BET_ACCEPTED
        if (msg.type === 'BET_ACCEPTED') {
          setState(prev => ({
            ...prev,
            myBet: msg.payload.bet,
            lastRejectedBetReason: null,
            myPlayer: prev.myPlayer ? { ...prev.myPlayer, coins: msg.payload.myBankroll } : null,
          }));
          return;
        }

        // 6. BET_REJECTED
        if (msg.type === 'BET_REJECTED') {
          setState(prev => ({
            ...prev,
            lastRejectedBetReason: msg.payload.reason,
          }));
          sound.playBuzzer();
          return;
        }

        // 7. ROOM_CLOSED
        if (msg.type === 'ROOM_CLOSED') {
          setState(prev => ({
            ...prev,
            phase: 'ENTRY',
            roomCode: '',
            currentRound: null,
            myPlayer: null,
            myBet: null,
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
                payload: { roomCode: currentCode, sessionToken: savedToken },
              });
            });
          }
        }, 2000);
      }
    };

    ws.onerror = () => {
      setState(prev => ({ ...prev, status: 'ERROR', errorMessage: 'WebSocket connection failed' }));
    };
  }, [send]);

  // Actions
  const hostGame = useCallback((playerName: string, avatar: string) => {
    localStorage.setItem(PLAYER_NAME_KEY, playerName);
    localStorage.setItem(PLAYER_AVATAR_KEY, avatar);
    setState(prev => ({ ...prev, errorMessage: null }));

    connectWs(() => {
      send({
        type: 'CREATE_ROOM',
        payload: { playerName, avatar, debugMode: state.isDebug },
      });
    });
  }, [connectWs, send, state.isDebug]);

  const joinGame = useCallback((roomCode: string, playerName: string, avatar: string) => {
    const cleanCode = roomCode.trim().toUpperCase();
    localStorage.setItem(PLAYER_NAME_KEY, playerName);
    localStorage.setItem(PLAYER_AVATAR_KEY, avatar);
    const savedToken = localStorage.getItem(SESSION_TOKEN_KEY) || undefined;
    setState(prev => ({ ...prev, errorMessage: null }));

    connectWs(() => {
      send({
        type: 'JOIN_ROOM',
        payload: { roomCode: cleanCode, playerName, avatar, sessionToken: savedToken },
      });
    });
  }, [connectWs, send]);

  const toggleReady = useCallback(() => {
    send({ type: 'TOGGLE_READY' });
  }, [send]);

  const setMatchLength = useCallback((totalRounds: 8 | 10) => {
    send({
      type: 'SET_MATCH_LENGTH',
      payload: { totalRounds },
    });
  }, [send]);

  const startGame = useCallback(() => {
    send({
      type: 'START_GAME',
      payload: { debug: state.isDebug },
    });
  }, [send, state.isDebug]);

  const placeBet = useCallback((fighterId: string, amount: number) => {
    setState(prev => ({ ...prev, lastRejectedBetReason: null }));
    send({
      type: 'PLACE_BET',
      payload: { fighterId, amount },
    });
  }, [send]);

  const sendFighterAction = useCallback((action: FighterAction) => {
    send({
      type: 'FIGHTER_ACTION',
      payload: action,
    });
  }, [send]);

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
    setMatchLength,
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
