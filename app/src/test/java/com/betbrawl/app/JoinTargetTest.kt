package com.betbrawl.app

import com.betbrawl.app.server.LanDiscovery
import com.betbrawl.app.webview.DeepLinkParser
import org.junit.Assert.*
import org.junit.Test

class JoinTargetTest {
    @Test fun privateAddressesRequireExactlyFourNumericOctets() {
        for (ip in listOf("10.bad.1.2.3", "10.1.2.999", "10.1.2.-1", "10.1.2.3x", "127.0.0.1", "169.254.1.1", "8.8.8.8")) {
            assertFalse(ip, LanDiscovery.isPrivateIPv4(ip))
        }
        for (ip in listOf("10.1.2.3", "172.16.0.1", "172.31.255.254", "192.168.1.2")) {
            assertTrue(ip, LanDiscovery.isPrivateIPv4(ip))
        }
    }

    @Test fun joinLinksPreserveExactTargetAndRejectAmbiguousOrUnsafeTargets() {
        val link = DeepLinkParser.parse("brawl://join?host=192.168.1.42&port=8181&room=ABC123")!!
        assertEquals("192.168.1.42", link.host)
        assertEquals(8181, link.port)
        assertEquals("ABC123", link.roomCode)
        assertEquals(8080, DeepLinkParser.parse("brawl://join?host=192.168.1.42&room=ABC123")!!.port)
        for (query in listOf(
            "host=127.0.0.1&room=ABC123", "host=169.254.1.1&room=ABC123",
            "host=10.bad.1.2.3&room=ABC123", "host=192.168.1.42&port=abc&room=ABC123",
            "host=192.168.1.42&port=0&room=ABC123", "host=192.168.1.42&port=65536&room=ABC123",
            "host=192.168.1.42&port=8080&port=8181&room=ABC123",
            "host=192.168.1.42&host=10.0.0.1&room=ABC123",
            "host=192.168.1.42&room=ABC123&room=ZZZ999"
        )) assertNull(query, DeepLinkParser.parse("brawl://join?$query"))
        assertNull(DeepLinkParser.parse("file:///android_asset/web/index.html?room=ABC123"))
    }
}
