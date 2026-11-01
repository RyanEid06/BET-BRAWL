// Synthetic transport permits delayed/batched acknowledgements and reconnect boundaries.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { useBrawlClient } from '../../src/engine/useBrawlClient';
import { V2GameView } from '../../src/components/games/V2GameView';
import { PayoutRecapModal } from '../../src/components/PayoutRecapModal';
import { initV2Game, advanceV2Game, projectV2Game, processV2Action } from '../../src/engine/v2Games';
import { MINI_GAMES } from '../../src/engine/miniGamesCatalog';
import '../../src/index.css';
import '../../src/components/games/V2GameView.css';

const root = createRoot(document.getElementById('root')!);
const players: any[] = ['Alexandra', 'Benjamin', 'Casey'].map((name, i) => ({ id: ['a','b','c'][i], name, avatar: ['🦊','🐻','🐸'][i], color: '#06b6d4', isHost: i === 0, isReady: true, connected: true, coins: 1000, matchesWon: 0, matchesPlayed: 0, totalBetsPlaced: 0, totalBetsWon: 0, totalCoinsWonInBets: 0, totalCoinsLostInBets: 0, highestSingleBet: 0, highestSinglePayout: 0, qualifierPoints: 0, qualifierWins: 0, qualifierTies: 0, qualifierLosses: 0, qualifierMatchesPlayed: 0 }));
let authority: any, now: number, match = 0;
const api: any = { queue: [], reads: 0, next: 0 };
class Socket {
  static OPEN = 1; static CLOSED = 3; static CONNECTING = 0;
  readyState = 0;
  onopen: any; onmessage: any; onclose: any; onerror: any;
  constructor() { api.socket = this; }
  send(raw: string) { const message = JSON.parse(raw); if (message.type === 'FIGHTER_ACTION') api.queue.push(message.payload); }
  close() { this.readyState = 3; this.onclose?.({}); }
}
(window as any).WebSocket = Socket;
function emit(type: string, payload: any) { api.socket.onmessage({ data: JSON.stringify({ type, payload, timestamp: now }) }); }
function round() {
  const view = projectV2Game(authority, 'a', now);
  Object.defineProperty(view.config, 'pipeKinds', { enumerable: true, configurable: true, get: () => { api.reads++; return authority.data.pipeKinds; } });
  return { roundNumber: 1, maxRounds: 6, matchId: `match-${match}`, fighterIds: ['a','b'], miniGame: MINI_GAMES[authority.id as keyof typeof MINI_GAMES], gameConfig: view.config, gameState: view.state, fighterScores: view.scores, gameStartsAt: authority.startsAt, gameEndsAt: authority.endsAt, matchPot: 500, payouts: [], resolutionReason: 'PLAYED' };
}
api.state = (phase = 'MINIGAME_ACTIVE') => ({ phase, roomCode: 'UITEST', players, totalRounds: 6, currentRound: round(), tournamentSchedule: null, roundHistory: [], awards: [] });
api.snapshot = () => emit('ROOM_STATE', api.state());
api.open = () => { api.socket.readyState = 1; api.socket.onopen(); };
api.join = () => { emit('JOIN_SUCCESS', { player: players[0], sessionToken: 'synthetic', roomCode: 'UITEST', isHost: true, protocolVersion: 2 }); api.snapshot(); };
api.reset = (id: any) => { match++; authority = initV2Game(id, ['a','b'], Date.now()); now = authority.startsAt + (id === 'memory_heist' ? 4001 : 1); advanceV2Game(authority, now); api.queue = []; api.snapshot(); };
api.flush = (count = api.queue.length) => {
  for (const action of api.queue.splice(0, count)) { const result = processV2Action(authority, 'a', action, now); emit('GAME_ACTION_RESULT', { ...action, ...result }); }
  api.snapshot();
};
api.reject = () => { const action = api.queue.shift(); emit('GAME_ACTION_RESULT', { ...action, accepted: false, reason: 'Synthetic rejection' }); api.snapshot(); };
api.ack = (result: any) => emit('GAME_ACTION_RESULT', result);
api.failJoin = () => emit('JOIN_ERROR', { code: 'ROOM_NOT_FOUND', message: 'Room no longer exists. Create or join another room.' });
api.remount = () => root.render(<Harness key={++match} />);
api.step = (ms: number) => { now += ms; advanceV2Game(authority, now); api.snapshot(); };
api.solve = () => { authority.data.players.a.solved = true; api.snapshot(); };
api.payout = () => { advanceV2Game(authority, authority.endsAt); const r = { ...round(), winnerId: null, tieResult: true }; root.render(<PayoutRecapModal key={match} round={r as any} players={players} myPlayer={players[0]} isHost isFinalRound={false} onNextRound={() => api.next++} />); };

function Harness() {
  const client = useBrawlClient(); api.client = client;
  const current = client.currentRound;
  return <div style={{ padding: 12 }}>
    {current && <V2GameView key={current.matchId} gameId={current.miniGame.id as any} gameConfig={current.gameConfig!} gameState={current.gameState!} fighterA={players[0]} fighterB={players[1]} myPlayerId="a" serverTimeOffset={now - Date.now()} connected={client.status === 'CONNECTED'} reconciliationEpoch={client.reconciliationEpoch} onSendAction={client.sendFighterAction} />}
    {client.lastGameActionError && <p role="alert">{client.lastGameActionError}</p>}
  </div>;
}
(window as any).__regression = api;
root.render(<Harness />);
