"use client";

import React, {
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
  useCallback,
  useEffect,
} from "react";
import { HTML5Player } from "./HTML5Player";
import { YouTubePlayer } from "./YouTubePlayer";
import { PlayerControls } from "./PlayerControls";
import { AmbientGlow } from "@/components/visual/AmbientGlow";
import { UnifiedPlayerInstance, VideoPlayerProps } from "./types";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export const VideoPlayer = forwardRef<UnifiedPlayerInstance, VideoPlayerProps>(
  (
    {
      mediaUrl,
      mediaType,
      canControl = true,
      disabledReason,
      onPlay,
      onPause,
      onSeek,
      onRateChange,
      onTimeUpdate,
      onBuffering,
      onEnded,
      onReady,
      onError,
      onChangeMedia,
      className,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const activePlayerRef = useRef<UnifiedPlayerInstance | null>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolumeState] = useState(0.8);
    const [isMuted, setIsMuted] = useState(false);
    const [playbackRate, setPlaybackRateState] = useState(1.0);
    const [isBuffering, setIsBuffering] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Unified player API forwarded to parent (e.g. useSyncEngine)
    const unifiedApi: UnifiedPlayerInstance = {
      play: async () => {
        setIsPlaying(true);
        if (activePlayerRef.current) {
          await activePlayerRef.current.play();
        }
      },
      pause: async () => {
        setIsPlaying(false);
        if (activePlayerRef.current) {
          await activePlayerRef.current.pause();
        }
      },
      seekTo: async (seconds: number) => {
        setCurrentTime(seconds);
        if (activePlayerRef.current) {
          await activePlayerRef.current.seekTo(seconds);
        }
      },
      setPlaybackRate: async (rate: number) => {
        setPlaybackRateState(rate);
        if (activePlayerRef.current) {
          await activePlayerRef.current.setPlaybackRate(rate);
        }
      },
      setVolume: (vol: number) => {
        setVolumeState(vol);
        if (activePlayerRef.current) {
          activePlayerRef.current.setVolume(vol);
        }
      },
      setMuted: (muted: boolean) => {
        setIsMuted(muted);
        if (activePlayerRef.current) {
          activePlayerRef.current.setMuted(muted);
        }
      },
      getCurrentTime: () => {
        return activePlayerRef.current ? activePlayerRef.current.getCurrentTime() : currentTime;
      },
      getDuration: () => {
        return activePlayerRef.current ? activePlayerRef.current.getDuration() : duration;
      },
      isPaused: () => {
        return activePlayerRef.current ? activePlayerRef.current.isPaused() : !isPlaying;
      },
      getPlaybackRate: () => {
        return activePlayerRef.current ? activePlayerRef.current.getPlaybackRate() : playbackRate;
      },
    };

    useImperativeHandle(ref, () => unifiedApi, [currentTime, duration, isPlaying, playbackRate]);

    const handlePlayerReady = useCallback(
      (player: UnifiedPlayerInstance) => {
        activePlayerRef.current = player;
        player.setVolume(volume);
        player.setMuted(isMuted);
        onReady?.(player);
      },
      [onReady, volume, isMuted]
    );

    const handlePlayPause = async () => {
      if (!canControl) return;
      if (isPlaying) {
        await unifiedApi.pause();
        onPause?.(unifiedApi.getCurrentTime());
      } else {
        await unifiedApi.play();
        onPlay?.(unifiedApi.getCurrentTime());
      }
    };

    const handleSeek = async (time: number) => {
      if (!canControl) return;
      await unifiedApi.seekTo(time);
      onSeek?.(time);
    };

    const handleVolumeChange = (vol: number) => {
      unifiedApi.setVolume(vol);
      if (vol > 0 && isMuted) {
        unifiedApi.setMuted(false);
      }
    };

    const handleToggleMute = () => {
      unifiedApi.setMuted(!isMuted);
    };

    const handleRateChange = async (rate: number) => {
      if (!canControl) return;
      await unifiedApi.setPlaybackRate(rate);
      onRateChange?.(rate);
    };

    const handleToggleFullscreen = async () => {
      if (!containerRef.current) return;
      if (!document.fullscreenElement) {
        try {
          await containerRef.current.requestFullscreen();
          setIsFullscreen(true);
        } catch (err) {
          console.warn("Fullscreen request error:", err);
        }
      } else {
        try {
          await document.exitFullscreen();
          setIsFullscreen(false);
        } catch (err) {
          console.warn("Fullscreen exit error:", err);
        }
      }
    };

    useEffect(() => {
      const handleFsChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
      };
      document.addEventListener("fullscreenchange", handleFsChange);
      return () => document.removeEventListener("fullscreenchange", handleFsChange);
    }, []);

    // Controls visibility timeout
    const triggerControlsActivity = () => {
      setShowControls(true);
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
      if (isPlaying) {
        hideControlsTimeoutRef.current = setTimeout(() => {
          setShowControls(false);
        }, 3000);
      }
    };

    return (
      <div
        ref={containerRef}
        onMouseMove={triggerControlsActivity}
        onTouchStart={triggerControlsActivity}
        className={cn(
          "relative group overflow-hidden rounded-2xl bg-black border border-slate-800 shadow-2xl aspect-video flex items-center justify-center select-none",
          className
        )}
      >
        {/* Ambient Backlight Glow */}
        <AmbientGlow isPlaying={isPlaying} />

        {/* Media Adapter Component */}
        <div className="absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden">
          {mediaType === "YOUTUBE" ? (
            <YouTubePlayer
              videoUrl={mediaUrl}
              className="w-full h-full"
              onPlay={(time) => {
                setIsPlaying(true);
                onPlay?.(time);
              }}
              onPause={(time) => {
                setIsPlaying(false);
                onPause?.(time);
              }}
              onSeek={(time) => {
                setCurrentTime(time);
                onSeek?.(time);
              }}
              onRateChange={(rate) => {
                setPlaybackRateState(rate);
                onRateChange?.(rate);
              }}
              onTimeUpdate={(time, dur) => {
                setCurrentTime(time);
                if (dur > 0) setDuration(dur);
                onTimeUpdate?.(time, dur);
              }}
              onBuffering={(buffering) => {
                setIsBuffering(buffering);
                onBuffering?.(buffering);
              }}
              onEnded={() => {
                setIsPlaying(false);
                onEnded?.();
              }}
              onReady={handlePlayerReady}
              onError={onError}
            />
          ) : (
            <HTML5Player
              src={mediaUrl}
              className="w-full h-full object-contain"
              onPlay={(time) => {
                setIsPlaying(true);
                onPlay?.(time);
              }}
              onPause={(time) => {
                setIsPlaying(false);
                onPause?.(time);
              }}
              onSeek={(time) => {
                setCurrentTime(time);
                onSeek?.(time);
              }}
              onRateChange={(rate) => {
                setPlaybackRateState(rate);
                onRateChange?.(rate);
              }}
              onTimeUpdate={(time, dur) => {
                setCurrentTime(time);
                if (dur > 0) setDuration(dur);
                onTimeUpdate?.(time, dur);
              }}
              onBuffering={(buffering) => {
                setIsBuffering(buffering);
                onBuffering?.(buffering);
              }}
              onEnded={() => {
                setIsPlaying(false);
                onEnded?.();
              }}
              onReady={handlePlayerReady}
              onError={onError}
            />
          )}
        </div>

        {/* Buffering Spinner */}
        {isBuffering && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-10 w-10 animate-spin text-indigo-400" />
              <span className="text-xs font-medium text-slate-300">Buffering...</span>
            </div>
          </div>
        )}

        {/* Custom Video Controls Overlay */}
        <div
          className={cn(
            "transition-opacity duration-300",
            showControls || !isPlaying ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          <PlayerControls
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            volume={volume}
            isMuted={isMuted}
            playbackRate={playbackRate}
            isFullscreen={isFullscreen}
            canControl={canControl}
            disabledReason={disabledReason}
            onPlayPause={handlePlayPause}
            onSeek={handleSeek}
            onVolumeChange={handleVolumeChange}
            onToggleMute={handleToggleMute}
            onRateChange={handleRateChange}
            onToggleFullscreen={handleToggleFullscreen}
            onChangeMedia={onChangeMedia}
            currentMediaUrl={mediaUrl}
          />
        </div>
      </div>
    );
  }
);

VideoPlayer.displayName = "VideoPlayer";
