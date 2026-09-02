"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Settings,
  Volume2,
  Sliders,
  Tv,
  Zap,
  PictureInPicture,
  RotateCcw,
  Sparkles,
  Gauge,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface PlaybackSettings {
  quality: "auto" | "1080p" | "720p" | "480p" | "360p";
  audioBoost: number; // 1.0 = 100%, 1.3 = 130%, 1.6 = 160%, 2.0 = 200%
  audioDelayMs: number; // -1500 to +1500 ms
  smartSyncMode: "adaptive" | "strict" | "relaxed";
  autoPlayNext: boolean;
}

interface PlaybackSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: PlaybackSettings;
  onUpdateSettings: (newSettings: Partial<PlaybackSettings>) => void;
  onTriggerPiP?: () => void;
  onToggleTheater?: () => void;
  isTheaterMode?: boolean;
  supportsPiP?: boolean;
}

export function PlaybackSettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onTriggerPiP,
  onToggleTheater,
  isTheaterMode = false,
  supportsPiP = true,
}: PlaybackSettingsModalProps) {
  const qualities = [
    { label: "Auto (Optimal)", value: "auto" as const },
    { label: "1080p Full HD", value: "1080p" as const },
    { label: "720p HD", value: "720p" as const },
    { label: "480p SD", value: "480p" as const },
    { label: "360p Data Saver", value: "360p" as const },
  ];

  const audioBoosts = [
    { label: "100%", sub: "Standard", value: 1.0 },
    { label: "130%", sub: "+2.5 dB", value: 1.3 },
    { label: "160%", sub: "+4.5 dB", value: 1.6 },
    { label: "200%", sub: "+6.0 dB Max", value: 2.0 },
  ];

  const syncModes = [
    {
      id: "adaptive" as const,
      name: "Smart Invisible Sync",
      badge: "Recommended",
      desc: "Imperceptibly accelerates/decelerates playback to eliminate drift without pitch changes or stutter.",
    },
    {
      id: "strict" as const,
      name: "Hard Snap Sync",
      desc: "Instantly seeks to the exact millisecond if any drift exceeds 100ms.",
    },
    {
      id: "relaxed" as const,
      name: "Relaxed Free-Run",
      desc: "Tolerates larger buffer variances, ideal for slower cellular connections.",
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto border-slate-800 bg-slate-950/95 text-slate-100 shadow-2xl backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-white">
            <Settings className="h-5 w-5 text-indigo-400" />
            Playback & Experience Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2 text-xs">
          {/* Quick Display Mode Toggles */}
          <div className="flex items-center gap-2">
            {supportsPiP && onTriggerPiP && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onTriggerPiP();
                  onClose();
                }}
                className="flex-1 gap-1.5 border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-xs"
              >
                <PictureInPicture className="h-3.5 w-3.5 text-indigo-400" />
                Picture-in-Picture
              </Button>
            )}
            {onToggleTheater && (
              <Button
                variant="outline"
                size="sm"
                onClick={onToggleTheater}
                className={cn(
                  "flex-1 gap-1.5 border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-xs",
                  isTheaterMode && "border-indigo-500/50 text-indigo-400"
                )}
              >
                <Tv className="h-3.5 w-3.5 text-indigo-400" />
                {isTheaterMode ? "Exit Theater Mode" : "Theater Mode"}
              </Button>
            )}
          </div>

          {/* Stream Quality Selector */}
          <div className="space-y-2">
            <label className="font-semibold text-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-indigo-400" />
                Stream Quality / Resolution
              </span>
              <Badge variant="outline" className="text-[10px] text-indigo-300 border-indigo-500/30">
                {settings.quality.toUpperCase()}
              </Badge>
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {qualities.map((q) => (
                <button
                  key={q.value}
                  type="button"
                  onClick={() => onUpdateSettings({ quality: q.value })}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-center transition-all",
                    settings.quality === q.value
                      ? "border-indigo-500 bg-indigo-600/20 text-white font-medium shadow-sm"
                      : "border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                  )}
                >
                  <span className="text-[11px] block">{q.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Audio Booster & Equalizer */}
          <div className="space-y-2">
            <label className="font-semibold text-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                Audio Gain Booster (Pre-Amp)
              </span>
              <span className="text-slate-400 text-[11px]">
                {Math.round(settings.audioBoost * 100)}%
              </span>
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {audioBoosts.map((b) => (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => onUpdateSettings({ audioBoost: b.value })}
                  className={cn(
                    "rounded-lg border px-2 py-1.5 text-center transition-all",
                    settings.audioBoost === b.value
                      ? "border-emerald-500 bg-emerald-600/20 text-white font-medium"
                      : "border-slate-800 bg-slate-900/50 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                  )}
                >
                  <span className="text-[11px] block font-semibold">{b.label}</span>
                  <span className="text-[9px] text-slate-400 block">{b.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Audio/Video Sync Delay Slider (Bluetooth offset) */}
          <div className="space-y-2 rounded-lg border border-slate-800/80 bg-slate-900/40 p-3">
            <div className="flex items-center justify-between">
              <label className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-amber-400" />
                Audio Sync Offset (Bluetooth Delay)
              </label>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-amber-300 font-medium">
                  {settings.audioDelayMs > 0 ? `+${settings.audioDelayMs}` : settings.audioDelayMs} ms
                </span>
                {settings.audioDelayMs !== 0 && (
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ audioDelayMs: 0 })}
                    title="Reset to 0ms"
                    className="text-slate-500 hover:text-slate-300 p-0.5"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Compensate for Bluetooth headphones or external soundbar latency.
            </p>
            <div className="pt-1">
              <Slider
                value={[settings.audioDelayMs]}
                min={-1500}
                max={1500}
                step={25}
                onValueChange={([val]) => onUpdateSettings({ audioDelayMs: val })}
                className="w-full"
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>-1500ms (Audio First)</span>
              <span>0ms (Default)</span>
              <span>+1500ms (Video First)</span>
            </div>
          </div>

          {/* Smart Syncing Engine Mode */}
          <div className="space-y-2">
            <label className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Gauge className="h-3.5 w-3.5 text-indigo-400" />
              Sync Engine Reconciliation Mode
            </label>
            <div className="space-y-1.5">
              {syncModes.map((mode) => (
                <div
                  key={mode.id}
                  onClick={() => onUpdateSettings({ smartSyncMode: mode.id })}
                  className={cn(
                    "rounded-lg border p-2.5 cursor-pointer transition-all flex flex-col gap-1",
                    settings.smartSyncMode === mode.id
                      ? "border-indigo-500 bg-indigo-600/15 text-white"
                      : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[11px] flex items-center gap-1.5">
                      {mode.name}
                      {mode.badge && (
                        <Badge className="bg-indigo-600/30 text-indigo-300 border-indigo-500/40 text-[9px] py-0 px-1.5">
                          {mode.badge}
                        </Badge>
                      )}
                    </span>
                    <div
                      className={cn(
                        "h-3 w-3 rounded-full border flex items-center justify-center",
                        settings.smartSyncMode === mode.id
                          ? "border-indigo-400 bg-indigo-500"
                          : "border-slate-600"
                      )}
                    >
                      {settings.smartSyncMode === mode.id && (
                        <div className="h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight">{mode.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Auto-Play Next Toggle */}
          <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 p-3">
            <div>
              <div className="font-semibold text-slate-200">Auto-Play Next in Queue</div>
              <div className="text-[10px] text-slate-400">
                Automatically plays the next episode or queue item when playback ends.
              </div>
            </div>
            <button
              type="button"
              onClick={() => onUpdateSettings({ autoPlayNext: !settings.autoPlayNext })}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                settings.autoPlayNext ? "bg-indigo-600" : "bg-slate-700"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                  settings.autoPlayNext ? "translate-x-4" : "translate-x-0"
                )}
              />
            </button>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="glow"
            size="sm"
            onClick={onClose}
            className="w-full text-xs"
          >
            Apply & Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
