package com.watch2gether.app.ui.room

import android.app.PictureInPictureParams
import android.content.Context
import android.os.Build
import android.util.Rational
import androidx.annotation.RequiresApi
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.watch2gether.app.BuildConfig
import com.watch2gether.app.data.model.ChatMessage
import com.watch2gether.app.data.model.Room
import com.watch2gether.app.data.remote.Watch2GetherApi
import com.watch2gether.app.sync.SyncEngine
import com.watch2gether.app.sync.SyncEvent
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

data class RoomUiState(
    val room: Room? = null,
    val messages: List<ChatMessage> = emptyList(),
    val isPlaying: Boolean = false,
    val playbackPosition: Double = 0.0,
    val mediaUrl: String? = null,
    val isLoading: Boolean = true,
    val error: String? = null,
    val isInPip: Boolean = false,
    val participants: List<Pair<String, String>> = emptyList(), // (id, nickname)
    val reactions: List<String> = emptyList()
)

@HiltViewModel
class RoomViewModel @Inject constructor(
    private val api: Watch2GetherApi,
    val syncEngine: SyncEngine
) : ViewModel() {

    private val _uiState = MutableStateFlow(RoomUiState())
    val uiState: StateFlow<RoomUiState> = _uiState.asStateFlow()

    private var currentRoomId: String? = null
    private var authToken: String = "guest_${UUID.randomUUID()}"

    fun initialize(roomId: String) {
        currentRoomId = roomId
        loadRoom(roomId)
        syncEngine.connect(BuildConfig.SOCKET_URL, authToken, roomId)
        observeSyncEvents()
    }

    private fun loadRoom(roomId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            try {
                val resp = api.getRoom("Bearer $authToken", roomId)
                if (resp.isSuccessful) {
                    val room = resp.body()!!
                    _uiState.update {
                        it.copy(
                            room = room,
                            isLoading = false,
                            mediaUrl = room.mediaUrl,
                            isPlaying = room.state.name == "PLAYING"
                        )
                    }
                } else {
                    _uiState.update { it.copy(isLoading = false, error = "Room not found") }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }

    private fun observeSyncEvents() {
        viewModelScope.launch {
            syncEngine.events.collect { event ->
                when (event) {
                    is SyncEvent.PlaybackChanged -> {
                        _uiState.update {
                            it.copy(isPlaying = event.playing, playbackPosition = event.position)
                        }
                    }
                    is SyncEvent.MediaChanged -> {
                        _uiState.update { it.copy(mediaUrl = event.url) }
                    }
                    is SyncEvent.ChatReceived -> {
                        val msg = ChatMessage(
                            id = UUID.randomUUID().toString(),
                            roomId = currentRoomId ?: "",
                            senderId = event.senderId,
                            senderNickname = event.nickname,
                            content = event.content,
                            timestamp = event.timestamp
                        )
                        _uiState.update { it.copy(messages = it.messages + msg) }
                    }
                    is SyncEvent.ReactionReceived -> {
                        _uiState.update { it.copy(reactions = it.reactions + event.emoji) }
                    }
                    is SyncEvent.ParticipantJoined -> {
                        _uiState.update {
                            it.copy(participants = it.participants + (event.id to event.nickname))
                        }
                    }
                    is SyncEvent.ParticipantLeft -> {
                        _uiState.update {
                            it.copy(participants = it.participants.filter { p -> p.first != event.id })
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

    fun onPlay(position: Double) {
        _uiState.update { it.copy(isPlaying = true) }
        syncEngine.sendPlay(position)
    }

    fun onPause(position: Double) {
        _uiState.update { it.copy(isPlaying = false) }
        syncEngine.sendPause(position)
    }

    fun onSeek(position: Double) {
        syncEngine.sendSeek(position)
    }

    fun sendChat(message: String) {
        if (message.isBlank()) return
        syncEngine.sendChat(message)
    }

    fun sendReaction(emoji: String) {
        syncEngine.sendReaction(emoji)
    }

    fun clearError() { _uiState.update { it.copy(error = null) } }

    @RequiresApi(Build.VERSION_CODES.O)
    fun enterPip(context: Context) {
        if (context is android.app.Activity) {
            val params = PictureInPictureParams.Builder()
                .setAspectRatio(Rational(16, 9))
                .build()
            context.enterPictureInPictureMode(params)
            _uiState.update { it.copy(isInPip = true) }
        }
    }

    override fun onCleared() {
        super.onCleared()
        syncEngine.disconnect()
    }
}
