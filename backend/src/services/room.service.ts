import { getDb } from '../db/db';
import { rooms, telemetryEvents, NewRoom, Room } from '../db/schema';
import { eq } from 'drizzle-orm';
import {
  CircularBuffer,
  PriorityQueue,
  BloomFilter,
  SlidingWindowRateLimiter,
  type PermissionMode,
  type MediaType,
  type PlaybackStatus,
  type QueueItemDTO,
} from '@watch2gether/shared';
import { nanoid } from 'nanoid';

export type PlaybackState = 'PLAYING' | 'PAUSED' | 'IDLE';

export interface RoomMember {
  id: string;
  name: string;
  avatarColor?: string;
  socketId: string;
  isHost: boolean;
  joinedAt: number;
}

export interface RoomState {
  id: string;
  roomCode: string;
  name: string;
  hostId: string;
  permissionMode: PermissionMode;
  mediaUrl: string;
  mediaType: MediaType;
  playbackState: PlaybackState;
  currentTime: number; // Anchor position in seconds at updatedAt
  playbackRate: number; // Speed multiplier (1.0 default)
  updatedAt: number; // Authoritative server timestamp (epoch ms)
  version: number; // Monotonically increasing sequence number
  members: Map<string, RoomMember>;
  queue?: QueueItemDTO[]; // The Shelf: queued media playlist
  createdAt: number;
}

/**
 * Authoritative playhead projection formula:
 * If PLAYING: currentTime + (now - updatedAt)/1000 * playbackRate
 * If PAUSED or IDLE: currentTime
 */
export function projectCurrentTime(state: RoomState, now: number = Date.now()): number {
  if (state.playbackState !== 'PLAYING') {
    return Math.max(0, state.currentTime);
  }
  const elapsedMs = Math.max(0, now - state.updatedAt);
  const elapsedSeconds = elapsedMs / 1000;
  return Math.max(0, state.currentTime + elapsedSeconds * state.playbackRate);
}

export interface IRoomStateStore {
  getRoom(roomCode: string): Promise<RoomState | null>;
  createRoom(room: Omit<RoomState, 'members'>): Promise<RoomState>;
  addMember(
    roomCode: string,
    member: RoomMember
  ): Promise<{ state: RoomState; member: RoomMember }>;
  removeMember(
    roomCode: string,
    socketId: string
  ): Promise<{
    state: RoomState | null;
    removedMember: RoomMember | null;
    newHostId: string | null;
  }>;
  updatePlayback(
    roomCode: string,
    mutation: {
      playbackState?: PlaybackState;
      currentTime?: number;
      playbackRate?: number;
      mediaUrl?: string;
      mediaType?: MediaType;
    }
  ): Promise<RoomState | null>;
  setPermissionMode(roomCode: string, mode: PermissionMode): Promise<RoomState | null>;
  setHost(roomCode: string, newHostId: string): Promise<RoomState | null>;
  addToQueue(roomCode: string, item: QueueItemDTO): Promise<RoomState | null>;
  removeFromQueue(roomCode: string, itemId: string): Promise<RoomState | null>;
  reorderQueue(roomCode: string, fromIndex: number, toIndex: number): Promise<RoomState | null>;
  voteQueueItem(roomCode: string, itemId: string, delta?: number): Promise<RoomState | null>;
  sweepStaleRooms(now?: number): number;
  getChatBuffer(roomCode: string): CircularBuffer<any>;
  getBloomFilter(roomCode: string): BloomFilter;
  getRateLimiter(key: string, maxRequests?: number, windowMs?: number): SlidingWindowRateLimiter;
}

export class MemoryRoomStateStore implements IRoomStateStore {
  private rooms = new Map<string, RoomState>();
  private expiryMap = new Map<string, number>();
  private chatBuffers = new Map<string, CircularBuffer<any>>();
  private bloomFilters = new Map<string, BloomFilter>();
  private rateLimiters = new Map<string, SlidingWindowRateLimiter>();

  public getChatBuffer(roomCode: string): CircularBuffer<any> {
    const code = roomCode.toUpperCase();
    if (!this.chatBuffers.has(code)) {
      this.chatBuffers.set(code, new CircularBuffer<any>(200));
    }
    return this.chatBuffers.get(code)!;
  }

  public getBloomFilter(roomCode: string): BloomFilter {
    const code = roomCode.toUpperCase();
    if (!this.bloomFilters.has(code)) {
      this.bloomFilters.set(code, new BloomFilter(2048, 4));
    }
    return this.bloomFilters.get(code)!;
  }

  public getRateLimiter(key: string, maxRequests = 10, windowMs = 5000): SlidingWindowRateLimiter {
    if (!this.rateLimiters.has(key)) {
      this.rateLimiters.set(key, new SlidingWindowRateLimiter(maxRequests, windowMs));
    }
    return this.rateLimiters.get(key)!;
  }

  public sweepStaleRooms(now = Date.now()): number {
    let count = 0;
    for (const [code, expiry] of this.expiryMap.entries()) {
      if (now >= expiry) {
        const room = this.rooms.get(code);
        if (room && room.members.size === 0) {
          this.rooms.delete(code);
          this.chatBuffers.delete(code);
          this.bloomFilters.delete(code);
          count++;
        }
        this.expiryMap.delete(code);
      }
    }
    return count;
  }

  public async getRoom(roomCode: string): Promise<RoomState | null> {
    const code = roomCode.toUpperCase();
    let room = this.rooms.get(code);
    if (!room) {
      // Check database
      const dbRoom = await RoomService.getRoomByCode(code);
      if (dbRoom) {
        room = {
          id: dbRoom.id,
          roomCode: dbRoom.roomCode,
          name: dbRoom.name,
          hostId: dbRoom.hostId,
          permissionMode: dbRoom.permissionMode as PermissionMode,
          mediaUrl: dbRoom.mediaUrl,
          mediaType: dbRoom.mediaType as MediaType,
          playbackState: dbRoom.playbackState as PlaybackState,
          currentTime: dbRoom.currentTime,
          playbackRate: 1.0,
          updatedAt: dbRoom.updatedAt.getTime(),
          version: dbRoom.version,
          members: new Map(),
          queue: [],
          createdAt: dbRoom.createdAt.getTime(),
        };
        this.rooms.set(code, room);
      }
    }
    return room ? { ...room, members: new Map(room.members) } : null;
  }

  public async createRoom(init: Omit<RoomState, 'members'>): Promise<RoomState> {
    const roomCode = init.roomCode.toUpperCase();
    const room: RoomState = {
      ...init,
      roomCode,
      members: new Map(),
      queue: init.queue || [],
    };
    this.rooms.set(roomCode, room);
    this.expiryMap.delete(roomCode);
    return { ...room, members: new Map(room.members) };
  }

  public async addToQueue(roomCode: string, item: QueueItemDTO): Promise<RoomState | null> {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return null;
    room.queue = [...(room.queue || []), item];
    return { ...room, members: new Map(room.members) };
  }

  public async removeFromQueue(roomCode: string, itemId: string): Promise<RoomState | null> {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return null;
    room.queue = (room.queue || []).filter((q) => q.id !== itemId);
    return { ...room, members: new Map(room.members) };
  }

  public async reorderQueue(
    roomCode: string,
    fromIndex: number,
    toIndex: number
  ): Promise<RoomState | null> {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (!room || !room.queue || room.queue.length === 0) return null;
    if (fromIndex < 0 || fromIndex >= room.queue.length || toIndex < 0 || toIndex >= room.queue.length) {
      return { ...room, members: new Map(room.members) };
    }
    const [moved] = room.queue.splice(fromIndex, 1);
    if (moved) {
      room.queue.splice(toIndex, 0, moved);
    }
    room.version += 1;
    return { ...room, members: new Map(room.members) };
  }

  public async voteQueueItem(
    roomCode: string,
    itemId: string,
    delta = 1
  ): Promise<RoomState | null> {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (!room || !room.queue) return null;

    const item = room.queue.find((q) => q.id === itemId);
    if (item) {
      item.votes = (item.votes || 0) + delta;
      // Re-heapify / sort queue using PriorityQueue comparator
      const pq = new PriorityQueue<QueueItemDTO>((a, b) => {
        const votesA = a.votes || 0;
        const votesB = b.votes || 0;
        if (votesB !== votesA) return votesB - votesA;
        return a.createdAt - b.createdAt;
      });
      for (const q of room.queue) pq.enqueue(q);
      room.queue = pq.toSortedArray();
      room.version += 1;
    }
    return { ...room, members: new Map(room.members) };
  }

  public async addMember(
    roomCode: string,
    member: RoomMember
  ): Promise<{ state: RoomState; member: RoomMember }> {
    const code = roomCode.toUpperCase();
    this.expiryMap.delete(code);
    let room = this.rooms.get(code);
    if (!room) {
      const state = await this.getRoom(code);
      if (!state) throw new Error(`Room ${roomCode} does not exist`);
      room = this.rooms.get(code)!;
    }

    if (!room.hostId || room.members.size === 0) {
      room.hostId = member.id;
      member.isHost = true;
    } else if (room.hostId === member.id) {
      member.isHost = true;
    }

    room.members.set(member.socketId, member);
    return { state: { ...room, members: new Map(room.members) }, member };
  }

  public async removeMember(
    roomCode: string,
    socketId: string
  ): Promise<{
    state: RoomState | null;
    removedMember: RoomMember | null;
    newHostId: string | null;
  }> {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return { state: null, removedMember: null, newHostId: null };

    const removedMember = room.members.get(socketId) || null;
    room.members.delete(socketId);

    if (room.members.size === 0) {
      // 30 minute TTL for empty room eviction
      this.expiryMap.set(code, Date.now() + 30 * 60 * 1000);
    }

    let newHostId: string | null = null;
    if (removedMember && removedMember.isHost && room.members.size > 0) {
      const remainingMembers = Array.from(room.members.values());
      remainingMembers.sort((a, b) => a.joinedAt - b.joinedAt);
      const nextHost = remainingMembers[0];
      nextHost.isHost = true;
      room.hostId = nextHost.id;
      newHostId = nextHost.id;
    }

    return {
      state: { ...room, members: new Map(room.members) },
      removedMember,
      newHostId,
    };
  }

  public async updatePlayback(
    roomCode: string,
    mutation: {
      playbackState?: PlaybackState;
      currentTime?: number;
      playbackRate?: number;
      mediaUrl?: string;
      mediaType?: MediaType;
    }
  ): Promise<RoomState | null> {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return null;

    const now = Date.now();

    if (mutation.currentTime !== undefined) {
      room.currentTime = mutation.currentTime;
    } else if (
      mutation.playbackState === 'PAUSED' &&
      room.playbackState === 'PLAYING'
    ) {
      room.currentTime = projectCurrentTime(room, now);
    }

    if (mutation.playbackState) {
      room.playbackState = mutation.playbackState;
    }
    if (mutation.playbackRate) {
      room.playbackRate = mutation.playbackRate;
    }
    if (mutation.mediaUrl !== undefined) {
      room.mediaUrl = mutation.mediaUrl;
    }
    if (mutation.mediaType !== undefined) {
      room.mediaType = mutation.mediaType;
    }

    room.updatedAt = now;
    room.version += 1;

    // Sync back to database asynchronously
    RoomService.updateRoomPlayback(code, {
      playbackState: room.playbackState,
      currentTime: room.currentTime,
      version: room.version,
      mediaUrl: room.mediaUrl,
      mediaType: room.mediaType,
    }).catch(() => {});

    return { ...room, members: new Map(room.members) };
  }

  public async setPermissionMode(
    roomCode: string,
    mode: PermissionMode
  ): Promise<RoomState | null> {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return null;
    room.permissionMode = mode;
    room.version += 1;

    RoomService.updateRoomPermission(code, mode, room.version).catch(() => {});

    return { ...room, members: new Map(room.members) };
  }

  public async setHost(
    roomCode: string,
    newHostId: string
  ): Promise<RoomState | null> {
    const code = roomCode.toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return null;
    room.hostId = newHostId;
    for (const member of room.members.values()) {
      member.isHost = member.id === newHostId;
    }
    return { ...room, members: new Map(room.members) };
  }
}

export class RoomService {
  static async createRoom(roomData: {
    id: string;
    roomCode: string;
    name: string;
    hostId: string;
    mediaUrl?: string;
    mediaType?: MediaType;
    playbackState?: PlaybackStatus;
    currentTime?: number;
    permissionMode?: PermissionMode;
    version?: number;
  }): Promise<Room> {
    const db = getDb();
    const now = new Date();
    const payload: NewRoom = {
      id: roomData.id,
      roomCode: roomData.roomCode.toUpperCase(),
      name: roomData.name,
      hostId: roomData.hostId,
      mediaUrl: roomData.mediaUrl || '',
      mediaType: roomData.mediaType || 'MP4',
      playbackState: (roomData.playbackState as any) || 'IDLE',
      currentTime: roomData.currentTime || 0,
      permissionMode: roomData.permissionMode || 'HOST_ONLY',
      version: roomData.version || 1,
      createdAt: now,
      updatedAt: now,
    };

    db.insert(rooms).values(payload).run();
    const room = await this.getRoomByCode(roomData.roomCode);
    return room!;
  }

  static async getRoomByCode(roomCode: string): Promise<Room | null> {
    const db = getDb();
    const result = db
      .select()
      .from(rooms)
      .where(eq(rooms.roomCode, roomCode.toUpperCase()))
      .get();
    return result || null;
  }

  static async getRoomById(id: string): Promise<Room | null> {
    const db = getDb();
    const result = db.select().from(rooms).where(eq(rooms.id, id)).get();
    return result || null;
  }

  static async updateRoomPlayback(
    roomCode: string,
    data: {
      playbackState?: string;
      currentTime?: number;
      version?: number;
      mediaUrl?: string;
      mediaType?: string;
    }
  ): Promise<void> {
    const db = getDb();
    const updatePayload: Record<string, any> = {
      updatedAt: new Date(),
    };
    if (data.playbackState) updatePayload.playbackState = data.playbackState;
    if (data.currentTime !== undefined) updatePayload.currentTime = data.currentTime;
    if (data.version !== undefined) updatePayload.version = data.version;
    if (data.mediaUrl !== undefined) updatePayload.mediaUrl = data.mediaUrl;
    if (data.mediaType !== undefined) updatePayload.mediaType = data.mediaType;

    db.update(rooms)
      .set(updatePayload)
      .where(eq(rooms.roomCode, roomCode.toUpperCase()))
      .run();
  }

  static async updateRoomPermission(
    roomCode: string,
    permissionMode: PermissionMode,
    version?: number
  ): Promise<void> {
    const db = getDb();
    const updatePayload: Record<string, any> = {
      permissionMode,
      updatedAt: new Date(),
    };
    if (version !== undefined) updatePayload.version = version;

    db.update(rooms)
      .set(updatePayload)
      .where(eq(rooms.roomCode, roomCode.toUpperCase()))
      .run();
  }

  static async logTelemetry(
    eventType: string,
    roomCode?: string,
    userId?: string,
    payload: Record<string, unknown> = {}
  ): Promise<void> {
    try {
      const db = getDb();
      db.insert(telemetryEvents)
        .values({
          id: `tel_${nanoid(12)}`,
          eventType,
          roomCode: roomCode?.toUpperCase() || null,
          userId: userId || null,
          payload: JSON.stringify(payload),
          createdAt: new Date(),
        })
        .run();
    } catch {}
  }
}

