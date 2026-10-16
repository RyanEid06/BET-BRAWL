/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Mini-Game 2 - Rapid Red Light, Green Light
 */

import React, { useState, useEffect, useRef } from 'react';
import type { Player } from '../../engine/types.ts';
import { sound } from '../../engine/audio.ts';

interface Props {
  fighterA: Player;
  fighterB: Player;
  isPlayerFighter: boolean;
  playerFighterSlot: 'A' | 'B' | 'spectator';
  onComplete: (winnerId: string, scores: Record<string, number>) => void;
}

export const RedLightGreenLightGame: React.FC<Props> = ({
  fighterA,
  fighterB,
  isPlayerFighter,
  playerFighterSlot,
  onComplete,
}) => {
  const [light, setLight] = useState<'GREEN' | 'RED'>('GREEN');
  const [scoreA, setScoreA] = useState<number>(0);
  const [scoreB, setScoreB] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(15);
  const [lastPenalty, setLastPenalty] = useState<'A' | 'B' | null>(null);
  const [completed, setCompleted] = useState<boolean>(false);

  const TARGET_GOAL = 50;
  const lightRef = useRef<'GREEN' | 'RED'>('GREEN');
  lightRef.current = light;

  // Unpredictable light flips (Green lasts 1.2 - 2.8s, Red lasts 0.8 - 1.8s)
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const scheduleNextFlip = () => {
      const current = lightRef.current;
      const nextLight = current === 'GREEN' ? 'RED' : 'GREEN';
      const delay = nextLight === 'GREEN'
        ? 1200 + Math.random() * 1600
        : 800 + Math.random() * 1000;

      timeoutId = setTimeout(() => {
        setLight(nextLight);
        if (nextLight === 'RED') {
          sound.playBuzzer();
        } else {
          sound.playCountdown(false);
        }
        scheduleNextFlip();
      }, delay);
    };

    scheduleNextFlip();
    return () => clearTimeout(timeoutId);
  }, []);

  // Bot taps simulation
  useEffect(() => {
    if (completed) return;

    const botInterval = setInterval(() => {
      if (lightRef.current === 'GREEN') {
        // High tap frequency on green
        if (playerFighterSlot === 'A') {
          setScoreB(prev => Math.min(TARGET_GOAL, prev + 1));
        } else if (playerFighterSlot === 'B') {
          setScoreA(prev => Math.min(TARGET_GOAL, prev + 1));
        } else {
          // Spectator view
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
    }, 160 + Math.random() * 80);

    return () => clearInterval(botInterval);
  }, [playerFighterSlot, completed]);

  // Round countdown
  useEffect(() => {
    if (completed) return;

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [completed]);

  // Player tap action
  const handleTap = () => {
    if (completed) return;

    if (light === 'GREEN') {
      sound.playTap(true);
      if (playerFighterSlot === 'A') {
        setScoreA(prev => Math.min(TARGET_GOAL, prev + 1));
      } else if (playerFighterSlot === 'B') {
        setScoreB(prev => Math.min(TARGET_GOAL, prev + 1));
      }
    } else {
      // RED LIGHT MISTAKE!
      sound.playTap(false);
      if (playerFighterSlot === 'A') {
        setScoreA(prev => Math.max(0, prev - 3));
        setLastPenalty('A');
      } else if (playerFighterSlot === 'B') {
        setScoreB(prev => Math.max(0, prev - 3));
        setLastPenalty('B');
      }
      setTimeout(() => setLastPenalty(null), 600);
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
  }, [light, completed]);

  // Check victory condition
  useEffect(() => {
    if (completed) return;

    if (scoreA >= TARGET_GOAL || scoreB >= TARGET_GOAL || timeLeft === 0) {
      setCompleted(true);
      const winnerId = scoreA >= scoreB ? fighterA.id : fighterB.id;
      sound.playFanfare();

      setTimeout(() => {
        onComplete(winnerId, {
          [fighterA.id]: scoreA,
          [fighterB.id]: scoreB,
        });
      }, 2500);
    }
  }, [scoreA, scoreB, timeLeft, completed, fighterA, fighterB, onComplete]);

  return (
    <div className="flex flex-col items-center justify-between w-full max-w-xl mx-auto p-4 py-6 bg-slate-950/80 rounded-3xl border border-cyan-500/30 text-white min-h-[480px]">
      {/* Top Banner */}
      <div className="flex items-center justify-between w-full px-2">
        <span className="px-3 py-1 bg-cyan-950 text-cyan-300 border border-cyan-700/60 rounded-full text-xs font-mono font-bold">
          FIRST TO 50 TAPS OR 15s
        </span>
        <div className="font-mono text-sm font-bold bg-slate-900 px-3 py-1 rounded-full border border-slate-700">
          ⏳ {timeLeft}s
        </div>
      </div>

      {/* Traffic Light Visual */}
      <div
        className={`w-full py-8 px-4 rounded-3xl flex flex-col items-center justify-center transition-all duration-200 border-4 shadow-2xl ${
          light === 'GREEN'
            ? 'bg-emerald-950/80 border-emerald-400 shadow-emerald-500/40 text-emerald-300'
            : 'bg-rose-950/90 border-rose-500 shadow-rose-600/50 text-rose-300'
        }`}
      >
        <div className="text-6xl mb-2 font-black tracking-widest font-display animate-bounce">
          {light === 'GREEN' ? '🟢 GREEN!' : '🛑 FREEZE!'}
        </div>
        <div className="text-xs uppercase font-mono tracking-widest font-bold opacity-80">
          {light === 'GREEN' ? 'MASH TAP FAST (+1 POINT)' : 'DO NOT TAP! (-3 PENALTY)'}
        </div>
      </div>

      {/* Race Tracks */}
      <div className="w-full space-y-3 bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
        {/* Track A */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-bold font-mono">
            <span className="text-cyan-400 flex items-center gap-1">
              {fighterA.avatar} {fighterA.name} {playerFighterSlot === 'A' && '(YOU)'}
            </span>
            <span className="text-cyan-300 font-bold">{scoreA} / 50</span>
          </div>
          <div className="w-full h-4 bg-slate-950 rounded-full overflow-hidden border border-slate-700 relative">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-cyan-300 transition-all duration-100"
              style={{ width: `${Math.min(100, (scoreA / 50) * 100)}%` }}
            />
          </div>
        </div>

        {/* Track B */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-bold font-mono">
            <span className="text-amber-400 flex items-center gap-1">
              {fighterB.avatar} {fighterB.name} {playerFighterSlot === 'B' && '(YOU)'}
            </span>
            <span className="text-amber-300 font-bold">{scoreB} / 50</span>
          </div>
          <div className="w-full h-4 bg-slate-950 rounded-full overflow-hidden border border-slate-700 relative">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-100"
              style={{ width: `${Math.min(100, (scoreB / 50) * 100)}%` }}
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
            className={`w-full py-6 rounded-2xl font-display font-black text-2xl uppercase tracking-wider transition-all transform active:scale-95 shadow-xl select-none ${
              light === 'GREEN'
                ? 'bg-gradient-to-r from-emerald-500 via-green-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 shadow-emerald-500/40 border-2 border-emerald-300 glow-cyan'
                : 'bg-gradient-to-r from-rose-800 to-red-900 text-rose-200 border-2 border-rose-600 shadow-rose-950 glow-crimson'
            } ${lastPenalty ? 'animate-shake' : ''}`}
          >
            {light === 'GREEN' ? '⚡ TAP! TAP! TAP! ⚡' : '🛑 STOP! DO NOT TAP!'}
          </button>
        ) : (
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-center w-full">
            <span className="text-xs font-mono text-cyan-300">
              👁️ SPECTATOR VIEW: Both fighters are sprinting! Watch for red-light traps!
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
