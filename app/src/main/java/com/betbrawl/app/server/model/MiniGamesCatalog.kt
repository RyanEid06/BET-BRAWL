package com.betbrawl.app.server.model

import kotlin.math.*
import kotlin.random.Random

data class MathQuestion(
    val q: String,
    val choices: List<Int>,
    val correct: Int
)

data class HigherLowerTrivia(
    val baseItem: String,
    val baseStat: String,
    val baseValue: Double,
    val challengerItem: String,
    val challengerStat: String,
    val challengerValue: Double,
    val isHigher: Boolean
)

data class CityLocation(
    val city: String,
    val country: String,
    val lat: Double,
    val lon: Double
)

object MiniGamesCatalog {

    val MINI_GAMES: Map<String, MiniGameMeta> = mapOf(
        "millisecond_stop" to MiniGameMeta(
            id = "millisecond_stop",
            name = "Millisecond Stop",
            tagline = "Internal Clock Showdown",
            durationSeconds = 9,
            description = "The timer counts toward 05.000s. At 03.000s the display blinds out into ??.??? Tap as close to 05.000s as you can.",
            rules = listOf(
                "Watch the live counter until 03.000s",
                "At 03.000s the clock blinds out into ??.??? for all players",
                "Tap SLAM as close to 05.000s as possible",
                "Closest tap to 5.000s wins the Brawl"
            )
        ),
        "rapid_red_green" to MiniGameMeta(
            id = "rapid_red_green",
            name = "Rapid Red Light, Green Light",
            tagline = "Reflex Sprint",
            durationSeconds = 15,
            description = "Screens flip between Green and Red unpredictably. Mash on Green (+1), freeze on Red (-3). First to 40 or leader at 15s wins.",
            rules = listOf(
                "Tap rapidly while GREEN (+1 point)",
                "FREEZE immediately when RED appears",
                "Tapping on RED deducts 3 points!",
                "First to 40 points or highest score at timeout wins; tie if equal"
            )
        ),
        "speed_math" to MiniGameMeta(
            id = "speed_math",
            name = "Speed Math",
            tagline = "Mental Sprint",
            durationSeconds = 16,
            description = "A rapid 3-question arithmetic race. Fastest fighter to lock 3 correct answers wins.",
            rules = listOf(
                "Solve 3 mental math problems back to back",
                "Pick from 4 answer choices",
                "Mistakes trigger an authoritative 1.5s freeze penalty",
                "First fighter to 3 correct answers or highest at timeout wins"
            )
        ),
        "higher_lower" to MiniGameMeta(
            id = "higher_lower",
            name = "Higher or Lower",
            tagline = "Stat Showdown",
            durationSeconds = 18,
            description = "Compare stable real-world stats. Is the second item higher or lower than the first? First to 3 correct wins.",
            rules = listOf(
                "Read the baseline statistic on the card",
                "Guess whether the challenger is HIGHER or LOWER",
                "First to 3 correct locks wins (or highest score at timeout; explicit tie if equal)"
            )
        ),
        "blind_pinpoint" to MiniGameMeta(
            id = "blind_pinpoint",
            name = "Blind Pinpoint",
            tagline = "Geoguess-Lite",
            durationSeconds = 15,
            description = "A target city is displayed on an equirectangular world map. Tap where you think it is located. Closest distance in km wins.",
            rules = listOf(
                "Read the target world city and country",
                "Tap your pin on the accurate equirectangular world map",
                "Distance error is calculated with the Haversine formula in genuine km",
                "Smallest distance error wins"
            )
        ),
        "quick_draw" to MiniGameMeta(
            id = "quick_draw",
            name = "Quick Draw",
            tagline = "Fastest Finger",
            durationSeconds = 10,
            description = "Watch the screen closely. When \"DRAW!\" flashes, tap instantly! Tapping before \"DRAW!\" is an instant false-start disqualification.",
            rules = listOf(
                "Wait on high alert during the \"WAIT...\" phase",
                "DO NOT tap early (instant false-start foul!)",
                "When \"DRAW!\" flashes, tap as fast as humanly possible",
                "Fastest valid reaction time wins"
            )
        )
    )

    val STABLE_HIGHER_LOWER_BANK: List<HigherLowerTrivia> = listOf(
        HigherLowerTrivia("Eiffel Tower Height", "330 Meters", 330.0, "Empire State Building Height", "381 Meters", 381.0, true),
        HigherLowerTrivia("Speed of Sound in Air", "1,235 km/h", 1235.0, "Cruising Speed of Boeing 747", "920 km/h", 920.0, false),
        HigherLowerTrivia("Mount Everest Elevation", "8,849 Meters", 8849.0, "Mount Kilimanjaro Elevation", "5,895 Meters", 5895.0, false),
        HigherLowerTrivia("Apollo 11 Moon Landing", "Year 1969", 1969.0, "First Commercial Jet Flight", "Year 1952", 1952.0, false),
        HigherLowerTrivia("Great Pyramid of Giza Height", "139 Meters", 139.0, "Statue of Liberty Total Height", "93 Meters", 93.0, false),
        HigherLowerTrivia("Amazon River Length", "6,400 km", 6400.0, "Nile River Length", "6,650 km", 6650.0, true),
        HigherLowerTrivia("Moon Surface Gravity", "1.62 m/s²", 1.62, "Mars Surface Gravity", "3.72 m/s²", 3.72, true),
        HigherLowerTrivia("Blue Whale Max Weight", "190 Metric Tons", 190.0, "Boeing 737 Empty Weight", "42 Metric Tons", 42.0, false),
        HigherLowerTrivia("Deepest Point in Ocean (Challenger Deep)", "10,928 Meters", 10928.0, "Height of Mount Everest", "8,849 Meters", 8849.0, false),
        HigherLowerTrivia("Commercial Plane Cruising Altitude", "11,000 Meters", 11000.0, "Low Earth Orbit (ISS)", "408,000 Meters", 408000.0, true),
        HigherLowerTrivia("Bicycle Speed Record", "296 km/h", 296.0, "Formula 1 Top Race Speed", "372 km/h", 372.0, true),
        HigherLowerTrivia("Diameter of Moon", "3,474 km", 3474.0, "Diameter of Planet Mercury", "4,879 km", 4879.0, true),
        HigherLowerTrivia("Golden Gate Bridge Length", "2,737 Meters", 2737.0, "Brooklyn Bridge Length", "1,825 Meters", 1825.0, false),
        HigherLowerTrivia("Boiling Point of Water", "100 °C", 100.0, "Melting Point of Lead", "327 °C", 327.0, true)
    )

    val WORLD_CITIES: List<CityLocation> = listOf(
        CityLocation("Paris", "France", 48.8566, 2.3522),
        CityLocation("Tokyo", "Japan", 35.6762, 139.6503),
        CityLocation("New York", "United States", 40.7128, -74.0060),
        CityLocation("Cairo", "Egypt", 30.0444, 31.2357),
        CityLocation("Sydney", "Australia", -33.8688, 151.2093),
        CityLocation("Rio de Janeiro", "Brazil", -22.9068, -43.1729),
        CityLocation("London", "United Kingdom", 51.5074, -0.1278),
        CityLocation("Cape Town", "South Africa", -33.9249, 18.4241),
        CityLocation("Rome", "Italy", 41.9028, 12.4964),
        CityLocation("Toronto", "Canada", 43.6532, -79.3832),
        CityLocation("Mumbai", "India", 19.0760, 72.8777),
        CityLocation("Buenos Aires", "Argentina", -34.6037, -58.3816)
    )

    fun generateMathQuestions(count: Int = 3): List<MathQuestion> {
        val questions = mutableListOf<MathQuestion>()
        val operators = listOf("+", "-", "×")

        for (i in 0 until count) {
            val op = operators[Random.nextInt(operators.size)]
            val a: Int
            val b: Int
            val correct: Int

            when (op) {
                "+" -> {
                    a = Random.nextInt(15, 60)
                    b = Random.nextInt(15, 60)
                    correct = a + b
                }
                "-" -> {
                    a = Random.nextInt(40, 95)
                    b = Random.nextInt(12, 47)
                    correct = a - b
                }
                else -> {
                    a = Random.nextInt(6, 16)
                    b = Random.nextInt(4, 13)
                    correct = a * b
                }
            }

            val wrongDeltas = listOf(-10, -2, 2, 10, -1, 1, -3, 3).shuffled()
            val choicesSet = mutableSetOf(correct)

            for (delta in wrongDeltas) {
                if (choicesSet.size >= 4) break
                val wrong = correct + delta
                if (wrong > 0 && wrong != correct) {
                    choicesSet.add(wrong)
                }
            }

            while (choicesSet.size < 4) {
                choicesSet.add(correct + Random.nextInt(-10, 11))
            }

            questions.add(MathQuestion("$a $op $b", choicesSet.shuffled(), correct))
        }

        return questions
    }

    fun calculateHaversineKm(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Int {
        val r = 6371.0 // Earth radius in km
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2).pow(2) + cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2).pow(2)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return (r * c).roundToInt()
    }

    fun normCoordsToLatLon(normX: Double, normY: Double): Pair<Double, Double> {
        val lon = normX * 360.0 - 180.0
        val lat = 90.0 - normY * 180.0
        return Pair(lat, lon)
    }
}
