/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Mini-Game 1 - Millisecond Stop (Precision Timer)
 */

import React, { useState, useEffect, useRef } from 'react';
import type { Player } from '../../engine/types.ts';
import { sound } from '../../engine/audio.ts';

interface Props {
  fighterA: Player;
  fighterB: Player;
  isPlayerFighter: boolean;
  playerFighterSlot: 'A' | 'B' | 'spectator';
  onComplete: (winnerId: string | null, scores: Record<string, number>, isTie?: boolean) => void;
  onSendInput?: (action: string, value: number) => void;
}

export const MillisecondStopGame: React.FC<Props> = ({
  fighterA,
  fighterB,
  isPlayerFighter,
  playerFighterSlot,
  onComplete,
  onSendInput,
}) => {
  const [elapsed, setElapsed] = useState<number>(0);
  const [stoppedA, setStoppedA] = useState<number | null>(null);
  const [stoppedB, setStoppedB] = useState<number | null>(null);
  const [completed, setCompleted] = useState<boolean>(false);

  // IMMUTABLE high-resolution start time: initialized ONCE on mount
  const startTimeRef = useRef<number>(performance.now());
  const timerFrameRef = useRef<number | null>(null);
  const completedRef = useRef<boolean>(false);

  const TARGET_TIME = 5.0;

  // Bot opponent timing simulation (variance around 4.85 - 5.20s)
  useEffect(() => {
    const botVariation = (Math.random() - 0.48) * 0.38;
    const botTarget = 5.0 + botVariation;
    const botDelayMs = botTarget * 1000;

    const botTimer = setTimeout(() => {
      if (playerFighterSlot === 'A') {
        setStoppedB(botTarget);
      } else if (playerFighterSlot === 'B') {
        setStoppedA(botTarget);
      } else {
        // Spectator view: simulate both
        setStoppedA(5.0 + (Math.random() - 0.46) * 0.32);
        setStoppedB(5.0 + (Math.random() - 0.52) * 0.32);
      }
    }, botDelayMs);

    return () => clearTimeout(botTimer);
  }, [playerFighterSlot]);

  // Main 60fps timer loop: depends ONLY on empty dependency array so it NEVER resets!
  useEffect(() => {
    startTimeRef.current = performance.now();

    const loop = () => {
      if (completedRef.current) return;
      const now = performance.now();
      const currentElapsed = (now - startTimeRef.current) / 1000;
      setElapsed(currentElapsed);

      if (currentElapsed < 7.5) {
        timerFrameRef.current = requestAnimationFrame(loop);
      }
    };

    timerFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (timerFrameRef.current) cancelAnimationFrame(timerFrameRef.current);
    };
  }, []); // Run once on mount! Never restart on state changes!

  // Derived display state: blinded strictly when elapsed >= 3.0
  const isBlinded = elapsed >= 3.0;

  // Handle player stop press
  const handleStop = () => {
    if (completed || completedRef.current) return;
    const currentPress = elapsed;

    sound.playTap(true);

    if (playerFighterSlot === 'A' && stoppedA === null) {
      setStoppedA(currentPress);
      if (onSendInput) onSendInput('STOP', currentPress);
    } else if (playerFighterSlot === 'B' && stoppedB === null) {
      setStoppedB(currentPress);
      if (onSendInput) onSendInput('STOP', currentPress);
    }
  };

  // Bind Spacebar / Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handleStop();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [elapsed, stoppedA, stoppedB, completed]);

  // Evaluate winner when both have stopped
  useEffect(() => {
    if (completed) return;

    if (stoppedA !== null && stoppedB !== null) {
      completedRef.current = true;
      setCompleted(true);

      const deltaA = Math.abs(stoppedA - TARGET_TIME);
      const deltaB = Math.abs(stoppedB - TARGET_TIME);

      const isTie = Math.abs(deltaA - deltaB) < 0.001;
      const winnerId = isTie ? null : deltaA < deltaB ? fighterA.id : fighterB.id;

      sound.playFanfare();

      setTimeout(() => {
        onComplete(
          winnerId,
          {
            [fighterA.id]: Math.round(stoppedA * 1000) / 1000,
            [fighterB.id]: Math.round(stoppedB * 1000) / 1000,
          },
          isTie
        );
      }, 2600);
    }
  }, [stoppedA, stoppedB, completed, fighterA, fighterB, onComplete]);

  const formatTime = (t: number) => t.toFixed(3);

  return (
    <div className="flex flex-col items-center justify-between w-full max-w-xl mx-auto p-4 py-6 bg-slate-950/90 rounded-3xl border border-cyan-500/30 text-white min-h-[460px]">
      {/* Top Banner */}
      <div className="text-center space-y-1">
        <span className="px-3 py-1 bg-cyan-950 text-cyan-300 border border-cyan-700/60 rounded-full text-xs font-mono font-bold tracking-wider">
          TARGET: 05.000s (BLINDS AT 03.000s)
        </span>
        <h3 className="text-xl font-black font-display tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-amber-400">
          MILLISECOND STOP
        </h3>
      </div>

      {/* Main Clock Face */}
      <div className="relative flex flex-col items-center justify-center w-72 h-40 rounded-2xl bg-black border-2 border-slate-700 shadow-2xl p-4 overflow-hidden">
        <div className={`absolute inset-0 transition-opacity duration-300 ${isBlinded ? 'bg-red-950/20' : 'bg-cyan-950/20'}`} />

        <div className="text-[11px] uppercase font-mono tracking-widest text-slate-400 mb-1">
          {isBlinded ? 'BLIND ZONE ACTIVE' : 'PRECISION TIMER'}
        </div>

        <div className="text-5xl font-mono font-black text-center tracking-wider text-glow-cyan">
          {isBlinded && !completed && (playerFighterSlot === 'A' ? stoppedA === null : stoppedB === null) ? (
            <span className="text-amber-400 animate-pulse tracking-widest">??.???</span>
          ) : (
            <span className={elapsed >= 5.0 ? 'text-amber-400' : 'text-cyan-400'}>
              {formatTime(elapsed)}
              <span className="text-xs ml-1 text-slate-400">s</span>
            </span>
          )}
        </div>

        <div className="mt-2 text-xs font-mono text-slate-400">
          Target: <span className="text-white font-bold">05.000s</span>
        </div>
      </div>

      {/* Fighters Dual Scoreboard */}
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
          <div className="font-mono text-base font-bold">
            {stoppedA !== null ? (
              <div>
                <div className="text-cyan-300">{formatTime(stoppedA)}s</div>
                <div className="text-[10px] text-amber-300">
                  Δ {Math.abs(stoppedA - TARGET_TIME).toFixed(3)}s error
                </div>
              </div>
            ) : (
              <span className="text-xs text-slate-500">Timing slam...</span>
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
          <div className="font-mono text-base font-bold">
            {stoppedB !== null ? (
              <div>
                <div className="text-amber-300">{formatTime(stoppedB)}s</div>
                <div className="text-[10px] text-cyan-300">
                  Δ {Math.abs(stoppedB - TARGET_TIME).toFixed(3)}s error
                </div>
              </div>
            ) : (
              <span className="text-xs text-slate-500">Timing slam...</span>
            )}
          </div>
        </div>
      </div>

      {/* Slam Button */}
      <div className="w-full flex flex-col items-center gap-2">
        {isPlayerFighter ? (
          <button
            onClick={handleStop}
            disabled={
              (playerFighterSlot === 'A' && stoppedA !== null) ||
              (playerFighterSlot === 'B' && stoppedB !== null) ||
              completed
            }
            className={`w-full py-5 rounded-2xl font-display font-black text-2xl uppercase tracking-wider transition-all transform active:scale-95 shadow-xl cursor-pointer ${
              (playerFighterSlot === 'A' && stoppedA !== null) || (playerFighterSlot === 'B' && stoppedB !== null)
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                : 'bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 text-white shadow-red-500/30 glow-crimson border-2 border-red-400'
            }`}
          >
            {(playerFighterSlot === 'A' && stoppedA !== null) || (playerFighterSlot === 'B' && stoppedB !== null)
              ? 'LOCKED IN!'
              : '⚡ SLAM AT 05.000s! ⚡'}
          </button>
        ) : (
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-center w-full">
            <span className="text-xs font-mono text-cyan-300">
              👁️ SPECTATOR VIEW: Both fighters timing their buzzer slams!
            </span>
          </div>
        )}

        <div className="text-[11px] font-mono text-slate-400">
          Keyboard: <span className="text-slate-200 font-semibold">[Space]</span> or{' '}
          <span className="text-slate-200 font-semibold">[Enter]</span>
        </div>
      </div>
    </div>
  );
};
