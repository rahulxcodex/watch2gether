"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SOCKET_EVENTS = void 0;
exports.SOCKET_EVENTS = {
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
};
//# sourceMappingURL=events.js.map