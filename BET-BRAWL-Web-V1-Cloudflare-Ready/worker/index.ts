/**
 * BET & BRAWL Cloudflare Workers entrypoint.
 *
 * The authoritative multiplayer implementation lives in roomCore.ts so it can
 * be exercised directly by Node tests. This adapter uses Cloudflare's current
 * DurableObject base class for the actual runtime export.
 */

import { DurableObject } from 'cloudflare:workers';
import { BrawlRoomCore, type Env } from './roomCore.ts';

const ROOM_CODE_PATTERN = /^[A-Z0-9]{1,6}$/;

function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function normalizeRoomCode(raw: string | null | undefined): string {
  return (raw || '').trim().toUpperCase();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/network-info') {
      const isHttps = url.protocol === 'https:';
      const port = url.port ? Number(url.port) : (isHttps ? 443 : 80);
      return json({
        localIp: url.hostname,
        port,
        hasActiveRoom: false,
        roomCode: null,
        playerCount: 0,
        candidateUrls: [url.origin],
        fullJoinUrl: url.origin,
        online: true,
      });
    }

    if (url.pathname === '/ws') {
      if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }

      const roomCode = normalizeRoomCode(url.searchParams.get('room'));
      if (!ROOM_CODE_PATTERN.test(roomCode)) {
        return json(
          { error: 'A valid room code is required in the WebSocket URL.' },
          { status: 400 },
        );
      }

      const id = env.BRAWL_ROOMS.idFromName(roomCode);
      const stub = env.BRAWL_ROOMS.get(id);
      return stub.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

export class BrawlRoom extends DurableObject<Env> {
  private readonly core: BrawlRoomCore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.core = new BrawlRoomCore(ctx, env);
  }

  fetch(request: Request): Promise<Response> {
    return this.core.fetch(request);
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    return this.core.webSocketMessage(ws, message);
  }

  webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    return this.core.webSocketClose(ws);
  }

  webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    return this.core.webSocketError(ws);
  }

  alarm(): Promise<void> {
    return this.core.alarm();
  }
}
