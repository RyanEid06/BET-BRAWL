/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Mini-Game 5 - Blind Pinpoint (Geoguess-Lite)
 */

import React, { useState, useEffect, useRef } from 'react';
import type { Player } from '../../engine/types.ts';
import { sound } from '../../engine/audio.ts';
import { BLIND_PINPOINT_CHALLENGES } from '../../engine/miniGamesCatalog.ts';

interface Props {
  fighterA: Player;
  fighterB: Player;
  isPlayerFighter: boolean;
  playerFighterSlot: 'A' | 'B' | 'spectator';
  onComplete: (winnerId: string, scores: Record<string, number>) => void;
}

export const BlindPinpointGame: React.FC<Props> = ({
  fighterA,
  fighterB,
  isPlayerFighter,
  playerFighterSlot,
  onComplete,
}) => {
  const [challenge] = useState(() => BLIND_PINPOINT_CHALLENGES[Math.floor(Math.random() * BLIND_PINPOINT_CHALLENGES.length)]);
  const [pinA, setPinA] = useState<{ x: number; y: number } | null>(null);
  const [pinB, setPinB] = useState<{ x: number; y: number } | null>(null);
  const [distA, setDistA] = useState<number | null>(null);
  const [distB, setDistB] = useState<number | null>(null);
  const [completed, setCompleted] = useState<boolean>(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Bot opponent pin simulation
  useEffect(() => {
    if (completed) return;

    const botTimer = setTimeout(() => {
      // Bot lands within 0.05 - 0.20 distance
      const botErrX = (Math.random() - 0.5) * 0.25;
      const botErrY = (Math.random() - 0.5) * 0.25;
      const botX = Math.max(0.1, Math.min(0.9, challenge.targetNormX + botErrX));
      const botY = Math.max(0.1, Math.min(0.9, challenge.targetNormY + botErrY));

      const rawDist = Math.hypot(botX - challenge.targetNormX, botY - challenge.targetNormY);
      const km = Math.round(rawDist * challenge.mapWidthKm);

      if (playerFighterSlot === 'A') {
        setPinB({ x: botX, y: botY });
        setDistB(km);
      } else if (playerFighterSlot === 'B') {
        setPinA({ x: botX, y: botY });
        setDistA(km);
      } else {
        setPinA({ x: challenge.targetNormX + 0.08, y: challenge.targetNormY - 0.05 });
        setDistA(Math.round(0.09 * challenge.mapWidthKm));
        setPinB({ x: botX, y: botY });
        setDistB(km);
      }
    }, 2500);

    return () => clearTimeout(botTimer);
  }, [challenge, playerFighterSlot, completed]);

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (completed || !isPlayerFighter) return;
    if (!mapContainerRef.current) return;

    const rect = mapContainerRef.current.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;

    const rawDist = Math.hypot(clickX - challenge.targetNormX, clickY - challenge.targetNormY);
    const km = Math.round(rawDist * challenge.mapWidthKm);

    sound.playTap(true);

    if (playerFighterSlot === 'A' && pinA === null) {
      setPinA({ x: clickX, y: clickY });
      setDistA(km);
    } else if (playerFighterSlot === 'B' && pinB === null) {
      setPinB({ x: clickX, y: clickY });
      setDistB(km);
    }
  };

  // Check completion
  useEffect(() => {
    if (completed) return;

    if (distA !== null && distB !== null) {
      setCompleted(true);
      const winnerId = distA <= distB ? fighterA.id : fighterB.id;
      sound.playFanfare();

      setTimeout(() => {
        onComplete(winnerId, {
          [fighterA.id]: distA,
          [fighterB.id]: distB,
        });
      }, 3200);
    }
  }, [distA, distB, completed, fighterA, fighterB, onComplete]);

  return (
    <div className="flex flex-col items-center justify-between w-full max-w-xl mx-auto p-4 py-6 bg-slate-950/80 rounded-3xl border border-cyan-500/30 text-white min-h-[480px]">
      {/* Top Banner */}
      <div className="text-center space-y-1">
        <span className="px-3 py-1 bg-cyan-950 text-cyan-300 border border-cyan-700/60 rounded-full text-xs font-mono font-bold tracking-wider">
          CLOSEST PIN IN KILOMETERS WINS
        </span>
        <h3 className="text-xl font-black font-display tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
          PINPOINT: {challenge.city.toUpperCase()} ({challenge.country.toUpperCase()})
        </h3>
      </div>

      {/* Interactive Silhouette Map */}
      <div
        ref={mapContainerRef}
        onClick={handleMapClick}
        className="relative w-full h-64 bg-slate-900 rounded-3xl border-2 border-slate-700 overflow-hidden cursor-crosshair shadow-2xl flex items-center justify-center"
      >
        {/* Silhouette SVG outline background */}
        <svg viewBox="0 0 100 100" className="w-full h-full opacity-30 fill-cyan-400/20 stroke-cyan-400 stroke-[0.5]">
          <path d="M 20 30 Q 35 15 50 20 T 80 35 Q 85 60 70 80 T 30 75 Q 15 60 20 30 Z" />
          <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeDasharray="2,2" opacity="0.3" />
        </svg>

        {/* Target indicator on completion */}
        {completed && (
          <div
            className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full bg-emerald-500/50 border-2 border-emerald-300 flex items-center justify-center animate-ping"
            style={{
              left: `${challenge.targetNormX * 100}%`,
              top: `${challenge.targetNormY * 100}%`,
            }}
          />
        )}
        {completed && (
          <div
            className="absolute text-[11px] font-mono font-bold bg-emerald-950 px-2 py-0.5 rounded text-emerald-300 border border-emerald-400 -mt-7 -ml-6"
            style={{
              left: `${challenge.targetNormX * 100}%`,
              top: `${challenge.targetNormY * 100}%`,
            }}
          >
            🎯 {challenge.city}
          </div>
        )}

        {/* Fighter A Pin */}
        {pinA && (
          <div
            className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full bg-cyan-500 border-2 border-white shadow-lg flex items-center justify-center text-[10px]"
            style={{ left: `${pinA.x * 100}%`, top: `${pinA.y * 100}%` }}
          >
            A
          </div>
        )}

        {/* Fighter B Pin */}
        {pinB && (
          <div
            className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full bg-amber-500 border-2 border-white shadow-lg flex items-center justify-center text-[10px]"
            style={{ left: `${pinB.x * 100}%`, top: `${pinB.y * 100}%` }}
          >
            B
          </div>
        )}

        <div className="absolute bottom-2 left-3 text-[10px] font-mono text-slate-500">
          Tap on silhouette to drop pin
        </div>
      </div>

      {/* Distance Scoreboard */}
      <div className="grid grid-cols-2 gap-4 w-full">
        <div className="p-3 bg-slate-900 rounded-2xl border border-cyan-500/30 text-center">
          <div className="text-xs font-mono text-cyan-400 font-bold">{fighterA.name}</div>
          <div className="text-lg font-mono font-black text-white mt-0.5">
            {distA !== null ? `${distA} km away` : 'Waiting for pin...'}
          </div>
        </div>
        <div className="p-3 bg-slate-900 rounded-2xl border border-amber-500/30 text-center">
          <div className="text-xs font-mono text-amber-400 font-bold">{fighterB.name}</div>
          <div className="text-lg font-mono font-black text-white mt-0.5">
            {distB !== null ? `${distB} km away` : 'Waiting for pin...'}
          </div>
        </div>
      </div>
    </div>
  );
};
