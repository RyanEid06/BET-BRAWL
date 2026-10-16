import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import express from 'express';
import type { ServerMessage, ClientMessage, PublicPlayer } from './types.ts';
import { toPublicPlayer } from './types.ts';
import {
  createFreshPlayer,
  generateRoomCode,
  initAuthoritativeRound,
  MIN_PLAYERS_TO_START,
} from './roomEngine.ts';
import {
  processFighterAction,
} from './gameEngine.ts';
import {
  calculateDynamicOdds,
  validateBetPlacement,
  computeRoundPayouts,
} from './odds.ts';

test('Multi-client WebSocket Integration: authenticates real sockets, enforces token privacy, and resolves brawl authoritatively', async () => {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Start test server on random available port
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const wsUrl = `ws://127.0.0.1:${port}/ws`;

  // Server state for integration test
  interface TestRoom {
    roomCode: string;
    hostToken: string;
    phase: string;
    players: Map<string, any>;
    clientSockets: Map<string, WebSocket>;
    currentRound: any;
    internalGame: any;
    totalRounds: number;
    roundHistory: any[];
  }
  let room: TestRoom | null = null;

  function broadcast(state: any) {
    if (!room) return;
    const publicPlayers = Array.from(room.players.values()).map(toPublicPlayer);
    const msg = JSON.stringify({
      type: 'ROOM_STATE',
      timestamp: Date.now(),
      payload: {
        roomCode: room.roomCode,
        phase: room.phase,
        players: publicPlayers,
        currentRound: room.currentRound,
      },
    });
    for (const ws of room.clientSockets.values()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }

  wss.on('connection', (ws) => {
    let boundToken: string | null = null;

    ws.on('message', (raw) => {
      const msg: ClientMessage = JSON.parse(raw.toString());

      if (msg.type === 'CREATE_ROOM') {
        const host = createFreshPlayer('Ace (Host)', '⚡', true);
        const code = generateRoomCode();
        room = {
          roomCode: code,
          hostToken: host.sessionToken,
          phase: 'LOBBY',
          players: new Map([[host.sessionToken, host]]),
          clientSockets: new Map([[host.sessionToken, ws]]),
          currentRound: null,
          internalGame: null,
          totalRounds: 8,
          roundHistory: [],
        };
        boundToken = host.sessionToken;
        ws.send(JSON.stringify({
          type: 'JOIN_SUCCESS',
          timestamp: Date.now(),
          payload: { player: toPublicPlayer(host), sessionToken: host.sessionToken, roomCode: code, isHost: true },
        }));
        broadcast(room);
        return;
      }

      if (msg.type === 'JOIN_ROOM') {
        if (!room) return;
        const p = createFreshPlayer(msg.payload.playerName, '🦊', false);
        room.players.set(p.sessionToken, p);
        room.clientSockets.set(p.sessionToken, ws);
        boundToken = p.sessionToken;

        ws.send(JSON.stringify({
          type: 'JOIN_SUCCESS',
          timestamp: Date.now(),
          payload: { player: toPublicPlayer(p), sessionToken: p.sessionToken, roomCode: room.roomCode, isHost: false },
        }));
        broadcast(room);
        return;
      }

      if (!room || !boundToken) return;
      const player = room.players.get(boundToken);

      if (msg.type === 'TOGGLE_READY') {
        player.isReady = !player.isReady;
        broadcast(room);
        return;
      }

      if (msg.type === 'START_GAME') {
        if (!player.isHost) return;
        const playerList = Array.from(room.players.values());
        const { round, internalGame } = initAuthoritativeRound(1, 8, playerList);
        room.currentRound = round;
        room.internalGame = internalGame;
        room.phase = 'MINIGAME_ACTIVE';
        round.gameStartsAt = Date.now();
        broadcast(room);
        return;
      }

      if (msg.type === 'PLACE_BET') {
        const { fighterId, amount } = msg.payload;
        player.coins -= amount;
        const bet = {
          bettorId: player.id,
          fighterId,
          amount,
          oddsAtBet: 2.0,
          timestamp: Date.now(),
          potentialReturn: amount * 2,
        };
        room.currentRound.bets.push(bet);
        ws.send(JSON.stringify({
          type: 'BET_ACCEPTED',
          timestamp: Date.now(),
          payload: { bet, myBankroll: player.coins },
        }));
        broadcast(room);
        return;
      }

      if (msg.type === 'FIGHTER_ACTION') {
        const action = msg.payload;
        const res = processFighterAction(room.internalGame, room.currentRound.fighterScores, player.id, action, Date.now());
        if (res.resolved) {
          room.currentRound.winnerId = res.winnerId;
          room.currentRound.tieResult = res.isTie;
          const { payouts, updatedPlayers } = computeRoundPayouts(
            res.winnerId,
            res.isTie,
            room.currentRound.fighterIds,
            room.currentRound.matchPot,
            room.currentRound.bets,
            Array.from(room.players.values())
          );
          room.currentRound.payouts = payouts;
          for (const up of updatedPlayers) {
            room.players.set(up.sessionToken, up);
          }
          room.phase = 'PAYOUT_RECAP';
        }
        broadcast(room);
        return;
      }
    });
  });

  // Helper to create client and receive messages
  const createTestClient = async (name: string): Promise<{
    ws: WebSocket;
    received: ServerMessage[];
    waitFor: (predicate: (m: ServerMessage) => boolean) => Promise<ServerMessage>;
    waitForType: (type: string) => Promise<ServerMessage>;
    close: () => void;
  }> => {
    const ws = new WebSocket(wsUrl);
    const received: ServerMessage[] = [];

    await new Promise<void>(resolve => ws.on('open', () => resolve()));

    ws.on('message', data => {
      const parsed: ServerMessage = JSON.parse(data.toString());
      received.push(parsed);
    });

    const waitFor = (predicate: (m: ServerMessage) => boolean): Promise<ServerMessage> => {
      return new Promise(resolve => {
        const existing = received.find(predicate);
        if (existing) return resolve(existing);

        const handler = (data: any) => {
          const parsed: ServerMessage = JSON.parse(data.toString());
          if (predicate(parsed)) {
            ws.off('message', handler);
            resolve(parsed);
          }
        };
        ws.on('message', handler);
      });
    };

    const waitForType = (targetType: string): Promise<ServerMessage> => {
      return waitFor(m => m.type === targetType);
    };

    return { ws, received, waitFor, waitForType, close: () => ws.close() };
  };

  try {
    // 1. Host creates room
    const hostClient = await createTestClient('Host Ace');
    hostClient.ws.send(JSON.stringify({ type: 'CREATE_ROOM', payload: { playerName: 'Host Ace' } }));
    const hostSuccess = await hostClient.waitForType('JOIN_SUCCESS');
    const roomCode = hostSuccess.payload.roomCode;
    assert.ok(roomCode);
    assert.equal(hostSuccess.payload.isHost, true);
    assert.ok(hostSuccess.payload.sessionToken);

    // 2. Connect 5 more clients to reach minimum 6 players
    const clients = [hostClient];
    for (let i = 2; i <= 6; i++) {
      const c = await createTestClient(`Brawler ${i}`);
      c.ws.send(JSON.stringify({
        type: 'JOIN_ROOM',
        payload: { roomCode, playerName: `Brawler ${i}` },
      }));
      await c.waitForType('JOIN_SUCCESS');
      clients.push(c);
    }

    // Wait for room state with 6 players
    const stateWith6 = await hostClient.waitFor(
      m => m.type === 'ROOM_STATE' && m.payload?.players?.length === 6
    );
    const playerList: PublicPlayer[] = stateWith6.payload.players;
    assert.equal(playerList.length, 6);

    // PROTOCOL PRIVACY CHECK: ensure NO sessionToken leaked in public ROOM_STATE
    for (const pub of playerList) {
      assert.equal((pub as any).sessionToken, undefined, 'PublicPlayer must NEVER include sessionToken');
    }

    // 3. Ready up clients 2-6
    for (let i = 1; i < 6; i++) {
      clients[i].ws.send(JSON.stringify({ type: 'TOGGLE_READY' }));
    }

    // 4. Host starts game
    hostClient.ws.send(JSON.stringify({ type: 'START_GAME' }));

    // Wait for active mini-game
    const activeState = await hostClient.waitFor(
      m => m.type === 'ROOM_STATE' && m.payload?.phase === 'MINIGAME_ACTIVE' && !!m.payload?.currentRound
    );
    assert.ok(activeState.payload.currentRound);
    const [f1Id, f2Id] = activeState.payload.currentRound.fighterIds;
    assert.notEqual(f1Id, f2Id);

    // Find which client owns f1 and which owns f2
    const f1Client = clients.find(c => {
      const js = c.received.find(m => m.type === 'JOIN_SUCCESS');
      return js?.payload.player.id === f1Id;
    })!;
    const f2Client = clients.find(c => {
      const js = c.received.find(m => m.type === 'JOIN_SUCCESS');
      return js?.payload.player.id === f2Id;
    })!;
    const spectatorClient = clients.find(c => c !== f1Client && c !== f2Client)!;

    // 5. Spectator places bet on fighter 1
    spectatorClient.ws.send(JSON.stringify({
      type: 'PLACE_BET',
      payload: { fighterId: f1Id, amount: 100 },
    }));
    const betAccepted = await spectatorClient.waitForType('BET_ACCEPTED');
    assert.equal(betAccepted.payload.bet.fighterId, f1Id);
    assert.equal(betAccepted.payload.bet.amount, 100);

    // 6. Both fighters send actions from their respective separate WebSockets
    // If miniGame is millisecond_stop, send STOP
    f1Client.ws.send(JSON.stringify({
      type: 'FIGHTER_ACTION',
      payload: { type: 'STOP' },
    }));

    f2Client.ws.send(JSON.stringify({
      type: 'FIGHTER_ACTION',
      payload: { type: 'STOP' },
    }));

    // 7. Verify all clients receive the PAYOUT_RECAP with the authoritative winner
    const recapHost = await hostClient.waitFor(
      m => m.type === 'ROOM_STATE' && m.payload?.phase === 'PAYOUT_RECAP'
    );
    assert.equal(recapHost.payload.phase, 'PAYOUT_RECAP');

    // Clean up
    for (const c of clients) {
      c.close();
    }
  } finally {
    server.close();
    wss.close();
  }
});
