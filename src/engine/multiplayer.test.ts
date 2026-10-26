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
      payload: { protocolVersion: 2, playerName: 'Host Ace', avatar: '⚡' },
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
        payload: { protocolVersion: 2, roomCode, playerName: `Player ${i}`, avatar: '🦊' },
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
    // Keep this V1 lifecycle fixture focused on its original betting/payout behavior.
    // Shuffled-bag coverage lives in roomEngine.test.ts.
    server.getActiveRoom()!.gameBag = ['millisecond_stop'];
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
      payload: { protocolVersion: 2, playerName: 'Rogue', avatar: '💀' },
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
    host.ws.send(JSON.stringify({ type: 'CREATE_ROOM', payload: { protocolVersion: 2, playerName: 'Host' } }));
    const hostJoin = await host.waitForType('JOIN_SUCCESS');
    const roomCode = hostJoin.payload.roomCode;

    // 2. Player joins on Socket 1
    const socket1 = await createTestWsClient(wsUrl);
    socket1.ws.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { protocolVersion: 2, roomCode, playerName: 'ReconnectTester' } }));
    const pJoin = await socket1.waitForType('JOIN_SUCCESS');
    const token = pJoin.payload.sessionToken;

    // 3. Socket 2 reconnects using same token BEFORE socket 1 closes
    const socket2 = await createTestWsClient(wsUrl);
    socket2.ws.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { protocolVersion: 2, roomCode, sessionToken: token } }));
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
      hostGraceMs: 1500,
      gameDurationMs: 250,
    },
  });

  const { port } = await server.listen(0, '127.0.0.1');
  const wsUrl = `ws://127.0.0.1:${port}/ws`;
  const clients: Array<Awaited<ReturnType<typeof createTestWsClient>>> = [];

  try {
    // Use a real three-player room; debug never bypasses the minimum.
    const host = await createTestWsClient(wsUrl);
    clients.push(host);
    host.ws.send(JSON.stringify({ type: 'CREATE_ROOM', payload: { protocolVersion: 2, playerName: 'Host' } }));
    const hostJoin = await host.waitForType('JOIN_SUCCESS');
    const hostToken = hostJoin.payload.sessionToken;
    const roomCode = hostJoin.payload.roomCode;

    const p2 = await createTestWsClient(wsUrl);
    clients.push(p2);
    p2.ws.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { protocolVersion: 2, roomCode, playerName: 'P2' } }));
    await p2.waitForType('JOIN_SUCCESS');
    const p3 = await createTestWsClient(wsUrl);
    clients.push(p3);
    p3.ws.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { protocolVersion: 2, roomCode, playerName: 'P3' } }));
    await p3.waitForType('JOIN_SUCCESS');
    p2.ws.send(JSON.stringify({ type: 'TOGGLE_READY' }));
    p3.ws.send(JSON.stringify({ type: 'TOGGLE_READY' }));
    await host.waitForRoomState(s => s.players.length === 3 && s.players.every(p => p.isHost || p.isReady));

    // Host starts game
    host.ws.send(JSON.stringify({ type: 'START_GAME' }));

    // Wait until MINIGAME_ACTIVE
    await p2.waitForRoomState(s => s.phase === 'MINIGAME_ACTIVE');

    // Host disconnects DURING active mini-game!
    host.close();
    await p2.waitForRoomState(s => s.players.some(p => p.isHost && !p.connected));

    const room = server.getActiveRoom()!;
    assert.ok(room.connectionTimers.hostGraceTimer, 'Host grace timer must be scheduled');

    // The test-only game deadline resolves whether the host was a fighter or spectator.

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
    newHostSocket.ws.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { protocolVersion: 2, roomCode, sessionToken: hostToken } }));
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
    host.ws.send(JSON.stringify({ type: 'CREATE_ROOM', payload: { protocolVersion: 2, playerName: 'Host' } }));
    const hostJoin = await host.waitForType('JOIN_SUCCESS');
    const roomCode = hostJoin.payload.roomCode;

    // Player joins
    const player = await createTestWsClient(wsUrl);
    player.ws.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { protocolVersion: 2, roomCode, playerName: 'Leaver' } }));
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

for (const debugMode of [false, true]) {
test(`Production Server: rejects fewer than 3 connected players (debug=${debugMode})`, async () => {
  const server = createBrawlServer();
  const { port } = await server.listen(0, '127.0.0.1');
  const wsUrl = `ws://127.0.0.1:${port}/ws`;
  const clients: Array<Awaited<ReturnType<typeof createTestWsClient>>> = [];

  try {
    const host = await createTestWsClient(wsUrl);
    clients.push(host);
    host.ws.send(JSON.stringify({ type: 'CREATE_ROOM', payload: { protocolVersion: 2, playerName: 'Host', debugMode } }));
    const hostJoin = await host.waitForType('JOIN_SUCCESS');
    const roomCode = hostJoin.payload.roomCode;

    const p2 = await createTestWsClient(wsUrl);
    clients.push(p2);
    p2.ws.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { protocolVersion: 2, roomCode, playerName: 'P2' } }));
    await p2.waitForType('JOIN_SUCCESS');

    // Both ready, but only 2 players
    p2.ws.send(JSON.stringify({ type: 'TOGGLE_READY' }));
    await host.waitForRoomState(s => s.players?.find(p => p.name === 'P2')?.isReady === true);

    // Host attempts to start with 2 players in either room mode
    host.ws.send(JSON.stringify({ type: 'START_GAME' }));
    const err = await host.waitForType('JOIN_ERROR');
    assert.equal(err.payload.code, 'NOT_ENOUGH_PLAYERS');
    assert.match(err.payload.message, /at least 3 connected players/);
  } finally {
    for (const c of clients) c.close();
    await server.close();
  }
});

}

test('Production Server: full 3-player Tournament Lifecycle (3 Qualifiers -> Championship Series [2-1 with tie] -> Podium)', async () => {
  const server = createBrawlServer({
    timingConfig: {
      revealDurationMs: 60,
      bettingDurationSeconds: 1,
      countdownDurationMs: 60,
      gameDurationMs: 150,
      fighterGraceMs: 300,
      hostGraceMs: 500,
      staleSeatGraceMs: 300,
    },
  });
  const { port } = await server.listen(0, '127.0.0.1');
  const wsUrl = `ws://127.0.0.1:${port}/ws`;
  const clients: Array<Awaited<ReturnType<typeof createTestWsClient>>> = [];

  try {
    // 1. Connect Host and 2 additional players
    const host = await createTestWsClient(wsUrl);
    clients.push(host);
    host.ws.send(JSON.stringify({ type: 'CREATE_ROOM', payload: { protocolVersion: 2, playerName: 'Ace (Host)', avatar: '⚡' } }));
    const hostJoin = await host.waitForType('JOIN_SUCCESS');
    const roomCode = hostJoin.payload.roomCode;
    const p1Id = hostJoin.payload.player.id;

    const p2 = await createTestWsClient(wsUrl);
    clients.push(p2);
    p2.ws.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { protocolVersion: 2, roomCode, playerName: 'Blaze', avatar: '🔥' } }));
    const p2Join = await p2.waitForType('JOIN_SUCCESS');
    const p2Id = p2Join.payload.player.id;

    const p3 = await createTestWsClient(wsUrl);
    clients.push(p3);
    p3.ws.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { protocolVersion: 2, roomCode, playerName: 'Cipher', avatar: '🔮' } }));
    const p3Join = await p3.waitForType('JOIN_SUCCESS');
    const p3Id = p3Join.payload.player.id;

    const clientMap: Record<string, Awaited<ReturnType<typeof createTestWsClient>>> = {
      [p1Id]: host,
      [p2Id]: p2,
      [p3Id]: p3,
    };

    // 2. Both non-host players toggle ready
    p2.ws.send(JSON.stringify({ type: 'TOGGLE_READY' }));
    p3.ws.send(JSON.stringify({ type: 'TOGGLE_READY' }));

    await host.waitForRoomState(s => {
      const pl = s.players || [];
      return pl.length === 3 && pl.every(p => p.isReady || p.isHost);
    });

    // 3. Host starts tournament
    server.getActiveRoom()!.gameBag = ['millisecond_stop'];
    host.ws.send(JSON.stringify({ type: 'START_GAME' }));

    const r1State = await host.waitForRoomState(s => s.phase === 'FIGHTER_REVEAL' && s.currentRound?.roundNumber === 1, 5000);
    assert.equal(r1State.payload.currentRound?.isChampionship, false);
    assert.equal(r1State.payload.currentRound?.stage, 'QUALIFIERS');

    const activeRoom = server.getActiveRoom()!;
    assert.ok(activeRoom.tournamentSchedule);
    assert.equal(activeRoom.tournamentSchedule.stage, 'QUALIFIERS');
    assert.equal(activeRoom.tournamentSchedule.qualifierCount, 3);
    assert.equal(activeRoom.tournamentSchedule.matches.length, 3);

    // Initial tournamentRank should be assigned immediately to all 3 players
    for (const player of activeRoom.players.values()) {
      assert.ok(player.tournamentRank !== undefined && player.tournamentRank >= 1 && player.tournamentRank <= 3);
    }

    // Helper: Drive active mini-game round to a desired outcome using real WebSocket messages
    async function playRoundToDesiredOutcome(roundNumber: number, targetWinnerId: string | 'TIE') {
      const room = server.getActiveRoom()!;
      const round = room.currentRound!;
      const internal = room.internalGameState!;
      const [f1Id, f2Id] = round.fighterIds;
      const f1Client = clientMap[f1Id];
      const f2Client = clientMap[f2Id];
      const miniGameId = round.miniGame.id;

      if (targetWinnerId === 'TIE') {
        // No fighter acts: every game times out as a tie, independent of socket scheduling.
      } else {
        const winnerClient = clientMap[targetWinnerId];
        const loserId = targetWinnerId === f1Id ? f2Id : f1Id;
        const loserClient = clientMap[loserId];

        if (miniGameId === 'speed_math') {
          const answers = internal.speedMath?.correctAnswers || [0, 0, 0];
          winnerClient.ws.send(JSON.stringify({ type: 'FIGHTER_ACTION', payload: { type: 'ANSWER', questionIndex: 0, answer: answers[0] } }));
          winnerClient.ws.send(JSON.stringify({ type: 'FIGHTER_ACTION', payload: { type: 'ANSWER', questionIndex: 1, answer: answers[1] } }));
          winnerClient.ws.send(JSON.stringify({ type: 'FIGHTER_ACTION', payload: { type: 'ANSWER', questionIndex: 2, answer: answers[2] } }));
        } else if (miniGameId === 'higher_lower') {
          const cards = internal.higherLower?.cards || [];
          for (let i = 0; i < 3 && i < cards.length; i++) {
            const guess = cards[i].isHigher ? 'HIGHER' : 'LOWER';
            winnerClient.ws.send(JSON.stringify({ type: 'FIGHTER_ACTION', payload: { type: 'GUESS', questionIndex: i, guess } }));
          }
        } else if (miniGameId === 'blind_pinpoint') {
          const target = internal.blindPinpoint?.targetCity;
          const normX = target ? (target.lon + 180) / 360 : 0.5;
          const normY = target ? (90 - target.lat) / 180 : 0.5;
          winnerClient.ws.send(JSON.stringify({ type: 'FIGHTER_ACTION', payload: { type: 'PIN', normX, normY } }));
          loserClient.ws.send(JSON.stringify({ type: 'FIGHTER_ACTION', payload: { type: 'PIN', normX: 0, normY: 0 } }));
        } else if (miniGameId === 'quick_draw') {
          // Loser taps early -> false start foul -> winner wins immediately
          loserClient.ws.send(JSON.stringify({ type: 'FIGHTER_ACTION', payload: { type: 'DRAW_TAP' } }));
        } else if (miniGameId === 'millisecond_stop') {
          // Winner stops, loser does not stop -> timeout fires (150ms) -> has1 && !has2 -> winner wins
          winnerClient.ws.send(JSON.stringify({ type: 'FIGHTER_ACTION', payload: { type: 'STOP' } }));
        } else if (miniGameId === 'rapid_red_green') {
          // Winner taps once on initial green (+1 score), loser does not tap -> timeout fires -> winner score > loser score -> winner wins
          winnerClient.ws.send(JSON.stringify({ type: 'FIGHTER_ACTION', payload: { type: 'TAP' } }));
        }
      }

      const recapMsg = await host.waitForRoomState(
        s => s.phase === 'PAYOUT_RECAP' && s.currentRound?.roundNumber === roundNumber,
        6000
      );
      return recapMsg.payload;
    }

    // Helper: Returns who should win in qualifiers so P1 finishes 6 pts (2W), P2 finishes 3 pts (1W), P3 finishes 0 pts (0W)
    function pickQualifierWinner(fighters: [string, string]): string {
      if (fighters.includes(p1Id)) return p1Id;
      if (fighters.includes(p2Id)) return p2Id;
      return p3Id;
    }

    // -------------------------------------------------------------
    // PHASE A: QUALIFIERS (3 Matches)
    // -------------------------------------------------------------
    const playedMiniGames: string[] = [];

    for (let q = 1; q <= 3; q++) {
      await host.waitForRoomState(s => s.phase === 'BETTING_WINDOW' && s.currentRound?.roundNumber === q, 5000);

      // Verify a spectator can place a valid secret wager
      const curRound = activeRoom.currentRound!;
      const spectatorId = [p1Id, p2Id, p3Id].find(id => !curRound.fighterIds.includes(id))!;
      const specClient = clientMap[spectatorId];
      specClient.ws.send(JSON.stringify({
        type: 'PLACE_BET',
        payload: { fighterId: curRound.fighterIds[0], amount: 50 },
      }));
      await specClient.waitForType('BET_ACCEPTED');

      // Wait until mini-game becomes active
      const activeState = await host.waitForRoomState(s => s.phase === 'MINIGAME_ACTIVE' && s.currentRound?.roundNumber === q, 5000);

      // Verify secret bets array is scrubbed from public broadcast during gameplay
      assert.deepEqual(activeState.payload.currentRound?.bets, [], 'Secret bets must not leak during active game in public broadcast');

      playedMiniGames.push(activeRoom.currentRound!.miniGame.id);

      const targetWinner = pickQualifierWinner(curRound.fighterIds);
      const recap = await playRoundToDesiredOutcome(q, targetWinner);

      assert.equal(recap.phase, 'PAYOUT_RECAP');
      assert.equal(recap.currentRound?.winnerId, targetWinner);
      assert.ok(recap.currentRound?.payouts.length! >= 1);

      // Host advances to next round
      activeRoom.gameBag = [q % 2 === 1 ? 'quick_draw' : 'millisecond_stop'];
      host.ws.send(JSON.stringify({ type: 'NEXT_ROUND' }));
    }

    // -------------------------------------------------------------
    // VERIFY FINAL QUALIFIER RANKINGS & FINALIST LOCKING
    // -------------------------------------------------------------
    const p1Obj = Array.from(activeRoom.players.values()).find(p => p.id === p1Id)!;
    const p2Obj = Array.from(activeRoom.players.values()).find(p => p.id === p2Id)!;
    const p3Obj = Array.from(activeRoom.players.values()).find(p => p.id === p3Id)!;

    assert.equal(p1Obj.qualifierPoints, 6, 'P1 must have 6 Brawl Points (2 wins)');
    assert.equal(p1Obj.qualifierWins, 2);
    assert.equal(p2Obj.qualifierPoints, 3, 'P2 must have 3 Brawl Points (1 win)');
    assert.equal(p2Obj.qualifierWins, 1);
    assert.equal(p3Obj.qualifierPoints, 0, 'P3 must have 0 Brawl Points (0 wins)');
    assert.equal(p3Obj.qualifierWins, 0);

    // Snapshot qualifier Brawl Points before Championship Series begins
    const qualifierPointsSnapshot = {
      [p1Id]: p1Obj.qualifierPoints,
      [p2Id]: p2Obj.qualifierPoints,
      [p3Id]: p3Obj.qualifierPoints,
    };

    // -------------------------------------------------------------
    // PHASE B: CHAMPIONSHIP SERIES (First to 2 Decisive Wins)
    // -------------------------------------------------------------

    // Helper to assert qualifier points invariant remains untouched
    function assertQualifierPointsInvariant(stepDescription: string) {
      for (const p of activeRoom.players.values()) {
        assert.equal(
          p.qualifierPoints,
          qualifierPointsSnapshot[p.id],
          `Qualifier Brawl Points for ${p.name} must remain invariant during Championship: ${stepDescription}`
        );
      }
    }

    // --- Championship Game 1: P1 Wins (Score 1-0) ---
    const g1Reveal = await host.waitForRoomState(
      s => s.phase === 'FIGHTER_REVEAL' && s.currentRound?.isChampionship === true && s.currentRound?.championshipGameNumber === 1,
      5000
    );
    assert.equal(g1Reveal.payload.currentRound?.stage, 'CHAMPIONSHIP');
    assert.deepEqual(activeRoom.tournamentSchedule?.finalists, [p1Id, p2Id], 'Top 2 qualifier seeds must be locked finalists');
    assert.equal(activeRoom.tournamentSchedule?.thirdPlaceId, p3Id, '3rd place must be highest-ranked non-finalist');
    assert.ok(!g1Reveal.payload.currentRound?.fighterIds.includes(p3Id), 'Non-finalist P3 must never be a Championship fighter');

    const g1Active = await host.waitForRoomState(s => s.phase === 'MINIGAME_ACTIVE' && s.currentRound?.championshipGameNumber === 1, 5000);
    // Verify no immediate repeated mini-game rule
    const lastGameBeforeG1 = playedMiniGames[playedMiniGames.length - 1];
    assert.notEqual(g1Active.payload.currentRound?.miniGame.id, lastGameBeforeG1, 'Championship Game 1 must not repeat previous mini-game');
    playedMiniGames.push(g1Active.payload.currentRound!.miniGame.id);

    const g1Recap = await playRoundToDesiredOutcome(4, p1Id);
    assert.equal(g1Recap.currentRound?.winnerId, p1Id, `Championship G1 ${g1Recap.currentRound?.miniGame.id}`);
    assert.equal(activeRoom.tournamentSchedule?.championshipWins[p1Id], 1, 'P1 must have 1 Championship win');
    assert.equal(activeRoom.tournamentSchedule?.championshipWins[p2Id], 0, 'P2 must have 0 Championship wins');
    assert.equal(activeRoom.tournamentSchedule?.championId, null, 'Champion must not be crowned after 1 win');
    assertQualifierPointsInvariant('after Championship Game 1');

    activeRoom.gameBag = ['millisecond_stop'];
    host.ws.send(JSON.stringify({ type: 'NEXT_ROUND' }));

    // --- Championship Game 2: TIE Result (Score stays 1-0, Series Extends!) ---
    const g2Reveal = await host.waitForRoomState(
      s => s.phase === 'FIGHTER_REVEAL' && s.currentRound?.championshipGameNumber === 2,
      5000
    );
    assert.deepEqual(g2Reveal.payload.currentRound?.fighterIds.sort(), [p1Id, p2Id].sort(), 'Finalists must remain locked');
    assert.ok(!g2Reveal.payload.currentRound?.fighterIds.includes(p3Id));

    const g2Active = await host.waitForRoomState(s => s.phase === 'MINIGAME_ACTIVE' && s.currentRound?.championshipGameNumber === 2, 5000);
    const lastGameBeforeG2 = playedMiniGames[playedMiniGames.length - 1];
    assert.notEqual(g2Active.payload.currentRound?.miniGame.id, lastGameBeforeG2, 'Championship Game 2 must not repeat Game 1 mini-game');
    playedMiniGames.push(g2Active.payload.currentRound!.miniGame.id);

    const g2Recap = await playRoundToDesiredOutcome(5, 'TIE');
    assert.equal(g2Recap.currentRound?.tieResult, true, 'Game 2 must resolve as a tie');
    assert.equal(activeRoom.tournamentSchedule?.championshipWins[p1Id], 1, 'Tied game gives 0 wins: P1 score must remain 1');
    assert.equal(activeRoom.tournamentSchedule?.championshipWins[p2Id], 0, 'Tied game gives 0 wins: P2 score must remain 0');
    assert.equal(activeRoom.tournamentSchedule?.championId, null, 'Tied game never crowns a champion; series extends');
    assertQualifierPointsInvariant('after Championship Game 2 (Tie)');

    activeRoom.gameBag = ['quick_draw'];
    host.ws.send(JSON.stringify({ type: 'NEXT_ROUND' }));

    // --- Championship Game 3: P2 Wins (Score 1-1, Series Equalized) ---
    const g3Reveal = await host.waitForRoomState(
      s => s.phase === 'FIGHTER_REVEAL' && s.currentRound?.championshipGameNumber === 3,
      5000
    );
    assert.deepEqual(g3Reveal.payload.currentRound?.fighterIds.sort(), [p1Id, p2Id].sort(), 'Finalists must remain locked');
    assert.ok(!g3Reveal.payload.currentRound?.fighterIds.includes(p3Id));

    const g3Active = await host.waitForRoomState(s => s.phase === 'MINIGAME_ACTIVE' && s.currentRound?.championshipGameNumber === 3, 5000);
    const lastGameBeforeG3 = playedMiniGames[playedMiniGames.length - 1];
    assert.notEqual(g3Active.payload.currentRound?.miniGame.id, lastGameBeforeG3, 'Championship Game 3 must not repeat Game 2 mini-game');
    playedMiniGames.push(g3Active.payload.currentRound!.miniGame.id);

    const g3Recap = await playRoundToDesiredOutcome(6, p2Id);
    assert.equal(g3Recap.currentRound?.winnerId, p2Id);
    assert.equal(activeRoom.tournamentSchedule?.championshipWins[p1Id], 1);
    assert.equal(activeRoom.tournamentSchedule?.championshipWins[p2Id], 1, 'Score is now 1-1');
    assert.equal(activeRoom.tournamentSchedule?.championId, null, 'Champion must not be crowned at 1-1');
    assertQualifierPointsInvariant('after Championship Game 3 (1-1)');

    activeRoom.gameBag = ['millisecond_stop'];
    host.ws.send(JSON.stringify({ type: 'NEXT_ROUND' }));

    // --- Championship Game 4: P1 Wins (Score 2-1, Decisive Championship Clinch!) ---
    const g4Reveal = await host.waitForRoomState(
      s => s.phase === 'FIGHTER_REVEAL' && s.currentRound?.championshipGameNumber === 4,
      5000
    );
    assert.deepEqual(g4Reveal.payload.currentRound?.fighterIds.sort(), [p1Id, p2Id].sort(), 'Finalists must remain locked');
    assert.ok(!g4Reveal.payload.currentRound?.fighterIds.includes(p3Id));

    const g4Active = await host.waitForRoomState(s => s.phase === 'MINIGAME_ACTIVE' && s.currentRound?.championshipGameNumber === 4, 5000);
    const lastGameBeforeG4 = playedMiniGames[playedMiniGames.length - 1];
    assert.notEqual(g4Active.payload.currentRound?.miniGame.id, lastGameBeforeG4, 'Championship Game 4 must not repeat Game 3 mini-game');

    const g4Recap = await playRoundToDesiredOutcome(7, p1Id);
    assert.equal(g4Recap.currentRound?.winnerId, p1Id);
    assert.equal(activeRoom.tournamentSchedule?.championshipWins[p1Id], 2, 'P1 reaches 2 decisive wins');
    assert.equal(activeRoom.tournamentSchedule?.championshipWins[p2Id], 1);
    assert.equal(activeRoom.tournamentSchedule?.championId, p1Id, 'P1 is crowned Champion');
    assert.equal(activeRoom.tournamentSchedule?.runnerUpId, p2Id, 'P2 is Runner-Up');
    assert.equal(activeRoom.tournamentSchedule?.thirdPlaceId, p3Id, 'P3 is 3rd Place');
    assert.equal(activeRoom.tournamentSchedule?.stage, 'COMPLETE', 'Tournament stage is COMPLETE');
    assertQualifierPointsInvariant('after Championship Game 4 (2-1 Final)');

    // -------------------------------------------------------------
    // PHASE C: PODIUM & SAFETY CHECKS
    // -------------------------------------------------------------
    host.ws.send(JSON.stringify({ type: 'NEXT_ROUND' }));

    // All 3 connected clients must receive FINAL_PODIUM broadcast
    const [p1Podium, p2Podium, p3Podium] = await Promise.all([
      host.waitForRoomState(s => s.phase === 'FINAL_PODIUM', 5000),
      p2.waitForRoomState(s => s.phase === 'FINAL_PODIUM', 5000),
      p3.waitForRoomState(s => s.phase === 'FINAL_PODIUM', 5000),
    ]);

    assert.equal(p1Podium.payload.phase, 'FINAL_PODIUM');
    assert.equal(p2Podium.payload.phase, 'FINAL_PODIUM');
    assert.equal(p3Podium.payload.phase, 'FINAL_PODIUM');

    // Standings check on public state
    const sched = p1Podium.payload.tournamentSchedule!;
    assert.equal(sched.championId, p1Id);
    assert.equal(sched.runnerUpId, p2Id);
    assert.equal(sched.thirdPlaceId, p3Id);

    // Safety: Host sending NEXT_ROUND after complete tournament is strictly ignored
    host.ws.send(JSON.stringify({ type: 'NEXT_ROUND' }));
    await new Promise(r => setTimeout(r, 100));
    assert.equal(activeRoom.phase, 'FINAL_PODIUM', 'Tournament cannot accidentally advance out of FINAL_PODIUM');
  } finally {
    for (const c of clients) c.close();
    await server.close();
  }
});
