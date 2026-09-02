/**
 * Media playback status state machine.
 */
export type PlaybackStatus = 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'IDLE';

/**
 * Supported media source types.
 */
export type MediaType = 'MP4' | 'YOUTUBE' | 'LOCAL_FILE' | 'HLS';

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
  id: string;             // UUID or unique user ID
  name: string;           // Display name (e.g. "Anonymous Panda" or chosen username)
  isGuest: boolean;       // True for zero-wall anonymous users
  avatarUrl?: string | null;     // Optional avatar image URL
  color?: string;         // Hex color code for badges/chat avatars
  avatarColor?: string;   // Optional color alias
  isHost?: boolean;       // True if this user is the room host
  joinedAt?: number;      // Unix timestamp (ms)
}

/**
 * Payload returned upon successful anonymous or authenticated login.
 */
export interface AuthResponseDTO {
  token: string;          // JWT token for authentication
  user: UserDTO;          // Authenticated user details
}

/**
 * Payload sent to request a guest JWT token.
 */
export interface GuestAuthRequestDTO {
  name?: string;          // Optional preferred display name
  avatar?: string;        // Optional avatar URL
}

/**
 * Data transfer object representing room metadata and configuration.
 */
export interface RoomDTO {
  id: string;                         // UUID
  roomCode: string;                   // Short uppercase code (e.g., "SYNC-4921" or "XYZ890")
  name: string;                       // Human-readable room title
  hostId: string;                     // ID of room creator/host
  mediaUrl: string;                   // Active video URL
  mediaType: MediaType;               // Source type
  permissionMode: PermissionMode;     // Access control policy
  playbackState?: PlaybackStatus;     // Current playback status
  currentTime?: number;               // Current playback time in seconds
  version?: number;                   // Monotonic state version
  queue?: QueueItemDTO[];              // The Shelf: queued media playlist
  createdAt: number | string;         // Creation timestamp (ms or ISO string)
  updatedAt?: number | string;        // Last modified timestamp (ms or ISO string)
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
  state?: PlaybackStatus;     // Alias for status
  status?: PlaybackStatus;    // 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'IDLE'
  currentTime: number;        // Playback position in seconds at serverTimestamp
  mediaUrl?: string;          // Active media URL
  mediaType?: MediaType;      // Media provider
  serverTimestamp: number;    // Server epoch timestamp in ms when state was captured
  playbackRate: number;       // Current playback speed (default 1.0)
  version: number;            // Monotonically increasing sequence number
  issuerId?: string;          // User ID of participant who triggered the change
  duration?: number;          // Media duration in seconds (if known)
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
  currentTime: number;        // Position in seconds
  clientTimestamp: number;    // Client local timestamp when action occurred
  playbackRate?: number;
}

/**
 * Client-initiated seek action.
 */
export interface MediaSeekPayload {
  roomCode: string;
  targetTime: number;         // New target position in seconds
  clientTimestamp: number;
  autoPlay?: boolean;
}

/**
 * Chat message representation.
 */
export interface ChatMessageDTO {
  id: string;                 // UUID
  roomCode?: string;
  sender: UserDTO;
  text: string;               // Message text content
  timestamp: number;          // Epoch timestamp in ms
  system?: boolean;           // True for automated system announcements
}

/**
 * Floating emoji reaction particle burst.
 */
export interface ReactionBurstDTO {
  id?: string;                // Burst identifier
  roomCode?: string;
  emoji: string;              // Emoji character (e.g., '❤️', '🔥', '😂', '🎉', '🍿')
  senderId: string;           // User ID of sender
  senderName?: string;        // Display name of sender
  timestamp: number;          // Epoch timestamp in ms
  x?: number;                 // Normalized horizontal float (0.0 to 1.0) for canvas
  count?: number;             // Multiplier count for rapid tapping
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
  uptime?: number;             // Process uptime in seconds
  timestamp: number;
  mode?: string;
}

/**
 * Standard WebSocket or REST error payload.
 */
export interface ErrorResponseDTO {
  code: string;               // Machine-readable error code (e.g., 'ROOM_NOT_FOUND')
  message: string;            // Human-readable message
  details?: unknown;
  action?: string;
}

/**
 * Parsed individual subtitle cue.
 */
export interface SubtitleCue {
  id?: string;
  start: number;              // Start time in seconds
  end: number;                // End time in seconds
  text: string;               // Caption text content
}

/**
 * Subtitle track descriptor.
 */
export interface SubtitleTrack {
  key: string;
  label: string;
  language?: string;
  url?: string;
  content?: string;           // Raw SRT or VTT string
}

/**
 * Media shelf / room playlist queue item.
 */
export interface QueueItemDTO {
  id: string;
  title: string;
  url: string;
  mediaType: MediaType;
  duration?: number;
  thumbnailUrl?: string;
  addedBy?: string;
  addedByName?: string;
  createdAt: number;
}

/**
 * WebRTC P2P Voice Chat Signal Payload.
 */
export interface PeerSignalPayload {
  roomCode: string;
  fromUserId: string;
  toUserId?: string;          // Optional target user ID (empty for broadcast)
  signalData: any;            // RTCSessionDescriptionInit or RTCIceCandidateInit
  type: 'offer' | 'answer' | 'ice-candidate';
}

/**
 * Partner progress report for the dual playhead scrubber ribbon.
 */
export interface PartnerProgressDTO {
  userId: string;
  name: string;
  color?: string;
  currentTime: number;        // Position in seconds
  duration?: number;
  isStalled?: boolean;
  isSpeaking?: boolean;
  updatedAt: number;
}

