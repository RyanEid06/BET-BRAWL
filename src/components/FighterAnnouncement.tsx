/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Fighter Reveal & Mini-Game VS Splash
 */

import React, { useEffect, useState } from 'react';
import type { Player, MiniGameMeta } from '../engine/types.ts';
import { sound } from '../engine/audio.ts';
import { Swords, ArrowRight } from 'lucide-react';

interface Props {
  roundNumber: number;
  totalRounds: number;
  fighterA: Player;
  fighterB: Player;
  miniGame: MiniGameMeta;
  onContinueToBetting: () => void;
}

export const FighterAnnouncement: React.FC<Props> = ({
  roundNumber,
  totalRounds,
  fighterA,
  fighterB,
  miniGame,
  onContinueToBetting,
}) => {
  const [countdown, setCountdown] = useState<number>(4);

  useEffect(() => {
    sound.playCountdown(true);

    const interval = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (countdown === 0) {
      onContinueToBetting();
    }
  }, [countdown, onContinueToBetting]);

  return (
    <div className="relative w-full max-w-4xl mx-auto p-4 md:p-6 min-h-[520px] flex flex-col justify-between items-center text-center">
      {/* Top Round Badge */}
      <div className="space-y-1">
        <span className="px-4 py-1.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700/60 font-mono text-xs font-bold tracking-widest uppercase">
          ROUND {roundNumber} OF {totalRounds}
        </span>
        <h2 className="text-3xl md:text-4xl font-black font-display text-white tracking-wide mt-2">
          {miniGame.name.toUpperCase()}
        </h2>
        <p className="text-slate-400 text-sm max-w-md mx-auto">{miniGame.tagline}</p>
      </div>

      {/* VS Splash Cards */}
      <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-6 my-6 relative items-center">
        {/* Fighter A (Blue Corner) */}
        <div className="p-6 rounded-3xl bg-gradient-to-br from-cyan-950/80 to-slate-900 border-2 border-cyan-400 shadow-2xl flex flex-col items-center space-y-3 glow-cyan">
          <span className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-widest">
            BLUE CORNER
          </span>
          <div className="text-6xl p-4 bg-slate-950 rounded-2xl border border-cyan-500/50 shadow-inner">
            {fighterA.avatar}
          </div>
          <h3 className="text-2xl font-black text-white font-display">{fighterA.name}</h3>
          <div className="flex gap-4 text-xs font-mono text-slate-300">
            <span>Record: <b className="text-cyan-300">{fighterA.matchesWon}W - {fighterA.matchesPlayed - fighterA.matchesWon}L</b></span>
            <span>Bank: <b className="text-amber-400">{fighterA.coins}c</b></span>
          </div>
        </div>

        {/* Center VS Emblem */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 hidden md:flex items-center justify-center w-16 h-16 rounded-full bg-slate-950 border-2 border-amber-400 shadow-2xl glow-gold text-amber-400 font-display font-black text-2xl">
          VS
        </div>

        {/* Fighter B (Red Corner) */}
        <div className="p-6 rounded-3xl bg-gradient-to-bl from-rose-950/80 to-slate-900 border-2 border-rose-500 shadow-2xl flex flex-col items-center space-y-3 glow-crimson">
          <span className="text-xs font-mono font-bold text-rose-300 uppercase tracking-widest">
            RED CORNER
          </span>
          <div className="text-6xl p-4 bg-slate-950 rounded-2xl border border-rose-500/50 shadow-inner">
            {fighterB.avatar}
          </div>
          <h3 className="text-2xl font-black text-white font-display">{fighterB.name}</h3>
          <div className="flex gap-4 text-xs font-mono text-slate-300">
            <span>Record: <b className="text-rose-300">{fighterB.matchesWon}W - {fighterB.matchesPlayed - fighterB.matchesWon}L</b></span>
            <span>Bank: <b className="text-amber-400">{fighterB.coins}c</b></span>
          </div>
        </div>
      </div>

      {/* Rules pill & Skip button */}
      <div className="w-full max-w-lg bg-slate-900/80 p-4 rounded-2xl border border-slate-800 space-y-3">
        <div className="text-xs font-mono text-slate-400">
          Rules: {miniGame.rules[0]}
        </div>

        <button
          onClick={() => {
            sound.playCoin();
            onContinueToBetting();
          }}
          className="w-full py-3.5 rounded-xl font-display font-black text-base uppercase tracking-wider bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>OPEN BETTING WINDOW ({countdown}s)</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
