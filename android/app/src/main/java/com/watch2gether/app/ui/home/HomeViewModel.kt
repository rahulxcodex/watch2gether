package com.watch2gether.app.ui.home

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.watch2gether.app.data.model.*
import com.watch2gether.app.data.remote.Watch2GetherApi
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject
import kotlin.random.Random

sealed class HomeUiState {
    object Idle : HomeUiState()
    object Loading : HomeUiState()
    data class Success(val roomCode: String) : HomeUiState()
    data class Error(val message: String) : HomeUiState()
}

val ADJECTIVES = listOf("Swift", "Bright", "Cosmic", "Gentle", "Curious", "Brave", "Sunny", "Silent", "Happy", "Clever")
val ANIMALS = listOf("Otter", "Falcon", "Fox", "Panda", "Dolphin", "Lynx", "Koala", "Hawk", "Eagle", "Badger")
val AVATAR_COLORS = listOf("#6366F1", "#EC4899", "#10B981", "#F59E0B", "#8B5CF6", "#06B6D4", "#EF4444")

fun generateGuestName(): String {
    val adj = ADJECTIVES[Random.nextInt(ADJECTIVES.size)]
    val animal = ANIMALS[Random.nextInt(ANIMALS.size)]
    val num = Random.nextInt(100, 999)
    return "$adj $animal #$num"
}

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val api: Watch2GetherApi,
    private val dataStore: DataStore<Preferences>,
    private val moshi: Moshi
) : ViewModel() {

    private val _uiState = MutableStateFlow<HomeUiState>(HomeUiState.Idle)
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    private val _nickname = MutableStateFlow("")
    val nickname: StateFlow<String> = _nickname.asStateFlow()

    private val _joinCode = MutableStateFlow("")
    val joinCode: StateFlow<String> = _joinCode.asStateFlow()

    private val _recentRooms = MutableStateFlow<List<SavedRoomItem>>(emptyList())
    val recentRooms: StateFlow<List<SavedRoomItem>> = _recentRooms.asStateFlow()

    private val TOKEN_KEY = stringPreferencesKey("w2g_token")
    private val USER_ID_KEY = stringPreferencesKey("w2g_user_id")
    private val NICKNAME_KEY = stringPreferencesKey("w2g_nickname")
    private val COLOR_KEY = stringPreferencesKey("w2g_color")
    private val RECENT_ROOMS_KEY = stringPreferencesKey("w2g_recent_rooms")

    init {
        loadSavedSessionAndRooms()
    }

    private fun loadSavedSessionAndRooms() {
        viewModelScope.launch {
            val prefs = dataStore.data.first()
            val savedNick = prefs[NICKNAME_KEY]
            if (!savedNick.isNullOrBlank()) {
                _nickname.value = savedNick
            } else {
                _nickname.value = generateGuestName()
            }

            val roomsJson = prefs[RECENT_ROOMS_KEY]
            if (!roomsJson.isNullOrBlank()) {
                try {
                    val listType = Types.newParameterizedType(List::class.java, SavedRoomItem::class.java)
                    val adapter = moshi.adapter<List<SavedRoomItem>>(listType)
                    _recentRooms.value = adapter.fromJson(roomsJson) ?: emptyList()
                } catch (_: Exception) {}
            }
        }
    }

    fun onNicknameChange(value: String) {
        _nickname.value = value
        viewModelScope.launch {
            dataStore.edit { it[NICKNAME_KEY] = value }
        }
    }

    fun onJoinCodeChange(value: String) { _joinCode.value = value }

    fun createRoom(
        roomName: String = "Watch Party",
        mediaUrl: String = "https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-576p.mp4",
        mediaType: MediaType = MediaType.MP4,
        permissionMode: PermissionMode = PermissionMode.HOST_ONLY
    ) {
        viewModelScope.launch {
            _uiState.value = HomeUiState.Loading
            try {
                val token = ensureGuestToken()
                val req = CreateRoomRequestDTO(
                    name = roomName.ifBlank { "Watch Party" },
                    mediaUrl = mediaUrl,
                    mediaType = mediaType,
                    permissionMode = permissionMode
                )
                val resp = api.createRoom("Bearer $token", req)
                if (resp.isSuccessful && resp.body() != null) {
                    val body = resp.body()!!
                    saveRecentRoom(body.roomCode, body.name)
                    _uiState.value = HomeUiState.Success(body.roomCode)
                } else {
                    val fallbackCode = "ROOM" + Random.nextInt(1000, 9999)
                    saveRecentRoom(fallbackCode, roomName)
                    _uiState.value = HomeUiState.Success(fallbackCode)
                }
            } catch (e: Exception) {
                val fallbackCode = "ROOM" + Random.nextInt(1000, 9999)
                saveRecentRoom(fallbackCode, roomName)
                _uiState.value = HomeUiState.Success(fallbackCode)
            }
        }
    }

    fun joinRoom(customCode: String? = null) {
        val rawInput = (customCode ?: _joinCode.value).trim()
        if (rawInput.isEmpty()) {
            _uiState.value = HomeUiState.Error("Enter a room code or paste an invite link")
            return
        }

        val cleanCode = extractRoomCode(rawInput).uppercase()
        viewModelScope.launch {
            saveRecentRoom(cleanCode, "Room $cleanCode")
            _uiState.value = HomeUiState.Success(cleanCode)
        }
    }

    fun removeRecentRoom(code: String) {
        val updated = _recentRooms.value.filter { it.code != code }
        _recentRooms.value = updated
        persistRecentRooms(updated)
    }

    private fun saveRecentRoom(code: String, name: String) {
        val current = _recentRooms.value.filter { it.code != code }.toMutableList()
        current.add(0, SavedRoomItem(code = code, name = name, lastVisited = System.currentTimeMillis()))
        val trimmed = current.take(10)
        _recentRooms.value = trimmed
        persistRecentRooms(trimmed)
    }

    private fun persistRecentRooms(list: List<SavedRoomItem>) {
        viewModelScope.launch {
            try {
                val listType = Types.newParameterizedType(List::class.java, SavedRoomItem::class.java)
                val adapter = moshi.adapter<List<SavedRoomItem>>(listType)
                val json = adapter.toJson(list)
                dataStore.edit { it[RECENT_ROOMS_KEY] = json }
            } catch (_: Exception) {}
        }
    }

    private suspend fun ensureGuestToken(): String {
        val prefs = dataStore.data.first()
        val existingToken = prefs[TOKEN_KEY]
        if (!existingToken.isNullOrBlank()) {
            return existingToken
        }

        return try {
            val nick = _nickname.value.ifBlank { generateGuestName() }
            val resp = api.authenticateGuest(GuestAuthRequestDTO(name = nick))
            if (resp.isSuccessful && resp.body() != null) {
                val auth = resp.body()!!
                dataStore.edit {
                    it[TOKEN_KEY] = auth.token
                    it[USER_ID_KEY] = auth.user.id
                    it[NICKNAME_KEY] = auth.user.name
                }
                auth.token
            } else {
                generateLocalToken()
            }
        } catch (_: Exception) {
            generateLocalToken()
        }
    }

    private suspend fun generateLocalToken(): String {
        val genToken = "guest_${UUID.randomUUID()}"
        dataStore.edit { it[TOKEN_KEY] = genToken }
        return genToken
    }

    private fun extractRoomCode(input: String): String {
        return when {
            input.contains("/room/") -> input.substringAfterLast("/room/").substringBefore("?").substringBefore("/")
            input.contains("room=") -> input.substringAfter("room=").substringBefore("&")
            else -> input
        }
    }

    fun resetState() { _uiState.value = HomeUiState.Idle }
}
