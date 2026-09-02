"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Keyboard, Play, Volume2, Maximize, RotateCcw, MessageSquare, Subtitles, Monitor, Tv } from "lucide-react";

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  const shortcuts = [
    { key: "Space / K", desc: "Toggle Play / Pause", icon: Play },
    { key: "F", desc: "Toggle Fullscreen Mode", icon: Maximize },
    { key: "T", desc: "Toggle Theater / Cinema View", icon: Tv },
    { key: "M", desc: "Mute / Unmute Audio", icon: Volume2 },
    { key: "← / →", desc: "Seek backward / forward 5s", icon: RotateCcw },
    { key: "↑ / ↓", desc: "Increase / decrease volume by 10%", icon: Volume2 },
    { key: "C", desc: "Toggle Subtitles / Closed Captions", icon: Subtitles },
    { key: "S", desc: "Smart Snap-Sync to Room Authoritative Time", icon: RotateCcw },
    { key: "D", desc: "Start / Stop Screen Sharing", icon: Monitor },
    { key: "?", desc: "Open this Keyboard Shortcuts Guide", icon: Keyboard },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md border-slate-800 bg-slate-950/95 text-slate-100 shadow-2xl backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-white">
            <Keyboard className="h-5 w-5 text-indigo-400" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {shortcuts.map((s, idx) => {
            const Icon = s.icon;
            return (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg border border-slate-900 bg-slate-900/40 px-3 py-2 text-xs"
              >
                <span className="flex items-center gap-2 text-slate-300 font-medium">
                  <Icon className="h-3.5 w-3.5 text-indigo-400" />
                  {s.desc}
                </span>
                <kbd className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-300 shadow-inner">
                  {s.key}
                </kbd>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
