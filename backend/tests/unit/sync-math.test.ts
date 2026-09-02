import { describe, it, expect } from 'vitest';
import { projectCurrentTime, RoomState } from '../../src/services/room.service';

describe('Authoritative Playhead Projection on Backend', () => {
  it('should return exact currentTime when state is PAUSED', () => {
    const state: RoomState = {
      id: '1',
      roomCode: 'ROOM1',
      name: 'Test',
      hostId: 'u1',
      permissionMode: 'HOST_ONLY',
      mediaUrl: 'test.mp4',
      mediaType: 'MP4',
      playbackState: 'PAUSED',
      currentTime: 42.5,
      playbackRate: 1.0,
      updatedAt: 1000000,
      version: 1,
      members: new Map(),
      createdAt: 1000000,
    };
    expect(projectCurrentTime(state, 1005000)).toBe(42.5);
  });

  it('should project forward proportionally when state is PLAYING', () => {
    const state: RoomState = {
      id: '1',
      roomCode: 'ROOM1',
      name: 'Test',
      hostId: 'u1',
      permissionMode: 'HOST_ONLY',
      mediaUrl: 'test.mp4',
      mediaType: 'MP4',
      playbackState: 'PLAYING',
      currentTime: 10.0,
      playbackRate: 1.0,
      updatedAt: 1000000,
      version: 1,
      members: new Map(),
      createdAt: 1000000,
    };
    // 3 seconds elapsed (3000ms)
    expect(projectCurrentTime(state, 1003000)).toBeCloseTo(13.0, 3);
  });

  it('should factor in custom playbackRate (e.g. 1.25x)', () => {
    const state: RoomState = {
      id: '1',
      roomCode: 'ROOM1',
      name: 'Test',
      hostId: 'u1',
      permissionMode: 'HOST_ONLY',
      mediaUrl: 'test.mp4',
      mediaType: 'MP4',
      playbackState: 'PLAYING',
      currentTime: 10.0,
      playbackRate: 1.25,
      updatedAt: 1000000,
      version: 1,
      members: new Map(),
      createdAt: 1000000,
    };
    // 4 seconds elapsed at 1.25x -> +5.0 seconds
    expect(projectCurrentTime(state, 1004000)).toBeCloseTo(15.0, 3);
  });
});
