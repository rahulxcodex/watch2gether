"use client";

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import Hls from "hls.js";
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
    const hlsRef = useRef<Hls | null>(null);
    const isSeekingRef = useRef(false);
    const isMediaReadyRef = useRef(false);
    const pendingPlayRef = useRef(false);

    const playerApi: UnifiedPlayerInstance = {
      play: async () => {
        if (!isMediaReadyRef.current) {
          pendingPlayRef.current = true;
          return;
        }
        if (videoRef.current) {
          try {
            await videoRef.current.play();
          } catch (err) {
            console.warn("HTML5 play error:", err);
          }
        }
      },
      pause: async () => {
        pendingPlayRef.current = false;
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
      isPaused: () => (videoRef.current ? videoRef.current.paused : true),
      getPlaybackRate: () => videoRef.current?.playbackRate || 1.0,
    };

    useImperativeHandle(ref, () => playerApi, []);

    // Setup video source (Native or HLS)
    useEffect(() => {
      const video = videoRef.current;
      if (!video || !src) return;

      // Preserve audio pitch during micro-rate drift corrections (1.08x / 0.92x)
      (video as any).preservesPitch = true;
      (video as any).webkitPreservesPitch = true;
      (video as any).mozPreservesPitch = true;

      isMediaReadyRef.current = false;

      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch {}
        hlsRef.current = null;
      }

      // Clean video element state before switching sources
      video.pause();
      video.removeAttribute("src");
      video.load();

      // Extract only the valid URL — strip any leading junk and stop at first whitespace
      // (guards against copy-paste artifacts like "…master.m3u8 Request Method GET Status Code 404…")
      const rawSrc = src.trim().replace(/^[^a-z0-9]*(?:r|view-source:)?(https?:\/\/)/i, "$1");
      // Take only the first token (stop at space, newline, or any non-URL char that isn't part of a valid URL)
      const cleanSrc = rawSrc.split(/\s+/)[0];

      const isHls = /\.m3u8(?:[?#]|$)/i.test(cleanSrc) || cleanSrc.includes(".m3u8") || cleanSrc.includes("/hls/");
      
      const backendUrl = typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL
        ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "")
        : "";
      const proxyBase = backendUrl ? `${backendUrl}/api/proxy?url=` : `/api/proxy?url=`;

      // Use cache-busting to escape any previously cached broken/truncated master playlists
      const proxiedUrl = isHls 
        ? `${proxyBase}${encodeURIComponent(cleanSrc)}&cb=${Date.now()}` 
        : cleanSrc;

      if (isHls) {
        // 1. Check native Safari HLS support
        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = proxiedUrl;
          video.load();
          isMediaReadyRef.current = true;
          onReady?.(playerApi);
          if (pendingPlayRef.current) {
            video.play().catch(() => {});
            pendingPlayRef.current = false;
          }
        } else if (Hls.isSupported()) {
          // 2. Cross-browser Hls.js demuxer
          const hls = new Hls({
            maxBufferLength: 60,
            maxMaxBufferLength: 180,
            backBufferLength: 60,
            enableWorker: true,
          });

          hlsRef.current = hls;

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            isMediaReadyRef.current = true;
            onReady?.(playerApi);
            if (pendingPlayRef.current) {
              video.play().catch(() => {});
              pendingPlayRef.current = false;
            }
          });

          hls.on(Hls.Events.ERROR, (_evt, data) => {
            if (data?.fatal) {
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                hls.startLoad();
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                hls.recoverMediaError();
              } else {
                hls.destroy();
                hlsRef.current = null;
                onError?.("HLS stream playback failed.");
              }
            }
          });

          hls.loadSource(proxiedUrl);
          hls.attachMedia(video);
        } else {
          onError?.("Your browser does not support HLS streaming.");
        }
      } else {
        // Standard MP4 or direct video URL
        video.src = src;
        video.load();
        isMediaReadyRef.current = true;
        onReady?.(playerApi);
        if (pendingPlayRef.current) {
          video.play().catch(() => {});
          pendingPlayRef.current = false;
        }
      }

      return () => {
        if (hlsRef.current) {
          try {
            hlsRef.current.destroy();
          } catch {}
          hlsRef.current = null;
        }
      };
    }, [src]);

    return (
      <video
        ref={videoRef}
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
        onError={(e) => {
          // If video failed and it's an HLS stream that hasn't tried proxy yet
          const errMsg = e.currentTarget.error?.message || "Video load error";
          onError?.(errMsg);
        }}
      />
    );
  }
);

HTML5Player.displayName = "HTML5Player";
