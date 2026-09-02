import { MediaType, PartnerProgressDTO } from "@watch2gether/shared";

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
  title?: string;
  canControl?: boolean;
  disabledReason?: string;
  partnerProgress?: PartnerProgressDTO | null;
  isDucked?: boolean;
  onSnapSync?: () => void;
  onSendReaction?: (emoji: string) => void;
  onChangeMedia?: (newUrl: string, newType: MediaType) => void;
  onToggleTheater?: () => void;
  isTheaterMode?: boolean;
  onScreenShareChange?: (isSharing: boolean) => void;
  className?: string;
}
