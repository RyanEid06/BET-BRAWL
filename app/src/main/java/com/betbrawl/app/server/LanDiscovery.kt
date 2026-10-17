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

class LanDiscovery(private val context: Context) {

    private val nsdManager = context.getSystemService(Context.NSD_SERVICE) as? NsdManager
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var udpBroadcastJob: Job? = null
    private var udpListenJob: Job? = null
    private var registrationListener: NsdManager.RegistrationListener? = null

    val discoveredRooms = mutableMapOf<String, DiscoveredHost>()

    data class DiscoveredHost(
        val ip: String,
        val port: Int,
        val roomCode: String,
        val timestamp: Long = System.currentTimeMillis()
    )

    fun registerService(port: Int, roomCode: String) {
        // 1. Register mDNS via Android NSD
        try {
            val serviceInfo = NsdServiceInfo().apply {
                serviceName = "BetBrawl_$roomCode"
                serviceType = "_brawl._tcp."
                this.port = port
            }

            registrationListener = object : NsdManager.RegistrationListener {
                override fun onServiceRegistered(NsdServiceInfo: NsdServiceInfo) {
                    println("[LanDiscovery] mDNS Service registered: ${NsdServiceInfo.serviceName}")
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
                        val roomCode = json.optString("roomCode")
                        if (ip != null && roomCode.isNotEmpty()) {
                            val host = DiscoveredHost(ip, port, roomCode)
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
    }

    fun stop() {
        udpBroadcastJob?.cancel()
        udpBroadcastJob = null
        udpListenJob?.cancel()
        udpListenJob = null

        try {
            registrationListener?.let { nsdManager?.unregisterService(it) }
        } catch (e: Exception) {
            // Ignore
        }
        registrationListener = null
        scope.cancel()
    }

    companion object {
        const val UDP_BEACON_PORT = 8888

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
                            // Prefer RFC1918 private LAN addresses
                            if (ip.startsWith("192.168.") || ip.startsWith("10.") || ip.startsWith("172.")) {
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
