/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Mini-Game 5 - Blind Pinpoint (Genuine Equirectangular World Map & Haversine km)
 */

import React, { useState, useEffect, useRef } from 'react';
import type { Player } from '../../engine/types.ts';
import { sound } from '../../engine/audio.ts';
import {
  WORLD_CITIES,
  calculateHaversineKm,
  normCoordsToLatLon,
  latLonToNormCoords,
  CityLocation,
} from '../../engine/miniGamesCatalog.ts';

interface Props {
  fighterA: Player;
  fighterB: Player;
  isPlayerFighter: boolean;
  playerFighterSlot: 'A' | 'B' | 'spectator';
  gameConfig?: Record<string, unknown>;
  onComplete: (winnerId: string | null, scores: Record<string, number>, isTie?: boolean) => void;
  onSendInput?: (action: string, value: number) => void;
}

export const BlindPinpointGame: React.FC<Props> = ({
  fighterA,
  fighterB,
  isPlayerFighter,
  playerFighterSlot,
  gameConfig,
  onComplete,
  onSendInput,
}) => {
  const targetCity: CityLocation = (gameConfig?.targetCity as CityLocation) || WORLD_CITIES[0];
  const targetNorm = latLonToNormCoords(targetCity.lat, targetCity.lon);

  const [pinA, setPinA] = useState<{ x: number; y: number } | null>(null);
  const [pinB, setPinB] = useState<{ x: number; y: number } | null>(null);
  const [distKmA, setDistKmA] = useState<number | null>(null);
  const [distKmB, setDistKmB] = useState<number | null>(null);
  const [completed, setCompleted] = useState<boolean>(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Bot opponent pin simulation
  useEffect(() => {
    if (completed) return;

    const botTimer = setTimeout(() => {
      // Bot lands within 400 - 1800km of target
      const angle = Math.random() * 2 * Math.PI;
      const kmOffset = 400 + Math.random() * 1200;
      const degOffset = kmOffset / 111; // ~111km per degree
      const botLat = Math.max(-80, Math.min(80, targetCity.lat + Math.sin(angle) * degOffset));
      const botLon = Math.max(-175, Math.min(175, targetCity.lon + Math.cos(angle) * degOffset));

      const botNorm = latLonToNormCoords(botLat, botLon);
      const actualKm = calculateHaversineKm(botLat, botLon, targetCity.lat, targetCity.lon);

      if (playerFighterSlot === 'A') {
        setPinB({ x: botNorm.normX, y: botNorm.normY });
        setDistKmB(actualKm);
      } else if (playerFighterSlot === 'B') {
        setPinA({ x: botNorm.normX, y: botNorm.normY });
        setDistKmA(actualKm);
      } else {
        // Spectator view
        setPinA({ x: targetNorm.normX + 0.04, y: targetNorm.normY - 0.03 });
        setDistKmA(calculateHaversineKm(targetCity.lat + 5, targetCity.lon + 8, targetCity.lat, targetCity.lon));
        setPinB({ x: botNorm.normX, y: botNorm.normY });
        setDistKmB(actualKm);
      }
    }, 2800);

    return () => clearTimeout(botTimer);
  }, [targetCity, targetNorm, playerFighterSlot, completed]);

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (completed || !isPlayerFighter) return;
    if (!mapContainerRef.current) return;

    const rect = mapContainerRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const clickY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    const { lat, lon } = normCoordsToLatLon(clickX, clickY);
    const km = calculateHaversineKm(lat, lon, targetCity.lat, targetCity.lon);

    sound.playTap(true);

    if (playerFighterSlot === 'A' && pinA === null) {
      setPinA({ x: clickX, y: clickY });
      setDistKmA(km);
      if (onSendInput) onSendInput('PIN', km);
    } else if (playerFighterSlot === 'B' && pinB === null) {
      setPinB({ x: clickX, y: clickY });
      setDistKmB(km);
      if (onSendInput) onSendInput('PIN', km);
    }
  };

  // Check completion
  useEffect(() => {
    if (completed) return;

    if (distKmA !== null && distKmB !== null) {
      setCompleted(true);
      const isTie = Math.abs(distKmA - distKmB) < 5;
      const winnerId = isTie ? null : distKmA < distKmB ? fighterA.id : fighterB.id;
      sound.playFanfare();

      setTimeout(() => {
        onComplete(
          winnerId,
          {
            [fighterA.id]: distKmA,
            [fighterB.id]: distKmB,
          },
          isTie
        );
      }, 3200);
    }
  }, [distKmA, distKmB, completed, fighterA, fighterB, onComplete]);

  return (
    <div className="flex flex-col items-center justify-between w-full max-w-xl mx-auto p-4 py-6 bg-slate-950/90 rounded-3xl border border-cyan-500/30 text-white min-h-[460px]">
      {/* Top Banner */}
      <div className="text-center space-y-1">
        <span className="px-3 py-1 bg-cyan-950 text-cyan-300 border border-cyan-700/60 rounded-full text-xs font-mono font-bold tracking-wider">
          GENUINE WORLD MAP · CLOSEST KM WINS
        </span>
        <h3 className="text-xl font-black font-display tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
          TAP: {targetCity.city.toUpperCase()} ({targetCity.country.toUpperCase()})
        </h3>
      </div>

      {/* Real Equirectangular World Map Vector Canvas */}
      <div
        ref={mapContainerRef}
        onClick={handleMapClick}
        className="relative w-full h-56 bg-[#070913] rounded-2xl border-2 border-slate-700 overflow-hidden cursor-crosshair shadow-2xl flex items-center justify-center select-none"
      >
        {/* Equirectangular Grid Lines */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:25%_25%]" />

        {/* Genuine Continents Vector Silhouette */}
        <svg viewBox="0 0 360 180" className="w-full h-full opacity-60 fill-slate-800 stroke-cyan-500/40 stroke-[0.8] pointer-events-none">
          {/* North America */}
          <path d="M 40 25 L 85 20 L 105 35 L 90 70 L 75 90 L 60 80 L 45 60 Z" />
          {/* South America */}
          <path d="M 80 95 L 115 105 L 105 150 L 90 160 L 75 120 Z" />
          {/* Europe */}
          <path d="M 160 30 L 200 25 L 195 55 L 170 60 L 160 45 Z" />
          {/* Africa */}
          <path d="M 165 65 L 210 65 L 215 110 L 185 145 L 160 110 Z" />
          {/* Asia */}
          <path d="M 205 25 L 310 20 L 325 55 L 290 85 L 240 75 L 205 50 Z" />
          {/* Australia */}
          <path d="M 290 120 L 335 120 L 330 155 L 295 150 Z" />
          {/* Equator & Prime Meridian markers */}
          <line x1="0" y1="90" x2="360" y2="90" stroke="rgba(245, 158, 11, 0.3)" strokeDasharray="3,3" strokeWidth="0.8" />
          <line x1="180" y1="0" x2="180" y2="180" stroke="rgba(6, 182, 212, 0.3)" strokeDasharray="3,3" strokeWidth="0.8" />
        </svg>

        {/* Real Target Location Marker (Revealed upon finish) */}
        {completed && (
          <div
            className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full bg-emerald-500/60 border-2 border-emerald-300 flex items-center justify-center animate-ping"
            style={{
              left: `${targetNorm.normX * 100}%`,
              top: `${targetNorm.normY * 100}%`,
            }}
          />
        )}
        {completed && (
          <div
            className="absolute text-[11px] font-mono font-bold bg-emerald-950 px-2 py-0.5 rounded text-emerald-300 border border-emerald-400 -mt-7 -ml-6"
            style={{
              left: `${targetNorm.normX * 100}%`,
              top: `${targetNorm.normY * 100}%`,
            }}
          >
            🎯 {targetCity.city}
          </div>
        )}

        {/* Fighter A Pin */}
        {pinA && (
          <div
            className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full bg-cyan-500 border-2 border-white shadow-lg flex items-center justify-center text-[10px] font-bold"
            style={{ left: `${pinA.x * 100}%`, top: `${pinA.y * 100}%` }}
          >
            A
          </div>
        )}

        {/* Fighter B Pin */}
        {pinB && (
          <div
            className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full bg-amber-500 border-2 border-white shadow-lg flex items-center justify-center text-[10px] font-bold"
            style={{ left: `${pinB.x * 100}%`, top: `${pinB.y * 100}%` }}
          >
            B
          </div>
        )}

        <div className="absolute bottom-2 left-3 text-[10px] font-mono text-slate-400 bg-slate-950/70 px-2 py-0.5 rounded">
          Equirectangular World Projection · Tap map
        </div>
      </div>

      {/* Haversine Distance Scoreboard */}
      <div className="grid grid-cols-2 gap-4 w-full">
        <div className="p-3 bg-slate-900 rounded-2xl border border-cyan-500/30 text-center">
          <div className="text-xs font-mono text-cyan-400 font-bold">{fighterA.name}</div>
          <div className="text-base font-mono font-black text-white mt-1">
            {distKmA !== null ? `${distKmA.toLocaleString()} km error` : 'Waiting for pin...'}
          </div>
        </div>
        <div className="p-3 bg-slate-900 rounded-2xl border border-amber-500/30 text-center">
          <div className="text-xs font-mono text-amber-400 font-bold">{fighterB.name}</div>
          <div className="text-base font-mono font-black text-white mt-1">
            {distKmB !== null ? `${distKmB.toLocaleString()} km error` : 'Waiting for pin...'}
          </div>
        </div>
      </div>
    </div>
  );
};
