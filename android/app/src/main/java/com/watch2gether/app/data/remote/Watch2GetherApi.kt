package com.watch2gether.app.data.remote

import com.watch2gether.app.data.model.CreateRoomRequest
import com.watch2gether.app.data.model.CreateRoomResponse
import com.watch2gether.app.data.model.JoinRoomResponse
import com.watch2gether.app.data.model.Room
import retrofit2.Response
import retrofit2.http.*

interface Watch2GetherApi {

    @POST("api/rooms")
    suspend fun createRoom(
        @Header("Authorization") token: String,
        @Body request: CreateRoomRequest
    ): Response<CreateRoomResponse>

    @GET("api/rooms/{id}")
    suspend fun getRoom(
        @Header("Authorization") token: String,
        @Path("id") roomId: String
    ): Response<Room>

    @POST("api/rooms/{id}/join")
    suspend fun joinRoom(
        @Header("Authorization") token: String,
        @Path("id") roomId: String,
        @Body body: Map<String, String>
    ): Response<JoinRoomResponse>

    @GET("api/health")
    suspend fun healthCheck(): Response<Map<String, String>>
}
