package com.watch2gether.app.data.model

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class Room(
    val id: String,
    val code: String,
    val hostId: String,
    val state: PlaybackState,
    val mediaUrl: String?,
    val permissionMode: PermissionMode,
    val participants: List<Participant>,
    val createdAt: String
)

@JsonClass(generateAdapter = true)
data class Participant(
    val id: String,
    val nickname: String,
    val isHost: Boolean,
    val isGuest: Boolean
)

@JsonClass(generateAdapter = true)
data class ChatMessage(
    val id: String,
    val roomId: String,
    val senderId: String,
    val senderNickname: String,
    val content: String,
    val timestamp: Long
)

@JsonClass(generateAdapter = true)
data class GuestSession(
    val guestId: String,
    val nickname: String,
    val token: String
)

@JsonClass(generateAdapter = true)
data class CreateRoomRequest(
    val nickname: String,
    val mediaUrl: String? = null,
    val permissionMode: PermissionMode = PermissionMode.HOST_ONLY
)

@JsonClass(generateAdapter = true)
data class CreateRoomResponse(
    val room: Room,
    val session: GuestSession
)

@JsonClass(generateAdapter = true)
data class JoinRoomResponse(
    val room: Room,
    val session: GuestSession
)

enum class PlaybackState {
    IDLE, PLAYING, PAUSED, BUFFERING, ENDED
}

enum class PermissionMode {
    HOST_ONLY, SHARED
}
