import type { GamePhase, RoundState, ServerMessage } from './types.ts';

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
