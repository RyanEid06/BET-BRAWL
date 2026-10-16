/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Title Screen & Local Wi-Fi Network Discovery
 */

import React, { useState, useEffect } from 'react';
import { Wifi, Volume2, VolumeX, ShieldCheck, Play, Sparkles, Smartphone, Code2 } from 'lucide-react';
import { sound } from '../engine/audio.ts';

interface Props {
  playerName: string;
  setPlayerName: (name: string) => void;
  playerAvatar: string;
  setPlayerAvatar: (avatar: string) => void;
  onEnterLobby: () => void;
  onOpenBlueprint: () => void;
}

const AVATAR_OPTIONS = ['⚡', '🦊', '🦾', '🎯', '🦁', '🔮', '🥊', '🚀', '💀', '🎲', '👑', '🐉'];

export const TitleAndDiscovery: React.FC<Props> = ({
  playerName,
  setPlayerName,
  playerAvatar,
  setPlayerAvatar,
  onEnterLobby,
  onOpenBlueprint,
}) => {
  const [isMuted, setIsMuted] = useState(sound.isMuted);
  const [simulatedDiscovery, setSimulatedDiscovery] = useState({
    status: 'ACTIVE',
    service: '_betnbrawl._tcp.local',
    ip: '192.168.1.104',
    port: 8080,
    roomCode: 'BRAWL',
    peersFound: 6,
  });

  const toggleMute = () => {
    sound.isMuted = !sound.isMuted;
    setIsMuted(sound.isMuted);
    if (!sound.isMuted) sound.playCoin();
  };

  // Keyboard shortcut Enter or Space to start
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.code === 'Enter' || e.code === 'Space') && (e.target as HTMLElement)?.tagName !== 'INPUT') {
        e.preventDefault();
        sound.playFanfare();
        onEnterLobby();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onEnterLobby]);

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between items-center p-6 arcade-grid overflow-hidden">
      {/* Background radial spotlights */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-cyan-600/20 via-rose-600/15 to-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Utility Bar */}
      <header className="w-full max-w-4xl flex items-center justify-between z-10">
        {/* Local Wi-Fi Discovery Pill */}
        <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-emerald-500/40 text-emerald-300 text-xs font-mono shadow-lg">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <Wifi className="w-3.5 h-3.5" />
          <span>Local Wi-Fi Host: <span className="font-bold text-white">192.168.1.104:8080</span></span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-300">Room: <span className="text-amber-400 font-bold">BRAWL</span></span>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenBlueprint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-cyan-500/30 text-cyan-300 text-xs font-mono transition-colors shadow-md"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Architecture Spec</span>
          </button>
          <button
            onClick={toggleMute}
            aria-label={isMuted ? 'Unmute Sound' : 'Mute Sound'}
            className="p-2 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs transition-colors"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </header>

      {/* Centerpiece Hero & Bespoke SVG Title */}
      <main className="flex flex-col items-center justify-center my-auto z-10 max-w-lg w-full space-y-6 text-center">
        {/* Custom SVG Title Lockup */}
        <div className="w-full max-w-md mx-auto">
          <svg viewBox="0 0 500 130" className="w-full h-auto drop-shadow-[0_0_35px_rgba(6,182,212,0.5)]">
            <defs>
              <linearGradient id="titleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#06b6d4" />
                <stop offset="50%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#ef4444" />
              </linearGradient>
              <linearGradient id="strokeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#fbbf24" />
              </linearGradient>
            </defs>
            {/* Background Emblem Silhouette */}
            <path
              d="M 50 15 L 450 15 L 430 115 L 70 115 Z"
              fill="#090a14"
              stroke="url(#strokeGrad)"
              strokeWidth="2.5"
            />
            {/* Slanted text lockup */}
            <text
              x="250"
              y="68"
              textAnchor="middle"
              fontFamily="Chakra Petch, sans-serif"
              fontWeight="900"
              fontSize="48"
              letterSpacing="3"
              fill="url(#titleGrad)"
              stroke="#000"
              strokeWidth="1.5"
            >
              BET &amp; BRAWL
            </text>
            <text
              x="250"
              y="100"
              textAnchor="middle"
              fontFamily="JetBrains Mono, monospace"
              fontWeight="700"
              fontSize="12"
              letterSpacing="6"
              fill="#94a3b8"
            >
              LOCAL WI-FI PARTY ENGINE
            </text>
          </svg>
        </div>

        {/* Tagline */}
        <p className="text-slate-300 text-sm max-w-md leading-relaxed font-sans">
          6 to 9 friends in one physical room. Two battle in fast 15-second mini-games.
          The rest place secret live bets with dynamic odds!
        </p>

        {/* Player Profile Setup Card */}
        <div className="w-full bg-slate-900/90 border border-slate-700/80 rounded-2xl p-5 shadow-2xl backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 border-b border-slate-800 pb-2">
            <span>YOUR FIGHTER PROFILE</span>
            <span className="text-amber-400 font-bold flex items-center gap-1">
              💰 1,000 STARTING COINS
            </span>
          </div>

          {/* Name & Avatar Input */}
          <div className="flex gap-3 items-center">
            <div className="text-3xl p-2.5 rounded-xl bg-slate-950 border border-slate-700 flex items-center justify-center">
              {playerAvatar}
            </div>
            <div className="flex-1 text-left">
              <label htmlFor="player-name-input" className="block text-[11px] font-mono text-slate-400 mb-1">
                CODENAME / ALIAS
              </label>
              <input
                id="player-name-input"
                type="text"
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                maxLength={14}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-bold text-sm focus:border-cyan-400 focus:outline-none"
                placeholder="Enter alias..."
              />
            </div>
          </div>

          {/* Avatar Selector */}
          <div>
            <div className="text-[11px] font-mono text-slate-400 mb-1 text-left">CHOOSE AVATAR</div>
            <div className="grid grid-cols-6 gap-2">
              {AVATAR_OPTIONS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => {
                    setPlayerAvatar(emoji);
                    sound.playTap(true);
                  }}
                  className={`p-2 rounded-lg text-lg transition-all ${
                    playerAvatar === emoji
                      ? 'bg-cyan-500/20 border-2 border-cyan-400 scale-105'
                      : 'bg-slate-950 border border-slate-800 hover:border-slate-600'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Primary Start CTA */}
          <button
            data-start="true"
            onClick={() => {
              sound.playFanfare();
              onEnterLobby();
            }}
            className="w-full py-4 rounded-xl font-display font-black text-xl uppercase tracking-wider bg-gradient-to-r from-cyan-500 via-amber-500 to-rose-500 hover:from-cyan-400 hover:to-rose-400 text-slate-950 shadow-xl transition-all transform active:scale-95 glow-gold border border-amber-300 flex items-center justify-center gap-2"
          >
            <Play className="w-5 h-5 fill-current" />
            ENTER ROOM LOBBY
          </button>
        </div>
      </main>

      {/* Flat Control Hints in Bottom Margin */}
      <footer className="w-full max-w-4xl text-center text-xs text-slate-400 font-mono z-10 pt-4">
        <span>Enter / Space Start · 100% Offline Wi-Fi Network · Zero Cloud Servers Required</span>
      </footer>
    </div>
  );
};
