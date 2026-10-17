package com.betbrawl.app.webview

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import com.betbrawl.app.server.HostService
import com.betbrawl.app.server.LanDiscovery

class BrawlWebViewClient : WebViewClient() {

    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
        val uri = request?.url ?: return false
        val scheme = uri.scheme

        // Support brawl://join custom deep links
        if (scheme == "brawl" && uri.host == "join") {
            val roomCode = uri.getQueryParameter("room").orEmpty()
            val host = uri.getQueryParameter("host").orEmpty()
            val port = uri.getQueryParameter("port")?.toIntOrNull() ?: 8080
            val js = "if (window.onDeepLinkJoin) { window.onDeepLinkJoin('$roomCode', '$host', $port); }"
            view?.evaluateJavascript(js, null)
            return true
        }

        // Allow loading local bundled assets
        if (scheme == "file" || uri.host == "localhost" || uri.host == "127.0.0.1") {
            return false
        }

        // Block arbitrary external navigation within the game container
        return true
    }

    override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
        super.onPageStarted(view, url, favicon)
        // Inject global configuration before page scripts execute
        val localIp = LanDiscovery.getLocalIpAddress()
        val server = HostService.serverInstance
        val isHosting = server != null
        val port = server?.serverPort ?: 8080

        val configJs = """
            window.BETBRAWL_CONFIG = {
                isAndroid: true,
                isHost: $isHosting,
                hostIp: '$localIp',
                wsPort: $port,
                wsUrl: 'ws://127.0.0.1:$port/ws'
            };
        """.trimIndent()
        view?.evaluateJavascript(configJs, null)
    }
}
