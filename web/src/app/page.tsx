"use client";

import React, { useState, useEffect } from "react";
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
  Clock,
  Radio,
  Subtitles,
  FolderOpen,
  ChevronRight,
  RotateCcw,
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
import { formatTime } from "@/lib/utils";

interface ContinueWatchingItem {
  url: string;
  time: number;
  duration: number;
  title: string;
  updatedAt: number;
}

interface SavedRoomItem {
  code: string;
  name: string;
  lastVisited: number;
}

const FEATURED_TITLES = [
  {
    title: "Big Buck Bunny",
    year: "2008",
    duration: "9:56",
    tag: "Blender Open Movie",
    mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    mediaType: "MP4" as MediaType,
    backdrop: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80",
    description: "A large and lovable rabbit deals with bullying forest creatures in this iconic open-source animated film.",
  },
  {
    title: "Sintel",
    year: "2010",
    duration: "14:48",
    tag: "Fantasy Animation",
    mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
    mediaType: "MP4" as MediaType,
    backdrop: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80",
    description: "A lonely young woman searches the desert for her lost pet baby dragon, confronting dangers along the journey.",
  },
  {
    title: "Tears of Steel",
    year: "2012",
    duration: "12:14",
    tag: "Sci-Fi / VFX",
    mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
    mediaType: "MP4" as MediaType,
    backdrop: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=80",
    description: "Set in a dystopian future Amsterdam, a squad of warriors attempts to stage a key event to alter the timeline.",
  },
  {
    title: "Elephants Dream",
    year: "2006",
    duration: "10:53",
    tag: "Surreal Sci-Fi",
    mediaUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    mediaType: "MP4" as MediaType,
    backdrop: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&auto=format&fit=crop&q=80",
    description: "Two strange characters explore a vast, organic mechanical labyrinth with bizarre inner workings.",
  },
];

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

  // Stored state from localStorage
  const [continueWatching, setContinueWatching] = useState<ContinueWatchingItem[]>([]);
  const [savedRooms, setSavedRooms] = useState<SavedRoomItem[]>([]);

  useEffect(() => {
    try {
      const storedProgress = localStorage.getItem("wtProgressV1");
      if (storedProgress) {
        const map = JSON.parse(storedProgress);
        const list: ContinueWatchingItem[] = Object.keys(map).map((url) => ({
          url,
          ...map[url],
        }));
        setContinueWatching(list.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6));
      }

      const storedRooms = localStorage.getItem("wtSavedRoomsV1");
      if (storedRooms) {
        const rooms: SavedRoomItem[] = JSON.parse(storedRooms);
        setSavedRooms(rooms.slice(0, 6));
      }
    } catch (e) {
      // Ignore read error
    }
  }, []);

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
      const fallbackCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      router.push(`/room/${fallbackCode}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleLaunchFeatured = async (item: typeof FEATURED_TITLES[0]) => {
    try {
      const room = await createRoom({
        name: item.title,
        mediaUrl: item.mediaUrl,
        mediaType: item.mediaType,
        permissionMode: "SHARED",
      });
      router.push(`/room/${room.roomCode}`);
    } catch (err) {
      const fallbackCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      router.push(`/room/${fallbackCode}`);
    }
  };

  return (
    <main className="relative min-h-screen flex flex-col justify-between overflow-hidden bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white">
      {/* Background Animated Beams & Grid */}
      <BackgroundGrid />

      {/* Navigation Bar */}
      <nav className="relative z-10 w-full border-b border-slate-800/60 bg-slate-950/40 backdrop-blur-md">
        <div className="container flex h-16 max-w-7xl items-center justify-between px-4 sm:px-8 mx-auto">
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
      <section className="relative z-10 container max-w-5xl px-4 pt-14 pb-10 text-center mx-auto flex flex-col items-center justify-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-xs font-medium text-indigo-300 mb-6 backdrop-blur-md animate-fade-in">
          <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
          <span>Real-Time Cross-Platform Media Synchronization</span>
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-4xl leading-tight">
          Watch movies & videos together with <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">zero delay</span>.
        </h1>

        <p className="mt-5 max-w-2xl text-base sm:text-lg text-slate-400 leading-relaxed">
          Synchronize YouTube, HLS, and local videos with dual-playhead precision. Enjoy P2P voice chat with audio ducking, custom subtitles, and zero-wall guest links.
        </p>

        {/* CTA Actions Box */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-md">
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

      {/* Continue Watching Section (if history exists) */}
      {continueWatching.length > 0 && (
        <section className="relative z-10 container max-w-6xl px-4 py-6 mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-400" />
              Continue Watching
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {continueWatching.map((item, idx) => {
              const progressPct = item.duration > 0 ? Math.min(100, (item.time / item.duration) * 100) : 0;
              return (
                <div
                  key={`cw_${idx}`}
                  className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium text-slate-200 truncate block">
                      {item.title}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 flex-none">
                      {formatTime(item.time)} / {formatTime(item.duration)}
                    </span>
                  </div>
                  {/* Progress Bar */}
                  <div className="w-full h-1 rounded-full bg-slate-800 my-2 overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const room = await createRoom({
                        name: item.title,
                        mediaUrl: item.url,
                        mediaType: item.url.includes("youtube.com") ? "YOUTUBE" : "MP4",
                      });
                      router.push(`/room/${room.roomCode}`);
                    }}
                    className="h-7 text-xs border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 mt-1"
                  >
                    <Play className="h-3 w-3 mr-1" />
                    Resume in New Room
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Saved / Recent Rooms Section (if exists) */}
      {savedRooms.length > 0 && (
        <section className="relative z-10 container max-w-6xl px-4 py-4 mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Radio className="h-4 w-4 text-emerald-400" />
              Recent Rooms
            </h2>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
            {savedRooms.map((room) => (
              <Button
                key={room.code}
                variant="outline"
                size="sm"
                onClick={() => router.push(`/room/${room.code}`)}
                className="h-9 px-3 border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-200 text-xs font-mono gap-2 flex-none"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span>{room.code}</span>
                <span className="text-slate-500 font-sans font-normal truncate max-w-[120px]">
                  {room.name}
                </span>
              </Button>
            ))}
          </div>
        </section>
      )}

      {/* Featured Public Domain / Open Cinema Row */}
      <section className="relative z-10 container max-w-6xl px-4 py-8 mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <Film className="h-5 w-5 text-indigo-400" />
              Featured Open Cinema Catalog
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Launch an instant synchronized watch party with 1 click
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURED_TITLES.map((title) => (
            <div
              key={title.title}
              className="group relative rounded-xl overflow-hidden bg-slate-900 border border-slate-800 hover:border-indigo-500/50 transition-all flex flex-col justify-between shadow-lg"
            >
              {/* Image Preview / Backdrop */}
              <div className="relative aspect-video w-full overflow-hidden bg-slate-950">
                <img
                  src={title.backdrop}
                  alt={title.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-80 group-hover:opacity-100"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
                <Badge className="absolute top-2 right-2 bg-slate-950/80 text-indigo-300 text-[10px] font-mono border border-slate-700">
                  {title.duration}
                </Badge>
              </div>

              {/* Title & Description */}
              <div className="p-3.5 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">
                      {title.title}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">({title.year})</span>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {title.description}
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="glow"
                  onClick={() => handleLaunchFeatured(title)}
                  className="w-full mt-3 h-8 text-xs font-semibold shadow-indigo-500/10"
                >
                  <Play className="h-3.5 w-3.5 mr-1.5 fill-current" />
                  Watch Together
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Feature Highlights Grid */}
      <section className="relative z-10 container max-w-6xl px-4 py-8 mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-md hover:border-indigo-500/40 transition-colors">
            <CardHeader className="pb-3">
              <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-2 border border-indigo-500/20">
                <Zap className="h-5 w-5" />
              </div>
              <CardTitle className="text-base text-white">Dual Playhead Scrubber</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Signature drift ribbon renders both users’ playheads on one timeline with millisecond gap indicator and convergence ping.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-md hover:border-purple-500/40 transition-colors">
            <CardHeader className="pb-3">
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 mb-2 border border-purple-500/20">
                <Subtitles className="h-5 w-5" />
              </div>
              <CardTitle className="text-base text-white">Custom Subtitle Engine</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Full SRT & WebVTT support with drag & drop upload, custom font styling, and 100ms timing offset hotkeys ([ and ]).
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-md hover:border-pink-500/40 transition-colors">
            <CardHeader className="pb-3">
              <div className="h-10 w-10 rounded-lg bg-pink-500/10 flex items-center justify-center text-pink-400 mb-2 border border-pink-500/20">
                <Radio className="h-5 w-5" />
              </div>
              <CardTitle className="text-base text-white">Voice Chat & Ducking</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                P2P WebRTC audio mesh automatically ducks media audio down to 25% when your partner speaks, restoring volume smoothly.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-md hover:border-emerald-500/40 transition-colors">
            <CardHeader className="pb-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-2 border border-emerald-500/20">
                <FolderOpen className="h-5 w-5" />
              </div>
              <CardTitle className="text-base text-white">Local File Co-Watching</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Pick a video from your disk and co-watch seamlessly across peers via HTML5 blob URLs without uploading video files.
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
            <span>P2P WebRTC Voice</span>
          </div>
        </div>
      </footer>

      {/* Create Room Modal */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Sparkles className="h-5 w-5 text-indigo-400" />
              Create a Watch Party Room
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Configure your room title, starting video URL, and host playback permissions.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                Room Name
              </label>
              <Input
                value={roomTitle}
                onChange={(e) => setRoomTitle(e.target.value)}
                placeholder="e.g. Movie Night, Anime Club"
                className="bg-slate-950 border-slate-700 text-sm text-white"
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                Video URL (YouTube or direct MP4/HLS)
              </label>
              <Input
                value={mediaUrl}
                onChange={(e) => {
                  const url = e.target.value;
                  setMediaUrl(url);
                  if (url.includes("youtube.com") || url.includes("youtu.be")) {
                    setMediaType("YOUTUBE");
                  } else {
                    setMediaType("MP4");
                  }
                }}
                placeholder="https://..."
                className="bg-slate-950 border-slate-700 text-sm text-white"
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                Playback Permissions
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={permissionMode === "SHARED" ? "glow" : "outline"}
                  size="sm"
                  onClick={() => setPermissionMode("SHARED")}
                  className="text-xs"
                >
                  Shared (Anyone)
                </Button>
                <Button
                  type="button"
                  variant={permissionMode === "HOST_ONLY" ? "glow" : "outline"}
                  size="sm"
                  onClick={() => setPermissionMode("HOST_ONLY")}
                  className="text-xs"
                >
                  Host Only
                </Button>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="submit"
                variant="glow"
                disabled={isCreating}
                className="w-full text-xs font-semibold"
              >
                {isCreating ? "Creating Room..." : "Launch Watch Party"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
