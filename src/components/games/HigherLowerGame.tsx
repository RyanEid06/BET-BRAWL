/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Mini-Game 4 - Higher or Lower (Stable Trivia Showdown)
 */

import React, { useState, useEffect } from 'react';
import type { Player } from '../../engine/types.ts';
import { sound } from '../../engine/audio.ts';
import { STABLE_HIGHER_LOWER_BANK, HigherLowerTrivia } from '../../engine/miniGamesCatalog.ts';

interface Props {
  fighterA: Player;
  fighterB: Player;
  isPlayerFighter: boolean;
  playerFighterSlot: 'A' | 'B' | 'spectator';
  gameConfig?: Record<string, unknown>;
  onComplete: (winnerId: string | null, scores: Record<string, number>, isTie?: boolean) => void;
  onSendInput?: (action: string, value: number) => void;
}

export const HigherLowerGame: React.FC<Props> = ({
  fighterA,
  fighterB,
  isPlayerFighter,
  playerFighterSlot,
  gameConfig,
  onComplete,
  onSendInput,
}) => {
  const initialIndex = typeof gameConfig?.triviaIndex === 'number'
    ? gameConfig.triviaIndex
    : Math.floor(Math.random() * STABLE_HIGHER_LOWER_BANK.length);

  const [qIndex, setQIndex] = useState<number>(initialIndex);
  const [scoreA, setScoreA] = useState<number>(0);
  const [scoreB, setScoreB] = useState<number>(0);
  const [reveal, setReveal] = useState<string | null>(null);
  const [completed, setCompleted] = useState<boolean>(false);

  const currentCard: HigherLowerTrivia = STABLE_HIGHER_LOWER_BANK[qIndex % STABLE_HIGHER_LOWER_BANK.length];

  // Bot simulation
  useEffect(() => {
    if (completed || reveal) return;

    const botTimer = setTimeout(() => {
      const botCorrect = Math.random() < 0.75;
      if (playerFighterSlot === 'A') {
        if (botCorrect) setScoreB(s => s + 1);
      } else if (playerFighterSlot === 'B') {
        if (botCorrect) setScoreA(s => s + 1);
      } else {
        if (botCorrect) setScoreA(s => s + 1);
        if (Math.random() < 0.75) setScoreB(s => s + 1);
      }
    }, 2800);

    return () => clearTimeout(botTimer);
  }, [qIndex, reveal, completed, playerFighterSlot]);

  const handleGuess = (guessedHigher: boolean) => {
    if (completed || reveal) return;

    const isCorrect = guessedHigher === currentCard.isHigher;
    setReveal(currentCard.challengerStat);

    if (isCorrect) {
      sound.playTap(true);
      if (playerFighterSlot === 'A') {
        const nextScore = scoreA + 1;
        setScoreA(nextScore);
        if (onSendInput) onSendInput('SCORE', nextScore);
      } else if (playerFighterSlot === 'B') {
        const nextScore = scoreB + 1;
        setScoreB(nextScore);
        if (onSendInput) onSendInput('SCORE', nextScore);
      }
    } else {
      sound.playTap(false);
    }

    setTimeout(() => {
      setReveal(null);
      setQIndex(prev => prev + 1);
    }, 1500);
  };

  // Check victory
  useEffect(() => {
    if (completed) return;

    if (scoreA >= 3 || scoreB >= 3) {
      setCompleted(true);
      const isTie = scoreA >= 3 && scoreB >= 3;
      const winnerId = isTie ? null : scoreA >= 3 ? fighterA.id : fighterB.id;
      sound.playFanfare();

      setTimeout(() => {
        onComplete(
          winnerId,
          {
            [fighterA.id]: scoreA,
            [fighterB.id]: scoreB,
          },
          isTie
        );
      }, 2200);
    }
  }, [scoreA, scoreB, completed, fighterA, fighterB, onComplete]);

  return (
    <div className="flex flex-col items-center justify-between w-full max-w-xl mx-auto p-4 py-6 bg-slate-950/90 rounded-3xl border border-cyan-500/30 text-white min-h-[460px]">
      {/* Top Banner */}
      <div className="text-center space-y-1">
        <span className="px-3 py-1 bg-cyan-950 text-cyan-300 border border-cyan-700/60 rounded-full text-xs font-mono font-bold tracking-wider">
          FIRST TO 3 CORRECT LOCKS
        </span>
        <h3 className="text-xl font-black font-display tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-rose-400">
          HIGHER OR LOWER SHOWDOWN
        </h3>
      </div>

      {/* Score indicators */}
      <div className="flex justify-between w-full px-4">
        <div className="text-xs font-mono font-bold text-cyan-400">
          {fighterA.avatar} {fighterA.name}: {scoreA}/3
        </div>
        <div className="text-xs font-mono font-bold text-amber-400">
          {fighterB.avatar} {fighterB.name}: {scoreB}/3
        </div>
      </div>

      {/* Comparison Cards */}
      <div className="w-full space-y-3">
        {/* Base Item */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-700 text-center">
          <div className="text-[11px] font-mono uppercase text-slate-400">BASELINE</div>
          <div className="text-base font-bold text-white mt-1">{currentCard.baseItem}</div>
          <div className="text-2xl font-mono font-black text-amber-400 mt-0.5">{currentCard.baseStat}</div>
        </div>

        <div className="text-center font-display font-black text-xs tracking-widest text-slate-500">
          --- VS ---
        </div>

        {/* Challenger Item */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border-2 border-cyan-500/50 text-center">
          <div className="text-[11px] font-mono uppercase text-cyan-400">IS THIS HIGHER OR LOWER?</div>
          <div className="text-base font-bold text-white mt-1">{currentCard.challengerItem}</div>
          {reveal && (
            <div className="text-xl font-mono font-black text-emerald-400 mt-1 animate-bounce">
              {reveal} {currentCard.isHigher ? '(HIGHER)' : '(LOWER)'}
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      {isPlayerFighter ? (
        <div className="grid grid-cols-2 gap-4 w-full">
          <button
            onClick={() => handleGuess(true)}
            disabled={!!reveal || completed}
            className="py-4 rounded-2xl font-display font-black text-xl uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 glow-cyan border border-emerald-400 active:scale-95 transition-all cursor-pointer"
          >
            ⬆️ HIGHER
          </button>
          <button
            onClick={() => handleGuess(false)}
            disabled={!!reveal || completed}
            className="py-4 rounded-2xl font-display font-black text-xl uppercase tracking-wider bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30 glow-crimson border border-rose-400 active:scale-95 transition-all cursor-pointer"
          >
            ⬇️ LOWER
          </button>
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-center w-full">
          <span className="text-xs font-mono text-cyan-300">
            👁️ SPECTATOR VIEW: Both fighters making high/low calls!
          </span>
        </div>
      )}
    </div>
  );
};
