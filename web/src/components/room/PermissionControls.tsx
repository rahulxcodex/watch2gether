"use client";

import React from "react";
import { Lock, Unlock, Shield, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PermissionMode } from "@watch2gether/shared";
import { cn } from "@/lib/utils";

interface PermissionControlsProps {
  permissionMode: PermissionMode;
  isHost: boolean;
  onTogglePermission?: (newMode: PermissionMode) => void;
  className?: string;
}

export function PermissionControls({
  permissionMode,
  isHost,
  onTogglePermission,
  className,
}: PermissionControlsProps) {
  const isHostOnly = permissionMode === "HOST_ONLY";

  const handleToggle = () => {
    if (!isHost || !onTogglePermission) return;
    const nextMode: PermissionMode = isHostOnly ? "SHARED" : "HOST_ONLY";
    onTogglePermission(nextMode);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("inline-flex items-center gap-2", className)}>
        {isHost ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggle}
                className={cn(
                  "h-8 px-2.5 text-xs font-medium border transition-colors",
                  isHostOnly
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                )}
              >
                {isHostOnly ? (
                  <>
                    <Lock className="h-3.5 w-3.5 mr-1.5 text-amber-400" />
                    <span>Host Control</span>
                  </>
                ) : (
                  <>
                    <Unlock className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
                    <span>Shared Control</span>
                  </>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>
                {isHostOnly
                  ? "Only you can control playback. Click to allow everyone."
                  : "All members can control playback. Click to lock to Host."}
              </p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant={isHostOnly ? "warning" : "success"}
                className="cursor-default flex items-center gap-1 py-1 px-2.5"
              >
                {isHostOnly ? (
                  <>
                    <Lock className="h-3 w-3" />
                    <span>Host-Only Control</span>
                  </>
                ) : (
                  <>
                    <Users className="h-3 w-3" />
                    <span>Shared Control</span>
                  </>
                )}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>
                {isHostOnly
                  ? "Playback is locked by the room host."
                  : "Anyone in the room can play, pause, or seek."}
              </p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
