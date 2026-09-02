package com.watch2gether.app.ui.room

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.Context
import android.os.Build
import android.util.Rational
import androidx.annotation.RequiresApi
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.watch2gether.app.BuildConfig
import com.watch2gether.app.data.model.*
import com.watch2gether.app.data.remote.Watch2GetherApi
import com.watch2gether.app.sync.ReconciliationAction
import com.watch2gether.app.sync.SyncEngine
import com.watch2gether.app.sync.SyncEvent
import com.watch2gether.app.sync.SyncMath
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

data class RoomUiState(
    val room: RoomDTO? = null,
    val currentUser: UserDTO = UserDTO(id = "anon_${UUID.randomUUID().toString().take(6)}", name = "Guest"),
    val activeUsers: List<UserDTO> = emptyList(),
    val messages: List<ChatMessageDTO> = emptyList(),
    val latestReactionBurst: ReactionBurstDTO? = null,
    val queue: List<QueueItemDTO> = emptyList(),
    val partnerProgress: PartnerProgressDTO? = null,
    val isPlaying: Boolean = false,
    val mediaUrl: String? = null,
    val mediaType: MediaType = MediaType.MP4,
    val currentTime: Double = 0.0,
    val duration: Double = 0.0,
    val bufferedPosition: Double = 0.0,
    val playbackRate: Float = 1.0f,
    val seekPosition: Double = 0.0,
    val isLoading: Boolean = true,
    val error: String? = null,
    val isInPip: Boolean = false,
    val permissionMode: PermissionMode = PermissionMode.HOST_ONLY
) {
    val isHost: Boolean
        get() = room?.hostId == currentUser.id || currentUser.isHost == true || room?.hostId.isNullOrEmpty()

    val canControl: Boolean
        get() = permissionMode == PermissionMode.SHARED || isHost
}

@HiltViewModel
class RoomViewModel @Inject constructor(
    private val api: Watch2GetherApi,
    val syncEngine: SyncEngine
) : ViewModel() {

    private val _uiState = MutableStateFlow(RoomUiState())
    val uiState: StateFlow<RoomUiState> = _uiState.asStateFlow()

    private var currentRoomCode: String? = null
    private var authToken: String = "guest_${UUID.randomUUID()}"
    private var progressReportJob: Job? = null
    private var reconciliationJob: Job? = null
    private var lastStateVersion: Long = 0L
    private var authoritativeState: PlaybackStateDTO? = null

    fun initialize(roomCode: String, user: UserDTO? = null, token: String? = null) {
        currentRoomCode = roomCode.uppercase()
        if (token != null) authToken = token

        val effectiveUser = user ?: UserDTO(
            id = "usr_${UUID.randomUUID().toString().take(8)}",
            name = "Guest ${roomCode.take(4)}",
            color = "#6366F1"
        )
        _uiState.update { it.copy(currentUser = effectiveUser, isLoading = true) }

        // Fetch Room REST API details
        loadRoom(currentRoomCode!!)

        // Connect WebSocket with zero-wall guest session
        syncEngine.connect(BuildConfig.SOCKET_URL, authToken, currentRoomCode!!, effectiveUser)
        observeSyncEvents()
        startPeriodicProgressReporting()
        startContinuousDriftLoop()
    }

    private fun loadRoom(code: String) {
        viewModelScope.launch {
            try {
                val resp = api.getRoom("Bearer $authToken", code)
                if (resp.isSuccessful && resp.body() != null) {
                    val room = resp.body()!!
                    _uiState.update {
                        it.copy(
                            room = room,
                            mediaUrl = room.mediaUrl.takeIf { u -> u.isNotBlank() } ?: it.mediaUrl,
                            mediaType = room.mediaType,
                            permissionMode = room.permissionMode,
                            queue = room.queue ?: it.queue,
                            isLoading = false
                        )
                    }
                }
            } catch (_: Exception) {
                // Ignore network error; socket will hydrate state
            }
        }
    }

    private fun observeSyncEvents() {
        viewModelScope.launch {
            syncEngine.events.collect { event ->
                when (event) {
                    is SyncEvent.RoomJoined -> {
                        val pb = event.playbackState
                        authoritativeState = pb
                        lastStateVersion = pb?.version ?: 0L
                        _uiState.update {
                            it.copy(
                                room = event.room,
                                activeUsers = event.users,
                                queue = event.room.queue ?: it.queue,
                                mediaUrl = event.room.mediaUrl.takeIf { u -> u.isNotBlank() } ?: it.mediaUrl,
                                mediaType = event.room.mediaType,
                                permissionMode = event.room.permissionMode,
                                isPlaying = pb?.effectiveStatus == PlaybackStatus.PLAYING,
                                seekPosition = pb?.currentTime ?: it.seekPosition,
                                isLoading = false
                            )
                        }
                    }
                    is SyncEvent.UserJoined -> {
                        _uiState.update { state ->
                            val updatedUsers = if (state.activeUsers.any { it.id == event.user.id }) {
                                state.activeUsers
                            } else {
                                state.activeUsers + event.user
                            }
                            val sysMsg = ChatMessageDTO(
                                id = "sys_${System.currentTimeMillis()}",
                                sender = event.user,
                                text = "${event.user.name} joined the room",
                                system = true
                            )
                            state.copy(activeUsers = updatedUsers, messages = state.messages + sysMsg)
                        }
                    }
                    is SyncEvent.UserLeft -> {
                        _uiState.update { state ->
                            val updatedUsers = state.activeUsers.filter { it.id != event.userId }.map { u ->
                                if (event.newHostId != null && u.id == event.newHostId) {
                                    u.copy(isHost = true)
                                } else u
                            }
                            val sysMsg = ChatMessageDTO(
                                id = "sys_${System.currentTimeMillis()}",
                                sender = UserDTO(id = event.userId, name = event.userName ?: "User"),
                                text = "${event.userName ?: "A participant"} left the room",
                                system = true
                            )
                            val updatedRoom = if (event.newHostId != null && state.room != null) {
                                state.room.copy(hostId = event.newHostId)
                            } else state.room
                            val updatedSelf = if (event.newHostId != null && state.currentUser.id == event.newHostId) {
                                state.currentUser.copy(isHost = true)
                            } else state.currentUser
                            state.copy(
                                activeUsers = updatedUsers,
                                room = updatedRoom,
                                currentUser = updatedSelf,
                                messages = state.messages + sysMsg
                            )
                        }
                    }
                    is SyncEvent.MediaChanged -> {
                        _uiState.update { state ->
                            val sysMsg = ChatMessageDTO(
                                id = "sys_${System.currentTimeMillis()}",
                                sender = UserDTO(id = "sys", name = "System", isGuest = false),
                                text = "Media changed to ${event.name ?: event.mediaUrl}",
                                system = true
                            )
                            state.copy(
                                mediaUrl = event.mediaUrl,
                                mediaType = event.mediaType,
                                messages = state.messages + sysMsg
                            )
                        }
                    }
                    is SyncEvent.PermissionUpdated -> {
                        _uiState.update { it.copy(permissionMode = event.permissionMode) }
                    }
                    is SyncEvent.PlaybackSynced -> {
                        handleIncomingPlaybackSync(event.playbackState)
                    }
                    is SyncEvent.ChatReceived -> {
                        _uiState.update { it.copy(messages = it.messages + event.message) }
                    }
                    is SyncEvent.ReactionReceived -> {
                        _uiState.update { it.copy(latestReactionBurst = event.burst) }
                    }
                    is SyncEvent.QueueUpdated -> {
                        _uiState.update { it.copy(queue = event.queue) }
                    }
                    is SyncEvent.PartnerProgressUpdated -> {
                        if (event.progress.userId != _uiState.value.currentUser.id) {
                            _uiState.update { it.copy(partnerProgress = event.progress) }
                        }
                    }
                    is SyncEvent.Error -> {
                        _uiState.update { it.copy(error = event.message) }
                    }
                    else -> {}
                }
            }
        }
    }

    private fun handleIncomingPlaybackSync(pb: PlaybackStateDTO) {
        // Local Echo Suppression: ignore self-emitted sync events
        if (pb.issuerId != null && pb.issuerId == _uiState.value.currentUser.id) {
            return
        }

        if (pb.version < lastStateVersion) return
        lastStateVersion = pb.version
        authoritativeState = pb

        val isServerPlaying = pb.effectiveStatus == PlaybackStatus.PLAYING
        val projectedTime = SyncMath.projectPlaybackTime(
            status = pb.effectiveStatus,
            currentTime = pb.currentTime,
            serverTimestamp = pb.serverTimestamp,
            playbackRate = pb.playbackRate,
            duration = _uiState.value.duration,
            clockOffsetTheta = syncEngine.currentClockOffset
        )

        val currentPos = _uiState.value.currentTime
        val action = SyncMath.reconcile(currentPos, projectedTime, pb.playbackRate)

        when (action) {
            is ReconciliationAction.None -> {
                _uiState.update {
                    it.copy(isPlaying = isServerPlaying, playbackRate = pb.playbackRate.toFloat())
                }
            }
            is ReconciliationAction.RateAdjust -> {
                _uiState.update {
                    it.copy(isPlaying = isServerPlaying, playbackRate = action.targetRate)
                }
            }
            is ReconciliationAction.HardSeek -> {
                _uiState.update {
                    it.copy(
                        isPlaying = isServerPlaying,
                        seekPosition = action.targetTime,
                        playbackRate = pb.playbackRate.toFloat()
                    )
                }
            }
        }
    }

    /**
     * Active 200ms Drift Reconciliation Loop:
     * Continually projects expected server time and detects when the player
     * has re-entered the deadband (<= 150ms) to restore normal 1.0x rate.
     */
    private fun startContinuousDriftLoop() {
        reconciliationJob?.cancel()
        reconciliationJob = viewModelScope.launch {
            while (isActive) {
                delay(200)
                val state = _uiState.value
                val auth = authoritativeState
                if (state.isPlaying && auth != null && auth.effectiveStatus == PlaybackStatus.PLAYING) {
                    val projected = SyncMath.projectPlaybackTime(
                        status = PlaybackStatus.PLAYING,
                        currentTime = auth.currentTime,
                        serverTimestamp = auth.serverTimestamp,
                        playbackRate = auth.playbackRate,
                        duration = state.duration,
                        clockOffsetTheta = syncEngine.currentClockOffset
                    )
                    val action = SyncMath.reconcile(state.currentTime, projected, auth.playbackRate)
                    when (action) {
                        is ReconciliationAction.None -> {
                            // Smoothly recovered within deadband: restore baseline playback rate!
                            val baseRate = auth.playbackRate.toFloat()
                            if (state.playbackRate != baseRate) {
                                _uiState.update { it.copy(playbackRate = baseRate) }
                            }
                        }
                        is ReconciliationAction.RateAdjust -> {
                            if (state.playbackRate != action.targetRate) {
                                _uiState.update { it.copy(playbackRate = action.targetRate) }
                            }
                        }
                        is ReconciliationAction.HardSeek -> {
                            _uiState.update {
                                it.copy(
                                    seekPosition = action.targetTime,
                                    playbackRate = auth.playbackRate.toFloat()
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    private fun startPeriodicProgressReporting() {
        progressReportJob?.cancel()
        progressReportJob = viewModelScope.launch {
            while (isActive) {
                delay(1000)
                val state = _uiState.value
                if (state.mediaUrl != null && state.duration > 0) {
                    syncEngine.sendProgressReport(state.currentTime, state.duration)
                }
            }
        }
    }

    fun onProgressTick(current: Double, dur: Double, buf: Double) {
        _uiState.update {
            it.copy(
                currentTime = current,
                duration = if (dur > 0) dur else it.duration,
                bufferedPosition = buf
            )
        }
    }

    fun onPlay(position: Double) {
        _uiState.update { it.copy(isPlaying = true) }
        authoritativeState = authoritativeState?.copy(
            status = PlaybackStatus.PLAYING,
            currentTime = position,
            serverTimestamp = System.currentTimeMillis() + syncEngine.currentClockOffset
        )
        syncEngine.sendPlay(position)
    }

    fun onPause(position: Double) {
        _uiState.update { it.copy(isPlaying = false) }
        authoritativeState = authoritativeState?.copy(
            status = PlaybackStatus.PAUSED,
            currentTime = position,
            serverTimestamp = System.currentTimeMillis() + syncEngine.currentClockOffset
        )
        syncEngine.sendPause(position)
    }

    fun onSeek(position: Double) {
        _uiState.update { it.copy(currentTime = position, seekPosition = position) }
        authoritativeState = authoritativeState?.copy(
            currentTime = position,
            serverTimestamp = System.currentTimeMillis() + syncEngine.currentClockOffset
        )
        syncEngine.sendSeek(position)
    }

    fun sendChat(text: String) {
        if (text.isBlank()) return
        syncEngine.sendChat(text.trim())
    }

    fun sendReaction(emoji: String) {
        syncEngine.sendReaction(emoji)
    }

    fun togglePermission(mode: PermissionMode) {
        if (!_uiState.value.isHost) return
        _uiState.update { it.copy(permissionMode = mode) }
        syncEngine.sendSetPermission(mode)
    }

    fun addToQueue(item: QueueItemDTO) {
        val fullItem = item.copy(
            addedBy = _uiState.value.currentUser.id,
            addedByName = _uiState.value.currentUser.name
        )
        _uiState.update { it.copy(queue = it.queue + fullItem) }
        syncEngine.sendAddToQueue(fullItem)
    }

    fun removeFromQueue(itemId: String) {
        _uiState.update { it.copy(queue = it.queue.filter { i -> i.id != itemId }) }
        syncEngine.sendRemoveFromQueue(itemId)
    }

    fun switchMedia(url: String, type: MediaType, title: String? = null) {
        if (!_uiState.value.canControl) return
        _uiState.update { it.copy(mediaUrl = url, mediaType = type, currentTime = 0.0, seekPosition = 0.0) }
        syncEngine.sendChangeMedia(url, type, title)
    }

    fun onMediaEnded() {
        // Restrict auto-advance trigger to host to prevent multi-client pop concurrency race
        val queue = _uiState.value.queue
        if (queue.isNotEmpty() && _uiState.value.isHost) {
            val next = queue.first()
            switchMedia(next.url, next.mediaType, next.title)
            removeFromQueue(next.id)
        } else if (queue.isEmpty() && _uiState.value.isHost) {
            // Empty queue transition: pause playback at end position and broadcast to room
            _uiState.update { it.copy(isPlaying = false) }
            syncEngine.sendPause(_uiState.value.duration)
        }
    }

    fun setPipMode(isInPip: Boolean) {
        _uiState.update { it.copy(isInPip = isInPip) }
    }

    @RequiresApi(Build.VERSION_CODES.O)
    fun enterPip(context: Context) {
        if (context is Activity) {
            val params = PictureInPictureParams.Builder()
                .setAspectRatio(Rational(16, 9))
                .build()
            context.enterPictureInPictureMode(params)
            _uiState.update { it.copy(isInPip = true) }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    override fun onCleared() {
        super.onCleared()
        progressReportJob?.cancel()
        reconciliationJob?.cancel()
        syncEngine.disconnect()
    }
}
