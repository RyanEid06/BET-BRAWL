/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Mini-Game 3 - Speed Math (Fast Calculation)
 */

import React, { useState, useEffect } from 'react';
import type { Player } from '../../engine/types.ts';
import { sound } from '../../engine/audio.ts';
import { generateMathQuestions, MathQuestion } from '../../engine/miniGamesCatalog.ts';

interface Props {
  fighterA: Player;
  fighterB: Player;
  isPlayerFighter: boolean;
  playerFighterSlot: 'A' | 'B' | 'spectator';
  gameConfig?: Record<string, unknown>;
  onComplete: (winnerId: string | null, scores: Record<string, number>, isTie?: boolean) => void;
  onSendInput?: (action: string, value: number) => void;
}

export const SpeedMathGame: React.FC<Props> = ({
  fighterA,
  fighterB,
  isPlayerFighter,
  playerFighterSlot,
  gameConfig,
  onComplete,
  onSendInput,
}) => {
  const [questions] = useState<MathQuestion[]>(() => {
    return (gameConfig?.mathQuestions as MathQuestion[]) || generateMathQuestions(3);
  });

  const [stepA, setStepA] = useState<number>(0);
  const [stepB, setStepB] = useState<number>(0);
  const [penaltyA, setPenaltyA] = useState<boolean>(false);
  const [penaltyB, setPenaltyB] = useState<boolean>(false);
  const [completed, setCompleted] = useState<boolean>(false);

  // Bot opponent simulation
  useEffect(() => {
    if (completed) return;

    const botInterval = setInterval(() => {
      if (playerFighterSlot === 'A') {
        if (!penaltyB && stepB < 3) {
          if (Math.random() < 0.85) {
            setStepB(prev => prev + 1);
          } else {
            setPenaltyB(true);
            setTimeout(() => setPenaltyB(false), 1500); // 1.5s consistent penalty
          }
        }
      } else if (playerFighterSlot === 'B') {
        if (!penaltyA && stepA < 3) {
          if (Math.random() < 0.85) {
            setStepA(prev => prev + 1);
          } else {
            setPenaltyA(true);
            setTimeout(() => setPenaltyA(false), 1500); // 1.5s consistent penalty
          }
        }
      } else {
        // Spectator view
        setStepA(prev => Math.min(3, prev + 1));
        setStepB(prev => Math.min(3, prev + 1));
      }
    }, 2500);

    return () => clearInterval(botInterval);
  }, [stepA, stepB, penaltyA, penaltyB, completed, playerFighterSlot]);

  // Handle player choice
  const handleSelectChoice = (choice: number) => {
    if (completed) return;
    const currentStep = playerFighterSlot === 'A' ? stepA : stepB;
    if (currentStep >= 3) return;

    const isCurrentPenalty = playerFighterSlot === 'A' ? penaltyA : penaltyB;
    if (isCurrentPenalty) return;

    const currentQ = questions[currentStep];
    if (choice === currentQ.correct) {
      sound.playTap(true);
      if (playerFighterSlot === 'A') {
        const nextStep = stepA + 1;
        setStepA(nextStep);
        if (onSendInput) onSendInput('ANSWER', nextStep);
      } else if (playerFighterSlot === 'B') {
        const nextStep = stepB + 1;
        setStepB(nextStep);
        if (onSendInput) onSendInput('ANSWER', nextStep);
      }
    } else {
      sound.playTap(false);
      // Consistent 1.5 second penalty freeze
      if (playerFighterSlot === 'A') {
        setPenaltyA(true);
        setTimeout(() => setPenaltyA(false), 1500);
      } else if (playerFighterSlot === 'B') {
        setPenaltyB(true);
        setTimeout(() => setPenaltyB(false), 1500);
      }
    }
  };

  // Check completion
  useEffect(() => {
    if (completed) return;

    if (stepA >= 3 || stepB >= 3) {
      setCompleted(true);
      const isTie = stepA >= 3 && stepB >= 3;
      const winnerId = isTie ? null : stepA >= 3 ? fighterA.id : fighterB.id;
      sound.playFanfare();

      setTimeout(() => {
        onComplete(
          winnerId,
          {
            [fighterA.id]: stepA,
            [fighterB.id]: stepB,
          },
          isTie
        );
      }, 2200);
    }
  }, [stepA, stepB, completed, fighterA, fighterB, onComplete]);

  const activeStep = playerFighterSlot === 'A' ? stepA : stepB;
  const currentQ = questions[Math.min(2, activeStep)];
  const isPenalized = playerFighterSlot === 'A' ? penaltyA : penaltyB;

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
            <span className="text-cyan-300 font-bold">{stepA}/3</span>
          </div>
          <div className="flex gap-1.5 h-3">
            {[0, 1, 2].map(idx => (
              <div
                key={idx}
                className={`flex-1 rounded-full transition-all ${
                  idx < stepA ? 'bg-cyan-400 glow-cyan' : 'bg-slate-800'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="bg-slate-900/80 p-3 rounded-2xl border border-amber-500/30">
          <div className="flex justify-between items-center text-xs font-mono mb-1">
            <span className="text-amber-400 font-bold">{fighterB.avatar} {fighterB.name}</span>
            <span className="text-amber-300 font-bold">{stepB}/3</span>
          </div>
          <div className="flex gap-1.5 h-3">
            {[0, 1, 2].map(idx => (
              <div
                key={idx}
                className={`flex-1 rounded-full transition-all ${
                  idx < stepB ? 'bg-amber-400 glow-gold' : 'bg-slate-800'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Main Math Problem Card */}
      {isPlayerFighter && activeStep < 3 ? (
        <div className="w-full flex flex-col items-center gap-4">
          <div
            className={`w-full py-8 rounded-3xl bg-slate-900 border-2 text-center transition-all ${
              isPenalized ? 'border-rose-500 bg-rose-950/50 animate-shake' : 'border-cyan-400/50'
            }`}
          >
            <div className="text-xs font-mono uppercase tracking-widest text-slate-400 mb-1">
              {isPenalized ? '❌ 1.5s PENALTY FREEZE' : `QUESTION ${activeStep + 1} OF 3`}
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
                disabled={isPenalized || completed}
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
            {activeStep >= 3 ? 'FINISHED! Calculating results...' : '👁️ SPECTATOR: Both fighters in mental arithmetic race!'}
          </span>
        </div>
      )}
    </div>
  );
};
