"use client";

import React, { useState, useEffect, useMemo } from "react";
import { SubtitleCue } from "@watch2gether/shared";

export interface SubtitleStyleOptions {
  fontSize: "sm" | "md" | "lg" | "xl";
  color: string;
  backgroundColor: string;
  bgOpacity: number;
  bottomPercent: number;
}

interface SubtitleOverlayProps {
  cues?: SubtitleCue[];
  rawText?: string;
  currentTime: number;
  offsetSeconds?: number;
  isVisible?: boolean;
  styleOptions?: Partial<SubtitleStyleOptions>;
  className?: string;
}

/**
 * Converts timestamp strings (00:01:23.456 or 00:01:23,456) to seconds.
 */
function parseTimestamp(timeStr: string): number {
  const parts = timeStr.trim().replace(",", ".").split(":");
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
  }
  if (parts.length === 2) {
    const minutes = parseFloat(parts[0]);
    const seconds = parseFloat(parts[1]);
    return minutes * 60 + seconds;
  }
  return 0;
}

/**
 * Parses raw SRT or WebVTT string into structured SubtitleCue items.
 */
export function parseSubtitleText(content: string): SubtitleCue[] {
  if (!content) return [];
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized.split(/\n\s*\n/);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (!lines.length) continue;

    let timeLineIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("-->")) {
        timeLineIdx = i;
        break;
      }
    }

    if (timeLineIdx === -1) continue;

    const timeLine = lines[timeLineIdx];
    const [startStr, endStr] = timeLine.split("-->").map((s) => s.trim().split(" ")[0]);
    if (!startStr || !endStr) continue;

    const start = parseTimestamp(startStr);
    const end = parseTimestamp(endStr);
    const textLines = lines.slice(timeLineIdx + 1);
    const text = textLines
      .join("\n")
      .replace(/<[^>]+>/g, "") // Strip HTML tags
      .trim();

    if (text) {
      cues.push({
        id: `cue_${start}_${end}`,
        start,
        end,
        text,
      });
    }
  }

  return cues;
}

export function SubtitleOverlay({
  cues: propCues,
  rawText,
  currentTime,
  offsetSeconds = 0,
  isVisible = true,
  styleOptions = {},
  className = "",
}: SubtitleOverlayProps) {
  const parsedCues = useMemo(() => {
    if (propCues && propCues.length > 0) return propCues;
    if (rawText) return parseSubtitleText(rawText);
    return [];
  }, [propCues, rawText]);

  const effectiveTime = currentTime + offsetSeconds;

  // Find active cue matching current timecode
  const activeCue = useMemo(() => {
    if (!isVisible || !parsedCues.length) return null;
    return parsedCues.find(
      (cue) => effectiveTime >= cue.start && effectiveTime <= cue.end
    );
  }, [parsedCues, effectiveTime, isVisible]);

  if (!isVisible || !activeCue) return null;

  const fontSizes = {
    sm: "text-sm sm:text-base",
    md: "text-base sm:text-lg lg:text-xl",
    lg: "text-lg sm:text-2xl lg:text-3xl",
    xl: "text-xl sm:text-3xl lg:text-4xl",
  };

  const sizeClass = fontSizes[styleOptions.fontSize || "md"];
  const color = styleOptions.color || "#FFFFFF";
  const bgOpacity = styleOptions.bgOpacity ?? 0.7;
  const bottom = styleOptions.bottomPercent ?? 10;

  return (
    <div
      className={`absolute inset-x-0 pointer-events-none z-20 flex justify-center text-center px-6 transition-all duration-200 ${className}`}
      style={{ bottom: `${bottom}%` }}
    >
      <span
        className={`inline-block px-3 py-1.5 rounded-md font-medium tracking-wide leading-relaxed select-none shadow-lg ${sizeClass}`}
        style={{
          color,
          backgroundColor: `rgba(0, 0, 0, ${bgOpacity})`,
          textShadow: "0 2px 4px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.9)",
          maxWidth: "85%",
          whiteSpace: "pre-wrap",
        }}
      >
        {activeCue.text}
      </span>
    </div>
  );
}
