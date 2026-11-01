package com.betbrawl.app.webview

import android.content.Intent
import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import com.betbrawl.app.server.HostService
import com.betbrawl.app.server.LanDiscovery

class BrawlWebViewClient(context: Context) : WebViewClient() {
    // HTTP keeps the bundled page compatible with the existing LAN ws:// hosts.
    private val assetLoader = WebViewAssetLoader.Builder()
        .setHttpAllowed(true)
        .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
        .build()

    override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest): WebResourceResponse? {
        return assetLoader.shouldInterceptRequest(request.url)
            ?: super.shouldInterceptRequest(view, request)
    }

    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
        val uri = request?.url ?: return false
        val scheme = uri.scheme

        // Support brawl://join custom deep links
        if (scheme == "brawl" && uri.host == "join") {
            val validLink = DeepLinkParser.parse(uri)
            if (validLink != null) {
                val payload = org.json.JSONObject().apply {
                    put("room", validLink.roomCode)
                    put("host", validLink.host)
                    put("port", validLink.port)
                }
                val js = "if (typeof window.onDeepLinkJoin === 'function') { window.onDeepLinkJoin($payload); }"
                view?.evaluateJavascript(js, null)
            }
            return true
        }

        // Allow loading local bundled assets
        if ((scheme == "http" && uri.host == WebViewAssetLoader.DEFAULT_DOMAIN && uri.path?.startsWith("/assets/") == true)
            || uri.host == "localhost" || uri.host == "127.0.0.1") {
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
