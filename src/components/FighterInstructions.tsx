import React from 'react';
import type { MiniGameMeta } from '../engine/types.ts';
import { MINI_GAMES } from '../engine/miniGamesCatalog.ts';

export function FighterInstructions({ miniGame, gameConfig }: {
  miniGame: MiniGameMeta;
  gameConfig?: Record<string, unknown>;
}) {
  return <section aria-label="How to play" className="w-full bg-slate-900/90 p-3 rounded-2xl border border-amber-500/40 text-left space-y-1.5">
    <h3 className="text-xs font-mono font-bold text-amber-300">HOW TO PLAY · {miniGame.name}</h3>
    {miniGame.id === 'millisecond_stop' && typeof gameConfig?.targetSeconds === 'number' &&
      typeof gameConfig?.blindSeconds === 'number' && <p className="text-sm font-bold text-cyan-300">
        Target: {gameConfig.targetSeconds.toFixed(3)}s · Timer hidden at {gameConfig.blindSeconds.toFixed(3)}s
      </p>}
    <ol className="space-y-1 text-xs leading-relaxed text-slate-200">
      {MINI_GAMES[miniGame.id].rules.map((rule, index) => <li key={index}>{rule}</li>)}
    </ol>
  </section>;
}
