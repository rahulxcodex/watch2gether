import type { UserDTO, RoomDTO, PlaybackStateDTO, ChatMessageDTO, ReactionBurstDTO, PermissionMode, MediaType, ErrorResponseDTO } from './types';
export declare const SOCKET_EVENTS: {
    readonly ROOM_JOIN: "room:join";
    readonly ROOM_JOINED: "room:joined";
    readonly ROOM_LEAVE: "room:leave";
    readonly ROOM_MEMBER_JOINED: "room:member_joined";
    readonly ROOM_USER_JOINED: "room:user_joined";
    readonly ROOM_MEMBER_LEFT: "room:member_left";
    readonly ROOM_USER_LEFT: "room:user_left";
    readonly ROOM_SET_PERMISSION: "room:set_permission";
    readonly ROOM_PERMISSION_UPDATED: "room:permission_updated";
    readonly ROOM_CHANGE_MEDIA: "room:change_media";
    readonly ROOM_MEDIA_CHANGED: "room:media_changed";
    readonly SYNC_PING: "sync:ping";
    readonly SYNC_PONG: "sync:pong";
    readonly MEDIA_PLAY: "media:play";
    readonly MEDIA_PAUSE: "media:pause";
    readonly MEDIA_SEEK: "media:seek";
    readonly MEDIA_CHANGE: "media:change";
    readonly MEDIA_SYNC: "media:sync";
    readonly MEDIA_BUFFER: "media:buffer";
    readonly MEDIA_BUFFER_UPDATE: "media:buffer_update";
    readonly CHAT_SEND: "chat:send";
    readonly CHAT_MESSAGE: "chat:message";
    readonly REACTION_SEND: "reaction:send";
    readonly REACTION_BURST: "reaction:burst";
    readonly PERMISSION_DENIED: "permission:denied";
    readonly ERROR: "room:error";
};
export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
/**
 * Client ping to measure round-trip time and calculate clock offset.
 */
export interface SyncPingPayload {
    clientTimestamp: number;
    clientSequence?: number;
}
/**
 * Server response with server timestamp for Cristian's algorithm.
 */
export interface SyncPongPayload {
    clientTimestamp: number;
    serverTimestamp: number;
    clientSequence?: number;
}
/**
 * Payload for initial room state delivery upon joining.
 */
export interface RoomJoinedPayload {
    room: RoomDTO;
    user?: UserDTO;
    users: UserDTO[];
    playbackState: PlaybackStateDTO;
    serverTimestamp: number;
}
/**
 * Events sent by client to server.
 */
export interface ClientToServerEvents {
    'room:join': (payload: {
        roomCode: string;
        token?: string;
        sessionToken?: string;
        user: {
            id?: string;
            name: string;
            avatarColor?: string;
            isGuest?: boolean;
        };
    }, callback?: (response: {
        success: boolean;
        data?: RoomJoinedPayload;
        error?: string;
    }) => void) => void;
    'room:leave': (payload: {
        roomCode: string;
    }) => void;
    'room:set_permission': (payload: {
        roomCode: string;
        permissionMode: PermissionMode;
    }) => void;
    'room:change_media': (payload: {
        roomCode: string;
        mediaUrl: string;
        mediaType?: MediaType;
    }) => void;
    'sync:ping': (payload: SyncPingPayload) => void;
    'media:play': (payload: {
        roomCode: string;
        currentTime: number;
        clientTimestamp: number;
        playbackRate?: number;
    }) => void;
    'media:pause': (payload: {
        roomCode: string;
        currentTime: number;
        clientTimestamp: number;
    }) => void;
    'media:seek': (payload: {
        roomCode: string;
        targetTime: number;
        clientTimestamp: number;
        autoPlay?: boolean;
    }) => void;
    'media:change': (payload: {
        roomCode: string;
        mediaUrl: string;
        mediaType?: MediaType;
    }) => void;
    'media:buffer': (payload: {
        roomCode: string;
        isBuffering: boolean;
        currentTime: number;
    }) => void;
    'chat:send': (payload: {
        roomCode: string;
        text: string;
        clientTempId?: string;
    }) => void;
    'reaction:send': (payload: {
        roomCode: string;
        emoji: string;
        x?: number;
    }) => void;
}
/**
 * Events sent by server to client (broadcast or unicast).
 */
export interface ServerToClientEvents {
    'room:joined': (payload: RoomJoinedPayload) => void;
    'room:member_joined': (payload: {
        user: UserDTO;
        participantCount: number;
        timestamp: number;
    }) => void;
    'room:user_joined': (payload: {
        user: UserDTO;
        timestamp: number;
    }) => void;
    'room:member_left': (payload: {
        userId: string;
        userName?: string;
        participantCount?: number;
        newHostId?: string;
        timestamp: number;
    }) => void;
    'room:user_left': (payload: {
        userId: string;
        userName?: string;
        timestamp: number;
    }) => void;
    'room:permission_updated': (payload: {
        roomCode?: string;
        permissionMode: PermissionMode;
        updatedBy: string;
        timestamp?: number;
    }) => void;
    'room:media_changed': (payload: {
        roomCode?: string;
        mediaUrl: string;
        mediaType: MediaType;
        playbackState?: PlaybackStateDTO;
        updatedBy: string;
    }) => void;
    'sync:pong': (payload: SyncPongPayload) => void;
    'media:sync': (payload: PlaybackStateDTO) => void;
    'media:buffer_update': (payload: {
        userId: string;
        isBuffering: boolean;
    }) => void;
    'chat:message': (payload: ChatMessageDTO) => void;
    'reaction:burst': (payload: ReactionBurstDTO) => void;
    'permission:denied': (payload: {
        code: string;
        message: string;
        action: string;
    }) => void;
    'room:error': (payload: ErrorResponseDTO) => void;
}
/**
 * Socket.io InterServer events for Redis pub/sub scaling.
 */
export interface InterServerEvents {
    ping: () => void;
}
/**
 * Socket session data attached to each connected socket instance.
 */
export interface SocketData {
    userId?: string;
    userName?: string;
    avatarColor?: string;
    roomCode?: string;
    isGuest?: boolean;
    isHost?: boolean;
    isAuthenticated?: boolean;
}
