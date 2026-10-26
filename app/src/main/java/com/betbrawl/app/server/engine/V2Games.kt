package com.betbrawl.app.server.engine

import com.google.gson.*
import kotlin.math.abs
import kotlin.math.floor

/** JSON-persistable V2 authority. All times are absolute milliseconds; no Android APIs. */
object V2Games {
    val ids = listOf("memory_heist", "crowd_count", "mirror_trouble", "safecracker", "circuit_sprint", "split_decision", "treasure_tug", "pocket_territory")
    val durations = ids.zip(listOf(24, 24, 20, 30, 30, 25, 24, 30)).toMap()
    data class Result(val accepted: Boolean, val reason: String? = null)
    data class CircuitResult(val powered: List<Int>, val solved: Boolean)
    private val gson = GsonBuilder().serializeNulls().serializeSpecialFloatingPointValues().create()
    private fun json(value: Any?): JsonElement = if (value is JsonElement) value.deepCopy() else gson.toJsonTree(value)
    private fun obj(vararg pairs: Pair<String, Any?>): JsonObject = JsonObject().also { o -> pairs.forEach { (k, v) -> o.add(k, json(v)) } }
    private fun JsonObject.put(key: String, value: Any?) { add(key, json(value)) }
    private fun JsonObject.o(key: String) = getAsJsonObject(key)
    private fun JsonObject.a(key: String) = getAsJsonArray(key)
    private fun JsonObject.s(key: String) = get(key).asString
    private fun JsonObject.n(key: String) = get(key).asInt
    private fun JsonObject.t(key: String) = get(key).asLong
    private fun JsonObject.b(key: String) = get(key).asBoolean
    private fun JsonArray.ints() = map { it.asInt }
    private fun JsonObject.fighters() = a("fighterIds").map { it.asString }
    private fun pair(ids: List<String>, value: (String) -> Any?) = JsonObject().also { o -> ids.forEach { o.put(it, value(it)) } }
    private fun player(d: JsonObject, id: String) = d.o("players").o(id)
    private fun integer(x: JsonElement?, min: Int, max: Int): Boolean = x != null && x.isJsonPrimitive && x.asJsonPrimitive.isNumber && x.asDouble.isFinite() && x.asDouble == floor(x.asDouble) && x.asDouble >= min && x.asDouble <= max
    private fun array(x: JsonElement?, size: Int, min: Int, max: Int) = x != null && x.isJsonArray && x.asJsonArray.size() == size && x.asJsonArray.all { integer(it, min, max) }
    private fun randomInt(random: () -> Double, n: Int): Int { val v = random(); return floor((if (v.isFinite()) v else 0.0) * n).coerceIn(0.0, (n - 1).toDouble()).toInt() }
    private fun <T> shuffled(values: List<T>, random: () -> Double): List<T> { val out = values.toMutableList(); for (i in out.lastIndex downTo 1) { val j = randomInt(random, i + 1); val v = out[i]; out[i] = out[j]; out[j] = v }; return out }

    fun codeFeedback(secret: List<Int>, guess: List<Int>): JsonObject {
        var exact = 0; val remaining = mutableListOf<Int>(); val other = mutableListOf<Int>()
        secret.forEachIndexed { i, symbol -> if (symbol == guess[i]) exact++ else { remaining.add(symbol); other.add(guess[i]) } }
        var misplaced = 0; other.forEach { if (remaining.remove(it)) misplaced++ }
        return obj("exact" to exact, "misplaced" to misplaced)
    }
    private fun rotateShape(shape: List<Int>) = shape.map { (it % 5) * 5 + 4 - it / 5 }
    private fun mirrorShape(shape: List<Int>) = shape.map { it / 5 * 5 + 4 - it % 5 }
    private fun normalizeShape(shape: List<Int>): String { val x = shape.minOf { it % 5 }; val y = shape.minOf { it / 5 }; return shape.map { (it / 5 - y) * 5 + it % 5 - x }.sorted().joinToString(",") }
    fun shapeRotationKey(shape: List<Int>): String { var current = shape; return (0..3).map { val key = normalizeShape(current); current = rotateShape(current); key }.sorted().first() }
    private fun asymmetric(shape: List<Int>): Boolean { var current = shape; val keys = (0..3).map { val key = normalizeShape(current); current = rotateShape(current); key }; return keys.toSet().size == 4 && shapeRotationKey(shape) != shapeRotationKey(mirrorShape(shape)) }
    private fun puzzle(random: () -> Double): JsonObject {
        val bases = listOf(listOf(0,5,10,15,16,17), listOf(0,1,5,10,11,15), listOf(0,5,6,10,15,16)).filter(::asymmetric)
        val target = bases[randomInt(random, bases.size)]
        val wrongs = listOf(mirrorShape(target), listOf(0,1,2,5,10,15), listOf(0,1,5,6,10,15), listOf(0,5,10,11,16,17), listOf(0,5,10,15,16,21))
        val keys = mutableSetOf(shapeRotationKey(target)); val choices = mutableListOf<List<Int>>()
        for (candidate in wrongs) { if (keys.add(shapeRotationKey(candidate))) choices.add(candidate); if (choices.size == 3) break }
        var correct = target; repeat(randomInt(random, 4)) { correct = rotateShape(correct) }
        val index = randomInt(random, 4); choices.add(index, correct)
        return obj("target" to target, "choices" to choices, "correct" to index)
    }
    private fun pipeMask(kind: String, rotation: Int): Int { var mask = if (kind == "straight") 5 else 3; repeat(rotation) { mask = ((mask shl 1) and 15) or (mask shr 3) }; return mask }
    fun evaluateCircuit(kinds: List<String>, rotations: List<Int>): CircuitResult {
        if (kinds.size != 16 || rotations.size != 16 || kinds.any { it != "straight" && it != "elbow" } || rotations.any { it !in 0..3 }) return CircuitResult(emptyList(), false)
        val masks = kinds.mapIndexed { i, kind -> pipeMask(kind, rotations[i]) }
        if (masks[4] and 8 == 0) return CircuitResult(emptyList(), false)
        val powered = mutableListOf(4); var i = 0
        while (i < powered.size) { val cell = powered[i++]; val row = cell / 4; val col = cell % 4
            val neighbors = listOf(Triple(if (row > 0) cell - 4 else -1, 1, 4), Triple(if (col < 3) cell + 1 else -1, 2, 8), Triple(if (row < 3) cell + 4 else -1, 4, 1), Triple(if (col > 0) cell - 1 else -1, 8, 2))
            for ((next, port, opposite) in neighbors) if (next >= 0 && masks[cell] and port != 0 && masks[next] and opposite != 0 && next !in powered) powered.add(next)
        }
        return CircuitResult(powered.sorted(), 11 in powered && masks[11] and 2 != 0)
    }
    private fun circuit(ids: List<String>, random: () -> Double): JsonObject {
        val kinds = MutableList(16) { if (randomInt(random, 2) == 1) "elbow" else "straight" }
        val solution = MutableList(16) { randomInt(random, 4) }
        val path = mutableListOf(4)
        fun neighbors(cell: Int) = listOfNotNull(if (cell >= 4) cell - 4 else null, if (cell % 4 < 3) cell + 1 else null, if (cell < 12) cell + 4 else null, if (cell % 4 > 0) cell - 1 else null)
        fun route(cell: Int): Boolean {
            if (cell == 11) return true
            for (next in shuffled(neighbors(cell).filter { it !in path },random)) {
                path.add(next)
                if (route(next)) return true
                path.removeAt(path.lastIndex)
            }
            return false
        }
        check(route(4))
        fun port(from: Int, to: Int) = when (to - from) { -4 -> 1; 1 -> 2; 4 -> 4; else -> 8 }
        path.forEachIndexed { index, cell ->
            val entry = if (index == 0) 8 else port(cell,path[index - 1])
            val exit = if (index == path.lastIndex) 2 else port(cell,path[index + 1])
            val mask = entry or exit
            val kind = if (mask == 5 || mask == 10) "straight" else "elbow"
            kinds[cell] = kind
            solution[cell] = (0..3).first { pipeMask(kind,it) == mask }
        }
        val initial = MutableList(16) { randomInt(random,4) }
        // Both distinct endpoint tiles must change before any connection can succeed.
        for ((cell, external) in listOf(4 to 8,11 to 2)) {
            val blocked = (0..3).filter { pipeMask(kinds[cell],it) and external == 0 }
            initial[cell] = blocked[randomInt(random,blocked.size)]
        }
        return obj("kind" to "circuit_sprint", "pipeKinds" to kinds, "initialRotations" to initial, "solutionRotations" to solution, "players" to pair(ids) { obj("rotations" to initial, "moves" to 0, "solved" to false, "powered" to emptyList<Int>()) })
    }
    fun init(id: String, fighterIds: List<String>, startsAt: Long, random: () -> Double = Math::random): JsonObject {
        require(id in ids && fighterIds.size == 2 && fighterIds.all { it.isNotEmpty() } && fighterIds[0] != fighterIds[1]) { "Invalid V2 game initialization" }
        val data = when (id) {
            "memory_heist" -> obj("kind" to id, "answer" to shuffled((0..5).toList() + listOf(null,null,null), random), "players" to pair(fighterIds) { obj("board" to List<Int?>(9) { null }, "locked" to false) })
            "crowd_count" -> obj("kind" to id, "scenes" to List(3) { val count = 6 + randomInt(random, 19); obj("count" to count, "objects" to shuffled(List(36) { i -> obj("target" to (i < count), "x" to ((i % 6 + .15 + randomInt(random,40) / 100.0) / 6), "y" to ((i / 6 + .15 + randomInt(random,40) / 100.0) / 6), "rotation" to randomInt(random,360)) }, random)) }, "commits" to obj(), "outcomes" to emptyList<Any>())
            "mirror_trouble" -> obj("kind" to id, "puzzles" to List(5) { puzzle(random) }, "commits" to obj(), "outcomes" to emptyList<Any>())
            "safecracker" -> obj("kind" to id, "secret" to List(3) { randomInt(random,5) }, "players" to pair(fighterIds) { obj("history" to emptyList<Any>(), "solved" to false) })
            "circuit_sprint" -> circuit(fighterIds, random)
            "split_decision" -> obj("kind" to id, "players" to pair(fighterIds) { obj("hp" to 3, "energy" to 1) }, "commits" to obj(), "outcomes" to emptyList<Any>(), "knockout" to false)
            "treasure_tug" -> obj("kind" to id, "commits" to obj(), "outcomes" to emptyList<Any>())
            else -> { val board = MutableList<String?>(25) { null }; board[0] = fighterIds[0]; board[24] = fighterIds[1]; obj("kind" to id, "board" to board, "commits" to obj(), "outcomes" to emptyList<Any>()) }
        }
        return obj("id" to id, "fighterIds" to fighterIds, "startsAt" to startsAt, "endsAt" to (startsAt + durations.getValue(id) * 1000L), "stageIndex" to 0, "phase" to "waiting", "phaseEndsAt" to startsAt, "finished" to false, "winnerId" to null, "scores" to pair(fighterIds) { 0 }, "data" to data)
    }
    fun territoryLegalCells(board: List<String?>, fighterId: String): List<Int> = board.indices.filter { cell -> board[cell] == null && listOf(if (cell % 5 > 0) cell - 1 else -1, if (cell % 5 < 4) cell + 1 else -1, if (cell >= 5) cell - 5 else -1, if (cell < 20) cell + 5 else -1).any { it >= 0 && board[it] == fighterId } }
    private fun board(d: JsonObject) = d.a("board").map { if (it.isJsonNull) null else it.asString }
    private fun territoryWeight(cell: Int) = if (cell == 12) 5 else if (cell in listOf(7,11,13,17)) 3 else 1
    private fun territoryScore(d: JsonObject, id: String) = board(d).mapIndexed { cell, owner -> if (owner == id) territoryWeight(cell) else 0 }.sum()
    private fun finish(state: JsonObject, at: Long) {
        if (state.b("finished")) return
        val d = state.o("data"); val ids = state.fighters(); val scores = state.o("scores"); val a = ids[0]; val b = ids[1]
        for (id in ids) when (d.s("kind")) {
            "memory_heist" -> scores.put(id, player(d,id).a("board").filterIndexed { i, symbol -> !symbol.isJsonNull && symbol == d.a("answer")[i] }.size)
            "safecracker" -> { val p = player(d,id); val history = p.a("history"); scores.put(id, if (p.b("solved")) 100 - history.size() else history.map { it.asJsonObject.n("exact") * 4 + it.asJsonObject.n("misplaced") }.maxOrNull() ?: -1) }
            "circuit_sprint" -> { val p = player(d,id); val result = evaluateCircuit(d.a("pipeKinds").map { it.asString },p.a("rotations").ints()); p.put("powered",result.powered); p.put("solved",result.solved); scores.put(id,if (result.solved) 1000000 - p.n("moves") else result.powered.size) }
            "split_decision" -> scores.put(id, player(d,id).n("hp") * 4 + player(d,id).n("energy"))
            "pocket_territory" -> scores.put(id, territoryScore(d,id))
        }
        var comparison = scores.n(a) - scores.n(b)
        if (d.s("kind") == "crowd_count") comparison = -comparison
        if (d.s("kind") == "circuit_sprint") { val pa = player(d,a); val pb = player(d,b); comparison = if (pa.b("solved") != pb.b("solved")) { if (pa.b("solved")) 1 else -1 } else if (pa.b("solved")) pb.n("moves") - pa.n("moves") else pa.a("powered").size() - pb.a("powered").size() }
        if (d.s("kind") == "split_decision" && (player(d,a).n("hp") == 0 || player(d,b).n("hp") == 0)) comparison = player(d,a).n("hp") - player(d,b).n("hp")
        state.put("winnerId", if (comparison == 0) null else if (comparison > 0) a else b); state.put("finished",true); state.put("phase","finished"); state.put("phaseEndsAt",at)
    }
    private fun resolveStage(state: JsonObject) {
        val d = state.o("data"); val ids = state.fighters(); val a = ids[0]; val b = ids[1]; val commits = d.o("commits"); val scores = state.o("scores"); val outcome = obj("stageIndex" to state.n("stageIndex"))
        when (d.s("kind")) {
            "crowd_count" -> { val count = d.a("scenes")[state.n("stageIndex")].asJsonObject.n("count"); val guesses = pair(ids) { commits[it] }; ids.forEach { scores.put(it, scores.n(it) + if (guesses[it].isJsonNull) 37 else abs(guesses.n(it) - count)) }; outcome.put("count",count); outcome.put("guesses",guesses) }
            "mirror_trouble" -> { val correct = d.a("puzzles")[state.n("stageIndex")].asJsonObject.n("correct"); val choices = pair(ids) { commits[it] }; ids.forEach { scores.put(it,scores.n(it) + if (!choices[it].isJsonNull && choices.n(it) == correct) 1 else 0) }; outcome.put("correct",correct); outcome.put("choices",choices) }
            "split_decision" -> { val choices = pair(ids) { commits[it] ?: json("GUARD") }; for (id in ids) { val p = player(d,id); if (choices.s(id) == "ATTACK") p.put("energy",p.n("energy") - 1); if (choices.s(id) == "CHARGE") p.put("energy",minOf(3,p.n("energy") + 1)) }; for ((id,other) in listOf(a to b,b to a)) if (choices.s(other) == "ATTACK" && choices.s(id) != "GUARD") { val p = player(d,id); p.put("hp",maxOf(0,p.n("hp") - 1)) }; d.put("knockout", ids.any { player(d,it).n("hp") == 0 }); outcome.put("choices",choices); outcome.put("players",d.o("players")) }
            "treasure_tug" -> { val allocations = pair(ids) { commits[it] ?: json(listOf(0,0,0)) }; val points = pair(ids) { 0 }; for (lane in 0..2) { if (allocations.a(a)[lane].asInt > allocations.a(b)[lane].asInt) points.put(a,points.n(a) + lane + 1) else if (allocations.a(b)[lane].asInt > allocations.a(a)[lane].asInt) points.put(b,points.n(b) + lane + 1) }; ids.forEach { scores.put(it,scores.n(it) + points.n(it)) }; outcome.put("allocations",allocations); outcome.put("points",points) }
            "pocket_territory" -> { val cells = pair(ids) { commits[it] }; if (!cells[a].isJsonNull && cells[a] == cells[b]) d.a("board").set(cells.n(a),json("blocked")) else for (id in ids) if (!cells[id].isJsonNull) d.a("board").set(cells.n(id),json(id)); ids.forEach { scores.put(it,territoryScore(d,it)) }; outcome.put("cells",cells); outcome.put("board",d.a("board")) }
            else -> return
        }
        d.a("outcomes").add(outcome); d.put("commits",obj())
    }
    private fun beginStage(state: JsonObject, at: Long) { when (state.s("id")) { "crowd_count" -> { state.put("phase","view"); state.put("phaseEndsAt",at + 2000) }; "mirror_trouble" -> { state.put("phase","puzzle"); state.put("phaseEndsAt",at + 4000) }; else -> { state.put("phase","commit"); state.put("phaseEndsAt",at + if (state.s("id") == "treasure_tug") 7000 else 4000) } } }
    fun advance(state: JsonObject, now: Long) {
        while (!state.b("finished") && state.t("phaseEndsAt") <= now) {
            val at = state.t("phaseEndsAt"); val id = state.s("id"); val phase = state.s("phase")
            if (phase == "waiting") when (id) { "memory_heist" -> { state.put("phase","study"); state.put("phaseEndsAt",at + 4000) }; "safecracker", "circuit_sprint" -> { state.put("phase","play"); state.put("phaseEndsAt",state.t("endsAt")) }; else -> beginStage(state,at) }
            else if (id == "memory_heist" && phase == "study") { state.put("phase","draft"); state.put("phaseEndsAt",state.t("endsAt")) }
            else if (id in listOf("memory_heist","safecracker","circuit_sprint")) finish(state,at)
            else if (id == "crowd_count" && phase == "view") { state.put("phase","answer"); state.put("phaseEndsAt",at + 5000) }
            else if (phase == "reveal") { val rounds = if (id == "split_decision") 5 else if (id == "pocket_territory") 6 else 3; if (state.n("stageIndex") + 1 >= rounds || (id == "split_decision" && state.o("data").b("knockout"))) finish(state,at) else { state.put("stageIndex",state.n("stageIndex") + 1); beginStage(state,at) } }
            else { resolveStage(state); if (id == "mirror_trouble") { if (state.n("stageIndex") == 4) finish(state,at) else { state.put("stageIndex",state.n("stageIndex") + 1); beginStage(state,at) } } else { state.put("phase","reveal"); state.put("phaseEndsAt",at + 1000) } }
        }
    }
    fun nextDeadline(state: JsonObject): Long? = if (state.b("finished")) null else state.t("phaseEndsAt")
    fun process(state: JsonObject, fighterId: String, action: Map<String, Any?>, now: Long): Result = process(state,fighterId,json(action).asJsonObject,now)
    fun process(state: JsonObject, fighterId: String, action: JsonObject?, now: Long): Result {
        advance(state,now)
        fun reject(reason: String) = Result(false,reason)
        val ids = state.fighters()
        if (fighterId !in ids) return reject("Invalid actor or time")
        if (state.b("finished") || now < state.t("startsAt") || now >= state.t("endsAt") || state.s("phase") in listOf("waiting","study","view","reveal")) return reject("Not accepting actions")
        val types = listOf("MEMORY_DRAFT","COUNT_GUESS","MIRROR_PICK","CODE_GUESS","PIPE_ROTATE","DUEL_COMMIT","TREASURE_COMMIT","TERRITORY_COMMIT")
        if (action == null || action["type"]?.let { it.isJsonPrimitive && it.asJsonPrimitive.isString && it.asString == types[V2Games.ids.indexOf(state.s("id"))] } != true) return reject("Wrong action")
        val d = state.o("data"); val kind = d.s("kind"); val commits = if (d.has("commits")) d.o("commits") else null
        when (kind) {
            "memory_heist" -> { val p = player(d,fighterId); val board = action["board"]; if (p.b("locked")) return reject("Locked"); if (action["lock"]?.let { it.isJsonPrimitive && it.asJsonPrimitive.isBoolean } != true || board == null || !board.isJsonArray || board.asJsonArray.size() != 9 || !board.asJsonArray.all { it.isJsonNull || integer(it,0,5) }) return reject("Invalid board"); val symbols = board.asJsonArray.filter { !it.isJsonNull }.map { it.asInt }; if (symbols.toSet().size != symbols.size) return reject("Duplicate symbol"); p.put("board",board); p.put("locked",action["lock"].asBoolean); if (ids.all { player(d,it).b("locked") }) finish(state,now) }
            "crowd_count" -> { if (!integer(action["value"],0,36)) return reject("Invalid estimate"); if (commits!!.has(fighterId)) return reject("Locked"); commits.put(fighterId,action["value"]) }
            "mirror_trouble" -> { if (!integer(action["choice"],0,3)) return reject("Invalid choice"); if (commits!!.has(fighterId)) return reject("Locked"); commits.put(fighterId,action["choice"]) }
            "safecracker" -> { if (!array(action["symbols"],3,0,4)) return reject("Invalid code"); val p = player(d,fighterId); if (p.b("solved") || p.a("history").size() >= 5) return reject("Finished attempts"); val feedback = codeFeedback(d.a("secret").ints(),action.a("symbols").ints()); feedback.put("symbols",action["symbols"]); p.a("history").add(feedback); p.put("solved",feedback.n("exact") == 3); if (ids.all { player(d,it).let { p2 -> p2.b("solved") || p2.a("history").size() >= 5 } }) finish(state,now) }
            "circuit_sprint" -> { if (!integer(action["cell"],0,15)) return reject("Invalid cell"); val p = player(d,fighterId); if (p.b("solved")) return reject("Board locked"); val cell = action.n("cell"); p.a("rotations").set(cell,json((p.a("rotations")[cell].asInt + 1) % 4)); p.put("moves",p.n("moves") + 1); val result = evaluateCircuit(d.a("pipeKinds").map { it.asString },p.a("rotations").ints()); p.put("powered",result.powered); p.put("solved",result.solved); if (ids.all { player(d,it).b("solved") }) finish(state,now) }
            "split_decision" -> { val choice = action["choice"]; if (choice == null || !choice.isJsonPrimitive || !choice.asJsonPrimitive.isString || choice.asString !in listOf("ATTACK","GUARD","CHARGE")) return reject("Invalid choice"); if (commits!!.has(fighterId)) return reject("Locked"); if (choice.asString == "ATTACK" && player(d,fighterId).n("energy") < 1) return reject("No energy"); commits.put(fighterId,choice) }
            "treasure_tug" -> { if (!array(action["allocation"],3,0,10) || action.a("allocation").ints().sum() != 10) return reject("Invalid allocation"); if (commits!!.has(fighterId)) return reject("Locked"); commits.put(fighterId,action["allocation"]) }
            "pocket_territory" -> { val cell = action["cell"]; if (cell == null || (!cell.isJsonNull && (!integer(cell,0,24) || cell.asInt !in territoryLegalCells(board(d),fighterId)))) return reject("Illegal claim"); if (commits!!.has(fighterId)) return reject("Locked"); commits.put(fighterId,cell) }
        }
        return Result(true)
    }


    /** Allowlisted recipient view; projection never mutates authority or exposes unresolved scores. */
    fun project(authority: JsonObject, viewerId: String?, now: Long, reveal: Boolean = false): JsonObject {
        val s = authority.deepCopy(); advance(s,now); val d = s.o("data"); val ids = s.fighters(); val owner = viewerId?.takeIf { it in ids }; val config = obj("gameId" to s.s("id")); val state = obj("stageIndex" to s.n("stageIndex"),"phase" to s.s("phase"),"phaseEndsAt" to s.t("phaseEndsAt"),"finished" to s.b("finished")); val scores = pair(ids) { 0 }
        if (s.s("phase") == "waiting") return obj("config" to config,"state" to state,"scores" to scores)
        val done = s.b("finished"); val commitGame = d.has("commits")
        if (done || commitGame) s.o("scores").entrySet().forEach { (k,v) -> scores.put(k,v) }
        if (owner != null && commitGame) { val mine = obj("locked" to d.o("commits").has(owner)); if (d.o("commits").has(owner)) mine.put("commit",d.o("commits")[owner]); state.put("mine",mine) }
        when (d.s("kind")) {
            "memory_heist" -> { config.put("size",3); config.put("symbols",(0..5).toList()); if (s.s("phase") == "study" || done) config.put("board",d["answer"]); if (owner != null) state.put("mine",player(d,owner)) }
            "crowd_count" -> { config.put("totalObjects",36); config.put("minGuess",0); config.put("maxGuess",36); config.put("targetLabel","gold"); if (s.s("phase") == "view") config.put("objects",d.a("scenes")[s.n("stageIndex")].asJsonObject["objects"]) }
            "mirror_trouble" -> { val p = d.a("puzzles")[s.n("stageIndex")].asJsonObject; config.put("gridSize",5); config.put("target",p["target"]); config.put("choices",p["choices"]) }
            "safecracker" -> { config.put("symbolCount",5); config.put("codeLength",3); config.put("maxGuesses",5); if (owner != null) state.put("mine",player(d,owner)) }
            "circuit_sprint" -> { config.put("size",4); config.put("pipeKinds",d["pipeKinds"]); config.put("initialRotations",d["initialRotations"]); config.put("sourceCell",4); config.put("sinkCell",11); if (owner != null) state.put("mine",player(d,owner)) }
            "split_decision" -> { config.put("choices",listOf("ATTACK","GUARD","CHARGE")); config.put("energyCap",3); state.put("players",d["players"]) }
            "treasure_tug" -> { config.put("laneValues",listOf(1,2,3)); config.put("energy",10) }
            "pocket_territory" -> { config.put("size",5); config.put("weights",(0..24).map(::territoryWeight)); state.put("board",d["board"]); if (owner != null) state.o("mine").put("legalCells",territoryLegalCells(board(d),owner)) }
        }
        if (d.has("outcomes") && d.a("outcomes").size() > 0) state.put("outcome",d.a("outcomes").last())
        if (done) { state.put("winnerId",s["winnerId"]); state.put("recap",d); if (reveal) state.put("revealed",true) }
        return obj("config" to config,"state" to state,"scores" to scores)
    }
    fun botAction(view: JsonObject, random: () -> Double = Math::random): Map<String, Any?>? {
        val c = view.o("config"); val s = view.o("state"); val m = if (s.has("mine")) s.o("mine") else return null
        if (s.b("finished") || (m.has("locked") && m.b("locked")) || s.s("phase") in listOf("waiting","study","view","reveal")) return null
        return when (c.s("gameId")) {
            "memory_heist" -> mapOf("type" to "MEMORY_DRAFT","board" to shuffled((0..5).toList() + listOf(null,null,null),random),"lock" to true)
            "crowd_count" -> mapOf("type" to "COUNT_GUESS","value" to (6 + randomInt(random,19)))
            "mirror_trouble" -> mapOf("type" to "MIRROR_PICK","choice" to if (random() < .55) c.a("choices").indexOfFirst { shapeRotationKey(it.asJsonArray.ints()) == shapeRotationKey(c.a("target").ints()) } else randomInt(random,4))
            "safecracker" -> if (m.b("solved") || m.a("history").size() >= 5) null else mapOf("type" to "CODE_GUESS","symbols" to List(3) { randomInt(random,5) })
            "circuit_sprint" -> if (m.b("solved")) null else mapOf("type" to "PIPE_ROTATE","cell" to randomInt(random,16))
            "split_decision" -> { val energy = if (m.has("energy")) m.n("energy") else s.o("players").entrySet().minOf { it.value.asJsonObject.n("energy") }; val choices = if (energy > 0) listOf("ATTACK","GUARD","CHARGE") else listOf("GUARD","CHARGE"); mapOf("type" to "DUEL_COMMIT","choice" to choices[randomInt(random,choices.size)]) }
            "treasure_tug" -> { val a = randomInt(random,11); val b = randomInt(random,11 - a); mapOf("type" to "TREASURE_COMMIT","allocation" to listOf(a,b,10 - a - b)) }
            "pocket_territory" -> { val legal = m.a("legalCells").ints(); mapOf("type" to "TERRITORY_COMMIT","cell" to if (legal.isEmpty()) null else legal[randomInt(random,legal.size)]) }
            else -> null
        }
    }
}
