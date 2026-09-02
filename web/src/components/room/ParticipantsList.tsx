"use client";

import React from "react";
import { Crown, User, Wifi, WifiOff } from "lucide-react";
import { UserDTO } from "@watch2gether/shared";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ParticipantsListProps {
  users: UserDTO[];
  currentUserId: string;
  hostId: string;
  className?: string;
}

export function ParticipantsList({
  users,
  currentUserId,
  hostId,
  className,
}: ParticipantsListProps) {
  return (
    <div className={cn("space-y-2 p-3", className)}>
      <div className="flex items-center justify-between px-1 mb-2">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Active Members ({users.length})
        </span>
      </div>

      <div className="space-y-1.5">
        {users.map((user) => {
          const isMe = user.id === currentUserId;
          const isHost = user.id === hostId || user.isHost;
          const initials = (user.name || "U")
            .split(" ")
            .map((n) => n[0])
            .join("")
            .substring(0, 2)
            .toUpperCase();

          return (
            <div
              key={user.id}
              className={cn(
                "flex items-center justify-between p-2 rounded-xl transition-colors",
                isMe
                  ? "bg-indigo-950/40 border border-indigo-500/20"
                  : "bg-slate-800/40 hover:bg-slate-800/80"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar className="h-8 w-8 border border-slate-700 shrink-0">
                  <AvatarFallback
                    style={{
                      backgroundColor: user.color || user.avatarColor || "#6366f1",
                    }}
                    className="text-white text-xs font-bold"
                  >
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-slate-200 truncate">
                      {user.name}
                    </span>
                    {isMe && (
                      <span className="text-[10px] text-indigo-400 font-semibold">
                        (You)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    {user.isGuest ? <span>Guest</span> : <span>Member</span>}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {isHost && (
                  <Badge variant="warning" className="text-[10px] py-0 px-2 gap-1 bg-amber-500/10 text-amber-300 border-amber-500/30">
                    <Crown className="h-2.5 w-2.5" />
                    Host
                  </Badge>
                )}
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
