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
  Search,
  Plus,
  Star,
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
import { CatalogueModal } from "@/components/library/CatalogueModal";
import { AddMediaModal } from "@/components/library/AddMediaModal";
import { LibraryDetailModal } from "@/components/library/LibraryDetailModal";
import { LibraryTitle, LibraryEpisode } from "@/components/library/types";

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
  const [myLibrary, setMyLibrary] = useState<LibraryTitle[]>([]);

  // Modals state
  const [isCatalogueOpen, setIsCatalogueOpen] = useState(false);
  const [isAddMediaOpen, setIsAddMediaOpen] = useState(false);
  const [selectedCatalogTitle, setSelectedCatalogTitle] = useState<Partial<LibraryTitle> | null>(null);
  const [selectedDetailTitle, setSelectedDetailTitle] = useState<LibraryTitle | null>(null);

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

      const storedLib = localStorage.getItem("wtLibraryV1");
      if (storedLib) {
        setMyLibrary(JSON.parse(storedLib));
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

  const handleSelectCatalogTitle = (title: Partial<LibraryTitle>) => {
    setSelectedCatalogTitle(title);
    setIsAddMediaOpen(true);
  };

  const handleSaveMediaTitle = (title: LibraryTitle) => {
    const updated = [...myLibrary.filter((t) => t.id !== title.id && t.name !== title.name), title];
    setMyLibrary(updated);
    try {
      localStorage.setItem("wtLibraryV1", JSON.stringify(updated));
    } catch {}
  };

  const handlePlayLibraryEpisode = async (episode: LibraryEpisode, title: LibraryTitle) => {
    const isYouTube = episode.url.includes("youtube.com") || episode.url.includes("youtu.be");
    try {
      const room = await createRoom({
        name: `${title.name} · ${episode.title}`,
        mediaUrl: episode.url,
        mediaType: isYouTube ? "YOUTUBE" : "MP4",
        permissionMode: "SHARED",
      });
      router.push(`/room/${room.roomCode}`);
    } catch {
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

          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCatalogueOpen(true)}
              className="gap-1.5 text-xs border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-200"
            >
              <Search className="h-3.5 w-3.5 text-indigo-400" />
              <span>Browse Catalogue</span>
            </Button>
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
          Synchronize YouTube, HLS, and local videos with dual-playhead precision. Enjoy P2P voice chat with audio ducking, custom subtitles, anime catalogue search, and zero-wall guest links.
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

      {/* My Media Library Section (if items exist) */}
      {myLibrary.length > 0 && (
        <section className="relative z-10 container max-w-6xl px-4 py-6 mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Film className="h-4 w-4 text-indigo-400" />
              My Media Library ({myLibrary.length})
            </h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsCatalogueOpen(true)}
              className="h-7 text-xs text-indigo-400 hover:text-indigo-300 gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Add Title
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {myLibrary.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedDetailTitle(item)}
                className="group cursor-pointer rounded-xl overflow-hidden bg-slate-900 border border-slate-800 hover:border-indigo-500/50 transition-all flex flex-col justify-between shadow-lg"
              >
                <div className="relative aspect-[2/3] w-full overflow-hidden bg-slate-950">
                  {item.posterUrl ? (
                    <img
                      src={item.posterUrl}
                      alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-700">
                      <Film className="h-8 w-8" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent opacity-80" />
                  {item.imdbRating && (
                    <Badge className="absolute top-2 right-2 bg-slate-950/80 text-amber-300 text-[10px] font-mono border border-slate-700 gap-1">
                      <Star className="h-2.5 w-2.5 fill-current" />
                      {item.imdbRating.toFixed(1)}
                    </Badge>
                  )}
                </div>
                <div className="p-2.5">
                  <h3 className="text-xs font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">
                    {item.name}
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {item.mediaType === "movie" ? "Movie" : `${item.episodes?.length || 0} episodes`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

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
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white truncate">{item.title}</p>
                      <span className="text-[11px] text-slate-400 font-mono mt-0.5 block">
                        {formatTime(item.time)} / {formatTime(item.duration)}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="glow"
                      onClick={() => {
                        setMediaUrl(item.url);
                        setRoomTitle(item.title);
                        setIsCreateOpen(true);
                      }}
                      className="h-7 px-2 text-[11px] gap-1 shadow-indigo-500/20 shrink-0"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Resume</span>
                    </Button>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-3">
                    <div
                      className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Saved / Recent Rooms Row (if any) */}
      {savedRooms.length > 0 && (
        <section className="relative z-10 container max-w-6xl px-4 py-4 mx-auto">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2 mb-3">
            <Radio className="h-4 w-4 text-indigo-400" />
            Recent Rooms
          </h2>
          <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none">
            {savedRooms.map((r) => (
              <Button
                key={r.code}
                variant="outline"
                size="sm"
                onClick={() => router.push(`/room/${r.code}`)}
                className="h-10 px-3.5 border-slate-800 bg-slate-900/50 hover:bg-slate-800 text-slate-200 flex items-center gap-2 rounded-xl shrink-0"
              >
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-semibold text-white">{r.name}</span>
                <span className="font-mono text-[10px] text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                  {r.code}
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

          <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-md hover:border-indigo-500/40 transition-colors">
            <CardHeader className="pb-3">
              <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-2 border border-indigo-500/20">
                <Radio className="h-5 w-5" />
              </div>
              <CardTitle className="text-base text-white">P2P Voice & Ducking</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                WebRTC audio chat with automatic ducking drops video volume to 28% when your partner speaks.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-md hover:border-indigo-500/40 transition-colors">
            <CardHeader className="pb-3">
              <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-2 border border-indigo-500/20">
                <Subtitles className="h-5 w-5" />
              </div>
              <CardTitle className="text-base text-white">Subtitles & OpenSubs</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Render SRT, VTT, and ASS subtitles with custom sizing, background opacity, and keyboard nudging ([ / ]).
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-md hover:border-indigo-500/40 transition-colors">
            <CardHeader className="pb-3">
              <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-2 border border-indigo-500/20">
                <Search className="h-5 w-5" />
              </div>
              <CardTitle className="text-base text-white">Anime & Media Catalogue</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Browse movies and anime via TMDB & MyAnimeList with AI metadata extraction powered by Gemini & Grok.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 w-full border-t border-slate-800/60 py-6 text-center text-xs text-slate-500">
        <div className="container max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© 2026 Watch2Gether. Zero ads, zero latency, pure co-watching.</p>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Render Backend</span>
            <span>•</span>
            <span>Vercel Edge Frontend</span>
            <span>•</span>
            <span>PostgreSQL & Redis</span>
          </div>
        </div>
      </footer>

      {/* Create Room Modal */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-400" />
              Create Watch Party
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              Set up your room title, default video stream, and playback controls.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-slate-300 mb-1 block">Room Title</label>
              <Input
                value={roomTitle}
                onChange={(e) => setRoomTitle(e.target.value)}
                placeholder="e.g. Friday Night Movie"
                className="bg-slate-950 border-slate-700 text-white text-sm"
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 mb-1 block">Video Stream URL</label>
              <Input
                value={mediaUrl}
                onChange={(e) => {
                  const val = e.target.value;
                  setMediaUrl(val);
                  if (val.includes("youtube.com") || val.includes("youtu.be")) {
                    setMediaType("YOUTUBE");
                  } else if (val.endsWith(".m3u8")) {
                    setMediaType("HLS");
                  } else {
                    setMediaType("MP4");
                  }
                }}
                placeholder="https://.../video.mp4"
                className="bg-slate-950 border-slate-700 text-white text-sm font-mono"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 mb-1 block">Media Format</label>
                <div className="flex gap-1">
                  {(["MP4", "YOUTUBE", "HLS"] as MediaType[]).map((type) => (
                    <Button
                      key={type}
                      type="button"
                      size="sm"
                      variant={mediaType === type ? "glow" : "outline"}
                      onClick={() => setMediaType(type)}
                      className="text-xs h-8 px-2 flex-1 font-mono"
                    >
                      {type}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 mb-1 block">Control Access</label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={permissionMode === "SHARED" ? "glow" : "outline"}
                    onClick={() => setPermissionMode("SHARED")}
                    className="text-xs h-8 px-2 flex-1"
                  >
                    Anyone
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={permissionMode === "HOST_ONLY" ? "glow" : "outline"}
                    onClick={() => setPermissionMode("HOST_ONLY")}
                    className="text-xs h-8 px-2 flex-1"
                  >
                    Host Only
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="submit"
                variant="glow"
                disabled={isCreating}
                className="w-full text-xs font-semibold h-10 shadow-indigo-500/20"
              >
                {isCreating ? "Creating Room..." : "Launch Room"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Global Catalogue Search Modal */}
      <CatalogueModal
        isOpen={isCatalogueOpen}
        onClose={() => setIsCatalogueOpen(false)}
        onSelectTitle={handleSelectCatalogTitle}
        existingLibrary={myLibrary}
      />

      {/* Add Media / Analyze Modal */}
      <AddMediaModal
        isOpen={isAddMediaOpen}
        onClose={() => {
          setIsAddMediaOpen(false);
          setSelectedCatalogTitle(null);
        }}
        onSaveTitle={handleSaveMediaTitle}
        initialSeriesName={selectedCatalogTitle?.name || ""}
        initialImdbId={selectedCatalogTitle?.imdbId || ""}
      />

      {/* Library Detail Modal */}
      <LibraryDetailModal
        isOpen={!!selectedDetailTitle}
        onClose={() => setSelectedDetailTitle(null)}
        title={selectedDetailTitle}
        onPlayEpisode={(ep) => selectedDetailTitle && handlePlayLibraryEpisode(ep, selectedDetailTitle)}
      />
    </main>
  );
}
