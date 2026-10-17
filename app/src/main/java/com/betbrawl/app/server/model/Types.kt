package com.betbrawl.app.server.model

import com.google.gson.annotations.SerializedName

enum class GamePhase {
    ENTRY,
    LOBBY,
    FIGHTER_REVEAL,
    BETTING_WINDOW,
    MINIGAME_COUNTDOWN,
    MINIGAME_ACTIVE,
    PAYOUT_RECAP,
    FINAL_PODIUM
}

enum class TournamentStage {
    QUALIFIERS,
    CHAMPIONSHIP,
    COMPLETE
}

enum class RoundResolutionReason {
    PLAYED,
    TIE,
    DISCONNECT_FORFEIT,
    VOID
}

data class MiniGameMeta(
    val id: String,
    val name: String,
    val tagline: String,
    val durationSeconds: Int,
    val description: String,
    val rules: List<String>
)

data class PublicPlayer(
    val id: String,
    var name: String,
    var avatar: String,
    var color: String,
    var isHost: Boolean,
    var isReady: Boolean,
    var connected: Boolean = true,
    var isBot: Boolean = false,
    var coins: Int = 1000,
    var matchesWon: Int = 0,
    var matchesPlayed: Int = 0,
    var totalBetsPlaced: Int = 0,
    var totalBetsWon: Int = 0,
    var totalCoinsWonInBets: Int = 0,
    var totalCoinsLostInBets: Int = 0,
    var highestSingleBet: Int = 0,
    var highestSinglePayout: Int = 0,
    var qualifierPoints: Int = 0,
    var qualifierWins: Int = 0,
    var qualifierTies: Int = 0,
    var qualifierLosses: Int = 0,
    var qualifierMatchesPlayed: Int = 0,
    var tournamentRank: Int? = null
)

data class Player(
    val id: String,
    val sessionToken: String,
    var name: String,
    var avatar: String,
    var color: String,
    var isHost: Boolean,
    var isReady: Boolean,
    var connected: Boolean = true,
    var isBot: Boolean = false,
    var coins: Int = 1000,
    var matchesWon: Int = 0,
    var matchesPlayed: Int = 0,
    var totalBetsPlaced: Int = 0,
    var totalBetsWon: Int = 0,
    var totalCoinsWonInBets: Int = 0,
    var totalCoinsLostInBets: Int = 0,
    var highestSingleBet: Int = 0,
    var highestSinglePayout: Int = 0,
    var qualifierPoints: Int = 0,
    var qualifierWins: Int = 0,
    var qualifierTies: Int = 0,
    var qualifierLosses: Int = 0,
    var qualifierMatchesPlayed: Int = 0,
    var tournamentRank: Int? = null
) {
    fun toPublicPlayer(): PublicPlayer = PublicPlayer(
        id = id,
        name = name,
        avatar = avatar,
        color = color,
        isHost = isHost,
        isReady = isReady,
        connected = connected,
        isBot = isBot,
        coins = coins,
        matchesWon = matchesWon,
        matchesPlayed = matchesPlayed,
        totalBetsPlaced = totalBetsPlaced,
        totalBetsWon = totalBetsWon,
        totalCoinsWonInBets = totalCoinsWonInBets,
        totalCoinsLostInBets = totalCoinsLostInBets,
        highestSingleBet = highestSingleBet,
        highestSinglePayout = highestSinglePayout,
        qualifierPoints = qualifierPoints,
        qualifierWins = qualifierWins,
        qualifierTies = qualifierTies,
        qualifierLosses = qualifierLosses,
        qualifierMatchesPlayed = qualifierMatchesPlayed,
        tournamentRank = tournamentRank
    )
}

data class FighterOdds(
    val fighterId: String,
    val decimalOdds: Double,
    val smoothedWinRate: Double,
    val totalPoolCoins: Int,
    val bettorCount: Int
)

data class SecretBet(
    val bettorId: String,
    val fighterId: String,
    val amount: Int,
    val oddsAtBet: Double,
    val timestamp: Long,
    val potentialReturn: Int
)

data class RoundPayoutItem(
    val playerId: String,
    val playerName: String,
    val avatar: String,
    val type: String, // 'FIGHTER_BOUNTY' | 'BET_WIN' | 'BET_LOSS' | 'BET_REFUND'
    val stake: Int? = null,
    val totalReturn: Int? = null,
    val netChange: Int,
    val newBankroll: Int,
    val summary: String
)

data class TournamentMatch(
    val matchIndex: Int,
    val roundNumber: Int,
    val fighterIds: List<String>,
    val isChampionship: Boolean = false,
    val championshipGameNumber: Int? = null,
    var completed: Boolean = false,
    var winnerId: String? = null,
    var tieResult: Boolean = false,
    var resolutionReason: RoundResolutionReason = RoundResolutionReason.PLAYED
)

data class TournamentSchedule(
    var stage: TournamentStage,
    val totalPlayers: Int,
    val qualifierCount: Int,
    var qualifiersCompleted: Int,
    val totalRounds: Int,
    val matches: MutableList<TournamentMatch>,
    var finalists: List<String>? = null,
    val championshipWins: MutableMap<String, Int> = mutableMapOf(),
    var championshipGamesPlayed: Int = 0,
    var championId: String? = null,
    var runnerUpId: String? = null,
    var thirdPlaceId: String? = null,
    val stableRosterOrder: List<String>
)

data class RoundState(
    val roundNumber: Int,
    val maxRounds: Int,
    var stage: TournamentStage = TournamentStage.QUALIFIERS,
    var qualifierIndex: Int? = null,
    var qualifierTotal: Int? = null,
    var championshipGameNumber: Int? = null,
    val miniGame: MiniGameMeta,
    val fighterIds: List<String>,
    val matchPot: Int,
    var odds: Map<String, FighterOdds>,
    val bets: MutableList<SecretBet> = mutableListOf(),
    var bettingTimeRemaining: Int = 15,
    var gameTimeRemaining: Int = 0,
    var winnerId: String? = null,
    var tieResult: Boolean = false,
    var resolutionReason: RoundResolutionReason = RoundResolutionReason.PLAYED,
    var isChampionship: Boolean = false,
    val fighterScores: MutableMap<String, Int> = mutableMapOf(),
    var payouts: List<RoundPayoutItem> = emptyList(),
    var revealEndsAt: Long = 0L,
    var bettingEndsAt: Long = 0L,
    var gameStartsAt: Long = 0L,
    var gameEndsAt: Long = 0L,
    var gameConfig: Map<String, Any?>? = null,
    var gameState: Map<String, Any?>? = null
)

data class Award(
    val id: String,
    val title: String,
    val icon: String,
    val badgeColor: String,
    val recipientId: String,
    val recipientName: String,
    val description: String,
    val metric: String
)

data class RoundHistoryItem(
    val roundNumber: Int,
    val miniGameName: String,
    val winnerName: String,
    val totalPotWon: Int,
    val isChampionship: Boolean = false,
    val championshipGameNumber: Int? = null,
    val resolutionReason: RoundResolutionReason = RoundResolutionReason.PLAYED
)

data class PublicRoomState(
    val roomId: String,
    val roomCode: String,
    val phase: GamePhase,
    val players: List<PublicPlayer>,
    val totalRounds: Int,
    val currentRound: RoundState?,
    val tournamentSchedule: TournamentSchedule?,
    val roundHistory: List<RoundHistoryItem>,
    val awards: List<Award>,
    val debugMode: Boolean = false
)

data class RoomNetworkInfo(
    val localIp: String,
    val port: Int,
    val roomCode: String,
    val fullJoinUrl: String,
    val hasActiveRoom: Boolean = false,
    val playerCount: Int = 0,
    val candidateUrls: List<String> = emptyList()
)
