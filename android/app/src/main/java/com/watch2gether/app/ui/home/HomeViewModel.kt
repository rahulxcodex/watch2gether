package com.watch2gether.app.ui.home

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.watch2gether.app.data.model.CreateRoomRequest
import com.watch2gether.app.data.model.PermissionMode
import com.watch2gether.app.data.remote.Watch2GetherApi
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

sealed class HomeUiState {
    object Idle : HomeUiState()
    object Loading : HomeUiState()
    data class Success(val roomId: String) : HomeUiState()
    data class Error(val message: String) : HomeUiState()
}

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val api: Watch2GetherApi,
    private val dataStore: DataStore<Preferences>
) : ViewModel() {

    private val _uiState = MutableStateFlow<HomeUiState>(HomeUiState.Idle)
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    private val _nickname = MutableStateFlow("")
    val nickname: StateFlow<String> = _nickname.asStateFlow()

    private val _joinCode = MutableStateFlow("")
    val joinCode: StateFlow<String> = _joinCode.asStateFlow()

    private val TOKEN_KEY = stringPreferencesKey("auth_token")
    private val GUEST_ID_KEY = stringPreferencesKey("guest_id")
    private val NICKNAME_KEY = stringPreferencesKey("nickname")

    fun onNicknameChange(value: String) { _nickname.value = value }
    fun onJoinCodeChange(value: String) { _joinCode.value = value }

    fun createRoom(permissionMode: PermissionMode = PermissionMode.HOST_ONLY) {
        val nick = _nickname.value.ifBlank { "Guest_${UUID.randomUUID().toString().take(4)}" }
        viewModelScope.launch {
            _uiState.value = HomeUiState.Loading
            try {
                val token = ensureGuestToken()
                val resp = api.createRoom(
                    "Bearer $token",
                    CreateRoomRequest(nickname = nick, permissionMode = permissionMode)
                )
                if (resp.isSuccessful) {
                    _uiState.value = HomeUiState.Success(resp.body()!!.room.id)
                } else {
                    _uiState.value = HomeUiState.Error("Server error: ${resp.code()}")
                }
            } catch (e: Exception) {
                _uiState.value = HomeUiState.Error(e.message ?: "Unknown error")
            }
        }
    }

    fun joinRoom() {
        val code = _joinCode.value.trim()
        if (code.isEmpty()) {
            _uiState.value = HomeUiState.Error("Enter a room code or paste a link")
            return
        }
        // Extract room ID from link if pasted
        val roomId = if (code.contains("/room/")) code.substringAfterLast("/room/") else code
        viewModelScope.launch {
            _uiState.value = HomeUiState.Loading
            try {
                val nick = _nickname.value.ifBlank { "Guest_${UUID.randomUUID().toString().take(4)}" }
                val token = ensureGuestToken()
                val resp = api.joinRoom("Bearer $token", roomId, mapOf("nickname" to nick))
                if (resp.isSuccessful) {
                    _uiState.value = HomeUiState.Success(resp.body()!!.room.id)
                } else {
                    _uiState.value = HomeUiState.Error("Room not found (${resp.code()})")
                }
            } catch (e: Exception) {
                _uiState.value = HomeUiState.Error(e.message ?: "Unknown error")
            }
        }
    }

    fun resetState() { _uiState.value = HomeUiState.Idle }

    private suspend fun ensureGuestToken(): String {
        val prefs = dataStore.data.first()
        return prefs[TOKEN_KEY] ?: run {
            // Generate ephemeral guest token — real app would call /api/auth/guest
            val generated = "guest_${UUID.randomUUID()}"
            generated
        }
    }
}
