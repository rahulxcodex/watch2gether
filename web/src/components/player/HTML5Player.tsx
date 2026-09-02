"use client";

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { UnifiedPlayerInstance, PlayerEvents } from "./types";

interface HTML5PlayerProps extends PlayerEvents {
  src: string;
  className?: string;
}

export const HTML5Player = forwardRef<UnifiedPlayerInstance, HTML5PlayerProps>(
  (
    {
      src,
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
    const videoRef = useRef<HTMLVideoElement>(null);
    const isSeekingRef = useRef(false);

    const playerApi: UnifiedPlayerInstance = {
      play: async () => {
        if (videoRef.current) {
          try {
            await videoRef.current.play();
          } catch (err) {
            console.warn("HTML5 play error:", err);
          }
        }
      },
      pause: async () => {
        if (videoRef.current) {
          videoRef.current.pause();
        }
      },
      seekTo: async (seconds: number) => {
        if (videoRef.current) {
          isSeekingRef.current = true;
          videoRef.current.currentTime = Math.max(0, seconds);
          setTimeout(() => {
            isSeekingRef.current = false;
          }, 150);
        }
      },
      setPlaybackRate: async (rate: number) => {
        if (videoRef.current) {
          videoRef.current.playbackRate = rate;
        }
      },
      setVolume: (volume: number) => {
        if (videoRef.current) {
          videoRef.current.volume = Math.max(0, Math.min(1, volume));
        }
      },
      setMuted: (muted: boolean) => {
        if (videoRef.current) {
          videoRef.current.muted = muted;
        }
      },
      getCurrentTime: () => videoRef.current?.currentTime || 0,
      getDuration: () => videoRef.current?.duration || 0,
      isPaused: () => videoRef.current ? videoRef.current.paused : true,
      getPlaybackRate: () => videoRef.current?.playbackRate || 1.0,
    };

    useImperativeHandle(ref, () => playerApi, []);

    useEffect(() => {
      if (videoRef.current) {
        onReady?.(playerApi);
      }
    }, [src]);

    return (
      <video
        ref={videoRef}
        src={src}
        className={className}
        playsInline
        preload="metadata"
        onPlay={() => {
          if (!isSeekingRef.current) onPlay?.(videoRef.current?.currentTime || 0);
        }}
        onPause={() => {
          if (!isSeekingRef.current) onPause?.(videoRef.current?.currentTime || 0);
        }}
        onSeeked={() => {
          onSeek?.(videoRef.current?.currentTime || 0);
        }}
        onRateChange={() => {
          onRateChange?.(videoRef.current?.playbackRate || 1.0);
        }}
        onTimeUpdate={() => {
          if (videoRef.current) {
            onTimeUpdate?.(videoRef.current.currentTime, videoRef.current.duration || 0);
          }
        }}
        onWaiting={() => onBuffering?.(true)}
        onPlaying={() => onBuffering?.(false)}
        onEnded={() => onEnded?.()}
        onError={(e) => onError?.(e.currentTarget.error?.message || "Video load error")}
      />
    );
  }
);

HTML5Player.displayName = "HTML5Player";
