package com.betbrawl.app.webview

import android.net.Uri
import com.betbrawl.app.server.LanDiscovery
import java.net.URI
import java.net.URLDecoder

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
        return uri?.let { parse(it.toString()) }
    }

    fun parse(rawUri: String): ValidatedDeepLink? {
      return try {
        val uri = URI(rawUri)
        if (uri.scheme != "brawl" || uri.rawAuthority != "join" || uri.fragment != null) return null
        val parameters = uri.rawQuery.orEmpty().split('&').map { part ->
            val pair = part.split('=', limit = 2)
            URLDecoder.decode(pair[0], "UTF-8") to URLDecoder.decode(pair.getOrElse(1) { "" }, "UTF-8")
        }
        if (listOf("room", "host", "port").any { key -> parameters.count { it.first == key } > 1 }) return null
        val values = parameters.toMap()
        val rawRoom = values["room"].orEmpty().trim().uppercase()
        val rawHost = values["host"].orEmpty().trim()
        val rawPort = if (values.containsKey("port")) values["port"]?.toIntOrNull() ?: return null else 8080

        // Strict room code validation: alphanumeric, 3..12 characters
        if (!rawRoom.matches(Regex("^[A-Z0-9]{3,12}$"))) return null

        // Guest links must point to another reachable LAN device.
        if (!LanDiscovery.isPrivateIPv4(rawHost)) return null

        // Port validation: valid unprivileged TCP port
        if (rawPort !in 1024..65535) return null

        ValidatedDeepLink(rawRoom, rawHost, rawPort)
    } catch (_: Exception) {
        null
      }
    }
}
