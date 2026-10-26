package com.betbrawl.app.server.engine

import com.google.gson.*
import org.junit.Assert.*
import org.junit.Test
import java.io.File

class V2GamesTest {
    private val gson = Gson()
    private fun fixture(name: String): String = javaClass.getResourceAsStream("/$name")?.bufferedReader()?.use { it.readText() }
        ?: File("src/engine/fixtures/$name").readText()

    @Test fun portableFixturesReproduceAllEightActionTraces() {
        val cases = JsonParser.parseString(fixture("v2-parity.json")).asJsonObject.getAsJsonArray("cases")
        assertEquals(8, cases.size())
        for (entry in cases) {
            val f = entry.asJsonObject
            val state = f.getAsJsonObject("initialState").deepCopy()
            for (step in f.getAsJsonArray("steps")) {
                val p = step.asJsonObject
                assertTrue(f["name"].asString, V2Games.process(state, p["fighterId"].asString, p.getAsJsonObject("action"), p["nowMs"].asLong).accepted)
            }
            V2Games.advance(state, f["finalAt"].asLong)
            for ((key, expected) in f.getAsJsonObject("expected").entrySet()) assertEquals("${f["name"]}:$key", expected, state[key])
        }
    }

    private fun make(id: String) = V2Games.init(id,listOf("a","b"),1000) { .31 }
    private fun data(s: JsonObject) = s.getAsJsonObject("data")
    private fun act(s: JsonObject, who: String, at: Long = 1000, vararg values: Pair<String,Any?>) = V2Games.process(s,who,mapOf(*values),at)
    private fun projected(s: JsonObject, viewer: String?, at: Long) = V2Games.project(s,viewer,at,true)

    @Test fun allDifferentialStatesAndRecipientProjectionsMatchTypescript() {
        val checkpoints = JsonParser.parseString(fixture("v2-projections.json")).asJsonObject.getAsJsonArray("checkpoints")
        assertEquals(104,checkpoints.size())
        for (entry in checkpoints) {
            val f = entry.asJsonObject; val state = f.getAsJsonObject("initialState").deepCopy()
            for (step in f.getAsJsonArray("steps")) { val p = step.asJsonObject; assertTrue(V2Games.process(state,p["fighterId"].asString,p.getAsJsonObject("action"),p["nowMs"].asLong).accepted) }
            V2Games.advance(state,f["at"].asLong)
            assertEquals(f["name"].asString,f["state"],state)
            for (v in f.getAsJsonArray("views")) { val p = v.asJsonObject; assertEquals("${f["name"]}:${p["viewer"]}",p["view"],V2Games.project(state,if (p["viewer"].isJsonNull) null else p["viewer"].asString,f["at"].asLong,true)) }
        }
    }
    @Test fun missingActionsCatchUpOnceAfterPersistenceWithoutLeakingPrestartContent() {
        for (id in V2Games.ids) {
            val state = make(id); assertEquals(1000L,V2Games.nextDeadline(state)); assertEquals(JsonParser.parseString("{\"gameId\":\"$id\"}"),projected(state,null,999).getAsJsonObject("config"))
            val restored = JsonParser.parseString(state.toString()).asJsonObject
            for (at in 1000L..state["endsAt"].asLong step 1000) V2Games.advance(state,at)
            V2Games.advance(restored,restored["endsAt"].asLong + 10000)
            assertEquals(id,state,restored); assertTrue(restored["finished"].asBoolean); assertTrue(restored["winnerId"].isJsonNull)
            val done = restored.deepCopy(); V2Games.advance(restored,999999); assertEquals(done,restored); assertNull(V2Games.nextDeadline(restored))
        }
    }
    @Test fun botsOnlyActOnActiveOwnerViewsAndTheirActionsAreAccepted() {
        for (id in V2Games.ids) {
            val s = make(id); val at = if (id == "memory_heist") 5000L else if (id == "crowd_count") 3000L else 1000L
            assertNull(V2Games.botAction(projected(s,"a",999))); assertNull(V2Games.botAction(projected(s,null,at)))
            val before = s.deepCopy(); val view = projected(s,"a",at); assertEquals(before,s)
            val action = V2Games.botAction(view) { .2 }; assertNotNull(id,action); assertTrue(id,V2Games.process(s,"a",action!!,at).accepted)
            V2Games.advance(s,s["endsAt"].asLong); assertNull(V2Games.botAction(projected(s,"a",s["endsAt"].asLong)))
        }
    }
    @Test fun rejectsMalformedValuesWithoutConsumingTheValidCommit() {
        for ((id,type,field,length) in listOf(listOf("memory_heist","MEMORY_DRAFT","board",9),listOf("safecracker","CODE_GUESS","symbols",3),listOf("treasure_tug","TREASURE_COMMIT","allocation",3))) {
            val state = make(id as String); val at = if (id == "memory_heist") 5000L else 1000L
            for (bad in listOf(null,emptyList<Any?>(),List(length as Int) { Double.NaN },List(length) { Double.POSITIVE_INFINITY },List(length) { .5 },List(length) { "1" })) assertFalse(V2Games.process(state,"a",mapOf("type" to type,"lock" to true,field as String to bad),at).accepted)
            assertTrue(V2Games.process(state,"a",V2Games.botAction(projected(state,"a",at)) { .2 }!!,at).accepted)
        }
    }
    @Test fun commitmentsStayPrivateAndImmutableAcrossSerialization() {
        for (id in listOf("crowd_count","mirror_trouble","split_decision","treasure_tug","pocket_territory")) {
            var s = make(id); val at = if (id == "crowd_count") 3000L else 1000L; val action = V2Games.botAction(projected(s,"a",at)) { .1 }!!
            assertTrue(V2Games.process(s,"a",action,at).accepted); val commit = projected(s,"a",at).getAsJsonObject("state").getAsJsonObject("mine")["commit"]
            s = JsonParser.parseString(s.toString()).asJsonObject
            assertFalse(V2Games.process(s,"a",action,at).accepted); assertEquals(commit,projected(s,"a",at).getAsJsonObject("state").getAsJsonObject("mine")["commit"])
            assertFalse(projected(s,"b",at).getAsJsonObject("state").getAsJsonObject("mine").has("commit")); assertFalse(projected(s,null,at).getAsJsonObject("state").has("mine")); assertFalse(projected(s,null,at).getAsJsonObject("state").has("recap"))
        }
    }
    @Test fun memoryScoresOnlyLastValidDraftAtTimeout() {
        val s = make("memory_heist"); val answer = gson.fromJson(data(s)["answer"],List::class.java)
        assertFalse(act(s,"a",1000,"type" to "MEMORY_DRAFT","board" to answer,"lock" to true).accepted)
        assertTrue(act(s,"a",5000,"type" to "MEMORY_DRAFT","board" to answer,"lock" to false).accepted)
        assertFalse(act(s,"a",5001,"type" to "MEMORY_DRAFT","board" to List(9) { 1 },"lock" to false).accepted)
        assertFalse(projected(s,null,5001).getAsJsonObject("config").has("board")); assertEquals(0,projected(s,"b",5001).getAsJsonObject("scores")["a"].asInt)
        V2Games.advance(s,25000); assertEquals(6,s.getAsJsonObject("scores")["a"].asInt); assertEquals(0,s.getAsJsonObject("scores")["b"].asInt)
    }
    @Test fun safecrackerDuplicateFeedbackAndFiveAttemptLimit() {
        assertEquals(JsonParser.parseString("{\"exact\":1,\"misplaced\":2}"),V2Games.codeFeedback(listOf(1,1,2),listOf(1,2,1)))
        val s = make("safecracker"); data(s).add("secret",JsonParser.parseString("[0,1,2]"))
        repeat(5) { assertTrue(act(s,"a",1000,"type" to "CODE_GUESS","symbols" to listOf(4,4,4)).accepted) }
        assertFalse(act(s,"a",1000,"type" to "CODE_GUESS","symbols" to listOf(0,1,2)).accepted)
        assertEquals(0,projected(s,"b",1000).getAsJsonObject("state").getAsJsonObject("mine").getAsJsonArray("history").size())
        repeat(5) { assertTrue(act(s,"b",2000,"type" to "CODE_GUESS","symbols" to listOf(4,4,4)).accepted) }
        assertTrue(s["finished"].asBoolean); assertTrue(s["winnerId"].isJsonNull)
    }
    @Test fun duelZeroEnergyRejectsWithoutLockingAndFinalKnockoutKeepsReveal() {
        val s = make("split_decision"); V2Games.advance(s,1000); val players = data(s).getAsJsonObject("players")
        players.getAsJsonObject("a").addProperty("energy",0)
        assertFalse(act(s,"a",1000,"type" to "DUEL_COMMIT","choice" to "ATTACK").accepted)
        assertTrue(act(s,"a",1000,"type" to "DUEL_COMMIT","choice" to "CHARGE").accepted)
        assertTrue(act(s,"b",1000,"type" to "DUEL_COMMIT","choice" to "ATTACK").accepted)
        V2Games.advance(s,5000); assertEquals(2,players.getAsJsonObject("a")["hp"].asInt); assertEquals(1,players.getAsJsonObject("a")["energy"].asInt)
        V2Games.advance(s,6000); players.getAsJsonObject("a").addProperty("hp",1); players.getAsJsonObject("b").addProperty("hp",1); players.getAsJsonObject("b").addProperty("energy",3)
        act(s,"a",6000,"type" to "DUEL_COMMIT","choice" to "ATTACK"); act(s,"b",6000,"type" to "DUEL_COMMIT","choice" to "ATTACK")
        V2Games.advance(s,10000); assertFalse(s["finished"].asBoolean); assertEquals("reveal",s["phase"].asString)
        V2Games.advance(s,11000); assertTrue(s["finished"].asBoolean); assertTrue(s["winnerId"].isJsonNull)
    }
    @Test fun territoryCollisionBlocksPermanentlyAndUsesTurnStartLegality() {
        val s = make("pocket_territory"); V2Games.advance(s,1000); val board = JsonArray(); repeat(25) { board.add(JsonNull.INSTANCE) }; board.set(11,JsonPrimitive("a")); board.set(13,JsonPrimitive("b")); data(s).add("board",board)
        assertTrue(act(s,"a",1000,"type" to "TERRITORY_COMMIT","cell" to 12).accepted); assertTrue(act(s,"b",1000,"type" to "TERRITORY_COMMIT","cell" to 12).accepted)
        V2Games.advance(s,5000); assertEquals("blocked",board[12].asString); V2Games.advance(s,6000)
        assertFalse(act(s,"a",6000,"type" to "TERRITORY_COMMIT","cell" to 12).accepted); assertTrue(act(s,"a",6000,"type" to "TERRITORY_COMMIT","cell" to null).accepted)
    }
    @Test fun generatorsHaveSingleChiralMirrorAnswerAndCircuitRequiresMultipleMoves() {
        for (seed in 0..40) {
            val random = java.util.Random(seed.toLong()); val s = V2Games.init("mirror_trouble",listOf("a","b"),1000) { random.nextDouble() }
            for (entry in data(s).getAsJsonArray("puzzles")) { val p = entry.asJsonObject; val target = V2Games.shapeRotationKey(p.getAsJsonArray("target").map { it.asInt }); assertEquals(1,p.getAsJsonArray("choices").count { V2Games.shapeRotationKey(it.asJsonArray.map { c -> c.asInt }) == target }); assertEquals(target,V2Games.shapeRotationKey(p.getAsJsonArray("choices")[p["correct"].asInt].asJsonArray.map { it.asInt })); for (choice in p.getAsJsonArray("choices")) { val cells = choice.asJsonArray.map { it.asInt }; assertNotEquals(V2Games.shapeRotationKey(cells),V2Games.shapeRotationKey(cells.map { it / 5 * 5 + 4 - it % 5 })) } }
            val d = data(V2Games.init("circuit_sprint",listOf("a","b"),1000) { random.nextDouble() }); val kinds = d.getAsJsonArray("pipeKinds").map { it.asString }; val rotations = d.getAsJsonArray("initialRotations").map { it.asInt }
            assertTrue(V2Games.evaluateCircuit(kinds,d.getAsJsonArray("solutionRotations").map { it.asInt }).solved); assertFalse(V2Games.evaluateCircuit(kinds,rotations).solved)
            repeat(16) { cell -> val moved = rotations.toMutableList(); moved[cell] = (moved[cell]+1)%4; assertFalse(V2Games.evaluateCircuit(kinds,moved).solved) }
        }
    }
    @Test fun exactDeadlinesOutsidersAndSpecialIdentifierKeysCannotBypassLocks() {
        for (id in V2Games.ids) { val s = make(id); assertFalse(act(s,"outsider",999,"type" to "NOPE").accepted); assertFalse(act(s,"a",s["endsAt"].asLong,"type" to "NOPE").accepted) }
        val s = V2Games.init("treasure_tug",listOf("__proto__","b"),1000)
        assertTrue(act(s,"__proto__",1000,"type" to "TREASURE_COMMIT","allocation" to listOf(1,2,7)).accepted)
        assertFalse(act(JsonParser.parseString(s.toString()).asJsonObject,"__proto__",1000,"type" to "TREASURE_COMMIT","allocation" to listOf(1,2,7)).accepted)
    }

    @Test fun circuitGenerationVariesTheActualSourceToSinkRoute() {
        val routes = mutableSetOf<List<Int>>()
        repeat(40) { seed -> val random = java.util.Random(seed.toLong()); val d = data(V2Games.init("circuit_sprint",listOf("a","b"),1000) { random.nextDouble() }); val result = V2Games.evaluateCircuit(d.getAsJsonArray("pipeKinds").map { it.asString },d.getAsJsonArray("solutionRotations").map { it.asInt }); assertTrue(result.solved); routes.add(result.powered) }
        assertTrue("Distinct actual powered routes: ${routes.size}",routes.size >= 4)
    }

}
