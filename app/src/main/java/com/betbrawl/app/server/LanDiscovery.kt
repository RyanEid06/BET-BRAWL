package com.betbrawl.app.server

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.NetworkInterface
import java.util.concurrent.ConcurrentHashMap

class LanDiscovery(private val context: Context) {

    private val nsdManager = context.getSystemService(Context.NSD_SERVICE) as? NsdManager
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var udpBroadcastJob: Job? = null
    private var udpListenJob: Job? = null
    private var ttlPruneJob: Job? = null
    private var registrationListener: NsdManager.RegistrationListener? = null
    private var discoveryListener: NsdManager.DiscoveryListener? = null

    val discoveredRooms = ConcurrentHashMap<String, DiscoveredHost>()

    data class DiscoveredHost(
        val ip: String,
        val port: Int,
        val roomCode: String,
        var timestamp: Long = System.currentTimeMillis()
    )

    fun stopAdvertising() {
        udpBroadcastJob?.cancel()
        udpBroadcastJob = null
        try {
            registrationListener?.let { nsdManager?.unregisterService(it) }
        } catch (e: Exception) {
            // Ignore
        }
        registrationListener = null
    }

    fun registerService(port: Int, roomCode: String) {
        stopAdvertising()
        // 1. Register mDNS via Android NSD
        try {
            val serviceInfo = NsdServiceInfo().apply {
                serviceName = "BetBrawl_$roomCode"
                serviceType = "_brawl._tcp."
                this.port = port
            }

            registrationListener = object : NsdManager.RegistrationListener {
                override fun onServiceRegistered(serviceInfo: NsdServiceInfo) {
                    println("[LanDiscovery] mDNS Service registered: ${serviceInfo.serviceName}")
                }
                override fun onRegistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                    System.err.println("[LanDiscovery] mDNS registration failed: $errorCode")
                }
                override fun onServiceUnregistered(arg0: NsdServiceInfo) {}
                override fun onUnregistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {}
            }

            nsdManager?.registerService(serviceInfo, NsdManager.PROTOCOL_DNS_SD, registrationListener)
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // 2. Start periodic UDP broadcast beacon as reliable Wi-Fi fallback
        udpBroadcastJob?.cancel()
        udpBroadcastJob = scope.launch {
            val socket = try {
                DatagramSocket().apply { broadcast = true }
            } catch (e: Exception) {
                null
            } ?: return@launch

            val localIp = getLocalIpAddress()
            val beaconJson = JSONObject().apply {
                put("app", "BET_BRAWL")
                put("ip", localIp)
                put("port", port)
                put("roomCode", roomCode)
            }.toString().toByteArray()

            val broadcastAddr = InetAddress.getByName("255.255.255.255")
            val packet = DatagramPacket(beaconJson, beaconJson.size, broadcastAddr, UDP_BEACON_PORT)

            while (isActive) {
                try {
                    socket.send(packet)
                } catch (e: Exception) {
                    // Ignore broadcast send errors
                }
                delay(2000L)
            }
            socket.close()
        }
    }

    fun startListening(onRoomDiscovered: ((DiscoveredHost) -> Unit)? = null) {
        // 1. Android NSD Discovery
        startNsdDiscovery(onRoomDiscovered)

        // 2. UDP Beacon Listener fallback
        udpListenJob?.cancel()
        udpListenJob = scope.launch {
            val socket = try {
                DatagramSocket(UDP_BEACON_PORT).apply { reuseAddress = true }
            } catch (e: Exception) {
                null
            } ?: return@launch

            val buffer = ByteArray(1024)
            val packet = DatagramPacket(buffer, buffer.size)

            while (isActive) {
                try {
                    socket.receive(packet)
                    val text = String(packet.data, 0, packet.length)
                    val json = JSONObject(text)
                    if (json.optString("app") == "BET_BRAWL") {
                        val ip = json.optString("ip").ifEmpty { packet.address.hostAddress }
                        val port = json.optInt("port", 8080)
                        val roomCode = json.optString("roomCode").trim().uppercase()
                        if (ip != null && isPrivateIPv4(ip) && roomCode.isNotEmpty()) {
                            val host = DiscoveredHost(ip, port, roomCode, System.currentTimeMillis())
                            discoveredRooms[roomCode] = host
                            onRoomDiscovered?.invoke(host)
                        }
                    }
                } catch (e: Exception) {
                    // Ignore packet errors
                }
            }
            socket.close()
        }

        // 3. Stale room TTL pruning (15s TTL)
        ttlPruneJob?.cancel()
        ttlPruneJob = scope.launch {
            while (isActive) {
                delay(5000L)
                val now = System.currentTimeMillis()
                val stale = discoveredRooms.entries.filter { now - it.value.timestamp > ROOM_TTL_MS }
                for (entry in stale) {
                    discoveredRooms.remove(entry.key)
                }
            }
        }
    }

    private fun startNsdDiscovery(onRoomDiscovered: ((DiscoveredHost) -> Unit)?) {
        try {
            discoveryListener = object : NsdManager.DiscoveryListener {
                override fun onDiscoveryStarted(regType: String) {}

                override fun onServiceFound(service: NsdServiceInfo) {
                    if (service.serviceType.contains("_brawl")) {
                        try {
                            nsdManager?.resolveService(service, object : NsdManager.ResolveListener {
                                override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {}

                                override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                                    val hostAddress = serviceInfo.host?.hostAddress
                                    val port = serviceInfo.port
                                    val name = serviceInfo.serviceName
                                    val roomCode = if (name.startsWith("BetBrawl_")) {
                                        name.substringAfter("BetBrawl_").trim().uppercase()
                                    } else {
                                        name.trim().uppercase()
                                    }

                                    if (hostAddress != null && isPrivateIPv4(hostAddress) && roomCode.isNotEmpty()) {
                                        val host = DiscoveredHost(hostAddress, port, roomCode, System.currentTimeMillis())
                                        discoveredRooms[roomCode] = host
                                        onRoomDiscovered?.invoke(host)
                                    }
                                }
                            })
                        } catch (e: Exception) {
                            // Resolve error
                        }
                    }
                }

                override fun onServiceLost(service: NsdServiceInfo) {
                    val name = service.serviceName
                    val roomCode = if (name.startsWith("BetBrawl_")) {
                        name.substringAfter("BetBrawl_").trim().uppercase()
                    } else {
                        name.trim().uppercase()
                    }
                    discoveredRooms.remove(roomCode)
                }

                override fun onDiscoveryStopped(serviceType: String) {}
                override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {}
                override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
            }

            nsdManager?.discoverServices("_brawl._tcp.", NsdManager.PROTOCOL_DNS_SD, discoveryListener)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun stop() {
        stopAdvertising()
        udpListenJob?.cancel()
        udpListenJob = null
        ttlPruneJob?.cancel()
        ttlPruneJob = null

        try {
            discoveryListener?.let { nsdManager?.stopServiceDiscovery(it) }
        } catch (e: Exception) {
            // Ignore
        }
        discoveryListener = null
        scope.cancel()
    }

    companion object {
        const val UDP_BEACON_PORT = 8888
        const val ROOM_TTL_MS = 15000L

        fun isPrivateIPv4(ip: String): Boolean {
            val parts = ip.split('.').mapNotNull { it.toIntOrNull() }
            if (parts.size != 4) return false
            val (p0, p1, p2, p3) = parts
            if (p0 !in 0..255 || p1 !in 0..255 || p2 !in 0..255 || p3 !in 0..255) return false

            // Reject loopback (127.0.0.0/8) and link-local (169.254.0.0/16)
            if (p0 == 127 || (p0 == 169 && p1 == 254)) return false

            // 10.0.0.0/8
            if (p0 == 10) return true
            // 172.16.0.0/12 (172.16.x.x - 172.31.x.x)
            if (p0 == 172 && p1 in 16..31) return true
            // 192.168.0.0/16
            if (p0 == 192 && p1 == 168) return true

            return false
        }

        fun getLocalIpAddress(): String {
            try {
                val interfaces = NetworkInterface.getNetworkInterfaces()
                while (interfaces.hasMoreElements()) {
                    val networkInterface = interfaces.nextElement()
                    if (networkInterface.isLoopback || !networkInterface.isUp) continue

                    val addresses = networkInterface.inetAddresses
                    while (addresses.hasMoreElements()) {
                        val address = addresses.nextElement()
                        if (!address.isLoopbackAddress && address.hostAddress?.indexOf(':') == -1) {
                            val ip = address.hostAddress ?: ""
                            // Strictly validate private RFC1918 IPv4
                            if (isPrivateIPv4(ip)) {
                                return ip
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
            return "127.0.0.1"
        }
    }
}
