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
}: PlayerControlsProps) {
  const [isMediaDialogOpen, setIsMediaDialogOpen] = useState(false);
  const [newMediaUrl, setNewMediaUrl] = useState(currentMediaUrl);
  const [showRateMenu, setShowRateMenu] = useState(false);

  const rates = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

  const handleMediaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMediaUrl.trim()) return;
    const isYouTube =
      newMediaUrl.includes("youtube.com") || newMediaUrl.includes("youtu.be");
    onChangeMedia?.(newMediaUrl.trim(), isYouTube ? "YOUTUBE" : "MP4");
    setIsMediaDialogOpen(false);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 transition-opacity duration-300">
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
            />
          </div>
          <span className="text-xs font-medium text-slate-400 w-12 tabular-nums">
            {formatTime(duration)}
          </span>
        </div>

        {/* Control Buttons Bar */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {/* Play/Pause CTA */}
            {canControl ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={onPlayPause}
                className="h-10 w-10 text-white hover:bg-white/10 hover:text-indigo-400"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 fill-current" />}
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled
                    className="h-10 w-10 opacity-50 text-slate-400"
                  >
                    <Lock className="h-5 w-5 text-amber-400" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{disabledReason}</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Volume / Mute Controls */}
            <div className="flex items-center gap-2 group/vol">
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleMute}
                className="h-9 w-9 text-slate-300 hover:text-white"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-5 w-5 text-red-400" />
                ) : (
                  <Volume2 className="h-5 w-5" />
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

          <div className="flex items-center gap-2">
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

            {/* Playback Rate Selector */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRateMenu(!showRateMenu)}
                className="h-8 px-2.5 text-xs text-slate-300 hover:text-white hover:bg-white/10"
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
                "h-9 w-9 text-slate-300 hover:text-white relative",
                subtitlesActive && "text-indigo-400"
              )}
              aria-label="Subtitles"
              title="Subtitles & Captions (Hotkey: C)"
            >
              <Subtitles className="h-4 w-4" />
              {subtitlesActive && (
                <span className="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-indigo-400" />
              )}
            </Button>

            {/* Fullscreen Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleFullscreen}
              className="h-9 w-9 text-slate-300 hover:text-white"
              aria-label="Fullscreen"
            >
              {isFullscreen ? (
                <Minimize className="h-5 w-5" />
              ) : (
                <Maximize className="h-5 w-5" />
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
                  Video URL (YouTube or Direct MP4 Link)
                </label>
                <Input
                  value={newMediaUrl}
                  onChange={(e) => setNewMediaUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=... or https://.../video.mp4"
                  className="border-slate-700 bg-slate-800 text-white"
                  autoFocus
                />
              </div>
              <div className="rounded-lg bg-slate-800/50 p-3 text-xs text-slate-400 border border-slate-700/50">
                <p className="font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  Quick Test Media:
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setNewMediaUrl("https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4")
                  }
                  className="block text-indigo-400 hover:underline truncate w-full text-left mt-1"
                >
                  Big Buck Bunny (Direct MP4)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setNewMediaUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
                  }
                  className="block text-indigo-400 hover:underline truncate w-full text-left mt-1"
                >
                  Rick Astley - Never Gonna Give You Up (YouTube)
                </button>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsMediaDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="glow">
                  Update Media for Room
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
