"use client";

import React, { useState } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Lock,
  Film,
  Sparkles,
  Settings,
  Subtitles,
  RotateCcw,
  RotateCw,
  Monitor,
  Tv,
  Keyboard,
  Radio,
  PictureInPicture,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { DualScrubber } from "./DualScrubber";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatTime, cn } from "@/lib/utils";
import { MediaType, PartnerProgressDTO } from "@watch2gether/shared";

interface PlayerControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  bufferProgress?: number;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
  isFullscreen: boolean;
  canControl: boolean;
  disabledReason?: string;
  partnerProgress?: PartnerProgressDTO | null;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (vol: number) => void;
  onToggleMute: () => void;
  onRateChange: (rate: number) => void;
  onToggleFullscreen: () => void;
  onChangeMedia?: (newUrl: string, newType: MediaType) => void;
  onOpenSubtitles?: () => void;
  subtitlesActive?: boolean;
  currentMediaUrl?: string;
  onSendReaction?: (emoji: string) => void;
  onOpenSettings?: () => void;
  onToggleScreenShare?: () => void;
  isScreenSharing?: boolean;
  onOpenShortcuts?: () => void;
  onToggleTheater?: () => void;
  isTheaterMode?: boolean;
  onTriggerPiP?: () => void;
  /** Optional getter for live currentTime — drives rAF-based progress updates without React state */
  liveTimeGetter?: () => number;
}

export function PlayerControls({
  isPlaying,
  currentTime,
  duration,
  bufferProgress = 0,
  volume,
  isMuted,
  playbackRate,
  isFullscreen,
  canControl,
  disabledReason = "Playback controls are locked to Room Host.",
  partnerProgress,
  onPlayPause,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onRateChange,
  onToggleFullscreen,
  onChangeMedia,
  onOpenSubtitles,
  subtitlesActive = false,
  currentMediaUrl = "",
  onSendReaction,
  onOpenSettings,
  onToggleScreenShare,
  isScreenSharing = false,
  onOpenShortcuts,
  onToggleTheater,
  isTheaterMode = false,
  onTriggerPiP,
  liveTimeGetter,
}: PlayerControlsProps) {
  const [isMediaDialogOpen, setIsMediaDialogOpen] = useState(false);
  const [newMediaUrl, setNewMediaUrl] = useState(currentMediaUrl);
  const [showRateMenu, setShowRateMenu] = useState(false);

  const rates = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

  const handleMediaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const rawUrl = newMediaUrl.trim().split(/\s+/)[0]; // strip copy-paste garbage after URL
    const cleanUrl = rawUrl.replace(/^[^a-z0-9]*(?:r|view-source:)?(https?:\/\/)/i, "$1");
    if (!cleanUrl) return;
    const isYouTube = cleanUrl.includes("youtube.com") || cleanUrl.includes("youtu.be");
    const isHls = cleanUrl.includes(".m3u8") || cleanUrl.includes("/hls/");
    const mediaType = isYouTube ? "YOUTUBE" : isHls ? "HLS" : "MP4";
    onChangeMedia?.(cleanUrl, mediaType);
    setIsMediaDialogOpen(false);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-4 transition-opacity duration-300 pointer-events-auto">
        {/* Floating Quick Emoji Reaction Bar */}
        {onSendReaction && (
          <div className="flex items-center justify-end mb-2.5">
            <div className="flex items-center gap-1.5 p-1 rounded-full bg-slate-950/80 border border-slate-700/80 backdrop-blur-md shadow-xl">
              {["😂", "❤️", "👍", "🔥", "😲"].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSendReaction(emoji);
                  }}
                  className="h-8 w-8 rounded-full flex items-center justify-center text-lg hover:scale-125 active:scale-95 transition-transform"
                  title={`Send ${emoji} reaction`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Dual Playhead Scrubber / Drift Ribbon */}
        <div className="mb-2 flex items-center gap-3">
          <span className="text-xs font-medium text-slate-300 w-12 text-right tabular-nums">
            {formatTime(currentTime)}
          </span>
          <div className="flex-1">
            <DualScrubber
              currentTime={currentTime}
              duration={duration}
              bufferProgress={bufferProgress}
              partnerProgress={partnerProgress}
              canControl={canControl}
              onSeek={onSeek}
              liveTimeGetter={liveTimeGetter}
            />
          </div>
          <span className="text-xs font-medium text-slate-400 w-12 tabular-nums">
            {formatTime(duration)}
          </span>
        </div>

        {/* Control Buttons Bar */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Play/Pause CTA */}
            {canControl ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={onPlayPause}
                className="h-10 w-10 text-white hover:bg-white/10 hover:text-indigo-400 shrink-0"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled
                    className="h-10 w-10 opacity-50 text-slate-400 shrink-0"
                  >
                    <Lock className="h-5 w-5 text-amber-400" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{disabledReason}</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Rewind 10s Button */}
            {canControl && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onSeek(Math.max(0, currentTime - 10))}
                className="h-8 w-8 text-slate-300 hover:text-white hover:bg-white/10"
                title="Rewind 10s (J)"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}

            {/* Fast-Forward 10s Button */}
            {canControl && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onSeek(Math.min(duration, currentTime + 10))}
                className="h-8 w-8 text-slate-300 hover:text-white hover:bg-white/10"
                title="Forward 10s (L)"
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            )}

            {/* Volume / Mute Controls */}
            <div className="flex items-center gap-1.5 group/vol ml-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleMute}
                className="h-8 w-8 text-slate-300 hover:text-white"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-4 w-4 text-red-400" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
              <div className="w-16 md:w-20">
                <Slider
                  value={[isMuted ? 0 : volume]}
                  max={1}
                  step={0.01}
                  onValueChange={(val) => {
                    if (val[0] !== undefined) onVolumeChange(val[0]);
                  }}
                />
              </div>
            </div>

            {/* Permission status tag if restricted */}
            {!canControl && (
              <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300 border border-amber-500/20">
                <Lock className="h-3 w-3" />
                <span>Host Control Mode</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {/* Screen Share Action Button */}
            {onToggleScreenShare && (
              <Button
                variant={isScreenSharing ? "destructive" : "outline"}
                size="sm"
                onClick={onToggleScreenShare}
                className={cn(
                  "h-8 px-2.5 text-xs gap-1.5 border-slate-700 bg-slate-900/80 hover:text-white",
                  isScreenSharing
                    ? "bg-red-600 hover:bg-red-700 text-white border-red-500 animate-pulse"
                    : "text-slate-300 hover:bg-slate-800"
                )}
                title={isScreenSharing ? "Stop Screen Share (D)" : "Share Your Screen (D)"}
              >
                <Monitor className="h-3.5 w-3.5 text-indigo-400" />
                <span className="hidden md:inline">
                  {isScreenSharing ? "Stop Share" : "Screen Share"}
                </span>
              </Button>
            )}

            {/* Change Media Source */}
            {canControl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNewMediaUrl(currentMediaUrl);
                  setIsMediaDialogOpen(true);
                }}
                className="hidden sm:inline-flex items-center gap-1.5 h-8 text-xs border-slate-700 bg-slate-900/80 text-slate-200 hover:bg-slate-800 hover:text-white"
              >
                <Film className="h-3.5 w-3.5 text-indigo-400" />
                <span>Change Video</span>
              </Button>
            )}

            {/* Playback Rate Selector Pill */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRateMenu(!showRateMenu)}
                className="h-8 px-2 text-xs font-mono text-slate-300 hover:text-white hover:bg-white/10"
              >
                {playbackRate}x
              </Button>
              {showRateMenu && (
                <div className="absolute bottom-full right-0 mb-2 w-24 rounded-lg border border-slate-700 bg-slate-900/95 py-1 shadow-xl backdrop-blur-md z-40">
                  {rates.map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      disabled={!canControl}
                      onClick={() => {
                        onRateChange(rate);
                        setShowRateMenu(false);
                      }}
                      className={cn(
                        "w-full px-3 py-1.5 text-left text-xs font-medium transition-colors hover:bg-indigo-600 hover:text-white",
                        playbackRate === rate ? "text-indigo-400 font-bold" : "text-slate-300",
                        !canControl && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {rate}x {playbackRate === rate && "✓"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Subtitles & Captions Settings */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenSubtitles}
              className={cn(
                "h-8 w-8 text-slate-300 hover:text-white relative",
                subtitlesActive && "text-indigo-400"
              )}
              aria-label="Subtitles"
              title="Subtitles & Settings (Hotkey: C)"
            >
              <Subtitles className="h-4 w-4" />
              {subtitlesActive && (
                <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-indigo-400" />
              )}
            </Button>

            {/* Playback Settings Gear Button */}
            {onOpenSettings && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onOpenSettings}
                className="h-8 w-8 text-slate-300 hover:text-white"
                aria-label="Playback Settings"
                title="Playback Settings (Audio Boost, Quality, Sync Delay)"
              >
                <Settings className="h-4 w-4 text-indigo-400" />
              </Button>
            )}

            {/* Theater Mode Button */}
            {onToggleTheater && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleTheater}
                className={cn(
                  "hidden sm:inline-flex h-8 w-8 text-slate-300 hover:text-white",
                  isTheaterMode && "text-indigo-400"
                )}
                aria-label="Theater Mode"
                title="Theater Mode (T)"
              >
                <Tv className="h-4 w-4" />
              </Button>
            )}

            {/* Keyboard Shortcuts Guide Button */}
            {onOpenShortcuts && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onOpenShortcuts}
                className="hidden md:inline-flex h-8 w-8 text-slate-300 hover:text-white"
                aria-label="Keyboard Shortcuts"
                title="Keyboard Shortcuts (?)"
              >
                <Keyboard className="h-4 w-4" />
              </Button>
            )}

            {/* Fullscreen Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleFullscreen}
              className="h-8 w-8 text-slate-300 hover:text-white"
              aria-label="Fullscreen"
              title="Fullscreen (F)"
            >
              {isFullscreen ? (
                <Minimize className="h-4 w-4" />
              ) : (
                <Maximize className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Change Media Dialog */}
        <Dialog open={isMediaDialogOpen} onOpenChange={setIsMediaDialogOpen}>
          <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Film className="h-5 w-5 text-indigo-400" />
                Change Room Media
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleMediaSubmit} className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-400">
                  Video or Live Stream URL (YouTube, MP4, HLS, or Live Stream)
                </label>
                <Input
                  value={newMediaUrl}
                  onChange={(e) => setNewMediaUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=... or https://.../master.m3u8"
                  className="border-slate-700 bg-slate-800 text-white font-mono text-xs"
                  autoFocus
                />
              </div>
              <div className="rounded-lg bg-slate-800/50 p-3 text-xs text-slate-400 border border-slate-700/50">
                <p className="font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  Quick Test Media & Public Live Streams:
                </p>
                <ul className="space-y-1 font-mono text-[11px] text-indigo-300">
                  <li
                    className="cursor-pointer hover:underline"
                    onClick={() =>
                      setNewMediaUrl(
                        "https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-576p.mp4"
                      )
                    }
                  >
                    • Blue Moon Trailer (Open Source MP4)
                  </li>
                  <li
                    className="cursor-pointer hover:underline"
                    onClick={() =>
                      setNewMediaUrl(
                        "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"
                      )
                    }
                  >
                    • Big Buck Bunny (Mux Multi-Bitrate HLS)
                  </li>
                  <li
                    className="cursor-pointer hover:underline"
                    onClick={() =>
                      setNewMediaUrl("https://ntv.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8")
                    }
                  >
                    • NASA TV (24/7 Public Live HLS Stream)
                  </li>
                  <li
                    className="cursor-pointer hover:underline"
                    onClick={() =>
                      setNewMediaUrl("https://www.youtube.com/watch?v=jfKfPfyJRdk")
                    }
                  >
                    • Lofi Girl Radio (24/7 YouTube Live)
                  </li>
                  <li
                    className="cursor-pointer hover:underline"
                    onClick={() =>
                      setNewMediaUrl("https://nebula.bright67.online/hls/919e367f-1ffd-41c2-9c29-6c9288646556/master.m3u8")
                    }
                  >
                    • Nebula Bright HLS Stream
                  </li>
                </ul>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsMediaDialogOpen(false)}
                  className="border-slate-700 text-slate-300"
                >
                  Cancel
                </Button>
                <Button type="submit" variant="glow" disabled={!newMediaUrl.trim()}>
                  Switch Video
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
