import type {
  UserDTO,
  RoomDTO,
  PlaybackStateDTO,
  ChatMessageDTO,
  ReactionBurstDTO,
  PermissionMode,
  MediaType,
  ErrorResponseDTO,
} from './types';

export const SOCKET_EVENTS = {
  // Room Lifecycle
  ROOM_JOIN: 'room:join',
  ROOM_JOINED: 'room:joined',
  ROOM_LEAVE: 'room:leave',
  ROOM_MEMBER_JOINED: 'room:member_joined',
  ROOM_USER_JOINED: 'room:user_joined',
  ROOM_MEMBER_LEFT: 'room:member_left',
  ROOM_USER_LEFT: 'room:user_left',
  ROOM_SET_PERMISSION: 'room:set_permission',
  ROOM_PERMISSION_UPDATED: 'room:permission_updated',
  ROOM_CHANGE_MEDIA: 'room:change_media',
  ROOM_MEDIA_CHANGED: 'room:media_changed',

  // NTP Clock Sync
  SYNC_PING: 'sync:ping',
  SYNC_PONG: 'sync:pong',

  // Media Synchronization
  MEDIA_PLAY: 'media:play',
  MEDIA_PAUSE: 'media:pause',
  MEDIA_SEEK: 'media:seek',
  MEDIA_CHANGE: 'media:change',
  MEDIA_SYNC: 'media:sync',
  MEDIA_BUFFER: 'media:buffer',
  MEDIA_BUFFER_UPDATE: 'media:buffer_update',

  // Real-time Chat
  CHAT_SEND: 'chat:send',
  CHAT_MESSAGE: 'chat:message',

  // Emoji Reactions
  REACTION_SEND: 'reaction:send',
  REACTION_BURST: 'reaction:burst',

  // Permissions & Errors
  PERMISSION_DENIED: 'permission:denied',
  ERROR: 'room:error',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

/**
 * Client ping to measure round-trip time and calculate clock offset.
 */
export interface SyncPingPayload {
  clientTimestamp: number;    // Client local timestamp T1 (ms)
  clientSequence?: number;    // Monotonic sequence number for pairing
}

/**
 * Server response with server timestamp for Cristian's algorithm.
 */
export interface SyncPongPayload {
  clientTimestamp: number;    // Echoed T1 from client
  serverTimestamp: number;    // Server receive/transmit timestamp T2 (ms)
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
  // Room
  'room:join': (
    payload: {
      roomCode: string;
      token?: string;
      sessionToken?: string;
      user: { id?: string; name: string; avatarColor?: string; isGuest?: boolean };
    },
    callback?: (response: { success: boolean; data?: RoomJoinedPayload; error?: string }) => void
  ) => void;
  'room:leave': (payload: { roomCode: string }) => void;
  'room:set_permission': (payload: { roomCode: string; permissionMode: PermissionMode }) => void;
  'room:change_media': (payload: { roomCode: string; mediaUrl: string; mediaType?: MediaType }) => void;

  // Sync
  'sync:ping': (payload: SyncPingPayload) => void;

  // Media Playback
  'media:play': (payload: { roomCode: string; currentTime: number; clientTimestamp: number; playbackRate?: number }) => void;
  'media:pause': (payload: { roomCode: string; currentTime: number; clientTimestamp: number }) => void;
  'media:seek': (payload: { roomCode: string; targetTime: number; clientTimestamp: number; autoPlay?: boolean }) => void;
  'media:change': (payload: { roomCode: string; mediaUrl: string; mediaType?: MediaType }) => void;
  'media:buffer': (payload: { roomCode: string; isBuffering: boolean; currentTime: number }) => void;

  // Chat
  'chat:send': (payload: { roomCode: string; text: string; clientTempId?: string }) => void;

  // Reactions
  'reaction:send': (payload: { roomCode: string; emoji: string; x?: number }) => void;
}

/**
 * Events sent by server to client (broadcast or unicast).
 */
export interface ServerToClientEvents {
  // Room
  'room:joined': (payload: RoomJoinedPayload) => void;
  'room:member_joined': (payload: { user: UserDTO; participantCount: number; timestamp: number }) => void;
  'room:user_joined': (payload: { user: UserDTO; timestamp: number }) => void;
  'room:member_left': (payload: { userId: string; userName?: string; participantCount?: number; newHostId?: string; timestamp: number }) => void;
  'room:user_left': (payload: { userId: string; userName?: string; timestamp: number }) => void;
  'room:permission_updated': (payload: { roomCode?: string; permissionMode: PermissionMode; updatedBy: string; timestamp?: number }) => void;
  'room:media_changed': (payload: { roomCode?: string; mediaUrl: string; mediaType: MediaType; playbackState?: PlaybackStateDTO; updatedBy: string }) => void;

  // Sync
  'sync:pong': (payload: SyncPongPayload) => void;

  // Media
  'media:sync': (payload: PlaybackStateDTO) => void;
  'media:buffer_update': (payload: { userId: string; isBuffering: boolean }) => void;

  // Chat
  'chat:message': (payload: ChatMessageDTO) => void;

  // Reactions
  'reaction:burst': (payload: ReactionBurstDTO) => void;

  // Error & Permissions
  'permission:denied': (payload: { code: string; message: string; action: string }) => void;
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
