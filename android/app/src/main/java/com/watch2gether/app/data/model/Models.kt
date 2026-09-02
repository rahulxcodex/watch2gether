package com.watch2gether.app.data.model

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

enum class PlaybackStatus {
    @Json(name = "PLAYING") PLAYING,
    @Json(name = "PAUSED") PAUSED,
    @Json(name = "BUFFERING") BUFFERING,
    @Json(name = "IDLE") IDLE
}

enum class MediaType {
    @Json(name = "MP4") MP4,
    @Json(name = "YOUTUBE") YOUTUBE,
    @Json(name = "LOCAL_FILE") LOCAL_FILE,
    @Json(name = "HLS") HLS
}

enum class PermissionMode {
    @Json(name = "HOST_ONLY") HOST_ONLY,
    @Json(name = "SHARED") SHARED
}

@JsonClass(generateAdapter = true)
data class UserDTO(
    val id: String,
    val name: String,
    val isGuest: Boolean = true,
    val avatarUrl: String? = null,
    val color: String? = null,
    val avatarColor: String? = null,
    val isHost: Boolean? = false,
    val joinedAt: Long? = null
) {
    val displayColor: String
        get() = color ?: avatarColor ?: "#6366F1"
}

@JsonClass(generateAdapter = true)
data class RoomDTO(
    val id: String,
    val roomCode: String,
    val name: String,
    val hostId: String,
    val mediaUrl: String,
    val mediaType: MediaType = MediaType.MP4,
    val permissionMode: PermissionMode = PermissionMode.HOST_ONLY,
    val playbackState: PlaybackStatus? = PlaybackStatus.IDLE,
    val currentTime: Double? = 0.0,
    val version: Long? = 1L,
    val queue: List<QueueItemDTO>? = emptyList(),
    val createdAt: Any? = null,
    val updatedAt: Any? = null
)

@JsonClass(generateAdapter = true)
data class PlaybackStateDTO(
    val status: PlaybackStatus? = PlaybackStatus.IDLE,
    val state: PlaybackStatus? = null,
    val currentTime: Double = 0.0,
    val mediaUrl: String? = null,
    val mediaType: MediaType? = null,
    val serverTimestamp: Long = 0L,
    val playbackRate: Double = 1.0,
    val version: Long = 0L,
    val issuerId: String? = null,
    val duration: Double? = null
) {
    val effectiveStatus: PlaybackStatus
        get() = status ?: state ?: PlaybackStatus.IDLE
}

@JsonClass(generateAdapter = true)
data class ChatMessageDTO(
    val id: String,
    val roomCode: String? = null,
    val sender: UserDTO,
    val text: String,
    val timestamp: Long = System.currentTimeMillis(),
    val system: Boolean? = false
)

@JsonClass(generateAdapter = true)
data class ReactionBurstDTO(
    val id: String? = null,
    val roomCode: String? = null,
    val emoji: String,
    val senderId: String,
    val senderName: String? = null,
    val timestamp: Long = System.currentTimeMillis(),
    val x: Float? = 0.5f,
    val count: Int? = 1
)

@JsonClass(generateAdapter = true)
data class QueueItemDTO(
    val id: String,
    val title: String,
    val url: String,
    val mediaType: MediaType = MediaType.MP4,
    val duration: Double? = null,
    val thumbnailUrl: String? = null,
    val addedBy: String? = null,
    val addedByName: String? = null,
    val createdAt: Long = System.currentTimeMillis()
)

@JsonClass(generateAdapter = true)
data class PartnerProgressDTO(
    val userId: String,
    val name: String,
    val color: String? = null,
    val currentTime: Double = 0.0,
    val duration: Double? = null,
    val isStalled: Boolean? = false,
    val isSpeaking: Boolean? = false,
    val updatedAt: Long = System.currentTimeMillis()
)

@JsonClass(generateAdapter = true)
data class GuestAuthRequestDTO(
    val name: String? = null,
    val avatar: String? = null
)

@JsonClass(generateAdapter = true)
data class AuthResponseDTO(
    val token: String,
    val user: UserDTO
)

@JsonClass(generateAdapter = true)
data class CreateRoomRequestDTO(
    val name: String? = "Watch Room",
    val mediaUrl: String? = "",
    val mediaType: MediaType? = MediaType.MP4,
    val permissionMode: PermissionMode? = PermissionMode.HOST_ONLY
)

@JsonClass(generateAdapter = true)
data class CreateRoomResponseDTO(
    val id: String,
    val roomCode: String,
    val name: String,
    val hostId: String,
    val mediaUrl: String,
    val mediaType: MediaType,
    val playbackState: PlaybackStatus? = PlaybackStatus.IDLE,
    val currentTime: Double? = 0.0,
    val permissionMode: PermissionMode,
    val version: Long? = 1L,
    val createdAt: String? = null
)

@JsonClass(generateAdapter = true)
data class RoomJoinedPayload(
    val room: RoomDTO,
    val user: UserDTO? = null,
    val users: List<UserDTO> = emptyList(),
    val playbackState: PlaybackStateDTO? = null,
    val serverTimestamp: Long? = null
)

@JsonClass(generateAdapter = true)
data class SavedRoomItem(
    val code: String,
    val name: String,
    val lastVisited: Long = System.currentTimeMillis()
)
