package com.betbrawl.app.webview

import android.content.Context
import android.webkit.JavascriptInterface
import com.betbrawl.app.MainActivity
import com.betbrawl.app.server.HostService
import com.betbrawl.app.server.LanDiscovery
import org.json.JSONArray
import org.json.JSONObject

class BrawlWebInterface(
    private val activity: MainActivity,
    private val lanDiscovery: LanDiscovery
) {

    @JavascriptInterface
    fun isAndroid(): Boolean = true

    @JavascriptInterface
    fun startHosting(playerName: String, avatar: String) {
        activity.runOnUiThread {
            HostService.start(activity, 8080)
        }
    }

    @JavascriptInterface
    fun stopHosting() {
        activity.runOnUiThread {
            HostService.stop(activity)
        }
    }

    @JavascriptInterface
    fun getDeviceIp(): String {
        return LanDiscovery.getLocalIpAddress()
    }

    @JavascriptInterface
    fun getNetworkInfoJson(): String {
        val localIp = LanDiscovery.getLocalIpAddress()
        val server = HostService.serverInstance
        val roomCode = server?.roomCode.orEmpty()
        val hasActiveRoom = server != null && roomCode.isNotEmpty()
        val playerCount = server?.players?.size ?: 0
        val port = server?.serverPort ?: 8080
        val fullUrl = "http://$localIp:$port"

        val json = JSONObject().apply {
            put("localIp", localIp)
            put("port", port)
            put("roomCode", roomCode)
            put("fullJoinUrl", fullUrl)
            put("hasActiveRoom", hasActiveRoom)
            put("playerCount", playerCount)
            val candidateArray = JSONArray().apply {
                put(fullUrl)
            }
            put("candidateUrls", candidateArray)
        }
        return json.toString()
    }

    @JavascriptInterface
    fun getDiscoveredHostsJson(): String {
        val array = JSONArray()
        for (host in lanDiscovery.discoveredRooms.values) {
            array.put(JSONObject().apply {
                put("ip", host.ip)
                put("port", host.port)
                put("roomCode", host.roomCode)
            })
        }
        return array.toString()
    }

    @JavascriptInterface
    fun onRoomCreated(roomCode: String) {
        // Can be used for native telemetry or haptics
    }
}
