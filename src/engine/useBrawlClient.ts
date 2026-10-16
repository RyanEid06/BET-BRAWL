/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Client WebSocket Engine & Local Storage Session Hook
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  Player,
  RoundState,
  GamePhase,
  Award,
  ClientMessage,
  ServerMessage,
  RoomNetworkInfo,
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
  myPlayer: Player | null;
  phase: GamePhase;
  roomCode: string;
  players: Player[];
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
      phase: 'ENTRY',
      roomCode: '',
      players: [],
      totalRounds: 8,
      currentRound: null,
      roundHistory: [],
      awards: [],
      lastRejectedBetReason: null,
      isDebug,
    };
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
          },
        }));
      });
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Connect WebSocket
  const connectWs = useCallback((onConnected?: () => void) => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
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

      // Start ping heartbeat
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'PING' }));
        }
      }, 10000);
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);

        if (msg.type === 'PONG') return;

        if (msg.type === 'JOIN_SUCCESS') {
          const { player, sessionToken, roomCode, isHost } = msg.payload;
          localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
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

        if (msg.type === 'JOIN_ERROR') {
          setState(prev => ({
            ...prev,
            errorMessage: msg.payload.message || 'Failed to join room',
          }));
          return;
        }

        if (msg.type === 'ROOM_STATE') {
          const payload = msg.payload;
          setState(prev => {
            const myUpdated = prev.myPlayer
              ? payload.players.find((p: Player) => p.id === prev.myPlayer?.id) || prev.myPlayer
              : null;

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
            };
          });
          return;
        }

        if (msg.type === 'BET_REJECTED') {
          setState(prev => ({
            ...prev,
            lastRejectedBetReason: msg.payload.reason,
          }));
          sound.playBuzzer();
          return;
        }
      } catch (err) {
        console.error('Error handling WS message:', err);
      }
    };

    ws.onclose = () => {
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      setState(prev => ({
        ...prev,
        status: prev.phase !== 'ENTRY' ? 'DISCONNECTED' : 'IDLE',
      }));

      // Try reconnecting after 3 seconds if inside a room
      if (state.phase !== 'ENTRY') {
        reconnectTimeoutRef.current = setTimeout(() => {
          const savedToken = localStorage.getItem(SESSION_TOKEN_KEY);
          if (savedToken && state.roomCode) {
            connectWs(() => {
              send({
                type: 'JOIN_ROOM',
                payload: { roomCode: state.roomCode, sessionToken: savedToken },
              });
            });
          }
        }, 3000);
      }
    };

    ws.onerror = () => {
      setState(prev => ({ ...prev, status: 'ERROR', errorMessage: 'WebSocket connection failed' }));
    };
  }, [state.phase, state.roomCode, send]);

  // Actions
  const hostGame = useCallback((playerName: string, avatar: string) => {
    localStorage.setItem(PLAYER_NAME_KEY, playerName);
    localStorage.setItem(PLAYER_AVATAR_KEY, avatar);

    connectWs(() => {
      send({
        type: 'CREATE_ROOM' as any,
        payload: { playerName, avatar },
      });
    });
  }, [connectWs, send]);

  const joinGame = useCallback((roomCode: string, playerName: string, avatar: string) => {
    localStorage.setItem(PLAYER_NAME_KEY, playerName);
    localStorage.setItem(PLAYER_AVATAR_KEY, avatar);
    const savedToken = localStorage.getItem(SESSION_TOKEN_KEY) || undefined;

    connectWs(() => {
      send({
        type: 'JOIN_ROOM',
        payload: { roomCode: roomCode.trim().toUpperCase(), playerName, avatar, sessionToken: savedToken },
      });
    });
  }, [connectWs, send]);

  const toggleReady = useCallback(() => {
    send({ type: 'TOGGLE_READY' });
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

  const sendFighterInput = useCallback((action: string, value?: number | string | boolean) => {
    send({
      type: 'FIGHTER_INPUT',
      payload: { action, value, timestamp: Date.now() },
    });
  }, [send]);

  const nextRound = useCallback(() => {
    send({ type: 'NEXT_ROUND' });
  }, [send]);

  const restartGame = useCallback(() => {
    send({ type: 'RESTART_GAME' });
  }, [send]);

  const addDebugBot = useCallback(() => {
    send({ type: 'DEBUG_ADD_BOT' as any });
  }, [send]);

  return {
    ...state,
    hostGame,
    joinGame,
    toggleReady,
    startGame,
    placeBet,
    sendFighterInput,
    nextRound,
    restartGame,
    addDebugBot,
  };
}
