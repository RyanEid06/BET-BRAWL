package com.betbrawl.app

import com.betbrawl.app.server.BrawlWebSocketServer
import com.betbrawl.app.server.engine.RoomEngine
import com.betbrawl.app.server.engine.V2Games
import com.betbrawl.app.server.model.*
import com.google.gson.GsonBuilder
import com.google.gson.Gson
import com.google.gson.JsonObject
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import org.java_websocket.WebSocket
import org.junit.Assert.*
import org.junit.Test
import java.lang.reflect.Proxy

@OptIn(ExperimentalCoroutinesApi::class)
class V2ServerProtocolTest {
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
                else -> null
            }
        } as WebSocket
        fun payload(type: String) = messages.last { it["type"].asString == type }["payload"].asJsonObject
        val id get() = payload("JOIN_SUCCESS")["player"].asJsonObject["id"].asString
        val token get() = payload("JOIN_SUCCESS")["sessionToken"].asString
    }
    private class Room(game: String = "memory_heist", debug: Boolean = false) : AutoCloseable {
        val gson = GsonBuilder().serializeNulls().create()
        val scheduler = TestCoroutineScheduler()
        var clockOffset = 0L
        val now get() = 1_000_000L + scheduler.currentTime + clockOffset
        val server = BrawlWebSocketServer("127.0.0.1", 0, dispatcher = StandardTestDispatcher(scheduler), nowMs = { now }, testGameSequence = listOf(game))
        val host = Peer()
        val peers = mutableListOf(host)
        init { send(host, "CREATE_ROOM", mapOf("playerName" to "Host", "debugMode" to debug)) }
        fun send(peer: Peer, type: String, payload: Map<String, Any?> = emptyMap(), version: Any? = 2) {
            val input = if (type == "CREATE_ROOM" || type == "JOIN_ROOM") payload + ("protocolVersion" to version) else payload
            server.onMessage(peer.socket, gson.toJson(mapOf("type" to type, "payload" to input)))
            scheduler.runCurrent()
        }
        fun join() = Peer().also { send(it, "JOIN_ROOM", mapOf("roomCode" to server.roomCode, "playerName" to "Guest${peers.size}")); peers.add(it) }
        fun recover(peer: Peer) = Peer().also { send(it, "JOIN_ROOM", mapOf("roomCode" to server.roomCode, "sessionToken" to peer.token)); peers[peers.indexOf(peer)] = it }
        fun readyStart() { peers.drop(1).forEach { send(it, "TOGGLE_READY") }; send(host, "START_GAME") }
        fun advance(ms: Long) { scheduler.advanceTimeBy(ms); scheduler.runCurrent() }
        fun until(deadline: Long) = advance((deadline - now).coerceAtLeast(0))
        fun active() { until(server.currentRound!!.gameStartsAt); assertEquals(GamePhase.MINIGAME_ACTIVE, server.phase) }
        fun round(peer: Peer = host) = peer.payload("ROOM_STATE")["currentRound"].asJsonObject
        fun action(peer: Peer, action: Map<String, Any?>, actionId: String = "action1", stage: Int = round(peer)["gameState"].asJsonObject["stageIndex"].asInt, match: String = server.currentRound!!.matchId) =
            send(peer, "FIGHTER_ACTION", action + mapOf("matchId" to match, "stageIndex" to stage, "actionId" to actionId))
        override fun close() { server.stopServer() }
    }

    @Test fun incompatibleClientsCannotCreateOrJoinASeat() {
        val server = BrawlWebSocketServer("127.0.0.1", 0)
        try {
            for (version in listOf(null, 1, 2.5, "2")) {
                val peer = Peer()
                server.onMessage(peer.socket, Gson().toJson(mapOf("type" to "CREATE_ROOM", "payload" to mapOf("protocolVersion" to version))))
                assertTrue("Old clients must receive an update error", peer.messages.any { it["type"].asString == "JOIN_ERROR" && it["payload"].asJsonObject["code"].asString == "CLIENT_UPDATE_REQUIRED" })
                assertTrue(server.players.isEmpty())
            }
            val peer = Peer()
            server.onMessage(peer.socket, """{"type":"CREATE_ROOM","payload":{"protocolVersion":2}}""")
            assertEquals(1, server.players.size)
            assertEquals(2, peer.payload("JOIN_SUCCESS")["protocolVersion"].asInt)
            val old = Peer()
            server.onMessage(old.socket, Gson().toJson(mapOf("type" to "JOIN_ROOM", "payload" to mapOf("roomCode" to server.roomCode))))
            assertEquals(1, server.players.size)
            assertEquals("CLIENT_UPDATE_REQUIRED", old.payload("JOIN_ERROR")["code"].asString)
        } finally { server.stopServer() }
    }

    @Test fun hostServiceTrailingStateCallbackKeepsItsConstructorContract() {
        var observed: PublicRoomState? = null
        val server = BrawlWebSocketServer("127.0.0.1", 0, onServerReady = {}) { state -> observed = state }
        try {
            server.broadcastRoomState()
            assertEquals(GamePhase.ENTRY, observed!!.phase)
        } finally { server.stopServer() }
    }

    @Test fun catalogAndShuffleBagContainAllFourteenWithoutRefillRepeat() {
        assertEquals(14, MiniGamesCatalog.MINI_GAMES.size)
        assertEquals(24, MiniGamesCatalog.MINI_GAMES["memory_heist"]!!.durationSeconds)
        assertEquals(30, MiniGamesCatalog.MINI_GAMES["pocket_territory"]!!.durationSeconds)
        val bag = mutableListOf<String>()
        val first = List(14) { RoomEngine.drawMiniGame(bag) }
        assertEquals(RoomEngine.MINI_GAME_ROTATION.toSet(), first.toSet())
        assertTrue(bag.isEmpty())
        assertNotEquals(first.last(), RoomEngine.drawMiniGame(bag, first.last()))
        assertEquals(13, bag.size)
    }

    @Test fun memoryProjectionAndReconnectHideAnswerDraftAndDerivedScores() = Room().use { room ->
        room.join(); room.join(); room.readyStart()
        assertFalse(room.round()["gameConfig"].asJsonObject.has("board"))
        room.active()
        val fighters = room.server.currentRound!!.fighterIds
        var owner = room.peers.first { it.id == fighters[0] }
        val spectator = room.peers.first { it.id !in fighters }
        val answer = room.gson.fromJson(room.round(owner)["gameConfig"].asJsonObject["board"], List::class.java)
        room.until(room.server.currentRound!!.gameStartsAt + 4000)
        assertFalse(room.round(owner)["gameConfig"].asJsonObject.has("board"))
        room.action(owner, mapOf("type" to "MEMORY_DRAFT", "board" to answer, "lock" to false))
        assertTrue(owner.payload("GAME_ACTION_RESULT")["accepted"].asBoolean)
        room.peers.filter { it !== owner }.forEach { peer ->
            val round = room.round(peer)
            assertFalse(round["gameState"].asJsonObject.has("recap"))
            assertFalse(round.toString().contains("answer"))
            assertTrue(round["fighterScores"].asJsonObject.entrySet().all { it.value.asInt == 0 })
            if (peer === spectator) assertFalse(round["gameState"].asJsonObject.has("mine"))
        }
        owner = room.recover(owner)
        assertFalse(room.round(owner)["gameConfig"].asJsonObject.has("board"))
        assertEquals(room.gson.toJsonTree(answer), room.round(owner)["gameState"].asJsonObject["mine"].asJsonObject["board"])
        room.action(spectator, mapOf("type" to "MEMORY_DRAFT", "board" to answer, "lock" to true))
        assertFalse(spectator.payload("GAME_ACTION_RESULT")["accepted"].asBoolean)
        room.action(owner, mapOf("type" to "MEMORY_DRAFT", "board" to answer, "lock" to true), "lock", match = "old-match")
        assertFalse(owner.payload("GAME_ACTION_RESULT")["accepted"].asBoolean)
        room.until(room.server.currentRound!!.gameEndsAt)
        assertEquals(GamePhase.PAYOUT_RECAP, room.server.phase)
        assertEquals(6, room.server.currentRound!!.fighterScores[owner.id]!!.toInt())
        assertTrue(room.round(owner)["gameState"].asJsonObject.has("recap"))
    }

    @Test fun stageCatchUpRejectsStaleInputAndDeduplicatesAcceptedActions() = Room("split_decision").use { room ->
        room.join(); room.join(); room.readyStart(); room.active()
        val owner = room.peers.first { it.id == room.server.currentRound!!.fighterIds[0] }
        room.clockOffset = 5000 // Deliberately service action before delayed coroutine phase timer.
        room.action(owner, mapOf("type" to "DUEL_COMMIT", "choice" to "ATTACK"), stage = 0)
        assertFalse(owner.payload("GAME_ACTION_RESULT")["accepted"].asBoolean)
        assertEquals(1, room.round(owner)["gameState"].asJsonObject["stageIndex"].asInt)
        room.action(owner, mapOf("type" to "DUEL_COMMIT", "choice" to "ATTACK"), "accepted")
        assertTrue(owner.payload("GAME_ACTION_RESULT")["accepted"].asBoolean)
        val locked = room.round(owner)["gameState"].asJsonObject["mine"].deepCopy()
        room.action(owner, mapOf("type" to "DUEL_COMMIT", "choice" to "GUARD"), "accepted")
        assertTrue(owner.payload("GAME_ACTION_RESULT")["accepted"].asBoolean)
        assertEquals(locked, room.round(owner)["gameState"].asJsonObject["mine"])
        room.action(owner, mapOf("type" to "DUEL_COMMIT", "choice" to "CHARGE"), "new-id")
        assertFalse(owner.payload("GAME_ACTION_RESULT")["accepted"].asBoolean)
        room.until(room.server.currentRound!!.gameEndsAt)
        assertEquals(GamePhase.PAYOUT_RECAP, room.server.phase)
        assertEquals(1, room.server.roundHistory.size)
        room.advance(30000)
        assertEquals(1, room.server.roundHistory.size)
    }

    @Test fun everyV2RoundUsesAbsoluteDeadlinesAndSettlesOnceAfterDelayedLaunch() {
        for (game in V2Games.ids) Room(game).use { room ->
            room.join(); room.join(); room.readyStart()
            val originalStart = room.server.currentRound!!.gameStartsAt
            val originalEnd = room.server.currentRound!!.gameEndsAt
            room.clockOffset = originalEnd - room.now + 1000
            room.advance(4500)
            assertEquals(originalStart, room.server.currentRound!!.gameStartsAt)
            assertEquals(originalEnd, room.server.currentRound!!.gameEndsAt)
            assertEquals(game, GamePhase.PAYOUT_RECAP, room.server.phase)
            assertEquals(1, room.server.roundHistory.size)
            room.advance(60000)
            assertEquals(1, room.server.roundHistory.size)
        }
    }

    @Test fun allEightGamesKeepPrivateActionsPrivateAndDedupAcrossReconnect() {
        for (game in V2Games.ids) Room(game).use { room ->
            room.join(); room.join(); room.readyStart(); room.active()
            val fighters = room.server.currentRound!!.fighterIds
            var owner = room.peers.first { it.id == fighters[0] }
            val opponent = room.peers.first { it.id == fighters[1] }
            val spectator = room.peers.first { it.id !in fighters }
            if (game == "memory_heist") room.until(room.server.currentRound!!.gameStartsAt + 4000)
            if (game == "crowd_count") room.until(room.server.currentRound!!.gameStartsAt + 2000)
            val state = room.server.internalGameState!!.v2!!
            val action = V2Games.botAction(V2Games.project(state, owner.id, room.now))!!
            room.action(owner, action, "once")
            assertTrue(game, owner.payload("GAME_ACTION_RESULT")["accepted"].asBoolean)
            val mine = room.round(owner)["gameState"].asJsonObject["mine"].deepCopy()
            val otherMine = room.round(opponent)["gameState"].asJsonObject["mine"].asJsonObject
            if (otherMine.has("locked")) assertFalse(game, otherMine["locked"].asBoolean)
            assertFalse(game, otherMine.has("commit"))
            if (game == "safecracker") assertEquals(0, otherMine["history"].asJsonArray.size())
            if (game == "circuit_sprint") assertEquals(0, otherMine["moves"].asInt)
            for (peer in room.peers) {
                val round = room.round(peer)
                val config = round["gameConfig"].asJsonObject
                val public = round["gameState"].asJsonObject
                for (key in listOf("secret", "answer", "solutionRotations", "recap", "data")) {
                    assertFalse("$game/$key", config.has(key))
                    assertFalse("$game/$key", public.has(key))
                }
            }
            assertFalse(game, room.round(spectator)["gameState"].asJsonObject.has("mine"))
            room.action(owner, action, "once")
            assertTrue(game, owner.payload("GAME_ACTION_RESULT")["accepted"].asBoolean)
            assertEquals(game, mine, room.round(owner)["gameState"].asJsonObject["mine"])
            owner = room.recover(owner)
            assertEquals(game, mine, room.round(owner)["gameState"].asJsonObject["mine"])
            room.action(owner, action, "once")
            assertTrue(game, owner.payload("GAME_ACTION_RESULT")["accepted"].asBoolean)
            assertEquals(game, mine, room.round(owner)["gameState"].asJsonObject["mine"])
        }
    }

    @Test fun independentLocksResolveOnceAndFreshTournamentResetsBagAndIdentity() = Room().use { room ->
        room.join(); room.join(); room.readyStart(); room.active()
        val tournament = room.server.tournamentId
        val firstMatch = room.server.currentRound!!.matchId
        assertNotNull(tournament)
        room.until(room.server.currentRound!!.gameStartsAt + 4000)
        val fighters = room.server.currentRound!!.fighterIds.map { id -> room.peers.first { it.id == id } }
        for (peer in fighters) room.action(peer, mapOf("type" to "MEMORY_DRAFT", "board" to List<Any?>(9) { null }, "lock" to true))
        assertEquals(GamePhase.PAYOUT_RECAP, room.server.phase)
        assertEquals(1, room.server.roundHistory.size)
        room.send(room.host, "NEXT_ROUND")
        assertNotEquals(firstMatch, room.server.currentRound!!.matchId)
        assertEquals(tournament, room.server.tournamentId)
        val bag = room.server.javaClass.getDeclaredField("gameBag").apply { isAccessible = true }
        assertEquals(12, (bag.get(room.server) as List<*>).size)
        // Complete remaining matches through the existing tournament transition, keeping this test scoped to reset.
        room.server.tournamentSchedule!!.stage = TournamentStage.COMPLETE
        room.server.javaClass.getDeclaredField("phase").apply { isAccessible = true }.set(room.server, GamePhase.FINAL_PODIUM)
        room.send(room.host, "RESTART_GAME")
        assertNull(room.server.tournamentId)
        assertTrue((bag.get(room.server) as List<*>).isEmpty())
        room.readyStart()
        assertNotEquals(tournament, room.server.tournamentId)
        assertEquals(13, (bag.get(room.server) as List<*>).size)
    }

    @Test fun territoryPassRemainsExplicitNullInSerializedOwnerSnapshot() = Room("pocket_territory").use { room ->
        room.join(); room.join(); room.readyStart(); room.active()
        val owner = room.peers.first { it.id == room.server.currentRound!!.fighterIds[0] }
        room.action(owner, mapOf("type" to "TERRITORY_COMMIT", "cell" to null))
        assertTrue(owner.payload("GAME_ACTION_RESULT")["accepted"].asBoolean)
        val mine = room.round(owner)["gameState"].asJsonObject["mine"].asJsonObject
        assertTrue("A committed Pass must retain its null value over the wire", mine.has("commit"))
        assertTrue(mine["commit"].isJsonNull)
    }

    @Test fun v2BotsSubmitOnlyDuringTheirOwnerActionPhase() = Room("treasure_tug", true).use { room ->
        room.join(); room.join()
        room.peers.drop(1).forEach { peer -> room.server.players[peer.token]!!.isBot = true }
        room.readyStart(); room.active()
        room.advance(500)
        room.peers.filter { it.id in room.server.currentRound!!.fighterIds && it !== room.host }.forEach { peer ->
            assertTrue(room.round(peer)["gameState"].asJsonObject["mine"].asJsonObject["locked"].asBoolean)
        }
        room.until(room.server.currentRound!!.gameEndsAt)
        assertEquals(GamePhase.PAYOUT_RECAP, room.server.phase)
    }
}
