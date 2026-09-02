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
  ExternalLink,
} from "lucide-react";
import { formatTime } from "@/lib/utils";

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

    // Also add to shelf so peers know what file is being watched
    onAddToQueue({
      title: file.name,
      url: `local://${file.name}`,
      mediaType: "LOCAL_FILE",
    });

    e.target.value = "";
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
              Add YouTube links, MP4 video streams, or open a local movie file to watch together.
            </span>
          </div>
        ) : (
          queue.map((item, idx) => {
            const isPlayingThis = currentMediaUrl === item.url;
            return (
              <div
                key={item.id || `item_${idx}`}
                className={`group flex items-center gap-2 p-2 rounded-lg border transition-all ${
                  isPlayingThis
                    ? "bg-indigo-950/40 border-indigo-500/50"
                    : "bg-slate-900/60 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700"
                }`}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-800 text-slate-300 flex-none font-mono text-xs">
                  {isPlayingThis ? (
                    <Play className="h-3.5 w-3.5 fill-indigo-400 text-indigo-400" />
                  ) : (
                    idx + 1
                  )}
                </div>

                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-slate-200 truncate block">
                      {item.title}
                    </span>
                    {isPlayingThis && (
                      <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/40 text-[9px] py-0 px-1">
                        Now Playing
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                    <span className="uppercase font-mono">{item.mediaType}</span>
                    {item.addedByName && <span>• by {item.addedByName}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-none opacity-90 group-hover:opacity-100">
                  {canControl && !isPlayingThis && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onSwitchMedia(item.url, item.mediaType, item.title)}
                      className="h-7 w-7 text-slate-300 hover:text-white hover:bg-indigo-600/30"
                      title="Play this item"
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {canControl && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onRemoveFromQueue(item.id)}
                      className="h-7 w-7 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
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
    </div>
  );
}
