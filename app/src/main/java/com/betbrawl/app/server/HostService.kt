package com.betbrawl.app.server

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.betbrawl.app.MainActivity
import com.betbrawl.app.R

class HostService : Service() {

    private var lanDiscovery: LanDiscovery? = null
    private var advertisedRoomCode: String? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        if (action == ACTION_STOP_HOSTING) {
            stopHosting()
            stopSelf()
            return START_NOT_STICKY
        }

        val port = intent?.getIntExtra(EXTRA_PORT, 8080) ?: 8080

        if (serverInstance == null) {
            val server = BrawlWebSocketServer("0.0.0.0", port) { roomState ->
                val currentRoomCode = roomState.roomCode
                if (currentRoomCode.isNotEmpty()) {
                    if (lanDiscovery == null) {
                        lanDiscovery = LanDiscovery(applicationContext)
                    }
                    if (advertisedRoomCode != currentRoomCode) {
                        advertisedRoomCode = currentRoomCode
                        lanDiscovery?.registerService(port, currentRoomCode)
                    }
                } else {
                    // Room closed or reset
                    advertisedRoomCode = null
                    lanDiscovery?.stopAdvertising()
                    if (roomState.phase == com.betbrawl.app.server.model.GamePhase.ENTRY) {
                        stopHosting()
                        stopSelf()
                    }
                }
            }
            try {
                server.start()
                serverInstance = server
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        val notification = createNotification()
        startForeground(NOTIFICATION_ID, notification)

        return START_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.host_service_channel_name),
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getString(R.string.host_service_channel_desc)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.host_service_title))
            .setContentText(getString(R.string.host_service_text))
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    private fun stopHosting() {
        advertisedRoomCode = null
        lanDiscovery?.stop()
        lanDiscovery = null
        serverInstance?.stopServer()
        serverInstance = null
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
    }

    override fun onDestroy() {
        stopHosting()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val CHANNEL_ID = "betbrawl_host_channel"
        const val NOTIFICATION_ID = 1001
        const val ACTION_START_HOSTING = "com.betbrawl.app.START_HOSTING"
        const val ACTION_STOP_HOSTING = "com.betbrawl.app.STOP_HOSTING"
        const val EXTRA_PORT = "extra_port"

        @Volatile
        var serverInstance: BrawlWebSocketServer? = null
            private set

        fun start(context: Context, port: Int = 8080) {
            val intent = Intent(context, HostService::class.java).apply {
                action = ACTION_START_HOSTING
                putExtra(EXTRA_PORT, port)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, HostService::class.java).apply {
                action = ACTION_STOP_HOSTING
            }
            context.startService(intent)
        }
    }
}
