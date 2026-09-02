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
import { ScreenSharePlayer } from "./ScreenSharePlayer";
import { PlayerControls } from "./PlayerControls";
import { SubtitleOverlay, SubtitleStyleOptions } from "./SubtitleOverlay";
import { SubtitleSettingsModal } from "./SubtitleSettingsModal";
import { PlaybackSettingsModal, PlaybackSettings } from "./PlaybackSettingsModal";
import { KeyboardShortcutsModal } from "./KeyboardShortcutsModal";
import { useScreenShare } from "@/hooks/useScreenShare";
import { AmbientGlow } from "@/components/visual/AmbientGlow";
import { UnifiedPlayerInstance, VideoPlayerProps } from "./types";
import { cn, formatTime } from "@/lib/utils";
import { Loader2, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export const VideoPlayer = forwardRef<UnifiedPlayerInstance, VideoPlayerProps>(
  (
    {
      mediaUrl,
      mediaType,
      title,
      canControl = true,
      disabledReason,
      partnerProgress,
      isDucked = false,
      onSnapSync,
      onSendReaction,
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
      onToggleTheater,
      isTheaterMode = false,
      onScreenShareChange,
      className,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const activePlayerRef = useRef<UnifiedPlayerInstance | null>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    // currentTime/duration kept as refs to avoid 4×/sec React re-renders during playback.
    // React state is only set for UI that truly needs it (subtitle overlay, save progress, seeks).
    const currentTimeRef = useRef(0);
    const durationRef = useRef(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    // Ref to the progress bar <input> element for direct DOM updates (no re-render)
    const progressBarRef = useRef<HTMLInputElement | null>(null);
    const progressTimeRef = useRef<HTMLSpanElement | null>(null);
    const progressDurRef = useRef<HTMLSpanElement | null>(null);
    const [volume, setVolumeState] = useState(0.8);
    const [isMuted, setIsMuted] = useState(false);
    const [playbackRate, setPlaybackRateState] = useState(1.0);
    const [intendedPlaybackRate, setIntendedPlaybackRate] = useState(1.0);
    const [isBuffering, setIsBuffering] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Playback Settings State
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
    const [playbackSettings, setPlaybackSettings] = useState<PlaybackSettings>({
      quality: "auto",
      audioBoost: 1.0,
      audioDelayMs: 0,
      smartSyncMode: "adaptive",
      autoPlayNext: true,
    });

    // Screen Sharing Hook
    const {
      isSharing: isScreenSharing,
      stream: screenStream,
      startScreenShare,
      stopScreenShare,
    } = useScreenShare(() => {
      onScreenShareChange?.(false);
    });

    const handleToggleScreenShare = async () => {
      if (isScreenSharing) {
        stopScreenShare();
        onScreenShareChange?.(false);
      } else {
        const stream = await startScreenShare();
        if (stream) {
          onScreenShareChange?.(true);
        }
      }
    };

    const handleTriggerPiP = async () => {
      try {
        const video = containerRef.current?.querySelector("video");
        if (video && document.pictureInPictureEnabled) {
          if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
          } else {
            await video.requestPictureInPicture();
          }
        }
      } catch (err) {
        console.warn("PiP toggle error:", err);
      }
    };

    // Subtitles State
    const [isSubtitlesOpen, setIsSubtitlesOpen] = useState(false);
    const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
    const [subtitleOffset, setSubtitleOffset] = useState(0);
    const [subtitleText, setSubtitleText] = useState<string>("");
    const [subtitleName, setSubtitleName] = useState<string>("");
    const [subtitleStyles, setSubtitleStyles] = useState<SubtitleStyleOptions>({
      fontSize: "md",
      color: "#FFFFFF",
      backgroundColor: "rgba(0,0,0,0.7)",
      bgOpacity: 0.7,
      bottomPercent: 12,
    });

    // Resume watch prompt state
    const [savedResumeTime, setSavedResumeTime] = useState<number | null>(null);
    const [showResumeBanner, setShowResumeBanner] = useState(false);

    // Check localStorage for previous watch progress
    useEffect(() => {
      if (!mediaUrl) return;
      try {
        const stored = localStorage.getItem("wtProgressV1");
        if (stored) {
          const map = JSON.parse(stored);
          const saved = map[mediaUrl];
          if (saved && saved.time > 10) {
            setSavedResumeTime(saved.time);
            setShowResumeBanner(true);
          }
        }
      } catch (e) {
        // Ignore parse error
      }
    }, [mediaUrl]);

    // Save watch progress to localStorage every 5 seconds using refs (not state) to avoid re-render
    useEffect(() => {
      if (!mediaUrl) return;
      const interval = setInterval(() => {
        const ct = currentTimeRef.current;
        const dur = durationRef.current;
        if (ct < 5) return;
        try {
          const stored = localStorage.getItem("wtProgressV1");
          const map = stored ? JSON.parse(stored) : {};
          map[mediaUrl] = {
            time: Math.floor(ct),
            duration: Math.floor(dur),
            title: title || mediaUrl,
            updatedAt: Date.now(),
          };
          localStorage.setItem("wtProgressV1", JSON.stringify(map));
        } catch (e) {
          // Ignore write error
        }
      }, 5000);
      return () => clearInterval(interval);
    }, [mediaUrl, title]);

    // Apply Audio Ducking: lowers volume to 25% when peer speaks
    useEffect(() => {
      if (!activePlayerRef.current) return;
      if (isDucked) {
        activePlayerRef.current.setVolume(volume * 0.25);
      } else {
        activePlayerRef.current.setVolume(volume);
      }
    }, [isDucked, volume]);

    // Unified player API forwarded to parent
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
        if ([0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].includes(rate)) {
          setIntendedPlaybackRate(rate);
        }
        if (activePlayerRef.current) {
          await activePlayerRef.current.setPlaybackRate(rate);
        }
      },
      setVolume: (vol: number) => {
        setVolumeState(vol);
        if (activePlayerRef.current) {
          const effective = (isDucked ? vol * 0.25 : vol) * (playbackSettings.audioBoost || 1.0);
          activePlayerRef.current.setVolume(Math.min(1.0, effective));
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

    useImperativeHandle(ref, () => unifiedApi, [currentTime, duration, isPlaying, playbackRate, isDucked]);

    const handlePlayerReady = useCallback(
      (player: UnifiedPlayerInstance) => {
        activePlayerRef.current = player;
        player.setVolume(isDucked ? volume * 0.25 : volume);
        player.setMuted(isMuted);
        onReady?.(player);
      },
      [onReady, volume, isMuted, isDucked]
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
      setIntendedPlaybackRate(rate);
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

    // Global Keyboard Shortcuts (Space, F, M, J/L, ArrowLeft/Right, ArrowUp/Down, C, [/])
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        // Ignore if user is currently typing in an input or textarea
        const target = e.target as HTMLElement;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable)
        ) {
          return;
        }

        switch (e.key) {
          case " ":
          case "k":
          case "K":
            e.preventDefault();
            handlePlayPause();
            break;
          case "f":
          case "F":
            e.preventDefault();
            handleToggleFullscreen();
            break;
          case "m":
          case "M":
            e.preventDefault();
            handleToggleMute();
            break;
          case "j":
          case "J":
            e.preventDefault();
            if (canControl) handleSeek(Math.max(0, currentTime - 10));
            break;
          case "l":
          case "L":
            e.preventDefault();
            if (canControl) handleSeek(Math.min(duration, currentTime + 10));
            break;
          case "ArrowLeft":
            e.preventDefault();
            const stepLeft = e.shiftKey ? 30 : 5;
            if (canControl) handleSeek(Math.max(0, currentTime - stepLeft));
            break;
          case "ArrowRight":
            e.preventDefault();
            const stepRight = e.shiftKey ? 30 : 5;
            if (canControl) handleSeek(Math.min(duration, currentTime + stepRight));
            break;
          case "ArrowUp":
            e.preventDefault();
            handleVolumeChange(Math.min(1.0, volume + 0.1));
            break;
          case "ArrowDown":
            e.preventDefault();
            handleVolumeChange(Math.max(0, volume - 0.1));
            break;
          case "c":
          case "C":
            e.preventDefault();
            setSubtitlesEnabled((prev) => !prev);
            break;
          case "[":
            e.preventDefault();
            setSubtitleOffset((prev) => Number((prev - 0.1).toFixed(1)));
            break;
          case "]":
            e.preventDefault();
            setSubtitleOffset((prev) => Number((prev + 0.1).toFixed(1)));
            break;
          case "s":
          case "S":
            e.preventDefault();
            onSnapSync?.();
            break;
          case "t":
          case "T":
            e.preventDefault();
            onToggleTheater?.();
            break;
          case "p":
          case "P":
            e.preventDefault();
            handleTriggerPiP();
            break;
          case "d":
          case "D":
            e.preventDefault();
            handleToggleScreenShare();
            break;
          case "?":
            e.preventDefault();
            setIsShortcutsOpen((prev) => !prev);
            break;
          default:
            break;
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [
      canControl,
      currentTime,
      duration,
      volume,
      isPlaying,
      handlePlayPause,
      handleSeek,
      handleToggleFullscreen,
      handleToggleMute,
      handleVolumeChange,
    ]);

    // Drag-and-drop subtitle file directly onto player
    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      if (file.name.endsWith(".srt") || file.name.endsWith(".vtt")) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const text = event.target?.result as string;
          if (text) {
            setSubtitleText(text);
            setSubtitleName(file.name);
            setSubtitlesEnabled(true);
          }
        };
        reader.readAsText(file);
      }
    };

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
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          "relative group overflow-hidden rounded-2xl bg-black border border-slate-800 shadow-2xl aspect-video flex items-center justify-center select-none",
          className
        )}
      >
        {/* Ambient Backlight Glow */}
        <AmbientGlow isPlaying={isPlaying} />

        {/* Media Adapter Component (Screen Share, YouTube, or HTML5/HLS) */}
        <div className="absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden">
          {isScreenSharing && screenStream ? (
            <ScreenSharePlayer
              stream={screenStream}
              className="w-full h-full object-contain"
              onStopShare={handleToggleScreenShare}
              onReady={handlePlayerReady}
              onError={onError}
            />
          ) : mediaType === "YOUTUBE" ? (
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
                if ([0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].includes(rate)) {
                  setIntendedPlaybackRate(rate);
                  onRateChange?.(rate);
                }
              }}
              onTimeUpdate={(time, dur) => {
                currentTimeRef.current = time;
                if (dur > 0) durationRef.current = dur;
                // Update progress bar & time display via direct DOM — zero React overhead
                if (progressBarRef.current && dur > 0) {
                  progressBarRef.current.value = String(time);
                  progressBarRef.current.max = String(dur);
                }
                if (progressTimeRef.current) progressTimeRef.current.textContent = formatTime(time);
                if (progressDurRef.current) progressDurRef.current.textContent = formatTime(dur > 0 ? dur : 0);
                // Sync subtitle overlay (needs React state) every second only
                if (Math.floor(time) !== Math.floor(currentTime)) setCurrentTime(Math.floor(time));
                if (dur > 0 && dur !== duration) setDuration(dur);
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
                if ([0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].includes(rate)) {
                  setIntendedPlaybackRate(rate);
                  onRateChange?.(rate);
                }
              }}
              onTimeUpdate={(time, dur) => {
                currentTimeRef.current = time;
                if (dur > 0) durationRef.current = dur;
                if (progressBarRef.current && dur > 0) {
                  progressBarRef.current.value = String(time);
                  progressBarRef.current.max = String(dur);
                }
                if (progressTimeRef.current) progressTimeRef.current.textContent = formatTime(time);
                if (progressDurRef.current) progressDurRef.current.textContent = formatTime(dur > 0 ? dur : 0);
                if (Math.floor(time) !== Math.floor(currentTime)) setCurrentTime(Math.floor(time));
                if (dur > 0 && dur !== duration) setDuration(dur);
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

        {/* Transparent Click & Tap Shield (Parallel Signature Overlay) */}
        <div
          onClick={handlePlayPause}
          onDoubleClick={handleToggleFullscreen}
          className="absolute inset-0 z-10 cursor-pointer"
          title={isPlaying ? "Click to Pause" : "Click to Play"}
        />

        {/* Centered Glassmorphic Play Button when paused */}
        {!isPlaying && (
          <div
            onClick={handlePlayPause}
            className="absolute inset-0 z-20 flex items-center justify-center cursor-pointer pointer-events-none"
          >
            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-slate-950/75 border border-indigo-500/50 backdrop-blur-md flex items-center justify-center text-white shadow-2xl shadow-indigo-500/30 transition-transform duration-200 hover:scale-110 pointer-events-auto">
              <Play className="h-8 w-8 sm:h-10 sm:w-10 ml-1 fill-current text-indigo-400" />
            </div>
          </div>
        )}

        {/* Dynamic Subtitle Overlay with Custom Offsets & Styling */}
        <SubtitleOverlay
          rawText={subtitleText}
          currentTime={currentTime}
          offsetSeconds={subtitleOffset}
          isVisible={subtitlesEnabled}
          styleOptions={subtitleStyles}
        />

        {/* Resume Watch Progress Banner */}
        {showResumeBanner && savedResumeTime !== null && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2 rounded-xl bg-slate-900/95 border border-indigo-500/40 text-xs text-white shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top duration-300">
            <span>
              Resume playback from <strong className="font-mono text-indigo-300">{formatTime(savedResumeTime)}</strong>?
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="glow"
                className="h-6 px-2 text-[11px] font-bold"
                onClick={() => {
                  handleSeek(savedResumeTime);
                  setShowResumeBanner(false);
                }}
              >
                <Play className="h-3 w-3 mr-1 fill-current" />
                Resume
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px] text-slate-400 hover:text-white"
                onClick={() => setShowResumeBanner(false)}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Start over
              </Button>
            </div>
          </div>
        )}

        {/* Buffering Spinner Indicator */}
        {isBuffering && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-none">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-10 w-10 animate-spin text-indigo-400" />
              <span className="text-xs font-medium text-slate-300">Buffering...</span>
            </div>
          </div>
        )}

        {/* Custom Video Controls Overlay with DualScrubber */}
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
            playbackRate={intendedPlaybackRate}
            isFullscreen={isFullscreen}
            canControl={canControl}
            disabledReason={disabledReason}
            partnerProgress={partnerProgress}
            onPlayPause={handlePlayPause}
            onSeek={handleSeek}
            onVolumeChange={handleVolumeChange}
            onToggleMute={handleToggleMute}
            onRateChange={handleRateChange}
            onToggleFullscreen={handleToggleFullscreen}
            onChangeMedia={onChangeMedia}
            onOpenSubtitles={() => setIsSubtitlesOpen(true)}
            subtitlesActive={subtitlesEnabled && !!subtitleText}
            currentMediaUrl={mediaUrl}
            onSendReaction={onSendReaction}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onToggleScreenShare={handleToggleScreenShare}
            isScreenSharing={isScreenSharing}
            onOpenShortcuts={() => setIsShortcutsOpen(true)}
            onToggleTheater={onToggleTheater}
            isTheaterMode={isTheaterMode}
            onTriggerPiP={handleTriggerPiP}
            liveTimeGetter={() => activePlayerRef.current?.getCurrentTime() ?? currentTimeRef.current}
          />
        </div>

        {/* Playback Settings Modal */}
        <PlaybackSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settings={playbackSettings}
          onUpdateSettings={(newSettings) =>
            setPlaybackSettings((prev) => ({ ...prev, ...newSettings }))
          }
          onTriggerPiP={handleTriggerPiP}
          onToggleTheater={onToggleTheater}
          isTheaterMode={isTheaterMode}
          supportsPiP={typeof document !== "undefined" && !!document.pictureInPictureEnabled}
        />

        {/* Keyboard Shortcuts Guide Modal */}
        <KeyboardShortcutsModal
          isOpen={isShortcutsOpen}
          onClose={() => setIsShortcutsOpen(false)}
        />

        {/* Subtitle Settings Modal */}
        <SubtitleSettingsModal
          isOpen={isSubtitlesOpen}
          onClose={() => setIsSubtitlesOpen(false)}
          subtitlesEnabled={subtitlesEnabled}
          onToggleEnabled={setSubtitlesEnabled}
          offsetSeconds={subtitleOffset}
          onOffsetChange={setSubtitleOffset}
          styleOptions={subtitleStyles}
          onStyleChange={(newStyles) =>
            setSubtitleStyles((prev) => ({ ...prev, ...newStyles }))
          }
          onLoadSubtitleFile={(content, fileName) => {
            setSubtitleText(content);
            setSubtitleName(fileName);
          }}
          currentSubtitleName={subtitleName}
        />
      </div>
    );
  }
);

VideoPlayer.displayName = "VideoPlayer";
