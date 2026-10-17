package com.betbrawl.app.server.engine

import com.betbrawl.app.server.model.*
import kotlin.math.abs
import kotlin.random.Random

data class LightScheduleStep(
    val light: String, // "GREEN" or "RED"
    val durationMs: Int
)

data class InternalGameState(
    val miniGameId: String,
    val fighterIds: List<String>,
    val gameStartsAt: Long,
    var millisecondStopStopped: MutableMap<String, Long> = mutableMapOf(),
    var redGreenSchedule: List<LightScheduleStep> = emptyList(),
    var redGreenLastTapAt: MutableMap<String, Long> = mutableMapOf(),
    var speedMathCorrectAnswers: List<Int> = emptyList(),
    var speedMathProgress: MutableMap<String, Int> = mutableMapOf(),
    var speedMathPenaltyUntil: MutableMap<String, Long> = mutableMapOf(),
    var higherLowerCards: List<HigherLowerTrivia> = emptyList(),
    var higherLowerProgress: MutableMap<String, Int> = mutableMapOf(),
    var blindPinpointTargetCity: CityLocation? = null,
    var blindPinpointPins: MutableMap<String, Int> = mutableMapOf(), // fighterId -> km error
    var quickDrawDrawAt: Long = 0L,
    var quickDrawFouls: MutableMap<String, Boolean> = mutableMapOf(),
    var quickDrawReactions: MutableMap<String, Long> = mutableMapOf()
)

data class GameActionResult(
    val resolved: Boolean,
    val winnerId: String?,
    val isTie: Boolean = false,
    val scoreUpdate: Map<String, Int>? = null,
    val actionFeedback: Map<String, Any?>? = null
)

object GameEngine {

    fun initMiniGameServerState(
        miniGameId: String,
        fighterIds: List<String>,
        gameStartsAt: Long
    ): Pair<InternalGameState, Map<String, Any?>> {
        val f1 = fighterIds[0]
        val f2 = fighterIds[1]
        val internal = InternalGameState(
            miniGameId = miniGameId,
            fighterIds = fighterIds,
            gameStartsAt = gameStartsAt
        )
        val publicConfig = mutableMapOf<String, Any?>()

        when (miniGameId) {
            "millisecond_stop" -> {
                publicConfig["targetSeconds"] = 5.0
                publicConfig["blindSeconds"] = 3.0
            }
            "rapid_red_green" -> {
                val schedule = mutableListOf<LightScheduleStep>()
                var accum = 0
                var currentLight = "GREEN"
                while (accum < 16000) {
                    val dur = if (currentLight == "GREEN") Random.nextInt(1400, 2600) else Random.nextInt(800, 1600)
                    schedule.add(LightScheduleStep(currentLight, dur))
                    accum += dur
                    currentLight = if (currentLight == "GREEN") "RED" else "GREEN"
                }
                internal.redGreenSchedule = schedule
                publicConfig["lightSchedule"] = schedule.map { mapOf("light" to it.light, "durationMs" to it.durationMs) }
                publicConfig["targetScore"] = 40
            }
            "speed_math" -> {
                val questions = MiniGamesCatalog.generateMathQuestions(3)
                internal.speedMathCorrectAnswers = questions.map { it.correct }
                internal.speedMathProgress[f1] = 0
                internal.speedMathProgress[f2] = 0
                // Scrub answers!
                publicConfig["questions"] = questions.map {
                    mapOf("q" to it.q, "choices" to it.choices)
                }
            }
            "higher_lower" -> {
                val cards = MiniGamesCatalog.STABLE_HIGHER_LOWER_BANK.shuffled().take(4)
                internal.higherLowerCards = cards
                internal.higherLowerProgress[f1] = 0
                internal.higherLowerProgress[f2] = 0
                // Scrub answers!
                publicConfig["cards"] = cards.map {
                    mapOf(
                        "baseItem" to it.baseItem,
                        "baseStat" to it.baseStat,
                        "challengerItem" to it.challengerItem
                    )
                }
            }
            "blind_pinpoint" -> {
                val city = MiniGamesCatalog.WORLD_CITIES.random()
                internal.blindPinpointTargetCity = city
                publicConfig["city"] = city.city
                publicConfig["country"] = city.country
            }
            "quick_draw" -> {
                val delayMs = Random.nextLong(2500, 5500)
                internal.quickDrawDrawAt = gameStartsAt + delayMs
                publicConfig["delayHintSeconds"] = 8
            }
        }

        return Pair(internal, publicConfig)
    }

    fun processFighterAction(
        internal: InternalGameState,
        fighterId: String,
        action: Map<String, Any?>,
        currentScores: MutableMap<String, Int>,
        serverTimeMs: Long
    ): GameActionResult {
        val otherId = internal.fighterIds.find { it != fighterId } ?: return GameActionResult(false, null)
        val actionType = action["type"] as? String ?: return GameActionResult(false, null)

        when (internal.miniGameId) {
            "millisecond_stop" -> {
                if (actionType == "STOP" && !internal.millisecondStopStopped.containsKey(fighterId)) {
                    val elapsedMs = serverTimeMs - internal.gameStartsAt
                    internal.millisecondStopStopped[fighterId] = elapsedMs
                    val diff = abs(elapsedMs - 5000L)
                    currentScores[fighterId] = diff.toInt()

                    if (internal.millisecondStopStopped.size == 2) {
                        val diff1 = abs(internal.millisecondStopStopped[internal.fighterIds[0]]!! - 5000L)
                        val diff2 = abs(internal.millisecondStopStopped[internal.fighterIds[1]]!! - 5000L)
                        return if (diff1 == diff2) {
                            GameActionResult(resolved = true, winnerId = null, isTie = true, scoreUpdate = currentScores)
                        } else {
                            val winner = if (diff1 < diff2) internal.fighterIds[0] else internal.fighterIds[1]
                            GameActionResult(resolved = true, winnerId = winner, scoreUpdate = currentScores)
                        }
                    }
                    return GameActionResult(resolved = false, winnerId = null, scoreUpdate = currentScores)
                }
            }

            "rapid_red_green" -> {
                if (actionType == "TAP") {
                    val elapsedMs = (serverTimeMs - internal.gameStartsAt).toInt()
                    var accum = 0
                    var currentLight = "GREEN"
                    for (step in internal.redGreenSchedule) {
                        if (elapsedMs in accum until (accum + step.durationMs)) {
                            currentLight = step.light
                            break
                        }
                        accum += step.durationMs
                    }

                    val score = currentScores.getOrDefault(fighterId, 0)
                    val newScore = if (currentLight == "GREEN") {
                        score + 1
                    } else {
                        maxOf(0, score - 3)
                    }
                    currentScores[fighterId] = newScore

                    if (newScore >= 40) {
                        return GameActionResult(resolved = true, winnerId = fighterId, scoreUpdate = currentScores)
                    }
                    return GameActionResult(resolved = false, winnerId = null, scoreUpdate = currentScores)
                }
            }

            "speed_math" -> {
                if (actionType == "ANSWER") {
                    val penaltyUntil = internal.speedMathPenaltyUntil.getOrDefault(fighterId, 0L)
                    if (serverTimeMs < penaltyUntil) {
                        return GameActionResult(false, null)
                    }

                    val qIndex = (action["questionIndex"] as? Number)?.toInt() ?: 0
                    val answer = (action["answer"] as? Number)?.toInt() ?: 0

                    if (qIndex < internal.speedMathCorrectAnswers.size) {
                        val correct = internal.speedMathCorrectAnswers[qIndex]
                        if (answer == correct) {
                            val newProgress = internal.speedMathProgress.getOrDefault(fighterId, 0) + 1
                            internal.speedMathProgress[fighterId] = newProgress
                            currentScores[fighterId] = newProgress

                            val feedback = mapOf(
                                "fighterId" to fighterId,
                                "questionIndex" to qIndex,
                                "isCorrect" to true,
                                "challengerStat" to "Correct!"
                            )

                            if (newProgress >= 3) {
                                return GameActionResult(resolved = true, winnerId = fighterId, scoreUpdate = currentScores, actionFeedback = feedback)
                            }
                            return GameActionResult(resolved = false, winnerId = null, scoreUpdate = currentScores, actionFeedback = feedback)
                        } else {
                            internal.speedMathPenaltyUntil[fighterId] = serverTimeMs + 1500L
                            val feedback = mapOf(
                                "fighterId" to fighterId,
                                "questionIndex" to qIndex,
                                "isCorrect" to false,
                                "challengerStat" to "1.5s Penalty!"
                            )
                            return GameActionResult(resolved = false, winnerId = null, actionFeedback = feedback)
                        }
                    }
                }
            }

            "higher_lower" -> {
                if (actionType == "GUESS") {
                    val qIndex = (action["questionIndex"] as? Number)?.toInt() ?: 0
                    val guess = action["guess"] as? String ?: ""

                    if (qIndex < internal.higherLowerCards.size) {
                        val card = internal.higherLowerCards[qIndex]
                        val isCorrect = (guess == "HIGHER" && card.isHigher) || (guess == "LOWER" && !card.isHigher)

                        if (isCorrect) {
                            val newProgress = internal.higherLowerProgress.getOrDefault(fighterId, 0) + 1
                            internal.higherLowerProgress[fighterId] = newProgress
                            currentScores[fighterId] = newProgress

                            val feedback = mapOf(
                                "fighterId" to fighterId,
                                "questionIndex" to qIndex,
                                "isCorrect" to true,
                                "challengerStat" to card.challengerStat
                            )

                            if (newProgress >= 3) {
                                return GameActionResult(resolved = true, winnerId = fighterId, scoreUpdate = currentScores, actionFeedback = feedback)
                            }
                            return GameActionResult(resolved = false, winnerId = null, scoreUpdate = currentScores, actionFeedback = feedback)
                        } else {
                            val feedback = mapOf(
                                "fighterId" to fighterId,
                                "questionIndex" to qIndex,
                                "isCorrect" to false,
                                "challengerStat" to card.challengerStat
                            )
                            return GameActionResult(resolved = false, winnerId = null, actionFeedback = feedback)
                        }
                    }
                }
            }

            "blind_pinpoint" -> {
                if (actionType == "PIN" && !internal.blindPinpointPins.containsKey(fighterId)) {
                    val normX = (action["normX"] as? Number)?.toDouble() ?: 0.5
                    val normY = (action["normY"] as? Number)?.toDouble() ?: 0.5
                    val (lat, lon) = MiniGamesCatalog.normCoordsToLatLon(normX, normY)
                    val city = internal.blindPinpointTargetCity!!
                    val errorKm = MiniGamesCatalog.calculateHaversineKm(lat, lon, city.lat, city.lon)

                    internal.blindPinpointPins[fighterId] = errorKm
                    currentScores[fighterId] = errorKm

                    if (internal.blindPinpointPins.size == 2) {
                        val err1 = internal.blindPinpointPins[internal.fighterIds[0]]!!
                        val err2 = internal.blindPinpointPins[internal.fighterIds[1]]!!
                        return if (err1 == err2) {
                            GameActionResult(resolved = true, winnerId = null, isTie = true, scoreUpdate = currentScores)
                        } else {
                            val winner = if (err1 < err2) internal.fighterIds[0] else internal.fighterIds[1]
                            GameActionResult(resolved = true, winnerId = winner, scoreUpdate = currentScores)
                        }
                    }
                    return GameActionResult(resolved = false, winnerId = null, scoreUpdate = currentScores)
                }
            }

            "quick_draw" -> {
                if (actionType == "DRAW_TAP") {
                    if (serverTimeMs < internal.quickDrawDrawAt) {
                        // False start foul!
                        internal.quickDrawFouls[fighterId] = true
                        return GameActionResult(resolved = true, winnerId = otherId, scoreUpdate = currentScores)
                    } else {
                        val reactionMs = serverTimeMs - internal.quickDrawDrawAt
                        internal.quickDrawReactions[fighterId] = reactionMs
                        currentScores[fighterId] = reactionMs.toInt()
                        return GameActionResult(resolved = true, winnerId = fighterId, scoreUpdate = currentScores)
                    }
                }
            }
        }

        return GameActionResult(false, null)
    }

    fun resolveGameTimeout(
        internal: InternalGameState,
        currentScores: Map<String, Int>
    ): Pair<String?, Boolean> {
        val f1 = internal.fighterIds[0]
        val f2 = internal.fighterIds[1]
        val score1 = currentScores.getOrDefault(f1, 0)
        val score2 = currentScores.getOrDefault(f2, 0)

        return when (internal.miniGameId) {
            "millisecond_stop" -> {
                val stopped1 = internal.millisecondStopStopped.containsKey(f1)
                val stopped2 = internal.millisecondStopStopped.containsKey(f2)
                if (stopped1 && !stopped2) Pair(f1, false)
                else if (stopped2 && !stopped1) Pair(f2, false)
                else if (stopped1 && stopped2) {
                    if (score1 == score2) Pair(null, true)
                    else Pair(if (score1 < score2) f1 else f2, false)
                } else Pair(null, true)
            }
            "blind_pinpoint" -> {
                val pinned1 = internal.blindPinpointPins.containsKey(f1)
                val pinned2 = internal.blindPinpointPins.containsKey(f2)
                if (pinned1 && !pinned2) Pair(f1, false)
                else if (pinned2 && !pinned1) Pair(f2, false)
                else if (pinned1 && pinned2) {
                    if (score1 == score2) Pair(null, true)
                    else Pair(if (score1 < score2) f1 else f2, false)
                } else Pair(null, true)
            }
            else -> {
                // Higher score wins
                if (score1 > score2) Pair(f1, false)
                else if (score2 > score1) Pair(f2, false)
                else Pair(null, true)
            }
        }
    }
}
