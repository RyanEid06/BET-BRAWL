package com.betbrawl.app.server.engine

import com.betbrawl.app.server.model.*
import java.util.UUID

object RoomEngine {

    const val MIN_PLAYERS_TO_START = 3
    const val MAX_PLAYERS_CAPACITY = 9

    private val PLAYER_COLORS = listOf(
        "#06b6d4", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6",
        "#ec4899", "#3b82f6", "#14b8a6", "#f97316"
    )

    private val ROOM_WORDS = listOf(
        "BRAWL", "FIGHT", "CLASH", "VIPER", "TITAN",
        "SWIFT", "SPARK", "TURBO", "BLITZ", "ARENA"
    )

    val MINI_GAME_ROTATION = listOf(
        "millisecond_stop",
        "rapid_red_green",
        "speed_math",
        "higher_lower",
        "blind_pinpoint",
        "quick_draw"
    )

    fun getRandomPlayerColor(): String = PLAYER_COLORS.random()

    fun generateRoomCode(): String = ROOM_WORDS.random()

    fun generateSecureToken(): String = "tok_${UUID.randomUUID().toString().replace("-", "")}"

    fun generateSecurePlayerId(): String = "p_${UUID.randomUUID().toString().replace("-", "").take(10)}"

    fun sanitizePlayerName(raw: String?, isHost: Boolean = false): String {
        val trimmed = raw?.trim().orEmpty()
        return if (trimmed.isEmpty()) (if (isHost) "Host" else "Brawler") else trimmed.take(16)
    }

    fun sanitizePlayerAvatar(raw: String?): String {
        val trimmed = raw?.trim().orEmpty()
        return if (trimmed.isEmpty()) "⚡" else trimmed.take(4)
    }

    fun createFreshPlayer(name: String, avatar: String, isHost: Boolean = false, sessionToken: String? = null): Player {
        val token = sessionToken ?: generateSecureToken()
        return Player(
            id = generateSecurePlayerId(),
            sessionToken = token,
            name = sanitizePlayerName(name, isHost),
            avatar = sanitizePlayerAvatar(avatar),
            color = getRandomPlayerColor(),
            isHost = isHost,
            isReady = false,
            connected = true,
            coins = 1000
        )
    }

    fun orderTournamentMatches(pairs: List<Pair<String, String>>): List<Pair<String, String>> {
        if (pairs.size <= 1) return pairs.toList()
        val remaining = pairs.toMutableList()
        val ordered = mutableListOf<Pair<String, String>>()

        ordered.add(remaining.removeAt(0))

        while (remaining.isNotEmpty()) {
            val prev = ordered.last()
            var bestIdx = remaining.indexOfFirst {
                it.first != prev.first && it.first != prev.second &&
                        it.second != prev.first && it.second != prev.second
            }
            if (bestIdx == -1) {
                bestIdx = 0
            }
            ordered.add(remaining.removeAt(bestIdx))
        }

        return ordered
    }

    fun generateTournamentSchedule(players: List<Player>): TournamentSchedule {
        val eligible = players.filter { it.connected }
        if (eligible.size < MIN_PLAYERS_TO_START) {
            throw IllegalArgumentException("Tournament requires at least $MIN_PLAYERS_TO_START connected players (got ${eligible.size})")
        }
        if (eligible.size > MAX_PLAYERS_CAPACITY) {
            throw IllegalArgumentException("Tournament exceeds maximum capacity of $MAX_PLAYERS_CAPACITY players")
        }

        val shuffled = eligible.shuffled()
        val n = shuffled.size
        val stableRosterOrder = shuffled.map { it.id }

        val circularPairs = mutableListOf<Pair<String, String>>()
        for (i in 0 until n) {
            circularPairs.add(Pair(shuffled[i].id, shuffled[(i + 1) % n].id))
        }

        val orderedPairs = orderTournamentMatches(circularPairs)

        val matches = orderedPairs.mapIndexed { idx, pair ->
            TournamentMatch(
                matchIndex = idx,
                roundNumber = idx + 1,
                fighterIds = listOf(pair.first, pair.second),
                isChampionship = false,
                completed = false,
                winnerId = null
            )
        }.toMutableList()

        return TournamentSchedule(
            stage = TournamentStage.QUALIFIERS,
            totalPlayers = n,
            qualifierCount = n,
            qualifiersCompleted = 0,
            totalRounds = n + 2,
            matches = matches,
            stableRosterOrder = stableRosterOrder
        )
    }

    fun computeTournamentRankings(
        players: List<Player>,
        qualifierMatches: List<TournamentMatch>,
        stableRosterOrder: List<String>? = null
    ): List<Player> {
        val groupsMap = mutableMapOf<String, MutableList<Player>>()

        for (player in players) {
            val key = "${player.qualifierPoints}_${player.qualifierWins}"
            groupsMap.getOrPut(key) { mutableListOf() }.add(player)
        }

        val sortedGroups = groupsMap.values.sortedWith { g1, g2 ->
            val p1 = g1.first()
            val p2 = g2.first()
            if (p2.qualifierPoints != p1.qualifierPoints) {
                p2.qualifierPoints.compareTo(p1.qualifierPoints)
            } else {
                p2.qualifierWins.compareTo(p1.qualifierWins)
            }
        }

        val finalRanked = mutableListOf<Player>()

        for (tied in sortedGroups) {
            if (tied.size == 1) {
                finalRanked.add(tied[0])
            } else if (tied.size == 2) {
                val p1 = tied[0]
                val p2 = tied[1]

                val h2h = qualifierMatches.find {
                    it.completed &&
                            ((it.fighterIds[0] == p1.id && it.fighterIds[1] == p2.id) ||
                                    (it.fighterIds[0] == p2.id && it.fighterIds[1] == p1.id))
                }

                if (h2h != null && h2h.winnerId == p1.id) {
                    finalRanked.add(p1)
                    finalRanked.add(p2)
                } else if (h2h != null && h2h.winnerId == p2.id) {
                    finalRanked.add(p2)
                    finalRanked.add(p1)
                } else {
                    val sortedTwo = tied.sortedWith { a, b ->
                        if (b.coins != a.coins) {
                            b.coins.compareTo(a.coins)
                        } else if (!stableRosterOrder.isNullOrEmpty()) {
                            val idxA = stableRosterOrder.indexOf(a.id)
                            val idxB = stableRosterOrder.indexOf(b.id)
                            idxA.compareTo(idxB)
                        } else 0
                    }
                    finalRanked.addAll(sortedTwo)
                }
            } else {
                // 3+ players tied: avoid non-transitive head-to-head cycles
                val sortedTied = tied.sortedWith { a, b ->
                    if (b.coins != a.coins) {
                        b.coins.compareTo(a.coins)
                    } else if (!stableRosterOrder.isNullOrEmpty()) {
                        val idxA = stableRosterOrder.indexOf(a.id)
                        val idxB = stableRosterOrder.indexOf(b.id)
                        idxA.compareTo(idxB)
                    } else 0
                }
                finalRanked.addAll(sortedTied)
            }
        }

        finalRanked.forEachIndexed { idx, p ->
            p.tournamentRank = idx + 1
        }

        return finalRanked
    }

    fun getFinalTournamentStandings(
        players: List<Player>,
        championId: String?,
        runnerUpId: String?,
        thirdPlaceId: String?
    ): List<Player> {
        val champ = championId?.let { id -> players.find { it.id == id } }
        val runnerUp = runnerUpId?.let { id -> players.find { it.id == id } }
        val third = thirdPlaceId?.let { id -> players.find { it.id == id } }

        val nonFinalists = players.filter {
            it.id != champ?.id && it.id != runnerUp?.id && it.id != third?.id
        }.sortedWith { a, b ->
            val rankA = a.tournamentRank
            val rankB = b.tournamentRank
            if (rankA != null && rankB != null) {
                rankA.compareTo(rankB)
            } else if (b.qualifierPoints != a.qualifierPoints) {
                b.qualifierPoints.compareTo(a.qualifierPoints)
            } else if (b.qualifierWins != a.qualifierWins) {
                b.qualifierWins.compareTo(a.qualifierWins)
            } else {
                b.coins.compareTo(a.coins)
            }
        }

        val ordered = mutableListOf<Player>()
        if (champ != null) ordered.add(champ)
        if (runnerUp != null) ordered.add(runnerUp)
        if (third != null) ordered.add(third)
        ordered.addAll(nonFinalists)
        return ordered
    }

    fun selectMiniGame(
        roundIndex: Int,
        lastMiniGameId: String? = null,
        isChampionship: Boolean = false,
        championshipGameNumber: Int = 1
    ): String {
        if (isChampionship) {
            val champIndex = (championshipGameNumber - 1) % MINI_GAME_ROTATION.size
            var selected = MINI_GAME_ROTATION[champIndex]
            if (selected == lastMiniGameId && MINI_GAME_ROTATION.size > 1) {
                selected = MINI_GAME_ROTATION[(champIndex + 1) % MINI_GAME_ROTATION.size]
            }
            return selected
        }

        val gameIndex = roundIndex % MINI_GAME_ROTATION.size
        var candidate = MINI_GAME_ROTATION[gameIndex]
        if (candidate == lastMiniGameId && MINI_GAME_ROTATION.size > 1) {
            candidate = MINI_GAME_ROTATION[(gameIndex + 1) % MINI_GAME_ROTATION.size]
        }
        return candidate
    }

    fun computeSessionAwards(
        players: List<Player>,
        roundHistory: List<RoundHistoryItem>,
        championId: String?
    ): List<Award> {
        val awards = mutableListOf<Award>()

        val champion = championId?.let { id -> players.find { it.id == id } }
        if (champion != null) {
            awards.add(
                Award(
                    id = "award_champion",
                    title = "Undisputed Champion",
                    icon = "👑",
                    badgeColor = "amber",
                    recipientId = champion.id,
                    recipientName = champion.name,
                    description = "Claimed 1st place in the Grand Championship Series",
                    metric = "${champion.coins} Coins"
                )
            )
        }

        val sharp = players.maxByOrNull { it.totalCoinsWonInBets }
        if (sharp != null && sharp.totalCoinsWonInBets > 0) {
            awards.add(
                Award(
                    id = "award_sharp",
                    title = "High Roller Sharp",
                    icon = "💰",
                    badgeColor = "emerald",
                    recipientId = sharp.id,
                    recipientName = sharp.name,
                    description = "Earned the most profit from spectator bets",
                    metric = "+${sharp.totalCoinsWonInBets} Coins Won"
                )
            )
        }

        val fighter = players.maxByOrNull { it.matchesWon }
        if (fighter != null && fighter.matchesWon > 0 && fighter.id != champion?.id) {
            awards.add(
                Award(
                    id = "award_brawler",
                    title = "Combat Master",
                    icon = "🥊",
                    badgeColor = "rose",
                    recipientId = fighter.id,
                    recipientName = fighter.name,
                    description = "Won the most 1v1 mini-game battles",
                    metric = "${fighter.matchesWon} Victories"
                )
            )
        }

        return awards
    }
}
