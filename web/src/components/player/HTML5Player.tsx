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
    const hasTriedProxyRef = useRef(false);
    const currentPlayingSrcRef = useRef<string>("");

    const backendUrl = typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL
      ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "")
      : "";
    const proxyBase = backendUrl ? `${backendUrl}/api/proxy?url=` : `/api/proxy?url=`;

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

      hasTriedProxyRef.current = false;
      let isCancelled = false;

      // Extract only the valid URL — strip any leading junk and stop at first whitespace
      const rawSrc = src.trim().replace(/^[^a-z0-9]*(?:r|view-source:)?(https?:\/\/)/i, "$1");
      const cleanSrc = rawSrc.split(/\s+/)[0];

      const loadMediaSource = async () => {
        let activeSrc = cleanSrc;

        // Auto-resolve Archive.org or cloud details pages to direct stream
        if (
          cleanSrc.includes("archive.org/") &&
          !cleanSrc.match(/\.(mp4|m3u8|webm)(?:[?#]|$)/i)
        ) {
          try {
            const resolveEndpoint = backendUrl ? `${backendUrl}/api/resolve` : `/api/resolve`;
            const res = await fetch(resolveEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: cleanSrc }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data.resolvedUrl) {
                activeSrc = data.resolvedUrl;
              }
            }
          } catch (e) {
            console.warn("Auto-resolve failed in HTML5Player:", e);
          }
        }

        if (isCancelled || !videoRef.current) return;

        currentPlayingSrcRef.current = activeSrc;
        const isHls = /\.m3u8(?:[?#]|$)/i.test(activeSrc) || activeSrc.includes(".m3u8") || activeSrc.includes("/hls/");
        const isArchive = activeSrc.includes("archive.org/");

        // Use cache-busting to escape any previously cached broken/truncated master playlists
        // Archive.org storage nodes lack CORS so default to proxy for HLS or if needed
        const proxiedUrl = isHls 
          ? `${proxyBase}${encodeURIComponent(activeSrc)}&cb=${Date.now()}` 
          : isArchive
          ? `${proxyBase}${encodeURIComponent(activeSrc)}`
          : activeSrc;

        if (isHls) {
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
          // Standard MP4 or direct video URL (load proxiedUrl if archive.org, otherwise direct with proxy fallback)
          video.src = proxiedUrl;
          if (isArchive) hasTriedProxyRef.current = true;
          video.load();
          isMediaReadyRef.current = true;
          onReady?.(playerApi);
          if (pendingPlayRef.current) {
            video.play().catch(() => {});
            pendingPlayRef.current = false;
          }
        }
      };

      loadMediaSource();

      return () => {
        isCancelled = true;
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
          const video = videoRef.current;
          const targetUrl = currentPlayingSrcRef.current || src;
          if (
            video &&
            !hasTriedProxyRef.current &&
            targetUrl.startsWith("http") &&
            !video.src.includes("/api/proxy")
          ) {
            hasTriedProxyRef.current = true;
            console.warn("Direct media playback failed, falling back to proxy:", targetUrl);
            video.src = `${proxyBase}${encodeURIComponent(targetUrl)}`;
            video.load();
            if (pendingPlayRef.current) {
              video.play().catch(() => {});
            }
            return;
          }
          const errMsg = e.currentTarget.error?.message || "Video load error";
          onError?.(errMsg);
        }}
      />
    );
  }
);

HTML5Player.displayName = "HTML5Player";
