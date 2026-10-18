package com.betbrawl.app.webview

import android.net.Uri
import com.betbrawl.app.server.LanDiscovery

data class ValidatedDeepLink(
    val roomCode: String,
    val host: String,
    val port: Int
)

object DeepLinkParser {

    /**
     * Strictly parses and validates a brawl://join deep link.
     * Expected format: brawl://join?host=<IP>&port=<PORT>&room=<ROOM_CODE>
     * Rejects malformed room codes, non-private/invalid IPs, and invalid ports.
     */
    fun parse(uri: Uri?): ValidatedDeepLink? {
        if (uri == null) return null
        if (uri.scheme != "brawl" || uri.host != "join") return null

        val rawRoom = uri.getQueryParameter("room").orEmpty().trim().uppercase()
        val rawHost = uri.getQueryParameter("host").orEmpty().trim()
        val rawPort = uri.getQueryParameter("port")?.toIntOrNull() ?: 8080

        // Strict room code validation: alphanumeric, 3..12 characters
        if (!rawRoom.matches(Regex("^[A-Z0-9]{3,12}$"))) return null

        // Host validation: loopback or private RFC1918 IPv4
        if (rawHost != "127.0.0.1" && !LanDiscovery.isPrivateIPv4(rawHost)) return null

        // Port validation: valid unprivileged TCP port
        if (rawPort !in 1024..65535) return null

        return ValidatedDeepLink(rawRoom, rawHost, rawPort)
    }
}
