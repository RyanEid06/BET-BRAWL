/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Mini-Game 6 - Quick Draw (Authoritative Reaction Showdown)
 */

import React, { useState, useEffect } from 'react';
import type { PublicPlayer } from '../../engine/types.ts';
import { sound } from '../../engine/audio.ts';

interface Props {
  fighterA: PublicPlayer;
  fighterB: PublicPlayer;
  isPlayerFighter: boolean;
  playerFighterSlot: 'A' | 'B' | 'spectator';
  fighterScores: Record<string, number>;
  gameState?: Record<string, unknown>;
  gameConfig?: Record<string, unknown>;
  serverTimeOffset?: number;
  onSendAction: (action: { type: 'DRAW_TAP' }) => void;
}

export const QuickDrawGame: React.FC<Props> = ({
  fighterA,
  fighterB,
  isPlayerFighter,
  playerFighterSlot,
  fighterScores,
  gameState,
  gameConfig,
  serverTimeOffset = 0,
  onSendAction,
}) => {
  const drawAt = typeof gameConfig?.drawAt === 'number' ? gameConfig.drawAt : Date.now() + 3000;
  const [phase, setPhase] = useState<'WAIT' | 'DRAW'>('WAIT');

  const fouls = (gameState?.fouls as Record<string, boolean>) || {};
  const foulA = !!fouls[fighterA.id];
  const foulB = !!fouls[fighterB.id];

  const scoreA = fighterScores[fighterA.id];
  const scoreB = fighterScores[fighterB.id];

  // Synchronized WAIT vs DRAW transition based on authoritative drawAt
  useEffect(() => {
    const checkDraw = () => {
      const now = Date.now() + serverTimeOffset;
      if (now >= drawAt) {
        setPhase('DRAW');
      } else {
        setPhase('WAIT');
      }
    };

    checkDraw();
    const interval = setInterval(checkDraw, 30);
    return () => clearInterval(interval);
  }, [drawAt, serverTimeOffset]);

  const hasMyPlayerActed = (playerFighterSlot === 'A' && (scoreA !== undefined || foulA)) ||
                           (playerFighterSlot === 'B' && (scoreB !== undefined || foulB));

  const handleTap = () => {
    if (!isPlayerFighter || hasMyPlayerActed) return;

    if (phase === 'WAIT') {
      sound.playBuzzer();
    } else {
      sound.playTap(true);
    }

    onSendAction({ type: 'DRAW_TAP' });
  };

  // Keyboard shortcut (Space / Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handleTap();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasMyPlayerActed, isPlayerFighter, phase]);

  return (
    <div className="flex flex-col items-center justify-between w-full max-w-xl mx-auto p-4 py-6 bg-slate-950/90 rounded-3xl border border-cyan-500/30 text-white min-h-[460px]">
      {/* Top Banner */}
      <div className="text-center space-y-1">
        <span className="px-3 py-1 bg-amber-950 text-amber-300 border border-amber-700/60 rounded-full text-xs font-mono font-bold tracking-wider">
          FASTEST REACTION WINS · EARLY TAP = FALSE START FOUL
        </span>
        <h3 className="text-xl font-black font-display tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-rose-400">
          QUICK DRAW SHOWDOWN
        </h3>
      </div>

      {/* Main Flash Arena */}
      <div
        className={`w-full py-12 px-6 rounded-3xl flex flex-col items-center justify-center transition-all duration-100 border-4 shadow-2xl ${
          foulA || foulB
            ? 'bg-red-950 border-red-500 text-red-300'
            : phase === 'DRAW'
            ? 'bg-emerald-950 border-emerald-400 text-emerald-300 glow-cyan animate-pulse'
            : 'bg-slate-900 border-amber-500/50 text-amber-300'
        }`}
      >
        <div className="text-6xl font-black font-display tracking-wider">
          {foulA || foulB ? '💥 FALSE START!' : phase === 'DRAW' ? '⚡ DRAW! ⚡' : 'WAIT...'}
        </div>
        <div className="text-xs uppercase font-mono tracking-widest mt-2 font-bold opacity-80">
          {foulA || foulB
            ? 'Early tap disqualification!'
            : phase === 'DRAW'
            ? 'TAP NOW AS FAST AS HUMANLY POSSIBLE!'
            : 'Do not tap yet! Wait for DRAW'}
        </div>
      </div>

      {/* Fighters Dual Scoreboard */}
      <div className="grid grid-cols-2 gap-4 w-full">
        {/* Fighter A */}
        <div className="p-3 bg-slate-900 rounded-2xl border border-cyan-500/30 text-center">
          <div className="text-xs font-mono text-cyan-400 font-bold">{fighterA.avatar} {fighterA.name}</div>
          <div className="text-lg font-mono font-black text-white mt-1">
            {foulA ? (
              <span className="text-rose-400 text-sm">FOUL (Early Tap)</span>
            ) : scoreA !== undefined && scoreA > 0 ? (
              <span className="text-cyan-300">{scoreA} ms</span>
            ) : (
              <span className="text-xs text-slate-500">Waiting for trigger...</span>
            )}
          </div>
        </div>

        {/* Fighter B */}
        <div className="p-3 bg-slate-900 rounded-2xl border border-amber-500/30 text-center">
          <div className="text-xs font-mono text-amber-400 font-bold">{fighterB.avatar} {fighterB.name}</div>
          <div className="text-lg font-mono font-black text-white mt-1">
            {foulB ? (
              <span className="text-rose-400 text-sm">FOUL (Early Tap)</span>
            ) : scoreB !== undefined && scoreB > 0 ? (
              <span className="text-amber-300">{scoreB} ms</span>
            ) : (
              <span className="text-xs text-slate-500">Waiting for trigger...</span>
            )}
          </div>
        </div>
      </div>

      {/* Tap Action Button */}
      <div className="w-full">
        {isPlayerFighter ? (
          <button
            onClick={handleTap}
            disabled={hasMyPlayerActed}
            className={`w-full py-6 rounded-2xl font-display font-black text-2xl uppercase tracking-wider transition-all transform active:scale-95 shadow-xl select-none cursor-pointer ${
              hasMyPlayerActed
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                : phase === 'DRAW'
                ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500 text-slate-950 glow-cyan border-2 border-emerald-300'
                : 'bg-gradient-to-r from-amber-600 to-rose-600 text-white border-2 border-amber-400'
            }`}
          >
            {hasMyPlayerActed
              ? 'LOCKED IN'
              : phase === 'DRAW'
              ? '⚡ SLAM TAP NOW! ⚡'
              : 'WAIT FOR DRAW...'}
          </button>
        ) : (
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-center w-full">
            <span className="text-xs font-mono text-cyan-300">
              👁️ SPECTATOR VIEW: Both fighters waiting for the signal!
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
