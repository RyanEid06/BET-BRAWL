/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Genuine Production Server Multi-Client WebSocket Integration Tests
 * Exercises the ACTUAL production server handlers created by createBrawlServer.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createBrawlServer } from '../../server.ts';
import type { ServerMessage, PublicRoomState } from './types.ts';

// Helper to spawn a connected WebSocket client with message wait utilities
async function createTestWsClient(wsUrl: string) {
  const ws = new WebSocket(wsUrl);
  const received: ServerMessage[] = [];

  await new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('error', reject);
  });

  ws.on('message', (data) => {
    try {
      const parsed: ServerMessage = JSON.parse(data.toString());
      received.push(parsed);
    } catch {
      // ignore
    }
  });

  const waitFor = (predicate: (m: ServerMessage) => boolean, timeoutMs = 4000): Promise<ServerMessage> => {
    return new Promise((resolve, reject) => {
      const existing = received.find(predicate);
      if (existing) return resolve(existing);

      const timer = setTimeout(() => {
        ws.off('message', handler);
        reject(new Error(`Timed out waiting for message after ${timeoutMs}ms. Received: ${received.map(m => m.type).join(', ')}`));
      }, timeoutMs);

      const handler = (data: any) => {
        try {
          const parsed: ServerMessage = JSON.parse(data.toString());
          if (predicate(parsed)) {
            clearTimeout(timer);
            ws.off('message', handler);
            resolve(parsed);
          }
        } catch {
          // ignore
        }
      };

      ws.on('message', handler);
    });
  };

  const waitForType = <T extends ServerMessage['type']>(
    targetType: T,
    timeoutMs = 4000
  ): Promise<Extract<ServerMessage, { type: T }>> => {
    return waitFor(m => m.type === targetType, timeoutMs) as Promise<Extract<ServerMessage, { type: T }>>;
  };

  const waitForRoomState = (
    predicate: (payload: PublicRoomState) => boolean,
    timeoutMs = 4000
  ): Promise<Extract<ServerMessage, { type: 'ROOM_STATE' }>> => {
    return waitFor(m => m.type === 'ROOM_STATE' && predicate(m.payload), timeoutMs) as Promise<Extract<ServerMessage, { type: 'ROOM_STATE' }>>;
  };

  const close = () => {
    try {
      ws.close();
    } catch {
      // ignore
    }
  };

  return { ws, received, waitFor, waitForType, waitForRoomState, close };
}

test('Production Server Integration: full 6-player lifecycle on actual server handlers', async () => {
  // Use fast timing for snappy, reliable integration tests
  const server = createBrawlServer({
    timingConfig: {
      revealDurationMs: 150,
      bettingDurationSeconds: 1,
      countdownDurationMs: 150,
      fighterGraceMs: 500,
      hostGraceMs: 800,
      staleSeatGraceMs: 500,
    },
  });

  const { port } = await server.listen(0, '127.0.0.1');
  const wsUrl = `ws://127.0.0.1:${port}/ws`;

  const allClients: Array<Awaited<ReturnType<typeof createTestWsClient>>> = [];

  try {
    // 1. Host creates room
    const host = await createTestWsClient(wsUrl);
    allClients.push(host);

    host.ws.send(JSON.stringify({
      type: 'CREATE_ROOM',
      payload: { playerName: 'Host Ace', avatar: '⚡' },
    }));

    const hostJoin = await host.waitForType('JOIN_SUCCESS');
    const roomCode = hostJoin.payload.roomCode;
    const hostSessionToken = hostJoin.payload.sessionToken;

    assert.ok(roomCode);
    assert.equal(hostJoin.payload.isHost, true);
    assert.ok(hostSessionToken.startsWith('tok_'));

    // Verify room state received by host
    const initialState = await host.waitForRoomState(s => s.roomCode === roomCode);
    assert.equal(initialState.payload.phase, 'LOBBY');
    assert.equal(initialState.payload.players.length, 1);

    // 2. Connect 5 additional clients to reach 6 players (minimum for normal match)
    for (let i = 2; i <= 6; i++) {
      const client = await createTestWsClient(wsUrl);
      allClients.push(client);

      client.ws.send(JSON.stringify({
        type: 'JOIN_ROOM',
        payload: { roomCode, playerName: `Player ${i}`, avatar: '🦊' },
      }));

      const joinSuccess = await client.waitForType('JOIN_SUCCESS');
      assert.equal(joinSuccess.payload.isHost, false);
      assert.ok(joinSuccess.payload.sessionToken.startsWith('tok_'));
    }

    // Wait for all 6 clients in room state
    const sixPlayerState = await host.waitForRoomState(s => s.players?.length === 6);
    assert.equal(sixPlayerState.payload.players.length, 6);

    // SECURITY CHECK: Ensure sessionToken is NEVER leaked in public room state
    for (const p of sixPlayerState.payload.players) {
      assert.equal((p as any).sessionToken, undefined, 'PublicPlayer must NEVER include sessionToken');
    }

    // 3. Security: Non-host client CANNOT start game
    const nonHost = allClients[1];
    nonHost.ws.send(JSON.stringify({ type: 'START_GAME' }));
    const notHostErr = await nonHost.waitForType('JOIN_ERROR');
    assert.equal(notHostErr.payload.code, 'NOT_HOST');

    // 4. Normal host cannot start before all players are ready
    host.ws.send(JSON.stringify({ type: 'START_GAME' }));
    const notReadyErr = await host.waitForType('JOIN_ERROR');
    assert.equal(notReadyErr.payload.code, 'NOT_ALL_READY');

    // 5. Toggle ready for all non-host players
    for (let i = 1; i < 6; i++) {
      allClients[i].ws.send(JSON.stringify({ type: 'TOGGLE_READY' }));
    }

    // Wait until all 6 players are ready (or host)
    await host.waitForRoomState(s => {
      const players = s.players || [];
      return players.length === 6 && players.every(p => p.isReady || p.isHost);
    });

    // 6. Host starts game
    host.ws.send(JSON.stringify({ type: 'START_GAME' }));

    // Progresses to FIGHTER_REVEAL
    const revealState = await host.waitForRoomState(s => s.phase === 'FIGHTER_REVEAL');
    assert.ok(revealState.payload.currentRound);
    const [f1Id, f2Id] = revealState.payload.currentRound.fighterIds;
    assert.notEqual(f1Id, f2Id);

    // Progresses automatically to BETTING_WINDOW
    const bettingState = await host.waitForRoomState(s => s.phase === 'BETTING_WINDOW');
    assert.equal(bettingState.payload.phase, 'BETTING_WINDOW');

    // PRIVACY CHECK: Secret bets array must be empty during betting window!
    assert.deepEqual(bettingState.payload.currentRound?.bets, []);

    // 7. Find a spectator client and place a bet
    const spectatorClient = allClients.find(c => {
      const js = c.received.find(m => m.type === 'JOIN_SUCCESS');
      const pid = (js as any)?.payload.player.id;
      return pid !== f1Id && pid !== f2Id;
    })!;

    spectatorClient.ws.send(JSON.stringify({
      type: 'PLACE_BET',
      payload: { fighterId: f1Id, amount: 100 },
    }));

    const betAccepted = await spectatorClient.waitForType('BET_ACCEPTED');
    assert.equal(betAccepted.payload.bet.fighterId, f1Id);
    assert.equal(betAccepted.payload.bet.amount, 100);

    // 8. Progresses to MINIGAME_COUNTDOWN then MINIGAME_ACTIVE
    const activeState = await host.waitForRoomState(s => s.phase === 'MINIGAME_ACTIVE');
    assert.equal(activeState.payload.phase, 'MINIGAME_ACTIVE');

    // PRIVACY CHECK: Secret bets array must STILL be empty during active mini-game!
    assert.deepEqual(activeState.payload.currentRound?.bets, []);

    // 9. Both fighters send actions
    const f1Client = allClients.find(c => {
      const js = c.received.find(m => m.type === 'JOIN_SUCCESS');
      return (js as any)?.payload.player.id === f1Id;
    })!;
    const f2Client = allClients.find(c => {
      const js = c.received.find(m => m.type === 'JOIN_SUCCESS');
      return (js as any)?.payload.player.id === f2Id;
    })!;

    // Send actions appropriate for the active mini-game
    const miniGameId = activeState.payload.currentRound!.miniGame.id;
    if (miniGameId === 'millisecond_stop') {
      f1Client.ws.send(JSON.stringify({ type: 'FIGHTER_ACTION', payload: { type: 'STOP' } }));
      f2Client.ws.send(JSON.stringify({ type: 'FIGHTER_ACTION', payload: { type: 'STOP' } }));
    } else if (miniGameId === 'speed_math') {
      const answers = (server.getActiveRoom()?.internalGameState?.speedMath?.correctAnswers) || [0, 0, 0];
      f1Client.ws.send(JSON.stringify({ type: 'FIGHTER_ACTION', payload: { type: 'ANSWER', questionIndex: 0, answer: answers[0] } }));
      f1Client.ws.send(JSON.stringify({ type: 'FIGHTER_ACTION', payload: { type: 'ANSWER', questionIndex: 1, answer: answers[1] } }));
      f1Client.ws.send(JSON.stringify({ type: 'FIGHTER_ACTION', payload: { type: 'ANSWER', questionIndex: 2, answer: answers[2] } }));
    } else {
      f1Client.ws.send(JSON.stringify({ type: 'FIGHTER_ACTION', payload: { type: 'TAP' } }));
    }

    // 10. Round resolves to PAYOUT_RECAP and all clients receive identical state
    const recapState = await host.waitForRoomState(s => s.phase === 'PAYOUT_RECAP', 12000);
    assert.equal(recapState.payload.phase, 'PAYOUT_RECAP');
    assert.ok(recapState.payload.currentRound?.payouts.length! >= 1);

    // At recap, bets are revealed in recap state
    assert.ok(recapState.payload.currentRound?.bets.length! >= 1);

    // 11. Host triggers NEXT_ROUND
    host.ws.send(JSON.stringify({ type: 'NEXT_ROUND' }));
    const round2State = await host.waitForRoomState(s => s.phase === 'FIGHTER_REVEAL' || s.phase === 'BETTING_WINDOW');
    assert.ok(round2State.payload.currentRound);

    // 12. Security: An unauthorized new client cannot destroy the active room via CREATE_ROOM
    const rogue = await createTestWsClient(wsUrl);
    allClients.push(rogue);
    rogue.ws.send(JSON.stringify({
      type: 'CREATE_ROOM',
      payload: { playerName: 'Rogue', avatar: '💀' },
    }));
    const rogueErr = await rogue.waitForType('JOIN_ERROR');
    assert.equal(rogueErr.payload.code, 'ROOM_ALREADY_ACTIVE');

    // 13. Host closes room -> CLOSE_ROOM reaches all clients
    host.ws.send(JSON.stringify({ type: 'CLOSE_ROOM' }));
    const closedMsg = await nonHost.waitForType('ROOM_CLOSED');
    assert.ok(closedMsg.payload.reason.includes('closed'));
  } finally {
    for (const c of allClients) c.close();
    await server.close();
  }
});

test('Production Server: old-socket reconnect race safety', async () => {
  const server = createBrawlServer();
  const { port } = await server.listen(0, '127.0.0.1');
  const wsUrl = `ws://127.0.0.1:${port}/ws`;

  try {
    // 1. Host creates room
    const host = await createTestWsClient(wsUrl);
    host.ws.send(JSON.stringify({ type: 'CREATE_ROOM', payload: { playerName: 'Host' } }));
    const hostJoin = await host.waitForType('JOIN_SUCCESS');
    const roomCode = hostJoin.payload.roomCode;

    // 2. Player joins on Socket 1
    const socket1 = await createTestWsClient(wsUrl);
    socket1.ws.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { roomCode, playerName: 'ReconnectTester' } }));
    const pJoin = await socket1.waitForType('JOIN_SUCCESS');
    const token = pJoin.payload.sessionToken;

    // 3. Socket 2 reconnects using same token BEFORE socket 1 closes
    const socket2 = await createTestWsClient(wsUrl);
    socket2.ws.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { roomCode, sessionToken: token } }));
    const reconSuccess = await socket2.waitForType('JOIN_SUCCESS');
    assert.equal(reconSuccess.payload.sessionToken, token);

    // 4. Socket 1 closes now
    socket1.close();
    await new Promise(r => setTimeout(r, 80));

    // 5. Player must still be connected through Socket 2!
    const room = server.getActiveRoom()!;
    const player = room.players.get(token)!;
    assert.equal(player.connected, true, 'Player must remain connected through socket 2 after socket 1 closes');
    assert.equal(room.players.size, 2, 'No duplicate players created');

    socket2.close();
    host.close();
  } finally {
    await server.close();
  }
});

test('Production Server: host reconnect grace timer survives mini-game resolution', async () => {
  const server = createBrawlServer({
    timingConfig: {
      revealDurationMs: 100,
      bettingDurationSeconds: 1,
      countdownDurationMs: 100,
      fighterGraceMs: 200,
      hostGraceMs: 600,
    },
  });

  const { port } = await server.listen(0, '127.0.0.1');
  const wsUrl = `ws://127.0.0.1:${port}/ws`;
  const clients: Array<Awaited<ReturnType<typeof createTestWsClient>>> = [];

  try {
    // Create debug room so we can test with 2 players
    const host = await createTestWsClient(wsUrl);
    clients.push(host);
    host.ws.send(JSON.stringify({ type: 'CREATE_ROOM', payload: { playerName: 'Host', debugMode: true } }));
    const hostJoin = await host.waitForType('JOIN_SUCCESS');
    const hostToken = hostJoin.payload.sessionToken;
    const roomCode = hostJoin.payload.roomCode;

    const p2 = await createTestWsClient(wsUrl);
    clients.push(p2);
    p2.ws.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { roomCode, playerName: 'P2' } }));
    await p2.waitForType('JOIN_SUCCESS');

    // Host starts game
    host.ws.send(JSON.stringify({ type: 'START_GAME' }));

    // Wait until MINIGAME_ACTIVE
    await p2.waitForRoomState(s => s.phase === 'MINIGAME_ACTIVE');

    // Host disconnects DURING active mini-game!
    host.close();
    await new Promise(r => setTimeout(r, 50));

    const room = server.getActiveRoom()!;
    assert.ok(room.connectionTimers.hostGraceTimer, 'Host grace timer must be scheduled');

    // End mini-game by having P2 stop / resolve
    p2.ws.send(JSON.stringify({ type: 'FIGHTER_ACTION', payload: { type: 'STOP' } }));

    // Wait for PAYOUT_RECAP
    await p2.waitForRoomState(s => s.phase === 'PAYOUT_RECAP');

    // CRITICAL: Host grace timer must STILL exist after game resolution!
    assert.ok(
      room.connectionTimers.hostGraceTimer,
      'Host grace timer must NOT be wiped by game resolution'
    );

    // Host reconnects before grace timer expires
    const newHostSocket = await createTestWsClient(wsUrl);
    clients.push(newHostSocket);
    newHostSocket.ws.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { roomCode, sessionToken: hostToken } }));
    const recon = await newHostSocket.waitForType('JOIN_SUCCESS');
    assert.equal(recon.payload.isHost, true);

    const hostPlayer = room.players.get(hostToken)!;
    assert.equal(hostPlayer.connected, true);
    assert.equal(room.connectionTimers.hostGraceTimer, undefined, 'Host grace timer cleared on reconnect');
  } finally {
    for (const c of clients) c.close();
    await server.close();
  }
});

test('Production Server: disconnected lobby seats free capacity after grace expiry', async () => {
  const server = createBrawlServer({
    timingConfig: {
      staleSeatGraceMs: 150, // 150ms stale seat grace in test mode
    },
  });

  const { port } = await server.listen(0, '127.0.0.1');
  const wsUrl = `ws://127.0.0.1:${port}/ws`;
  const clients: Array<Awaited<ReturnType<typeof createTestWsClient>>> = [];

  try {
    const host = await createTestWsClient(wsUrl);
    clients.push(host);
    host.ws.send(JSON.stringify({ type: 'CREATE_ROOM', payload: { playerName: 'Host' } }));
    const hostJoin = await host.waitForType('JOIN_SUCCESS');
    const roomCode = hostJoin.payload.roomCode;

    // Player joins
    const player = await createTestWsClient(wsUrl);
    player.ws.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { roomCode, playerName: 'Leaver' } }));
    await player.waitForType('JOIN_SUCCESS');

    const room = server.getActiveRoom()!;
    assert.equal(room.players.size, 2);

    // Player disconnects
    player.close();

    // Stale timer starts
    await new Promise(r => setTimeout(r, 50));
    assert.equal(room.players.size, 2); // Still reserved initially

    // Wait until grace period expires (>150ms)
    await new Promise(r => setTimeout(r, 200));

    // Stale seat removed!
    assert.equal(room.players.size, 1, 'Stale disconnected player must be deleted to free capacity');
  } finally {
    for (const c of clients) c.close();
    await server.close();
  }
});
