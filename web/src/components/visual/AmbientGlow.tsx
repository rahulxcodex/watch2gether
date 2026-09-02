"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface AmbientGlowProps {
  isPlaying?: boolean;
  className?: string;
}

export function AmbientGlow({ isPlaying = false, className }: AmbientGlowProps) {
  return (
    <div
      className={cn(
        "absolute -inset-2 md:-inset-4 rounded-3xl bg-gradient-to-r from-indigo-600/30 via-purple-600/20 to-pink-600/30 blur-2xl transition-opacity duration-1000 -z-10 pointer-events-none",
        isPlaying ? "opacity-90 animate-pulse" : "opacity-30",
        className
      )}
    />
  );
}
