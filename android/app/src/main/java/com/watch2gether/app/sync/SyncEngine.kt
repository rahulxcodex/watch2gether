package com.watch2gether.app.sync

import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.net.URI
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "SyncEngine"

/** Events emitted to the UI layer */
sealed class SyncEvent {
    data class PlaybackChanged(val position: Double, val playing: Boolean, val version: Long) : SyncEvent()
    data class MediaChanged(val url: String) : SyncEvent()
    data class ChatReceived(val senderId: String, val nickname: String, val content: String, val timestamp: Long) : SyncEvent()
    data class ReactionReceived(val emoji: String, val nickname: String) : SyncEvent()
    data class ParticipantJoined(val id: String, val nickname: String) : SyncEvent()
    data class ParticipantLeft(val id: String, val nickname: String) : SyncEvent()
    data class ClockSynced(val offsetMs: Long) : SyncEvent()
    data class Error(val message: String) : SyncEvent()
}

@Singleton
class SyncEngine @Inject constructor() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private var socket: Socket? = null
    private var clockOffsetMs: Long = 0L
    private var currentRoomId: String? = null
    private var authToken: String? = null

    private val _events = MutableSharedFlow<SyncEvent>(extraBufferCapacity = 64)
    val events: SharedFlow<SyncEvent> = _events.asSharedFlow()

    private val _connected = MutableStateFlow(false)
    val connected: StateFlow<Boolean> = _connected.asStateFlow()

    fun connect(socketUrl: String, token: String, roomId: String) {
        authToken = token
        currentRoomId = roomId
        try {
            val opts = IO.Options.builder()
                .setAuth(mapOf("token" to token))
                .setReconnection(true)
                .setReconnectionAttempts(10)
                .build()
            socket = IO.socket(URI.create(socketUrl), opts)
            registerHandlers()
            socket?.connect()
        } catch (e: Exception) {
            Log.e(TAG, "Socket connection error", e)
            emit(SyncEvent.Error("Connection failed: ${e.message}"))
        }
    }

    private fun registerHandlers() {
        val s = socket ?: return

        s.on(Socket.EVENT_CONNECT) {
            Log.d(TAG, "Connected. Joining room $currentRoomId")
            _connected.value = true
            s.emit("room:join", JSONObject().apply { put("roomId", currentRoomId) })
            performNtpHandshake()
        }

        s.on(Socket.EVENT_DISCONNECT) {
            Log.d(TAG, "Disconnected")
            _connected.value = false
        }

        s.on("sync:pong") { args ->
            val data = args[0] as? JSONObject ?: return@on
            val t0 = data.getLong("t0")
            val t1 = data.getLong("t1")
            val t2 = data.getLong("t2")
            val t3 = System.currentTimeMillis()
            // Cristian's algorithm: offset = ((t1-t0) + (t2-t3)) / 2
            clockOffsetMs = ((t1 - t0) + (t2 - t3)) / 2
            Log.d(TAG, "NTP sync complete. Offset: ${clockOffsetMs}ms")
            emit(SyncEvent.ClockSynced(clockOffsetMs))
        }

        s.on("media:state") { args ->
            val data = args[0] as? JSONObject ?: return@on
            val position = data.getDouble("position")
            val playing = data.getBoolean("playing")
            val version = data.getLong("version")
            // Apply clock offset to compensate for drift
            val compensatedPosition = position + (clockOffsetMs / 1000.0)
            emit(SyncEvent.PlaybackChanged(compensatedPosition, playing, version))
        }

        s.on("media:change") { args ->
            val data = args[0] as? JSONObject ?: return@on
            val url = data.getString("url")
            emit(SyncEvent.MediaChanged(url))
        }

        s.on("chat:message") { args ->
            val data = args[0] as? JSONObject ?: return@on
            emit(SyncEvent.ChatReceived(
                senderId = data.getString("senderId"),
                nickname = data.getString("senderNickname"),
                content = data.getString("content"),
                timestamp = data.getLong("timestamp")
            ))
        }

        s.on("room:reaction") { args ->
            val data = args[0] as? JSONObject ?: return@on
            emit(SyncEvent.ReactionReceived(
                emoji = data.getString("emoji"),
                nickname = data.getString("nickname")
            ))
        }

        s.on("room:participant_joined") { args ->
            val data = args[0] as? JSONObject ?: return@on
            emit(SyncEvent.ParticipantJoined(
                id = data.getString("id"),
                nickname = data.getString("nickname")
            ))
        }

        s.on("room:participant_left") { args ->
            val data = args[0] as? JSONObject ?: return@on
            emit(SyncEvent.ParticipantLeft(
                id = data.getString("id"),
                nickname = data.getString("nickname")
            ))
        }
    }

    /** Perform Cristian's NTP clock synchronization handshake */
    private fun performNtpHandshake() {
        val t0 = System.currentTimeMillis()
        socket?.emit("sync:ping", JSONObject().apply { put("t0", t0) })
    }

    // --- Outbound Actions ---

    fun sendPlay(position: Double) {
        socket?.emit("media:play", JSONObject().apply {
            put("position", position)
            put("clientTime", System.currentTimeMillis())
        })
    }

    fun sendPause(position: Double) {
        socket?.emit("media:pause", JSONObject().apply {
            put("position", position)
            put("clientTime", System.currentTimeMillis())
        })
    }

    fun sendSeek(position: Double) {
        socket?.emit("media:seek", JSONObject().apply {
            put("position", position)
            put("clientTime", System.currentTimeMillis())
        })
    }

    fun sendChat(content: String) {
        socket?.emit("chat:send", JSONObject().apply {
            put("content", content)
        })
    }

    fun sendReaction(emoji: String) {
        socket?.emit("room:react", JSONObject().apply {
            put("emoji", emoji)
        })
    }

    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
        _connected.value = false
        currentRoomId = null
    }

    private fun emit(event: SyncEvent) {
        scope.launch { _events.emit(event) }
    }
}
