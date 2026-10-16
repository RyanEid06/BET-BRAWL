/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Final Kahoot-Style Podium & Real Session Awards
 */

import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import type { Player, Award } from '../engine/types.ts';
import { sound } from '../engine/audio.ts';
import { RotateCcw, Sparkles } from 'lucide-react';

interface Props {
  players: Player[];
  awards: Award[];
  isHost: boolean;
  onPlayAgain: () => void;
}

export const PodiumScreen: React.FC<Props> = ({ players, awards, isHost, onPlayAgain }) => {
  const ranked = [...players].sort((a, b) => b.coins - a.coins);
  const first = ranked[0];
  const second = ranked[1];
  const third = ranked[2];

  useEffect(() => {
    sound.playFanfare();

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
    <div className="w-full max-w-xl mx-auto p-4 space-y-6 text-center">
      {/* Header */}
      <div className="space-y-1">
        <span className="px-3.5 py-1 rounded-full bg-amber-950 text-amber-300 border border-amber-600/60 font-mono text-xs font-bold uppercase">
          ★ MATCH COMPLETE ★
        </span>
        <h1 className="text-3xl sm:text-4xl font-black font-display text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-500">
          CHAMPIONSHIP PODIUM
        </h1>
      </div>

      {/* 3-Tier Pedestal */}
      <div className="flex items-end justify-center gap-2 sm:gap-4 pt-4 pb-2">
        {/* 2nd Place (Silver) */}
        {second && (
          <div className="flex-1 flex flex-col items-center">
            <div className="text-3xl mb-1">{second.avatar}</div>
            <div className="text-xs font-bold text-slate-200 truncate max-w-[85px]">
              {second.name}
            </div>
            <div className="text-[11px] font-mono text-amber-400 font-bold mb-1.5">
              {second.coins.toLocaleString()}c
            </div>
            <div className="w-full h-24 rounded-t-2xl bg-gradient-to-t from-slate-800 to-slate-600 border-t-4 border-slate-300 shadow-xl flex flex-col items-center justify-start pt-2 text-slate-200 font-display font-black text-2xl">
              2nd
              <span className="text-[9px] font-mono text-slate-300">SILVER</span>
            </div>
          </div>
        )}

        {/* 1st Place (Gold) */}
        {first && (
          <div className="flex-1 flex flex-col items-center">
            <div className="text-4xl mb-1 animate-pulse glow-gold">{first.avatar}</div>
            <div className="text-sm font-black text-amber-300 truncate max-w-[95px]">
              {first.name}
            </div>
            <div className="text-xs font-mono text-amber-400 font-black mb-1.5">
              {first.coins.toLocaleString()}c
            </div>
            <div className="w-full h-36 rounded-t-2xl bg-gradient-to-t from-amber-900 to-amber-500 border-t-4 border-amber-200 shadow-2xl flex flex-col items-center justify-start pt-2 text-slate-950 font-display font-black text-3xl glow-gold">
              1st
              <span className="text-[9px] font-mono font-bold text-amber-950">CHAMPION</span>
            </div>
          </div>
        )}

        {/* 3rd Place (Bronze) */}
        {third && (
          <div className="flex-1 flex flex-col items-center">
            <div className="text-3xl mb-1">{third.avatar}</div>
            <div className="text-xs font-bold text-amber-600 truncate max-w-[85px]">
              {third.name}
            </div>
            <div className="text-[11px] font-mono text-amber-400 font-bold mb-1.5">
              {third.coins.toLocaleString()}c
            </div>
            <div className="w-full h-20 rounded-t-2xl bg-gradient-to-t from-amber-950 to-amber-800 border-t-4 border-amber-700 shadow-xl flex flex-col items-center justify-start pt-2 text-amber-300 font-display font-black text-xl">
              3rd
              <span className="text-[9px] font-mono text-amber-400">BRONZE</span>
            </div>
          </div>
        )}
      </div>

      {/* Genuine Superlative Awards */}
      {awards.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-wider flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>SESSION PARTY AWARDS</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
            {awards.map(award => (
              <div
                key={award.id}
                className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md flex items-start gap-2.5"
              >
                <div className="text-2xl p-1.5 bg-slate-950 rounded-xl border border-slate-800">
                  {award.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold font-mono text-amber-400">{award.title}</div>
                  <div className="text-sm font-black text-white truncate">{award.recipientName}</div>
                  <div className="text-[10px] text-slate-400">{award.description}</div>
                  <div className="text-[10px] font-mono text-cyan-400 font-bold mt-0.5">{award.metric}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Complete Room Rankings Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl text-left space-y-2">
        <div className="text-xs font-mono text-slate-400 uppercase border-b border-slate-800 pb-1.5">
          FINAL BANKROLL STANDINGS
        </div>
        <div className="space-y-1.5">
          {ranked.map((p, idx) => (
            <div
              key={p.id}
              className="flex items-center justify-between p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono"
            >
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-500 w-4">{idx + 1}.</span>
                <span>{p.avatar}</span>
                <span className="font-bold text-white font-sans">{p.name}</span>
                {idx === 0 && <span>👑</span>}
              </div>
              <div className="text-right">
                <span className="font-bold text-amber-400">{p.coins.toLocaleString()}c</span>
                <span className="text-slate-500 ml-2">({p.matchesWon}W - {p.matchesPlayed - p.matchesWon}L)</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rematch CTA */}
      <div className="pt-1">
        {isHost ? (
          <button
            onClick={() => {
              sound.playFanfare();
              onPlayAgain();
            }}
            className="w-full py-4 rounded-xl font-display font-black text-lg uppercase tracking-wider bg-gradient-to-r from-cyan-500 via-amber-500 to-rose-500 hover:from-cyan-400 hover:to-rose-400 text-slate-950 shadow-xl transition-all transform active:scale-95 glow-gold border border-amber-300 inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-5 h-5" />
            START NEW SESSION REMATCH
          </button>
        ) : (
          <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-center text-xs font-mono text-slate-400">
            Waiting for the host to start a rematch...
          </div>
        )}
      </div>
    </div>
  );
};
