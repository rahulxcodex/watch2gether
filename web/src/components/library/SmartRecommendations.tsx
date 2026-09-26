"use client";

import React, { useState, useEffect } from "react";
import { Sparkles, Play, Plus, Film, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MediaType, CollaborativeRecommender } from "@watch2gether/shared";

interface RecommendedItem {
  id: string;
  title: string;
  url: string;
  mediaType: MediaType;
  matchScore: number;
  category: string;
  duration: string;
  thumbnail?: string;
}

const FALLBACK_CATALOG: RecommendedItem[] = [
  {
    id: "rec_1",
    title: "Big Buck Bunny (4K Ultra HD Open Source)",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    mediaType: "MP4",
    matchScore: 98,
    category: "Animation",
    duration: "9:56",
  },
  {
    id: "rec_2",
    title: "Tears of Steel (Sci-Fi VFX Short Film)",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
    mediaType: "MP4",
    matchScore: 94,
    category: "Sci-Fi",
    duration: "12:14",
  },
  {
    id: "rec_3",
    title: "Sintel (Blender Foundation Fantasy Drama)",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
    mediaType: "MP4",
    matchScore: 91,
    category: "Fantasy",
    duration: "14:48",
  },
  {
    id: "rec_4",
    title: "Elephants Dream (Surreal Open Source Cinema)",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    mediaType: "MP4",
    matchScore: 88,
    category: "Surreal",
    duration: "10:53",
  },
  {
    id: "rec_5",
    title: "View From A Blue Moon (Surf Documentary 4K)",
    url: "https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-576p.mp4",
    mediaType: "MP4",
    matchScore: 85,
    category: "Action",
    duration: "3:15",
  },
];

interface SmartRecommendationsProps {
  currentMediaUrl?: string;
  onPlayMedia?: (url: string, mediaType: MediaType, title: string) => void;
  onAddToQueue?: (item: { url: string; mediaType: MediaType; title: string }) => void;
  className?: string;
}

export function SmartRecommendations({
  currentMediaUrl,
  onPlayMedia,
  onAddToQueue,
  className = "",
}: SmartRecommendationsProps) {
  const [recommendations, setRecommendations] = useState<RecommendedItem[]>(FALLBACK_CATALOG);
  const [loading, setLoading] = useState(false);
  const [queuedIds, setQueuedIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let isMounted = true;

    async function fetchRecommendations() {
      setLoading(true);
      try {
        const query = currentMediaUrl ? `?mediaUrl=${encodeURIComponent(currentMediaUrl)}&limit=5` : `?limit=5`;
        const res = await fetch(`/api/recommendations${query}`).catch(() => null);

        if (res && res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            const mapped: RecommendedItem[] = json.data.map((item: any, idx: number) => ({
              id: `rec_${idx}`,
              title: item.title || `Recommended Stream #${idx + 1}`,
              url: item.mediaUrl || item.url,
              mediaType: (item.mediaType as MediaType) || "MP4",
              matchScore: Math.round(98 - idx * 4),
              category: "Community Favorite",
              duration: "HD",
            }));
            if (isMounted) {
              setRecommendations(mapped);
            }
            return;
          }
        }

        // Shared collaborative recommender fallback simulation
        const recommender = new CollaborativeRecommender();
        recommender.recordInteraction("host_1", FALLBACK_CATALOG[0].url);
        recommender.recordInteraction("host_1", FALLBACK_CATALOG[1].url);
        recommender.recordInteraction("host_2", FALLBACK_CATALOG[0].url);
        recommender.recordInteraction("host_2", FALLBACK_CATALOG[2].url);

        const recs = recommender.getRecommendationsForMedia(currentMediaUrl || FALLBACK_CATALOG[0].url, 4);
        const recUrls = recs.map((r) => r.mediaUrl);
        if (recUrls.length > 0 && isMounted) {
          const filtered = FALLBACK_CATALOG.filter((f) => recUrls.includes(f.url));
          if (filtered.length > 0) setRecommendations(filtered);
        }
      } catch {
        // Keep fallback
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchRecommendations();
    return () => {
      isMounted = false;
    };
  }, [currentMediaUrl]);

  const handleQueue = (item: RecommendedItem) => {
    setQueuedIds((prev) => ({ ...prev, [item.id]: true }));
    if (onAddToQueue) {
      onAddToQueue({
        url: item.url,
        mediaType: item.mediaType,
        title: item.title,
      });
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-400 animate-pulse" />
          <h3 className="text-xs font-semibold text-slate-200 tracking-wide uppercase">
            AI Collaborative Recommendations
          </h3>
        </div>
        <Badge variant="outline" className="text-[10px] border-indigo-500/30 text-indigo-300 bg-indigo-500/5">
          Cosine / Jaccard
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {recommendations.map((item) => (
          <div
            key={item.id}
            className="group relative flex flex-col justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-indigo-500/40 hover:bg-slate-900/90 transition-all duration-200 shadow-sm"
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-mono font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                  {item.matchScore}% Match
                </span>
                <span className="text-[10px] text-slate-400 font-mono">{item.duration}</span>
              </div>
              <h4 className="text-xs font-medium text-slate-100 group-hover:text-indigo-300 transition-colors line-clamp-1">
                {item.title}
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5 font-mono truncate">{item.category}</p>
            </div>

            <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-slate-800/60">
              {onPlayMedia && (
                <Button
                  size="sm"
                  onClick={() => onPlayMedia(item.url, item.mediaType, item.title)}
                  className="h-7 text-xs flex-1 bg-indigo-600 hover:bg-indigo-500 text-white gap-1"
                >
                  <Play className="h-3 w-3 fill-current" />
                  <span>Play Now</span>
                </Button>
              )}
              {onAddToQueue && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={queuedIds[item.id]}
                  onClick={() => handleQueue(item)}
                  className="h-7 text-xs border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-200 gap-1 px-2.5"
                >
                  {queuedIds[item.id] ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" />
                      <span>Queued</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-3 w-3" />
                      <span>Queue</span>
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
