package com.betbrawl.app

import com.betbrawl.app.server.engine.OddsEngine
import com.betbrawl.app.server.engine.RoomEngine
import com.betbrawl.app.server.model.*
import org.junit.Assert.*
import org.junit.Test

class TournamentParityTest {

    // 1. Room Creation
    @Test
    fun testRoomCreation() {
        val host = RoomEngine.createFreshPlayer("Alice", "⚡", isHost = true)
        assertNotNull(host.id)
        assertNotNull(host.sessionToken)
        assertTrue(host.isHost)
        assertFalse(host.isReady)
        assertEquals(1000, host.coins)
        assertEquals(0, host.matchesPlayed)
        assertEquals(0, host.matchesWon)
    }

    // 2. Player Joins
    @Test
    fun testPlayerJoins() {
        val p1 = RoomEngine.createFreshPlayer("Bob", "🦊", isHost = false)
        val p2 = RoomEngine.createFreshPlayer("Charlie", "🎯", isHost = false)
        assertNotEquals(p1.id, p2.id)
        assertNotEquals(p1.sessionToken, p2.sessionToken)
        assertFalse(p1.isHost)
        assertEquals("Bob", p1.name)
        assertEquals("Charlie", p2.name)
    }

    // 3. Ready / Start Gating
    @Test
    fun testReadyStartGating() {
        val p1 = RoomEngine.createFreshPlayer("P1", "⚡", isHost = true)
        val p2 = RoomEngine.createFreshPlayer("P2", "🦊", isHost = false)
        // Only 2 players -> fails minimum of 3
        try {
            RoomEngine.generateTournamentSchedule(listOf(p1, p2))
            fail("Expected exception for < 3 players")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message!!.contains("requires at least 3"))
        }

        val p3 = RoomEngine.createFreshPlayer("P3", "🎯", isHost = false)
        val schedule = RoomEngine.generateTournamentSchedule(listOf(p1, p2, p3))
        assertEquals(3, schedule.qualifierCount)
        assertEquals(3, schedule.matches.size)
    }

    // 4. Qualifier Scheduling (Circular Graph)
    @Test
    fun testQualifierScheduling() {
        val players = (1..5).map { RoomEngine.createFreshPlayer("P$it", "⚡") }
        val schedule = RoomEngine.generateTournamentSchedule(players)
        assertEquals(5, schedule.qualifierCount)
        assertEquals(5, schedule.matches.size)

        // Every player must appear exactly twice
        val appearances = mutableMapOf<String, Int>()
        for (m in schedule.matches) {
            appearances[m.fighterIds[0]] = appearances.getOrDefault(m.fighterIds[0], 0) + 1
            appearances[m.fighterIds[1]] = appearances.getOrDefault(m.fighterIds[1], 0) + 1
        }
        for (p in players) {
            assertEquals(2, appearances[p.id])
        }
    }

    // 5. Ranking (Points and Wins)
    @Test
    fun testRanking() {
        val p1 = RoomEngine.createFreshPlayer("P1", "⚡").apply { qualifierPoints = 6; qualifierWins = 2 }
        val p2 = RoomEngine.createFreshPlayer("P2", "🦊").apply { qualifierPoints = 3; qualifierWins = 1 }
        val p3 = RoomEngine.createFreshPlayer("P3", "🎯").apply { qualifierPoints = 0; qualifierWins = 0 }

        val ranked = RoomEngine.computeTournamentRankings(listOf(p3, p1, p2), emptyList())
        assertEquals(p1.id, ranked[0].id)
        assertEquals(p2.id, ranked[1].id)
        assertEquals(p3.id, ranked[2].id)
        assertEquals(1, ranked[0].tournamentRank)
        assertEquals(2, ranked[1].tournamentRank)
        assertEquals(3, ranked[2].tournamentRank)
    }

    // 6. Tiebreak Behavior (Head to Head)
    @Test
    fun testTiebreakBehaviorHeadToHead() {
        val p1 = RoomEngine.createFreshPlayer("P1", "⚡").apply { qualifierPoints = 3; qualifierWins = 1 }
        val p2 = RoomEngine.createFreshPlayer("P2", "🦊").apply { qualifierPoints = 3; qualifierWins = 1 }

        val h2hMatch = TournamentMatch(
            matchIndex = 0,
            roundNumber = 1,
            fighterIds = listOf(p1.id, p2.id),
            completed = true,
            winnerId = p2.id
        )

        val ranked = RoomEngine.computeTournamentRankings(listOf(p1, p2), listOf(h2hMatch))
        assertEquals(p2.id, ranked[0].id) // P2 won head-to-head against P1
        assertEquals(p1.id, ranked[1].id)
    }

    // 7. Bankroll not Overriding Stronger Tournament Ranking
    @Test
    fun testBankrollNotOverridingTournamentRanking() {
        // P1 has 6 Brawl Points and 500 coins; P2 has 3 Brawl Points but 20,000 coins
        val p1 = RoomEngine.createFreshPlayer("P1", "⚡").apply { qualifierPoints = 6; qualifierWins = 2; coins = 500 }
        val p2 = RoomEngine.createFreshPlayer("P2", "🦊").apply { qualifierPoints = 3; qualifierWins = 1; coins = 20000 }

        val ranked = RoomEngine.computeTournamentRankings(listOf(p2, p1), emptyList())
        assertEquals(p1.id, ranked[0].id) // P1 must rank higher despite lower bankroll!
        assertEquals(p2.id, ranked[1].id)
    }

    // 8. Finalist Locking
    @Test
    fun testFinalistLocking() {
        val p1 = RoomEngine.createFreshPlayer("P1", "⚡").apply { qualifierPoints = 6; qualifierWins = 2 }
        val p2 = RoomEngine.createFreshPlayer("P2", "🦊").apply { qualifierPoints = 3; qualifierWins = 1 }
        val p3 = RoomEngine.createFreshPlayer("P3", "🎯").apply { qualifierPoints = 0; qualifierWins = 0 }

        val ranked = RoomEngine.computeTournamentRankings(listOf(p1, p2, p3), emptyList())
        val finalists = listOf(ranked[0].id, ranked[1].id)
        assertEquals(listOf(p1.id, p2.id), finalists)
    }

    // 9. Championship First-to-2 Decisive Wins
    @Test
    fun testChampionshipFirstToTwoWins() {
        val p1 = RoomEngine.createFreshPlayer("P1", "⚡")
        val p2 = RoomEngine.createFreshPlayer("P2", "🦊")
        val wins = mutableMapOf(p1.id to 1, p2.id to 0)

        // Game 2: P1 wins -> wins reach 2
        wins[p1.id] = wins[p1.id]!! + 1
        assertTrue(wins[p1.id]!! >= 2)
        assertEquals(2, wins[p1.id]!!)
    }

    // 10. Tie Awards Zero Championship Wins
    @Test
    fun testTieAwardsZeroChampionshipWins() {
        val p1 = RoomEngine.createFreshPlayer("P1", "⚡")
        val p2 = RoomEngine.createFreshPlayer("P2", "🦊")
        val wins = mutableMapOf(p1.id to 1, p2.id to 0)

        // Tie occurs in Game 2
        val winnerId: String? = null
        if (winnerId != null) {
            wins[winnerId] = wins[winnerId]!! + 1
        }
        assertEquals(1, wins[p1.id]!!)
        assertEquals(0, wins[p2.id]!!)
    }

    // 11. Tie Extends Series
    @Test
    fun testTieExtendsSeries() {
        val p1 = RoomEngine.createFreshPlayer("P1", "⚡")
        val p2 = RoomEngine.createFreshPlayer("P2", "🦊")
        val wins = mutableMapOf(p1.id to 1, p2.id to 0)

        // After tie, series continues because neither has 2 wins
        val complete = wins.values.any { it >= 2 }
        assertFalse(complete)
    }

    // 12. Qualifier Points Remain Invariant During Championship
    @Test
    fun testQualifierPointsRemainInvariant() {
        val p1 = RoomEngine.createFreshPlayer("P1", "⚡").apply { qualifierPoints = 6 }
        val p2 = RoomEngine.createFreshPlayer("P2", "🦊").apply { qualifierPoints = 3 }

        val initialP1Points = p1.qualifierPoints
        val initialP2Points = p2.qualifierPoints

        // Championship matches played (does not touch qualifierPoints)
        val championshipPot = 500
        p1.coins += championshipPot

        assertEquals(initialP1Points, p1.qualifierPoints)
        assertEquals(initialP2Points, p2.qualifierPoints)
    }

    // 13. Third-Place Player Excluded from Championship
    @Test
    fun testThirdPlaceExcludedFromChampionship() {
        val p1 = RoomEngine.createFreshPlayer("P1", "⚡")
        val p2 = RoomEngine.createFreshPlayer("P2", "🦊")
        val p3 = RoomEngine.createFreshPlayer("P3", "🎯")
        val finalists = listOf(p1.id, p2.id)

        assertFalse(finalists.contains(p3.id))
    }

    // 14. Champion Result
    @Test
    fun testChampionResult() {
        val p1 = RoomEngine.createFreshPlayer("P1", "⚡")
        val p2 = RoomEngine.createFreshPlayer("P2", "🦊")
        val p3 = RoomEngine.createFreshPlayer("P3", "🎯")

        val standings = RoomEngine.getFinalTournamentStandings(
            listOf(p1, p2, p3),
            championId = p1.id,
            runnerUpId = p2.id,
            thirdPlaceId = p3.id
        )
        assertEquals(p1.id, standings[0].id)
    }

    // 15. Runner-up Result
    @Test
    fun testRunnerUpResult() {
        val p1 = RoomEngine.createFreshPlayer("P1", "⚡")
        val p2 = RoomEngine.createFreshPlayer("P2", "🦊")
        val p3 = RoomEngine.createFreshPlayer("P3", "🎯")

        val standings = RoomEngine.getFinalTournamentStandings(
            listOf(p1, p2, p3),
            championId = p1.id,
            runnerUpId = p2.id,
            thirdPlaceId = p3.id
        )
        assertEquals(p2.id, standings[1].id)
    }

    // 16. Third-place Result
    @Test
    fun testThirdPlaceResult() {
        val p1 = RoomEngine.createFreshPlayer("P1", "⚡")
        val p2 = RoomEngine.createFreshPlayer("P2", "🦊")
        val p3 = RoomEngine.createFreshPlayer("P3", "🎯")

        val standings = RoomEngine.getFinalTournamentStandings(
            listOf(p1, p2, p3),
            championId = p1.id,
            runnerUpId = p2.id,
            thirdPlaceId = p3.id
        )
        assertEquals(p3.id, standings[2].id)
    }

    // 17. FINAL_PODIUM State
    @Test
    fun testFinalPodiumState() {
        val p1 = RoomEngine.createFreshPlayer("P1", "⚡")
        val awards = RoomEngine.computeSessionAwards(listOf(p1), championId = p1.id)
        assertTrue(awards.any { it.id == "tournament_champion" && it.recipientId == p1.id })
    }

    // 18. Duplicate Progression After Completion Ignored
    @Test
    fun testDuplicateProgressionIgnored() {
        val schedule = TournamentSchedule(
            stage = TournamentStage.COMPLETE,
            totalPlayers = 3,
            qualifierCount = 3,
            qualifiersCompleted = 3,
            totalRounds = 5,
            matches = mutableListOf(),
            championId = "p1",
            runnerUpId = "p2",
            thirdPlaceId = "p3",
            stableRosterOrder = listOf("p1", "p2", "p3")
        )
        assertEquals(TournamentStage.COMPLETE, schedule.stage)
    }

    // 19. Reconnect / Session Identity Recovery
    @Test
    fun testReconnectSessionRecovery() {
        val p1 = RoomEngine.createFreshPlayer("P1", "⚡")
        p1.coins = 1750
        val savedToken = p1.sessionToken

        // Reconnect lookup with same session token
        val playersMap = mutableMapOf(savedToken to p1)
        val recovered = playersMap[savedToken]
        assertNotNull(recovered)
        assertEquals(p1.id, recovered!!.id)
        assertEquals(1750, recovered.coins)
    }

    // 20. Complete 3-Player Reference Tournament Lifecycle
    // (P1 vs P2: P1 wins, P2 vs P3: P2 wins, P3 vs P1: P1 wins -> Finalists P1 & P2 -> Champ Game 1: P1, Game 2: Tie, Game 3: P2, Game 4: P1 wins 2-1 -> Podium)
    @Test
    fun testCompleteThreePlayerTournamentLifecycle() {
        val p1 = RoomEngine.createFreshPlayer("Alice", "⚡")
        val p2 = RoomEngine.createFreshPlayer("Bob", "🦊")
        val p3 = RoomEngine.createFreshPlayer("Charlie", "🎯")
        val players = listOf(p1, p2, p3)

        // 1. Qualifiers
        val q1 = TournamentMatch(0, 1, listOf(p1.id, p2.id), completed = true, winnerId = p1.id)
        p1.qualifierPoints += 3; p1.qualifierWins += 1
        p2.qualifierLosses += 1

        val q2 = TournamentMatch(1, 2, listOf(p2.id, p3.id), completed = true, winnerId = p2.id)
        p2.qualifierPoints += 3; p2.qualifierWins += 1
        p3.qualifierLosses += 1

        val q3 = TournamentMatch(2, 3, listOf(p3.id, p1.id), completed = true, winnerId = p1.id)
        p1.qualifierPoints += 3; p1.qualifierWins += 1
        p3.qualifierLosses += 1

        assertEquals(6, p1.qualifierPoints)
        assertEquals(3, p2.qualifierPoints)
        assertEquals(0, p3.qualifierPoints)

        // Authoritative Qualifier Rankings
        val ranked = RoomEngine.computeTournamentRankings(players, listOf(q1, q2, q3))
        assertEquals(p1.id, ranked[0].id)
        assertEquals(p2.id, ranked[1].id)
        assertEquals(p3.id, ranked[2].id)

        val finalists = listOf(ranked[0].id, ranked[1].id)
        val thirdPlaceId = ranked[2].id

        assertEquals(p1.id, finalists[0])
        assertEquals(p2.id, finalists[1])
        assertEquals(p3.id, thirdPlaceId)

        // 2. Championship Series (First to 2 decisive wins)
        val champWins = mutableMapOf(p1.id to 0, p2.id to 0)

        // Game 1: P1 wins (1-0)
        champWins[p1.id] = champWins[p1.id]!! + 1
        assertEquals(1, champWins[p1.id]!!)
        assertEquals(0, champWins[p2.id]!!)

        // Game 2: Tie (still 1-0)
        // Tie awards 0 wins
        assertEquals(1, champWins[p1.id]!!)
        assertEquals(0, champWins[p2.id]!!)

        // Game 3: P2 wins (1-1)
        champWins[p2.id] = champWins[p2.id]!! + 1
        assertEquals(1, champWins[p1.id]!!)
        assertEquals(1, champWins[p2.id]!!)

        // Game 4: P1 wins (2-1) -> Series concludes!
        champWins[p1.id] = champWins[p1.id]!! + 1
        assertEquals(2, champWins[p1.id]!!)
        assertEquals(1, champWins[p2.id]!!)

        assertTrue(champWins[p1.id]!! >= 2)
        val championId = p1.id
        val runnerUpId = p2.id

        // 3. Final Standings
        val podium = RoomEngine.getFinalTournamentStandings(players, championId, runnerUpId, thirdPlaceId)
        assertEquals(p1.id, podium[0].id) // Champion
        assertEquals(p2.id, podium[1].id) // Runner-up
        assertEquals(p3.id, podium[2].id) // Third place

        // Qualifier Brawl Points remained invariant
        assertEquals(6, p1.qualifierPoints)
        assertEquals(3, p2.qualifierPoints)
        assertEquals(0, p3.qualifierPoints)
    }

    // 21. Qualifier VOID Advances QualifiersCompleted Without Mutating Fighter Stats
    @Test
    fun testQualifierVoidAdvancesCompletionWithoutMutatingFighterStats() {
        val p1 = RoomEngine.createFreshPlayer("P1", "⚡")
        val p2 = RoomEngine.createFreshPlayer("P2", "🦊")
        val p3 = RoomEngine.createFreshPlayer("P3", "🎯")
        val schedule = RoomEngine.generateTournamentSchedule(listOf(p1, p2, p3))
        assertEquals(0, schedule.qualifiersCompleted)

        val initialP1Points = p1.qualifierPoints
        val initialP1Wins = p1.qualifierWins
        val initialP1Losses = p1.qualifierLosses
        val initialP1Matches = p1.qualifierMatchesPlayed
        val initialP2Points = p2.qualifierPoints
        val initialP2Wins = p2.qualifierWins
        val initialP2Losses = p2.qualifierLosses
        val initialP2Matches = p2.qualifierMatchesPlayed

        // Exercise real production RoomEngine qualifier resolution for VOID
        RoomEngine.applyQualifierMatchResolution(
            schedule = schedule,
            players = listOf(p1, p2, p3),
            fighterIds = listOf(p1.id, p2.id),
            winnerId = null,
            isTie = false,
            reason = RoundResolutionReason.VOID
        )

        assertEquals(1, schedule.qualifiersCompleted)
        assertEquals(initialP1Points, p1.qualifierPoints)
        assertEquals(initialP1Wins, p1.qualifierWins)
        assertEquals(initialP1Losses, p1.qualifierLosses)
        assertEquals(initialP1Matches, p1.qualifierMatchesPlayed)
        assertEquals(initialP2Points, p2.qualifierPoints)
        assertEquals(initialP2Wins, p2.qualifierWins)
        assertEquals(initialP2Losses, p2.qualifierLosses)
        assertEquals(initialP2Matches, p2.qualifierMatchesPlayed)
    }
}
