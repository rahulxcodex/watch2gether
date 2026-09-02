"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Film, Tv, Check, Plus, Loader2 } from "lucide-react";
import { LibraryTitle } from "./types";

interface CatalogueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTitle: (title: Partial<LibraryTitle>) => void;
  existingLibrary?: LibraryTitle[];
}

export function CatalogueModal({
  isOpen,
  onClose,
  onSelectTitle,
  existingLibrary = [],
}: CatalogueModalProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "movie" | "tv">("all");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/imdb-search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
        }
      } catch (err) {
        console.warn("Search error:", err);
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const filteredResults = results.filter((r) => {
    if (filter === "all") return true;
    const isMovie = r.typeLabel === "Movie" || r.mediaType === "movie";
    return filter === "movie" ? isMovie : !isMovie;
  });

  const isAlreadyInLibrary = (r: any) => {
    return existingLibrary.some(
      (item) =>
        (item.imdbId && r.id && item.imdbId.toLowerCase() === String(r.id).toLowerCase()) ||
        item.name.toLowerCase() === r.title.toLowerCase()
    );
  };

  const handlePick = async (hit: any) => {
    let imdbId = hit.id && /^tt\d{7,10}$/i.test(hit.id) ? hit.id : null;
    if (!imdbId && hit.tmdbId && hit.mediaType) {
      try {
        const res = await fetch(
          `/api/imdb-search?resolve=1&tmdbId=${hit.tmdbId}&mediaType=${hit.mediaType}`
        );
        if (res.ok) {
          const resolved = await res.json();
          imdbId = resolved.id || null;
        }
      } catch {}
    }

    onSelectTitle({
      name: hit.title,
      mediaType: hit.isSeries ? "series" : "movie",
      year: hit.year,
      imdbId,
      imdbUrl: imdbId ? `https://www.imdb.com/title/${imdbId}/` : null,
      posterUrl: hit.poster,
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl bg-slate-900 border-slate-800 text-white max-h-[85vh] flex flex-col p-6">
        <DialogHeader className="pb-3 border-b border-slate-800">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Search className="h-5 w-5 text-indigo-400" />
            Media & Anime Catalogue
          </DialogTitle>
          <DialogDescription className="text-slate-400 text-xs">
            Search movies, series, or anime via TMDB & IMDb. Adding creates the title with artwork and details.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 pt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title (e.g. Inception, Demon Slayer, Interstellar)..."
              className="pl-9 bg-slate-950 border-slate-700 text-white text-sm"
              autoFocus
            />
          </div>
          <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <Button
              size="sm"
              variant={filter === "all" ? "glow" : "ghost"}
              onClick={() => setFilter("all")}
              className="h-8 px-2.5 text-xs"
            >
              All
            </Button>
            <Button
              size="sm"
              variant={filter === "movie" ? "glow" : "ghost"}
              onClick={() => setFilter("movie")}
              className="h-8 px-2.5 text-xs gap-1"
            >
              <Film className="h-3 w-3" /> Movies
            </Button>
            <Button
              size="sm"
              variant={filter === "tv" ? "glow" : "ghost"}
              onClick={() => setFilter("tv")}
              className="h-8 px-2.5 text-xs gap-1"
            >
              <Tv className="h-3 w-3" /> Series
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-[250px] py-4">
          {loading && (
            <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
              <span>Searching titles...</span>
            </div>
          )}

          {!loading && query.length >= 2 && filteredResults.length === 0 && (
            <div className="text-center py-12 text-slate-500 text-xs">
              No matching titles found. Try a shorter title or different keywords.
            </div>
          )}

          {!loading && query.length < 2 && (
            <div className="text-center py-12 text-slate-500 text-xs">
              Type at least 2 characters to search the global title catalogue.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredResults.map((hit) => {
              const inLib = isAlreadyInLibrary(hit);
              return (
                <div
                  key={hit.id || hit.tmdbId}
                  className="flex gap-3 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-all items-center justify-between"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-12 h-16 rounded-md bg-slate-800 overflow-hidden shrink-0 border border-slate-700/50">
                      {hit.poster ? (
                        <img
                          src={hit.poster}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600">
                          <Film className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-semibold text-white truncate max-w-[150px]">
                        {hit.title}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge
                          variant="secondary"
                          className="text-[9px] py-0 px-1 bg-slate-800 text-slate-300 border-none"
                        >
                          {hit.typeLabel || (hit.isSeries ? "Series" : "Movie")}
                        </Badge>
                        {hit.year && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            {hit.year}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant={inLib ? "outline" : "glow"}
                    onClick={() => handlePick(hit)}
                    className="h-8 px-2.5 text-xs shrink-0"
                  >
                    {inLib ? (
                      <>
                        <Check className="h-3.5 w-3.5 mr-1 text-emerald-400" />
                        In Library
                      </>
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add Title
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
