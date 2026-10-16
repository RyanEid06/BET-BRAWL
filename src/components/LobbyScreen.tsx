/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Real Wi-Fi Room Lobby with QR Code & Real Joined Players
 */

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Users, Wifi, Play, CheckCircle, Bot } from 'lucide-react';
import type { Player, RoomNetworkInfo } from '../engine/types.ts';
import { MIN_PLAYERS_TO_START, MAX_PLAYERS_CAPACITY } from '../engine/roomEngine.ts';
import { sound } from '../engine/audio.ts';

interface Props {
  players: Player[];
  roomCode: string;
  isHost: boolean;
  myPlayer: Player | null;
  networkInfo: RoomNetworkInfo | null;
  totalRounds: number;
  onToggleReady: () => void;
  onStartGame: () => void;
  onAddDebugBot?: () => void;
  isDebug?: boolean;
}

export const LobbyScreen: React.FC<Props> = ({
  players,
  roomCode,
  isHost,
  myPlayer,
  networkInfo,
  totalRounds,
  onToggleReady,
  onStartGame,
  onAddDebugBot,
  isDebug = false,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const baseUrl = networkInfo?.fullJoinUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  const joinUrlWithRoom = roomCode ? `${baseUrl}?room=${roomCode}` : baseUrl;

  // Generate real join QR code
  useEffect(() => {
    if (joinUrlWithRoom) {
      QRCode.toDataURL(joinUrlWithRoom, {
        margin: 1,
        width: 160,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      })
        .then(url => setQrDataUrl(url))
        .catch(err => console.error('QR code generation error:', err));
    }
  }, [joinUrlWithRoom]);

  const enoughPlayers = players.length >= MIN_PLAYERS_TO_START || isDebug;
  const allReady = players.every(p => p.isReady || p.isHost) || isDebug;
  const canStart = isHost && enoughPlayers && allReady;

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {/* Prominent Host Wi-Fi Join Card */}
      <div className="bg-slate-900/95 border-2 border-cyan-500/40 rounded-3xl p-5 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex-1 space-y-2 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700/60 text-xs font-mono">
            <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>Friends on this Wi-Fi can join:</span>
          </div>

          <h2 className="text-xl md:text-2xl font-black font-display text-white">
            JOIN AT: <span className="text-cyan-300 font-mono text-base md:text-xl break-all">{baseUrl}</span>
          </h2>

          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-1">
            <div className="px-3.5 py-1.5 rounded-xl bg-slate-950 border border-slate-700 font-mono text-sm text-slate-300">
              ROOM CODE: <span className="text-amber-400 font-bold text-base tracking-widest">{roomCode}</span>
            </div>
            <div className="px-3.5 py-1.5 rounded-xl bg-slate-950 border border-slate-700 font-mono text-sm text-slate-300 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-cyan-400" />
              <span>{players.length}/{MAX_PLAYERS_CAPACITY} Joined</span>
            </div>
          </div>
        </div>

        {/* QR Code Container */}
        {qrDataUrl && (
          <div className="bg-white p-2.5 rounded-2xl shadow-xl flex flex-col items-center shrink-0">
            <img src={qrDataUrl} alt="Scan to join Bet & BRAWL" className="w-28 h-28 md:w-32 md:h-32 rounded-lg" />
            <span className="text-[10px] font-mono font-bold text-slate-900 mt-1 uppercase">Scan to Join</span>
          </div>
        )}
      </div>

      {/* Players in Room */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <span>CONNECTED PLAYERS ({players.length}/{MAX_PLAYERS_CAPACITY})</span>
          </div>

          {/* Debug bot addition for developer testing */}
          {isDebug && onAddDebugBot && players.length < MAX_PLAYERS_CAPACITY && (
            <button
              onClick={() => {
                onAddDebugBot();
                sound.playTap(true);
              }}
              className="text-xs font-mono text-amber-300 hover:text-amber-200 flex items-center gap-1 bg-amber-950/60 px-3 py-1 rounded-lg border border-amber-800/60 cursor-pointer"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>+ Add Test Bot (debug)</span>
            </button>
          )}
        </div>

        {/* Player Roster Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {players.map(p => (
            <div
              key={p.id}
              className={`p-4 rounded-2xl border transition-all flex items-center justify-between ${
                p.id === myPlayer?.id
                  ? 'bg-slate-900/90 border-cyan-400 shadow-lg glow-cyan'
                  : 'bg-slate-900/70 border-slate-800'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl bg-slate-950 border shadow-inner"
                  style={{ borderColor: p.color }}
                >
                  {p.avatar}
                </div>
                <div>
                  <div className="font-bold text-sm text-white flex items-center gap-1.5">
                    {p.name}
                    {p.isHost && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 bg-cyan-950 text-cyan-300 border border-cyan-700 rounded">
                        HOST
                      </span>
                    )}
                    {p.id === myPlayer?.id && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded">
                        YOU
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-mono text-amber-400 font-bold">
                    💰 {p.coins.toLocaleString()} coins
                  </div>
                </div>
              </div>

              <div>
                {p.id === myPlayer?.id && !p.isHost ? (
                  <button
                    onClick={() => {
                      onToggleReady();
                      sound.playTap(true);
                    }}
                    className={`text-xs font-mono font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                      p.isReady
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-500'
                        : 'bg-slate-950 text-slate-400 border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    {p.isReady ? 'READY' : 'SET READY'}
                  </button>
                ) : (
                  <span
                    className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg border ${
                      p.isReady || p.isHost
                        ? 'bg-emerald-950/80 text-emerald-400 border-emerald-600/60'
                        : 'bg-slate-950 text-slate-500 border-slate-800'
                    }`}
                  >
                    {p.isReady || p.isHost ? 'READY' : 'WAITING'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Start Game Action (Host only) */}
      <div className="pt-2 flex flex-col items-center gap-3">
        {isHost ? (
          <div className="w-full max-w-md space-y-2 text-center">
            <button
              onClick={() => {
                sound.playFanfare();
                onStartGame();
              }}
              disabled={!canStart}
              className={`w-full py-5 rounded-2xl font-display font-black text-2xl uppercase tracking-wider transition-all transform active:scale-95 shadow-2xl flex items-center justify-center gap-3 ${
                canStart
                  ? 'bg-gradient-to-r from-cyan-500 via-amber-500 to-rose-500 hover:from-cyan-400 hover:to-rose-400 text-slate-950 glow-gold border-2 border-amber-300 cursor-pointer'
                  : 'bg-slate-900 text-slate-500 border border-slate-800 cursor-not-allowed'
              }`}
            >
              <Play className="w-6 h-6 fill-current" />
              START BRAWL MATCH!
            </button>

            {!enoughPlayers && (
              <p className="text-xs font-mono text-amber-400">
                ⚠️ Need at least {MIN_PLAYERS_TO_START} players to start (currently {players.length}/{MIN_PLAYERS_TO_START})
              </p>
            )}
            {enoughPlayers && !allReady && (
              <p className="text-xs font-mono text-amber-400">
                ⚠️ Waiting for all players to click READY
              </p>
            )}
            {canStart && (
              <p className="text-xs font-mono text-emerald-400">
                ✓ All players ready! Click to begin Round 1
              </p>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-center w-full max-w-md">
            <p className="text-sm font-display font-bold text-white">
              {myPlayer?.isReady ? 'YOU ARE READY!' : 'CLICK READY ABOVE'}
            </p>
            <p className="text-xs font-mono text-slate-400 mt-1">
              Waiting for the host to launch the brawl...
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
