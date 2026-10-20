/**
 * Minimal Cloudflare runtime declarations used by this repository's Worker build.
 * Wrangler provides the runtime itself; these declarations keep `tsc` independent
 * from a second Cloudflare type package and cover only APIs used by BET & BRAWL.
 */
interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  setAlarm(scheduledTime: number | Date): Promise<void>;
  deleteAlarm(): Promise<void>;
}

interface DurableObjectState {
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): void;
  acceptWebSocket(ws: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): WebSocket[];
}

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface ExportedHandler<Env = unknown> {
  fetch(request: Request, env: Env): Response | Promise<Response>;
}

interface ResponseInit {
  webSocket?: WebSocket;
}

interface WebSocket {
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}

declare class WebSocketPair {
  [key: number]: WebSocket;
}

declare module 'cloudflare:workers' {
  export class DurableObject<Env = unknown> {
    protected readonly ctx: DurableObjectState;
    protected readonly env: Env;
    constructor(ctx: DurableObjectState, env: Env);
  }
}
