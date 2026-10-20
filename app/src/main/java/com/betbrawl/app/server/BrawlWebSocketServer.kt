package com.betbrawl.app.server

import com.betbrawl.app.server.engine.GameEngine
import com.betbrawl.app.server.engine.InternalGameState
import com.betbrawl.app.server.engine.OddsEngine
import com.betbrawl.app.server.engine.RoomEngine
import com.betbrawl.app.server.model.*
import com.google.gson.Gson
import kotlinx.coroutines.*
import org.java_websocket.WebSocket
import org.java_websocket.handshake.ClientHandshake
import org.java_websocket.server.WebSocketServer
import java.net.InetSocketAddress
import java.util.concurrent.ConcurrentHashMap

data class ServerTiming(
    val revealMs: Long = 4500L,
    val bettingMs: Long = 15000L,
    val countdownMs: Long = 3500L,
    val fighterGraceMs: Long = 5000L,
    val hostGraceMs: Long = 60000L,
    val staleSeatMs: Long = 60000L
)

class BrawlWebSocketServer(
    host: String = "0.0.0.0",
    val serverPort: Int = 8080,
    private val timing: ServerTiming = ServerTiming(),
    dispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val nowMs: () -> Long = System::currentTimeMillis,
    private val onServerReady: (() -> Unit)? = null,
    private val onServerFailure: ((Exception) -> Unit)? = null,
    private val onRoomStateChanged: ((PublicRoomState) -> Unit)? = null
) : WebSocketServer(InetSocketAddress(host, serverPort)) {

    private val gson = Gson()
    private val scope = CoroutineScope(dispatcher + SupervisorJob())

    // Round countdown & game loop jobs
    private var revealTimerJob: Job? = null
    private var bettingTimerJob: Job? = null
    private var countdownTimerJob: Job? = null
    private var minigameTimerJob: Job? = null

    // Grace timers
    private val fighterGraceTimers = ConcurrentHashMap<String, Job>()
    private var hostGraceTimerJob: Job? = null
    private val staleSeatTimers = ConcurrentHashMap<String, Job>()
    private val activeBrawlPhases = setOf(GamePhase.FIGHTER_REVEAL, GamePhase.BETTING_WINDOW,
        GamePhase.MINIGAME_COUNTDOWN, GamePhase.MINIGAME_ACTIVE)

    var roomId: String = ""
        private set
    var roomCode: String = ""
        private set
    var hostToken: String = ""
        private set
    var phase: GamePhase = GamePhase.ENTRY
        private set
    var debugMode: Boolean = false
        private set

    val players = ConcurrentHashMap<String, Player>() // sessionToken -> Player
    val clientSockets = ConcurrentHashMap<String, WebSocket>() // sessionToken -> WebSocket
    val socketToToken = ConcurrentHashMap<WebSocket, String>() // WebSocket -> sessionToken

    var totalRounds: Int = 4
        private set
    var currentRound: RoundState? = null
        private set
    var internalGameState: InternalGameState? = null
        private set
    var tournamentSchedule: TournamentSchedule? = null
        private set
    val roundHistory = mutableListOf<RoundHistoryItem>()
    val awards = mutableListOf<Award>()

    override fun onStart() {
        println("[BrawlServer] WebSocket server started on port $serverPort")
        onServerReady?.invoke()
    }

    override fun onOpen(conn: WebSocket, handshake: ClientHandshake) {
        // Connected socket
    }

    @Synchronized
    override fun onClose(conn: WebSocket, code: Int, reason: String, remote: Boolean) {
        val token = socketToToken.remove(conn) ?: return

        // STALE SOCKET PROTECTION:
        // If this closing socket is NOT the currently registered socket for token, ignore it!
        if (clientSockets[token] != conn) {
            return
        }
        clientSockets.remove(token)

        val player = players[token] ?: return
        player.connected = false

        // 1. Lobby seat grace (60s)
        if (phase == GamePhase.LOBBY && !player.isHost) {
            scheduleStaleSeat(player)
        }

        // 2. Active brawl fighter disconnect grace (5s)
        val round = currentRound
        if (phase in activeBrawlPhases && round != null && player.id in round.fighterIds) scheduleFighterGrace(player, round)

        // 3. Host disconnect grace (60s)
        if (player.isHost) {
            hostGraceTimerJob?.cancel()
            val hostTok = token
            hostGraceTimerJob = scope.launch {
                delay(timing.hostGraceMs)
                synchronized(this@BrawlWebSocketServer) {
                    if (isActive && players[hostTok]?.connected == false) {
                        clearAllTimers()
                        val closeMsg = gson.toJson(mapOf(
                            "type" to "ROOM_CLOSED",
                            "timestamp" to nowMs(),
                            "payload" to mapOf("reason" to "Host disconnected and did not return.")
                        ))
                        for (sock in clientSockets.values) {
                            if (sock.isOpen) {
                                try { sock.send(closeMsg); sock.close() } catch (e: Exception) {}
                            }
                        }
                        resetRoom()
                    }
                }
            }
        }

        broadcastRoomState()
    }

    private fun scheduleStaleSeat(player: Player) {
        val token = player.sessionToken
        staleSeatTimers.remove(token)?.cancel()
        staleSeatTimers[token] = scope.launch {
            delay(timing.staleSeatMs)
            synchronized(this@BrawlWebSocketServer) {
                if (isActive && players[token] === player && !player.connected && phase == GamePhase.LOBBY) {
                    players.remove(token)
                    clientSockets.remove(token)
                    staleSeatTimers.remove(token)
                    broadcastRoomState()
                }
            }
        }
    }

    private fun scheduleFighterGrace(player: Player, round: RoundState) {
        fighterGraceTimers.remove(player.id)?.cancel()
        fighterGraceTimers[player.id] = scope.launch {
            delay(timing.fighterGraceMs)
            synchronized(this@BrawlWebSocketServer) {
                if (isActive && currentRound === round && phase in activeBrawlPhases && !player.connected) {
                    val otherId = round.fighterIds.first { it != player.id }
                    val other = players.values.find { it.id == otherId }
                    if (other?.connected == true) {
                        resolveCurrentGame(otherId, false, RoundResolutionReason.DISCONNECT_FORFEIT)
                    } else {
                        resolveCurrentGame(null, false, RoundResolutionReason.VOID)
                    }
                }
            }
        }
    }

    override fun onError(conn: WebSocket?, ex: Exception) {
        if (conn == null) onServerFailure?.invoke(ex)
    }

    @Synchronized
    override fun onMessage(conn: WebSocket, message: String) {
        // Enforce 64 KiB message size limit
        if (message.length > 65536) {
            return
        }
        val registeredToken = socketToToken[conn]
        if (!conn.isOpen || (registeredToken != null && clientSockets[registeredToken] !== conn)) return

        try {
            val rawMsg = gson.fromJson(message, Map::class.java) ?: return
            val type = rawMsg["type"] as? String ?: return
            @Suppress("UNCHECKED_CAST")
            val payload = rawMsg["payload"] as? Map<String, Any?>

            when (type) {
                "CREATE_ROOM" -> handleCreateRoom(conn, payload)
                "JOIN_ROOM" -> handleJoinRoom(conn, payload)
                "TOGGLE_READY" -> handleToggleReady(conn)
                "START_GAME" -> handleStartGame(conn)
                "PLACE_BET" -> handlePlaceBet(conn, payload)
                "FIGHTER_ACTION" -> handleFighterAction(conn, payload)
                "NEXT_ROUND" -> handleNextRound(conn)
                "RESTART_GAME" -> handleRestartGame(conn)
                "CLOSE_ROOM" -> handleCloseRoom(conn)
                "KICK_PLAYER" -> handleKickPlayer(conn, payload)
                "DEBUG_ADD_BOT" -> handleDebugAddBot(conn)
                "PING" -> handlePing(conn, payload)
            }
        } catch (_: com.google.gson.JsonParseException) {
            // Ignore malformed client input without logging its private payload.
        }
    }

    private fun handleCreateRoom(conn: WebSocket, payload: Map<String, Any?>?) {
        val callerToken = socketToToken[conn]
        // ACTIVE ROOM PROTECTION: An unauthenticated / non-host client cannot destroy an active room!
        if (roomCode.isNotEmpty() && players.isNotEmpty()) {
            if (callerToken == null || callerToken != hostToken) {
                sendToSocket(conn, "JOIN_ERROR", mapOf(
                    "code" to "ROOM_ALREADY_ACTIVE",
                    "message" to "A game room ($roomCode) is already running on this server. Join with the code."
                ))
                return
            }
        }

        clearAllTimers()
        clearConnectionTimers()

        val rawName = payload?.get("playerName") as? String
        val rawAvatar = payload?.get("avatar") as? String
        val rawDebug = payload?.get("debugMode") as? Boolean ?: false

        debugMode = rawDebug
        roomCode = RoomEngine.generateRoomCode()
        roomId = "room_${nowMs()}"
        players.clear()
        clientSockets.clear()
        socketToToken.clear()
        roundHistory.clear()
        awards.clear()
        tournamentSchedule = null
        currentRound = null
        internalGameState = null
        phase = GamePhase.LOBBY

        val hostPlayer = RoomEngine.createFreshPlayer(rawName ?: "Host", rawAvatar ?: "⚡", isHost = true)
        hostToken = hostPlayer.sessionToken
        players[hostToken] = hostPlayer
        clientSockets[hostToken] = conn
        socketToToken[conn] = hostToken

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
        val boundToken = socketToToken[conn]
        if (boundToken != null && requestedToken != boundToken) {
            sendToSocket(conn, "JOIN_ERROR", mapOf("code" to "ALREADY_JOINED", "message" to "This connection already occupies a seat."))
            return
        }

        if (roomCode.isEmpty() || targetCode != roomCode) {
            sendToSocket(conn, "JOIN_ERROR", mapOf("code" to "ROOM_NOT_FOUND", "message" to "Room code not found."))
            return
        }

        // 1. Session Recovery / Reconnect
        if (!requestedToken.isNullOrEmpty() && players.containsKey(requestedToken)) {
            val existing = players[requestedToken]!!
            val oldSocket = clientSockets[requestedToken]

            // Bind new socket FIRST
            clientSockets[requestedToken] = conn
            socketToToken[conn] = requestedToken
            existing.connected = true

            // Close old socket safely if different
            if (oldSocket != null && oldSocket != conn && oldSocket.isOpen) {
                try {
                    oldSocket.close(1000, "Replaced by new connection")
                } catch (e: Exception) {}
            }

            // Cancel connection grace timers for this player
            fighterGraceTimers.remove(existing.id)?.cancel()
            staleSeatTimers.remove(requestedToken)?.cancel()
            if (existing.isHost) {
                hostGraceTimerJob?.cancel()
                hostGraceTimerJob = null
            }

            sendToSocket(conn, "JOIN_SUCCESS", mapOf(
                "player" to existing.toPublicPlayer(),
                "sessionToken" to existing.sessionToken,
                "roomCode" to roomCode,
                "isHost" to existing.isHost
            ))
            broadcastRoomState()
            return
        }

        // 2. New player join (LOBBY ONLY)
        if (phase != GamePhase.LOBBY) {
            sendToSocket(conn, "JOIN_ERROR", mapOf("code" to "GAME_IN_PROGRESS", "message" to "Match already in progress."))
            return
        }

        if (players.size >= RoomEngine.MAX_PLAYERS_CAPACITY) {
            sendToSocket(conn, "JOIN_ERROR", mapOf("code" to "ROOM_FULL", "message" to "Room is full (max 9 players)."))
            return
        }

        val name = RoomEngine.sanitizePlayerName(rawName, isHost = false)
        val avatar = RoomEngine.sanitizePlayerAvatar(rawAvatar)
        val newPlayer = RoomEngine.createFreshPlayer(name, avatar, isHost = false)
        players[newPlayer.sessionToken] = newPlayer
        clientSockets[newPlayer.sessionToken] = conn
        socketToToken[conn] = newPlayer.sessionToken

        sendToSocket(conn, "JOIN_SUCCESS", mapOf(
            "player" to newPlayer.toPublicPlayer(),
            "sessionToken" to newPlayer.sessionToken,
            "roomCode" to roomCode,
            "isHost" to false
        ))

        broadcastRoomState()
    }

    private fun handleToggleReady(conn: WebSocket) {
        if (phase != GamePhase.LOBBY) return
        val token = socketToToken[conn] ?: return
        val player = players[token] ?: return
        player.isReady = !player.isReady
        broadcastRoomState()
    }

    private fun handleStartGame(conn: WebSocket) {
        if (phase != GamePhase.LOBBY) return
        val token = socketToToken[conn] ?: return
        val player = players[token] ?: return
        if (!player.isHost) return

        val connectedPlayers = players.values.filter { it.connected }

        // Authoritative debugMode only — do NOT allow client payload bypass!
        if (connectedPlayers.size < RoomEngine.MIN_PLAYERS_TO_START) {
            sendToSocket(conn, "JOIN_ERROR", mapOf(
                "code" to "NOT_ENOUGH_PLAYERS",
                "message" to "Need at least ${RoomEngine.MIN_PLAYERS_TO_START} connected players to start (currently ${connectedPlayers.size})."
            ))
            return
        }

        val allReady = connectedPlayers.all { it.isReady || it.isHost }
        if (!allReady && !debugMode) {
            sendToSocket(conn, "JOIN_ERROR", mapOf(
                "code" to "NOT_ALL_READY",
                "message" to "All connected players must be READY before starting."
            ))
            return
        }

        val schedule = RoomEngine.generateTournamentSchedule(connectedPlayers)
        tournamentSchedule = schedule
        totalRounds = schedule.totalRounds

        // Reset all players' tournament stats for fresh tournament
        for (p in players.values) {
            p.qualifierPoints = 0
            p.qualifierWins = 0
            p.qualifierTies = 0
            p.qualifierLosses = 0
            p.qualifierMatchesPlayed = 0
            p.tournamentRank = null
        }

        // Initialize authoritative initial tournament rankings based on frozen roster seed
        RoomEngine.computeTournamentRankings(players.values.toList(), emptyList(), schedule.stableRosterOrder)

        transitionToNextTournamentMatch()
    }

    private fun handleKickPlayer(conn: WebSocket, payload: Map<String, Any?>?) {
        if (phase != GamePhase.LOBBY) return
        val token = socketToToken[conn] ?: return
        val player = players[token] ?: return
        if (!player.isHost) return

        val targetPlayerId = payload?.get("playerId") as? String ?: return
        val target = players.values.find { it.id == targetPlayerId }
        if (target != null && !target.isHost) {
            val targetToken = target.sessionToken
            val targetSock = clientSockets[targetToken]
            if (targetSock != null && targetSock.isOpen) {
                sendToSocket(targetSock, "ROOM_CLOSED", mapOf("reason" to "You were removed from the room by the host."))
                try { targetSock.close() } catch (e: Exception) {}
            }
            clientSockets.remove(targetToken)
            targetSock?.let { socketToToken.remove(it) }
            players.remove(targetToken)
            staleSeatTimers.remove(targetToken)?.cancel()
            broadcastRoomState()
        }
    }

    @Synchronized
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
                schedule.thirdPlaceId = ranked.getOrNull(2)?.id
                schedule.championshipWins.clear()
                schedule.championshipWins[finalists[0]] = 0
                schedule.championshipWins[finalists[1]] = 0

                // Start Championship Series Game 1
                schedule.championshipGamesPlayed = 0
                val champMatch = TournamentMatch(
                    matchIndex = schedule.matches.size,
                    roundNumber = schedule.matches.size + 1,
                    fighterIds = finalists,
                    isChampionship = true,
                    championshipGameNumber = 1
                )
                schedule.matches.add(champMatch)
                totalRounds = maxOf(totalRounds, schedule.matches.size)
                initMatchRound(champMatch, isChampionship = true)
            }
        } else if (schedule.stage == TournamentStage.CHAMPIONSHIP) {
            val finalists = schedule.finalists!!
            val (f1, f2) = finalists
            val w1 = schedule.championshipWins.getOrDefault(f1, 0)
            val w2 = schedule.championshipWins.getOrDefault(f2, 0)

            if (w1 >= 2 || w2 >= 2) {
                // Championship Decided!
                schedule.stage = TournamentStage.COMPLETE
                schedule.championId = if (w1 >= 2) f1 else f2
                schedule.runnerUpId = if (w1 >= 2) f2 else f1

                phase = GamePhase.FINAL_PODIUM
                awards.clear()
                awards.addAll(RoomEngine.computeSessionAwards(players.values.toList(), schedule.championId))
                broadcastRoomState()
            } else {
                // Series continues!
                val nextGameNumber = schedule.championshipGamesPlayed + 1
                val nextChampMatch = TournamentMatch(
                    matchIndex = schedule.matches.size,
                    roundNumber = schedule.matches.size + 1,
                    fighterIds = finalists,
                    isChampionship = true,
                    championshipGameNumber = nextGameNumber
                )
                schedule.matches.add(nextChampMatch)
                totalRounds = maxOf(totalRounds, schedule.matches.size)
                initMatchRound(nextChampMatch, isChampionship = true)
            }
        }
    }

    private fun initMatchRound(match: TournamentMatch, isChampionship: Boolean) {
        val schedule = tournamentSchedule!!
        val miniGameId = RoomEngine.selectMiniGame(
            roundIndex = match.roundNumber - 1,
            lastMiniGameId = currentRound?.miniGame?.id,
            isChampionship = isChampionship,
            championshipGameNumber = match.championshipGameNumber ?: 1
        )
        val miniGame = MiniGamesCatalog.MINI_GAMES[miniGameId]!!

        val (f1, f2) = match.fighterIds
        val fighterA = players.values.find { it.id == f1 } ?: RoomEngine.createFreshPlayer("Fighter A", "⚡")
        val fighterB = players.values.find { it.id == f2 } ?: RoomEngine.createFreshPlayer("Fighter B", "🦊")
        val initialOdds = OddsEngine.calculateDynamicOdds(fighterA, fighterB, emptyList())

        val matchPot = if (isChampionship) 500 else 250
        val now = nowMs()
        val revealEndsAt = now + timing.revealMs
        val bettingEndsAt = revealEndsAt + timing.bettingMs
        val gameStartsAt = bettingEndsAt + timing.countdownMs
        val gameEndsAt = gameStartsAt + (miniGame.durationSeconds * 1000L)

        val (internal, publicConfig) = GameEngine.initMiniGameServerState(miniGameId, match.fighterIds, gameStartsAt)
        internalGameState = internal

        val round = RoundState(
            roundNumber = match.roundNumber,
            maxRounds = totalRounds,
            stage = schedule.stage,
            qualifierIndex = if (!isChampionship) match.matchIndex + 1 else null,
            qualifierTotal = if (!isChampionship) schedule.qualifierCount else null,
            championshipGameNumber = match.championshipGameNumber,
            miniGame = miniGame,
            fighterIds = match.fighterIds,
            matchPot = matchPot,
            odds = initialOdds,
            bettingTimeRemaining = 15,
            gameTimeRemaining = miniGame.durationSeconds,
            isChampionship = isChampionship,
            revealEndsAt = revealEndsAt,
            bettingEndsAt = bettingEndsAt,
            gameStartsAt = gameStartsAt,
            gameEndsAt = gameEndsAt,
            gameConfig = publicConfig,
            gameState = emptyMap()
        )
        round.fighterScores[f1] = 0
        round.fighterScores[f2] = 0
        currentRound = round

        // Phase 1: FIGHTER_REVEAL
        phase = GamePhase.FIGHTER_REVEAL
        broadcastRoomState()

        revealTimerJob = scope.launch {
            delay((round.revealEndsAt - nowMs()).coerceAtLeast(0))
            synchronized(this@BrawlWebSocketServer) {
                if (isActive && currentRound === round && phase == GamePhase.FIGHTER_REVEAL) startBettingWindow(round)
            }
        }
        players.values.filter { !it.connected && it.id in round.fighterIds }.forEach { scheduleFighterGrace(it, round) }
    }

    private fun startBettingWindow(round: RoundState) {
        phase = GamePhase.BETTING_WINDOW
        round.bettingTimeRemaining = ((round.bettingEndsAt - nowMs()).coerceAtLeast(0) + 999L).div(1000L).toInt()
        broadcastRoomState()
        bettingTimerJob = scope.launch {
            while (isActive) {
                delay(minOf(1000L, (round.bettingEndsAt - nowMs()).coerceAtLeast(0)))
                val finished = synchronized(this@BrawlWebSocketServer) {
                    if (!isActive || currentRound !== round || phase != GamePhase.BETTING_WINDOW) return@synchronized true
                    round.bettingTimeRemaining = ((round.bettingEndsAt - nowMs()).coerceAtLeast(0) + 999L).div(1000L).toInt()
                    if (nowMs() >= round.bettingEndsAt) {
                        startMiniGameCountdown(round)
                        true
                    } else {
                        broadcastRoomState()
                        false
                    }
                }
                if (finished) break
            }
        }
    }

    private fun startMiniGameCountdown(round: RoundState) {
        phase = GamePhase.MINIGAME_COUNTDOWN
        broadcastRoomState()
        countdownTimerJob = scope.launch {
            delay((round.gameStartsAt - nowMs()).coerceAtLeast(0))
            synchronized(this@BrawlWebSocketServer) {
                if (isActive && currentRound === round && phase == GamePhase.MINIGAME_COUNTDOWN) startActiveMiniGame(round)
            }
        }
    }

    private fun startActiveMiniGame(round: RoundState) {
        phase = GamePhase.MINIGAME_ACTIVE
        broadcastRoomState()
        minigameTimerJob = scope.launch {
            while (isActive) {
                delay(minOf(1000L, (round.gameEndsAt - nowMs()).coerceAtLeast(0)))
                val finished = synchronized(this@BrawlWebSocketServer) {
                    if (!isActive || currentRound !== round || phase != GamePhase.MINIGAME_ACTIVE) return@synchronized true
                    round.gameTimeRemaining = ((round.gameEndsAt - nowMs()).coerceAtLeast(0) + 999L).div(1000L).toInt()
                    if (nowMs() >= round.gameEndsAt) {
                        val internal = internalGameState ?: return@synchronized true
                        val (winnerId, isTie, patch) = GameEngine.resolveGameTimeout(internal, round.fighterScores)
                        if (patch != null) round.gameState = (round.gameState ?: emptyMap()) + patch
                        resolveCurrentGame(winnerId, isTie, if (isTie) RoundResolutionReason.TIE else RoundResolutionReason.PLAYED)
                        true
                    } else {
                        broadcastRoomState()
                        false
                    }
                }
                if (finished) break
            }
        }
    }

    private fun toStrictPositiveInteger(num: Any?): Int? {
        if (num !is Number) return null
        val d = num.toDouble()
        if (!d.isFinite() || d <= 0.0 || d % 1.0 != 0.0 || d > Int.MAX_VALUE.toDouble()) {
            return null
        }
        return d.toInt()
    }

    private fun handlePlaceBet(conn: WebSocket, payload: Map<String, Any?>?) {
        val token = socketToToken[conn] ?: return
        val bettor = players[token] ?: return
        val fighterId = payload?.get("fighterId") as? String ?: return
        val rawAmount = payload["amount"]
        val amount = toStrictPositiveInteger(rawAmount)
        if (amount == null) {
            sendToSocket(conn, "BET_REJECTED", mapOf("reason" to "Bet amount must be a positive whole number"))
            return
        }

        val err = OddsEngine.validateBetPlacement(
            bettor = bettor,
            fighterId = fighterId,
            amount = amount,
            round = currentRound,
            currentPhase = phase,
            serverNowMs = nowMs()
        )
        if (err != null) {
            sendToSocket(conn, "BET_REJECTED", mapOf("reason" to err))
            return
        }

        val round = currentRound!!
        val oddsVal = round.odds[fighterId]?.decimalOdds ?: 2.0
        val potentialReturn = kotlin.math.floor(amount * oddsVal).toInt()

        bettor.coins -= amount
        bettor.totalBetsPlaced += 1
        if (amount > bettor.highestSingleBet) {
            bettor.highestSingleBet = amount
        }

        val bet = SecretBet(
            bettorId = bettor.id,
            fighterId = fighterId,
            amount = amount,
            oddsAtBet = oddsVal,
            timestamp = nowMs(),
            potentialReturn = potentialReturn
        )
        round.bets.add(bet)

        // Recalculate dynamic odds with new pool
        val (f1, f2) = round.fighterIds
        val fighterA = players.values.find { it.id == f1 } ?: RoomEngine.createFreshPlayer("A", "⚡")
        val fighterB = players.values.find { it.id == f2 } ?: RoomEngine.createFreshPlayer("B", "🦊")
        round.odds = OddsEngine.calculateDynamicOdds(fighterA, fighterB, round.bets)

        sendToSocket(conn, "BET_ACCEPTED", mapOf(
            "bet" to bet,
            "myBankroll" to bettor.coins
        ))

        broadcastRoomState()
    }

    private fun handleFighterAction(conn: WebSocket, payload: Map<String, Any?>?) {
        val token = socketToToken[conn] ?: return
        val player = players[token] ?: return
        val round = currentRound ?: return
        val internal = internalGameState ?: return

        // Authoritative phase and deadline boundaries
        val now = nowMs()
        if (phase != GamePhase.MINIGAME_ACTIVE || now < round.gameStartsAt || now >= round.gameEndsAt) {
            return
        }
        if (player.id !in round.fighterIds) {
            return
        }

        val result = GameEngine.processFighterAction(
            internal = internal,
            fighterScores = round.fighterScores,
            fighterId = player.id,
            action = payload ?: emptyMap(),
            nowMs = now
        )

        if (result.scoreUpdate != null) {
            round.fighterScores.putAll(result.scoreUpdate)
        }
        if (result.gameStatePatch != null) {
            round.gameState = (round.gameState ?: emptyMap()) + result.gameStatePatch
        }
        if (result.actionFeedback != null) {
            sendToSocket(conn, "ACTION_RESULT", result.actionFeedback)
        }

        broadcastRoomState()

        if (result.resolved) {
            resolveCurrentGame(result.winnerId, result.isTie, if (result.isTie) RoundResolutionReason.TIE else RoundResolutionReason.PLAYED)
        }
    }

    private fun resolveCurrentGame(winnerId: String?, isTie: Boolean, reason: RoundResolutionReason) {
        val round = currentRound ?: return
        val schedule = tournamentSchedule ?: return
        val currentMatch = schedule.matches.firstOrNull { it.roundNumber == round.roundNumber }
            ?: return
        if (phase !in activeBrawlPhases || currentMatch.completed) return
        if (winnerId != null && winnerId !in round.fighterIds) return

        val (f1Id, f2Id) = round.fighterIds
        if (round.isChampionship) {
            currentMatch.completed = true
            currentMatch.winnerId = winnerId
            currentMatch.tieResult = isTie
            currentMatch.resolutionReason = reason
            schedule.championshipGamesPlayed += 1
            if (!isTie && winnerId != null && reason != RoundResolutionReason.VOID) {
                val currentWins = schedule.championshipWins.getOrDefault(winnerId, 0) + 1
                schedule.championshipWins[winnerId] = currentWins

                if (currentWins >= 2) {
                    schedule.championId = winnerId
                    val loserId = if (winnerId == f1Id) f2Id else f1Id
                    schedule.runnerUpId = loserId
                    schedule.stage = TournamentStage.COMPLETE
                }
            }
        } else {
            if (!RoomEngine.applyQualifierMatchResolution(
                schedule = schedule,
                players = players.values.toList(),
                roundNumber = round.roundNumber,
                winnerId = winnerId,
                isTie = isTie,
                reason = reason
            )) return
        }
        clearAllTimers()
        round.winnerId = winnerId
        round.tieResult = isTie
        round.resolutionReason = reason

        // Payouts
        val payouts = OddsEngine.computeRoundPayouts(
            round = round,
            players = players.values.toList(),
            winnerId = winnerId,
            tieResult = isTie,
            resolutionReason = reason
        )
        round.payouts = payouts
        if (!round.isChampionship) {
            RoomEngine.computeTournamentRankings(players.values.toList(),
                schedule.matches.filter { !it.isChampionship && it.completed }, schedule.stableRosterOrder)
        }

        val winnerName = if (isTie) "TIE / SPLIT" else (players.values.find { it.id == winnerId }?.name ?: "No Winner")
        roundHistory.add(
            RoundHistoryItem(
                roundNumber = round.roundNumber,
                miniGameName = round.miniGame.name,
                winnerName = winnerName,
                totalPotWon = round.matchPot,
                isChampionship = round.isChampionship,
                championshipGameNumber = round.championshipGameNumber,
                resolutionReason = reason
            )
        )

        phase = GamePhase.PAYOUT_RECAP
        broadcastRoomState()
    }

    private fun handleNextRound(conn: WebSocket) {
        if (phase != GamePhase.PAYOUT_RECAP) return
        val token = socketToToken[conn] ?: return
        val player = players[token] ?: return
        if (!player.isHost) return

        val schedule = tournamentSchedule
        if (schedule != null && schedule.stage == TournamentStage.COMPLETE) {
            phase = GamePhase.FINAL_PODIUM
            awards.clear()
            awards.addAll(RoomEngine.computeSessionAwards(players.values.toList(), schedule.championId))
            broadcastRoomState()
            return
        }

        transitionToNextTournamentMatch()
    }

    private fun handleRestartGame(conn: WebSocket) {
        if (phase != GamePhase.FINAL_PODIUM) return
        val token = socketToToken[conn] ?: return
        val player = players[token] ?: return
        if (!player.isHost) return

        clearAllTimers()
        roundHistory.clear()
        awards.clear()
        tournamentSchedule = null
        currentRound = null
        phase = GamePhase.LOBBY

        for (p in players.values) {
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
            p.isReady = false
            if (!p.connected && !p.isHost) scheduleStaleSeat(p)
        }

        broadcastRoomState()
    }

    private fun handleCloseRoom(conn: WebSocket) {
        val token = socketToToken[conn] ?: return
        val player = players[token] ?: return
        if (!player.isHost) return

        clearAllTimers()
        clearConnectionTimers()

        val closeMsg = gson.toJson(mapOf(
            "type" to "ROOM_CLOSED",
            "timestamp" to nowMs(),
            "payload" to mapOf("reason" to "The host closed the room.")
        ))

        for (ws in clientSockets.values) {
            if (ws.isOpen) {
                try { ws.send(closeMsg); ws.close() } catch (e: Exception) {}
            }
        }
        resetRoom()
    }

    private fun handleDebugAddBot(conn: WebSocket) {
        if (phase != GamePhase.LOBBY) return
        val token = socketToToken[conn] ?: return
        val player = players[token] ?: return
        if (!player.isHost || !debugMode) return
        if (players.size >= RoomEngine.MAX_PLAYERS_CAPACITY) return

        val botNum = players.size + 1
        val bot = RoomEngine.createFreshPlayer("Bot $botNum", listOf("🤖", "🦾", "👾", "🎯").random(), isHost = false).apply {
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
            "serverNow" to nowMs()
        ))
    }

    private fun resetRoom() {
        clearAllTimers()
        clearConnectionTimers()
        players.clear()
        clientSockets.clear()
        socketToToken.clear()
        roundHistory.clear()
        awards.clear()
        tournamentSchedule = null
        currentRound = null
        internalGameState = null
        roomCode = ""
        roomId = ""
        hostToken = ""
        debugMode = false
        phase = GamePhase.ENTRY
        broadcastRoomState()
    }

    @Synchronized
    fun broadcastRoomState() {
        val publicPlayers = players.values.map { it.toPublicPlayer() }

        // MASK SECRET BETS: Before PAYOUT_RECAP and FINAL_PODIUM, bets MUST be empty!
        // CRITICAL: Do NOT mutate authoritative round.bets via shallow copy!
        val scrubbedRound = currentRound?.let { round ->
            val publicBets = if (phase == GamePhase.PAYOUT_RECAP || phase == GamePhase.FINAL_PODIUM) {
                round.bets.toMutableList()
            } else {
                mutableListOf<SecretBet>()
            }
            round.copy(
                bets = publicBets,
                fighterScores = round.fighterScores.toMutableMap()
            )
        }

        val baseRoomState = PublicRoomState(
            roomId = roomId,
            roomCode = roomCode,
            phase = phase,
            players = publicPlayers,
            totalRounds = totalRounds,
            currentRound = scrubbedRound,
            tournamentSchedule = tournamentSchedule?.let { sched ->
                sched.copy(
                    matches = sched.matches.toMutableList(),
                    championshipWins = sched.championshipWins.toMutableMap()
                )
            },
            roundHistory = roundHistory.toList(),
            awards = awards.toList(),
            debugMode = debugMode
        )

        // Send tailored state per client socket
        for ((token, ws) in clientSockets) {
            if (!ws.isOpen) continue
            val player = players[token]

            var clientRound = scrubbedRound
            // Per-client Higher/Lower answer security during MINIGAME_ACTIVE
            if (scrubbedRound != null && scrubbedRound.miniGame.id == "higher_lower" && phase == GamePhase.MINIGAME_ACTIVE) {
                val origState = scrubbedRound.gameState ?: emptyMap()
                @Suppress("UNCHECKED_CAST")
                val stepIndices = origState["stepIndex"] as? Map<String, Number> ?: emptyMap()
                @Suppress("UNCHECKED_CAST")
                val origReveals = origState["reveals"] as? Map<String, Map<Int, Any>> ?: emptyMap()

                val playerId = player?.id.orEmpty()
                val myStep = stepIndices[playerId]?.toInt() ?: 0

                val scrubbedReveals = mutableMapOf<String, MutableMap<Int, Any>>()
                for ((fId, fReveals) in origReveals) {
                    val sanitizedFighterReveals = mutableMapOf<Int, Any>()
                    for ((qIdx, revealObj) in fReveals) {
                        // Only show opponent reveals for questions this viewer has already passed
                        if (fId == playerId || qIdx < myStep) {
                            sanitizedFighterReveals[qIdx] = revealObj
                        }
                    }
                    scrubbedReveals[fId] = sanitizedFighterReveals
                }

                val sanitizedGameState = origState + mapOf("reveals" to scrubbedReveals)
                clientRound = scrubbedRound.copy(gameState = sanitizedGameState)
            }

            val clientState = baseRoomState.copy(currentRound = clientRound)
            val json = gson.toJson(mapOf(
                "type" to "ROOM_STATE",
                "timestamp" to nowMs(),
                "payload" to clientState
            ))
            try {
                ws.send(json)
            } catch (e: Exception) {}
        }

        onRoomStateChanged?.invoke(baseRoomState)
    }

    private fun sendToSocket(conn: WebSocket, type: String, payload: Any) {
        if (!conn.isOpen) return
        val json = gson.toJson(mapOf(
            "type" to type,
            "timestamp" to nowMs(),
            "payload" to payload
        ))
        try {
            conn.send(json)
        } catch (e: Exception) {}
    }

    fun stopServer() {
        synchronized(this) {
            clearAllTimers()
            clearConnectionTimers()
            scope.cancel()
        }
        try {
            stop(1000)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun clearAllTimers() {
        revealTimerJob?.cancel()
        revealTimerJob = null
        bettingTimerJob?.cancel()
        bettingTimerJob = null
        countdownTimerJob?.cancel()
        countdownTimerJob = null
        minigameTimerJob?.cancel()
        minigameTimerJob = null
        for (job in fighterGraceTimers.values) job.cancel()
        fighterGraceTimers.clear()
    }

    private fun clearConnectionTimers() {
        for (job in fighterGraceTimers.values) job.cancel()
        fighterGraceTimers.clear()
        hostGraceTimerJob?.cancel()
        hostGraceTimerJob = null
        for (job in staleSeatTimers.values) job.cancel()
        staleSeatTimers.clear()
    }
}
