package com.betbrawl.app.server.engine

import com.betbrawl.app.server.model.*
import kotlin.math.abs
import kotlin.math.round
import kotlin.random.Random

data class LightScheduleStep(
    val light: String, // "GREEN" or "RED"
    val durationMs: Int
)

data class InternalGameState(
    val miniGameId: String,
    val fighterIds: List<String>,
    val gameStartsAt: Long,
    var millisecondStopStopped: MutableMap<String, Boolean> = mutableMapOf(),
    var redGreenSchedule: List<LightScheduleStep> = emptyList(),
    var redGreenLastTapAt: MutableMap<String, Long> = mutableMapOf(),
    var speedMathCorrectAnswers: List<Int> = emptyList(),
    var speedMathProgress: MutableMap<String, Int> = mutableMapOf(),
    var speedMathPenaltyUntil: MutableMap<String, Long> = mutableMapOf(),
    var higherLowerCards: List<HigherLowerTrivia> = emptyList(),
    var higherLowerStepIndex: MutableMap<String, Int> = mutableMapOf(),
    var higherLowerReveals: MutableMap<String, MutableMap<Int, Map<String, Any>>> = mutableMapOf(),
    var blindPinpointTargetCity: CityLocation? = null,
    var blindPinpointPins: MutableMap<String, Map<String, Any>> = mutableMapOf(),
    var quickDrawDrawDelayMs: Long = 0L,
    var quickDrawDrawAt: Long = 0L,
    var quickDrawFouls: MutableMap<String, Boolean> = mutableMapOf(),
    var quickDrawReactions: MutableMap<String, Long> = mutableMapOf()
)

data class GameActionResult(
    val resolved: Boolean,
    val winnerId: String?,
    val isTie: Boolean = false,
    val scoreUpdate: Map<String, Number>? = null,
    val gameStatePatch: Map<String, Any?>? = null,
    val actionFeedback: Map<String, Any?>? = null,
    val rejectionReason: String? = null
)

object GameEngine {

    fun toStrictNonNegativeInteger(value: Any?): Int? {
        if (value !is Number) return null
        val d = value.toDouble()
        if (!d.isFinite() || d < 0.0 || d % 1.0 != 0.0 || d > Int.MAX_VALUE.toDouble()) return null
        return d.toInt()
    }

    fun toStrictInteger(value: Any?): Int? {
        if (value !is Number) return null
        val d = value.toDouble()
        if (!d.isFinite() || d % 1.0 != 0.0 || d < Int.MIN_VALUE.toDouble() || d > Int.MAX_VALUE.toDouble()) return null
        return d.toInt()
    }

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
                internal.millisecondStopStopped = mutableMapOf(f1 to false, f2 to false)
                publicConfig["targetSeconds"] = 5.0
                publicConfig["blindSeconds"] = 3.0
            }
            "rapid_red_green" -> {
                val sequence = mutableListOf<LightScheduleStep>()
                var accumulatedMs = 0
                var currentLight = "GREEN"
                while (accumulatedMs < 16000) {
                    val dur = if (currentLight == "GREEN") {
                        Random.nextInt(1400, 2600)
                    } else {
                        Random.nextInt(800, 1600)
                    }
                    sequence.add(LightScheduleStep(currentLight, dur))
                    accumulatedMs += dur
                    currentLight = if (currentLight == "GREEN") "RED" else "GREEN"
                }
                internal.redGreenSchedule = sequence
                internal.redGreenLastTapAt = mutableMapOf(f1 to 0L, f2 to 0L)
                publicConfig["lightSchedule"] = sequence.map { mapOf("light" to it.light, "durationMs" to it.durationMs) }
                publicConfig["targetScore"] = 40
            }
            "speed_math" -> {
                val questions = MiniGamesCatalog.generateMathQuestions(3)
                internal.speedMathCorrectAnswers = questions.map { it.correct }
                internal.speedMathProgress = mutableMapOf(f1 to 0, f2 to 0)
                internal.speedMathPenaltyUntil = mutableMapOf(f1 to 0L, f2 to 0L)
                // Scrub correct answers from public view!
                publicConfig["questions"] = questions.map {
                    mapOf("q" to it.q, "choices" to it.choices)
                }
            }
            "higher_lower" -> {
                val cards = MiniGamesCatalog.STABLE_HIGHER_LOWER_BANK.shuffled().take(4)
                internal.higherLowerCards = cards
                internal.higherLowerStepIndex = mutableMapOf(f1 to 0, f2 to 0)
                internal.higherLowerReveals = mutableMapOf(f1 to mutableMapOf(), f2 to mutableMapOf())
                // Scrub secret answers and challenger stats from public config!
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
                internal.blindPinpointPins = mutableMapOf()
                // Scrub targetLat / targetLon from public view until round resolves!
                publicConfig["targetCity"] = mapOf(
                    "city" to city.city,
                    "country" to city.country
                )
            }
            "quick_draw" -> {
                val drawDelayMs = Random.nextLong(2200, 4800)
                val drawAt = gameStartsAt + drawDelayMs
                internal.quickDrawDrawDelayMs = drawDelayMs
                internal.quickDrawDrawAt = drawAt
                internal.quickDrawFouls = mutableMapOf(f1 to false, f2 to false)
                internal.quickDrawReactions = mutableMapOf()
                publicConfig["drawDelayMs"] = drawDelayMs
                publicConfig["drawAt"] = drawAt
            }
        }

        return Pair(internal, publicConfig)
    }

    fun processFighterAction(
        internal: InternalGameState,
        fighterScores: MutableMap<String, Number>,
        fighterId: String,
        action: Map<String, Any?>,
        nowMs: Long
    ): GameActionResult {
        val (f1, f2) = internal.fighterIds
        if (fighterId != f1 && fighterId != f2) {
            return GameActionResult(resolved = false, winnerId = null, rejectionReason = "Not an active fighter")
        }
        val otherFighterId = if (fighterId == f1) f2 else f1
        val actionType = action["type"] as? String
            ?: return GameActionResult(resolved = false, winnerId = null, rejectionReason = "Malformed action")

        when (internal.miniGameId) {
            "millisecond_stop" -> {
                if (actionType != "STOP") {
                    return GameActionResult(resolved = false, winnerId = null, rejectionReason = "Invalid action for Millisecond Stop")
                }
                if (internal.millisecondStopStopped[fighterId] == true) {
                    return GameActionResult(resolved = false, winnerId = null, rejectionReason = "Already stopped")
                }

                val elapsedSeconds = maxOf(0.0, (nowMs - internal.gameStartsAt) / 1000.0)
                val roundedScore = round(elapsedSeconds * 1000.0) / 1000.0
                internal.millisecondStopStopped[fighterId] = true
                fighterScores[fighterId] = roundedScore

                // If both fighters have stopped
                if (internal.millisecondStopStopped[f1] == true && internal.millisecondStopStopped[f2] == true) {
                    val s1 = fighterScores[f1]?.toDouble() ?: 0.0
                    val s2 = fighterScores[f2]?.toDouble() ?: 0.0
                    val delta1 = abs(s1 - 5.0)
                    val delta2 = abs(s2 - 5.0)

                    if (abs(delta1 - delta2) < 0.005) {
                        return GameActionResult(resolved = true, winnerId = null, isTie = true, scoreUpdate = fighterScores)
                    }
                    val winnerId = if (delta1 < delta2) f1 else f2
                    return GameActionResult(resolved = true, winnerId = winnerId, isTie = false, scoreUpdate = fighterScores)
                }

                return GameActionResult(resolved = false, winnerId = null, isTie = false, scoreUpdate = fighterScores)
            }

            "rapid_red_green" -> {
                if (actionType != "TAP") {
                    return GameActionResult(resolved = false, winnerId = null, rejectionReason = "Invalid action for Red Light Green Light")
                }
                // Rate limit: 30ms between taps per client
                val lastTap = internal.redGreenLastTapAt[fighterId] ?: 0L
                if (nowMs - lastTap < 30L) {
                    return GameActionResult(resolved = false, winnerId = null)
                }
                internal.redGreenLastTapAt[fighterId] = nowMs

                val elapsedMs = (nowMs - internal.gameStartsAt).toInt()
                var accum = 0
                var currentLight = "GREEN"
                for (step in internal.redGreenSchedule) {
                    if (elapsedMs in accum until (accum + step.durationMs)) {
                        currentLight = step.light
                        break
                    }
                    accum += step.durationMs
                }

                val currentScore = fighterScores[fighterId]?.toInt() ?: 0
                val newScore = if (currentLight == "GREEN") {
                    minOf(40, currentScore + 1)
                } else {
                    maxOf(0, currentScore - 3)
                }
                fighterScores[fighterId] = newScore

                if (newScore >= 40) {
                    return GameActionResult(resolved = true, winnerId = fighterId, isTie = false, scoreUpdate = fighterScores)
                }

                return GameActionResult(resolved = false, winnerId = null, isTie = false, scoreUpdate = fighterScores)
            }

            "speed_math" -> {
                if (actionType != "ANSWER") {
                    return GameActionResult(resolved = false, winnerId = null, rejectionReason = "Invalid action for Speed Math")
                }
                val qIndex = toStrictNonNegativeInteger(action["questionIndex"])
                val answer = toStrictInteger(action["answer"])
                if (qIndex == null || answer == null) {
                    return GameActionResult(resolved = false, winnerId = null, rejectionReason = "Invalid Speed Math payload")
                }

                // Penalty lock check
                val penaltyUntil = internal.speedMathPenaltyUntil[fighterId] ?: 0L
                if (nowMs < penaltyUntil) {
                    return GameActionResult(resolved = false, winnerId = null, rejectionReason = "Penalty active")
                }

                val currentProgress = internal.speedMathProgress[fighterId] ?: 0
                if (qIndex != currentProgress) {
                    return GameActionResult(resolved = false, winnerId = null, rejectionReason = "Stale question index")
                }

                val expected = internal.speedMathCorrectAnswers[currentProgress]
                if (answer == expected) {
                    val nextProgress = currentProgress + 1
                    internal.speedMathProgress[fighterId] = nextProgress
                    fighterScores[fighterId] = nextProgress

                    val patch = mapOf("progress" to internal.speedMathProgress)
                    val feedback = mapOf(
                        "fighterId" to fighterId,
                        "questionIndex" to qIndex,
                        "isCorrect" to true,
                        "challengerStat" to "Correct!"
                    )

                    if (nextProgress >= 3) {
                        return GameActionResult(
                            resolved = true,
                            winnerId = fighterId,
                            isTie = false,
                            scoreUpdate = fighterScores,
                            gameStatePatch = patch,
                            actionFeedback = feedback
                        )
                    }

                    return GameActionResult(
                        resolved = false,
                        winnerId = null,
                        isTie = false,
                        scoreUpdate = fighterScores,
                        gameStatePatch = patch,
                        actionFeedback = feedback
                    )
                } else {
                    // 1500ms penalty
                    internal.speedMathPenaltyUntil[fighterId] = nowMs + 1500L
                    val patch = mapOf("penaltyUntil" to internal.speedMathPenaltyUntil)
                    val feedback = mapOf(
                        "fighterId" to fighterId,
                        "questionIndex" to qIndex,
                        "isCorrect" to false,
                        "challengerStat" to "1.5s Penalty!"
                    )
                    return GameActionResult(
                        resolved = false,
                        winnerId = null,
                        isTie = false,
                        gameStatePatch = patch,
                        actionFeedback = feedback
                    )
                }
            }

            "higher_lower" -> {
                if (actionType != "GUESS") {
                    return GameActionResult(resolved = false, winnerId = null, rejectionReason = "Invalid action for Higher Lower")
                }
                val guess = action["guess"] as? String
                if (guess != "HIGHER" && guess != "LOWER") {
                    return GameActionResult(resolved = false, winnerId = null, rejectionReason = "Guess must be HIGHER or LOWER")
                }
                val qIndex = toStrictNonNegativeInteger(action["questionIndex"])
                if (qIndex == null) {
                    return GameActionResult(resolved = false, winnerId = null, rejectionReason = "Invalid questionIndex")
                }

                val currentStep = internal.higherLowerStepIndex[fighterId] ?: 0
                if (qIndex != currentStep) {
                    return GameActionResult(resolved = false, winnerId = null, rejectionReason = "Stale trivia index")
                }
                if (currentStep >= internal.higherLowerCards.size) {
                    return GameActionResult(resolved = false, winnerId = null, rejectionReason = "Already completed questions")
                }

                val card = internal.higherLowerCards[currentStep]
                val isCorrect = (guess == "HIGHER") == card.isHigher
                val currentScore = fighterScores[fighterId]?.toInt() ?: 0
                val newScore = if (isCorrect) currentScore + 1 else currentScore
                fighterScores[fighterId] = newScore

                // Authoritative step advances after EVERY submitted question
                internal.higherLowerStepIndex[fighterId] = currentStep + 1

                val playerReveals = internal.higherLowerReveals.getOrPut(fighterId) { mutableMapOf() }
                playerReveals[currentStep] = mapOf(
                    "isCorrect" to isCorrect,
                    "challengerStat" to card.challengerStat
                )

                val patch = mapOf(
                    "stepIndex" to internal.higherLowerStepIndex,
                    "reveals" to internal.higherLowerReveals
                )
                val feedback = mapOf(
                    "fighterId" to fighterId,
                    "questionIndex" to currentStep,
                    "isCorrect" to isCorrect,
                    "challengerStat" to card.challengerStat
                )

                if (newScore >= 3) {
                    return GameActionResult(
                        resolved = true,
                        winnerId = fighterId,
                        isTie = false,
                        scoreUpdate = fighterScores,
                        gameStatePatch = patch,
                        actionFeedback = feedback
                    )
                }

                return GameActionResult(
                    resolved = false,
                    winnerId = null,
                    isTie = false,
                    scoreUpdate = fighterScores,
                    gameStatePatch = patch,
                    actionFeedback = feedback
                )
            }

            "blind_pinpoint" -> {
                if (actionType != "PIN") {
                    return GameActionResult(resolved = false, winnerId = null, rejectionReason = "Invalid action for Blind Pinpoint")
                }
                if (internal.blindPinpointPins.containsKey(fighterId)) {
                    return GameActionResult(resolved = false, winnerId = null, rejectionReason = "Already pinned")
                }

                val rawX = action["normX"]
                val rawY = action["normY"]
                if (rawX !is Number || rawY !is Number) {
                    return GameActionResult(resolved = false, winnerId = null, rejectionReason = "Coordinates must be numbers")
                }
                val normX = rawX.toDouble()
                val normY = rawY.toDouble()
                if (normX.isNaN() || normY.isNaN() || normX.isInfinite() || normY.isInfinite() || normX < 0.0 || normX > 1.0 || normY < 0.0 || normY > 1.0) {
                    return GameActionResult(resolved = false, winnerId = null, rejectionReason = "Coordinates must be numbers between 0 and 1")
                }

                val (lat, lon) = MiniGamesCatalog.normCoordsToLatLon(normX, normY)
                val targetCity = internal.blindPinpointTargetCity!!
                val distanceKm = MiniGamesCatalog.calculateHaversineKm(lat, lon, targetCity.lat, targetCity.lon)

                internal.blindPinpointPins[fighterId] = mapOf(
                    "normX" to normX,
                    "normY" to normY,
                    "km" to distanceKm
                )
                fighterScores[fighterId] = distanceKm

                if (internal.blindPinpointPins.containsKey(f1) && internal.blindPinpointPins.containsKey(f2)) {
                    val dist1 = (internal.blindPinpointPins[f1]?.get("km") as Number).toDouble()
                    val dist2 = (internal.blindPinpointPins[f2]?.get("km") as Number).toDouble()
                    val patch = mapOf(
                        "revealedCity" to targetCity,
                        "pins" to internal.blindPinpointPins
                    )

                    if (abs(dist1 - dist2) < 10.0) {
                        return GameActionResult(
                            resolved = true,
                            winnerId = null,
                            isTie = true,
                            scoreUpdate = fighterScores,
                            gameStatePatch = patch
                        )
                    }

                    val winnerId = if (dist1 < dist2) f1 else f2
                    return GameActionResult(
                        resolved = true,
                        winnerId = winnerId,
                        isTie = false,
                        scoreUpdate = fighterScores,
                        gameStatePatch = patch
                    )
                }

                return GameActionResult(
                    resolved = false,
                    winnerId = null,
                    isTie = false,
                    scoreUpdate = fighterScores,
                    gameStatePatch = mapOf("pins" to internal.blindPinpointPins)
                )
            }

            "quick_draw" -> {
                if (actionType != "DRAW_TAP") {
                    return GameActionResult(resolved = false, winnerId = null, rejectionReason = "Invalid action for Quick Draw")
                }
                if (internal.quickDrawFouls[fighterId] == true || internal.quickDrawReactions.containsKey(fighterId)) {
                    return GameActionResult(resolved = false, winnerId = null, rejectionReason = "Already acted")
                }

                // Strict false start: tap before drawAt is an immediate foul
                if (nowMs < internal.quickDrawDrawAt) {
                    internal.quickDrawFouls[fighterId] = true
                    fighterScores[fighterId] = -1
                    fighterScores[otherFighterId] = 1

                    return GameActionResult(
                        resolved = true,
                        winnerId = otherFighterId,
                        isTie = false,
                        scoreUpdate = fighterScores,
                        gameStatePatch = mapOf(
                            "fouls" to internal.quickDrawFouls,
                            "reactions" to internal.quickDrawReactions
                        )
                    )
                }

                // Valid reaction
                val reactionMs = nowMs - internal.quickDrawDrawAt
                internal.quickDrawReactions[fighterId] = reactionMs
                fighterScores[fighterId] = reactionMs

                // Wait for BOTH reactions before resolving
                if (internal.quickDrawReactions.containsKey(f1) && internal.quickDrawReactions.containsKey(f2)) {
                    val r1 = internal.quickDrawReactions[f1]!!
                    val r2 = internal.quickDrawReactions[f2]!!

                    val patch = mapOf("reactions" to internal.quickDrawReactions)

                    if (abs(r1 - r2) < 5L) {
                        return GameActionResult(
                            resolved = true,
                            winnerId = null,
                            isTie = true,
                            scoreUpdate = fighterScores,
                            gameStatePatch = patch
                        )
                    }

                    val winnerId = if (r1 < r2) f1 else f2
                    return GameActionResult(
                        resolved = true,
                        winnerId = winnerId,
                        isTie = false,
                        scoreUpdate = fighterScores,
                        gameStatePatch = patch
                    )
                }

                return GameActionResult(
                    resolved = false,
                    winnerId = null,
                    isTie = false,
                    scoreUpdate = fighterScores,
                    gameStatePatch = mapOf("reactions" to internal.quickDrawReactions)
                )
            }
        }

        return GameActionResult(resolved = false, winnerId = null)
    }

    fun resolveGameTimeout(
        internal: InternalGameState,
        fighterScores: Map<String, Number>
    ): Triple<String?, Boolean, Map<String, Any?>?> {
        val (f1, f2) = internal.fighterIds
        val s1 = fighterScores[f1]
        val s2 = fighterScores[f2]

        when (internal.miniGameId) {
            "millisecond_stop" -> {
                val has1 = internal.millisecondStopStopped[f1] == true
                val has2 = internal.millisecondStopStopped[f2] == true
                if (has1 && has2) {
                    val d1 = abs(s1!!.toDouble() - 5.0)
                    val d2 = abs(s2!!.toDouble() - 5.0)
                    if (abs(d1 - d2) < 0.005) return Triple(null, true, null)
                    return Triple(if (d1 < d2) f1 else f2, false, null)
                }
                if (has1 && !has2) return Triple(f1, false, null)
                if (!has1 && has2) return Triple(f2, false, null)
                return Triple(null, true, null)
            }

            "rapid_red_green", "speed_math", "higher_lower" -> {
                val score1 = s1?.toInt() ?: 0
                val score2 = s2?.toInt() ?: 0
                if (score1 == score2) return Triple(null, true, null)
                return Triple(if (score1 > score2) f1 else f2, false, null)
            }

            "blind_pinpoint" -> {
                val p1 = internal.blindPinpointPins[f1]
                val p2 = internal.blindPinpointPins[f2]
                val patch = mapOf(
                    "revealedCity" to internal.blindPinpointTargetCity,
                    "pins" to internal.blindPinpointPins
                )

                if (p1 != null && p2 != null) {
                    val dist1 = (p1["km"] as Number).toDouble()
                    val dist2 = (p2["km"] as Number).toDouble()
                    if (abs(dist1 - dist2) < 10.0) return Triple(null, true, patch)
                    return Triple(if (dist1 < dist2) f1 else f2, false, patch)
                }
                if (p1 != null && p2 == null) return Triple(f1, false, patch)
                if (p1 == null && p2 != null) return Triple(f2, false, patch)
                return Triple(null, true, patch)
            }

            "quick_draw" -> {
                if (internal.quickDrawFouls[f1] == true) return Triple(f2, false, null)
                if (internal.quickDrawFouls[f2] == true) return Triple(f1, false, null)

                val r1 = internal.quickDrawReactions[f1]
                val r2 = internal.quickDrawReactions[f2]
                if (r1 != null && r2 != null) {
                    if (abs(r1 - r2) < 5L) return Triple(null, true, null)
                    return Triple(if (r1 < r2) f1 else f2, false, null)
                }
                if (r1 != null && r2 == null) return Triple(f1, false, null)
                if (r1 == null && r2 != null) return Triple(f2, false, null)
                return Triple(null, true, null)
            }
        }

        return Triple(null, true, null)
    }
}
