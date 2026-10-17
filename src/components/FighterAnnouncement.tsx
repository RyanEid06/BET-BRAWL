/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Fighter Reveal with Clear How-to-Play Guide & Synchronized Countdown
 */

import React, { useEffect, useState } from 'react';
import type { PublicPlayer, MiniGameMeta } from '../engine/types.ts';
import { sound } from '../engine/audio.ts';
import { HelpCircle, Clock } from 'lucide-react';

interface Props {
  roundNumber: number;
  totalRounds: number;
  fighterA: PublicPlayer;
  fighterB: PublicPlayer;
  miniGame: MiniGameMeta;
  revealEndsAt?: number;
  serverTimeOffset?: number;
  isChampionship?: boolean;
}

export const FighterAnnouncement: React.FC<Props> = ({
  roundNumber,
  totalRounds,
  fighterA,
  fighterB,
  miniGame,
  revealEndsAt,
  serverTimeOffset = 0,
  isChampionship = false,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    if (revealEndsAt) {
      const now = Date.now() + serverTimeOffset;
      return Math.max(1, Math.ceil((revealEndsAt - now) / 1000));
    }
    return 4;
  });

  useEffect(() => {
    sound.playCountdown(true);

    const interval = setInterval(() => {
      if (revealEndsAt) {
        const now = Date.now() + serverTimeOffset;
        const remaining = Math.max(0, Math.ceil((revealEndsAt - now) / 1000));
        setSecondsRemaining(remaining);
      } else {
        setSecondsRemaining(prev => Math.max(0, prev - 1));
      }
    }, 250);

    return () => clearInterval(interval);
  }, [revealEndsAt, serverTimeOffset]);

  const qualifierTotal = Math.max(1, totalRounds - 1);

  return (
    <div className="relative w-full max-w-xl mx-auto p-4 flex flex-col justify-between items-center text-center space-y-4">
      {/* Round & Game Header */}
      <div className="space-y-1">
        {isChampionship ? (
          <span className="px-4 py-1.5 rounded-full bg-amber-950 text-amber-300 border-2 border-amber-400 font-mono text-xs font-black uppercase tracking-wider glow-gold inline-flex items-center gap-1.5">
            <span>👑</span>
            <span>TOURNAMENT CHAMPIONSHIP FINAL</span>
            <span>👑</span>
          </span>
        ) : (
          <span className="px-3 py-1 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700/60 font-mono text-xs font-bold uppercase">
            QUALIFIER BRAWL {roundNumber} OF {qualifierTotal}
          </span>
        )}
        <h2 className={`text-2xl sm:text-3xl font-black font-display tracking-wide mt-1 ${
          isChampionship ? 'text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-500' : 'text-white'
        }`}>
          {miniGame.name.toUpperCase()}
        </h2>
        <p className="text-slate-400 text-xs">
          {isChampionship ? '★ TITLE FIGHT FOR THE CHAMPIONSHIP · 500c BOUNTY ★' : miniGame.tagline}
        </p>
      </div>

      {/* VS Splash Cards */}
      <div className="w-full grid grid-cols-2 gap-3 relative items-center">
        {/* Fighter A */}
        <div className={`p-4 rounded-2xl bg-cyan-950/40 border-2 border-cyan-400 shadow-lg flex flex-col items-center space-y-2 glow-cyan ${
          isChampionship ? 'border-amber-400' : ''
        }`}>
          <span className="text-[10px] font-mono font-bold text-cyan-300 uppercase">
            {isChampionship ? 'TOP SEED FINALIST' : 'BLUE CORNER'}
          </span>
          <div className="text-5xl p-2 bg-slate-950 rounded-2xl border border-cyan-500/40">
            {fighterA.avatar}
          </div>
          <h3 className="text-lg font-black text-white font-display truncate max-w-full">{fighterA.name}</h3>
          <div className="text-xs font-mono text-cyan-300 font-bold">
            {fighterA.qualifierPoints} Brawl Pts ({fighterA.qualifierWins}W · {fighterA.qualifierLosses}L)
          </div>
        </div>

        {/* Fighter B */}
        <div className={`p-4 rounded-2xl bg-rose-950/40 border-2 border-rose-500 shadow-lg flex flex-col items-center space-y-2 glow-crimson ${
          isChampionship ? 'border-amber-400' : ''
        }`}>
          <span className="text-[10px] font-mono font-bold text-rose-300 uppercase">
            {isChampionship ? 'RUNNER-UP FINALIST' : 'RED CORNER'}
          </span>
          <div className="text-5xl p-2 bg-slate-950 rounded-2xl border border-rose-500/40">
            {fighterB.avatar}
          </div>
          <h3 className="text-lg font-black text-white font-display truncate max-w-full">{fighterB.name}</h3>
          <div className="text-xs font-mono text-rose-300 font-bold">
            {fighterB.qualifierPoints} Brawl Pts ({fighterB.qualifierWins}W · {fighterB.qualifierLosses}L)
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

      {/* Timed Betting Transition Indicator */}
      <div className="w-full">
        <div className="w-full py-3.5 rounded-xl font-display font-black text-base uppercase tracking-wider bg-slate-900 border border-amber-500/60 text-amber-300 shadow-lg flex items-center justify-center gap-2">
          <Clock className="w-4 h-4 animate-spin text-amber-400" />
          <span>BETTING OPENS IN {secondsRemaining}s...</span>
        </div>
      </div>
    </div>
  );
};
