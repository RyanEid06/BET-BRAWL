/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Mini-Game 6 - Quick Draw (Fastest Finger Showdown)
 */

import React, { useState, useEffect, useRef } from 'react';
import type { Player } from '../../engine/types.ts';
import { sound } from '../../engine/audio.ts';

interface Props {
  fighterA: Player;
  fighterB: Player;
  isPlayerFighter: boolean;
  playerFighterSlot: 'A' | 'B' | 'spectator';
  gameConfig?: Record<string, unknown>;
  onComplete: (winnerId: string, scores: Record<string, number>) => void;
  onSendInput?: (action: string, value: number) => void;
}

export const QuickDrawGame: React.FC<Props> = ({
  fighterA,
  fighterB,
  isPlayerFighter,
  playerFighterSlot,
  gameConfig,
  onComplete,
  onSendInput,
}) => {
  const [phase, setPhase] = useState<'WAIT' | 'DRAW' | 'RESOLVED'>('WAIT');
  const [reactionA, setReactionA] = useState<number | null>(null);
  const [reactionB, setReactionB] = useState<number | null>(null);
  const [foulA, setFoulA] = useState<boolean>(false);
  const [foulB, setFoulB] = useState<boolean>(false);
  const [completed, setCompleted] = useState<boolean>(false);

  const drawDelay = typeof gameConfig?.drawDelayMs === 'number' ? gameConfig.drawDelayMs : 2500;
  const drawTimeRef = useRef<number>(0);
  const startWaitRef = useRef<number>(Date.now());

  // Wait timer leading to "DRAW!"
  useEffect(() => {
    startWaitRef.current = Date.now();

    const timer = setTimeout(() => {
      setPhase('DRAW');
      drawTimeRef.current = Date.now();
      sound.playCountdown(true);
    }, drawDelay);

    return () => clearTimeout(timer);
  }, [drawDelay]);

  // Bot opponent reaction simulation
  useEffect(() => {
    if (phase !== 'DRAW' || completed) return;

    // Bot reacts in 260 - 450ms
    const botReaction = Math.floor(260 + Math.random() * 190);
    const botTimer = setTimeout(() => {
      if (playerFighterSlot === 'A' && reactionB === null) {
        setReactionB(botReaction);
      } else if (playerFighterSlot === 'B' && reactionA === null) {
        setReactionA(botReaction);
      } else if (playerFighterSlot === 'spectator') {
        setReactionA(Math.floor(280 + Math.random() * 140));
        setReactionB(Math.floor(280 + Math.random() * 140));
      }
    }, botReaction);

    return () => clearTimeout(botTimer);
  }, [phase, completed, playerFighterSlot, reactionA, reactionB]);

  // Handle tap
  const handleTap = () => {
    if (completed) return;

    if (phase === 'WAIT') {
      // FALSE START FOUL!
      sound.playBuzzer();
      if (playerFighterSlot === 'A') {
        setFoulA(true);
      } else if (playerFighterSlot === 'B') {
        setFoulB(true);
      }
      return;
    }

    if (phase === 'DRAW') {
      const reactionMs = Date.now() - drawTimeRef.current;
      sound.playTap(true);

      if (playerFighterSlot === 'A' && reactionA === null) {
        setReactionA(reactionMs);
        if (onSendInput) onSendInput('DRAW', reactionMs);
      } else if (playerFighterSlot === 'B' && reactionB === null) {
        setReactionB(reactionMs);
        if (onSendInput) onSendInput('DRAW', reactionMs);
      }
    }
  };

  // Bind Spacebar / Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handleTap();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, completed, reactionA, reactionB]);

  // Resolve winner
  useEffect(() => {
    if (completed) return;

    // Case 1: Foul occurred
    if (foulA) {
      setCompleted(true);
      setPhase('RESOLVED');
      sound.playFanfare();
      setTimeout(() => {
        onComplete(fighterB.id, { [fighterA.id]: 0, [fighterB.id]: 1 });
      }, 2500);
      return;
    }
    if (foulB) {
      setCompleted(true);
      setPhase('RESOLVED');
      sound.playFanfare();
      setTimeout(() => {
        onComplete(fighterA.id, { [fighterA.id]: 1, [fighterB.id]: 0 });
      }, 2500);
      return;
    }

    // Case 2: Both have reacted
    if (reactionA !== null && reactionB !== null) {
      setCompleted(true);
      setPhase('RESOLVED');
      sound.playFanfare();

      const winnerId = reactionA <= reactionB ? fighterA.id : fighterB.id;
      setTimeout(() => {
        onComplete(winnerId, {
          [fighterA.id]: reactionA,
          [fighterB.id]: reactionB,
        });
      }, 2500);
    }
  }, [reactionA, reactionB, foulA, foulB, completed, fighterA, fighterB, onComplete]);

  return (
    <div className="flex flex-col items-center justify-between w-full max-w-xl mx-auto p-4 py-6 bg-slate-950/90 rounded-3xl border border-cyan-500/30 text-white min-h-[460px]">
      {/* Top Banner */}
      <div className="text-center space-y-1">
        <span className="px-3 py-1 bg-amber-950 text-amber-300 border border-amber-700/60 rounded-full text-xs font-mono font-bold tracking-wider">
          FASTEST REACTION WINS · EARLY TAP = FOUL
        </span>
        <h3 className="text-xl font-black font-display tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-rose-400">
          QUICK DRAW SHOWDOWN
        </h3>
      </div>

      {/* Main Flash Arena */}
      <div
        className={`w-full py-12 px-6 rounded-3xl flex flex-col items-center justify-center transition-all duration-150 border-4 shadow-2xl ${
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
            ? 'TAP NOW AS FAST AS POSSIBLE!'
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
              <span className="text-rose-400">DISQUALIFIED (Early)</span>
            ) : reactionA !== null ? (
              <span className="text-cyan-300">{reactionA} ms</span>
            ) : (
              <span className="text-xs text-slate-500">Ready...</span>
            )}
          </div>
        </div>

        {/* Fighter B */}
        <div className="p-3 bg-slate-900 rounded-2xl border border-amber-500/30 text-center">
          <div className="text-xs font-mono text-amber-400 font-bold">{fighterB.avatar} {fighterB.name}</div>
          <div className="text-lg font-mono font-black text-white mt-1">
            {foulB ? (
              <span className="text-rose-400">DISQUALIFIED (Early)</span>
            ) : reactionB !== null ? (
              <span className="text-amber-300">{reactionB} ms</span>
            ) : (
              <span className="text-xs text-slate-500">Ready...</span>
            )}
          </div>
        </div>
      </div>

      {/* Tap Action Button */}
      <div className="w-full">
        {isPlayerFighter ? (
          <button
            onClick={handleTap}
            disabled={completed || (playerFighterSlot === 'A' ? reactionA !== null : reactionB !== null)}
            className={`w-full py-6 rounded-2xl font-display font-black text-2xl uppercase tracking-wider transition-all transform active:scale-95 shadow-xl select-none cursor-pointer ${
              phase === 'DRAW'
                ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500 text-slate-950 glow-cyan border-2 border-emerald-300'
                : 'bg-gradient-to-r from-amber-600 to-rose-600 text-white border-2 border-amber-400'
            }`}
          >
            {phase === 'DRAW' ? '⚡ SLAM TAP NOW! ⚡' : 'WAIT FOR DRAW...'}
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
