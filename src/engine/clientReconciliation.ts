import type { GamePhase, RoundState, ServerMessage } from './types.ts';
import { isRfc1918 } from './networkDiscovery.ts';

export type ActionResult = Extract<ServerMessage, { type: 'GAME_ACTION_RESULT' }>['payload'];
export const actionScope = (phase: GamePhase, round: RoundState | null) =>
  `${phase}:${round?.matchId ?? ''}:${round?.gameState?.stageIndex ?? 0}:${round?.gameState?.phase ?? ''}`;

export function isCurrentActionResult(result: ActionResult, sentScope: string | undefined, phase: GamePhase, round: RoundState | null): boolean {
  return phase === 'MINIGAME_ACTIVE' && !!sentScope && sentScope === actionScope(phase, round) &&
    result.matchId === round?.matchId && result.stageIndex === (round?.gameState?.stageIndex ?? 0);
}

/** Accepted rotations are counted in every authoritative snapshot, even when acknowledgements batch. */
export function unconfirmedRotations(baseMoves: number, cells: number[], serverMoves: number): number[] {
  return serverMoves < baseMoves ? [] : cells.slice(serverMoves - baseMoves);
}

export function readReconnectTicket(raw: string | null): { roomCode: string; wsUrl: string } | null {
  try {
    const ticket = JSON.parse(raw ?? 'null');
    if (!ticket || typeof ticket.roomCode !== 'string' || !/^[A-Z0-9]{1,6}$/.test(ticket.roomCode)) return null;
    const url = new URL(ticket.wsUrl);
    if (url.protocol !== 'ws:' || url.username || url.password || url.pathname !== '/ws' || url.search || url.hash) return null;
    if (Number(url.port) < 1024 || Number(url.port) > 65535) return null;
    if (!isRfc1918(url.hostname) && !(url.hostname === '127.0.0.1' && url.port === '8080')) return null;
    return { roomCode: ticket.roomCode, wsUrl: url.href };
  } catch { return null; }
}
