import { MediaType } from "@watch2gether/shared";

export interface UnifiedPlayerInstance {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seekTo: (seconds: number) => Promise<void>;
  setPlaybackRate: (rate: number) => Promise<void>;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  isPaused: () => boolean;
  getPlaybackRate: () => number;
}

export interface PlayerEvents {
  onPlay?: (currentTime: number) => void;
  onPause?: (currentTime: number) => void;
  onSeek?: (targetTime: number) => void;
  onRateChange?: (rate: number) => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onBuffering?: (isBuffering: boolean) => void;
  onEnded?: () => void;
  onReady?: (player: UnifiedPlayerInstance) => void;
  onError?: (error: string) => void;
}

export interface VideoPlayerProps extends PlayerEvents {
  mediaUrl: string;
  mediaType: MediaType;
  canControl?: boolean;
  disabledReason?: string;
  onChangeMedia?: (newUrl: string, newType: MediaType) => void;
  className?: string;
}
