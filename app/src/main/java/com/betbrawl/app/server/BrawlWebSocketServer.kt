package com.betbrawl.app.server

import com.betbrawl.app.server.engine.GameActionResult
import com.betbrawl.app.server.engine.GameEngine
import com.betbrawl.app.server.engine.InternalGameState
import com.betbrawl.app.server.engine.OddsEngine
import com.betbrawl.app.server.engine.RoomEngine
import com.betbrawl.app.server.model.*
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.*
import org.java_websocket.WebSocket
import org.java_websocket.handshake.ClientHandshake
import org.java_websocket.server.WebSocketServer
import java.net.InetSocketAddress
import java.util.concurrent.ConcurrentHashMap

class BrawlWebSocketServer(
    val hostAddress: String = "0.0.0.0",
    val serverPort: Int = 8080,
    private val onRoomStateChanged: ((PublicRoomState) -> Unit)? = null
) : WebSocketServer(InetSocketAddress(hostAddress, serverPort)) {

    private val gson = Gson()
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    // Active room state
    var roomId: String = "room_main"
    var roomCode: String = ""
    var hostToken: String = ""
    var phase: GamePhase = GamePhase.ENTRY
    var debugMode: Boolean = false
    val players = ConcurrentHashMap<String, Player>() // sessionToken -> Player
    val clientSockets = ConcurrentHashMap<String, WebSocket>() // sessionToken -> WebSocket
    val socketToToken = ConcurrentHashMap<WebSocket, String>()

    var totalRounds: Int = 4
    var currentRound: RoundState? = null
    var internalGameState: InternalGameState? = null
    var tournamentSchedule: TournamentSchedule? = null
    val roundHistory = mutableListOf<RoundHistoryItem>()
    val awards = mutableListOf<Award>()

    private var phaseJob: Job? = null
    private var bettingIntervalJob: Job? = null
    private var gameTimeoutJob: Job? = null

    init {
        isReuseAddr = true
    }

    override fun onStart() {
        println("[BrawlServer] Authoritative WebSocket server started on $hostAddress:$serverPort")
    }

    override fun onOpen(conn: WebSocket?, handshake: ClientHandshake?) {
        // Connection opened, wait for CREATE_ROOM or JOIN_ROOM
    }

    override fun onClose(conn: WebSocket?, code: Int, reason: String?, remote: Boolean) {
        if (conn == null) return
        val token = socketToToken.remove(conn)
        if (token != null) {
            clientSockets.remove(token)
            val player = players[token]
            if (player != null) {
                player.connected = false
                broadcastRoomState()
            }
        }
    }

    override fun onError(conn: WebSocket?, ex: Exception?) {
        System.err.println("[BrawlServer] WebSocket error: ${ex?.message}")
    }

    override fun onMessage(conn: WebSocket?, message: String?) {
        if (conn == null || message == null) return
        try {
            val mapType = object : TypeToken<Map<String, Any?>>() {}.type
            val msgMap: Map<String, Any?> = gson.fromJson(message, mapType)
            val type = msgMap["type"] as? String ?: return
            val payload = msgMap["payload"] as? Map<String, Any?>

            when (type) {
                "CREATE_ROOM" -> handleCreateRoom(conn, payload)
                "JOIN_ROOM" -> handleJoinRoom(conn, payload)
                "TOGGLE_READY" -> handleToggleReady(conn)
                "START_GAME" -> handleStartGame(conn, payload)
                "PLACE_BET" -> handlePlaceBet(conn, payload)
                "FIGHTER_ACTION" -> handleFighterAction(conn, payload)
                "NEXT_ROUND" -> handleNextRound(conn)
                "RESTART_GAME" -> handleRestartGame(conn)
                "CLOSE_ROOM" -> handleCloseRoom(conn)
                "DEBUG_ADD_BOT" -> handleDebugAddBot(conn)
                "PING" -> handlePing(conn, payload)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun handleCreateRoom(conn: WebSocket, payload: Map<String, Any?>?) {
        val playerName = RoomEngine.sanitizePlayerName(payload?.get("playerName") as? String, isHost = true)
        val avatar = RoomEngine.sanitizePlayerAvatar(payload?.get("avatar") as? String)
        debugMode = (payload?.get("debugMode") as? Boolean) ?: false

        roomCode = RoomEngine.generateRoomCode()
        players.clear()
        clientSockets.clear()
        socketToToken.clear()
        roundHistory.clear()
        awards.clear()
        tournamentSchedule = null
        currentRound = null
        phase = GamePhase.LOBBY

        val hostPlayer = RoomEngine.createFreshPlayer(playerName, avatar, isHost = true)
        hostToken = hostPlayer.sessionToken
        players[hostToken] = hostPlayer
        clientSockets[hostToken] = conn
        socketToToken[conn] = hostToken

        // Send JOIN_SUCCESS to host
        sendToSocket(conn, "JOIN_SUCCESS", mapOf(
            "player" to hostPlayer.toPublicPlayer(),
            "sessionToken" to hostPlayer.sessionToken,
            "roomCode" to roomCode,
            "isHost" to true
        ))

        broadcastRoomState()
    }

    private fun handleJoinRoom(conn: WebSocket, payload: Map<String, Any?>?) {
        val targetCode = (payload?.get("roomCode") as? String)?.trim()?.uppercase() ?: ""
        val requestedToken = payload?.get("sessionToken") as? String
        val rawName = payload?.get("playerName") as? String
        val rawAvatar = payload?.get("avatar") as? String

        if (roomCode.isEmpty() || targetCode != roomCode) {
            sendToSocket(conn, "JOIN_ERROR", mapOf("code" to "ROOM_NOT_FOUND", "message" to "Room code not found."))
            return
        }

        // Check for session recovery
        var player = if (!requestedToken.isNullOrEmpty()) players[requestedToken] else null

        if (player != null) {
            // Reconnecting existing player
            player.connected = true
            socketToToken[conn] = player.sessionToken
            clientSockets[player.sessionToken] = conn
        } else {
            // New player joining
            if (players.size >= RoomEngine.MAX_PLAYERS_CAPACITY) {
                sendToSocket(conn, "JOIN_ERROR", mapOf("code" to "ROOM_FULL", "message" to "Room is full (max 9 players)."))
                return
            }
            val name = RoomEngine.sanitizePlayerName(rawName, isHost = false)
            val avatar = RoomEngine.sanitizePlayerAvatar(rawAvatar)
            player = RoomEngine.createFreshPlayer(name, avatar, isHost = false)
            players[player.sessionToken] = player
            clientSockets[player.sessionToken] = conn
            socketToToken[conn] = player.sessionToken
        }

        sendToSocket(conn, "JOIN_SUCCESS", mapOf(
            "player" to player.toPublicPlayer(),
            "sessionToken" to player.sessionToken,
            "roomCode" to roomCode,
            "isHost" to player.isHost
        ))

        broadcastRoomState()
    }

    private fun handleToggleReady(conn: WebSocket) {
        val token = socketToToken[conn] ?: return
        val player = players[token] ?: return
        player.isReady = !player.isReady
        broadcastRoomState()
    }

    private fun handleStartGame(conn: WebSocket, payload: Map<String, Any?>?) {
        val token = socketToToken[conn] ?: return
        val player = players[token] ?: return
        if (!player.isHost) return

        val isDebug = (payload?.get("debug") as? Boolean) ?: debugMode
        val connectedCount = players.values.count { it.connected }

        if (!isDebug && connectedCount < RoomEngine.MIN_PLAYERS_TO_START) {
            return
        }

        val allReady = players.values.filter { it.connected }.all { it.isReady || it.isHost }
        if (!isDebug && !allReady) {
            return
        }

        val schedule = RoomEngine.generateTournamentSchedule(players.values.toList())
        tournamentSchedule = schedule
        totalRounds = schedule.matches.size

        transitionToNextTournamentMatch()
    }

    fun transitionToNextTournamentMatch() {
        val schedule = tournamentSchedule ?: return
        clearAllTimers()

        if (schedule.stage == TournamentStage.QUALIFIERS) {
            val nextMatch = schedule.matches.firstOrNull { !it.completed }
            if (nextMatch != null) {
                initMatchRound(nextMatch, isChampionship = false)
            } else {
                // Qualifiers complete! Transition to Championship
                schedule.stage = TournamentStage.CHAMPIONSHIP
                val ranked = RoomEngine.computeTournamentRankings(
                    players.values.toList(),
                    schedule.matches.filter { !it.isChampionship },
                    schedule.stableRosterOrder
                )
                val finalists = listOf(ranked[0].id, ranked[1].id)
                schedule.finalists = finalists
                schedule.thirdPlaceId = ranked[2].id

                // Start Championship Series Game 1
                schedule.championshipGamesPlayed = 1
                val champMatch = TournamentMatch(
                    matchIndex = schedule.matches.size,
                    roundNumber = schedule.matches.size + 1,
                    fighterIds = finalists,
                    isChampionship = true,
                    championshipGameNumber = 1
                )
                schedule.matches.add(champMatch)
                initMatchRound(champMatch, isChampionship = true)
            }
        } else if (schedule.stage == TournamentStage.CHAMPIONSHIP) {
            // Check if someone reached 2 decisive wins
            val winsA = schedule.championshipWins.getOrDefault(schedule.finalists!![0], 0)
            val winsB = schedule.championshipWins.getOrDefault(schedule.finalists!![1], 0)

            if (winsA >= 2 || winsB >= 2) {
                // Championship Series Complete!
                schedule.stage = TournamentStage.COMPLETE
                val champId = if (winsA >= 2) schedule.finalists!![0] else schedule.finalists!![1]
                val runnerUpId = if (winsA >= 2) schedule.finalists!![1] else schedule.finalists!![0]
                schedule.championId = champId
                schedule.runnerUpId = runnerUpId

                transitionToFinalPodium()
            } else {
                // Continue Championship series (First to 2 wins)
                schedule.championshipGamesPlayed += 1
                val nextChampGame = schedule.championshipGamesPlayed
                val champMatch = TournamentMatch(
                    matchIndex = schedule.matches.size,
                    roundNumber = schedule.matches.size + 1,
                    fighterIds = schedule.finalists!!,
                    isChampionship = true,
                    championshipGameNumber = nextChampGame
                )
                schedule.matches.add(champMatch)
                initMatchRound(champMatch, isChampionship = true)
            }
        }
    }

    private fun initMatchRound(match: TournamentMatch, isChampionship: Boolean) {
        val f1 = players.values.find { it.id == match.fighterIds[0] }!!
        val f2 = players.values.find { it.id == match.fighterIds[1] }!!

        val miniGameId = RoomEngine.selectMiniGame(
            match.matchIndex,
            currentRound?.miniGame?.id,
            isChampionship,
            match.championshipGameNumber ?: 1
        )
        val miniGame = MiniGamesCatalog.MINI_GAMES[miniGameId]!!
        val odds = OddsEngine.calculateDynamicOdds(f1, f2)
        val matchPot = if (isChampionship) 500 else 250

        val now = System.currentTimeMillis()
        val revealEndsAt = now + 4500L
        val bettingEndsAt = revealEndsAt + 15000L
        val gameStartsAt = bettingEndsAt + 3500L
        val gameEndsAt = gameStartsAt + (miniGame.durationSeconds * 1000L)

        val (internal, publicConfig) = GameEngine.initMiniGameServerState(miniGameId, match.fighterIds, gameStartsAt)
        internalGameState = internal

        val round = RoundState(
            roundNumber = match.roundNumber,
            maxRounds = totalRounds,
            stage = tournamentSchedule?.stage ?: TournamentStage.QUALIFIERS,
            qualifierIndex = if (!isChampionship) match.matchIndex + 1 else null,
            qualifierTotal = if (!isChampionship) tournamentSchedule?.qualifierCount else null,
            championshipGameNumber = match.championshipGameNumber,
            miniGame = miniGame,
            fighterIds = match.fighterIds,
            matchPot = matchPot,
            odds = odds,
            bettingTimeRemaining = 15,
            gameTimeRemaining = miniGame.durationSeconds,
            isChampionship = isChampionship,
            revealEndsAt = revealEndsAt,
            bettingEndsAt = bettingEndsAt,
            gameStartsAt = gameStartsAt,
            gameEndsAt = gameEndsAt,
            gameConfig = publicConfig
        )
        currentRound = round
        phase = GamePhase.FIGHTER_REVEAL
        broadcastRoomState()

        // Schedule transition to BETTING_WINDOW
        phaseJob = scope.launch {
            delay(4500L)
            transitionToBettingWindow()
        }
    }

    private fun transitionToBettingWindow() {
        val round = currentRound ?: return
        phase = GamePhase.BETTING_WINDOW
        round.bettingTimeRemaining = 15
        broadcastRoomState()

        // 1-second countdown interval
        bettingIntervalJob = scope.launch {
            for (sec in 14 downTo 0) {
                delay(1000L)
                round.bettingTimeRemaining = sec
                broadcastRoomState()
            }
            transitionToCountdown()
        }
    }

    private fun transitionToCountdown() {
        bettingIntervalJob?.cancel()
        phase = GamePhase.MINIGAME_COUNTDOWN
        broadcastRoomState()

        phaseJob = scope.launch {
            delay(3500L)
            transitionToMiniGameActive()
        }
    }

    private fun transitionToMiniGameActive() {
        val round = currentRound ?: return
        val internal = internalGameState ?: return
        phase = GamePhase.MINIGAME_ACTIVE
        broadcastRoomState()

        // Game timeout handler
        val durMs = round.miniGame.durationSeconds * 1000L
        gameTimeoutJob = scope.launch {
            delay(durMs)
            val (timeoutWinner, isTie) = GameEngine.resolveGameTimeout(internal, round.fighterScores)
            resolveRoundOutcome(timeoutWinner, isTie)
        }
    }

    private fun handlePlaceBet(conn: WebSocket, payload: Map<String, Any?>?) {
        val token = socketToToken[conn] ?: return
        val player = players[token] ?: return
        val fighterId = payload?.get("fighterId") as? String ?: return
        val amount = (payload["amount"] as? Number)?.toInt() ?: return
        val round = currentRound

        val error = OddsEngine.validateBetPlacement(player, fighterId, amount, round, phase)
        if (error != null) {
            sendToSocket(conn, "BET_REJECTED", mapOf("reason" to error))
            return
        }

        player.coins -= amount
        player.totalBetsPlaced += 1
        if (amount > player.highestSingleBet) {
            player.highestSingleBet = amount
        }

        val oddsAtBet = round!!.odds[fighterId]?.decimalOdds ?: 2.0
        val potentialReturn = (amount * oddsAtBet).toInt()
        val bet = SecretBet(
            bettorId = player.id,
            fighterId = fighterId,
            amount = amount,
            oddsAtBet = oddsAtBet,
            timestamp = System.currentTimeMillis(),
            potentialReturn = potentialReturn
        )
        round.bets.add(bet)

        // Recalculate dynamic odds with live pool
        val fA = players.values.find { it.id == round.fighterIds[0] }!!
        val fB = players.values.find { it.id == round.fighterIds[1] }!!
        round.odds = OddsEngine.calculateDynamicOdds(fA, fB, round.bets)

        sendToSocket(conn, "BET_ACCEPTED", mapOf(
            "bet" to bet,
            "myBankroll" to player.coins
        ))

        broadcastRoomState()
    }

    private fun handleFighterAction(conn: WebSocket, payload: Map<String, Any?>?) {
        val token = socketToToken[conn] ?: return
        val player = players[token] ?: return
        val round = currentRound ?: return
        val internal = internalGameState ?: return

        if (phase != GamePhase.MINIGAME_ACTIVE) return
        if (player.id !in round.fighterIds) return
        if (payload == null) return

        val result: GameActionResult = GameEngine.processFighterAction(
            internal,
            player.id,
            payload,
            round.fighterScores,
            System.currentTimeMillis()
        )

        if (result.actionFeedback != null) {
            sendToSocket(conn, "ACTION_RESULT", result.actionFeedback)
        }

        if (result.resolved) {
            gameTimeoutJob?.cancel()
            resolveRoundOutcome(result.winnerId, result.isTie)
        } else {
            broadcastRoomState()
        }
    }

    fun resolveRoundOutcome(winnerId: String?, isTie: Boolean) {
        val round = currentRound ?: return
        val schedule = tournamentSchedule ?: return
        clearAllTimers()

        round.winnerId = winnerId
        round.tieResult = isTie
        round.resolutionReason = if (isTie) RoundResolutionReason.TIE else RoundResolutionReason.PLAYED

        val currentMatch = schedule.matches.firstOrNull { it.roundNumber == round.roundNumber }
        if (currentMatch != null) {
            currentMatch.completed = true
            currentMatch.winnerId = winnerId
            currentMatch.tieResult = isTie
            currentMatch.resolutionReason = round.resolutionReason
        }

        // Update match and win stats
        val [f1Id, f2Id] = round.fighterIds.let { Pair(it[0], it[1]) }
        val f1 = players.values.find { it.id == f1Id }
        val f2 = players.values.find { it.id == f2Id }

        f1?.matchesPlayed = (f1?.matchesPlayed ?: 0) + 1
        f2?.matchesPlayed = (f2?.matchesPlayed ?: 0) + 1

        if (round.isChampionship) {
            // Championship decisive win check
            if (!isTie && winnerId != null) {
                schedule.championshipWins[winnerId] = schedule.championshipWins.getOrDefault(winnerId, 0) + 1
                val winPlayer = players.values.find { it.id == winnerId }
                winPlayer?.matchesWon = (winPlayer?.matchesWon ?: 0) + 1
            }
        } else {
            // Qualifier stats and brawl points
            schedule.qualifiersCompleted += 1
            f1?.qualifierMatchesPlayed = (f1?.qualifierMatchesPlayed ?: 0) + 1
            f2?.qualifierMatchesPlayed = (f2?.qualifierMatchesPlayed ?: 0) + 1

            if (isTie) {
                f1?.qualifierTies = (f1?.qualifierTies ?: 0) + 1
                f2?.qualifierTies = (f2?.qualifierTies ?: 0) + 1
                f1?.qualifierPoints = (f1?.qualifierPoints ?: 0) + 1
                f2?.qualifierPoints = (f2?.qualifierPoints ?: 0) + 1
            } else if (winnerId != null) {
                val loserId = if (winnerId == f1Id) f2Id else f1Id
                val winP = players.values.find { it.id == winnerId }
                val loseP = players.values.find { it.id == loserId }

                winP?.matchesWon = (winP?.matchesWon ?: 0) + 1
                winP?.qualifierWins = (winP?.qualifierWins ?: 0) + 1
                winP?.qualifierPoints = (winP?.qualifierPoints ?: 0) + 3

                loseP?.qualifierLosses = (loseP?.qualifierLosses ?: 0) + 1
            }
        }

        // Compute authoritative payouts
        round.payouts = OddsEngine.computeRoundPayouts(
            round,
            players.values.toList(),
            winnerId,
            isTie,
            round.resolutionReason
        )

        // Record round history
        roundHistory.add(
            RoundHistoryItem(
                roundNumber = round.roundNumber,
                miniGameName = round.miniGame.name,
                winnerName = if (isTie) "TIE" else (players.values.find { it.id == winnerId }?.name ?: "Unknown"),
                totalPotWon = round.matchPot,
                isChampionship = round.isChampionship,
                championshipGameNumber = round.championshipGameNumber,
                resolutionReason = round.resolutionReason
            )
        )

        phase = GamePhase.PAYOUT_RECAP
        broadcastRoomState()
    }

    private fun handleNextRound(conn: WebSocket) {
        val token = socketToToken[conn] ?: return
        val player = players[token] ?: return
        if (!player.isHost) return
        if (phase != GamePhase.PAYOUT_RECAP) return

        transitionToNextTournamentMatch()
    }

    private fun transitionToFinalPodium() {
        val schedule = tournamentSchedule ?: return
        clearAllTimers()
        phase = GamePhase.FINAL_PODIUM

        // Calculate genuine session awards
        awards.clear()
        awards.addAll(RoomEngine.computeSessionAwards(players.values.toList(), roundHistory, schedule.championId))

        broadcastRoomState()
    }

    private fun handleRestartGame(conn: WebSocket) {
        val token = socketToToken[conn] ?: return
        val player = players[token] ?: return
        if (!player.isHost) return

        clearAllTimers()
        roundHistory.clear()
        awards.clear()
        tournamentSchedule = null
        currentRound = null
        phase = GamePhase.LOBBY

        // Reset all player session counters
        for (p in players.values) {
            p.isReady = false
            p.coins = 1000
            p.matchesWon = 0
            p.matchesPlayed = 0
            p.totalBetsPlaced = 0
            p.totalBetsWon = 0
            p.totalCoinsWonInBets = 0
            p.totalCoinsLostInBets = 0
            p.highestSingleBet = 0
            p.highestSinglePayout = 0
            p.qualifierPoints = 0
            p.qualifierWins = 0
            p.qualifierTies = 0
            p.qualifierLosses = 0
            p.qualifierMatchesPlayed = 0
            p.tournamentRank = null
        }

        broadcastRoomState()
    }

    private fun handleCloseRoom(conn: WebSocket) {
        val token = socketToToken[conn] ?: return
        val player = players[token] ?: return
        if (!player.isHost) return

        clearAllTimers()
        for (ws in clientSockets.values) {
            sendToSocket(ws, "ROOM_CLOSED", mapOf("reason" to "The host closed the room."))
            ws.close()
        }
        players.clear()
        clientSockets.clear()
        socketToToken.clear()
        phase = GamePhase.ENTRY
    }

    private fun handleDebugAddBot(conn: WebSocket) {
        if (!debugMode && players.size >= RoomEngine.MIN_PLAYERS_TO_START) return
        val botNum = players.size + 1
        val botName = "Bot $botNum"
        val botAvatar = listOf("🤖", "🦾", "👾", "🎯").random()
        val bot = RoomEngine.createFreshPlayer(botName, botAvatar, isHost = false).apply {
            isBot = true
            isReady = true
        }
        players[bot.sessionToken] = bot
        broadcastRoomState()
    }

    private fun handlePing(conn: WebSocket, payload: Map<String, Any?>?) {
        val clientSentAt = (payload?.get("clientSentAt") as? Number)?.toLong()
        sendToSocket(conn, "PONG", mapOf(
            "clientSentAt" to clientSentAt,
            "serverNow" to System.currentTimeMillis()
        ))
    }

    fun broadcastRoomState() {
        val publicPlayers = players.values.map { it.toPublicPlayer() }
        val roomState = PublicRoomState(
            roomId = roomId,
            roomCode = roomCode,
            phase = phase,
            players = publicPlayers,
            totalRounds = totalRounds,
            currentRound = currentRound,
            tournamentSchedule = tournamentSchedule,
            roundHistory = roundHistory,
            awards = awards,
            debugMode = debugMode
        )

        val json = gson.toJson(mapOf(
            "type" to "ROOM_STATE",
            "timestamp" to System.currentTimeMillis(),
            "payload" to roomState
        ))

        for (ws in clientSockets.values) {
            if (ws.isOpen) {
                ws.send(json)
            }
        }

        onRoomStateChanged?.invoke(roomState)
    }

    private fun sendToSocket(conn: WebSocket, type: String, payload: Any) {
        if (!conn.isOpen) return
        val json = gson.toJson(mapOf(
            "type" to type,
            "timestamp" to System.currentTimeMillis(),
            "payload" to payload
        ))
        conn.send(json)
    }

    private fun clearAllTimers() {
        phaseJob?.cancel()
        phaseJob = null
        bettingIntervalJob?.cancel()
        bettingIntervalJob = null
        gameTimeoutJob?.cancel()
        gameTimeoutJob = null
    }

    fun stopServer() {
        clearAllTimers()
        scope.cancel()
        try {
            stop(1000)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
