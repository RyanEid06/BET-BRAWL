/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Kahoot-Style 3D Podium & Special Awards Screen
 */

import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import type { Player, Award } from '../engine/types.ts';
import { sound } from '../engine/audio.ts';
import { Trophy, Medal, RotateCcw, Flame, Sparkles } from 'lucide-react';

interface Props {
  players: Player[];
  awards: Award[];
  onPlayAgain: () => void;
}

export const PodiumScreen: React.FC<Props> = ({ players, awards, onPlayAgain }) => {
  const ranked = [...players].sort((a, b) => b.coins - a.coins);
  const first = ranked[0];
  const second = ranked[1];
  const third = ranked[2];

  useEffect(() => {
    sound.playFanfare();

    // Trigger Kahoot-style celebratory confetti shower
    const end = Date.now() + 3.5 * 1000;
    const colors = ['#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6'];

    (function frame() {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors,
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();
  }, []);

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-6 space-y-8 text-center">
      {/* Header */}
      <div className="space-y-1">
        <span className="px-4 py-1.5 rounded-full bg-amber-950 text-amber-300 border border-amber-600/60 font-mono text-xs font-bold tracking-widest uppercase">
          ★ CHAMPIONSHIP PODIUM ★
        </span>
        <h1 className="text-4xl md:text-5xl font-black font-display text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-500 tracking-wider">
          FINAL STANDINGS
        </h1>
      </div>

      {/* 3-Tier Kahoot Pedestal */}
      <div className="flex items-end justify-center gap-3 md:gap-6 pt-6 pb-2 max-w-xl mx-auto">
        {/* 2nd Place Pedestal (Silver) */}
        {second && (
          <div className="flex-1 flex flex-col items-center">
            <div className="text-4xl mb-2 animate-bounce">{second.avatar}</div>
            <div className="text-xs md:text-sm font-bold text-slate-200 truncate max-w-[100px]">
              {second.name}
            </div>
            <div className="text-[11px] font-mono text-amber-400 font-bold mb-2">
              {second.coins.toLocaleString()}c
            </div>
            <div className="w-full h-32 rounded-t-2xl bg-gradient-to-t from-slate-800 to-slate-600 border-t-4 border-slate-300 shadow-xl flex flex-col items-center justify-start pt-3 text-slate-200 font-display font-black text-3xl">
              2nd
              <span className="text-[10px] font-mono text-slate-300 mt-1">SILVER</span>
            </div>
          </div>
        )}

        {/* 1st Place Pedestal (Gold - Tallest) */}
        {first && (
          <div className="flex-1 flex flex-col items-center">
            <div className="text-5xl mb-2 animate-pulse glow-gold">{first.avatar}</div>
            <div className="text-sm md:text-base font-black text-amber-300 truncate max-w-[110px]">
              {first.name}
            </div>
            <div className="text-xs font-mono text-amber-400 font-black mb-2">
              {first.coins.toLocaleString()}c
            </div>
            <div className="w-full h-44 rounded-t-2xl bg-gradient-to-t from-amber-900 to-amber-500 border-t-4 border-amber-200 shadow-2xl flex flex-col items-center justify-start pt-3 text-slate-950 font-display font-black text-4xl glow-gold">
              1st
              <span className="text-[10px] font-mono font-bold text-amber-950 mt-1">★ CHAMPION ★</span>
            </div>
          </div>
        )}

        {/* 3rd Place Pedestal (Bronze) */}
        {third && (
          <div className="flex-1 flex flex-col items-center">
            <div className="text-4xl mb-2 animate-bounce">{third.avatar}</div>
            <div className="text-xs md:text-sm font-bold text-amber-600 truncate max-w-[100px]">
              {third.name}
            </div>
            <div className="text-[11px] font-mono text-amber-400 font-bold mb-2">
              {third.coins.toLocaleString()}c
            </div>
            <div className="w-full h-24 rounded-t-2xl bg-gradient-to-t from-amber-950 to-amber-800 border-t-4 border-amber-700 shadow-xl flex flex-col items-center justify-start pt-3 text-amber-300 font-display font-black text-2xl">
              3rd
              <span className="text-[10px] font-mono text-amber-400 mt-1">BRONZE</span>
            </div>
          </div>
        )}
      </div>

      {/* Special Party Awards */}
      <div className="space-y-3 pt-4">
        <div className="text-xs font-mono text-slate-400 uppercase tracking-wider flex items-center justify-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>SUPERLATIVE PARTY AWARDS</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {awards.map(award => (
            <div
              key={award.id}
              className="p-4 rounded-2xl bg-slate-900/90 border border-slate-700/80 shadow-lg text-left flex items-start gap-3"
            >
              <div className="text-3xl p-2 bg-slate-950 rounded-xl border border-slate-700">
                {award.icon}
              </div>
              <div className="flex-1">
                <div className="text-xs font-bold font-mono text-amber-400">{award.title}</div>
                <div className="text-sm font-black text-white">{award.recipientName}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{award.description}</div>
                <div className="text-[10px] font-mono text-cyan-400 font-bold mt-1">
                  {award.metric}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Full Leaderboard Table */}
      <div className="bg-slate-900/80 border border-slate-700 rounded-3xl p-5 shadow-xl max-w-2xl mx-auto text-left">
        <div className="text-xs font-mono text-slate-400 uppercase border-b border-slate-800 pb-2 mb-3">
          COMPLETE ROOM RANKINGS
        </div>
        <div className="space-y-2">
          {ranked.map((p, idx) => (
            <div
              key={p.id}
              className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono"
            >
              <div className="flex items-center gap-3">
                <span className="font-bold text-slate-400 w-5">{idx + 1}.</span>
                <span className="text-base">{p.avatar}</span>
                <span className="font-bold text-white font-sans">{p.name}</span>
                {idx === 0 && <span className="text-amber-400">👑</span>}
              </div>
              <div className="text-right">
                <span className="font-bold text-amber-400">{p.coins.toLocaleString()} coins</span>
                <span className="text-slate-500 ml-2">({p.matchesWon}W - {p.matchesPlayed - p.matchesWon}L)</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rematch CTA */}
      <div className="pt-2">
        <button
          onClick={() => {
            sound.playFanfare();
            onPlayAgain();
          }}
          className="w-full max-w-md py-4 rounded-2xl font-display font-black text-xl uppercase tracking-wider bg-gradient-to-r from-cyan-500 via-amber-500 to-rose-500 hover:from-cyan-400 hover:to-rose-400 text-slate-950 shadow-2xl transition-all transform active:scale-95 glow-gold border border-amber-300 inline-flex items-center justify-center gap-2 cursor-pointer"
        >
          <RotateCcw className="w-5 h-5" />
          START NEW BRAWL SESSION
        </button>
      </div>
    </div>
  );
};
