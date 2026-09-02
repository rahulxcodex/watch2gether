"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Tv,
  Share2,
  Users,
  Activity,
  Sparkles,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PermissionControls } from "./PermissionControls";
import { ShareModal } from "./ShareModal";
import { PermissionMode, UserDTO } from "@watch2gether/shared";
import { SyncEngineStatus } from "@/hooks/useSyncEngine";
import { cn } from "@/lib/utils";

interface RoomHeaderProps {
  roomCode: string;
  roomName: string;
  isHost: boolean;
  permissionMode: PermissionMode;
  onTogglePermission?: (mode: PermissionMode) => void;
  syncStatus: SyncEngineStatus;
  activeUsers: UserDTO[];
}

export function RoomHeader({
  roomCode,
  roomName,
  isHost,
  permissionMode,
  onTogglePermission,
  syncStatus,
  activeUsers,
}: RoomHeaderProps) {
  const [isShareOpen, setIsShareOpen] = useState(false);

  // Sync latency badge styling
  const getSyncBadge = () => {
    if (!syncStatus.isSynced) {
      return (
        <Badge variant="outline" className="gap-1.5 text-[11px] border-slate-700 bg-slate-800/50 text-slate-400">
          <WifiOff className="h-3 w-3 text-slate-400" />
          <span>Connecting...</span>
        </Badge>
      );
    }

    const latency = syncStatus.rttLatencyMs;
    const isGood = latency < 100;
    const isModerate = latency >= 100 && latency <= 250;

    return (
      <Badge
        variant={isGood ? "success" : isModerate ? "warning" : "destructive"}
        className={cn(
          "gap-1.5 text-[11px] py-0.5 px-2.5 transition-colors",
          isGood
            ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
            : isModerate
            ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
            : "bg-red-500/10 text-red-300 border-red-500/30"
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            isGood ? "bg-emerald-400 animate-pulse" : isModerate ? "bg-amber-400" : "bg-red-400"
          )}
        />
        <span>Synced ({latency}ms RTT)</span>
      </Badge>
    );
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
      <div className="container flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Left: Brand & Room Identity */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="flex items-center gap-2 group transition-transform hover:scale-105"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md shadow-indigo-500/25">
              <Tv className="h-4 w-4 text-white" />
            </div>
            <span className="hidden sm:inline font-bold text-sm tracking-tight text-white group-hover:text-indigo-300 transition-colors">
              Watch2Gether
            </span>
          </Link>

          <div className="h-4 w-[1px] bg-slate-800 hidden sm:block" />

          {/* Room Title & Code */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-xs sm:text-sm text-slate-100 truncate max-w-[120px] sm:max-w-[200px]">
              {roomName}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-800/80 text-[11px] font-mono text-slate-300 border border-slate-700/60 hidden md:inline-block">
              {roomCode}
            </span>
          </div>
        </div>

        {/* Center: Live Sync Latency Status */}
        <div className="hidden lg:flex items-center gap-2">
          {getSyncBadge()}
        </div>

        {/* Right: Actions (Permissions, Share, Presence) */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Permission Mode Pill */}
          <PermissionControls
            permissionMode={permissionMode}
            isHost={isHost}
            onTogglePermission={onTogglePermission}
          />

          {/* Participant Count Pill */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-xs font-medium">
            <Users className="h-3.5 w-3.5 text-indigo-400" />
            <span>{activeUsers.length}</span>
          </div>

          {/* Share CTA */}
          <Button
            size="sm"
            variant="glow"
            onClick={() => setIsShareOpen(true)}
            className="h-8 gap-1.5 px-3 text-xs shadow-none"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Share Room</span>
          </Button>
        </div>
      </div>

      {/* Share Modal Dialog */}
      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        roomCode={roomCode}
        roomName={roomName}
      />
    </header>
  );
}
