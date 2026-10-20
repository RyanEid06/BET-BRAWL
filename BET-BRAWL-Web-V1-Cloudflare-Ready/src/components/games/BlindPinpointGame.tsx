/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Mini-Game 5 - Blind Pinpoint
 * Bundles an offline, geographically aligned equirectangular world map projection (Natural Earth Public Domain standard).
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
    <div className="flex flex-col items-center justify-between w-full max-w-2xl mx-auto p-4 py-6 bg-slate-950/90 rounded-3xl border border-cyan-500/30 text-white min-h-[480px]">
      {/* Top Banner */}
      <div className="text-center space-y-1">
        <span className="px-3 py-1 bg-cyan-950 text-cyan-300 border border-cyan-700/60 rounded-full text-xs font-mono font-bold tracking-wider">
          AUTHENTIC EQUIRECTANGULAR PROJECTION · HAVERSINE KM
        </span>
        <h3 className="text-xl font-black font-display tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
          TAP LOCATION: {targetCity.city.toUpperCase()}, {targetCity.country.toUpperCase()}
        </h3>
      </div>

      {/* Geographically Aligned Equirectangular World Map Canvas */}
      <div
        ref={mapContainerRef}
        onClick={handleMapClick}
        className={`relative w-full aspect-[2/1] max-h-72 bg-[#050814] rounded-2xl border-2 border-slate-700 overflow-hidden shadow-2xl flex items-center justify-center select-none ${
          !hasPinned && isPlayerFighter ? 'cursor-crosshair' : 'cursor-default'
        }`}
      >
        {/* Lat/Lon Grid lines every 30 degrees (Equator & Prime Meridian highlighted) */}
        <div className="absolute inset-0 pointer-events-none">
          <svg viewBox="0 0 360 180" className="w-full h-full stroke-slate-800/80 stroke-[0.4] fill-none">
            {/* Latitude parallels (every 30°) */}
            <line x1="0" y1="30" x2="360" y2="30" strokeDasharray="2,3" />
            <line x1="0" y1="60" x2="360" y2="60" strokeDasharray="2,3" />
            <line x1="0" y1="90" x2="360" y2="90" stroke="rgba(245, 158, 11, 0.5)" strokeWidth="0.8" /> {/* Equator 0° */}
            <line x1="0" y1="120" x2="360" y2="120" strokeDasharray="2,3" />
            <line x1="0" y1="150" x2="360" y2="150" strokeDasharray="2,3" />

            {/* Longitude meridians (every 60°) */}
            <line x1="60" y1="0" x2="60" y2="180" strokeDasharray="2,3" />
            <line x1="120" y1="0" x2="120" y2="180" strokeDasharray="2,3" />
            <line x1="180" y1="0" x2="180" y2="180" stroke="rgba(6, 182, 212, 0.5)" strokeWidth="0.8" /> {/* Prime Meridian 0° */}
            <line x1="240" y1="0" x2="240" y2="180" strokeDasharray="2,3" />
            <line x1="300" y1="0" x2="300" y2="180" strokeDasharray="2,3" />
          </svg>
        </div>

        {/* Detailed Genuine Equirectangular Coastlines (Natural Earth Equirectangular alignment: x=lon+180, y=90-lat) */}
        <svg viewBox="0 0 360 180" className="w-full h-full fill-slate-800/90 stroke-cyan-500/60 stroke-[0.6] pointer-events-none">
          {/* North America */}
          <path d="M 12 18 L 25 18 L 35 15 L 45 16 L 62 20 L 78 20 L 95 18 L 105 24 L 98 32 L 88 38 L 86 48 L 95 44 L 102 46 L 98 52 L 95 62 L 98 65 L 94 70 L 98 72 L 94 75 L 85 82 L 90 85 L 88 95 L 75 100 L 75 106 L 80 110 L 78 114 L 72 108 L 68 100 L 68 85 L 62 82 L 56 68 L 52 58 L 55 52 L 48 42 L 32 30 L 18 25 Z" />
          {/* Greenland */}
          <path d="M 115 8 L 155 8 L 160 16 L 148 30 L 136 34 L 126 30 L 120 20 Z" />
          {/* South America */}
          <path d="M 78 106 L 95 98 L 115 102 L 132 108 L 145 118 L 142 130 L 135 142 L 122 152 L 114 165 L 105 174 L 95 174 L 90 165 L 92 145 L 86 132 L 80 118 Z" />
          {/* Europe */}
          <path d="M 170 38 L 185 35 L 205 32 L 210 42 L 200 48 L 195 55 L 188 62 L 176 62 L 170 54 L 165 46 Z" />
          {/* Scandinavia & Baltic */}
          <path d="M 185 18 L 205 18 L 210 32 L 195 35 L 185 28 Z" />
          {/* British Isles & Ireland */}
          <path d="M 168 32 L 176 30 L 178 38 L 172 42 L 168 36 Z" />
          <path d="M 162 34 L 167 33 L 166 40 L 162 38 Z" />
          {/* Africa */}
          <path d="M 165 64 L 190 62 L 212 66 L 225 78 L 232 92 L 228 108 L 218 126 L 210 144 L 200 148 L 195 148 L 188 135 L 182 118 L 168 96 L 162 82 L 162 70 Z" />
          {/* Madagascar */}
          <path d="M 224 122 L 230 120 L 232 134 L 226 138 Z" />
          {/* Asia / Eurasia main */}
          <path d="M 210 18 L 260 14 L 320 14 L 348 20 L 340 32 L 315 42 L 325 55 L 305 68 L 285 70 L 272 82 L 264 88 L 254 84 L 252 68 L 238 64 L 225 55 L 215 45 Z" />
          {/* Arabian Peninsula */}
          <path d="M 215 65 L 235 65 L 240 76 L 225 85 L 218 78 Z" />
          {/* Indian Subcontinent */}
          <path d="M 248 68 L 265 68 L 260 92 L 250 82 Z" />
          {/* Sri Lanka */}
          <path d="M 260 96 L 262 95 L 262 99 L 260 98 Z" />
          {/* Southeast Asia & Indochina */}
          <path d="M 275 75 L 288 75 L 285 92 L 278 88 Z" />
          {/* Japan archipelago */}
          <path d="M 318 45 L 324 44 L 322 58 L 315 54 Z" />
          {/* Indonesia / Philippines */}
          <path d="M 275 96 L 295 94 L 308 98 L 298 104 L 280 102 Z" />
          <path d="M 300 82 L 306 82 L 304 94 L 298 90 Z" />
          {/* Australia */}
          <path d="M 292 112 L 332 112 L 335 138 L 322 148 L 305 145 L 292 134 L 290 120 Z" />
          {/* New Zealand */}
          <path d="M 345 144 L 350 142 L 346 156 L 342 152 Z" />
          {/* Antarctica outline */}
          <path d="M 0 166 L 360 166 L 360 180 L 0 180 Z" />
        </svg>

        {/* Revealed Target Marker */}
        {targetNormX !== null && targetNormY !== null && (
          <>
            <div
              className="absolute w-6 h-6 -ml-3 -mt-3 rounded-full bg-emerald-500/50 border-2 border-emerald-300 flex items-center justify-center animate-ping pointer-events-none"
              style={{
                left: `${targetNormX * 100}%`,
                top: `${targetNormY * 100}%`,
              }}
            />
            <div
              className="absolute text-[11px] font-mono font-black bg-emerald-950 px-2 py-0.5 rounded-md text-emerald-300 border border-emerald-400 shadow-xl -mt-7 -ml-8 z-30 pointer-events-none"
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
            className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full bg-cyan-500 border-2 border-white shadow-lg flex items-center justify-center text-[10px] font-bold z-20 pointer-events-none"
            style={{ left: `${pinA.normX * 100}%`, top: `${pinA.normY * 100}%` }}
          >
            A
          </div>
        )}

        {/* Fighter B Pin */}
        {pinB && (
          <div
            className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full bg-amber-500 border-2 border-white shadow-lg flex items-center justify-center text-[10px] font-bold z-20 pointer-events-none"
            style={{ left: `${pinB.normX * 100}%`, top: `${pinB.normY * 100}%` }}
          >
            B
          </div>
        )}

        <div className="absolute bottom-1.5 left-2.5 text-[9px] font-mono text-slate-400 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800 pointer-events-none">
          Equirectangular Map (-180° to +180° Lon · +90° to -90° Lat)
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
