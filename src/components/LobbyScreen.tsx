/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Real Wi-Fi Room Lobby with Reachable LAN URLs, QR Code, & Real Player Seats
 */

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Users, Wifi, Play, Bot, WifiOff, LogOut } from 'lucide-react';
import type { PublicPlayer, RoomNetworkInfo } from '../engine/types.ts';
import { MIN_PLAYERS_TO_START, MAX_PLAYERS_CAPACITY } from '../engine/roomEngine.ts';
import { sound } from '../engine/audio.ts';

interface Props {
  players: PublicPlayer[];
  roomCode: string;
  isHost: boolean;
  myPlayer: PublicPlayer | null;
  networkInfo: RoomNetworkInfo | null;
  totalRounds: number;
  onToggleReady: () => void;
  onSetMatchLength: (rounds: 8 | 10) => void;
  onStartGame: () => void;
  onCloseRoom?: () => void;
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
  onSetMatchLength,
  onStartGame,
  onCloseRoom,
  onAddDebugBot,
  isDebug = false,
}) => {
  const isLoopbackUrl = (url: string | undefined): boolean => {
    if (!url) return true;
    try {
      const parsed = new URL(url);
      const host = parsed.hostname;
      return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1';
    } catch {
      return url.includes('localhost') || url.includes('127.0.0.1') || url.includes('0.0.0.0');
    }
  };

  const [selectedBaseUrl, setSelectedBaseUrl] = useState<string>(() => {
    // If client loaded over a proven non-loopback LAN host, use origin
    if (typeof window !== 'undefined' && !isLoopbackUrl(window.location.origin)) {
      return window.location.origin;
    }
    if (networkInfo?.fullJoinUrl && !isLoopbackUrl(networkInfo.fullJoinUrl)) {
      return networkInfo.fullJoinUrl;
    }
    return typeof window !== 'undefined' ? window.location.origin : '';
  });

  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (!networkInfo) return;

    // Never silently prefer localhost/loopback when a valid non-loopback LAN URL exists!
    if (networkInfo.fullJoinUrl && !isLoopbackUrl(networkInfo.fullJoinUrl)) {
      if (isLoopbackUrl(selectedBaseUrl)) {
        setSelectedBaseUrl(networkInfo.fullJoinUrl);
      }
    } else if (!selectedBaseUrl && networkInfo.fullJoinUrl) {
      setSelectedBaseUrl(networkInfo.fullJoinUrl);
    }
  }, [networkInfo, selectedBaseUrl]);

  const joinUrlWithRoom = roomCode
    ? `${selectedBaseUrl}?room=${roomCode}`
    : selectedBaseUrl;

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

  const connectedPlayers = players.filter(p => p.connected);
  const enoughPlayers = connectedPlayers.length >= MIN_PLAYERS_TO_START || isDebug;
  const allReady = connectedPlayers.every(p => p.isReady || p.isHost) || isDebug;
  const canStart = isHost && enoughPlayers && allReady;

  return (
    <div className="w-full max-w-4xl mx-auto p-3 sm:p-4 md:p-6 space-y-5">
      {/* Prominent Host Wi-Fi Join Card */}
      <div className="bg-slate-900/95 border-2 border-cyan-500/40 rounded-3xl p-5 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex-1 space-y-2 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700/60 text-xs font-mono">
            <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>Friends on the same Wi-Fi can join:</span>
          </div>

          <h2 className="text-lg sm:text-xl md:text-2xl font-black font-display text-white">
            JOIN AT: <span className="text-cyan-300 font-mono text-base md:text-xl break-all">{selectedBaseUrl}</span>
          </h2>

          {/* Multiple Candidate LAN URLs selector if host has multiple adapters */}
          {networkInfo?.candidateUrls && networkInfo.candidateUrls.length > 1 && isHost && (
            <div className="text-xs font-mono text-slate-400 flex items-center gap-2 flex-wrap">
              <span>Adapter URL:</span>
              {networkInfo.candidateUrls.map(url => (
                <button
                  key={url}
                  onClick={() => setSelectedBaseUrl(url)}
                  className={`px-2 py-0.5 rounded text-[11px] cursor-pointer transition-colors ${
                    selectedBaseUrl === url
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'bg-slate-950 text-slate-300 border border-slate-700 hover:border-slate-500'
                  }`}
                >
                  {url}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-1">
            <div className="px-3.5 py-1.5 rounded-xl bg-slate-950 border border-slate-700 font-mono text-sm text-slate-300">
              ROOM CODE: <span className="text-amber-400 font-bold text-base tracking-widest">{roomCode}</span>
            </div>
            <div className="px-3.5 py-1.5 rounded-xl bg-slate-950 border border-slate-700 font-mono text-sm text-slate-300 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-cyan-400" />
              <span>{connectedPlayers.length}/{MAX_PLAYERS_CAPACITY} Connected</span>
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

      {/* Host Match Length Selector (8 vs 10 Rounds) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-center sm:text-left">
          <div className="text-xs font-mono text-slate-400 uppercase">MATCH LENGTH SETTING</div>
          <div className="text-sm font-bold text-white font-display">
            {totalRounds} Rounds {totalRounds === 8 ? '(Standard Party Match)' : '(Extended Marathon)'}
          </div>
        </div>

        {isHost ? (
          <div className="flex gap-2">
            <button
              onClick={() => onSetMatchLength(8)}
              className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
                totalRounds === 8
                  ? 'bg-amber-500 text-slate-950 glow-gold'
                  : 'bg-slate-950 text-slate-300 border border-slate-700 hover:border-slate-500'
              }`}
            >
              8 ROUNDS
            </button>
            <button
              onClick={() => onSetMatchLength(10)}
              className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
                totalRounds === 10
                  ? 'bg-amber-500 text-slate-950 glow-gold'
                  : 'bg-slate-950 text-slate-300 border border-slate-700 hover:border-slate-500'
              }`}
            >
              10 ROUNDS
            </button>
          </div>
        ) : (
          <span className="text-xs font-mono text-amber-400 font-bold bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
            Host selected: {totalRounds} Rounds
          </span>
        )}
      </div>

      {/* Players in Room */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <span>PLAYERS IN ROOM ({connectedPlayers.length} connected · min {MIN_PLAYERS_TO_START})</span>
          </div>

          {/* Debug bot addition for developer testing */}
          {isDebug && onAddDebugBot && players.length < MAX_PLAYERS_CAPACITY && isHost && (
            <button
              onClick={() => {
                onAddDebugBot();
                sound.playTap(true);
              }}
              className="text-xs font-mono text-amber-300 hover:text-amber-200 flex items-center gap-1 bg-amber-950/60 px-3 py-1 rounded-lg border border-amber-800/60 cursor-pointer"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>+ Add Bot (debug)</span>
            </button>
          )}
        </div>

        {/* Player Roster Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {players.map(p => (
            <div
              key={p.id}
              className={`p-4 rounded-2xl border transition-all flex items-center justify-between ${
                !p.connected
                  ? 'bg-slate-950/60 border-slate-800 opacity-60'
                  : p.id === myPlayer?.id
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
                  <div className="text-xs font-mono text-amber-400 font-bold flex items-center gap-1 mt-0.5">
                    <span>💰 {p.coins.toLocaleString()} coins</span>
                    {!p.connected && (
                      <span className="text-rose-400 text-[10px] flex items-center gap-0.5">
                        <WifiOff className="w-3 h-3" /> (Disconnected)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                {!p.connected ? (
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800">
                    OFFLINE
                  </span>
                ) : p.id === myPlayer?.id && !p.isHost ? (
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

      {/* Start Game Action & Host Controls */}
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
                ⚠️ Need at least {MIN_PLAYERS_TO_START} connected players to start ({connectedPlayers.length}/{MIN_PLAYERS_TO_START})
              </p>
            )}
            {enoughPlayers && !allReady && (
              <p className="text-xs font-mono text-amber-400">
                ⚠️ Waiting for all connected players to click READY
              </p>
            )}
            {canStart && (
              <p className="text-xs font-mono text-emerald-400">
                ✓ All players ready! Click to begin Round 1
              </p>
            )}

            {onCloseRoom && (
              <button
                onClick={onCloseRoom}
                className="mt-3 text-xs font-mono text-slate-500 hover:text-rose-400 flex items-center gap-1 mx-auto cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Close Room</span>
              </button>
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
