/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Fighter Reveal with Clear How-to-Play Guide
 */

import React, { useEffect, useState } from 'react';
import type { Player, MiniGameMeta } from '../engine/types.ts';
import { sound } from '../engine/audio.ts';
import { ArrowRight, HelpCircle } from 'lucide-react';

interface Props {
  roundNumber: number;
  totalRounds: number;
  fighterA: Player;
  fighterB: Player;
  miniGame: MiniGameMeta;
  isHost: boolean;
  onContinueToBetting: () => void;
}

export const FighterAnnouncement: React.FC<Props> = ({
  roundNumber,
  totalRounds,
  fighterA,
  fighterB,
  miniGame,
  isHost,
  onContinueToBetting,
}) => {
  const [countdown, setCountdown] = useState<number>(5);

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
    <div className="relative w-full max-w-xl mx-auto p-4 flex flex-col justify-between items-center text-center space-y-4">
      {/* Round & Game Header */}
      <div className="space-y-1">
        <span className="px-3 py-1 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700/60 font-mono text-xs font-bold uppercase">
          ROUND {roundNumber} OF {totalRounds}
        </span>
        <h2 className="text-2xl sm:text-3xl font-black font-display text-white tracking-wide mt-1">
          {miniGame.name.toUpperCase()}
        </h2>
        <p className="text-slate-400 text-xs">{miniGame.tagline}</p>
      </div>

      {/* VS Splash Cards */}
      <div className="w-full grid grid-cols-2 gap-3 relative items-center">
        {/* Fighter A */}
        <div className="p-4 rounded-2xl bg-cyan-950/40 border-2 border-cyan-400 shadow-lg flex flex-col items-center space-y-2 glow-cyan">
          <span className="text-[10px] font-mono font-bold text-cyan-300 uppercase">BLUE CORNER</span>
          <div className="text-5xl p-2 bg-slate-950 rounded-2xl border border-cyan-500/40">
            {fighterA.avatar}
          </div>
          <h3 className="text-lg font-black text-white font-display truncate max-w-full">{fighterA.name}</h3>
          <div className="text-xs font-mono text-cyan-300 font-bold">
            {fighterA.matchesWon}W · {fighterA.matchesPlayed - fighterA.matchesWon}L
          </div>
        </div>

        {/* Fighter B */}
        <div className="p-4 rounded-2xl bg-rose-950/40 border-2 border-rose-500 shadow-lg flex flex-col items-center space-y-2 glow-crimson">
          <span className="text-[10px] font-mono font-bold text-rose-300 uppercase">RED CORNER</span>
          <div className="text-5xl p-2 bg-slate-950 rounded-2xl border border-rose-500/40">
            {fighterB.avatar}
          </div>
          <h3 className="text-lg font-black text-white font-display truncate max-w-full">{fighterB.name}</h3>
          <div className="text-xs font-mono text-rose-300 font-bold">
            {fighterB.matchesWon}W · {fighterB.matchesPlayed - fighterB.matchesWon}L
          </div>
        </div>
      </div>

      {/* Essential 2-3 Step How to Play Guide */}
      <div className="w-full bg-slate-900/90 p-4 rounded-2xl border border-slate-800 text-left space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-amber-400">
          <HelpCircle className="w-4 h-4" />
          <span>HOW TO PLAY:</span>
        </div>
        <ul className="space-y-1.5 text-xs text-slate-300">
          {miniGame.rules.slice(0, 3).map((rule, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="text-amber-400 font-bold font-mono">{idx + 1}.</span>
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Ready / Continue Action */}
      <div className="w-full">
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
