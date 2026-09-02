"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Play,
  Share2,
  Plus,
  Star,
  Film,
  Tv,
  Edit2,
  Trash2,
  DownloadCloud,
  Check,
} from "lucide-react";
import { LibraryTitle, LibraryEpisode } from "./types";

interface LibraryDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: LibraryTitle | null;
  onPlayEpisode: (episode: LibraryEpisode) => void;
  onShareToRoom?: (title: LibraryTitle) => void;
  onAddEpisode?: (title: LibraryTitle) => void;
  onUpdateTitle?: (updated: LibraryTitle) => void;
  onDeleteTitle?: (titleId: string) => void;
}

export function LibraryDetailModal({
  isOpen,
  onClose,
  title,
  onPlayEpisode,
  onShareToRoom,
  onAddEpisode,
  onUpdateTitle,
  onDeleteTitle,
}: LibraryDetailModalProps) {
  const [activeSeason, setActiveSeason] = useState<string>("1");

  // Title Editor state
  const [isEditTitleOpen, setIsEditTitleOpen] = useState(false);
  const [editTitleName, setEditTitleName] = useState("");
  const [editTitleType, setEditTitleType] = useState<"movie" | "series">("series");

  // Episode Editor state
  const [isEditEpisodeOpen, setIsEditEpisodeOpen] = useState(false);
  const [editingEpisode, setEditingEpisode] = useState<LibraryEpisode | null>(null);
  const [editEpTitle, setEditEpTitle] = useState("");
  const [editEpSeason, setEditEpSeason] = useState(1);
  const [editEpNumber, setEditEpNumber] = useState(1);
  const [editRedownloadSubs, setEditRedownloadSubs] = useState(false);
  const [isRedownloading, setIsRedownloading] = useState(false);

  if (!title) return null;

  const isMovie = title.mediaType === "movie";

  // Group episodes by season
  const episodesBySeason: Record<number, LibraryEpisode[]> = {};
  if (!isMovie) {
    for (const ep of title.episodes) {
      const s = ep.seasonNumber || 1;
      if (!episodesBySeason[s]) episodesBySeason[s] = [];
      episodesBySeason[s].push(ep);
    }
  }

  const seasonNumbers = Object.keys(episodesBySeason)
    .map(Number)
    .sort((a, b) => a - b);

  const handleOpenEditTitle = () => {
    setEditTitleName(title.name);
    setEditTitleType(title.mediaType);
    setIsEditTitleOpen(true);
  };

  const handleSaveTitleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitleName.trim()) return;

    const updated: LibraryTitle = {
      ...title,
      name: editTitleName.trim(),
      mediaType: editTitleType,
    };
    onUpdateTitle?.(updated);
    setIsEditTitleOpen(false);
  };

  const handleOpenEditEpisode = (ep: LibraryEpisode) => {
    setEditingEpisode(ep);
    setEditEpTitle(ep.title || "");
    setEditEpSeason(ep.seasonNumber || 1);
    setEditEpNumber(ep.episodeNumber || 1);
    setEditRedownloadSubs(false);
    setIsEditEpisodeOpen(true);
  };

  const handleSaveEpisodeEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEpisode) return;

    let finalSubtitleUrl = editingEpisode.subtitleUrl;

    if (editRedownloadSubs && title.imdbId) {
      setIsRedownloading(true);
      try {
        const subRes = await fetch(
          `/api/opensubs?imdbId=${encodeURIComponent(title.imdbId)}&season=${editEpSeason}&episode=${editEpNumber}`
        );
        if (subRes.ok) {
          const subData = await subRes.json();
          if (subData.subtitles?.[0]?.url) {
            finalSubtitleUrl = subData.subtitles[0].url;
          }
        }
      } catch (err) {
        console.warn("Subtitle redownload failed:", err);
      } finally {
        setIsRedownloading(false);
      }
    }

    const updatedEpisodes = title.episodes.map((ep) => {
      if (ep.id === editingEpisode.id) {
        return {
          ...ep,
          title: editEpTitle.trim() || `Episode ${editEpNumber}`,
          seasonNumber: editEpSeason,
          episodeNumber: editEpNumber,
          episodeCode: `S${String(editEpSeason).padStart(2, "0")}E${String(editEpNumber).padStart(2, "0")}`,
          subtitleUrl: finalSubtitleUrl,
        };
      }
      return ep;
    });

    const updatedTitle: LibraryTitle = {
      ...title,
      episodes: updatedEpisodes,
    };

    onUpdateTitle?.(updatedTitle);
    setIsEditEpisodeOpen(false);
  };

  const handleDeleteEpisode = (epId: string) => {
    if (!confirm("Are you sure you want to delete this episode?")) return;
    const updatedEpisodes = title.episodes.filter((e) => e.id !== epId);
    onUpdateTitle?.({ ...title, episodes: updatedEpisodes });
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-2xl bg-slate-900 border-slate-800 text-white p-0 overflow-hidden max-h-[85vh] flex flex-col">
          {/* Hero Backdrop Banner */}
          <div className="relative aspect-video max-h-60 w-full bg-slate-950 overflow-hidden shrink-0">
            {title.backdropUrl || title.posterUrl ? (
              <img
                src={title.backdropUrl || title.posterUrl!}
                alt=""
                className="w-full h-full object-cover opacity-60"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-slate-950 text-slate-700">
                <Film className="h-16 w-16" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent" />

            <div className="absolute bottom-4 left-6 right-6 flex items-end justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="text-[10px] font-bold uppercase">
                    {title.mediaType === "movie" ? "Movie" : "TV Series"}
                  </Badge>
                  {title.year && (
                    <span className="text-xs text-slate-300 font-mono">
                      {title.year}
                    </span>
                  )}
                  {title.imdbRating && (
                    <span className="text-xs text-amber-400 font-mono flex items-center gap-0.5">
                      <Star className="h-3 w-3 fill-current" />
                      {title.imdbRating}
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-black text-white tracking-tight leading-none drop-shadow-md">
                  {title.name}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleOpenEditTitle}
                  className="h-8 px-2 text-xs text-slate-300 hover:text-white"
                  title="Edit Title Name or Type"
                >
                  <Edit2 className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
                {onDeleteTitle && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Remove "${title.name}" from your library?`)) {
                        onDeleteTitle(title.id);
                        onClose();
                      }
                    }}
                    className="h-8 px-2 text-xs text-red-400 hover:bg-red-500/10"
                    title="Delete Title"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
                {onShareToRoom && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onShareToRoom(title)}
                    className="h-8 px-2.5 text-xs border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-slate-200 gap-1.5"
                  >
                    <Share2 className="h-3.5 w-3.5 text-indigo-400" />
                    <span>Share to Room</span>
                  </Button>
                )}
                {isMovie && title.episodes[0] && (
                  <Button
                    size="sm"
                    variant="glow"
                    onClick={() => {
                      onPlayEpisode(title.episodes[0]);
                      onClose();
                    }}
                    className="h-8 px-3 text-xs font-semibold gap-1.5 shadow-indigo-500/30"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>Play Movie</span>
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Overview & Episodes List */}
          <div className="p-6 flex-1 overflow-y-auto space-y-4">
            {title.summary && (
              <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
                {title.summary}
              </p>
            )}

            {!isMovie && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
                    <Tv className="h-4 w-4 text-indigo-400" />
                    Seasons & Episodes
                  </h3>
                  {onAddEpisode && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onAddEpisode(title)}
                      className="h-7 text-xs text-indigo-400 hover:text-indigo-300 gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Episode
                    </Button>
                  )}
                </div>

                {seasonNumbers.length > 1 && (
                  <Tabs
                    value={activeSeason}
                    onValueChange={setActiveSeason}
                    className="w-full"
                  >
                    <TabsList className="bg-slate-950 border border-slate-800 p-1">
                      {seasonNumbers.map((s) => (
                        <TabsTrigger
                          key={`s_${s}`}
                          value={String(s)}
                          className="text-xs py-1 px-3"
                        >
                          Season {s}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                )}

                <div className="space-y-2">
                  {(episodesBySeason[Number(activeSeason)] || title.episodes).map(
                    (ep) => (
                      <div
                        key={ep.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-all group"
                      >
                        <div className="min-w-0 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-indigo-400">
                              {ep.episodeCode || `E${ep.episodeNumber || 1}`}
                            </span>
                            <span className="text-xs font-medium text-white truncate">
                              {ep.title}
                            </span>
                            {ep.subtitleUrl && (
                              <Badge variant="outline" className="text-[9px] py-0 h-4 border-teal-500/30 text-teal-400">
                                CC
                              </Badge>
                            )}
                          </div>
                          {ep.episodeSummary && (
                            <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                              {ep.episodeSummary}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenEditEpisode(ep)}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-white"
                            title="Edit Episode"
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteEpisode(ep.id)}
                            className="h-7 w-7 p-0 text-red-400 hover:bg-red-500/10"
                            title="Delete Episode"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="glow"
                            onClick={() => {
                              onPlayEpisode(ep);
                              onClose();
                            }}
                            className="h-7 px-2.5 text-xs font-medium gap-1"
                          >
                            <Play className="h-3 w-3 fill-current" />
                            <span>Play</span>
                          </Button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Title Dialog */}
      <Dialog open={isEditTitleOpen} onOpenChange={setIsEditTitleOpen}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-white p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Edit Title Details</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveTitleEdit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-semibold">Title Name</label>
              <Input
                value={editTitleName}
                onChange={(e) => setEditTitleName(e.target.value)}
                className="bg-slate-950 border-slate-800 text-white text-xs h-9"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-semibold">Media Format</label>
              <select
                value={editTitleType}
                onChange={(e) => setEditTitleType(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 text-white text-xs h-9 rounded-md px-3"
              >
                <option value="series">TV Series / Anime</option>
                <option value="movie">Feature Movie</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsEditTitleOpen(false)}
                className="text-xs h-8 text-slate-400"
              >
                Cancel
              </Button>
              <Button type="submit" variant="glow" className="text-xs h-8 font-semibold">
                Save Changes
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Episode Dialog */}
      <Dialog open={isEditEpisodeOpen} onOpenChange={setIsEditEpisodeOpen}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-white p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Edit Episode</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEpisodeEdit} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-semibold">Season #</label>
                <Input
                  type="number"
                  min={1}
                  max={99}
                  value={editEpSeason}
                  onChange={(e) => setEditEpSeason(Number(e.target.value))}
                  className="bg-slate-950 border-slate-800 text-white text-xs h-9"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 font-semibold">Episode #</label>
                <Input
                  type="number"
                  min={1}
                  max={999}
                  value={editEpNumber}
                  onChange={(e) => setEditEpNumber(Number(e.target.value))}
                  className="bg-slate-950 border-slate-800 text-white text-xs h-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 font-semibold">Episode Title</label>
              <Input
                value={editEpTitle}
                onChange={(e) => setEditEpTitle(e.target.value)}
                placeholder="Episode name"
                className="bg-slate-950 border-slate-800 text-white text-xs h-9"
              />
            </div>

            {title.imdbId && (
              <label className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editRedownloadSubs}
                  onChange={(e) => setEditRedownloadSubs(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-indigo-500"
                />
                <span className="flex items-center gap-1.5">
                  <DownloadCloud className="h-3.5 w-3.5 text-teal-400" />
                  Search & download subtitles again (OpenSubtitles)
                </span>
              </label>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsEditEpisodeOpen(false)}
                className="text-xs h-8 text-slate-400"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="glow"
                disabled={isRedownloading}
                className="text-xs h-8 font-semibold"
              >
                {isRedownloading ? "Fetching Subtitles..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
