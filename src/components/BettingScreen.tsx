/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: 15-Second Secret Spectator Betting Phase (Mobile-Clean UI)
 */

import React, { useState, useEffect } from 'react';
import type { Player, FighterOdds, SecretBet } from '../engine/types.ts';
import { sound } from '../engine/audio.ts';
import { calculatePotentialReturn } from '../engine/odds.ts';
import { Clock, CheckCircle, Flame } from 'lucide-react';

interface Props {
  fighterA: Player;
  fighterB: Player;
  odds: Record<string, FighterOdds>;
  currentBets: SecretBet[];
  myPlayer: Player;
  onPlaceBet: (fighterId: string, amount: number) => void;
  bettingTimeRemaining: number;
}

export const BettingScreen: React.FC<Props> = ({
  fighterA,
  fighterB,
  odds,
  currentBets,
  myPlayer,
  onPlaceBet,
  bettingTimeRemaining,
}) => {
  const [selectedFighterId, setSelectedFighterId] = useState<string>(fighterA.id);
  const [betAmount, setBetAmount] = useState<number>(100);

  const isFighter = myPlayer.id === fighterA.id || myPlayer.id === fighterB.id;
  const existingBet = currentBets.find(b => b.bettorId === myPlayer.id);

  const oddsA = odds[fighterA.id] || { decimalOdds: 2.0, smoothedWinRate: 0.5 };
  const oddsB = odds[fighterB.id] || { decimalOdds: 2.0, smoothedWinRate: 0.5 };

  const currentSelectedOdds = selectedFighterId === fighterA.id ? oddsA.decimalOdds : oddsB.decimalOdds;
  const potentialReturn = calculatePotentialReturn(betAmount, currentSelectedOdds);
  const netProfit = potentialReturn - betAmount;

  const handleConfirmBet = () => {
    if (existingBet || isFighter || myPlayer.coins < betAmount) return;
    sound.playBetPlaced();
    onPlaceBet(selectedFighterId, betAmount);
  };

  const totalPot = currentBets.reduce((sum, b) => sum + b.amount, 0);

  return (
    <div className="w-full max-w-lg mx-auto p-3 sm:p-4 space-y-4">
      {/* Top Header: Countdown & Pot */}
      <div className="bg-slate-900/90 border border-slate-700 rounded-2xl p-3 sm:p-4 shadow-xl flex items-center justify-between">
        <div>
          <div className="text-[11px] font-mono text-slate-400 uppercase">15s SECRET WAGER</div>
          <h2 className="text-lg sm:text-xl font-black font-display text-white">PLACE YOUR BET</h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] font-mono text-slate-400">POOL</div>
            <div className="text-sm font-mono font-bold text-amber-400">
              {totalPot} coins
            </div>
          </div>

          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-xl font-black border-2 transition-all ${
              bettingTimeRemaining <= 5
                ? 'bg-rose-950/90 border-rose-500 text-rose-300 animate-pulse glow-crimson'
                : 'bg-cyan-950/80 border-cyan-500 text-cyan-300 glow-cyan'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>00:{bettingTimeRemaining < 10 ? `0${bettingTimeRemaining}` : bettingTimeRemaining}</span>
          </div>
        </div>
      </div>

      {/* Simplified Mobile-Friendly Fighter Cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Fighter A */}
        <button
          type="button"
          disabled={isFighter || !!existingBet}
          onClick={() => setSelectedFighterId(fighterA.id)}
          className={`p-3.5 rounded-2xl border-2 transition-all text-left relative cursor-pointer ${
            selectedFighterId === fighterA.id && !isFighter
              ? 'bg-cyan-950/70 border-cyan-400 shadow-md glow-cyan'
              : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          {selectedFighterId === fighterA.id && !isFighter && (
            <div className="absolute top-2.5 right-2.5 text-cyan-400">
              <CheckCircle className="w-4 h-4 fill-cyan-400/20" />
            </div>
          )}
          <div className="text-3xl mb-1">{fighterA.avatar}</div>
          <div className="font-bold text-sm text-white truncate">{fighterA.name}</div>
          <div className="text-[11px] font-mono text-slate-400">
            {fighterA.matchesWon}W · {fighterA.matchesPlayed - fighterA.matchesWon}L
          </div>
          <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between items-baseline">
            <span className="text-[10px] font-mono text-slate-400">PAYOUT:</span>
            <span className="text-xl font-mono font-black text-cyan-400">{oddsA.decimalOdds.toFixed(2)}x</span>
          </div>
        </button>

        {/* Fighter B */}
        <button
          type="button"
          disabled={isFighter || !!existingBet}
          onClick={() => setSelectedFighterId(fighterB.id)}
          className={`p-3.5 rounded-2xl border-2 transition-all text-left relative cursor-pointer ${
            selectedFighterId === fighterB.id && !isFighter
              ? 'bg-rose-950/70 border-rose-500 shadow-md glow-crimson'
              : 'bg-slate-900/80 border-slate-800'
          }`}
        >
          {selectedFighterId === fighterB.id && !isFighter && (
            <div className="absolute top-2.5 right-2.5 text-rose-400">
              <CheckCircle className="w-4 h-4 fill-rose-400/20" />
            </div>
          )}
          <div className="text-3xl mb-1">{fighterB.avatar}</div>
          <div className="font-bold text-sm text-white truncate">{fighterB.name}</div>
          <div className="text-[11px] font-mono text-slate-400">
            {fighterB.matchesWon}W · {fighterB.matchesPlayed - fighterB.matchesWon}L
          </div>
          <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between items-baseline">
            <span className="text-[10px] font-mono text-slate-400">PAYOUT:</span>
            <span className="text-xl font-mono font-black text-rose-400">{oddsB.decimalOdds.toFixed(2)}x</span>
          </div>
        </button>
      </div>

      {/* Spectator Betting Controls */}
      {!isFighter ? (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
          {/* Honest Financial Summary */}
          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex justify-between items-center text-xs font-mono">
            <div>
              <span className="text-slate-400">Bank: </span>
              <span className="text-amber-400 font-bold">{myPlayer.coins}c</span>
            </div>
            <div>
              <span className="text-slate-400">Return: </span>
              <span className="text-white font-bold">{potentialReturn}c</span>
            </div>
            <div>
              <span className="text-slate-400">Net: </span>
              <span className="text-emerald-400 font-bold">+{netProfit}c</span>
            </div>
          </div>

          {/* Quick Chip Buttons */}
          <div className="flex gap-1.5">
            {[50, 100, 200, 500].map(amt => (
              <button
                key={amt}
                type="button"
                disabled={!!existingBet || myPlayer.coins < amt}
                onClick={() => {
                  setBetAmount(amt);
                  sound.playTap(true);
                }}
                className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                  betAmount === amt
                    ? 'bg-amber-500 text-slate-950 font-black glow-gold'
                    : 'bg-slate-950 border border-slate-700 text-slate-300 hover:border-slate-500'
                }`}
              >
                {amt}
              </button>
            ))}
            <button
              type="button"
              disabled={!!existingBet || myPlayer.coins <= 0}
              onClick={() => {
                setBetAmount(myPlayer.coins);
                sound.playTap(true);
              }}
              className="px-3 py-2 rounded-xl text-xs font-mono font-black bg-rose-950 border border-rose-600 text-rose-300 hover:bg-rose-900 cursor-pointer"
            >
              ALL IN
            </button>
          </div>

          {/* Confirm Bet Button */}
          <button
            type="button"
            onClick={handleConfirmBet}
            disabled={!!existingBet || myPlayer.coins < betAmount}
            className={`w-full py-3.5 rounded-xl font-display font-black text-base uppercase tracking-wider transition-all transform active:scale-95 shadow-xl flex items-center justify-center gap-2 ${
              existingBet
                ? 'bg-emerald-950 text-emerald-400 border border-emerald-600 cursor-default'
                : 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 glow-gold cursor-pointer'
            }`}
          >
            {existingBet ? (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>WAGER LOCKED: {existingBet.amount}c on {existingBet.fighterId === fighterA.id ? fighterA.name : fighterB.name}</span>
              </>
            ) : (
              <>
                <Flame className="w-4 h-4" />
                <span>BET {betAmount}c ON {selectedFighterId === fighterA.id ? fighterA.name : fighterB.name}</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-slate-900 border border-amber-500/40 text-center space-y-1">
          <div className="text-2xl">🥊</div>
          <h3 className="text-base font-black font-display text-amber-300">
            YOU ARE IN THIS BRAWL!
          </h3>
          <p className="text-slate-400 text-xs">
            Fighters cannot bet on their own match. Prep your thumbs!
          </p>
        </div>
      )}
    </div>
  );
};
