import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRoomStateStore } from '../../src/services/room.service';

describe('MemoryRoomStateStore Unit Tests', () => {
  let store: MemoryRoomStateStore;

  beforeEach(() => {
    store = new MemoryRoomStateStore();
  });

  it('should assign first joining member as host if host is empty', async () => {
    await store.createRoom({
      id: '1',
      roomCode: 'TEST',
      name: 'Test',
      hostId: '',
      permissionMode: 'HOST_ONLY',
      mediaUrl: '',
      mediaType: 'MP4',
      playbackState: 'IDLE',
      currentTime: 0,
      playbackRate: 1.0,
      updatedAt: Date.now(),
      version: 1,
      createdAt: Date.now(),
    });

    const { state, member } = await store.addMember('TEST', {
      id: 'user_1',
      name: 'Alice',
      socketId: 'sock_1',
      isHost: false,
      joinedAt: 100,
    });

    expect(member.isHost).toBe(true);
    expect(state.hostId).toBe('user_1');
  });

  it('should increment monotonic version on playback mutations', async () => {
    await store.createRoom({
      id: '1',
      roomCode: 'TEST',
      name: 'Test',
      hostId: 'user_1',
      permissionMode: 'HOST_ONLY',
      mediaUrl: '',
      mediaType: 'MP4',
      playbackState: 'PAUSED',
      currentTime: 0,
      playbackRate: 1.0,
      updatedAt: Date.now(),
      version: 1,
      createdAt: Date.now(),
    });

    const v2 = await store.updatePlayback('TEST', {
      playbackState: 'PLAYING',
      currentTime: 5,
    });
    expect(v2?.version).toBe(2);
    expect(v2?.playbackState).toBe('PLAYING');

    const v3 = await store.updatePlayback('TEST', {
      playbackState: 'PAUSED',
      currentTime: 12,
    });
    expect(v3?.version).toBe(3);
    expect(v3?.playbackState).toBe('PAUSED');
  });

  it('should elect next oldest member when host disconnects', async () => {
    await store.createRoom({
      id: '1',
      roomCode: 'TEST',
      name: 'Test',
      hostId: 'user_1',
      permissionMode: 'HOST_ONLY',
      mediaUrl: '',
      mediaType: 'MP4',
      playbackState: 'IDLE',
      currentTime: 0,
      playbackRate: 1.0,
      updatedAt: Date.now(),
      version: 1,
      createdAt: Date.now(),
    });

    await store.addMember('TEST', {
      id: 'user_1',
      name: 'Alice',
      socketId: 'sock_1',
      isHost: true,
      joinedAt: 100,
    });
    await store.addMember('TEST', {
      id: 'user_2',
      name: 'Bob',
      socketId: 'sock_2',
      isHost: false,
      joinedAt: 200,
    });

    const { state, newHostId } = await store.removeMember('TEST', 'sock_1');
    expect(state?.members.size).toBe(1);
    expect(newHostId).toBe('user_2');
    expect(state?.hostId).toBe('user_2');
  });
});
