/**
 * Media playback status state machine.
 */
export type PlaybackStatus = 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'IDLE';
/**
 * Supported media source types.
 */
export type MediaType = 'MP4' | 'YOUTUBE';
/**
 * Permission policy for room media playback control.
 * - HOST_ONLY: Only room host can play, pause, seek, or change media.
 * - SHARED: Any participant in the room can control playback.
 */
export type PermissionMode = 'HOST_ONLY' | 'SHARED';
/**
 * User participant role within a room.
 */
export type UserRole = 'HOST' | 'MEMBER';
/**
 * Standard representation of a connected user.
 */
export interface UserDTO {
    id: string;
    name: string;
    isGuest: boolean;
    avatarUrl?: string | null;
    color?: string;
    avatarColor?: string;
    isHost?: boolean;
    joinedAt?: number;
}
/**
 * Payload returned upon successful anonymous or authenticated login.
 */
export interface AuthResponseDTO {
    token: string;
    user: UserDTO;
}
/**
 * Payload sent to request a guest JWT token.
 */
export interface GuestAuthRequestDTO {
    name?: string;
    avatar?: string;
}
/**
 * Data transfer object representing room metadata and configuration.
 */
export interface RoomDTO {
    id: string;
    roomCode: string;
    name: string;
    hostId: string;
    mediaUrl: string;
    mediaType: MediaType;
    permissionMode: PermissionMode;
    playbackState?: PlaybackStatus;
    currentTime?: number;
    version?: number;
    createdAt: number | string;
    updatedAt?: number | string;
}
/**
 * REST Request DTO for creating a new room.
 */
export interface CreateRoomRequestDTO {
    name?: string;
    mediaUrl?: string;
    mediaType?: MediaType;
    permissionMode?: PermissionMode;
}
/**
 * REST Response DTO after creating a room.
 */
export interface CreateRoomResponseDTO {
    id: string;
    roomCode: string;
    name: string;
    hostId: string;
    mediaUrl: string;
    mediaType: MediaType;
    playbackState?: PlaybackStatus;
    currentTime?: number;
    permissionMode: PermissionMode;
    version?: number;
    createdAt: string | number;
}
/**
 * Authoritative playback state snapshot anchored to server time.
 */
export interface PlaybackStateDTO {
    state?: PlaybackStatus;
    status?: PlaybackStatus;
    currentTime: number;
    mediaUrl?: string;
    mediaType?: MediaType;
    serverTimestamp: number;
    playbackRate: number;
    version: number;
    issuerId?: string;
    duration?: number;
}
/**
 * Detailed room state for initial hydration on join or REST inspection.
 */
export interface RoomDetailsDTO {
    id: string;
    roomCode: string;
    name: string;
    hostId: string;
    mediaUrl: string;
    mediaType: MediaType;
    permissionMode: PermissionMode;
    playbackState: PlaybackStateDTO;
    activeUsers: UserDTO[];
    createdAt: number | string;
}
/**
 * Client-initiated action to change playback state.
 */
export interface MediaActionPayload {
    roomCode: string;
    currentTime: number;
    clientTimestamp: number;
    playbackRate?: number;
}
/**
 * Client-initiated seek action.
 */
export interface MediaSeekPayload {
    roomCode: string;
    targetTime: number;
    clientTimestamp: number;
    autoPlay?: boolean;
}
/**
 * Chat message representation.
 */
export interface ChatMessageDTO {
    id: string;
    roomCode?: string;
    sender: UserDTO;
    text: string;
    timestamp: number;
    system?: boolean;
}
/**
 * Floating emoji reaction particle burst.
 */
export interface ReactionBurstDTO {
    id?: string;
    roomCode?: string;
    emoji: string;
    senderId: string;
    senderName?: string;
    timestamp: number;
    x?: number;
    count?: number;
}
/**
 * Service health status response.
 */
export interface HealthCheckResponseDTO {
    status: 'ok' | 'degraded' | 'error';
    redis: boolean;
    db?: boolean;
    database?: boolean;
    version?: string;
    uptime?: number;
    timestamp: number;
    mode?: string;
}
/**
 * Standard WebSocket or REST error payload.
 */
export interface ErrorResponseDTO {
    code: string;
    message: string;
    details?: unknown;
    action?: string;
}
