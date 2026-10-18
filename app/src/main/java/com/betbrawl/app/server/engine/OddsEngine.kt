package com.betbrawl.app.server.engine

import com.betbrawl.app.server.model.*
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

object OddsEngine {

    const val DEFAULT_RISK_FACTOR = 1.0
    const val DEFAULT_LAPLACE_ALPHA = 1.0
    const val DEFAULT_LAPLACE_BETA = 2.0
    const val MIN_ODDS = 1.10
    const val MAX_ODDS = 9.50
    const val HOUSE_VIG = 0.05

    fun calculateSmoothedWinRate(
        matchesWon: Int,
        matchesPlayed: Int,
        alpha: Double = DEFAULT_LAPLACE_ALPHA,
        beta: Double = DEFAULT_LAPLACE_BETA
    ): Double {
        val safeWon = max(0, matchesWon).toDouble()
        val safePlayed = max(safeWon.toInt(), matchesPlayed).toDouble()
        return (safeWon + alpha) / (safePlayed + beta)
    }

    fun calculateDynamicOdds(
        fighterA: Player,
        fighterB: Player,
        currentBets: List<SecretBet> = emptyList()
    ): Map<String, FighterOdds> {
        val winRateA = calculateSmoothedWinRate(fighterA.matchesWon, fighterA.matchesPlayed)
        val winRateB = calculateSmoothedWinRate(fighterB.matchesWon, fighterB.matchesPlayed)

        val ratioA = winRateB / winRateA
        val ratioB = winRateA / winRateB

        val baseOddsA = 1.0 + ratioA * DEFAULT_RISK_FACTOR
        val baseOddsB = 1.0 + ratioB * DEFAULT_RISK_FACTOR

        var poolCoinsA = 0
        var poolCoinsB = 0
        var countA = 0
        var countB = 0

        for (bet in currentBets) {
            if (bet.fighterId == fighterA.id) {
                poolCoinsA += bet.amount
                countA++
            } else if (bet.fighterId == fighterB.id) {
                poolCoinsB += bet.amount
                countB++
            }
        }

        val totalPool = poolCoinsA + poolCoinsB
        var finalOddsA = baseOddsA
        var finalOddsB = baseOddsB

        if (totalPool > 0) {
            val virtualSeed = 300.0
            val effectiveTotal = totalPool.toDouble() + virtualSeed * 2.0
            val effectiveA = poolCoinsA.toDouble() + virtualSeed
            val effectiveB = poolCoinsB.toDouble() + virtualSeed

            val poolOddsA = (effectiveTotal / effectiveA) * (1.0 - HOUSE_VIG)
            val poolOddsB = (effectiveTotal / effectiveB) * (1.0 - HOUSE_VIG)

            val poolWeight = min(0.65, totalPool.toDouble() / 1500.0)
            finalOddsA = (1.0 - poolWeight) * baseOddsA + poolWeight * poolOddsA
            finalOddsB = (1.0 - poolWeight) * baseOddsB + poolWeight * poolOddsB
        }

        finalOddsA = max(MIN_ODDS, min(MAX_ODDS, (finalOddsA * 100.0).roundToInt() / 100.0))
        finalOddsB = max(MIN_ODDS, min(MAX_ODDS, (finalOddsB * 100.0).roundToInt() / 100.0))

        return mapOf(
            fighterA.id to FighterOdds(
                fighterId = fighterA.id,
                decimalOdds = finalOddsA,
                smoothedWinRate = (winRateA * 100.0).roundToInt() / 100.0,
                totalPoolCoins = poolCoinsA,
                bettorCount = countA
            ),
            fighterB.id to FighterOdds(
                fighterId = fighterB.id,
                decimalOdds = finalOddsB,
                smoothedWinRate = (winRateB * 100.0).roundToInt() / 100.0,
                totalPoolCoins = poolCoinsB,
                bettorCount = countB
            )
        )
    }

    fun validateBetPlacement(
        bettor: Player?,
        fighterId: String,
        amount: Int,
        round: RoundState?,
        currentPhase: GamePhase,
        serverNowMs: Long = System.currentTimeMillis()
    ): String? {
        if (currentPhase != GamePhase.BETTING_WINDOW) {
            return "Betting window is closed"
        }
        if (round == null) {
            return "No active round"
        }
        if (serverNowMs >= round.bettingEndsAt) {
            return "Authoritative betting deadline has passed"
        }
        if (round.bettingTimeRemaining <= 0) {
            return "Betting timer has expired"
        }
        if (amount <= 0) {
            return "Bet amount must be a positive integer"
        }
        if (bettor == null) {
            return "Player not recognized in room"
        }
        if (bettor.coins < amount) {
            return "Insufficient coins in bankroll (have: ${bettor.coins}, wager: $amount)"
        }
        if (bettor.id in round.fighterIds) {
            return "Active fighters cannot place bets on their own match"
        }
        if (fighterId !in round.fighterIds) {
            return "Selected fighter is not competing in this round"
        }
        if (round.bets.any { it.bettorId == bettor.id }) {
            return "You have already placed your secret bet for this round"
        }
        return null
    }

    fun computeRoundPayouts(
        round: RoundState,
        players: List<Player>,
        winnerId: String?,
        tieResult: Boolean = false,
        resolutionReason: RoundResolutionReason = RoundResolutionReason.PLAYED
    ): List<RoundPayoutItem> {
        val payouts = mutableListOf<RoundPayoutItem>()
        val (f1Id, f2Id) = round.fighterIds.let { Pair(it[0], it[1]) }
        val fighterA = players.find { it.id == f1Id }
        val fighterB = players.find { it.id == f2Id }

        // VOID: Refund all bets, no bounties
        if (resolutionReason == RoundResolutionReason.VOID) {
            for (bet in round.bets) {
                val bettor = players.find { it.id == bet.bettorId } ?: continue
                bettor.coins += bet.amount
                payouts.add(
                    RoundPayoutItem(
                        playerId = bettor.id,
                        playerName = bettor.name,
                        avatar = bettor.avatar,
                        type = "BET_REFUND",
                        stake = bet.amount,
                        totalReturn = bet.amount,
                        netChange = 0,
                        newBankroll = bettor.coins,
                        summary = "${bet.amount} refunded · Match voided"
                    )
                )
            }
            return payouts
        }

        // TIE: Split match pot, refund bets
        if (tieResult || resolutionReason == RoundResolutionReason.TIE || winnerId == null) {
            val halfPot = round.matchPot / 2
            if (fighterA != null) {
                fighterA.coins += halfPot
                payouts.add(
                    RoundPayoutItem(
                        playerId = fighterA.id,
                        playerName = fighterA.name,
                        avatar = fighterA.avatar,
                        type = "FIGHTER_BOUNTY",
                        netChange = halfPot,
                        newBankroll = fighterA.coins,
                        summary = "+$halfPot coins · Tie match split pot"
                    )
                )
            }
            if (fighterB != null) {
                fighterB.coins += halfPot
                payouts.add(
                    RoundPayoutItem(
                        playerId = fighterB.id,
                        playerName = fighterB.name,
                        avatar = fighterB.avatar,
                        type = "FIGHTER_BOUNTY",
                        netChange = halfPot,
                        newBankroll = fighterB.coins,
                        summary = "+$halfPot coins · Tie match split pot"
                    )
                )
            }

            for (bet in round.bets) {
                val bettor = players.find { it.id == bet.bettorId } ?: continue
                bettor.coins += bet.amount
                payouts.add(
                    RoundPayoutItem(
                        playerId = bettor.id,
                        playerName = bettor.name,
                        avatar = bettor.avatar,
                        type = "BET_REFUND",
                        stake = bet.amount,
                        totalReturn = bet.amount,
                        netChange = 0,
                        newBankroll = bettor.coins,
                        summary = "${bet.amount} refunded · Match ended in tie"
                    )
                )
            }
            return payouts
        }

        // DISCONNECT_FORFEIT: Winner gets bounty, bets refunded
        if (resolutionReason == RoundResolutionReason.DISCONNECT_FORFEIT) {
            val winner = players.find { it.id == winnerId }
            if (winner != null) {
                winner.coins += round.matchPot
                payouts.add(
                    RoundPayoutItem(
                        playerId = winner.id,
                        playerName = winner.name,
                        avatar = winner.avatar,
                        type = "FIGHTER_BOUNTY",
                        netChange = round.matchPot,
                        newBankroll = winner.coins,
                        summary = "+${round.matchPot} coins · Forfeit match winner bounty"
                    )
                )
            }

            for (bet in round.bets) {
                val bettor = players.find { it.id == bet.bettorId } ?: continue
                bettor.coins += bet.amount
                payouts.add(
                    RoundPayoutItem(
                        playerId = bettor.id,
                        playerName = bettor.name,
                        avatar = bettor.avatar,
                        type = "BET_REFUND",
                        stake = bet.amount,
                        totalReturn = bet.amount,
                        netChange = 0,
                        newBankroll = bettor.coins,
                        summary = "${bet.amount} refunded · Opponent disconnected"
                    )
                )
            }
            return payouts
        }

        // Standard Win
        val winner = players.find { it.id == winnerId }
        if (winner != null) {
            winner.coins += round.matchPot
            payouts.add(
                RoundPayoutItem(
                    playerId = winner.id,
                    playerName = winner.name,
                    avatar = winner.avatar,
                    type = "FIGHTER_BOUNTY",
                    netChange = round.matchPot,
                    newBankroll = winner.coins,
                    summary = "+${round.matchPot} coins · Fighter victory pot"
                )
            )
        }

        for (bet in round.bets) {
            val bettor = players.find { it.id == bet.bettorId } ?: continue
            if (bet.fighterId == winnerId) {
                val totalReturn = kotlin.math.floor(bet.amount * bet.oddsAtBet).toInt()
                val netProfit = totalReturn - bet.amount
                bettor.coins += totalReturn
                bettor.totalBetsWon += 1
                bettor.totalCoinsWonInBets += netProfit
                if (totalReturn > bettor.highestSinglePayout) {
                    bettor.highestSinglePayout = totalReturn
                }

                payouts.add(
                    RoundPayoutItem(
                        playerId = bettor.id,
                        playerName = bettor.name,
                        avatar = bettor.avatar,
                        type = "BET_WIN",
                        stake = bet.amount,
                        totalReturn = totalReturn,
                        netChange = netProfit,
                        newBankroll = bettor.coins,
                        summary = "$totalReturn returned · +$netProfit profit (${bet.oddsAtBet}x)"
                    )
                )
            } else {
                bettor.totalCoinsLostInBets += bet.amount
                payouts.add(
                    RoundPayoutItem(
                        playerId = bettor.id,
                        playerName = bettor.name,
                        avatar = bettor.avatar,
                        type = "BET_LOSS",
                        stake = bet.amount,
                        totalReturn = 0,
                        netChange = -bet.amount,
                        newBankroll = bettor.coins,
                        summary = "-${bet.amount} coins · Bet on runner-up"
                    )
                )
            }
        }

        return payouts
    }
}
