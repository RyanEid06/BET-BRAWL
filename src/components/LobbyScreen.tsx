/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Room Lobby Screen (6-9 Players)
 */

import React from 'react';
import { Users, Wifi, Play, Plus, Trash2, Award, Zap } from 'lucide-react';
import type { Player } from '../engine/types.ts';
import { sound } from '../engine/audio.ts';

interface Props {
  players: Player[];
  roomCode: string;
  totalRounds: number;
  setTotalRounds: (n: number) => void;
  onStartGame: () => void;
  onAddPlayer: () => void;
  onRemovePlayer: (id: string) => void;
  onToggleReady: (id: string) => void;
}

export const LobbyScreen: React.FC<Props> = ({
  players,
  roomCode,
  totalRounds,
  setTotalRounds,
  onStartGame,
  onAddPlayer,
  onRemovePlayer,
  onToggleReady,
}) => {
  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {/* Top Room Banner */}
      <div className="bg-slate-900/90 border border-slate-700 rounded-3xl p-5 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 rounded-2xl">
            <Wifi className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="text-xs font-mono text-slate-400 flex items-center gap-2">
              LOCAL WI-FI HOST ACTIVE · <span className="text-emerald-400 font-bold">192.168.1.104:8080</span>
            </div>
            <h1 className="text-2xl font-black font-display text-white tracking-wide flex items-center gap-3">
              ROOM CODE: <span className="text-amber-400 font-mono tracking-widest">{roomCode}</span>
            </h1>
          </div>
        </div>

        {/* Round config */}
        <div className="flex items-center gap-3 bg-slate-950 px-4 py-2 rounded-2xl border border-slate-800">
          <span className="text-xs font-mono text-slate-400 uppercase">Match Length:</span>
          <div className="flex gap-1">
            {[8, 10].map(rounds => (
              <button
                key={rounds}
                onClick={() => {
                  setTotalRounds(rounds);
                  sound.playTap(true);
                }}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                  totalRounds === rounds
                    ? 'bg-cyan-500 text-slate-950 glow-cyan'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                {rounds} Rounds
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Players Grid (6 to 9 friends in physical room) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <span>PLAYERS IN ROOM ({players.length}/9)</span>
          </div>
          {players.length < 9 && (
            <button
              onClick={() => {
                onAddPlayer();
                sound.playTap(true);
              }}
              className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 bg-cyan-950/60 px-3 py-1 rounded-lg border border-cyan-800/60"
            >
              <Plus className="w-3.5 h-3.5" /> Add Player Slot
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {players.map((p, idx) => (
            <div
              key={p.id}
              className={`p-4 rounded-2xl border transition-all flex items-center justify-between ${
                p.isHost
                  ? 'bg-slate-900/90 border-cyan-500/60 shadow-lg glow-cyan'
                  : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl bg-slate-950 border border-slate-700 shadow-inner"
                  style={{ borderColor: p.color }}
                >
                  {p.avatar}
                </div>
                <div>
                  <div className="font-bold text-sm text-white flex items-center gap-1.5">
                    {p.name}
                    {p.isHost && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 bg-cyan-950 text-cyan-300 border border-cyan-700 rounded">
                        HOST
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-mono text-amber-400 font-bold">
                    💰 {p.coins.toLocaleString()} coins
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    onToggleReady(p.id);
                    sound.playTap(true);
                  }}
                  className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg border transition-all ${
                    p.isReady
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
                      : 'bg-slate-950 text-slate-500 border-slate-800'
                  }`}
                >
                  {p.isReady ? 'READY ✓' : 'NOT READY'}
                </button>
                {players.length > 4 && !p.isHost && (
                  <button
                    onClick={() => {
                      onRemovePlayer(p.id);
                      sound.playTap(false);
                    }}
                    title="Remove player"
                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Start Game Action */}
      <div className="pt-4 flex flex-col items-center gap-3">
        <button
          onClick={() => {
            sound.playFanfare();
            onStartGame();
          }}
          className="w-full max-w-md py-5 rounded-2xl font-display font-black text-2xl uppercase tracking-wider bg-gradient-to-r from-cyan-500 via-amber-500 to-rose-500 hover:from-cyan-400 hover:to-rose-400 text-slate-950 shadow-2xl transition-all transform active:scale-95 glow-gold border-2 border-amber-300 flex items-center justify-center gap-3 cursor-pointer"
        >
          <Play className="w-6 h-6 fill-current" />
          START ROUND 1 BRAWL!
        </button>
        <div className="text-xs font-mono text-slate-400">
          All {players.length} players ready · Match begins with random 2-fighter selection
        </div>
      </div>
    </div>
  );
};
