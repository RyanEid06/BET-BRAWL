/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Mini-Game 1 - Millisecond Stop (Authoritative Precision Timer)
 * Strict blind enforcement: No client sees live clock once 3.000s is reached.
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
  gameStartsAt?: number;
  serverTimeOffset?: number;
  onSendAction: (action: { type: 'STOP' }) => void;
}

export const MillisecondStopGame: React.FC<Props> = ({
  fighterA,
  fighterB,
  isPlayerFighter,
  playerFighterSlot,
  fighterScores,
  gameStartsAt = Date.now(),
  serverTimeOffset = 0,
  onSendAction,
}) => {
  const [elapsed, setElapsed] = useState<number>(0);
  const [localStopped, setLocalStopped] = useState<boolean>(false);

  const stoppedA = fighterScores[fighterA.id] || null;
  const stoppedB = fighterScores[fighterB.id] || null;

  const TARGET_TIME = 5.0;

  // Real-time animation loop synchronized to gameStartsAt
  useEffect(() => {
    let animFrame: number;

    const tick = () => {
      const now = Date.now() + serverTimeOffset;
      const currentElapsed = Math.max(0, (now - gameStartsAt) / 1000);
      setElapsed(currentElapsed);

      if (currentElapsed < 8.0) {
        animFrame = requestAnimationFrame(tick);
      }
    };

    animFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrame);
  }, [gameStartsAt, serverTimeOffset]);

  // Once elapsed reaches 3.000s, ALL clients enter the blind zone.
  // NO CLIENT (neither fighters nor spectators) may see the live continuing clock!
  const isBlinded = elapsed >= 3.0;

  const hasMyPlayerStopped = (playerFighterSlot === 'A' && (stoppedA !== null || localStopped)) ||
                             (playerFighterSlot === 'B' && (stoppedB !== null || localStopped));

  const handleStop = () => {
    if (!isPlayerFighter || hasMyPlayerStopped) return;
    setLocalStopped(true);
    sound.playTap(true);
    onSendAction({ type: 'STOP' });
  };

  // Keyboard shortcut (Space / Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handleStop();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasMyPlayerStopped, isPlayerFighter]);

  const formatTime = (t: number) => t.toFixed(3);

  return (
    <div className="flex flex-col items-center justify-between w-full max-w-xl mx-auto p-4 py-6 bg-slate-950/90 rounded-3xl border border-cyan-500/30 text-white min-h-[460px]">
      {/* Top Banner */}
      <div className="text-center space-y-1">
        <span className="px-3 py-1 bg-cyan-950 text-cyan-300 border border-cyan-700/60 rounded-full text-xs font-mono font-bold tracking-wider">
          TARGET: 05.000s (BLINDS AT 03.000s FOR EVERYONE)
        </span>
        <h3 className="text-xl font-black font-display tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-amber-400">
          MILLISECOND STOP
        </h3>
      </div>

      {/* Main Clock Face: BLIND FOR EVERYONE ONCE >= 3.000s */}
      <div className="relative flex flex-col items-center justify-center w-72 h-40 rounded-2xl bg-black border-2 border-slate-700 shadow-2xl p-4 overflow-hidden">
        <div className={`absolute inset-0 transition-opacity duration-300 ${isBlinded ? 'bg-red-950/30' : 'bg-cyan-950/20'}`} />

        <div className="text-[11px] uppercase font-mono tracking-widest text-slate-400 mb-1">
          {isBlinded ? '🔒 BLIND ZONE ACTIVE' : 'SYNCHRONIZED CLOCK'}
        </div>

        <div className="text-5xl font-mono font-black text-center tracking-wider text-glow-cyan">
          {isBlinded ? (
            <span className="text-amber-400 animate-pulse tracking-widest">??.???</span>
          ) : (
            <span className="text-cyan-400">
              {formatTime(elapsed)}
              <span className="text-xs ml-1 text-slate-400">s</span>
            </span>
          )}
        </div>

        <div className="mt-2 text-xs font-mono text-slate-400">
          Target: <span className="text-white font-bold">05.000s</span>
        </div>
      </div>

      {/* Fighters Dual Status Cards */}
      <div className="grid grid-cols-2 gap-4 w-full">
        {/* Fighter A */}
        <div
          className={`p-3 rounded-2xl border transition-all ${
            stoppedA !== null ? 'border-cyan-400 bg-cyan-950/40' : 'border-slate-800 bg-slate-900/40'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">{fighterA.avatar}</span>
            <div>
              <div className="text-xs font-bold text-cyan-400 truncate">{fighterA.name}</div>
              <div className="text-[10px] text-slate-400 font-mono">
                {playerFighterSlot === 'A' ? '(YOU)' : 'FIGHTER A'}
              </div>
            </div>
          </div>
          <div className="font-mono text-sm font-bold">
            {stoppedA !== null ? (
              <div>
                <span className="text-emerald-400">✓ LOCKED IN</span>
                {playerFighterSlot === 'A' && (
                  <div className="text-xs text-cyan-300 mt-0.5">{formatTime(stoppedA)}s</div>
                )}
              </div>
            ) : (
              <span className="text-xs text-slate-500">
                {playerFighterSlot === 'A' && localStopped ? '✓ LOCKED IN' : 'Timing tap...'}
              </span>
            )}
          </div>
        </div>

        {/* Fighter B */}
        <div
          className={`p-3 rounded-2xl border transition-all ${
            stoppedB !== null ? 'border-amber-400 bg-amber-950/40' : 'border-slate-800 bg-slate-900/40'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">{fighterB.avatar}</span>
            <div>
              <div className="text-xs font-bold text-amber-400 truncate">{fighterB.name}</div>
              <div className="text-[10px] text-slate-400 font-mono">
                {playerFighterSlot === 'B' ? '(YOU)' : 'FIGHTER B'}
              </div>
            </div>
          </div>
          <div className="font-mono text-sm font-bold">
            {stoppedB !== null ? (
              <div>
                <span className="text-emerald-400">✓ LOCKED IN</span>
                {playerFighterSlot === 'B' && (
                  <div className="text-xs text-amber-300 mt-0.5">{formatTime(stoppedB)}s</div>
                )}
              </div>
            ) : (
              <span className="text-xs text-slate-500">
                {playerFighterSlot === 'B' && localStopped ? '✓ LOCKED IN' : 'Timing tap...'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Slam Button */}
      <div className="w-full flex flex-col items-center gap-2">
        {isPlayerFighter ? (
          <button
            onClick={handleStop}
            disabled={hasMyPlayerStopped}
            className={`w-full py-5 rounded-2xl font-display font-black text-2xl uppercase tracking-wider transition-all transform active:scale-95 shadow-xl cursor-pointer ${
              hasMyPlayerStopped
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                : 'bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 text-white shadow-red-500/30 glow-crimson border-2 border-red-400'
            }`}
          >
            {hasMyPlayerStopped ? 'LOCKED IN!' : '⚡ SLAM AT 05.000s! ⚡'}
          </button>
        ) : (
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-center w-full">
            <span className="text-xs font-mono text-cyan-300">
              👁️ SPECTATOR VIEW: Watching fighters time their buzzer slams in the blind!
            </span>
          </div>
        )}

        {isPlayerFighter && (
          <div className="text-[11px] font-mono text-slate-400">
            Keyboard: <span className="text-slate-200 font-semibold">[Space]</span> or{' '}
            <span className="text-slate-200 font-semibold">[Enter]</span>
          </div>
        )}
      </div>
    </div>
  );
};
