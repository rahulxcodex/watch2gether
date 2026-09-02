"use client";

import React, { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { SubtitleStyleOptions } from "./SubtitleOverlay";
import { Subtitles, Upload, RotateCcw, Plus, Minus } from "lucide-react";

interface SubtitleSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtitlesEnabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  offsetSeconds: number;
  onOffsetChange: (offset: number) => void;
  styleOptions: SubtitleStyleOptions;
  onStyleChange: (styles: Partial<SubtitleStyleOptions>) => void;
  onLoadSubtitleFile: (content: string, fileName: string) => void;
  currentSubtitleName?: string;
}

export function SubtitleSettingsModal({
  isOpen,
  onClose,
  subtitlesEnabled,
  onToggleEnabled,
  offsetSeconds,
  onOffsetChange,
  styleOptions,
  onStyleChange,
  onLoadSubtitleFile,
  currentSubtitleName,
}: SubtitleSettingsModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        onLoadSubtitleFile(text, file.name);
        onToggleEnabled(true);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const colors = [
    { label: "White", value: "#FFFFFF" },
    { label: "Yellow", value: "#FACC15" },
    { label: "Cyan", value: "#22D3EE" },
    { label: "Pink", value: "#F472B6" },
  ];

  const fontSizes: Array<{ label: string; value: SubtitleStyleOptions["fontSize"] }> = [
    { label: "Small", value: "sm" },
    { label: "Medium", value: "md" },
    { label: "Large", value: "lg" },
    { label: "XL", value: "xl" },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-slate-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Subtitles className="h-5 w-5 text-indigo-400" />
            Subtitle & Caption Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-3">
          {/* Enable Subtitles Toggle */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <span className="text-sm font-medium text-white block">Enable Subtitles</span>
              <span className="text-xs text-slate-400">Display closed captions overlay</span>
            </div>
            <Button
              size="sm"
              variant={subtitlesEnabled ? "glow" : "outline"}
              onClick={() => onToggleEnabled(!subtitlesEnabled)}
              className="text-xs"
            >
              {subtitlesEnabled ? "Enabled" : "Disabled"}
            </Button>
          </div>

          {/* Timing Offset Nudge */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-300">Timing Offset (Nudge)</span>
              <span className="text-xs font-mono text-indigo-300">
                {offsetSeconds >= 0 ? `+${offsetSeconds.toFixed(1)}s` : `${offsetSeconds.toFixed(1)}s`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 border-slate-700 hover:bg-slate-800"
                onClick={() => onOffsetChange(Number((offsetSeconds - 0.1).toFixed(1)))}
                title="Shift -100ms (Hotkey: [ )"
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs border-slate-700 text-slate-300 hover:bg-slate-800 gap-1"
                onClick={() => onOffsetChange(0)}
              >
                <RotateCcw className="h-3 w-3" />
                Reset Offset
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 border-slate-700 hover:bg-slate-800"
                onClick={() => onOffsetChange(Number((offsetSeconds + 0.1).toFixed(1)))}
                title="Shift +100ms (Hotkey: ] )"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Tip: Use keyboard shortcuts <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">[</kbd> and <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">]</kbd> to nudge timing in 100ms steps.
            </span>
          </div>

          {/* Font Size */}
          <div>
            <span className="text-xs font-medium text-slate-300 block mb-2">Font Size</span>
            <div className="grid grid-cols-4 gap-2">
              {fontSizes.map((size) => (
                <Button
                  key={size.value}
                  variant={styleOptions.fontSize === size.value ? "glow" : "outline"}
                  size="sm"
                  className="text-xs border-slate-800"
                  onClick={() => onStyleChange({ fontSize: size.value })}
                >
                  {size.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Text Color */}
          <div>
            <span className="text-xs font-medium text-slate-300 block mb-2">Text Color</span>
            <div className="flex gap-2">
              {colors.map((c) => (
                <button
                  key={c.value}
                  onClick={() => onStyleChange({ color: c.value })}
                  className={`h-8 flex-1 rounded-md border text-xs font-medium transition-all ${
                    styleOptions.color === c.value
                      ? "border-indigo-400 ring-2 ring-indigo-400/40"
                      : "border-slate-800 hover:border-slate-700"
                  }`}
                  style={{ backgroundColor: c.value, color: "#111" }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Background Opacity */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-300">Background Shading</span>
              <span className="text-xs font-mono text-slate-400">
                {Math.round(styleOptions.bgOpacity * 100)}%
              </span>
            </div>
            <Slider
              value={[styleOptions.bgOpacity * 100]}
              max={100}
              step={5}
              onValueChange={(val) => onStyleChange({ bgOpacity: (val[0] || 0) / 100 })}
            />
          </div>

          {/* Custom File Upload */}
          <div className="pt-2 border-t border-slate-800">
            <span className="text-xs font-medium text-slate-300 block mb-2">Load Custom Subtitles</span>
            {currentSubtitleName && (
              <p className="text-xs text-indigo-300 font-mono mb-2 truncate">
                Active: {currentSubtitleName}
              </p>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".srt,.vtt"
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs border-slate-700 text-slate-200 hover:bg-slate-800 gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5 text-slate-400" />
              Upload .SRT or .VTT File
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="glow" size="sm" onClick={onClose} className="w-full text-xs">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
