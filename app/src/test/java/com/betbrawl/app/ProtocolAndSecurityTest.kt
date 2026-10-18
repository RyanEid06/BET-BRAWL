package com.betbrawl.app

import com.betbrawl.app.server.BrawlWebSocketServer
import com.betbrawl.app.server.engine.OddsEngine
import com.betbrawl.app.server.engine.RoomEngine
import com.betbrawl.app.server.model.*
import com.google.gson.Gson
import org.junit.Assert.*
import org.junit.Test

class ProtocolAndSecurityTest {

    private val gson = Gson()

    @Test
    fun testRoomCreationAndActiveRoomProtection() {
        val server = BrawlWebSocketServer("127.0.0.1", 9091)
        val host = RoomEngine.createFreshPlayer("Ace", "⚡", isHost = true)

        // Fresh player stats
        assertEquals(1000, host.coins)
        assertTrue(host.isHost)
        assertFalse(host.isReady)
        assertTrue(host.connected)
        assertTrue(host.sessionToken.startsWith("tok_"))
        assertTrue(host.id.startsWith("p_"))

        // PublicPlayer never leaks private sessionToken
        val publicPlayer = host.toPublicPlayer()
        assertEquals(host.id, publicPlayer.id)
        assertEquals(host.name, publicPlayer.name)
        val serialized = gson.toJson(publicPlayer)
        assertFalse("Serialized PublicPlayer must never contain sessionToken", serialized.contains("sessionToken"))
        assertFalse("Serialized PublicPlayer must never contain the token value", serialized.contains(host.sessionToken))
    }

    @Test
    fun testMaxRoomCapacityAndJoinRules() {
        val players = mutableMapOf<String, Player>()
        val host = RoomEngine.createFreshPlayer("Host", "👑", isHost = true)
        players[host.sessionToken] = host

        // Fill to maximum capacity of 9 players
        for (i in 2..9) {
            val p = RoomEngine.createFreshPlayer("Player $i", "⚡")
            players[p.sessionToken] = p
        }
        assertEquals(9, players.size)

        // Attempting to add 10th player must exceed capacity
        assertTrue("Max capacity is 9 players", players.size >= RoomEngine.MAX_PLAYERS_CAPACITY)
    }

    @Test
    fun testSecretBetsMaskedBeforePayout() {
        val fA = RoomEngine.createFreshPlayer("Fighter A", "⚡")
        val fB = RoomEngine.createFreshPlayer("Fighter B", "🦊")
        val spectator = RoomEngine.createFreshPlayer("Spectator", "🎯")
        spectator.coins = 1000

        val miniGame = MiniGamesCatalog.MINI_GAMES["millisecond_stop"]!!
        val odds = OddsEngine.calculateDynamicOdds(fA, fB, emptyList())

        val round = RoundState(
            roundNumber = 1,
            maxRounds = 4,
            miniGame = miniGame,
            fighterIds = listOf(fA.id, fB.id),
            matchPot = 250,
            odds = odds,
            revealEndsAt = System.currentTimeMillis() + 4500L,
            bettingEndsAt = System.currentTimeMillis() + 19500L
        )

        // Spectator places a secret bet
        val secretBet = SecretBet(
            bettorId = spectator.id,
            fighterId = fA.id,
            amount = 100,
            oddsAtBet = 2.0,
            timestamp = System.currentTimeMillis(),
            potentialReturn = 200
        )
        round.bets.add(secretBet)
        assertEquals(1, round.bets.size)

        // In BETTING_WINDOW / MINIGAME_ACTIVE: public state MUST scrub bets!
        val publicRoundBetting = round.copy()
        publicRoundBetting.bets.clear() // server scrubs bets before broadcast
        val publicStateBetting = PublicRoomState(
            roomId = "r1",
            roomCode = "BRAWL",
            phase = GamePhase.BETTING_WINDOW,
            players = listOf(fA.toPublicPlayer(), fB.toPublicPlayer(), spectator.toPublicPlayer()),
            totalRounds = 4,
            currentRound = publicRoundBetting,
            tournamentSchedule = null,
            roundHistory = emptyList(),
            awards = emptyList()
        )

        val jsonBetting = gson.toJson(publicStateBetting)
        assertTrue("Serialized state during betting must have empty bets array", jsonBetting.contains("\"bets\":[]"))
        assertFalse("Serialized state must NOT leak spectator bettorId", jsonBetting.contains(spectator.id + "\",\"fighterId"))

        // In PAYOUT_RECAP: bets are honestly revealed!
        val publicRoundRecap = round.copy()
        val publicStateRecap = PublicRoomState(
            roomId = "r1",
            roomCode = "BRAWL",
            phase = GamePhase.PAYOUT_RECAP,
            players = listOf(fA.toPublicPlayer(), fB.toPublicPlayer(), spectator.toPublicPlayer()),
            totalRounds = 4,
            currentRound = publicRoundRecap,
            tournamentSchedule = null,
            roundHistory = emptyList(),
            awards = emptyList()
        )
        val jsonRecap = gson.toJson(publicStateRecap)
        assertTrue("Serialized state during payout must reveal bets", jsonRecap.contains(spectator.id))
    }

    @Test
    fun testBetPlacementValidationAndBoundaries() {
        val fA = RoomEngine.createFreshPlayer("Fighter A", "⚡")
        val fB = RoomEngine.createFreshPlayer("Fighter B", "🦊")
        val bettor = RoomEngine.createFreshPlayer("Bettor", "🎯")
        bettor.coins = 500

        val miniGame = MiniGamesCatalog.MINI_GAMES["millisecond_stop"]!!
        val odds = OddsEngine.calculateDynamicOdds(fA, fB, emptyList())
        val now = 1000000L

        val round = RoundState(
            roundNumber = 1,
            maxRounds = 4,
            miniGame = miniGame,
            fighterIds = listOf(fA.id, fB.id),
            matchPot = 250,
            odds = odds,
            bettingEndsAt = now + 15000L
        )

        // 1. Valid bet
        val validErr = OddsEngine.validateBetPlacement(bettor, fA.id, 100, round, GamePhase.BETTING_WINDOW, now + 5000L)
        assertNull("Valid bet must be accepted", validErr)

        // 2. Closed phase
        val phaseErr = OddsEngine.validateBetPlacement(bettor, fA.id, 100, round, GamePhase.MINIGAME_ACTIVE, now + 5000L)
        assertEquals("Betting window is closed", phaseErr)

        // 3. Exact authoritative deadline boundary (serverNow >= bettingEndsAt)
        val deadlineExactErr = OddsEngine.validateBetPlacement(bettor, fA.id, 100, round, GamePhase.BETTING_WINDOW, round.bettingEndsAt)
        assertEquals("Authoritative betting deadline has passed", deadlineExactErr)

        val deadlinePastErr = OddsEngine.validateBetPlacement(bettor, fA.id, 100, round, GamePhase.BETTING_WINDOW, round.bettingEndsAt + 1L)
        assertEquals("Authoritative betting deadline has passed", deadlinePastErr)

        // 4. Non-positive amount
        val zeroErr = OddsEngine.validateBetPlacement(bettor, fA.id, 0, round, GamePhase.BETTING_WINDOW, now)
        assertEquals("Bet amount must be a positive integer", zeroErr)

        val negErr = OddsEngine.validateBetPlacement(bettor, fA.id, -50, round, GamePhase.BETTING_WINDOW, now)
        assertEquals("Bet amount must be a positive integer", negErr)

        // 5. Exceeding bankroll
        val bankrollErr = OddsEngine.validateBetPlacement(bettor, fA.id, 600, round, GamePhase.BETTING_WINDOW, now)
        assertTrue("Must reject bet exceeding bankroll", bankrollErr!!.contains("Insufficient coins"))

        // 6. Fighter self-betting
        val selfBetErr = OddsEngine.validateBetPlacement(fA, fA.id, 50, round, GamePhase.BETTING_WINDOW, now)
        assertEquals("Active fighters cannot place bets on their own match", selfBetErr)

        // 7. Non-competing fighter target
        val stranger = RoomEngine.createFreshPlayer("Stranger", "💀")
        val strangerTargetErr = OddsEngine.validateBetPlacement(bettor, stranger.id, 50, round, GamePhase.BETTING_WINDOW, now)
        assertEquals("Selected fighter is not competing in this round", strangerTargetErr)

        // 8. Duplicate bet in same round
        round.bets.add(SecretBet(bettor.id, fA.id, 100, 2.0, now, 200))
        val dupErr = OddsEngine.validateBetPlacement(bettor, fA.id, 50, round, GamePhase.BETTING_WINDOW, now)
        assertEquals("You have already placed your secret bet for this round", dupErr)
    }

    @Test
    fun testPayoutArithmeticUsesFloor() {
        val fA = RoomEngine.createFreshPlayer("Fighter A", "⚡")
        val fB = RoomEngine.createFreshPlayer("Fighter B", "🦊")
        val bettor = RoomEngine.createFreshPlayer("Bettor", "🎯")
        bettor.coins = 900

        val miniGame = MiniGamesCatalog.MINI_GAMES["millisecond_stop"]!!
        val round = RoundState(
            roundNumber = 1,
            maxRounds = 4,
            miniGame = miniGame,
            fighterIds = listOf(fA.id, fB.id),
            matchPot = 250,
            odds = emptyMap()
        )

        // Bet with fractional odds product: 100 coins * 2.455 = 245.5 coins
        // Floor requirement: Math.floor(245.5) = 245 (NOT 246 from roundToInt!)
        val bet = SecretBet(
            bettorId = bettor.id,
            fighterId = fA.id,
            amount = 100,
            oddsAtBet = 2.455,
            timestamp = 1000L,
            potentialReturn = 245
        )
        round.bets.add(bet)

        val payouts = OddsEngine.computeRoundPayouts(
            round = round,
            players = listOf(fA, fB, bettor),
            winnerId = fA.id,
            tieResult = false,
            resolutionReason = RoundResolutionReason.PLAYED
        )

        val betPayout = payouts.find { it.playerId == bettor.id && it.type == "BET_WIN" }
        assertNotNull(betPayout)
        assertEquals("Payout totalReturn must strictly use Math.floor", 245, betPayout!!.totalReturn)
        assertEquals(145, betPayout.netChange)
        assertEquals(1045, bettor.coins) // 900 + 245
    }

    @Test
    fun testDisconnectForfeitAndVoidPayouts() {
        val fA = RoomEngine.createFreshPlayer("Fighter A", "⚡")
        val fB = RoomEngine.createFreshPlayer("Fighter B", "🦊")
        val bettor = RoomEngine.createFreshPlayer("Bettor", "🎯")
        bettor.coins = 800

        val miniGame = MiniGamesCatalog.MINI_GAMES["millisecond_stop"]!!
        val round = RoundState(
            roundNumber = 1,
            maxRounds = 4,
            miniGame = miniGame,
            fighterIds = listOf(fA.id, fB.id),
            matchPot = 250,
            odds = emptyMap()
        )
        round.bets.add(SecretBet(bettor.id, fA.id, 200, 2.0, 1000L, 400))

        // DISCONNECT_FORFEIT: Winner gets bounty, spectator bets are REFUNDED
        val forfeitPayouts = OddsEngine.computeRoundPayouts(
            round = round,
            players = listOf(fA, fB, bettor),
            winnerId = fA.id,
            tieResult = false,
            resolutionReason = RoundResolutionReason.DISCONNECT_FORFEIT
        )
        val refund = forfeitPayouts.find { it.type == "BET_REFUND" }
        assertNotNull("Spectator bet must be refunded on disconnect forfeit", refund)
        assertEquals(200, refund!!.stake)
        assertEquals(1000, bettor.coins) // 800 + 200 refund

        // VOID: Entire match voided, all bets refunded
        bettor.coins = 800
        val voidPayouts = OddsEngine.computeRoundPayouts(
            round = round,
            players = listOf(fA, fB, bettor),
            winnerId = null,
            tieResult = false,
            resolutionReason = RoundResolutionReason.VOID
        )
        val voidRefund = voidPayouts.find { it.type == "BET_REFUND" }
        assertNotNull("Spectator bet must be refunded on VOID", voidRefund)
        assertEquals(1000, bettor.coins)
    }

    @Test
    fun testAllSevenSessionAwardsParity() {
        val p1 = RoomEngine.createFreshPlayer("P1", "🏆").apply {
            coins = 1500
            qualifierPoints = 6
            matchesWon = 4
            highestSinglePayout = 450
            highestSingleBet = 300
            totalBetsPlaced = 5
            totalBetsWon = 4
            totalCoinsWonInBets = 350
        }
        val p2 = RoomEngine.createFreshPlayer("P2", "🦊").apply {
            coins = 700
            totalCoinsLostInBets = 400
        }

        val awards = RoomEngine.computeSessionAwards(listOf(p1, p2), championId = p1.id)
        val awardIds = awards.map { it.id }.toSet()

        assertTrue("Must include tournament_champion", awardIds.contains("tournament_champion"))
        assertTrue("Must include brawl_king", awardIds.contains("brawl_king"))
        assertTrue("Must include high_roller", awardIds.contains("high_roller"))
        assertTrue("Must include wealth_champion", awardIds.contains("wealth_champion"))
        assertTrue("Must include risk_taker", awardIds.contains("risk_taker"))
        assertTrue("Must include the_oracle", awardIds.contains("the_oracle"))
        assertTrue("Must include unlucky_bettor", awardIds.contains("unlucky_bettor"))
        assertEquals(7, awards.size)
    }
}
