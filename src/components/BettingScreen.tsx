/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Bet & BRAWL: 15-Second Secret Spectator Betting Phase
 */

import React, { useState, useEffect } from 'react';
import type { Player, FighterOdds, SecretBet } from '../engine/types.ts';
import { sound } from '../engine/audio.ts';
import { calculatePotentialReturn } from '../engine/odds.ts';
import { Clock, TrendingUp, CheckCircle, Flame, ShieldAlert } from 'lucide-react';

interface Props {
  fighterA: Player;
  fighterB: Player;
  odds: Record<string, FighterOdds>;
  currentBets: SecretBet[];
  clientPlayer: Player;
  onPlaceBet: (fighterId: string, amount: number) => void;
  onTimeExpired: () => void;
}

export const BettingScreen: React.FC<Props> = ({
  fighterA,
  fighterB,
  odds,
  currentBets,
  clientPlayer,
  onPlaceBet,
  onTimeExpired,
}) => {
  const [timeLeft, setTimeLeft] = useState<number>(15);
  const [selectedFighterId, setSelectedFighterId] = useState<string>(fighterA.id);
  const [betAmount, setBetAmount] = useState<number>(100);
  const [hasBet, setHasBet] = useState<boolean>(false);

  const isFighter = clientPlayer.id === fighterA.id || clientPlayer.id === fighterB.id;
  const existingBet = currentBets.find(b => b.bettorId === clientPlayer.id);

  const oddsA = odds[fighterA.id] || { decimalOdds: 2.0, fractionalOdds: '1/1', impliedWinProb: 0.5 };
  const oddsB = odds[fighterB.id] || { decimalOdds: 2.0, fractionalOdds: '1/1', impliedWinProb: 0.5 };

  const currentSelectedOdds = selectedFighterId === fighterA.id ? oddsA.decimalOdds : oddsB.decimalOdds;
  const potentialReturn = calculatePotentialReturn(betAmount, currentSelectedOdds);

  // 15-second countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        const nextVal = Math.max(0, prev - 1);
        if (nextVal <= 4 && nextVal > 0) {
          sound.playCountdown(false);
        }
        return nextVal;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (timeLeft === 0) {
      sound.playCountdown(true);
      onTimeExpired();
    }
  }, [timeLeft, onTimeExpired]);

  const handleConfirmBet = () => {
    if (hasBet || isFighter || clientPlayer.coins < betAmount) return;
    sound.playBetPlaced();
    onPlaceBet(selectedFighterId, betAmount);
    setHasBet(true);
  };

  const totalPot = currentBets.reduce((sum, b) => sum + b.amount, 0);

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {/* Top Countdown & Pot Header */}
      <div className="bg-slate-900/90 border border-slate-700 rounded-3xl p-4 md:p-5 shadow-2xl flex items-center justify-between">
        <div>
          <div className="text-xs font-mono text-slate-400 uppercase tracking-wider">
            15s SECRET BETTING WINDOW
          </div>
          <h2 className="text-xl md:text-2xl font-black font-display text-white mt-0.5">
            PLACE YOUR WAGERS
          </h2>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-[11px] font-mono text-slate-400">SPECTATOR POOL</div>
            <div className="text-lg font-mono font-bold text-amber-400">
              💰 {totalPot.toLocaleString()} coins
            </div>
          </div>

          {/* Huge Ticking Clock */}
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-2xl font-mono text-2xl font-black border-2 transition-all shadow-lg ${
              timeLeft <= 5
                ? 'bg-rose-950/80 border-rose-500 text-rose-300 animate-pulse glow-crimson'
                : 'bg-cyan-950/60 border-cyan-500 text-cyan-300 glow-cyan'
            }`}
          >
            <Clock className="w-6 h-6" />
            <span>00:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}</span>
          </div>
        </div>
      </div>

      {/* Dynamic Odds Showdown Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Fighter A Card */}
        <div
          onClick={() => !isFighter && !hasBet && setSelectedFighterId(fighterA.id)}
          className={`p-5 rounded-3xl border-2 transition-all cursor-pointer relative overflow-hidden ${
            selectedFighterId === fighterA.id && !isFighter
              ? 'bg-gradient-to-br from-cyan-950/90 to-slate-900 border-cyan-400 glow-cyan scale-[1.01]'
              : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
          }`}
        >
          {selectedFighterId === fighterA.id && !isFighter && (
            <div className="absolute top-3 right-3 text-cyan-400">
              <CheckCircle className="w-5 h-5 fill-cyan-400/20" />
            </div>
          )}

          <div className="flex items-center gap-3 mb-3">
            <span className="text-4xl p-2 bg-slate-950 rounded-xl border border-slate-700">
              {fighterA.avatar}
            </span>
            <div>
              <div className="font-display font-black text-xl text-white">{fighterA.name}</div>
              <div className="text-xs font-mono text-slate-400">
                Win Rate: <b className="text-cyan-400">{Math.round((oddsA.smoothedWinRate || 0.5) * 100)}%</b>
              </div>
            </div>
          </div>

          {/* Big Odds Display */}
          <div className="bg-slate-950/90 p-3 rounded-2xl border border-slate-800 flex items-center justify-between font-mono">
            <div>
              <div className="text-[10px] text-slate-400">DYNAMIC PAYOUT</div>
              <div className="text-3xl font-black text-cyan-400 text-glow-cyan">
                {oddsA.decimalOdds.toFixed(2)}x
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-400">FRACTIONAL / PROB</div>
              <div className="text-sm font-bold text-slate-300">
                {oddsA.fractionalOdds} · {Math.round(oddsA.impliedWinProb * 100)}%
              </div>
            </div>
          </div>
        </div>

        {/* Fighter B Card */}
        <div
          onClick={() => !isFighter && !hasBet && setSelectedFighterId(fighterB.id)}
          className={`p-5 rounded-3xl border-2 transition-all cursor-pointer relative overflow-hidden ${
            selectedFighterId === fighterB.id && !isFighter
              ? 'bg-gradient-to-bl from-rose-950/90 to-slate-900 border-rose-500 glow-crimson scale-[1.01]'
              : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
          }`}
        >
          {selectedFighterId === fighterB.id && !isFighter && (
            <div className="absolute top-3 right-3 text-rose-400">
              <CheckCircle className="w-5 h-5 fill-rose-400/20" />
            </div>
          )}

          <div className="flex items-center gap-3 mb-3">
            <span className="text-4xl p-2 bg-slate-950 rounded-2xl border border-slate-700">
              {fighterB.avatar}
            </span>
            <div>
              <div className="font-display font-black text-xl text-white">{fighterB.name}</div>
              <div className="text-xs font-mono text-slate-400">
                Win Rate: <b className="text-rose-400">{Math.round((oddsB.smoothedWinRate || 0.5) * 100)}%</b>
              </div>
            </div>
          </div>

          {/* Big Odds Display */}
          <div className="bg-slate-950/90 p-3 rounded-2xl border border-slate-800 flex items-center justify-between font-mono">
            <div>
              <div className="text-[10px] text-slate-400">DYNAMIC PAYOUT</div>
              <div className="text-3xl font-black text-rose-400 text-glow-crimson">
                {oddsB.decimalOdds.toFixed(2)}x
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-400">FRACTIONAL / PROB</div>
              <div className="text-sm font-bold text-slate-300">
                {oddsB.fractionalOdds} · {Math.round(oddsB.impliedWinProb * 100)}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Secret Betting Controls (for Spectators) */}
      {!isFighter ? (
        <div className="bg-slate-900/90 border border-slate-700 rounded-3xl p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>YOUR BANKROLL: <b className="text-amber-400 text-sm">{clientPlayer.coins} coins</b></span>
            <span>POTENTIAL PAYOUT: <b className="text-emerald-400 text-sm">+{potentialReturn} coins</b></span>
          </div>

          {/* Quick chip buttons */}
          <div className="flex flex-wrap gap-2">
            {[50, 100, 200, 500].map(amt => (
              <button
                key={amt}
                disabled={hasBet || clientPlayer.coins < amt}
                onClick={() => {
                  setBetAmount(amt);
                  sound.playTap(true);
                }}
                className={`flex-1 py-2.5 rounded-xl text-xs font-mono font-bold transition-all ${
                  betAmount === amt
                    ? 'bg-amber-500 text-slate-950 glow-gold'
                    : 'bg-slate-950 border border-slate-700 text-slate-300 hover:border-slate-500'
                }`}
              >
                {amt}c
              </button>
            ))}
            <button
              disabled={hasBet || clientPlayer.coins <= 0}
              onClick={() => {
                setBetAmount(clientPlayer.coins);
                sound.playTap(true);
              }}
              className="py-2.5 px-4 rounded-xl text-xs font-mono font-black bg-rose-950 border border-rose-600 text-rose-300 hover:bg-rose-900"
            >
              ALL IN!
            </button>
          </div>

          {/* Confirm Bet CTA */}
          <button
            onClick={handleConfirmBet}
            disabled={hasBet || clientPlayer.coins < betAmount}
            className={`w-full py-4 rounded-2xl font-display font-black text-xl uppercase tracking-wider transition-all transform active:scale-95 shadow-xl flex items-center justify-center gap-2 ${
              hasBet
                ? 'bg-emerald-950 text-emerald-400 border border-emerald-600 cursor-default'
                : 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 glow-gold cursor-pointer'
            }`}
          >
            {hasBet ? (
              <>
                <CheckCircle className="w-5 h-5" />
                <span>SECRET WAGER LOCKED IN ({betAmount} coins)!</span>
              </>
            ) : (
              <>
                <Flame className="w-5 h-5" />
                <span>LOCK IN SECRET WAGER ({betAmount}c on {selectedFighterId === fighterA.id ? fighterA.name : fighterB.name})</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="p-6 rounded-3xl bg-slate-900 border-2 border-amber-500/50 shadow-2xl text-center space-y-2">
          <div className="text-3xl">🥊</div>
          <h3 className="text-xl font-black font-display text-amber-300">
            YOU ARE IN THIS BRAWL!
          </h3>
          <p className="text-slate-300 text-xs max-w-md mx-auto">
            You cannot bet on your own match. Warm up your reflexes while the spectators wager their bankrolls on you!
          </p>
        </div>
      )}
    </div>
  );
};
