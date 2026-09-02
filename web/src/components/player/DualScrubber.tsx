"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { formatTime, cn } from "@/lib/utils";
import { PartnerProgressDTO } from "@watch2gether/shared";

interface DualScrubberProps {
  currentTime: number;
  duration: number;
  bufferProgress?: number;
  partnerProgress?: PartnerProgressDTO | null;
  canControl?: boolean;
  onSeek: (seconds: number) => void;
  className?: string;
  /** Optional ref to the live player so we can read currentTime at rAF frequency */
  liveTimeGetter?: () => number;
}

export function DualScrubber({
  currentTime,
  duration,
  bufferProgress = 0,
  partnerProgress,
  canControl = true,
  onSeek,
  className = "",
  liveTimeGetter,
}: DualScrubberProps) {
  const railRef = useRef<HTMLDivElement>(null);
  // DOM refs for zero-rerender progress updates
  const trackFillRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);
  const [showPing, setShowPing] = useState(false);
  const lastConvergedRef = useRef<boolean>(false);

  const safeDuration = duration > 0 ? duration : 100;
  const bufferPercent = Math.min(100, Math.max(0, (bufferProgress / safeDuration) * 100));

  // Partner progress (low-freq, computed from prop)
  const partnerPercent = useMemo(() => {
    if (!partnerProgress || !duration) return null;
    return Math.min(100, Math.max(0, (partnerProgress.currentTime / safeDuration) * 100));
  }, [partnerProgress, safeDuration, duration]);

  const driftMs = useMemo(() => {
    if (!partnerProgress) return 0;
    return Math.round((currentTime - partnerProgress.currentTime) * 1000);
  }, [currentTime, partnerProgress]);

  // Detect convergence (< 150ms) to trigger signature ping animation
  useEffect(() => {
    if (!partnerProgress) return;
    const isNowConverged = Math.abs(driftMs) <= 150;
    if (isNowConverged && !lastConvergedRef.current) {
      setShowPing(true);
      const t = setTimeout(() => setShowPing(false), 700);
      return () => clearTimeout(t);
    }
    lastConvergedRef.current = isNowConverged;
  }, [driftMs, partnerProgress]);

  // rAF loop: update track fill & knob position directly on DOM — zero React renders
  useEffect(() => {
    const tick = () => {
      const liveTime = liveTimeGetter ? liveTimeGetter() : currentTime;
      const dur = duration > 0 ? duration : 100;
      const pct = Math.min(100, Math.max(0, (liveTime / dur) * 100));
      if (trackFillRef.current) trackFillRef.current.style.width = `${pct}%`;
      if (knobRef.current) knobRef.current.style.left = `${pct}%`;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [liveTimeGetter, currentTime, duration]);

  const calculateTimeFromEvent = (e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
    if (!railRef.current) return 0;
    const rect = railRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const fraction = clickX / rect.width;
    return fraction * safeDuration;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canControl) return;
    setIsDragging(true);
    const target = calculateTimeFromEvent(e);
    onSeek(target);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const time = calculateTimeFromEvent(moveEvent);
      onSeek(time);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMoveRail = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!railRef.current) return;
    const rect = railRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const fraction = Math.max(0, Math.min(x / rect.width, 1));
    setHoverPosition(fraction * 100);
    setHoverTime(fraction * safeDuration);
  };

  const handleMouseLeaveRail = () => {
    setHoverTime(null);
  };

  // Gap connector geometry between local and partner
  const localPercent = Math.min(100, Math.max(0, (currentTime / safeDuration) * 100));
  const gapLeft = partnerPercent !== null ? Math.min(localPercent, partnerPercent) : 0;
  const gapWidth = partnerPercent !== null ? Math.abs(localPercent - partnerPercent) : 0;
  const showGap = partnerPercent !== null && gapWidth > 0.5 && Math.abs(driftMs) > 150;

  return (
    <div className={cn("relative w-full select-none py-2 group/scrubber", className)}>
      {/* Dual Ribbon Container */}
      <div
        ref={railRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMoveRail}
        onMouseLeave={handleMouseLeaveRail}
        className={cn(
          "relative h-5 flex items-center cursor-pointer",
          !canControl && "cursor-not-allowed opacity-75"
        )}
      >
        {/* Track Rail */}
        <div className="absolute inset-x-0 h-1 rounded-full bg-slate-800 transition-all group-hover/scrubber:h-1.5" />

        {/* Buffered Progress */}
        {bufferPercent > 0 && (
          <div
            className="absolute left-0 h-1 rounded-full bg-slate-700/70 transition-all group-hover/scrubber:h-1.5"
            style={{ width: `${bufferPercent}%` }}
          />
        )}

        {/* Local Played Track — updated by rAF, not React state */}
        <div
          ref={trackFillRef}
          className="absolute left-0 h-1 rounded-full bg-gradient-to-r from-indigo-500 to-teal-400 transition-none group-hover/scrubber:h-1.5"
          style={{ width: `${localPercent}%` }}
        />

        {/* Drift Gap Line (Dashed connector between local & partner playhead) */}
        {showGap && (
          <div
            className="absolute h-0.5 border-b border-dashed border-pink-400/80 pointer-events-none z-10 transition-all duration-300"
            style={{
              left: `${gapLeft}%`,
              width: `${gapWidth}%`,
            }}
          >
            {/* Drift Label */}
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-mono font-medium bg-slate-900/90 text-pink-300 border border-pink-500/30 whitespace-nowrap shadow-sm">
              {driftMs > 0 ? `+${driftMs}ms` : `${driftMs}ms`}
            </span>
          </div>
        )}

        {/* Convergence Ping Ring Animation */}
        {showPing && (
          <div
            className="absolute w-6 h-6 rounded-full border border-teal-400 pointer-events-none z-20 animate-ping"
            style={{
              left: `${localPercent}%`,
              transform: "translate(-50%, 0)",
            }}
          />
        )}

        {/* Partner Playhead (Pink / Avatar Color) */}
        {partnerPercent !== null && (
          <div
            className={cn(
              "absolute z-20 -translate-x-1/2 w-1.5 h-3.5 rounded-full transition-all duration-300 pointer-events-none",
              partnerProgress?.isStalled && "animate-pulse"
            )}
            style={{
              left: `${partnerPercent}%`,
              backgroundColor: partnerProgress?.color || "#F5A9C4",
              boxShadow: "0 0 6px rgba(245, 169, 196, 0.8)",
            }}
            title={`${partnerProgress?.name || "Partner"}: ${formatTime(partnerProgress?.currentTime || 0)}`}
          />
        )}

        {/* Local Playhead Knob — updated by rAF */}
        <div
          ref={knobRef}
          className={cn(
            "absolute z-30 -translate-x-1/2 w-3 h-3 rounded-full bg-teal-300 border-2 border-slate-950 shadow-md transition-transform duration-150",
            (isDragging || hoverTime !== null) && "scale-125 bg-white ring-2 ring-teal-400"
          )}
          style={{ left: `${localPercent}%` }}
        />

        {/* Hover Time Tooltip */}
        {hoverTime !== null && (
          <div
            className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded bg-slate-900/95 border border-slate-700 text-[11px] font-mono text-slate-200 pointer-events-none z-40 shadow-lg"
            style={{ left: `${hoverPosition}%` }}
          >
            {formatTime(hoverTime)}
          </div>
        )}
      </div>
    </div>
  );
}
