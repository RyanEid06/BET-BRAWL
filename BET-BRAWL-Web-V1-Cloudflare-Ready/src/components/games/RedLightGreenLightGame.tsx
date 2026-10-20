/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Mini-Game 2 - Rapid Red Light, Green Light (Authoritative Synchronized Schedule)
 */

import React, { useState, useEffect, useRef } from 'react';
import type { PublicPlayer } from '../../engine/types.ts';
import { sound } from '../../engine/audio.ts';
import { getLightAtServerTime, LightScheduleStep } from '../../engine/gameEngine.ts';

interface Props {
  fighterA: PublicPlayer;
  fighterB: PublicPlayer;
  isPlayerFighter: boolean;
  playerFighterSlot: 'A' | 'B' | 'spectator';
  fighterScores: Record<string, number>;
  gameConfig?: Record<string, unknown>;
  gameStartsAt?: number;
  serverTimeOffset?: number;
  onSendAction: (action: { type: 'TAP' }) => void;
}

export const RedLightGreenLightGame: React.FC<Props> = ({
  fighterA,
  fighterB,
  isPlayerFighter,
  playerFighterSlot,
  fighterScores,
  gameConfig,
  gameStartsAt = Date.now(),
  serverTimeOffset = 0,
  onSendAction,
}) => {
  const schedule = (gameConfig?.lightSchedule as LightScheduleStep[]) || [
    { light: 'GREEN', durationMs: 2000 },
    { light: 'RED', durationMs: 1200 },
  ];

  const [currentLight, setCurrentLight] = useState<'GREEN' | 'RED'>('GREEN');
  const [timeLeft, setTimeLeft] = useState<number>(15);
  const prevLightRef = useRef<'GREEN' | 'RED'>('GREEN');

  const scoreA = fighterScores[fighterA.id] || 0;
  const scoreB = fighterScores[fighterB.id] || 0;

  // Real-time synchronization loop to track light from authoritative schedule
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now() + serverTimeOffset;
      const elapsedMs = Math.max(0, now - gameStartsAt);
      const light = getLightAtServerTime(schedule, elapsedMs);

      setCurrentLight(light);
      if (prevLightRef.current !== light) {
        prevLightRef.current = light;
        if (light === 'RED') {
          sound.playBuzzer();
        } else {
          sound.playCountdown(false);
        }
      }

      const remainingSec = Math.max(0, 15 - Math.floor(elapsedMs / 1000));
      setTimeLeft(remainingSec);
    }, 50);

    return () => clearInterval(interval);
  }, [schedule, gameStartsAt, serverTimeOffset]);

  const handleTap = () => {
    if (!isPlayerFighter) return;
    if (currentLight === 'GREEN') {
      sound.playTap(true);
    } else {
      sound.playTap(false);
    }
    onSendAction({ type: 'TAP' });
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
  }, [currentLight, isPlayerFighter]);

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
          currentLight === 'GREEN'
            ? 'bg-emerald-950/90 border-emerald-400 shadow-emerald-500/40 text-emerald-300'
            : 'bg-rose-950/90 border-rose-500 shadow-rose-600/50 text-rose-300'
        }`}
      >
        <div className="text-6xl mb-1 font-black font-display tracking-widest animate-bounce">
          {currentLight === 'GREEN' ? '🟢 GREEN!' : '🛑 FREEZE!'}
        </div>
        <div className="text-xs uppercase font-mono tracking-widest font-bold opacity-80">
          {currentLight === 'GREEN' ? 'MASH TAP FAST (+1 POINT)' : 'DO NOT TAP! (-3 PENALTY)'}
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
            className={`w-full py-6 rounded-2xl font-display font-black text-2xl uppercase tracking-wider transition-all transform active:scale-95 shadow-xl select-none cursor-pointer ${
              currentLight === 'GREEN'
                ? 'bg-gradient-to-r from-emerald-500 via-green-500 to-teal-400 text-slate-950 border-2 border-emerald-300 glow-cyan'
                : 'bg-gradient-to-r from-rose-800 to-red-900 text-rose-200 border-2 border-rose-600 shadow-rose-950'
            }`}
          >
            {currentLight === 'GREEN' ? '⚡ TAP! TAP! TAP! ⚡' : '🛑 STOP! DO NOT TAP!'}
          </button>
        ) : (
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-center w-full">
            <span className="text-xs font-mono text-cyan-300">
              👁️ SPECTATOR VIEW: Both fighters racing to 40 taps live!
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
