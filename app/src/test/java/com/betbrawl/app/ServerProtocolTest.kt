package com.betbrawl.app

import com.betbrawl.app.server.BrawlWebSocketServer
import com.betbrawl.app.server.model.*
import com.google.gson.Gson
import com.google.gson.JsonObject
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import org.java_websocket.WebSocket
import org.junit.Assert.*
import org.junit.Test
import java.lang.reflect.Proxy
import java.util.concurrent.CountDownLatch
import kotlin.concurrent.thread

@OptIn(ExperimentalCoroutinesApi::class)
class ServerProtocolTest {
    private class Peer {
        val messages = mutableListOf<JsonObject>()
        var open = true
        val socket = Proxy.newProxyInstance(WebSocket::class.java.classLoader, arrayOf(WebSocket::class.java)) { proxy, method, args ->
            when (method.name) {
                "isOpen" -> open
                "send" -> { if (args?.firstOrNull() is String) messages.add(Gson().fromJson(args[0] as String, JsonObject::class.java)); null }
                "close" -> { open = false; null }
                "hashCode" -> System.identityHashCode(proxy)
                "equals" -> proxy === args?.firstOrNull()
                "toString" -> "ProtocolPeer"
                else -> null
            }
        } as WebSocket
        fun payload(type: String): JsonObject = messages.last { it["type"].asString == type }["payload"].asJsonObject
        val id: String get() = payload("JOIN_SUCCESS")["player"].asJsonObject["id"].asString
        val token: String get() = payload("JOIN_SUCCESS")["sessionToken"].asString
    }

    private class Room : AutoCloseable {
        val gson = Gson()
        val scheduler = TestCoroutineScheduler()
        var clockOffset = 0L
        val now: Long get() = 1_000_000L + scheduler.currentTime + clockOffset
        val server = BrawlWebSocketServer("127.0.0.1", 0,
            dispatcher = StandardTestDispatcher(scheduler), nowMs = { now })
        val host = Peer()
        val peers = mutableListOf(host)
        init { send(host, "CREATE_ROOM", mapOf("playerName" to "Host")) }
        fun send(peer: Peer, type: String, payload: Any = emptyMap<String, Any>()) {
            server.onMessage(peer.socket, gson.toJson(mapOf("type" to type, "payload" to payload)))
            scheduler.runCurrent()
        }
        fun join(): Peer = Peer().also {
            send(it, "JOIN_ROOM", mapOf("roomCode" to server.roomCode, "playerName" to "Guest${peers.size}"))
            peers.add(it)
        }
        fun readyStart() {
            peers.drop(1).forEach { send(it, "TOGGLE_READY") }
            send(host, "START_GAME")
        }
        fun advance(ms: Long) { scheduler.advanceTimeBy(ms); scheduler.runCurrent() }
        fun until(deadline: Long) { advance((deadline - now).coerceAtLeast(0)) }
        fun disconnect(peer: Peer) { peer.open = false; server.onClose(peer.socket, 1000, "test disconnect", true); scheduler.runCurrent() }
        fun recover(peer: Peer): Peer = Peer().also {
            send(it, "JOIN_ROOM", mapOf("roomCode" to server.roomCode, "sessionToken" to peer.token))
            peers[peers.indexOf(peer)] = it
        }
        fun state(peer: Peer = peers.first { it.open }): PublicRoomState = gson.fromJson(peer.payload("ROOM_STATE"), PublicRoomState::class.java)
        fun action(peer: Peer, payload: Any) = send(peer, "FIGHTER_ACTION", payload)
        fun fighter(id: String) = peers.first { it.id == id }
        fun startActive() { until(server.currentRound!!.gameStartsAt); assertEquals(GamePhase.MINIGAME_ACTIVE, state().phase) }
        fun play(winnerId: String?) {
            startActive()
            val round = state().currentRound!!
            if (winnerId == null) { until(round.gameEndsAt); return }
            val winner = fighter(winnerId)
            when (round.miniGame.id) {
                "millisecond_stop" -> {
                    until(round.gameStartsAt + 5000)
                    action(winner, mapOf("type" to "STOP"))
                    advance(1000)
                    action(fighter(round.fighterIds.first { it != winnerId }), mapOf("type" to "STOP"))
                }
                "rapid_red_green" -> { action(winner, mapOf("type" to "TAP")); until(round.gameEndsAt) }
                "speed_math" -> {
                    val questions = winner.payload("ROOM_STATE")["currentRound"].asJsonObject["gameConfig"].asJsonObject["questions"].asJsonArray
                    questions.forEachIndexed { index, question ->
                        val parts = question.asJsonObject["q"].asString.split(' ')
                        val a = parts[0].toInt(); val b = parts[2].toInt()
                        val answer = when (parts[1]) { "+" -> a + b; "-" -> a - b; else -> a * b }
                        action(winner, mapOf("type" to "ANSWER", "questionIndex" to index, "answer" to answer))
                    }
                }
                "higher_lower" -> {
                    val cards = winner.payload("ROOM_STATE")["currentRound"].asJsonObject["gameConfig"].asJsonObject["cards"].asJsonArray
                    cards.take(3).forEachIndexed { index, card ->
                        val base = card.asJsonObject["baseItem"].asString
                        val challenger = card.asJsonObject["challengerItem"].asString
                        val fact = MiniGamesCatalog.STABLE_HIGHER_LOWER_BANK.first { it.baseItem == base && it.challengerItem == challenger }
                        action(winner, mapOf("type" to "GUESS", "questionIndex" to index, "guess" to if (fact.isHigher) "HIGHER" else "LOWER"))
                    }
                }
                else -> error("Unexpected tournament game ${round.miniGame.id}")
            }
            assertEquals(GamePhase.PAYOUT_RECAP, state().phase)
            assertEquals(winnerId, state().currentRound!!.winnerId)
        }
        override fun close() { server.stopServer() }
    }

    @Test
    fun hostCanKickADisconnectedLobbySeatImmediately() = Room().use { room ->
        val guest = room.join()
        room.disconnect(guest)
        assertEquals(2, room.state(room.host).players.size)
        room.send(room.host, "KICK_PLAYER", mapOf("playerId" to guest.id))
        assertEquals(listOf(room.host.id), room.state(room.host).players.map { it.id })
    }

    @Test
    fun qualifierVoidCompletesExactlyTheCurrentMatchThroughProtocol() = Room().use { room ->
        room.join(); room.join(); room.readyStart()
        val round = room.state().currentRound!!
        val spectator = room.peers.first { it.id !in round.fighterIds }
        room.until(round.revealEndsAt)
        room.send(spectator, "PLACE_BET", mapOf("fighterId" to round.fighterIds[0], "amount" to 100))
        round.fighterIds.forEach { room.disconnect(room.fighter(it)) }
        room.advance(5000)
        val state = room.state(spectator)
        assertEquals(GamePhase.PAYOUT_RECAP, state.phase)
        assertEquals(RoundResolutionReason.VOID, state.currentRound!!.resolutionReason)
        assertEquals(listOf(true, false, false), state.tournamentSchedule!!.matches.map { it.completed })
        assertEquals(1, state.tournamentSchedule.qualifiersCompleted)
        assertTrue(state.players.all { it.qualifierMatchesPlayed == 0 && it.qualifierPoints == 0 && it.matchesPlayed == 0 })
        assertEquals(1000, state.players.first { it.id == spectator.id }.coins)
        assertEquals("BET_REFUND", state.currentRound.payouts.single().type)
        room.advance(20000)
        assertEquals(1, room.state(spectator).roundHistory.size)
    }

    @Test
    fun completeThreePlayerTournamentUsesEveryQualifierAndLocksTwoOneChampionship() = Room().use { room ->
        room.join(); room.join(); room.readyStart()
        val first = room.state().currentRound!!
        val p1 = first.fighterIds[0]; val p2 = first.fighterIds[1]
        val p3 = room.peers.first { it.id != p1 && it.id != p2 }.id
        repeat(3) { index ->
            val round = room.state().currentRound!!
            assertEquals(index + 1, round.roundNumber)
            if (index == 0) {
                room.until(round.revealEndsAt)
                room.send(room.fighter(p3), "PLACE_BET", mapOf("fighterId" to p1, "amount" to 100))
            }
            room.play(if (p1 in round.fighterIds) p1 else p2)
            if (index == 0) {
                room.peers.forEach { assertEquals(100, room.state(it).currentRound!!.bets.single().amount) }
                assertEquals(1100, room.state().players.first { it.id == p3 }.coins)
                room.send(room.peers.first { it !== room.host }, "NEXT_ROUND")
                assertEquals(1, room.state().currentRound!!.roundNumber)
                assertEquals(GamePhase.PAYOUT_RECAP, room.state().phase)
            }
            val schedule = room.state().tournamentSchedule!!
            assertEquals(index + 1, schedule.qualifiersCompleted)
            assertEquals(List(3) { it <= index }, schedule.matches.map { it.completed })
            room.send(room.host, "NEXT_ROUND")
        }
        val qualified = room.state()
        val initial = qualified.players.associate { it.id to listOf(it.qualifierPoints, it.qualifierWins, it.qualifierTies, it.qualifierLosses, it.qualifierMatchesPlayed, it.tournamentRank) }
        assertEquals(listOf(6, 3, 0), listOf(p1, p2, p3).map { id -> qualified.players.first { it.id == id }.qualifierPoints })
        assertEquals(listOf(listOf(6, 2, 0, 0, 2), listOf(3, 1, 0, 1, 2), listOf(0, 0, 0, 2, 2)),
            listOf(p1, p2, p3).map { id -> qualified.players.first { it.id == id }.let { listOf(it.qualifierPoints, it.qualifierWins, it.qualifierTies, it.qualifierLosses, it.qualifierMatchesPlayed) } })
        assertTrue(qualified.players.all { it.qualifierMatchesPlayed == 2 })
        assertEquals(listOf(p1, p2), qualified.tournamentSchedule!!.finalists)
        listOf(p1, null, p2, p1).forEachIndexed { index, winner ->
            assertEquals(setOf(p1, p2), room.state().currentRound!!.fighterIds.toSet())
            room.play(winner)
            val state = room.state()
            val wins = state.tournamentSchedule!!.championshipWins
            assertEquals(listOf(1, 1, 1, 2)[index], wins[p1])
            assertEquals(listOf(0, 0, 1, 1)[index], wins[p2])
            assertEquals(initial, state.players.associate { it.id to listOf(it.qualifierPoints, it.qualifierWins, it.qualifierTies, it.qualifierLosses, it.qualifierMatchesPlayed, it.tournamentRank) })
            room.send(room.host, "NEXT_ROUND")
        }
        val final = room.state()
        assertEquals(GamePhase.FINAL_PODIUM, final.phase)
        assertEquals(7, final.roundHistory.size)
        assertEquals(p1, final.tournamentSchedule!!.championId)
        assertEquals(p2, final.tournamentSchedule.runnerUpId)
        assertEquals(p3, final.tournamentSchedule.thirdPlaceId)
        assertEquals(4, final.tournamentSchedule.championshipGamesPlayed)
        assertEquals(7, final.tournamentSchedule.matches.count { it.completed })
        val before = room.gson.toJson(final)
        room.send(room.host, "NEXT_ROUND")
        assertEquals(before, room.gson.toJson(room.state()))
        val departed = room.peers.first { it !== room.host }
        room.disconnect(departed)
        room.send(room.host, "RESTART_GAME")
        assertEquals(GamePhase.LOBBY, room.state().phase)
        assertEquals(3, room.state().players.size)
        room.advance(60000)
        assertEquals(2, room.state().players.size)
    }

    @Test
    fun serverRejectsUnauthorizedActionsAndEnforcesPlayerLimitsAndReadyGate() = Room().use { room ->
        val unknown = Peer()
        val originalCode = room.server.roomCode
        room.send(unknown, "CREATE_ROOM"); room.send(unknown, "CLOSE_ROOM"); room.send(unknown, "START_GAME")
        assertEquals(originalCode, room.server.roomCode)
        assertEquals(GamePhase.LOBBY, room.state().phase)
        room.send(room.host, "START_GAME")
        assertEquals("NOT_ENOUGH_PLAYERS", room.host.payload("JOIN_ERROR")["code"].asString)
        val guest = room.join(); room.join()
        room.send(guest, "START_GAME"); room.send(guest, "CLOSE_ROOM")
        room.send(room.host, "START_GAME")
        assertEquals("NOT_ALL_READY", room.host.payload("JOIN_ERROR")["code"].asString)
        repeat(6) { room.join() }
        val rejected = Peer()
        room.send(rejected, "JOIN_ROOM", mapOf("roomCode" to originalCode))
        assertEquals("ROOM_FULL", rejected.payload("JOIN_ERROR")["code"].asString)
        room.peers.drop(1).forEach { room.send(it, "TOGGLE_READY") }
        room.send(guest, "START_GAME")
        assertEquals(GamePhase.LOBBY, room.state().phase)
        room.send(room.host, "START_GAME")
        assertEquals(GamePhase.FIGHTER_REVEAL, room.state().phase)
        assertEquals(9, room.state().players.size)
        room.send(guest, "NEXT_ROUND"); room.send(guest, "RESTART_GAME"); room.send(guest, "KICK_PLAYER", mapOf("playerId" to room.host.id))
        room.send(guest, "CLOSE_ROOM")
        assertEquals(9, room.state().players.size)
        assertEquals(GamePhase.FIGHTER_REVEAL, room.state().phase)
    }

    @Test
    fun privateBetsTokensAndAuthoritativeDeadlineSurviveProtocolSerialization() = Room().use { room ->
        room.join(); room.join(); room.readyStart()
        val round = room.state().currentRound!!
        val bettor = room.peers.first { it.id !in round.fighterIds }
        room.until(round.revealEndsAt)
        listOf<Any>(0, -1, 1.5, "100").forEach { amount ->
            room.send(bettor, "PLACE_BET", mapOf("fighterId" to round.fighterIds[0], "amount" to amount))
            assertEquals(0, room.server.currentRound!!.bets.size)
        }
        room.send(bettor, "PLACE_BET", mapOf("fighterId" to round.fighterIds[0], "amount" to 100))
        assertEquals(1, room.server.currentRound!!.bets.size)
        room.peers.forEach { peer ->
            val json = peer.payload("ROOM_STATE").toString()
            room.peers.forEach { assertFalse(json.contains(it.token)) }
            assertTrue(room.state(peer).currentRound!!.bets.isEmpty())
        }
        room.send(bettor, "PLACE_BET", mapOf("fighterId" to round.fighterIds[0], "amount" to 100))
        assertEquals(1, room.server.currentRound!!.bets.size)
        room.clockOffset = round.bettingEndsAt - room.now
        // Timer callback is deliberately delayed: timestamp, rather than phase, must close betting.
        room.send(bettor, "PLACE_BET", mapOf("fighterId" to round.fighterIds[0], "amount" to 50))
        assertEquals("Authoritative betting deadline has passed", bettor.payload("BET_REJECTED")["reason"].asString)
        assertEquals(1, room.server.currentRound!!.bets.size)
    }

    @Test
    fun malformedSpectatorEarlyAndLateFighterActionsCannotChangeScores() = Room().use { room ->
        room.join(); room.join(); room.readyStart()
        val round = room.state().currentRound!!
        val fighter = room.fighter(round.fighterIds[0])
        val spectator = room.peers.first { it.id !in round.fighterIds }
        room.action(fighter, mapOf("type" to "STOP"))
        assertTrue(room.server.internalGameState!!.millisecondStopStopped.values.none { it })
        room.startActive()
        room.action(spectator, mapOf("type" to "STOP"))
        room.action(fighter, mapOf("type" to "BOGUS"))
        room.action(fighter, mapOf("type" to 123))
        room.server.onMessage(fighter.socket, "{bad json")
        assertTrue(room.server.internalGameState!!.millisecondStopStopped.values.none { it })
        room.clockOffset = round.gameEndsAt - room.now
        room.action(fighter, mapOf("type" to "STOP"))
        assertTrue(room.server.internalGameState!!.millisecondStopStopped.values.none { it })
        assertTrue(room.state().roundHistory.isEmpty())
    }

    @Test
    fun reconnectRecoversSeatAndStaleSocketCannotActOrDisconnectReplacement() = Room().use { room ->
        val guest = room.join(); room.join()
        val replacement = room.recover(guest)
        assertEquals(guest.id, replacement.id)
        assertEquals(guest.token, replacement.token)
        assertEquals(3, room.state().players.size)
        // Deliver a buffered message from the replaced connection, regardless of transport state.
        guest.open = true
        room.send(guest, "TOGGLE_READY")
        assertFalse(room.state().players.first { it.id == guest.id }.isReady)
        room.server.onClose(guest.socket, 1000, "stale close", true)
        assertTrue(room.state().players.first { it.id == guest.id }.connected)
        room.send(replacement, "TOGGLE_READY")
        assertTrue(room.state().players.first { it.id == guest.id }.isReady)
        val oldHost = room.host
        val hostReplacement = room.recover(oldHost)
        oldHost.open = true
        room.send(oldHost, "CLOSE_ROOM")
        assertEquals(GamePhase.LOBBY, room.state().phase)
        room.send(hostReplacement, "CLOSE_ROOM")
        assertEquals("", room.server.roomCode)
    }

    @Test
    fun oneSocketCannotOccupySeveralSeats() = Room().use { room ->
        val guest = room.join()
        room.send(guest, "JOIN_ROOM", mapOf("roomCode" to room.server.roomCode, "playerName" to "Duplicate"))
        assertEquals(2, room.state().players.size)
        assertEquals(guest.id, room.state().players.first { it.id != room.host.id }.id)
    }

    @Test
    fun staleLobbySeatExpiresButReconnectCancelsCleanup() = Room().use { room ->
        val guest = room.join()
        room.disconnect(guest)
        room.advance(59999)
        assertEquals(2, room.state().players.size)
        val returned = room.recover(guest)
        room.advance(1)
        assertEquals(2, room.state().players.size)
        room.disconnect(returned)
        room.advance(60000)
        assertEquals(listOf(room.host.id), room.state().players.map { it.id })
    }

    @Test
    fun fighterReconnectCancelsForfeitAndLaterDisconnectRefundsBetOnce() = Room().use { room ->
        room.join(); room.join(); room.readyStart()
        val round = room.state().currentRound!!
        val loser = room.fighter(round.fighterIds[0]); val winner = round.fighterIds[1]
        val bettor = room.peers.first { it.id !in round.fighterIds }
        room.until(round.revealEndsAt)
        room.send(bettor, "PLACE_BET", mapOf("fighterId" to loser.id, "amount" to 100))
        room.disconnect(loser); room.advance(4999)
        val returned = room.recover(loser)
        room.advance(1)
        assertEquals(0, room.state(bettor).roundHistory.size)
        room.disconnect(returned); room.advance(5000)
        val state = room.state(bettor)
        assertEquals(RoundResolutionReason.DISCONNECT_FORFEIT, state.currentRound!!.resolutionReason)
        assertEquals(winner, state.currentRound.winnerId)
        assertEquals(3, state.players.first { it.id == winner }.qualifierPoints)
        assertEquals(1000, state.players.first { it.id == bettor.id }.coins)
        room.advance(20000)
        assertEquals(1, room.state(bettor).roundHistory.size)
    }

    @Test
    fun alreadyDisconnectedFighterGetsGraceWhenItsNextMatchBegins() = Room().use { room ->
        room.join(); room.join(); room.readyStart()
        room.play(room.state().currentRound!!.fighterIds[0])
        val next = room.state().tournamentSchedule!!.matches[1]
        val absent = room.peers.first { it !== room.host && it.id in next.fighterIds }
        room.disconnect(absent) // PAYOUT_RECAP has no active fighter timer.
        room.send(room.host, "NEXT_ROUND")
        room.advance(5000)
        assertEquals(RoundResolutionReason.DISCONNECT_FORFEIT, room.state().currentRound!!.resolutionReason)
        assertEquals(next.fighterIds.first { it != absent.id }, room.state().currentRound!!.winnerId)
        assertEquals(2, room.state().roundHistory.size)
    }

    @Test
    fun hostGraceClosesRoomWithoutReturnAndRecoveryCancelsIt() = Room().use { room ->
        val guest = room.join(); room.join()
        room.disconnect(room.host); room.advance(59999)
        assertEquals(GamePhase.LOBBY, room.state(guest).phase)
        val returned = room.recover(room.host)
        room.advance(1)
        assertEquals(GamePhase.LOBBY, room.state(guest).phase)
        room.disconnect(returned); room.advance(60000)
        assertEquals("", room.server.roomCode)
        assertEquals(GamePhase.ENTRY, room.server.phase)
        assertTrue(room.server.players.isEmpty())
        assertTrue(guest.messages.any { it["type"].asString == "ROOM_CLOSED" })
    }

    @Test
    fun hostGraceSurvivesRoundResolutionAndCannotCloseANewRoom() = Room().use { room ->
        room.join(); room.join(); room.readyStart()
        val watcher = room.peers.first { it !== room.host }
        room.disconnect(room.host)
        room.advance(60000)
        assertEquals("", room.server.roomCode)
        assertTrue(watcher.messages.any { it["type"].asString == "ROOM_CLOSED" })
        val newHost = Peer()
        room.send(newHost, "CREATE_ROOM", mapOf("playerName" to "New host"))
        val code = room.server.roomCode
        room.advance(60000)
        assertEquals(code, room.server.roomCode)
        assertEquals(GamePhase.LOBBY, room.server.phase)
    }

    @Test
    fun concurrentDuplicateFighterMessagesPayOutExactlyOnce() = Room().use { room ->
        room.join(); room.join(); room.readyStart(); room.startActive()
        val round = room.state().currentRound!!
        room.until(round.gameStartsAt + 5000)
        room.action(room.fighter(round.fighterIds[0]), mapOf("type" to "STOP"))
        room.advance(1000)
        val second = room.fighter(round.fighterIds[1])
        val json = room.gson.toJson(mapOf("type" to "FIGHTER_ACTION", "payload" to mapOf("type" to "STOP")))
        val start = CountDownLatch(1)
        val threads = List(8) { thread { start.await(); room.server.onMessage(second.socket, json) } }
        start.countDown(); threads.forEach { it.join() }; room.scheduler.runCurrent()
        assertEquals(1, room.state().roundHistory.size)
        assertEquals(1, room.state().tournamentSchedule!!.qualifiersCompleted)
        assertEquals(3250, room.state().players.sumOf { it.coins })
    }

    @Test
    fun speedMathRejectsFractionalAndStringPayloadsThroughProtocol() = Room().use { room ->
        room.join(); room.join(); room.readyStart()
        repeat(2) { room.play(null); room.send(room.host, "NEXT_ROUND") }
        room.startActive()
        assertEquals("speed_math", room.state().currentRound!!.miniGame.id)
        val fighter = room.fighter(room.state().currentRound!!.fighterIds[0])
        for (payload in listOf(
            mapOf("type" to "ANSWER", "questionIndex" to 0.5, "answer" to 1),
            mapOf("type" to "ANSWER", "questionIndex" to 0, "answer" to "1"),
            mapOf("type" to "ANSWER", "questionIndex" to 0, "answer" to 1.5),
            mapOf("type" to "ANSWER", "questionIndex" to -1, "answer" to 1)
        )) room.action(fighter, payload)
        assertTrue(room.state().currentRound!!.fighterScores.values.all { it.toInt() == 0 })
        assertEquals(2, room.state().roundHistory.size)
    }

    @Test
    fun disconnectedPreStartSeatNeverEntersFrozenTournamentRosterOrPodium() = Room().use { room ->
        room.join(); room.join()
        val outsider = room.join()
        room.disconnect(outsider)
        room.readyStart()
        val roster = room.state().tournamentSchedule!!.stableRosterOrder.toSet()
        assertEquals(3, roster.size)
        assertFalse(outsider.id in roster)
        repeat(3) {
            val fighters = room.state().currentRound!!.fighterIds.map { room.fighter(it) }
            fighters.forEach { room.disconnect(it) }
            room.advance(5000)
            fighters.forEach { room.recover(it) }
            room.send(room.fighter(room.host.id), "NEXT_ROUND")
        }
        val state = room.state()
        assertTrue(state.tournamentSchedule!!.finalists!!.all { it in roster })
        assertTrue(state.tournamentSchedule.thirdPlaceId in roster)
        assertNull(state.players.first { it.id == outsider.id }.tournamentRank)
    }

    @Test
    fun championshipVoidRefundsBetWithoutWinsOrQualifierChanges() = Room().use { room ->
        room.join(); room.join(); room.readyStart()
        repeat(3) { room.play(null); room.send(room.host, "NEXT_ROUND") }
        val initial = room.state().players.associate { it.id to listOf(it.qualifierPoints, it.qualifierWins, it.qualifierTies, it.qualifierLosses, it.qualifierMatchesPlayed) }
        val round = room.state().currentRound!!
        val spectator = room.peers.first { it.id !in round.fighterIds }
        val bankroll = room.state().players.first { it.id == spectator.id }.coins
        room.until(round.revealEndsAt)
        room.send(spectator, "PLACE_BET", mapOf("fighterId" to round.fighterIds[0], "amount" to 100))
        round.fighterIds.forEach { room.disconnect(room.fighter(it)) }
        room.advance(5000)
        val state = room.state(spectator)
        assertEquals(RoundResolutionReason.VOID, state.currentRound!!.resolutionReason)
        assertEquals(listOf(0, 0), state.tournamentSchedule!!.finalists!!.map { state.tournamentSchedule.championshipWins[it] })
        assertEquals(1, state.tournamentSchedule.championshipGamesPlayed)
        assertEquals(bankroll, state.players.first { it.id == spectator.id }.coins)
        assertEquals(initial, state.players.associate { it.id to listOf(it.qualifierPoints, it.qualifierWins, it.qualifierTies, it.qualifierLosses, it.qualifierMatchesPlayed) })
        room.advance(20000)
        assertEquals(4, room.state(spectator).roundHistory.size)
    }

    @Test
    fun higherLowerOnlyRevealsOpponentAnswersAfterViewerPassesQuestion() = Room().use { room ->
        room.join(); room.join(); room.readyStart()
        repeat(6) { room.play(null); room.send(room.host, "NEXT_ROUND") }
        room.startActive()
        val round = room.state().currentRound!!
        assertEquals("higher_lower", round.miniGame.id)
        val first = room.fighter(round.fighterIds[0]); val second = room.fighter(round.fighterIds[1])
        val spectator = room.peers.first { it.id !in round.fighterIds }
        val card = first.payload("ROOM_STATE")["currentRound"].asJsonObject["gameConfig"].asJsonObject["cards"].asJsonArray[0].asJsonObject
        assertFalse(card.has("challengerStat"))
        val fact = MiniGamesCatalog.STABLE_HIGHER_LOWER_BANK.first { it.baseItem == card["baseItem"].asString && it.challengerItem == card["challengerItem"].asString }
        val guess = mapOf("type" to "GUESS", "questionIndex" to 0, "guess" to if (fact.isHigher) "HIGHER" else "LOWER")
        room.action(first, guess)
        fun reveals(peer: Peer) = peer.payload("ROOM_STATE")["currentRound"].asJsonObject["gameState"].asJsonObject["reveals"].asJsonObject[first.id].asJsonObject
        assertTrue(reveals(first).has("0"))
        assertFalse(reveals(second).has("0"))
        assertFalse(reveals(spectator).has("0"))
        room.action(second, guess)
        assertTrue(reveals(second).has("0"))
        assertFalse(reveals(spectator).has("0"))
    }

    @Test
    fun quickDrawProtocolRejectsPreDrawTapAndAwardsOpponentOnce() = Room().use { room ->
        room.join(); room.join(); room.readyStart()
        repeat(8) { room.play(null); room.send(room.host, "NEXT_ROUND") }
        room.startActive()
        val round = room.state().currentRound!!
        assertEquals("quick_draw", round.miniGame.id)
        assertTrue(room.now < (round.gameConfig!!["drawAt"] as Number).toLong())
        room.action(room.fighter(round.fighterIds[0]), mapOf("type" to "DRAW_TAP"))
        val state = room.state()
        assertEquals(GamePhase.PAYOUT_RECAP, state.phase)
        assertEquals(round.fighterIds[1], state.currentRound!!.winnerId)
        assertEquals(1, state.tournamentSchedule!!.championshipWins[round.fighterIds[1]])
        room.action(room.fighter(round.fighterIds[0]), mapOf("type" to "DRAW_TAP"))
        assertEquals(9, room.state().roundHistory.size)
        assertEquals(1, room.state().tournamentSchedule!!.championshipWins[round.fighterIds[1]])
    }

    @Test
    fun serverReadinessAndBindFailureAreReportedToService() {
        var started = false
        var failure: Exception? = null
        val server = BrawlWebSocketServer("127.0.0.1", 0,
            onServerReady = { started = true }, onServerFailure = { failure = it })
        try {
            server.onStart()
            assertTrue(started)
            val expected = java.net.BindException("Port already in use")
            server.onError(null, expected)
            assertSame(expected, failure)
        } finally { server.stopServer() }
    }
}
