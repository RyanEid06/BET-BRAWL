/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: Payout & Round Recap Screen (Player-Focused)
 */

import React from 'react';
import type { PublicPlayer, RoundState } from '../engine/types.ts';
import { ArrowRight, Trophy, Coins } from 'lucide-react';

interface Props {
  round: RoundState;
  players: PublicPlayer[];
  myPlayer: PublicPlayer | null;
  isHost: boolean;
  onNextRound: () => void;
  isFinalRound: boolean;
}

export const PayoutRecapModal: React.FC<Props> = ({
  round,
  players,
  myPlayer,
  isHost,
  onNextRound,
  isFinalRound,
}) => {
  const winner = players.find(p => p.id === round.winnerId);
  // Sort tournament leaderboard by Brawl Points DESC, then bankroll DESC
  const sortedLeaderboard = [...players].sort((a, b) => {
    if (b.qualifierPoints !== a.qualifierPoints) {
      return b.qualifierPoints - a.qualifierPoints;
    }
    return b.coins - a.coins;
  });

  // Find current player's personal outcome for this round
  const myPayout = myPlayer ? round.payouts.find(p => p.playerId === myPlayer.id) : null;
  const isFighter = myPlayer && (myPlayer.id === round.fighterIds[0] || myPlayer.id === round.fighterIds[1]);
  const isLastQualifier = round.roundNumber === round.maxRounds - 1;

  return (
    <div className="w-full max-w-lg mx-auto p-3 sm:p-4 space-y-4">
      {/* 1. Winner Hero Splash */}
      <div className="bg-gradient-to-r from-amber-950/90 via-slate-900 to-amber-950/90 border-2 border-amber-400/80 rounded-2xl p-4 shadow-xl text-center space-y-2 glow-gold">
        <span className="px-3 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-600/60 font-mono text-[11px] font-bold uppercase">
          {round.isChampionship ? '👑 CHAMPIONSHIP FINAL RESULT' : `QUALIFIER ROUND ${round.roundNumber} RESULT`}
        </span>

        {round.tieResult ? (
          <div className="py-2">
            <h2 className="text-2xl font-black font-display text-amber-300">IT'S A DRAW!</h2>
            <p className="text-xs font-mono text-slate-300">Match pot split &amp; spectator wagers refunded</p>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3 py-1">
            <span className="text-5xl p-2 bg-slate-950 rounded-2xl border border-amber-400">
              {winner?.avatar || '👑'}
            </span>
            <div className="text-left">
              <div className="text-[11px] font-mono text-amber-400 font-bold uppercase">
                {round.isChampionship ? 'TOURNAMENT CHAMPION' : 'BRAWL VICTOR (+3 PTS)'}
              </div>
              <h2 className="text-2xl font-black font-display text-white">{winner?.name}</h2>
              <div className="text-xs font-mono text-emerald-400 font-bold flex items-center gap-1">
                <Coins className="w-3.5 h-3.5" /> +{round.matchPot}c Victory Bounty
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Qualifiers Concluded Alert Banner if entering Championship */}
      {isLastQualifier && (
        <div className="p-3 bg-gradient-to-r from-amber-950/90 to-yellow-950/90 border border-amber-500/80 rounded-2xl text-center space-y-1 shadow-lg glow-gold">
          <div className="text-xs font-black font-mono text-amber-300 uppercase tracking-wider">
            ★ QUALIFIERS CONCLUDED! ★
          </div>
          <p className="text-xs text-white font-display">
            Top 2 Seeds <span className="font-black text-amber-300">{sortedLeaderboard[0]?.name}</span> &amp; <span className="font-black text-amber-300">{sortedLeaderboard[1]?.name}</span> advance to the Championship Final!
          </p>
        </div>
      )}

      {/* 2. Prominent Personal Wager / Match Outcome */}
      {myPlayer && (
        <div className="bg-slate-900/90 border border-slate-700 rounded-2xl p-3.5 shadow-lg text-center">
          <div className="text-[11px] font-mono text-slate-400 uppercase mb-1">YOUR ROUND OUTCOME</div>
          {isFighter ? (
            round.winnerId === myPlayer.id ? (
              <div className="text-emerald-400 font-black text-xl font-display">
                VICTORY! You earned {round.isChampionship ? 'the Championship Title and ' : '+3 Brawl Points and '} +{round.matchPot}c pot!
              </div>
            ) : round.tieResult ? (
              <div className="text-amber-400 font-bold text-base font-display">
                TIE! You earned +1 Brawl Point and a +{Math.floor(round.matchPot / 2)}c split bounty.
              </div>
            ) : (
              <div className="text-rose-400 font-bold text-base font-display">
                DEFEAT! (0 Brawl Points) Better luck in the next match.
              </div>
            )
          ) : myPayout ? (
            myPayout.type === 'BET_WIN' ? (
              <div className="space-y-0.5">
                <div className="text-emerald-400 font-black text-xl font-display">
                  +{myPayout.netChange} COINS PROFIT!
                </div>
                <div className="text-xs font-mono text-slate-300">
                  {myPayout.totalReturn} coins returned on {myPayout.stake}c wager
                </div>
              </div>
            ) : myPayout.type === 'BET_REFUND' ? (
              <div className="space-y-0.5">
                <div className="text-cyan-300 font-black text-xl font-display">
                  {myPayout.totalReturn} COINS REFUNDED · 0 NET
                </div>
                <div className="text-xs font-mono text-slate-300">
                  Brawl ended in a tie — your full stake was returned.
                </div>
              </div>
            ) : (
              <div className="space-y-0.5">
                <div className="text-rose-400 font-black text-xl font-display">
                  -{Math.abs(myPayout.netChange)} COINS LOSS
                </div>
                <div className="text-xs font-mono text-slate-400">
                  Better read the arena next round!
                </div>
              </div>
            )
          ) : (
            <div className="text-xs font-mono text-slate-400">
              You sat out the wagers this round.
            </div>
          )}

          <div className="mt-2 pt-2 border-t border-slate-800 text-xs font-mono flex items-center justify-between px-2">
            <span>Brawl Points: <strong className="text-cyan-400">{myPlayer.qualifierPoints} pts</strong></span>
            <span>Bankroll: <strong className="text-amber-400">{myPlayer.coins.toLocaleString()}c</strong></span>
          </div>
        </div>
      )}

      {/* 3. Tournament Standings */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 shadow-lg space-y-2">
        <div className="flex items-center justify-between text-xs font-mono text-slate-400 border-b border-slate-800 pb-1.5">
          <span className="flex items-center gap-1.5 text-amber-400 font-bold">
            <Trophy className="w-3.5 h-3.5" /> TOURNAMENT STANDINGS (BRAWL PTS)
          </span>
          <span>Round {round.roundNumber} / {round.maxRounds}</span>
        </div>

        <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
          {sortedLeaderboard.map((p, rank) => (
            <div
              key={p.id}
              className={`p-2 rounded-xl flex items-center justify-between text-xs font-mono ${
                p.id === myPlayer?.id
                  ? 'bg-cyan-950/40 border border-cyan-500/40'
                  : 'bg-slate-950/70 border border-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-500 w-4">{rank + 1}.</span>
                <span>{p.avatar}</span>
                <span className="font-bold text-white font-sans">{p.name}</span>
                {rank < 2 && (
                  <span className="text-[9px] font-mono px-1 py-0.2 bg-emerald-950 text-emerald-400 border border-emerald-700/60 rounded font-bold">
                    TOP 2
                  </span>
                )}
                {p.id === myPlayer?.id && <span className="text-[10px] text-cyan-400 font-mono">(YOU)</span>}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-cyan-300">
                  {p.qualifierPoints} pts <span className="text-slate-500 font-normal">({p.qualifierWins}W-{p.qualifierLosses}L)</span>
                </span>
                <span className="font-mono text-amber-400 font-bold">
                  {p.coins.toLocaleString()}c
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Next Round Action */}
      <div className="pt-1">
        {isHost ? (
          <button
            onClick={onNextRound}
            className="w-full py-4 rounded-xl font-display font-black text-lg uppercase tracking-wider bg-gradient-to-r from-cyan-500 via-amber-500 to-rose-500 hover:from-cyan-400 hover:to-rose-400 text-slate-950 shadow-xl transition-all transform active:scale-95 glow-gold border border-amber-300 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{isFinalRound ? 'REVEAL FINAL PODIUM 🏆' : `PROCEED TO ROUND ${round.roundNumber + 1}`}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-center text-xs font-mono text-slate-400">
            Waiting for the host to advance to the next round...
          </div>
        )}
      </div>
    </div>
  );
};
