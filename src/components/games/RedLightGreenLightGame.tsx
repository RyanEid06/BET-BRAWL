/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Mini-Game 2 - Rapid Red Light, Green Light (Synchronized Schedule)
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
  onComplete: (winnerId: string | null, scores: Record<string, number>, isTie?: boolean) => void;
  onSendInput?: (action: string, value: number) => void;
}

export const RedLightGreenLightGame: React.FC<Props> = ({
  fighterA,
  fighterB,
  isPlayerFighter,
  playerFighterSlot,
  gameConfig,
  onComplete,
  onSendInput,
}) => {
  const [light, setLight] = useState<'GREEN' | 'RED'>('GREEN');
  const [scoreA, setScoreA] = useState<number>(0);
  const [scoreB, setScoreB] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(15);
  const [lastPenalty, setLastPenalty] = useState<'A' | 'B' | null>(null);
  const [completed, setCompleted] = useState<boolean>(false);

  const TARGET_GOAL = 40;
  const lightRef = useRef<'GREEN' | 'RED'>('GREEN');
  lightRef.current = light;

  // Authoritative light schedule passed from server
  const schedule = (gameConfig?.lightSchedule as Array<{ light: 'GREEN' | 'RED'; durationMs: number }>) || [
    { light: 'GREEN', durationMs: 2200 },
    { light: 'RED', durationMs: 1100 },
    { light: 'GREEN', durationMs: 1800 },
    { light: 'RED', durationMs: 1300 },
    { light: 'GREEN', durationMs: 2400 },
    { light: 'RED', durationMs: 1000 },
    { light: 'GREEN', durationMs: 2000 },
    { light: 'RED', durationMs: 1200 },
    { light: 'GREEN', durationMs: 3000 },
  ];

  // Execute authoritative synchronized schedule
  useEffect(() => {
    let accumulated = 0;
    const timeouts: NodeJS.Timeout[] = [];

    schedule.forEach((step, idx) => {
      accumulated += step.durationMs;
      const t = setTimeout(() => {
        setLight(step.light);
        if (step.light === 'RED') {
          sound.playBuzzer();
        } else {
          sound.playCountdown(false);
        }
      }, accumulated);
      timeouts.push(t);
    });

    return () => timeouts.forEach(clearTimeout);
  }, [schedule]);

  // Bot taps simulation
  useEffect(() => {
    if (completed) return;

    const botInterval = setInterval(() => {
      if (lightRef.current === 'GREEN') {
        if (playerFighterSlot === 'A') {
          setScoreB(prev => Math.min(TARGET_GOAL, prev + 1));
        } else if (playerFighterSlot === 'B') {
          setScoreA(prev => Math.min(TARGET_GOAL, prev + 1));
        } else {
          setScoreA(prev => Math.min(TARGET_GOAL, prev + 1));
          setScoreB(prev => Math.min(TARGET_GOAL, prev + 1));
        }
      } else {
        // Red light: 15% chance bot makes a mistake
        if (Math.random() < 0.15) {
          if (playerFighterSlot === 'A') {
            setScoreB(prev => Math.max(0, prev - 3));
          } else if (playerFighterSlot === 'B') {
            setScoreA(prev => Math.max(0, prev - 3));
          }
        }
      }
    }, 180 + Math.random() * 80);

    return () => clearInterval(botInterval);
  }, [playerFighterSlot, completed]);

  // Round countdown
  useEffect(() => {
    if (completed) return;

    const interval = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [completed]);

  // Player tap action
  const handleTap = () => {
    if (completed) return;

    if (light === 'GREEN') {
      sound.playTap(true);
      if (playerFighterSlot === 'A') {
        const next = Math.min(TARGET_GOAL, scoreA + 1);
        setScoreA(next);
        if (onSendInput) onSendInput('TAP', next);
      } else if (playerFighterSlot === 'B') {
        const next = Math.min(TARGET_GOAL, scoreB + 1);
        setScoreB(next);
        if (onSendInput) onSendInput('TAP', next);
      }
    } else {
      // RED LIGHT FOUL!
      sound.playTap(false);
      if (playerFighterSlot === 'A') {
        const next = Math.max(0, scoreA - 3);
        setScoreA(next);
        setLastPenalty('A');
        if (onSendInput) onSendInput('PENALTY', next);
      } else if (playerFighterSlot === 'B') {
        const next = Math.max(0, scoreB - 3);
        setScoreB(next);
        setLastPenalty('B');
        if (onSendInput) onSendInput('PENALTY', next);
      }
      setTimeout(() => setLastPenalty(null), 500);
    }
  };

  // Bind Space or Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handleTap();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [light, completed, scoreA, scoreB]);

  // Check victory condition
  useEffect(() => {
    if (completed) return;

    if (scoreA >= TARGET_GOAL || scoreB >= TARGET_GOAL || timeLeft === 0) {
      setCompleted(true);
      const isTie = scoreA === scoreB;
      const winnerId = isTie ? null : scoreA > scoreB ? fighterA.id : fighterB.id;
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
  }, [scoreA, scoreB, timeLeft, completed, fighterA, fighterB, onComplete]);

  return (
    <div className="flex flex-col items-center justify-between w-full max-w-xl mx-auto p-4 py-6 bg-slate-950/90 rounded-3xl border border-cyan-500/30 text-white min-h-[460px]">
      {/* Top Banner */}
      <div className="flex items-center justify-between w-full px-2">
        <span className="px-3 py-1 bg-cyan-950 text-cyan-300 border border-cyan-700/60 rounded-full text-xs font-mono font-bold">
          FIRST TO 40 TAPS OR 15s
        </span>
        <div className="font-mono text-sm font-bold bg-slate-900 px-3 py-1 rounded-full border border-slate-700">
          ⏳ {timeLeft}s
        </div>
      </div>

      {/* Synchronized Traffic Light */}
      <div
        className={`w-full py-8 px-4 rounded-3xl flex flex-col items-center justify-center transition-all duration-150 border-4 shadow-2xl ${
          light === 'GREEN'
            ? 'bg-emerald-950/90 border-emerald-400 shadow-emerald-500/40 text-emerald-300'
            : 'bg-rose-950/90 border-rose-500 shadow-rose-600/50 text-rose-300'
        }`}
      >
        <div className="text-6xl mb-1 font-black font-display tracking-widest animate-bounce">
          {light === 'GREEN' ? '🟢 GREEN!' : '🛑 FREEZE!'}
        </div>
        <div className="text-xs uppercase font-mono tracking-widest font-bold opacity-80">
          {light === 'GREEN' ? 'MASH TAP FAST (+1 POINT)' : 'DO NOT TAP! (-3 PENALTY)'}
        </div>
      </div>

      {/* Race Tracks */}
      <div className="w-full space-y-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-bold font-mono">
            <span className="text-cyan-400 flex items-center gap-1">
              {fighterA.avatar} {fighterA.name} {playerFighterSlot === 'A' && '(YOU)'}
            </span>
            <span className="text-cyan-300 font-bold">{scoreA} / 40</span>
          </div>
          <div className="w-full h-3.5 bg-slate-950 rounded-full overflow-hidden border border-slate-700">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-cyan-300 transition-all duration-75"
              style={{ width: `${Math.min(100, (scoreA / 40) * 100)}%` }}
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs font-bold font-mono">
            <span className="text-amber-400 flex items-center gap-1">
              {fighterB.avatar} {fighterB.name} {playerFighterSlot === 'B' && '(YOU)'}
            </span>
            <span className="text-amber-300 font-bold">{scoreB} / 40</span>
          </div>
          <div className="w-full h-3.5 bg-slate-950 rounded-full overflow-hidden border border-slate-700">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-75"
              style={{ width: `${Math.min(100, (scoreB / 40) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Big Mash Button */}
      <div className="w-full">
        {isPlayerFighter ? (
          <button
            onClick={handleTap}
            disabled={completed}
            className={`w-full py-6 rounded-2xl font-display font-black text-2xl uppercase tracking-wider transition-all transform active:scale-95 shadow-xl select-none cursor-pointer ${
              light === 'GREEN'
                ? 'bg-gradient-to-r from-emerald-500 via-green-500 to-teal-400 text-slate-950 border-2 border-emerald-300 glow-cyan'
                : 'bg-gradient-to-r from-rose-800 to-red-900 text-rose-200 border-2 border-rose-600 shadow-rose-950'
            } ${lastPenalty ? 'animate-shake' : ''}`}
          >
            {light === 'GREEN' ? '⚡ TAP! TAP! TAP! ⚡' : '🛑 STOP! DO NOT TAP!'}
          </button>
        ) : (
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-center w-full">
            <span className="text-xs font-mono text-cyan-300">
              👁️ SPECTATOR VIEW: Both fighters racing to 40 taps!
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
