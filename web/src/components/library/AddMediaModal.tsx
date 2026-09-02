"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Upload, Subtitles, Film, Check } from "lucide-react";
import { LibraryTitle, LibraryEpisode } from "./types";

interface AddMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveTitle: (title: LibraryTitle, episode?: LibraryEpisode) => void;
  initialSeriesName?: string;
  initialImdbId?: string;
}

export function AddMediaModal({
  isOpen,
  onClose,
  onSaveTitle,
  initialSeriesName = "",
  initialImdbId = "",
}: AddMediaModalProps) {
  const [seriesName, setSeriesName] = useState(initialSeriesName);
  const [videoUrl, setVideoUrl] = useState("");
  const [imdbId, setImdbId] = useState(initialImdbId);
  const [seasonNumber, setSeasonNumber] = useState<number>(1);
  const [episodeNumber, setEpisodeNumber] = useState<number>(1);
  const [isMovie, setIsMovie] = useState(false);
  const [subtitleUrl, setSubtitleUrl] = useState("");
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [autoOpenSubs, setAutoOpenSubs] = useState(true);

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [statusText, setStatusText] = useState("");

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (initialSeriesName) setSeriesName(initialSeriesName);
    if (initialImdbId) setImdbId(initialImdbId);
  }, [initialSeriesName, initialImdbId]);

  // Autocomplete query
  const handleNameChange = (val: string) => {
    setSeriesName(val);
    if (val.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/imdb-search?q=${encodeURIComponent(val.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.results || []);
          setShowSuggestions(true);
        }
      } catch {}
    }, 250);
  };

  const handlePickSuggestion = async (hit: any) => {
    setSeriesName(hit.title);
    setIsMovie(!hit.isSeries);
    setShowSuggestions(false);

    let resolvedId = hit.id;
    if (!resolvedId && hit.tmdbId && hit.mediaType) {
      try {
        const res = await fetch(
          `/api/imdb-search?resolve=1&tmdbId=${hit.tmdbId}&mediaType=${hit.mediaType}`
        );
        if (res.ok) {
          const data = await res.json();
          resolvedId = data.id;
        }
      } catch {}
    }
    if (resolvedId) setImdbId(resolvedId);
  };

  const handleAnalyzeAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setAnalyzing(true);
    setStatusText("Analyzing metadata with Gemini / Grok / OpenRouter...");

    try {
      // 1. Resolve metadata via /api/identify
      let meta: any = {};
      try {
        const res = await fetch("/api/identify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            series: seriesName.trim(),
            url: videoUrl.trim(),
            imdbId: imdbId.trim(),
          }),
        });
        if (res.ok) {
          meta = await res.json();
        }
      } catch (err) {
        console.warn("Identification API warning:", err);
      }

      // 2. Fetch or prepare Subtitle
      let subText = "";
      let subFileName = "";
      if (subtitleFile) {
        subText = await subtitleFile.text();
        subFileName = subtitleFile.name;
      } else if (subtitleUrl.trim()) {
        setStatusText("Fetching remote subtitle...");
        try {
          const res = await fetch("/api/subtitle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: subtitleUrl.trim() }),
          });
          if (res.ok) {
            const data = await res.json();
            subText = data.text;
            subFileName = subtitleUrl.split("/").pop() || "subtitle.srt";
          }
        } catch {}
      } else if (autoOpenSubs && (imdbId || meta.seriesImdbId)) {
        // Auto fetch from OpenSubtitles if requested
        setStatusText("Searching OpenSubtitles API...");
        try {
          const targetId = imdbId || meta.seriesImdbId;
          const res = await fetch("/api/opensubs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imdbId: targetId,
              movie: isMovie,
              seasonNumber: seasonNumber,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.files && data.files.length > 0) {
              const matched =
                data.files.find(
                  (f: any) => f.season === seasonNumber && f.episode === episodeNumber
                ) || data.files[0];
              subText = matched.text;
              subFileName = matched.fileName;
            }
          }
        } catch {}
      }

      // 3. Assemble Title & Episode
      const resolvedTitleName = meta.series || seriesName.trim() || "Untitled";
      const resolvedCode = isMovie
        ? "Movie"
        : `S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}`;

      const episode: LibraryEpisode = {
        id: `ep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: isMovie
          ? resolvedTitleName
          : `${resolvedCode} · ${meta.episodeTitle || `Episode ${episodeNumber}`}`,
        url: videoUrl.trim(),
        seasonNumber: isMovie ? null : seasonNumber,
        episodeNumber: isMovie ? null : episodeNumber,
        episodeCode: resolvedCode,
        episodeImdbId: meta.episodeImdbId || null,
        episodeSummary: meta.episodeSummary || "",
        subtitleUrl: subtitleUrl.trim() || undefined,
        subtitleFileName: subFileName || undefined,
        subtitleText: subText || undefined,
      };

      const title: LibraryTitle = {
        id: `title_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: resolvedTitleName,
        mediaType: isMovie ? "movie" : "series",
        year: meta.seriesYear || null,
        imdbId: meta.seriesImdbId || imdbId || null,
        imdbUrl: meta.seriesImdbUrl || (imdbId ? `https://www.imdb.com/title/${imdbId}/` : null),
        imdbRating: meta.seriesImdbRating || null,
        summary: meta.seriesSummary || "",
        genres: meta.seriesGenres || [],
        episodes: [episode],
        updatedAt: Date.now(),
      };

      onSaveTitle(title, episode);
      onClose();
    } catch (err: any) {
      alert("Failed to analyze media: " + err.message);
    } finally {
      setAnalyzing(false);
      setStatusText("");
    }
  };

  const handleSaveTitleOnly = () => {
    if (!seriesName.trim()) return;
    const resolvedCode = isMovie
      ? "Movie"
      : `S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}`;

    const title: LibraryTitle = {
      id: `title_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: seriesName.trim(),
      mediaType: isMovie ? "movie" : "series",
      imdbId: imdbId || null,
      imdbUrl: imdbId ? `https://www.imdb.com/title/${imdbId}/` : null,
      summary: "",
      genres: [],
      episodes: videoUrl.trim()
        ? [
            {
              id: `ep_${Date.now()}`,
              title: isMovie ? seriesName.trim() : `${resolvedCode} · Episode ${episodeNumber}`,
              url: videoUrl.trim(),
              seasonNumber: isMovie ? null : seasonNumber,
              episodeNumber: isMovie ? null : episodeNumber,
              episodeCode: resolvedCode,
              subtitleUrl: subtitleUrl.trim() || undefined,
            },
          ]
        : [],
      updatedAt: Date.now(),
    };

    onSaveTitle(title);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg bg-slate-900 border-slate-800 text-white p-6 max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Sparkles className="h-5 w-5 text-indigo-400" />
            Add Video to Library
          </DialogTitle>
          <DialogDescription className="text-slate-400 text-xs">
            Analyze video streams with multi-LLM metadata extraction and auto-fetch subtitles.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleAnalyzeAndSave} className="space-y-4 py-2">
          {/* Series Name with Live Autocomplete */}
          <div className="relative">
            <label className="text-xs font-medium text-slate-300 mb-1 block">
              Title / Series Name
            </label>
            <Input
              value={seriesName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Frieren: Beyond Journey's End, Dune, Severance"
              className="bg-slate-950 border-slate-700 text-white text-sm"
              required
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden max-h-48 overflow-y-auto">
                {suggestions.map((s) => (
                  <button
                    key={s.id || s.tmdbId}
                    type="button"
                    onClick={() => handlePickSuggestion(s)}
                    className="w-full px-3 py-2 text-left hover:bg-slate-800/70 flex items-center justify-between text-xs border-b border-slate-800/50 last:border-none"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white truncate max-w-[200px]">
                        {s.title}
                      </span>
                      <span className="text-[10px] text-slate-400">({s.year})</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300">
                      {s.typeLabel}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Video Stream URL */}
          <div>
            <label className="text-xs font-medium text-slate-300 mb-1 block">
              Video Stream URL (MP4, HLS/M3U8, or Archive.org)
            </label>
            <Input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://.../video.mp4"
              className="bg-slate-950 border-slate-700 text-white text-sm font-mono"
              required
            />
          </div>

          {/* Media Type & Season / Episode */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-medium text-slate-300 mb-1 block">Type</label>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={!isMovie ? "glow" : "outline"}
                  onClick={() => setIsMovie(false)}
                  className="w-full text-xs h-9"
                >
                  Series
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={isMovie ? "glow" : "outline"}
                  onClick={() => setIsMovie(true)}
                  className="w-full text-xs h-9"
                >
                  Movie
                </Button>
              </div>
            </div>

            {!isMovie && (
              <>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Season</label>
                  <Input
                    type="number"
                    min={1}
                    value={seasonNumber}
                    onChange={(e) => setSeasonNumber(Number(e.target.value) || 1)}
                    className="bg-slate-950 border-slate-700 text-white text-sm h-9 text-center"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Episode</label>
                  <Input
                    type="number"
                    min={1}
                    value={episodeNumber}
                    onChange={(e) => setEpisodeNumber(Number(e.target.value) || 1)}
                    className="bg-slate-950 border-slate-700 text-white text-sm h-9 text-center"
                  />
                </div>
              </>
            )}
          </div>

          {/* Subtitles: File or Remote URL */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <label className="text-xs font-medium text-slate-300 block flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Subtitles className="h-3.5 w-3.5 text-indigo-400" />
                Subtitles (.srt, .vtt, .ass)
              </span>
              <label className="flex items-center gap-1 text-[11px] text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoOpenSubs}
                  onChange={(e) => setAutoOpenSubs(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                />
                Auto OpenSubtitles
              </label>
            </label>

            <div className="flex gap-2">
              <Input
                value={subtitleUrl}
                onChange={(e) => setSubtitleUrl(e.target.value)}
                placeholder="Optional subtitle URL (https://.../sub.srt)"
                className="bg-slate-950 border-slate-700 text-xs font-mono text-white flex-1"
              />
              <label className="cursor-pointer flex items-center justify-center px-3 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 border border-slate-700">
                <Upload className="h-3.5 w-3.5 mr-1" />
                {subtitleFile ? subtitleFile.name.slice(0, 10) + "..." : "Upload"}
                <input
                  type="file"
                  accept=".srt,.vtt,.ass,.ssa"
                  onChange={(e) => setSubtitleFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <DialogFooter className="pt-4 flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveTitleOnly}
              className="w-full sm:w-1/2 text-xs border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-300 h-10"
            >
              Save Title, Add Link Later
            </Button>
            <Button
              type="submit"
              variant="glow"
              disabled={analyzing}
              className="w-full sm:w-1/2 text-xs font-semibold h-10 shadow-indigo-500/20"
            >
              {analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {statusText || "Analyzing..."}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Analyze & Add to Library
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
