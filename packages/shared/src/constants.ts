export const SYNC_CONSTANTS = {
  // Drift Thresholds
  DEADBAND_MS: 150,                // Tier 1: Ignore drift <= 150ms
  SOFT_RATE_THRESHOLD_MS: 1000,    // Tier 2: Micro-rate adjustment up to 1000ms
  HARD_SEEK_THRESHOLD_MS: 1000,    // Tier 3: Hard seek for drift > 1000ms

  // Soft Rate Adjustment Multipliers
  RATE_FAST: 1.08,                 // Catch-up playback rate
  RATE_SLOW: 0.92,                 // Deceleration playback rate
  RATE_NORMAL: 1.00,               // Standard playback rate

  // NTP Clock Sync Configuration
  SYNC_INTERVAL_MS: 5000,          // Interval between routine ping/pong syncs
  INITIAL_SYNC_ROUNDS: 5,          // Number of rapid initial sync rounds on join
  INITIAL_SYNC_DELAY_MS: 200,      // Delay between initial sync pings
  MAX_SAMPLE_WINDOW_SIZE: 10,      // Maximum sliding window capacity
  SYNC_TIMEOUT_MS: 3000,           // Ping timeout threshold

  // Room Defaults
  DEFAULT_PERMISSION_MODE: 'SHARED' as const,
  DEFAULT_MEDIA_TYPE: 'MP4' as const,
  ROOM_CODE_LENGTH: 6,             // Code format e.g. "ABC123"

  // Chat & Reaction Limits
  MAX_CHAT_LENGTH: 500,            // Max characters per message
  MAX_REACTIONS_PER_SECOND: 5,     // Rate limit per client
} as const;
