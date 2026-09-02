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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Play, Share2, Plus, Star, Film, Tv, Clock } from "lucide-react";
import { LibraryTitle, LibraryEpisode } from "./types";

interface LibraryDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: LibraryTitle | null;
  onPlayEpisode: (episode: LibraryEpisode) => void;
  onShareToRoom?: (title: LibraryTitle) => void;
  onAddEpisode?: (title: LibraryTitle) => void;
}

export function LibraryDetailModal({
  isOpen,
  onClose,
  title,
  onPlayEpisode,
  onShareToRoom,
  onAddEpisode,
}: LibraryDetailModalProps) {
  const [activeSeason, setActiveSeason] = useState<string>("1");

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

  return (
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
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge
                  variant="default"
                  className="text-[10px] uppercase font-bold tracking-wider"
                >
                  {isMovie ? "Movie" : "Series"}
                </Badge>
                {title.year && (
                  <span className="text-xs text-slate-300 font-mono">
                    {title.year}
                  </span>
                )}
                {title.imdbRating && (
                  <span className="flex items-center gap-1 text-xs text-amber-400 font-semibold">
                    <Star className="h-3 w-3 fill-current" />
                    {title.imdbRating.toFixed(1)}
                  </span>
                )}
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight text-white drop-shadow-md truncate">
                {title.name}
              </h2>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {onShareToRoom && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onShareToRoom(title)}
                  className="h-9 px-3 text-xs border-slate-700 bg-slate-900/80 hover:bg-slate-800 text-slate-200 gap-1.5"
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
                  className="h-9 px-4 text-xs font-semibold gap-1.5 shadow-indigo-500/30"
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
                        </div>
                        {ep.episodeSummary && (
                          <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                            {ep.episodeSummary}
                          </p>
                        )}
                      </div>

                      <Button
                        size="sm"
                        variant="glow"
                        onClick={() => {
                          onPlayEpisode(ep);
                          onClose();
                        }}
                        className="h-8 px-3 text-xs shrink-0 gap-1.5 shadow-indigo-500/20"
                      >
                        <Play className="h-3 w-3 fill-current" />
                        <span>Watch</span>
                      </Button>
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
