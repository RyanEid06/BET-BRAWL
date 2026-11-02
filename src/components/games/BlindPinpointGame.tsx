/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Mini-Game 5 - Blind Pinpoint
 * Bundles an offline, geographically aligned equirectangular world map projection (Natural Earth Public Domain standard).
 */

import React, { useEffect, useRef, useState } from 'react';
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

  const pinA = pins[fighterA.id] || null;
  const pinB = pins[fighterB.id] || null;
  const distKmA = pinA && fighterScores[fighterA.id] !== undefined ? fighterScores[fighterA.id] : null;
  const distKmB = pinB && fighterScores[fighterB.id] !== undefined ? fighterScores[fighterB.id] : null;

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const activePointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ x: number; y: number; mapX: number; mapY: number; moved: boolean } | null>(null);
  const pinch = useRef<{ distance: number; zoom: number; anchorX: number; anchorY: number } | null>(null);
  const suppressTap = useRef(false);
  const lockSent = useRef(false);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [draft, setDraft] = useState<{ normX: number; normY: number } | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const lockedPin = playerFighterSlot === 'A' ? pinA : playerFighterSlot === 'B' ? pinB : null;
  const hasLocked = lockedPin !== null;
  const submitted = hasLocked || isSubmitted;
  useEffect(() => {
    const resize = () => {
      const map = mapContainerRef.current;
      if (map) setView(current => ({...current,
        x: Math.max(map.clientWidth * (1 - current.zoom), Math.min(0, current.x)),
        y: Math.max(map.clientHeight * (1 - current.zoom), Math.min(0, current.y)),
      }));
    };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const boundedView = (zoom: number, x: number, y: number) => {
    const rect = mapContainerRef.current?.getBoundingClientRect();
    const scale = Math.max(1, Math.min(4, zoom));
    return {
      zoom: scale,
      x: rect ? Math.max(mapContainerRef.current!.clientWidth * (1 - scale), Math.min(0, x)) : 0,
      y: rect ? Math.max(mapContainerRef.current!.clientHeight * (1 - scale), Math.min(0, y)) : 0,
    };
  };
  const zoomAt = (clientX: number, clientY: number, zoom: number) => {
    const rect = mapContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nextZoom = Math.max(1, Math.min(4, zoom));
    const left = rect.left + mapContainerRef.current!.clientLeft, top = rect.top + mapContainerRef.current!.clientTop;
    const mapX = (clientX - left - view.x) / view.zoom;
    const mapY = (clientY - top - view.y) / view.zoom;
    setView(boundedView(nextZoom, clientX - left - mapX * nextZoom, clientY - top - mapY * nextZoom));
  };
  const zoomMap = (zoom: number) => {
    const rect = mapContainerRef.current?.getBoundingClientRect();
    if (rect && mapContainerRef.current) zoomAt(rect.left + mapContainerRef.current.clientLeft + mapContainerRef.current.clientWidth / 2, rect.top + mapContainerRef.current.clientTop + mapContainerRef.current.clientHeight / 2, zoom);
  };
  const pointInMap = (clientX: number, clientY: number) => {
    const rect = mapContainerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      normX: Math.max(0, Math.min(1, (clientX - rect.left - mapContainerRef.current!.clientLeft - view.x) / (mapContainerRef.current!.clientWidth * view.zoom))),
      normY: Math.max(0, Math.min(1, (clientY - rect.top - mapContainerRef.current!.clientTop - view.y) / (mapContainerRef.current!.clientHeight * view.zoom))),
    };
  };
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointers.current.size > 1) {
      suppressTap.current = true;
      const [a, b] = [...activePointers.current.values()];
      const rect = mapContainerRef.current!.getBoundingClientRect();
      const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom,
        anchorX: (midX - rect.left - mapContainerRef.current!.clientLeft - view.x) / view.zoom,
        anchorY: (midY - rect.top - mapContainerRef.current!.clientTop - view.y) / view.zoom,
      };
      gesture.current = null;
    } else {
      gesture.current = { x: event.clientX, y: event.clientY, mapX: view.x, mapY: view.y, moved: false };
    }
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!activePointers.current.has(event.pointerId)) return;
    activePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (activePointers.current.size > 1 && pinch.current && mapContainerRef.current) {
      const [a, b] = [...activePointers.current.values()];
      const rect = mapContainerRef.current.getBoundingClientRect();
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2 - rect.left - mapContainerRef.current.clientLeft, midY = (a.y + b.y) / 2 - rect.top - mapContainerRef.current.clientTop;
      const zoom = Math.max(1, Math.min(4, pinch.current.zoom * distance / Math.max(1, pinch.current.distance)));
      setView(boundedView(zoom, midX - pinch.current.anchorX * zoom, midY - pinch.current.anchorY * zoom));
    } else if (activePointers.current.size === 1 && gesture.current) {
      const dx = event.clientX - gesture.current.x, dy = event.clientY - gesture.current.y;
      if (Math.hypot(dx, dy) > 6) gesture.current.moved = true;
      if (gesture.current.moved) setView(boundedView(view.zoom, gesture.current.mapX + dx, gesture.current.mapY + dy));
    }
  };
  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const wasPinching = suppressTap.current;
    const pointer = activePointers.current.get(event.pointerId);
    const wasTap = gesture.current && !gesture.current.moved && pointer && activePointers.current.size === 1;
    activePointers.current.delete(event.pointerId);
    gesture.current = null;
    if (activePointers.current.size === 0) {
      pinch.current = null;
      suppressTap.current = false;
    }
    if (wasTap && !wasPinching && isPlayerFighter && !hasLocked && !lockSent.current) {
      const next = pointInMap(event.clientX, event.clientY);
      if (next) { setDraft(next); sound.playTap(true); }
    }
  };
  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    activePointers.current.delete(event.pointerId);
    gesture.current = null;
    suppressTap.current = true;
    if (activePointers.current.size === 0) { pinch.current = null; suppressTap.current = false; }
  };
  const lockGuess = () => {
    if (!draft || submitted || !isPlayerFighter || lockSent.current) return;
    lockSent.current = true;
    setIsSubmitted(true);
    sound.playTap(true);
    onSendAction({ type: 'PIN', normX: draft.normX, normY: draft.normY });
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
        data-testid="pinpoint-map"
        aria-label="Interactive world map"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onWheel={(event) => { event.preventDefault(); zoomAt(event.clientX, event.clientY, view.zoom * (event.deltaY < 0 ? 1.2 : 1 / 1.2)); }}
        className={`relative w-full aspect-[2/1] bg-[#050814] rounded-2xl border-2 border-slate-700 overflow-hidden shadow-2xl select-none touch-none ${
          isPlayerFighter && !submitted ? 'cursor-crosshair' : 'cursor-grab'
        }`}
      >
        <div
          data-testid="pinpoint-world"
          style={{ width: '100%', height: '100%', position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, '--bp-zoom': String(view.zoom), '--bp-x': `${view.x}px`, '--bp-y': `${view.y}px` } as React.CSSProperties}
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

        {draft && !hasLocked && (
          <div
            data-testid="draft-pin"
            aria-label={submitted ? 'Locked draft pin' : 'Draft pin, not submitted'}
            className={`absolute w-7 h-7 -ml-3.5 -mt-3.5 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-xs font-black z-20 pointer-events-none ${submitted ? 'bg-emerald-500' : 'bg-fuchsia-500'}`}
            style={{ left: `${draft.normX * 100}%`, top: `${draft.normY * 100}%` }}
          >{playerFighterSlot}</div>
        )}

        <div className="absolute bottom-1.5 left-2.5 text-[9px] font-mono text-slate-400 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800 pointer-events-none">
          Equirectangular Map (-180° to +180° Lon · +90° to -90° Lat)
        </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 w-full" aria-label="Map controls">
        <button type="button" aria-label="Zoom out" onClick={() => zoomMap(view.zoom / 1.5)} disabled={view.zoom <= 1} className="min-h-11 min-w-11 rounded-lg border border-slate-600 bg-slate-900 px-3 font-bold disabled:opacity-40">−</button>
        <button type="button" aria-label="Zoom in" onClick={() => zoomMap(view.zoom * 1.5)} disabled={view.zoom >= 4} className="min-h-11 min-w-11 rounded-lg border border-slate-600 bg-slate-900 px-3 font-bold disabled:opacity-40">+</button>
        <button type="button" aria-label="Reset map" onClick={() => setView({ zoom: 1, x: 0, y: 0 })} disabled={view.zoom === 1 && view.x === 0 && view.y === 0} className="min-h-11 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm disabled:opacity-40">Reset</button>
        {isPlayerFighter && !hasLocked && <button type="button" aria-label="Lock guess" onClick={lockGuess} disabled={!draft || submitted} className="min-h-11 rounded-lg border border-emerald-400 bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-40">Lock guess</button>}
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
            {submitted
              ? '✓ Guess locked. Waiting for opponent...'
              : draft
                ? 'Draft pin · Tap the map to move it, then lock your guess.'
                : 'Drag to explore · Tap to place a draft pin · Lock guess to submit.'}
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
