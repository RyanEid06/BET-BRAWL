/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Payout & Round Recap Screen
 */

import React from 'react';
import type { Player, RoundState } from '../engine/types.ts';
import { Trophy, ArrowRight, Coins, TrendingUp } from 'lucide-react';
import { sound } from '../engine/audio.ts';

interface Props {
  round: RoundState;
  players: Player[];
  onNextRound: () => void;
  isFinalRound: boolean;
}

export const PayoutRecapModal: React.FC<Props> = ({
  round,
  players,
  onNextRound,
  isFinalRound,
}) => {
  const winner = players.find(p => p.id === round.winnerId);
  const sortedLeaderboard = [...players].sort((a, b) => b.coins - a.coins);

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {/* Winner Hero Splash */}
      <div className="bg-gradient-to-r from-amber-950/90 via-slate-900 to-amber-950/90 border-2 border-amber-400/80 rounded-3xl p-6 shadow-2xl text-center space-y-3 glow-gold">
        <span className="px-4 py-1 rounded-full bg-amber-950 text-amber-300 border border-amber-600/60 font-mono text-xs font-bold tracking-widest uppercase">
          ROUND {round.roundNumber} COMPLETE
        </span>

        <div className="flex items-center justify-center gap-3">
          <span className="text-6xl p-2 bg-slate-950 rounded-2xl border border-amber-400">
            {winner?.avatar || '👑'}
          </span>
          <div className="text-left">
            <div className="text-xs font-mono text-amber-400 uppercase font-bold">BRAWL VICTOR</div>
            <h2 className="text-3xl font-black font-display text-white">{winner?.name}</h2>
            <div className="text-sm font-mono text-emerald-400 font-bold flex items-center gap-1">
              <Coins className="w-4 h-4" /> Match Pot: +{round.matchPot} coins!
            </div>
          </div>
        </div>
      </div>

      {/* Payouts & Bets Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Spectator Payout Feed */}
        <div className="bg-slate-900/80 border border-slate-700 rounded-3xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 border-b border-slate-800 pb-2">
            <span className="flex items-center gap-1.5 text-cyan-400 font-bold">
              <TrendingUp className="w-4 h-4" /> SPECTATOR WAGERS
            </span>
            <span>{round.bets.length} Bets Placed</span>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {round.payouts.length > 0 ? (
              round.payouts.map((payout, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="text-slate-300 font-medium">{payout.reason}</div>
                  <div
                    className={`font-mono font-bold px-2 py-0.5 rounded ${
                      payout.coinsChange > 0
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-700'
                        : 'bg-rose-950 text-rose-400 border border-rose-800'
                    }`}
                  >
                    {payout.coinsChange > 0 ? `+${payout.coinsChange}c` : '0c'}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-xs font-mono text-slate-500 text-center py-4">
                No spectator wagers placed this round.
              </div>
            )}
          </div>
        </div>

        {/* Live Standings Preview */}
        <div className="bg-slate-900/80 border border-slate-700 rounded-3xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 border-b border-slate-800 pb-2">
            <span className="flex items-center gap-1.5 text-amber-400 font-bold">
              <Trophy className="w-4 h-4" /> LIVE BANKROLL STANDINGS
            </span>
            <span>After Round {round.roundNumber}</span>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {sortedLeaderboard.map((p, rank) => (
              <div
                key={p.id}
                className="p-2.5 bg-slate-950 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-slate-400 w-4">{rank + 1}.</span>
                  <span>{p.avatar}</span>
                  <span className="font-bold text-white">{p.name}</span>
                </div>
                <div className="font-mono font-bold text-amber-400">
                  {p.coins.toLocaleString()}c
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Next Round Action */}
      <div className="flex justify-center pt-2">
        <button
          onClick={() => {
            sound.playCoin();
            onNextRound();
          }}
          className="w-full max-w-md py-4 rounded-2xl font-display font-black text-xl uppercase tracking-wider bg-gradient-to-r from-cyan-500 via-amber-500 to-rose-500 hover:from-cyan-400 hover:to-rose-400 text-slate-950 shadow-2xl transition-all transform active:scale-95 glow-gold border border-amber-300 flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>{isFinalRound ? 'REVEAL FINAL PODIUM 🏆' : `PROCEED TO ROUND ${round.roundNumber + 1}`}</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
