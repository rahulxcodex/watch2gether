package com.watch2gether.app.data.remote

import com.watch2gether.app.data.model.AuthResponseDTO
import com.watch2gether.app.data.model.CreateRoomRequestDTO
import com.watch2gether.app.data.model.CreateRoomResponseDTO
import com.watch2gether.app.data.model.GuestAuthRequestDTO
import com.watch2gether.app.data.model.RoomDTO
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path

interface Watch2GetherApi {

    @POST("api/auth/guest")
    suspend fun authenticateGuest(
        @Body request: GuestAuthRequestDTO = GuestAuthRequestDTO()
    ): Response<AuthResponseDTO>

    @POST("api/rooms")
    suspend fun createRoom(
        @Header("Authorization") token: String,
        @Body request: CreateRoomRequestDTO
    ): Response<CreateRoomResponseDTO>

    @GET("api/rooms/{roomCode}")
    suspend fun getRoom(
        @Header("Authorization") token: String,
        @Path("roomCode") roomCode: String
    ): Response<RoomDTO>

    @GET("api/health")
    suspend fun healthCheck(): Response<Map<String, Any>>
}
