"use client";

import React, { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { UnifiedPlayerInstance, PlayerEvents } from "./types";
import { Monitor, StopCircle, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ScreenSharePlayerProps extends PlayerEvents {
  stream: MediaStream;
  onStopShare?: () => void;
  className?: string;
}

export const ScreenSharePlayer = forwardRef<UnifiedPlayerInstance, ScreenSharePlayerProps>(
  ({ stream, onStopShare, className, onReady, onError }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    const playerApi: UnifiedPlayerInstance = {
      play: async () => {
        if (videoRef.current) await videoRef.current.play().catch(() => {});
      },
      pause: async () => {
        if (videoRef.current) videoRef.current.pause();
      },
      seekTo: async () => {
        // Live stream/screen share does not seek
      },
      setPlaybackRate: async () => {
        // Live streams run at 1.0x
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
      getDuration: () => Infinity,
      isPaused: () => (videoRef.current ? videoRef.current.paused : false),
      getPlaybackRate: () => 1.0,
    };

    useImperativeHandle(ref, () => playerApi, []);

    useEffect(() => {
      const video = videoRef.current;
      if (!video || !stream) return;

      video.srcObject = stream;
      video.play().catch((err) => {
        console.warn("Screen share autoplay interrupted:", err);
      });

      onReady?.(playerApi);

      return () => {
        if (video) video.srcObject = null;
      };
    }, [stream]);

    return (
      <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden group">
        <video
          ref={videoRef}
          className={className || "w-full h-full object-contain"}
          autoPlay
          playsInline
        />

        {/* Live Screen Share Indicator & Stop Button */}
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 border border-red-500/40 backdrop-blur-md shadow-lg">
          <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
          <Monitor className="h-4 w-4 text-red-400" />
          <span className="text-xs font-semibold text-white tracking-wide">
            LIVE SCREEN SHARE
          </span>
        </div>

        {onStopShare && (
          <div className="absolute top-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <Button
              variant="destructive"
              size="sm"
              onClick={onStopShare}
              className="gap-1.5 text-xs shadow-xl"
            >
              <StopCircle className="h-3.5 w-3.5" />
              Stop Sharing
            </Button>
          </div>
        )}
      </div>
    );
  }
);

ScreenSharePlayer.displayName = "ScreenSharePlayer";
