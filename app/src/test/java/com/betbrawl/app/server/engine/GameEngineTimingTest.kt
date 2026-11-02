package com.betbrawl.app.server.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GameEngineTimingTest {
    @Test fun millisecondTargetControlsScoringAndPublishesBlindInterval() {
        val cases = listOf(
            Triple(3.0 to 1.5, 2.9 to 4.0, "a"),
            Triple(5.0 to 3.0, 4.9 to 6.0, "a"),
            Triple(7.0 to 3.0, 6.0 to 7.1, "b"),
            Triple(9.0 to 4.0, 8.0 to 9.1, "b")
        )
        val startsAt = 10_000L
        cases.forEachIndexed { index, (configPair, stopTimes, winner) ->
            val (state, config) = GameEngine.initMiniGameServerState("millisecond_stop", listOf("a", "b"), startsAt) { index / 4.0 }
            assertEquals(configPair.first, config["targetSeconds"])
            assertEquals(configPair.second, config["blindSeconds"])
            val scores = mutableMapOf<String, Number>()
            GameEngine.processFighterAction(state, scores, "a", mapOf("type" to "STOP"), startsAt + (stopTimes.first * 1_000).toLong())
            val actionResult = GameEngine.processFighterAction(state, scores, "b", mapOf("type" to "STOP"), startsAt + (stopTimes.second * 1_000).toLong())
            assertEquals(winner, actionResult.winnerId)
            assertEquals(winner, GameEngine.resolveGameTimeout(state, scores).first)
        }
    }

    @Test fun stopAndQuickDrawTimeoutsExposeActedState() {
        val (stopState, _) = GameEngine.initMiniGameServerState("millisecond_stop", listOf("a", "b"), 0) { .2 }
        val stopScores = mutableMapOf<String, Number>()
        val stop = GameEngine.processFighterAction(stopState, stopScores, "a", mapOf("type" to "STOP"), 0)
        assertEquals(mapOf("stopped" to mapOf("a" to true, "b" to false)), stop.gameStatePatch)
        assertEquals(mapOf("stopped" to mapOf("a" to true, "b" to false)), GameEngine.resolveGameTimeout(stopState, stopScores).third)

        val (drawState, _) = GameEngine.initMiniGameServerState("quick_draw", listOf("a", "b"), 0)
        GameEngine.processFighterAction(drawState, mutableMapOf(), "a", mapOf("type" to "DRAW_TAP"), drawState.quickDrawDrawAt)
        assertEquals(mapOf("reactions" to mapOf("a" to 0L), "fouls" to mapOf("a" to false, "b" to false)),
            GameEngine.resolveGameTimeout(drawState, mutableMapOf()).third)
    }

    @Test fun randomizedLightScheduleIncludesEveryGreenBandAndRedRange() {
        val randomValues = mutableListOf(.0, .0, .34, .0, .67, .999, .999, .999)
        val (_, config) = GameEngine.initMiniGameServerState("rapid_red_green", listOf("a", "b"), 0) { randomValues.removeAt(0).also { if (randomValues.isEmpty()) randomValues.add(.5) } }
        val schedule = config["lightSchedule"] as List<Map<String, Any>>
        val greens = schedule.filter { it["light"] == "GREEN" }.map { (it["durationMs"] as Number).toInt() }
        val reds = schedule.filter { it["light"] == "RED" }.map { (it["durationMs"] as Number).toInt() }
        assertTrue(greens.any { it in 200..450 })
        assertTrue(greens.any { it in 500..1_000 })
        assertTrue(greens.any { it in 2_000..3_000 })
        assertTrue(reds.all { it in 350..2_200 })

        val quick = GameEngine.initMiniGameServerState("rapid_red_green", listOf("a", "b"), 0) { .0 }.second["lightSchedule"]
            as List<Map<String, Any>>
        val steady = GameEngine.initMiniGameServerState("rapid_red_green", listOf("a", "b"), 0) { .5 }.second["lightSchedule"]
            as List<Map<String, Any>>
        assertTrue(quick != steady)
        assertTrue(quick[0]["durationMs"] != steady[0]["durationMs"])
        assertTrue(quick[1]["durationMs"] != steady[1]["durationMs"])
    }
}
