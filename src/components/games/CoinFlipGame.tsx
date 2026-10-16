/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Mini-Game 6 - Coin Flip Double-Down
 */

import React, { useState, useEffect } from 'react';
import type { Player } from '../../engine/types.ts';
import { sound } from '../../engine/audio.ts';

interface Props {
  fighterA: Player;
  fighterB: Player;
  isPlayerFighter: boolean;
  playerFighterSlot: 'A' | 'B' | 'spectator';
  onComplete: (winnerId: string, scores: Record<string, number>) => void;
}

export const CoinFlipGame: React.FC<Props> = ({
  fighterA,
  fighterB,
  isPlayerFighter,
  playerFighterSlot,
  onComplete,
}) => {
  const [pickA, setPickA] = useState<'HEADS' | 'TAILS'>('HEADS');
  const [pickB, setPickB] = useState<'HEADS' | 'TAILS'>('TAILS');
  const [bluffTime, setBluffTime] = useState<number>(5);
  const [isDoubled, setIsDoubled] = useState<boolean>(false);
  const [flipping, setFlipping] = useState<boolean>(false);
  const [result, setResult] = useState<'HEADS' | 'TAILS' | null>(null);
  const [completed, setCompleted] = useState<boolean>(false);

  // 5s bluff countdown
  useEffect(() => {
    if (bluffTime <= 0) {
      // Start coin flip
      setFlipping(true);
      sound.playCountdown(true);

      const coinLandTimeout = setTimeout(() => {
        const outcome = Math.random() < 0.5 ? 'HEADS' : 'TAILS';
        setResult(outcome);
        setFlipping(false);

        const winnerId = outcome === pickA ? fighterA.id : fighterB.id;
        sound.playFanfare();
        setCompleted(true);

        setTimeout(() => {
          onComplete(winnerId, {
            [fighterA.id]: outcome === pickA ? 1 : 0,
            [fighterB.id]: outcome === pickB ? 1 : 0,
          });
        }, 2800);
      }, 2500);

      return () => clearTimeout(coinLandTimeout);
    }

    const timer = setInterval(() => {
      setBluffTime(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [bluffTime, pickA, pickB, fighterA, fighterB, onComplete]);

  const handleDoubleRisk = () => {
    if (isDoubled || bluffTime <= 0) return;
    setIsDoubled(true);
    sound.playBuzzer();
  };

  return (
    <div className="flex flex-col items-center justify-between w-full max-w-xl mx-auto p-4 py-6 bg-slate-950/80 rounded-3xl border border-cyan-500/30 text-white min-h-[480px]">
      {/* Top Banner */}
      <div className="text-center space-y-1">
        <span className="px-3 py-1 bg-cyan-950 text-cyan-300 border border-cyan-700/60 rounded-full text-xs font-mono font-bold tracking-wider">
          {bluffTime > 0 ? `BLUFF WINDOW: ${bluffTime}s` : 'COIN IN AIR!'}
        </span>
        <h3 className="text-xl font-black font-display tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-200">
          COIN FLIP DOUBLE-DOWN
        </h3>
      </div>

      {/* Main 3D Coin Animation */}
      <div className="relative flex flex-col items-center justify-center h-48">
        <div
          className={`w-32 h-32 rounded-full border-4 border-amber-300 bg-gradient-to-tr from-amber-600 via-yellow-400 to-amber-200 shadow-2xl flex items-center justify-center font-display font-black text-slate-950 text-4xl transition-all duration-300 glow-gold ${
            flipping ? 'animate-spin' : ''
          }`}
        >
          {result ? result : flipping ? '🪙' : 'BRAWL'}
        </div>
        {isDoubled && (
          <div className="absolute -bottom-3 px-3 py-1 bg-red-600 border border-red-300 rounded-full text-xs font-mono font-bold text-white uppercase animate-bounce shadow-lg">
            🔥 DOUBLE RISK ACTIVE: 500c POT!
          </div>
        )}
      </div>

      {/* Picks */}
      <div className="grid grid-cols-2 gap-4 w-full">
        <div className="p-3 bg-slate-900 rounded-2xl border border-cyan-500/30 text-center">
          <div className="text-xs font-mono text-cyan-400 font-bold">{fighterA.name}</div>
          <div className="text-lg font-mono font-black text-cyan-300 mt-1">HEADS 🪙</div>
        </div>
        <div className="p-3 bg-slate-900 rounded-2xl border border-amber-500/30 text-center">
          <div className="text-xs font-mono text-amber-400 font-bold">{fighterB.name}</div>
          <div className="text-lg font-mono font-black text-amber-300 mt-1">TAILS 🪙</div>
        </div>
      </div>

      {/* Double Risk Action */}
      {isPlayerFighter && bluffTime > 0 ? (
        <button
          onClick={handleDoubleRisk}
          disabled={isDoubled}
          className={`w-full py-5 rounded-2xl font-display font-black text-xl uppercase tracking-wider transition-all transform active:scale-95 shadow-xl ${
            isDoubled
              ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
              : 'bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 text-white border-2 border-red-400 glow-crimson'
          }`}
        >
          {isDoubled ? 'STAKES DOUBLED!' : '⚠️ HIT DOUBLE RISK (FORCE 2X POT)!'}
        </button>
      ) : (
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-center w-full">
          <span className="text-xs font-mono text-cyan-300">
            {result ? `WINNER: ${result}!` : '🪙 Watch the coin spin and determine the victor!'}
          </span>
        </div>
      )}
    </div>
  );
};
