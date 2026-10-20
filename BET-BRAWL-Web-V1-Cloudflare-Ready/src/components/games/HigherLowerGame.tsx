/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Mini-Game 4 - Higher or Lower (Authoritative Trivia Showdown)
 */

import React, { useState } from 'react';
import type { PublicPlayer } from '../../engine/types.ts';
import { sound } from '../../engine/audio.ts';

interface PublicTriviaCard {
  baseItem: string;
  baseStat: string;
  challengerItem: string;
}

interface Props {
  fighterA: PublicPlayer;
  fighterB: PublicPlayer;
  isPlayerFighter: boolean;
  playerFighterSlot: 'A' | 'B' | 'spectator';
  fighterScores: Record<string, number>;
  gameState?: Record<string, unknown>;
  gameConfig?: Record<string, unknown>;
  lastActionFeedback?: {
    fighterId?: string;
    questionIndex: number;
    isCorrect: boolean;
    challengerStat: string;
  } | null;
  onSendAction: (action: { type: 'GUESS'; questionIndex: number; guess: 'HIGHER' | 'LOWER' }) => void;
}

export const HigherLowerGame: React.FC<Props> = ({
  fighterA,
  fighterB,
  isPlayerFighter,
  playerFighterSlot,
  fighterScores,
  gameState,
  gameConfig,
  lastActionFeedback,
  onSendAction,
}) => {
  const cards: PublicTriviaCard[] = (gameConfig?.cards as PublicTriviaCard[]) || [];

  const scoreA = fighterScores[fighterA.id] || 0;
  const scoreB = fighterScores[fighterB.id] || 0;

  const myFighterId = playerFighterSlot === 'A' ? fighterA.id : playerFighterSlot === 'B' ? fighterB.id : null;
  const stepIndices = (gameState?.stepIndex as Record<string, number>) || {};
  const myStepIndex = myFighterId ? (stepIndices[myFighterId] || 0) : 0;

  const [feedback, setFeedback] = useState<{ isCorrect: boolean; challengerStat: string } | null>(null);
  const [waitingNext, setWaitingNext] = useState<boolean>(false);
  const [submittedIndex, setSubmittedIndex] = useState<number | null>(null);

  const handleGuess = (guess: 'HIGHER' | 'LOWER') => {
    if (!isPlayerFighter || waitingNext || myStepIndex >= cards.length) return;

    sound.playTap(true);
    setWaitingNext(true);
    setSubmittedIndex(myStepIndex);

    onSendAction({
      type: 'GUESS',
      questionIndex: myStepIndex,
      guess,
    });
  };

  React.useEffect(() => {
    if (submittedIndex === null) return;

    // Check authoritative feedback from server action result or sanitized gameState reveals
    const reveal = (lastActionFeedback && lastActionFeedback.questionIndex === submittedIndex)
      ? lastActionFeedback
      : (myFighterId && gameState?.reveals && (gameState.reveals as Record<string, Record<number, any>>)[myFighterId]?.[submittedIndex])
        ? (gameState.reveals as Record<string, Record<number, any>>)[myFighterId][submittedIndex]
        : null;

    if (reveal) {
      setFeedback({
        isCorrect: reveal.isCorrect,
        challengerStat: reveal.challengerStat || '',
      });

      if (reveal.isCorrect) {
        sound.playCoin();
      } else {
        sound.playBuzzer();
      }

      const timer = setTimeout(() => {
        setFeedback(null);
        setWaitingNext(false);
        setSubmittedIndex(null);
      }, 700);

      return () => clearTimeout(timer);
    }
  }, [lastActionFeedback, gameState, submittedIndex, myFighterId]);

  const currentCard = cards[Math.min(cards.length - 1, myStepIndex)];

  return (
    <div className="flex flex-col items-center justify-between w-full max-w-xl mx-auto p-4 py-6 bg-slate-950/90 rounded-3xl border border-cyan-500/30 text-white min-h-[460px]">
      {/* Top Banner */}
      <div className="text-center space-y-1">
        <span className="px-3 py-1 bg-cyan-950 text-cyan-300 border border-cyan-700/60 rounded-full text-xs font-mono font-bold tracking-wider">
          RACE TO 3 · HIGHEST SCORE AT TIMEOUT WINS
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
      {isPlayerFighter && currentCard && myStepIndex < cards.length ? (
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
          <div className={`p-4 rounded-2xl bg-slate-900/90 border-2 text-center transition-all ${
            feedback
              ? feedback.isCorrect
                ? 'border-emerald-500 bg-emerald-950/50'
                : 'border-rose-500 bg-rose-950/50'
              : 'border-cyan-500/50'
          }`}>
            <div className="text-[11px] font-mono uppercase text-cyan-400">
              {feedback ? (
                <span className={feedback.isCorrect ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {feedback.isCorrect ? '✓ CORRECT!' : '✗ WRONG!'}
                </span>
              ) : (
                'IS THIS HIGHER OR LOWER?'
              )}
            </div>
            <div className="text-base font-bold text-white mt-1">{currentCard.challengerItem}</div>
            {feedback && feedback.challengerStat && (
              <div className="text-lg font-mono font-bold text-white mt-1">
                Actual: {feedback.challengerStat}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center w-full my-auto">
          <div className="text-4xl mb-2">⚖️</div>
          <span className="text-sm font-mono text-cyan-300">
            {myStepIndex >= cards.length
              ? 'Completed all comparisons! Syncing result...'
              : '👁️ SPECTATOR VIEW: Both fighters making live calls!'}
          </span>
        </div>
      )}

      {/* Action Buttons */}
      {isPlayerFighter && myStepIndex < cards.length ? (
        <div className="grid grid-cols-2 gap-4 w-full">
          <button
            onClick={() => handleGuess('HIGHER')}
            disabled={waitingNext}
            className="py-4 rounded-2xl font-display font-black text-xl uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 glow-cyan border border-emerald-400 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            ⬆️ HIGHER
          </button>
          <button
            onClick={() => handleGuess('LOWER')}
            disabled={waitingNext}
            className="py-4 rounded-2xl font-display font-black text-xl uppercase tracking-wider bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30 glow-crimson border border-rose-400 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            ⬇️ LOWER
          </button>
        </div>
      ) : null}
    </div>
  );
};
