"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Tv,
  Play,
  Users,
  Zap,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Smile,
  Globe,
  Film,
  Lock,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BackgroundGrid } from "@/components/visual/BackgroundGrid";
import { ShimmerButton } from "@/components/visual/ShimmerButton";
import { createRoom } from "@/lib/api";
import { MediaType, PermissionMode } from "@watch2gether/shared";

export default function HomePage() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [roomTitle, setRoomTitle] = useState("Movie Night Party");
  const [mediaUrl, setMediaUrl] = useState(
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
  );
  const [mediaType, setMediaType] = useState<MediaType>("MP4");
  const [permissionMode, setPermissionMode] = useState<PermissionMode>("SHARED");
  const [isCreating, setIsCreating] = useState(false);

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = joinCode.trim().toUpperCase();
    if (!cleanCode) return;
    router.push(`/room/${cleanCode}`);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      const room = await createRoom({
        name: roomTitle.trim() || "Watch Party",
        mediaUrl: mediaUrl.trim(),
        mediaType,
        permissionMode,
      });
      router.push(`/room/${room.roomCode}`);
    } catch (err) {
      console.warn("Failed to create room:", err);
      // Fallback
      const fallbackCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      router.push(`/room/${fallbackCode}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <main className="relative min-h-screen flex flex-col justify-between overflow-hidden bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white">
      {/* Background Animated Beams & Grid */}
      <BackgroundGrid />

      {/* Navigation Bar */}
      <nav className="relative z-10 w-full border-b border-slate-800/60 bg-slate-950/40 backdrop-blur-md">
        <div className="container flex h-16 max-w-7xl items-center justify-between px-4 sm:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/30">
              <Tv className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">
              Watch<span className="text-indigo-400">2</span>Gether
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Badge variant="outline" className="hidden sm:inline-flex gap-1.5 border-slate-700 text-slate-300 text-xs py-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
              Sub-500ms Precision Sync
            </Badge>
            <Button
              variant="glow"
              size="sm"
              onClick={() => setIsCreateOpen(true)}
              className="gap-1.5 text-xs shadow-indigo-500/20"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Create Room</span>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 container max-w-5xl px-4 py-16 sm:py-24 text-center mx-auto flex flex-col items-center justify-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-xs font-medium text-indigo-300 mb-6 backdrop-blur-md animate-fade-in">
          <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
          <span>Real-Time Cross-Platform Media Synchronization</span>
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-4xl leading-tight">
          Watch movies & videos together with <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">zero delay</span>.
        </h1>

        <p className="mt-6 max-w-2xl text-base sm:text-lg text-slate-400 leading-relaxed">
          Synchronize YouTube and direct MP4 videos with sub-second precision. Enjoy real-time chat, floating emoji reaction bursts, and seamless zero-wall guest links.
        </p>

        {/* CTA Actions Box */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-md">
          <ShimmerButton
            onClick={() => setIsCreateOpen(true)}
            className="w-full sm:w-auto h-12 text-sm font-semibold shadow-xl shadow-indigo-600/20"
          >
            <Play className="h-4 w-4 mr-2 fill-current" />
            Create Free Room
          </ShimmerButton>

          <form
            onSubmit={handleJoinSubmit}
            className="flex items-center gap-2 w-full sm:w-auto"
          >
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              maxLength={12}
              className="h-12 w-36 bg-slate-900/90 border-slate-700 text-center font-mono font-bold tracking-widest text-sm text-white uppercase placeholder:text-slate-500"
            />
            <Button
              type="submit"
              variant="outline"
              disabled={!joinCode.trim()}
              className="h-12 px-4 border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-200"
            >
              Join <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </form>
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section className="relative z-10 container max-w-6xl px-4 py-12 mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-md hover:border-indigo-500/40 transition-colors">
            <CardHeader className="pb-3">
              <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-2 border border-indigo-500/20">
                <Zap className="h-5 w-5" />
              </div>
              <CardTitle className="text-base text-white">NTP Clock Sync</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Cristian’s algorithm with rolling lowest-RTT filter guarantees sub-500ms sync across all participants.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-md hover:border-indigo-500/40 transition-colors">
            <CardHeader className="pb-3">
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 mb-2 border border-purple-500/20">
                <Users className="h-5 w-5" />
              </div>
              <CardTitle className="text-base text-white">Zero-Wall Onboarding</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Guests join instantly via invite URL or QR code without mandatory login or account creation barriers.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-md hover:border-indigo-500/40 transition-colors">
            <CardHeader className="pb-3">
              <div className="h-10 w-10 rounded-lg bg-pink-500/10 flex items-center justify-center text-pink-400 mb-2 border border-pink-500/20">
                <Film className="h-5 w-5" />
              </div>
              <CardTitle className="text-base text-white">Unified Video Engine</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Seamlessly supports YouTube IFrame and direct HTML5 MP4 videos with custom playback controls.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-md hover:border-indigo-500/40 transition-colors">
            <CardHeader className="pb-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-2 border border-emerald-500/20">
                <Smile className="h-5 w-5" />
              </div>
              <CardTitle className="text-base text-white">Chat & Floating Emojis</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Interactive real-time chat with 2D physics floating emoji particle bursts layered over the video canvas.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/60 bg-slate-950/80 py-6 text-center text-xs text-slate-500">
        <div className="container max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 Watch2Gether. All rights reserved.</p>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Sub-Second Latency</span>
            <span>•</span>
            <span>WebSocket + Redis PubSub</span>
            <span>•</span>
            <span>Web & Android</span>
          </div>
        </div>
      </footer>

      {/* Create Room Modal */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-indigo-400" />
              Create a Watch Room
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Configure your room title and starter media. You can invite friends immediately after creation.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Room Title</label>
              <Input
                value={roomTitle}
                onChange={(e) => setRoomTitle(e.target.value)}
                placeholder="e.g. Cozy Movie Night"
                className="bg-slate-800 border-slate-700 text-white text-xs"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Media URL (YouTube or Direct MP4)</label>
              <Input
                value={mediaUrl}
                onChange={(e) => {
                  const val = e.target.value;
                  setMediaUrl(val);
                  setMediaType(val.includes("youtube.com") || val.includes("youtu.be") ? "YOUTUBE" : "MP4");
                }}
                placeholder="https://..."
                className="bg-slate-800 border-slate-700 text-white text-xs"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Playback Permission</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPermissionMode("SHARED")}
                  className={`flex items-center justify-center gap-1.5 p-2.5 rounded-lg border text-xs font-medium transition-all ${
                    permissionMode === "SHARED"
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                      : "border-slate-800 bg-slate-800/50 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <Users className="h-3.5 w-3.5" />
                  Shared Control
                </button>
                <button
                  type="button"
                  onClick={() => setPermissionMode("HOST_ONLY")}
                  className={`flex items-center justify-center gap-1.5 p-2.5 rounded-lg border text-xs font-medium transition-all ${
                    permissionMode === "HOST_ONLY"
                      ? "border-amber-500 bg-amber-500/10 text-amber-300"
                      : "border-slate-800 bg-slate-800/50 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <Lock className="h-3.5 w-3.5" />
                  Host Only
                </button>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400"
              >
                Cancel
              </Button>
              <Button type="submit" variant="glow" disabled={isCreating}>
                {isCreating ? "Creating Room..." : "Launch Room Party"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
