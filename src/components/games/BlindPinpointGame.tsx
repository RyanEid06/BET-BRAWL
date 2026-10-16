/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Mini-Game 5 - Blind Pinpoint (Accurate Local Equirectangular World Map)
 */

import React, { useRef } from 'react';
import type { PublicPlayer } from '../../engine/types.ts';
import { sound } from '../../engine/audio.ts';
import { CityLocation } from '../../engine/miniGamesCatalog.ts';

interface Props {
  fighterA: PublicPlayer;
  fighterB: PublicPlayer;
  isPlayerFighter: boolean;
  playerFighterSlot: 'A' | 'B' | 'spectator';
  fighterScores: Record<string, number>;
  gameState?: Record<string, unknown>;
  gameConfig?: Record<string, unknown>;
  onSendAction: (action: { type: 'PIN'; normX: number; normY: number }) => void;
}

export const BlindPinpointGame: React.FC<Props> = ({
  fighterA,
  fighterB,
  isPlayerFighter,
  playerFighterSlot,
  fighterScores,
  gameState,
  gameConfig,
  onSendAction,
}) => {
  const targetCity = (gameConfig?.targetCity as { city: string; country: string }) || {
    city: 'Tokyo',
    country: 'Japan',
  };

  const revealedTarget = gameState?.revealedCity as CityLocation | undefined;
  const pins = (gameState?.pins as Record<string, { normX: number; normY: number; km: number }>) || {};

  const distKmA = fighterScores[fighterA.id] !== undefined ? fighterScores[fighterA.id] : null;
  const distKmB = fighterScores[fighterB.id] !== undefined ? fighterScores[fighterB.id] : null;

  const pinA = pins[fighterA.id] || null;
  const pinB = pins[fighterB.id] || null;

  const mapContainerRef = useRef<HTMLDivElement>(null);

  const hasPinned = (playerFighterSlot === 'A' && pinA !== null) ||
                    (playerFighterSlot === 'B' && pinB !== null);

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPlayerFighter || hasPinned || !mapContainerRef.current) return;

    const rect = mapContainerRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const clickY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    sound.playTap(true);
    onSendAction({
      type: 'PIN',
      normX: clickX,
      normY: clickY,
    });
  };

  // Convert revealed target to normalized coordinates
  const targetNormX = revealedTarget ? (revealedTarget.lon + 180) / 360 : null;
  const targetNormY = revealedTarget ? (90 - revealedTarget.lat) / 180 : null;

  return (
    <div className="flex flex-col items-center justify-between w-full max-w-xl mx-auto p-4 py-6 bg-slate-950/90 rounded-3xl border border-cyan-500/30 text-white min-h-[460px]">
      {/* Top Banner */}
      <div className="text-center space-y-1">
        <span className="px-3 py-1 bg-cyan-950 text-cyan-300 border border-cyan-700/60 rounded-full text-xs font-mono font-bold tracking-wider">
          EQUIRECTANGULAR PROJECTION · CLOSEST KM WINS
        </span>
        <h3 className="text-xl font-black font-display tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
          TAP LOCATION: {targetCity.city.toUpperCase()}, {targetCity.country.toUpperCase()}
        </h3>
      </div>

      {/* Recognized Equirectangular World Map Canvas */}
      <div
        ref={mapContainerRef}
        onClick={handleMapClick}
        className={`relative w-full h-60 bg-[#060914] rounded-2xl border-2 border-slate-700 overflow-hidden shadow-2xl flex items-center justify-center select-none ${
          !hasPinned && isPlayerFighter ? 'cursor-crosshair' : 'cursor-default'
        }`}
      >
        {/* Geographic Grid Lines */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:16.66%_25%]" />

        {/* Detailed recognizable Equirectangular Vector Outline */}
        <svg viewBox="0 0 360 180" className="w-full h-full fill-slate-800/80 stroke-cyan-500/50 stroke-[0.7] pointer-events-none">
          {/* North America (Alaska, Canada, US, Mexico, Central America) */}
          <path d="M 15 25 L 30 18 L 65 15 L 75 22 L 95 18 L 105 28 L 85 45 L 95 50 L 80 62 L 72 75 L 78 85 L 85 92 L 80 98 L 72 90 L 68 80 L 52 68 L 40 50 L 25 35 Z" />
          {/* Greenland */}
          <path d="M 115 10 L 140 10 L 145 25 L 130 35 L 118 25 Z" />
          {/* South America */}
          <path d="M 78 95 L 90 92 L 108 100 L 125 108 L 120 128 L 110 148 L 98 165 L 90 162 L 92 135 L 82 110 Z" />
          {/* British Isles */}
          <path d="M 172 32 L 178 30 L 176 42 L 170 38 Z" />
          {/* Scandinavia */}
          <path d="M 185 15 L 202 18 L 198 35 L 188 38 L 182 25 Z" />
          {/* Europe */}
          <path d="M 170 42 L 188 40 L 205 38 L 205 52 L 195 55 L 190 62 L 175 60 L 165 52 Z" />
          {/* Africa */}
          <path d="M 165 62 L 200 60 L 220 78 L 225 105 L 205 145 L 190 148 L 185 125 L 170 95 L 160 75 Z" />
          {/* Madagascar */}
          <path d="M 226 120 L 230 120 L 228 135 L 224 135 Z" />
          {/* Asia (Russia, Middle East, India, China, SE Asia) */}
          <path d="M 205 18 L 280 15 L 335 20 L 330 40 L 305 55 L 310 75 L 285 78 L 260 88 L 250 82 L 252 65 L 235 62 L 215 52 L 205 38 Z" />
          {/* India */}
          <path d="M 245 68 L 260 70 L 255 92 L 246 80 Z" />
          {/* Japan */}
          <path d="M 318 48 L 322 45 L 320 60 L 315 55 Z" />
          {/* Indonesia / Philippines archipelago */}
          <path d="M 275 95 L 290 92 L 310 98 L 295 105 L 275 100 Z" />
          {/* Australia */}
          <path d="M 292 115 L 328 112 L 332 138 L 315 148 L 295 142 L 290 125 Z" />
          {/* New Zealand */}
          <path d="M 345 145 L 350 142 L 346 155 L 342 152 Z" />
          {/* Antarctica */}
          <path d="M 10 172 L 350 172 L 350 178 L 10 178 Z" />

          {/* Equator (0° lat) */}
          <line x1="0" y1="90" x2="360" y2="90" stroke="rgba(245, 158, 11, 0.4)" strokeDasharray="3,3" strokeWidth="0.8" />
          {/* Prime Meridian (0° lon) */}
          <line x1="180" y1="0" x2="180" y2="180" stroke="rgba(6, 182, 212, 0.4)" strokeDasharray="3,3" strokeWidth="0.8" />
        </svg>

        {/* Revealed Target Marker */}
        {targetNormX !== null && targetNormY !== null && (
          <>
            <div
              className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full bg-emerald-500/50 border-2 border-emerald-300 flex items-center justify-center animate-ping"
              style={{
                left: `${targetNormX * 100}%`,
                top: `${targetNormY * 100}%`,
              }}
            />
            <div
              className="absolute text-[11px] font-mono font-black bg-emerald-950 px-2 py-0.5 rounded-md text-emerald-300 border border-emerald-400 shadow-xl -mt-7 -ml-8 z-30"
              style={{
                left: `${targetNormX * 100}%`,
                top: `${targetNormY * 100}%`,
              }}
            >
              🎯 {revealedTarget?.city}
            </div>
          </>
        )}

        {/* Fighter A Pin */}
        {pinA && (
          <div
            className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full bg-cyan-500 border-2 border-white shadow-lg flex items-center justify-center text-[10px] font-bold z-20"
            style={{ left: `${pinA.normX * 100}%`, top: `${pinA.normY * 100}%` }}
          >
            A
          </div>
        )}

        {/* Fighter B Pin */}
        {pinB && (
          <div
            className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full bg-amber-500 border-2 border-white shadow-lg flex items-center justify-center text-[10px] font-bold z-20"
            style={{ left: `${pinB.normX * 100}%`, top: `${pinB.normY * 100}%` }}
          >
            B
          </div>
        )}

        <div className="absolute bottom-1.5 left-2.5 text-[9px] font-mono text-slate-400 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800">
          Equirectangular World Map (-180° to +180° Lon · +90° to -90° Lat)
        </div>
      </div>

      {/* Haversine Distance Scoreboard */}
      <div className="grid grid-cols-2 gap-4 w-full">
        <div className="p-3 bg-slate-900 rounded-2xl border border-cyan-500/30 text-center">
          <div className="text-xs font-mono text-cyan-400 font-bold">{fighterA.name}</div>
          <div className="text-base font-mono font-black text-white mt-1">
            {distKmA !== null ? `${distKmA.toLocaleString()} km error` : pinA ? 'Pin placed!' : 'Awaiting pin...'}
          </div>
        </div>
        <div className="p-3 bg-slate-900 rounded-2xl border border-amber-500/30 text-center">
          <div className="text-xs font-mono text-amber-400 font-bold">{fighterB.name}</div>
          <div className="text-base font-mono font-black text-white mt-1">
            {distKmB !== null ? `${distKmB.toLocaleString()} km error` : pinB ? 'Pin placed!' : 'Awaiting pin...'}
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="w-full text-center">
        {isPlayerFighter ? (
          <div className="text-xs font-mono text-slate-300">
            {hasPinned
              ? '✓ Your pin is locked in! Waiting for opponent...'
              : 'Tap the world map where you think the city is located!'}
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-center w-full">
            <span className="text-xs font-mono text-cyan-300">
              👁️ SPECTATOR VIEW: Both fighters placing their secret map pins!
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
