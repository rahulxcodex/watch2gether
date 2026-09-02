"use client";

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { cn } from "@/lib/utils";
import { UnifiedPlayerInstance, PlayerEvents } from "./types";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YouTubePlayerProps extends PlayerEvents {
  videoUrl: string;
  className?: string;
}

export function extractYouTubeId(url: string): string {
  if (!url) return "dQw4w9WgXcQ";
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[7].length === 11 ? match[7] : url;
}

export const YouTubePlayer = forwardRef<UnifiedPlayerInstance, YouTubePlayerProps>(
  (
    {
      videoUrl,
      className,
      onPlay,
      onPause,
      onSeek,
      onRateChange,
      onTimeUpdate,
      onBuffering,
      onEnded,
      onReady,
      onError,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const ytPlayerRef = useRef<any>(null);
    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const isSeekingRef = useRef(false);
    const videoId = extractYouTubeId(videoUrl);

    const playerApi: UnifiedPlayerInstance = {
      play: async () => {
        if (ytPlayerRef.current && typeof ytPlayerRef.current.playVideo === "function") {
          ytPlayerRef.current.playVideo();
        }
      },
      pause: async () => {
        if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === "function") {
          ytPlayerRef.current.pauseVideo();
        }
      },
      seekTo: async (seconds: number) => {
        if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === "function") {
          isSeekingRef.current = true;
          ytPlayerRef.current.seekTo(Math.max(0, seconds), true);
          setTimeout(() => {
            isSeekingRef.current = false;
          }, 200);
        }
      },
      setPlaybackRate: async (rate: number) => {
        if (ytPlayerRef.current && typeof ytPlayerRef.current.setPlaybackRate === "function") {
          ytPlayerRef.current.setPlaybackRate(rate);
        }
      },
      setVolume: (volume: number) => {
        if (ytPlayerRef.current && typeof ytPlayerRef.current.setVolume === "function") {
          ytPlayerRef.current.setVolume(Math.round(Math.max(0, Math.min(1, volume)) * 100));
        }
      },
      setMuted: (muted: boolean) => {
        if (ytPlayerRef.current) {
          if (muted && typeof ytPlayerRef.current.mute === "function") {
            ytPlayerRef.current.mute();
          } else if (!muted && typeof ytPlayerRef.current.unMute === "function") {
            ytPlayerRef.current.unMute();
          }
        }
      },
      getCurrentTime: () => {
        if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === "function") {
          return ytPlayerRef.current.getCurrentTime() || 0;
        }
        return 0;
      },
      getDuration: () => {
        if (ytPlayerRef.current && typeof ytPlayerRef.current.getDuration === "function") {
          return ytPlayerRef.current.getDuration() || 0;
        }
        return 0;
      },
      isPaused: () => {
        if (ytPlayerRef.current && typeof ytPlayerRef.current.getPlayerState === "function") {
          return ytPlayerRef.current.getPlayerState() !== 1; // 1 = Playing
        }
        return true;
      },
      getPlaybackRate: () => {
        if (ytPlayerRef.current && typeof ytPlayerRef.current.getPlaybackRate === "function") {
          return ytPlayerRef.current.getPlaybackRate() || 1.0;
        }
        return 1.0;
      },
    };

    useImperativeHandle(ref, () => playerApi, []);

    // Load YouTube API script
    useEffect(() => {
      let isMounted = true;

      const initPlayer = () => {
        if (!containerRef.current || !window.YT || !window.YT.Player) return;

        // Cleanup old instance
        if (ytPlayerRef.current && typeof ytPlayerRef.current.destroy === "function") {
          try {
            ytPlayerRef.current.destroy();
          } catch {}
        }

        const playerDiv = document.createElement("div");
        playerDiv.id = "yt-embed-" + Math.random().toString(36).substring(2, 9);
        containerRef.current.innerHTML = "";
        containerRef.current.appendChild(playerDiv);

        ytPlayerRef.current = new window.YT.Player(playerDiv.id, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            enablejsapi: 1,
            fs: 0,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            cc_load_policy: 0,
            iv_load_policy: 3,
            origin: typeof window !== "undefined" ? window.location.origin : "",
          },
          events: {
            onReady: () => {
              if (!isMounted) return;
              onReady?.(playerApi);
            },
            onStateChange: (event: any) => {
              if (!isMounted) return;
              const state = event.data;
              // YT.PlayerState: -1 UNSTARTED, 0 ENDED, 1 PLAYING, 2 PAUSED, 3 BUFFERING, 5 CUED
              if (state === 1) {
                if (!isSeekingRef.current) onPlay?.(playerApi.getCurrentTime());
                onBuffering?.(false);
              } else if (state === 2) {
                if (!isSeekingRef.current) onPause?.(playerApi.getCurrentTime());
                onBuffering?.(false);
              } else if (state === 3) {
                onBuffering?.(true);
              } else if (state === 0) {
                onEnded?.();
              }
            },
            onPlaybackRateChange: (event: any) => {
              if (!isMounted) return;
              onRateChange?.(event.data);
            },
            onError: (event: any) => {
              if (!isMounted) return;
              onError?.(`YouTube Error code: ${event.data}`);
            },
          },
        });
      };

      if (!window.YT || !window.YT.Player) {
        if (!document.getElementById("youtube-iframe-api")) {
          const tag = document.createElement("script");
          tag.id = "youtube-iframe-api";
          tag.src = "https://www.youtube.com/iframe_api";
          const firstScriptTag = document.getElementsByTagName("script")[0];
          firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
        }
        window.onYouTubeIframeAPIReady = () => {
          if (isMounted) initPlayer();
        };
      } else {
        initPlayer();
      }

      // Start timeupdate polling loop
      pollIntervalRef.current = setInterval(() => {
        if (isMounted && ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === "function") {
          const currentTime = ytPlayerRef.current.getCurrentTime() || 0;
          const duration = ytPlayerRef.current.getDuration() || 0;
          onTimeUpdate?.(currentTime, duration);
        }
      }, 150);

      return () => {
        isMounted = false;
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        if (ytPlayerRef.current && typeof ytPlayerRef.current.destroy === "function") {
          try {
            ytPlayerRef.current.destroy();
          } catch {}
        }
      };
    }, [videoId]);

    return (
      <div
        ref={containerRef}
        className={cn(
          "w-full h-full absolute inset-0 pointer-events-none overflow-hidden [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:absolute [&>iframe]:inset-0 [&>iframe]:border-0",
          className
        )}
      />
    );
  }
);

YouTubePlayer.displayName = "YouTubePlayer";
