/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Mini-Game 3 - Speed Math (Authoritative Fast Calculation)
 */

import React, { useState, useEffect } from 'react';
import type { PublicPlayer } from '../../engine/types.ts';
import { sound } from '../../engine/audio.ts';

interface QuestionPublic {
  q: string;
  choices: number[];
}

interface Props {
  fighterA: PublicPlayer;
  fighterB: PublicPlayer;
  isPlayerFighter: boolean;
  playerFighterSlot: 'A' | 'B' | 'spectator';
  fighterScores: Record<string, number>;
  gameState?: Record<string, unknown>;
  gameConfig?: Record<string, unknown>;
  onSendAction: (action: { type: 'ANSWER'; questionIndex: number; answer: number }) => void;
}

export const SpeedMathGame: React.FC<Props> = ({
  fighterA,
  fighterB,
  isPlayerFighter,
  playerFighterSlot,
  fighterScores,
  gameState,
  gameConfig,
  onSendAction,
}) => {
  const questions: QuestionPublic[] = (gameConfig?.questions as QuestionPublic[]) || [
    { q: '12 + 15', choices: [27, 25, 29, 31] },
    { q: '45 - 18', choices: [27, 23, 26, 28] },
    { q: '7 × 8', choices: [56, 54, 48, 64] },
  ];

  const scoreA = fighterScores[fighterA.id] || 0;
  const scoreB = fighterScores[fighterB.id] || 0;

  const myFighterId = playerFighterSlot === 'A' ? fighterA.id : playerFighterSlot === 'B' ? fighterB.id : null;
  const myProgress = myFighterId ? (fighterScores[myFighterId] || 0) : 0;

  // Local feedback on selection
  const [localPenalty, setLocalPenalty] = useState<boolean>(false);
  const penalties = (gameState?.penaltyUntil as Record<string, number>) || {};
  const isServerPenalized = myFighterId ? (penalties[myFighterId] && Date.now() < penalties[myFighterId]) : false;
  const isPenalized = localPenalty || !!isServerPenalized;

  const handleSelectChoice = (choice: number) => {
    if (!isPlayerFighter || isPenalized || myProgress >= 3) return;

    sound.playTap(true);
    onSendAction({
      type: 'ANSWER',
      questionIndex: myProgress,
      answer: choice,
    });
  };

  const activeQuestionIndex = Math.min(2, myProgress);
  const currentQ = questions[activeQuestionIndex];

  return (
    <div className="flex flex-col items-center justify-between w-full max-w-xl mx-auto p-4 py-6 bg-slate-950/90 rounded-3xl border border-cyan-500/30 text-white min-h-[460px]">
      {/* Top Banner */}
      <div className="text-center space-y-1">
        <span className="px-3 py-1 bg-cyan-950 text-cyan-300 border border-cyan-700/60 rounded-full text-xs font-mono font-bold tracking-wider">
          RACE TO 3 CORRECT ANSWERS · 1.5s PENALTY
        </span>
        <h3 className="text-xl font-black font-display tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400">
          SPEED MATH SHOWDOWN
        </h3>
      </div>

      {/* Progress Bars */}
      <div className="grid grid-cols-2 gap-4 w-full">
        <div className="bg-slate-900/80 p-3 rounded-2xl border border-cyan-500/30">
          <div className="flex justify-between items-center text-xs font-mono mb-1">
            <span className="text-cyan-400 font-bold">{fighterA.avatar} {fighterA.name}</span>
            <span className="text-cyan-300 font-bold">{scoreA}/3</span>
          </div>
          <div className="flex gap-1.5 h-3">
            {[0, 1, 2].map(idx => (
              <div
                key={idx}
                className={`flex-1 rounded-full transition-all ${
                  idx < scoreA ? 'bg-cyan-400 glow-cyan' : 'bg-slate-800'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="bg-slate-900/80 p-3 rounded-2xl border border-amber-500/30">
          <div className="flex justify-between items-center text-xs font-mono mb-1">
            <span className="text-amber-400 font-bold">{fighterB.avatar} {fighterB.name}</span>
            <span className="text-amber-300 font-bold">{scoreB}/3</span>
          </div>
          <div className="flex gap-1.5 h-3">
            {[0, 1, 2].map(idx => (
              <div
                key={idx}
                className={`flex-1 rounded-full transition-all ${
                  idx < scoreB ? 'bg-amber-400 glow-gold' : 'bg-slate-800'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Main Math Problem Card */}
      {isPlayerFighter && myProgress < 3 && currentQ ? (
        <div className="w-full flex flex-col items-center gap-4">
          <div
            className={`w-full py-8 rounded-3xl bg-slate-900 border-2 text-center transition-all ${
              isPenalized ? 'border-rose-500 bg-rose-950/50 animate-shake' : 'border-cyan-400/50'
            }`}
          >
            <div className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-1">
              {isPenalized ? '❌ 1.5s PENALTY FREEZE' : `QUESTION ${activeQuestionIndex + 1} OF 3`}
            </div>
            <div className="text-5xl font-mono font-black text-cyan-300 tracking-wider">
              {currentQ.q} = ?
            </div>
          </div>

          {/* 4 Choices */}
          <div className="grid grid-cols-2 gap-3 w-full">
            {currentQ.choices.map((choice, idx) => (
              <button
                key={idx}
                onClick={() => handleSelectChoice(choice)}
                disabled={isPenalized}
                className={`py-4 px-6 rounded-2xl font-mono text-2xl font-black transition-all transform active:scale-95 border-2 cursor-pointer ${
                  isPenalized
                    ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
                    : 'bg-slate-900 hover:bg-cyan-950 hover:border-cyan-400 text-white border-slate-700 shadow-lg'
                }`}
              >
                {choice}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-center w-full my-auto">
          <div className="text-4xl mb-2">🧮</div>
          <span className="text-sm font-mono text-cyan-300">
            {myProgress >= 3
              ? 'SOLVED ALL 3 QUESTIONS! Syncing victory...'
              : '👁️ SPECTATOR VIEW: Watching live arithmetic race!'}
          </span>
        </div>
      )}
    </div>
  );
};
