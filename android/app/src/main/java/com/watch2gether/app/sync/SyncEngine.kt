package com.watch2gether.app.sync

import android.util.Log
import com.squareup.moshi.Moshi
import com.watch2gether.app.data.model.*
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import javax.inject.Inject
import javax.inject.Singleton

private const val TAG = "SyncEngine"

sealed class SyncEvent {
    data class RoomJoined(
        val room: RoomDTO,
        val users: List<UserDTO>,
        val playbackState: PlaybackStateDTO?
    ) : SyncEvent()
    data class UserJoined(val user: UserDTO) : SyncEvent()
    data class UserLeft(val userId: String, val userName: String?, val newHostId: String?) : SyncEvent()
    data class MediaChanged(val mediaUrl: String, val mediaType: MediaType, val name: String?) : SyncEvent()
    data class PermissionUpdated(val permissionMode: PermissionMode) : SyncEvent()
    data class PlaybackSynced(val playbackState: PlaybackStateDTO) : SyncEvent()
    data class ChatReceived(val message: ChatMessageDTO) : SyncEvent()
    data class ReactionReceived(val burst: ReactionBurstDTO) : SyncEvent()
    data class QueueUpdated(val queue: List<QueueItemDTO>) : SyncEvent()
    data class PartnerProgressUpdated(val progress: PartnerProgressDTO) : SyncEvent()
    data class ClockSynced(val offsetMs: Long, val rttMs: Long) : SyncEvent()
    data class Error(val message: String) : SyncEvent()
}

@Singleton
class SyncEngine @Inject constructor(
    private val moshi: Moshi
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private var socket: Socket? = null
    private var currentRoomCode: String? = null
    private var currentUser: UserDTO? = null

    private val samples = mutableListOf<SyncSample>()
    private var clockOffsetMs: Long = 0L
    private var pingJob: Job? = null

    private val _events = MutableSharedFlow<SyncEvent>(extraBufferCapacity = 128)
    val events: SharedFlow<SyncEvent> = _events.asSharedFlow()

    private val _connected = MutableStateFlow(false)
    val connected: StateFlow<Boolean> = _connected.asStateFlow()

    val currentClockOffset: Long
        get() = clockOffsetMs

    fun connect(socketUrl: String, token: String, roomCode: String, user: UserDTO) {
        currentRoomCode = roomCode
        currentUser = user

        try {
            val opts = IO.Options.builder()
                .setAuth(mapOf("token" to token))
                .setReconnection(true)
                .setReconnectionAttempts(15)
                .setReconnectionDelay(1000)
                .setTransports(arrayOf("websocket", "polling"))
                .build()

            socket?.disconnect()
            socket = IO.socket(URI.create(socketUrl), opts)
            registerHandlers()
            socket?.connect()
        } catch (e: Exception) {
            Log.e(TAG, "Socket initialization error", e)
            emit(SyncEvent.Error("Connection failed: ${e.message}"))
        }
    }

    private fun registerHandlers() {
        val s = socket ?: return

        s.on(Socket.EVENT_CONNECT) {
            Log.d(TAG, "Connected to socket server. Joining room $currentRoomCode")
            _connected.value = true

            // Send room:join
            val joinPayload = JSONObject().apply {
                put("roomCode", currentRoomCode)
                put("user", JSONObject().apply {
                    put("id", currentUser?.id)
                    put("name", currentUser?.name)
                    put("avatarColor", currentUser?.avatarColor ?: currentUser?.color)
                    put("isGuest", currentUser?.isGuest ?: true)
                })
            }

            s.emit("room:join", joinPayload) { responseArgs ->
                if (responseArgs != null && responseArgs.isNotEmpty()) {
                    val resp = responseArgs[0] as? JSONObject
                    if (resp != null && resp.optBoolean("success", false)) {
                        val data = resp.optJSONObject("data")
                        if (data != null) {
                            parseAndEmitRoomJoined(data)
                        }
                    }
                }
            }

            // Begin continuous NTP handshake
            startNtpSyncLoop()
        }

        s.on(Socket.EVENT_DISCONNECT) {
            Log.d(TAG, "Disconnected from socket server")
            _connected.value = false
            pingJob?.cancel()
        }

        s.on("sync:pong") { args ->
            val data = args.getOrNull(0) as? JSONObject ?: return@on
            val clientTimestamp = data.optLong("clientTimestamp", 0L)
            val serverTimestamp = data.optLong("serverTimestamp", 0L)
            val receiveTime = System.currentTimeMillis()

            if (clientTimestamp > 0 && serverTimestamp > 0) {
                val sample = SyncMath.calculateSyncSample(clientTimestamp, serverTimestamp, receiveTime)
                synchronized(samples) {
                    if (samples.size >= 10) samples.removeAt(0)
                    samples.add(sample)
                    val (filteredOffset, bestRtt) = SyncMath.deriveAuthoritativeOffset(samples, clockOffsetMs)
                    clockOffsetMs = filteredOffset
                    Log.d(TAG, "NTP Sync: offset=${clockOffsetMs}ms, RTT=${bestRtt}ms")
                    emit(SyncEvent.ClockSynced(clockOffsetMs, bestRtt))
                }
            }
        }

        s.on("room:joined") { args ->
            val data = args.getOrNull(0) as? JSONObject ?: return@on
            parseAndEmitRoomJoined(data)
        }

        s.on("room:user_joined") { args -> parseUserJoined(args) }
        s.on("room:member_joined") { args -> parseUserJoined(args) }

        s.on("room:user_left") { args -> parseUserLeft(args) }
        s.on("room:member_left") { args -> parseUserLeft(args) }

        s.on("room:media_changed") { args ->
            val data = args.getOrNull(0) as? JSONObject ?: return@on
            val mediaUrl = data.optString("mediaUrl")
            val mediaTypeStr = data.optString("mediaType", "MP4")
            val mediaType = try { MediaType.valueOf(mediaTypeStr) } catch (_: Exception) { MediaType.MP4 }
            val name = data.optString("name").takeIf { it.isNotBlank() }
            emit(SyncEvent.MediaChanged(mediaUrl, mediaType, name))
        }

        s.on("room:permission_updated") { args ->
            val data = args.getOrNull(0) as? JSONObject ?: return@on
            val modeStr = data.optString("permissionMode", "HOST_ONLY")
            val mode = try { PermissionMode.valueOf(modeStr) } catch (_: Exception) { PermissionMode.HOST_ONLY }
            emit(SyncEvent.PermissionUpdated(mode))
        }

        s.on("media:sync") { args ->
            val data = args.getOrNull(0) as? JSONObject ?: return@on
            val statusStr = data.optString("status", data.optString("state", "IDLE"))
            val status = try { PlaybackStatus.valueOf(statusStr) } catch (_: Exception) { PlaybackStatus.IDLE }
            val currentTime = data.optDouble("currentTime", 0.0)
            val serverTimestamp = data.optLong("serverTimestamp", System.currentTimeMillis())
            val playbackRate = data.optDouble("playbackRate", 1.0)
            val version = data.optLong("version", 0L)

            val state = PlaybackStateDTO(
                status = status,
                currentTime = currentTime,
                serverTimestamp = serverTimestamp,
                playbackRate = playbackRate,
                version = version
            )
            emit(SyncEvent.PlaybackSynced(state))
        }

        s.on("chat:message") { args ->
            val data = args.getOrNull(0) as? JSONObject ?: return@on
            val senderObj = data.optJSONObject("sender")
            val sender = if (senderObj != null) {
                UserDTO(
                    id = senderObj.optString("id", "anon"),
                    name = senderObj.optString("name", "User"),
                    isGuest = senderObj.optBoolean("isGuest", true),
                    color = senderObj.optString("color", "#6366F1"),
                    avatarColor = senderObj.optString("avatarColor", "#6366F1")
                )
            } else {
                UserDTO(id = "system", name = "System", isGuest = false)
            }

            val msg = ChatMessageDTO(
                id = data.optString("id", System.currentTimeMillis().toString()),
                roomCode = data.optString("roomCode"),
                sender = sender,
                text = data.optString("text", ""),
                timestamp = data.optLong("timestamp", System.currentTimeMillis()),
                system = data.optBoolean("system", false)
            )
            emit(SyncEvent.ChatReceived(msg))
        }

        s.on("reaction:burst") { args ->
            val data = args.getOrNull(0) as? JSONObject ?: return@on
            val burst = ReactionBurstDTO(
                emoji = data.optString("emoji", "??"),
                senderId = data.optString("senderId", ""),
                senderName = data.optString("senderName", "Guest"),
                timestamp = data.optLong("timestamp", System.currentTimeMillis()),
                x = data.optDouble("x", 0.5).toFloat(),
                count = data.optInt("count", 1)
            )
            emit(SyncEvent.ReactionReceived(burst))
        }

        s.on("queue:updated") { args ->
            val data = args.getOrNull(0) as? JSONObject ?: return@on
            val arr = data.optJSONArray("queue") ?: JSONArray()
            val list = parseQueueArray(arr)
            emit(SyncEvent.QueueUpdated(list))
        }

        s.on("media:progress_update") { args ->
            val data = args.getOrNull(0) as? JSONObject ?: return@on
            val progress = PartnerProgressDTO(
                userId = data.optString("userId", ""),
                name = data.optString("name", "User"),
                color = data.optString("color", "#6366F1"),
                currentTime = data.optDouble("currentTime", 0.0),
                duration = data.optDouble("duration", 0.0).takeIf { !it.isNaN() },
                isStalled = data.optBoolean("isStalled", false),
                isSpeaking = data.optBoolean("isSpeaking", false),
                updatedAt = data.optLong("updatedAt", System.currentTimeMillis())
            )
            emit(SyncEvent.PartnerProgressUpdated(progress))
        }
    }

    private fun parseAndEmitRoomJoined(data: JSONObject) {
        val roomObj = data.optJSONObject("room") ?: JSONObject()
        val roomCode = roomObj.optString("roomCode", currentRoomCode ?: "")
        val mediaUrl = roomObj.optString("mediaUrl", "")
        val mediaTypeStr = roomObj.optString("mediaType", "MP4")
        val mediaType = try { MediaType.valueOf(mediaTypeStr) } catch (_: Exception) { MediaType.MP4 }
        val permStr = roomObj.optString("permissionMode", "HOST_ONLY")
        val perm = try { PermissionMode.valueOf(permStr) } catch (_: Exception) { PermissionMode.HOST_ONLY }

        val queueArr = roomObj.optJSONArray("queue") ?: JSONArray()
        val queue = parseQueueArray(queueArr)

        val room = RoomDTO(
            id = roomObj.optString("id", ""),
            roomCode = roomCode,
            name = roomObj.optString("name", "Room $roomCode"),
            hostId = roomObj.optString("hostId", ""),
            mediaUrl = mediaUrl,
            mediaType = mediaType,
            permissionMode = perm,
            queue = queue
        )

        val usersArr = data.optJSONArray("users") ?: JSONArray()
        val users = mutableListOf<UserDTO>()
        for (i in 0 until usersArr.length()) {
            val u = usersArr.optJSONObject(i) ?: continue
            users.add(
                UserDTO(
                    id = u.optString("id"),
                    name = u.optString("name"),
                    isGuest = u.optBoolean("isGuest", true),
                    color = u.optString("color", "#6366F1"),
                    avatarColor = u.optString("avatarColor", "#6366F1"),
                    isHost = u.optBoolean("isHost", u.optString("id") == room.hostId)
                )
            )
        }

        val pbObj = data.optJSONObject("playbackState")
        val pb = if (pbObj != null) {
            val statusStr = pbObj.optString("status", pbObj.optString("state", "IDLE"))
            PlaybackStateDTO(
                status = try { PlaybackStatus.valueOf(statusStr) } catch (_: Exception) { PlaybackStatus.IDLE },
                currentTime = pbObj.optDouble("currentTime", 0.0),
                serverTimestamp = pbObj.optLong("serverTimestamp", System.currentTimeMillis()),
                playbackRate = pbObj.optDouble("playbackRate", 1.0),
                version = pbObj.optLong("version", 1L)
            )
        } else null

        emit(SyncEvent.RoomJoined(room, users, pb))
    }

    private fun parseUserJoined(args: Array<Any>) {
        val data = args.getOrNull(0) as? JSONObject ?: return
        val u = data.optJSONObject("user") ?: return
        val user = UserDTO(
            id = u.optString("id"),
            name = u.optString("name"),
            isGuest = u.optBoolean("isGuest", true),
            color = u.optString("color", "#6366F1"),
            avatarColor = u.optString("avatarColor", "#6366F1")
        )
        emit(SyncEvent.UserJoined(user))
    }

    private fun parseUserLeft(args: Array<Any>) {
        val data = args.getOrNull(0) as? JSONObject ?: return
        val userId = data.optString("userId")
        val userName = data.optString("userName").takeIf { it.isNotBlank() }
        val newHostId = data.optString("newHostId").takeIf { it.isNotBlank() }
        emit(SyncEvent.UserLeft(userId, userName, newHostId))
    }

    private fun parseQueueArray(arr: JSONArray): List<QueueItemDTO> {
        val list = mutableListOf<QueueItemDTO>()
        for (i in 0 until arr.length()) {
            val item = arr.optJSONObject(i) ?: continue
            val mtStr = item.optString("mediaType", "MP4")
            val mt = try { MediaType.valueOf(mtStr) } catch (_: Exception) { MediaType.MP4 }
            list.add(
                QueueItemDTO(
                    id = item.optString("id"),
                    title = item.optString("title", "Video"),
                    url = item.optString("url", ""),
                    mediaType = mt,
                    duration = item.optDouble("duration", 0.0).takeIf { !it.isNaN() },
                    thumbnailUrl = item.optString("thumbnailUrl").takeIf { it.isNotBlank() },
                    addedBy = item.optString("addedBy").takeIf { it.isNotBlank() },
                    addedByName = item.optString("addedByName").takeIf { it.isNotBlank() },
                    createdAt = item.optLong("createdAt", System.currentTimeMillis())
                )
            )
        }
        return list
    }

    private fun startNtpSyncLoop() {
        pingJob?.cancel()
        pingJob = scope.launch {
            // Rapid burst on connect (4 pings with 300ms intervals) to quickly establish initial offset
            repeat(4) {
                performNtpPing()
                delay(300)
            }
            // Continuous heartbeat sync every 5 seconds
            while (isActive) {
                delay(5000)
                performNtpPing()
            }
        }
    }

    fun performNtpPing() {
        socket?.emit("sync:ping", JSONObject().apply {
            put("clientTimestamp", System.currentTimeMillis())
        })
    }

    // --- Outbound Emit Actions ---

    fun sendPlay(currentTime: Double, playbackRate: Double = 1.0) {
        val code = currentRoomCode ?: return
        socket?.emit("media:play", JSONObject().apply {
            put("roomCode", code)
            put("currentTime", currentTime)
            put("clientTimestamp", System.currentTimeMillis())
            put("playbackRate", playbackRate)
        })
    }

    fun sendPause(currentTime: Double) {
        val code = currentRoomCode ?: return
        socket?.emit("media:pause", JSONObject().apply {
            put("roomCode", code)
            put("currentTime", currentTime)
            put("clientTimestamp", System.currentTimeMillis())
        })
    }

    fun sendSeek(targetTime: Double, autoPlay: Boolean = true) {
        val code = currentRoomCode ?: return
        socket?.emit("media:seek", JSONObject().apply {
            put("roomCode", code)
            put("targetTime", targetTime)
            put("clientTimestamp", System.currentTimeMillis())
            put("autoPlay", autoPlay)
        })
    }

    fun sendChangeMedia(mediaUrl: String, mediaType: MediaType, name: String? = null) {
        val code = currentRoomCode ?: return
        val payload = JSONObject().apply {
            put("roomCode", code)
            put("mediaUrl", mediaUrl)
            put("mediaType", mediaType.name)
            if (name != null) put("name", name)
        }
        socket?.emit("media:change", payload)
        socket?.emit("room:change_media", payload)
    }

    fun sendSetPermission(mode: PermissionMode) {
        val code = currentRoomCode ?: return
        socket?.emit("room:set_permission", JSONObject().apply {
            put("roomCode", code)
            put("permissionMode", mode.name)
        })
    }

    fun sendChat(text: String) {
        val code = currentRoomCode ?: return
        socket?.emit("chat:send", JSONObject().apply {
            put("roomCode", code)
            put("text", text)
        })
    }

    fun sendReaction(emoji: String) {
        val code = currentRoomCode ?: return
        socket?.emit("reaction:send", JSONObject().apply {
            put("roomCode", code)
            put("emoji", emoji)
        })
    }

    fun sendAddToQueue(item: QueueItemDTO) {
        val itemObj = JSONObject().apply {
            put("id", item.id)
            put("title", item.title)
            put("url", item.url)
            put("mediaType", item.mediaType.name)
            if (item.duration != null) put("duration", item.duration)
            if (item.thumbnailUrl != null) put("thumbnailUrl", item.thumbnailUrl)
            if (item.addedBy != null) put("addedBy", item.addedBy)
            if (item.addedByName != null) put("addedByName", item.addedByName)
            put("createdAt", item.createdAt)
        }
        socket?.emit("queue:add", JSONObject().apply {
            put("item", itemObj)
        })
    }

    fun sendRemoveFromQueue(itemId: String) {
        socket?.emit("queue:remove", JSONObject().apply {
            put("itemId", itemId)
        })
    }

    fun sendProgressReport(currentTime: Double, duration: Double, isStalled: Boolean = false) {
        socket?.emit("media:progress_report", JSONObject().apply {
            put("currentTime", currentTime)
            put("duration", duration)
            put("isStalled", isStalled)
        })
    }

    fun disconnect() {
        pingJob?.cancel()
        socket?.disconnect()
        socket = null
        _connected.value = false
    }

    private fun emit(event: SyncEvent) {
        scope.launch { _events.emit(event) }
    }
}
