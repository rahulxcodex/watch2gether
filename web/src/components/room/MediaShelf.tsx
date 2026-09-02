"use client";

import React, { useState, useRef } from "react";
import { QueueItemDTO, MediaType } from "@watch2gether/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ListVideo,
  Plus,
  Play,
  Trash2,
  FolderOpen,
  Film,
  Tv,
  Check,
  Search,
  Sparkles,
} from "lucide-react";
import { CatalogueModal } from "@/components/library/CatalogueModal";
import { AddMediaModal } from "@/components/library/AddMediaModal";
import { LibraryTitle, LibraryEpisode } from "@/components/library/types";

interface MediaShelfProps {
  queue: QueueItemDTO[];
  currentMediaUrl: string;
  canControl: boolean;
  onAddToQueue: (item: Omit<QueueItemDTO, "id" | "createdAt">) => void;
  onRemoveFromQueue: (itemId: string) => void;
  onSwitchMedia: (url: string, mediaType: MediaType, title?: string) => void;
  onSelectLocalFile: (file: File) => void;
}

export function MediaShelf({
  queue,
  currentMediaUrl,
  canControl,
  onAddToQueue,
  onRemoveFromQueue,
  onSwitchMedia,
  onSelectLocalFile,
}: MediaShelfProps) {
  const [urlInput, setUrlInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isCatalogueOpen, setIsCatalogueOpen] = useState(false);
  const [isAddMediaOpen, setIsAddMediaOpen] = useState(false);
  const [selectedCatalogTitle, setSelectedCatalogTitle] = useState<Partial<LibraryTitle> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const url = urlInput.trim();
    if (!url) return;

    const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
    const mediaType: MediaType = isYouTube ? "YOUTUBE" : "MP4";

    let title = titleInput.trim();
    if (!title) {
      if (isYouTube) {
        title = "YouTube Video";
      } else {
        const parts = url.split("/");
        title = parts[parts.length - 1] || "Queued Video";
      }
    }

    onAddToQueue({
      title,
      url,
      mediaType,
    });

    setUrlInput("");
    setTitleInput("");
    setIsAdding(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    onSelectLocalFile(file);

    onAddToQueue({
      title: file.name,
      url: `local://${file.name}`,
      mediaType: "LOCAL_FILE",
    });

    e.target.value = "";
  };

  const handleSelectCatalogTitle = (title: Partial<LibraryTitle>) => {
    setSelectedCatalogTitle(title);
    setIsAddMediaOpen(true);
  };

  const handleSaveMediaTitle = (title: LibraryTitle, episode?: LibraryEpisode) => {
    if (episode && episode.url) {
      const isYouTube = episode.url.includes("youtube.com") || episode.url.includes("youtu.be");
      onAddToQueue({
        title: `${title.name} · ${episode.title}`,
        url: episode.url,
        mediaType: isYouTube ? "YOUTUBE" : "MP4",
      });
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-950/80 text-slate-100">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListVideo className="h-4 w-4 text-indigo-400" />
          <span className="text-xs font-semibold tracking-wide uppercase text-slate-300">
            Room Shelf & Queue ({queue.length})
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsCatalogueOpen(true)}
            className="h-7 px-2 text-xs text-indigo-400 hover:text-indigo-300 gap-1"
            title="Browse Anime & Movie Catalogue"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Catalogue</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsAdding(!isAdding)}
            className="h-7 text-xs border-slate-700 hover:bg-slate-800 gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Video
          </Button>
        </div>
      </div>

      {/* Add Media Drawer */}
      {isAdding && (
        <form onSubmit={handleAddSubmit} className="p-3 bg-slate-900/90 border-b border-slate-800 space-y-2">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Paste video URL (YouTube, MP4, HLS)..."
            className="h-8 text-xs bg-slate-950 border-slate-700"
          />
          <Input
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            placeholder="Optional title (e.g. S01E01 - Pilot)"
            className="h-8 text-xs bg-slate-950 border-slate-700"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="glow" disabled={!urlInput.trim()} className="h-7 text-xs flex-1">
              Add to Queue
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setIsAdding(false);
                setIsAddMediaOpen(true);
              }}
              className="h-7 text-xs border-indigo-500/40 text-indigo-300 gap-1"
            >
              <Sparkles className="h-3 w-3" />
              Analyze
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setIsAdding(false)}
              className="h-7 text-xs border-slate-700"
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Local Video Option Banner */}
      <div className="px-3 py-2 bg-indigo-950/20 border-b border-indigo-900/30 flex items-center justify-between gap-2">
        <div className="text-left">
          <span className="text-xs font-medium text-indigo-200 block">Watch Local File</span>
          <span className="text-[10px] text-indigo-300/70">Playhead syncs without uploading file</span>
        </div>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="video/*"
          className="hidden"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-indigo-500/40 text-indigo-300 hover:bg-indigo-900/40 gap-1.5 flex-none"
          onClick={() => fileInputRef.current?.click()}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Choose File
        </Button>
      </div>

      {/* Queue List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
            <Film className="h-8 w-8 mb-2 opacity-40 text-slate-400" />
            <span className="text-xs font-medium">The Shelf is empty</span>
            <span className="text-[11px] text-slate-600 mt-1 max-w-[200px]">
              Add YouTube links, MP4 video streams, browse the Catalogue, or open a local file.
            </span>
          </div>
        ) : (
          queue.map((item, idx) => {
            const isPlayingThis = currentMediaUrl === item.url;
            return (
              <div
                key={item.id || `q_${idx}`}
                className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                  isPlayingThis
                    ? "bg-indigo-950/40 border-indigo-500/50 shadow-sm shadow-indigo-500/10"
                    : "bg-slate-900/50 border-slate-800/80 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      isPlayingThis
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {item.mediaType === "LOCAL_FILE" ? (
                      <FolderOpen className="h-3.5 w-3.5" />
                    ) : item.mediaType === "YOUTUBE" ? (
                      <Tv className="h-3.5 w-3.5" />
                    ) : (
                      <Film className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white truncate max-w-[160px] sm:max-w-[200px]">
                      {item.title}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge
                        variant="secondary"
                        className="text-[9px] py-0 px-1 font-mono bg-slate-800 text-slate-400 border-none"
                      >
                        {item.mediaType}
                      </Badge>
                      {isPlayingThis && (
                        <span className="text-[9px] text-emerald-400 font-semibold flex items-center gap-0.5">
                          <Check className="h-2.5 w-2.5" /> Now Playing
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {canControl && !isPlayingThis && (
                    <Button
                      size="sm"
                      variant="glow"
                      onClick={() => onSwitchMedia(item.url, item.mediaType, item.title)}
                      className="h-7 px-2 text-[11px] gap-1 shadow-indigo-500/20"
                      title="Switch Room to this Video"
                    >
                      <Play className="h-3 w-3 fill-current" />
                      <span>Play</span>
                    </Button>
                  )}
                  {canControl && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onRemoveFromQueue(item.id)}
                      className="h-7 w-7 p-0 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                      title="Remove from Shelf"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Catalogue Search Modal */}
      <CatalogueModal
        isOpen={isCatalogueOpen}
        onClose={() => setIsCatalogueOpen(false)}
        onSelectTitle={handleSelectCatalogTitle}
      />

      {/* Add / Analyze Media Modal */}
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
    </div>
  );
}
