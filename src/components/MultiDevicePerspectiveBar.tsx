/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Multi-Device Simulator Bar & Network Protocol Inspector
 */

import React, { useState } from 'react';
import type { Player, AnyWebSocketMessage } from '../engine/types.ts';
import { Smartphone, Radio, FileJson, Layers, Volume2, VolumeX, Eye } from 'lucide-react';
import { sound } from '../engine/audio.ts';

interface Props {
  players: Player[];
  clientPerspective: string;
  setClientPerspective: (id: string) => void;
  messageLog: AnyWebSocketMessage[];
  onOpenBlueprint: () => void;
}

export const MultiDevicePerspectiveBar: React.FC<Props> = ({
  players,
  clientPerspective,
  setClientPerspective,
  messageLog,
  onOpenBlueprint,
}) => {
  const [showLogDrawer, setShowLogDrawer] = useState(false);
  const [isMuted, setIsMuted] = useState(sound.isMuted);

  const toggleMute = () => {
    sound.isMuted = !sound.isMuted;
    setIsMuted(sound.isMuted);
    if (!sound.isMuted) sound.playCoin();
  };

  const activePlayer = players.find(p => p.id === clientPerspective);

  return (
    <>
      {/* Bottom Sticky Control Bar */}
      <aside aria-label="Device Simulator and Network Tools" className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 border-t border-slate-800 px-3 py-2 backdrop-blur-md shadow-2xl">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          {/* Device Perspective Selector */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 flex items-center gap-1.5 hidden sm:flex">
              <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
              <span>Simulated Device:</span>
            </span>
            <select
              value={clientPerspective}
              aria-label="Simulated Device Perspective"
              onChange={e => {
                setClientPerspective(e.target.value);
                sound.playTap(true);
              }}
              className="bg-slate-900 border border-slate-700 text-cyan-300 font-bold px-3 py-1.5 rounded-lg focus:outline-none focus:border-cyan-400"
            >
              {players.map(p => (
                <option key={p.id} value={p.id}>
                  {p.avatar} {p.name} ({p.coins}c)
                </option>
              ))}
            </select>
            {activePlayer && (
              <span className="text-[11px] text-amber-400 font-bold hidden md:inline">
                Bankroll: {activePlayer.coins} coins
              </span>
            )}
          </div>

          {/* Right Action Tools */}
          <div className="flex items-center gap-2">
            {/* Network Protocol Inspector Toggle */}
            <button
              onClick={() => setShowLogDrawer(!showLogDrawer)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all ${
                showLogDrawer
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/60'
                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
              }`}
            >
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>Socket Packets ({messageLog.length})</span>
            </button>

            {/* Architecture Spec Button */}
            <button
              onClick={onOpenBlueprint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-cyan-500/40 text-cyan-300 hover:bg-slate-800 transition-colors"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Engine Spec</span>
            </button>

            {/* Audio Toggle */}
            <button
              onClick={toggleMute}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors"
              title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Network Protocol Inspector Drawer */}
      {showLogDrawer && (
        <div className="fixed bottom-14 right-4 z-50 w-full max-w-lg max-h-96 bg-slate-950 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col font-mono text-xs">
          <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
            <span className="text-cyan-400 font-bold flex items-center gap-1.5">
              <FileJson className="w-4 h-4" /> Live WebSocket Protocol Inspector
            </span>
            <button
              onClick={() => setShowLogDrawer(false)}
              className="text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 p-3 overflow-y-auto space-y-2 bg-black/90">
            {messageLog.map((msg, idx) => (
              <div key={idx} className="p-2 rounded bg-slate-900/90 border border-slate-800 text-[11px]">
                <div className="flex items-center justify-between text-slate-400 border-b border-slate-800/60 pb-1 mb-1">
                  <span className="text-amber-400 font-bold">{msg.type}</span>
                  <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                </div>
                <pre className="text-emerald-400 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(msg, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
