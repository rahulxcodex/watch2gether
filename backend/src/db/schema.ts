import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  isGuest: integer('is_guest', { mode: 'boolean' }).notNull().default(true),
  avatarUrl: text('avatar_url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  lastActiveAt: integer('last_active_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  roomCode: text('room_code').notNull().unique(),
  name: text('name').notNull(),
  hostId: text('host_id').notNull().references(() => users.id),
  mediaUrl: text('media_url').notNull().default(''),
  mediaType: text('media_type', { enum: ['MP4', 'YOUTUBE', 'LOCAL_FILE', 'HLS'] }).notNull().default('MP4'),
  playbackState: text('playback_state', { enum: ['IDLE', 'PLAYING', 'PAUSED'] }).notNull().default('IDLE'),
  currentTime: real('current_time').notNull().default(0),
  permissionMode: text('permission_mode', { enum: ['HOST_ONLY', 'SHARED'] }).notNull().default('HOST_ONLY'),
  version: integer('version').notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  roomCode: text('room_code').notNull().references(() => rooms.roomCode),
  senderId: text('sender_id').notNull().references(() => users.id),
  senderName: text('sender_name').notNull(),
  text: text('text').notNull(),
  timestamp: integer('timestamp').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
