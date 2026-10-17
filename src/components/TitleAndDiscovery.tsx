/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Party Game Entry Screen (Host vs Join)
 */

import React, { useState } from 'react';
import { Play, Users, Wifi, LogIn, AlertCircle } from 'lucide-react';
import { sound } from '../engine/audio.ts';
import type { RoomNetworkInfo } from '../engine/types.ts';

interface Props {
  playerName: string;
  setPlayerName: (name: string) => void;
  playerAvatar: string;
  setPlayerAvatar: (avatar: string) => void;
  networkInfo: RoomNetworkInfo | null;
  onHostGame: () => void;
  onJoinGame: (roomCode: string) => void;
  errorMessage: string | null;
  status: string;
}

const AVATAR_OPTIONS = ['⚡', '🦊', '🦾', '🎯', '🦁', '🔮', '🥊', '🚀', '💀', '🎲', '👑', '🐉'];

export const TitleAndDiscovery: React.FC<Props> = ({
  playerName,
  setPlayerName,
  playerAvatar,
  setPlayerAvatar,
  networkInfo,
  onHostGame,
  onJoinGame,
  errorMessage,
  status,
}) => {
  const [mode, setMode] = useState<'SELECT' | 'JOIN_INPUT'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('room') || params.get('code')) return 'JOIN_INPUT';
    }
    return 'SELECT';
  });
  const [joinCode, setJoinCode] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return (params.get('room') || params.get('code') || '').toUpperCase();
    }
    return '';
  });

  const handleStartHosting = () => {
    sound.playFanfare();
    onHostGame();
  };

  const handleConfirmJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    sound.playTap(true);
    onJoinGame(joinCode.trim().toUpperCase());
  };

  const handleQuickJoinActiveRoom = () => {
    if (!networkInfo?.roomCode) return;
    sound.playTap(true);
    setJoinCode(networkInfo.roomCode);
    onJoinGame(networkInfo.roomCode);
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-between items-center p-4 sm:p-6 arcade-grid overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-tr from-cyan-600/15 via-amber-500/10 to-rose-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Local Network Status Header */}
      <header className="w-full max-w-md flex items-center justify-between z-10 pt-2">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-700/80 text-xs font-mono text-slate-300">
          <Wifi className="w-3.5 h-3.5 text-emerald-400" />
          <span>Local Wi-Fi Server</span>
          {networkInfo && (
            <span className="text-cyan-400 font-bold">{networkInfo.localIp}:{networkInfo.port}</span>
          )}
        </div>
      </header>

      {/* Centerpiece Hero */}
      <main className="flex flex-col items-center justify-center my-auto z-10 max-w-sm sm:max-w-md w-full space-y-6 text-center">
        {/* Title Lockup */}
        <div className="space-y-1">
          <h1 className="text-4xl sm:text-5xl font-black font-display tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-amber-400 to-rose-400">
            BET &amp; BRAWL
          </h1>
          <p className="text-amber-400 font-display font-bold tracking-widest text-xs uppercase">
            Fight. Bet. Brag.
          </p>
        </div>

        {/* Player Profile Card */}
        <div className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
          {/* Avatar & Name Input */}
          <div className="flex gap-3 items-center">
            <div className="text-3xl p-2.5 rounded-2xl bg-slate-950 border border-slate-700 flex items-center justify-center">
              {playerAvatar}
            </div>
            <div className="flex-1 text-left">
              <label htmlFor="player-alias" className="block text-xs font-mono text-slate-400 mb-1">
                YOUR NAME / ALIAS
              </label>
              <input
                id="player-alias"
                type="text"
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                maxLength={14}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold text-sm focus:border-cyan-400 focus:outline-none"
                placeholder="Enter alias..."
              />
            </div>
          </div>

          {/* Avatar Selector */}
          <div>
            <div className="text-xs font-mono text-slate-400 mb-1.5 text-left">SELECT AVATAR</div>
            <div className="grid grid-cols-6 gap-1.5">
              {AVATAR_OPTIONS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => {
                    setPlayerAvatar(emoji);
                    sound.playTap(true);
                  }}
                  className={`p-2 rounded-xl text-lg transition-all cursor-pointer ${
                    playerAvatar === emoji
                      ? 'bg-cyan-500/20 border-2 border-cyan-400 scale-105'
                      : 'bg-slate-950 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/80 text-rose-300 text-xs flex items-center gap-2 text-left">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Choice: HOST vs JOIN */}
          {mode === 'SELECT' ? (
            <div className="space-y-2.5 pt-1">
              {networkInfo?.hasActiveRoom && networkInfo.roomCode && (
                <button
                  onClick={handleQuickJoinActiveRoom}
                  className="w-full p-3.5 rounded-2xl bg-emerald-950/80 hover:bg-emerald-900/90 border-2 border-emerald-500 text-left transition-all flex items-center justify-between cursor-pointer group shadow-lg"
                >
                  <div>
                    <div className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                      ACTIVE ROOM ON THIS WI-FI
                    </div>
                    <div className="font-display font-black text-lg text-white">
                      JOIN ROOM <span className="text-amber-400 font-mono">{networkInfo.roomCode}</span>
                    </div>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 font-mono font-bold text-xs uppercase group-hover:bg-emerald-400">
                    JOIN NOW →
                  </div>
                </button>
              )}

              <button
                onClick={handleStartHosting}
                className="w-full py-4 rounded-2xl font-display font-black text-lg uppercase tracking-wider bg-gradient-to-r from-cyan-500 via-amber-500 to-rose-500 hover:from-cyan-400 hover:to-rose-400 text-slate-950 shadow-xl transition-all transform active:scale-95 glow-gold border border-amber-300 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-5 h-5 fill-current" />
                HOST NEW GAME
              </button>

              <button
                onClick={() => {
                  setMode('JOIN_INPUT');
                  sound.playTap(true);
                }}
                className="w-full py-3.5 rounded-2xl font-display font-bold text-base uppercase tracking-wider bg-slate-950 hover:bg-slate-800 text-cyan-300 border border-cyan-500/40 shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                JOIN GAME WITH CODE
              </button>
            </div>
          ) : (
            <form onSubmit={handleConfirmJoin} className="space-y-3 pt-1">
              <div className="text-left">
                <label htmlFor="room-code-input" className="block text-xs font-mono text-slate-400 mb-1">
                  ENTER ROOM CODE
                </label>
                <input
                  id="room-code-input"
                  type="text"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  autoFocus
                  placeholder="e.g. BRAWL"
                  className="w-full bg-slate-950 border-2 border-cyan-500/60 rounded-xl px-4 py-3 text-center text-amber-400 font-mono font-black text-2xl tracking-widest uppercase focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode('SELECT')}
                  className="px-4 py-3 rounded-xl font-mono text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!joinCode.trim() || status === 'CONNECTING'}
                  className="flex-1 py-3 rounded-xl font-display font-black text-base uppercase tracking-wider bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-lg cursor-pointer disabled:opacity-50"
                >
                  {status === 'CONNECTING' ? 'CONNECTING...' : 'JOIN ROOM'}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-md text-center text-xs text-slate-500 font-mono pt-4">
        <span>3 to 9 friends · 100% Offline Local Network · Zero Cloud Required</span>
      </footer>
    </div>
  );
};
