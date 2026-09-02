import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_QUERY = 100;
const MAX_RESULTS = 8;
const TMDB_API_KEY = process.env.TMDB_API_KEY || "";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG_BASE = "https://image.tmdb.org/t/p/w92";

const TYPE_LABELS: Record<string, string> = {
  feature: "Movie",
  tvSeries: "Series",
  tvMiniSeries: "Mini-series",
  tvMovie: "TV movie",
  tvSpecial: "TV special",
  tvEpisode: "Episode",
  short: "Short",
  video: "Video",
  videoGame: "Video game",
};

const ALLOWED_TYPES = new Set([
  "feature",
  "tvSeries",
  "tvMiniSeries",
  "tvMovie",
  "tvSpecial",
  "short",
  "video",
]);

async function tmdbSearch(query: string) {
  const url = `${TMDB_BASE}/search/multi?api_key=${encodeURIComponent(
    TMDB_API_KEY
  )}&query=${encodeURIComponent(query)}&include_adult=false&page=1`;
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`TMDB search HTTP ${r.status}`);
  const j = await r.json();
  const rows = Array.isArray(j?.results) ? j.results : [];
  return rows
    .filter((it: any) => it.media_type === "movie" || it.media_type === "tv")
    .map((it: any) => {
      const isTv = it.media_type === "tv";
      const title = String(it.title || it.name || "").trim();
      const dateStr = String(it.release_date || it.first_air_date || "");
      const year = dateStr ? Number(dateStr.slice(0, 4)) || null : null;
      return {
        provider: "tmdb",
        tmdbId: it.id,
        mediaType: it.media_type,
        title,
        year,
        endYear: null,
        type: isTv ? "tvSeries" : "feature",
        typeLabel: isTv ? "Series" : "Movie",
        isSeries: isTv,
        poster: it.poster_path ? `${TMDB_IMG_BASE}${it.poster_path}` : null,
        popularity: it.popularity || 0,
      };
    })
    .filter((it: any) => it.title)
    .sort((a: any, b: any) => b.popularity - a.popularity)
    .slice(0, MAX_RESULTS);
}

async function tmdbExternalId(tmdbId: string, mediaType: string) {
  const kind = mediaType === "tv" ? "tv" : "movie";
  const url = `${TMDB_BASE}/${kind}/${encodeURIComponent(
    tmdbId
  )}/external_ids?api_key=${encodeURIComponent(TMDB_API_KEY)}`;
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`TMDB external_ids HTTP ${r.status}`);
  const j = await r.json();
  const id = String(j?.imdb_id || "");
  return /^tt\d{7,10}$/i.test(id) ? id : null;
}

function normalizeImdbType(raw: any) {
  const s = String(raw || "").trim().toLowerCase();
  const map: Record<string, string> = {
    feature: "feature",
    movie: "feature",
    "tv series": "tvSeries",
    tvseries: "tvSeries",
    "tv mini-series": "tvMiniSeries",
    "tv mini series": "tvMiniSeries",
    tvminiseries: "tvMiniSeries",
    "tv movie": "tvMovie",
    tvmovie: "tvMovie",
    "tv special": "tvSpecial",
    tvspecial: "tvSpecial",
    "tv episode": "tvEpisode",
    tvepisode: "tvEpisode",
    short: "short",
    video: "video",
    "video game": "videoGame",
    videogame: "videoGame",
  };
  return map[s] || "";
}

async function imdbSuggest(query: string) {
  const r = await fetch(
    `https://v2.sg.media-imdb.com/suggestion/x/${encodeURIComponent(query)}.json?includeVideos=0`,
    { headers: { "user-agent": "Mozilla/5.0", accept: "application/json" } }
  );
  if (!r.ok) throw new Error(`IMDb suggest HTTP ${r.status}`);
  const j = await r.json();
  const rows = Array.isArray(j?.d) ? j.d : [];
  return rows
    .filter((e: any) => /^tt\d{7,10}$/i.test(e?.id || ""))
    .map((e: any) => {
      const type = normalizeImdbType(e.q);
      const posterSrc = e?.i?.imageUrl || e?.i;
      return {
        provider: "imdb",
        id: e.id,
        title: String(e.l || "").trim(),
        year: Number.isInteger(e.y) ? e.y : Number(e.y) || null,
        endYear: Number.isInteger(e.yr?.[1]) ? e.yr[1] : null,
        type,
        typeLabel: TYPE_LABELS[type] || "Title",
        isSeries: type === "tvSeries" || type === "tvMiniSeries",
        poster: typeof posterSrc === "string" ? posterSrc : null,
      };
    })
    .filter((e: any) => e.title && ALLOWED_TYPES.has(e.type))
    .slice(0, MAX_RESULTS);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // Step 2: Resolve a TMDB selection's IMDb ID lazily
  if (searchParams.get("resolve")) {
    const tmdbId = String(searchParams.get("tmdbId") || "").trim();
    const mediaType = String(searchParams.get("mediaType") || "").trim();
    if (!TMDB_API_KEY) {
      return NextResponse.json({ error: "TMDB_API_KEY is not configured." }, { status: 500 });
    }
    if (!tmdbId || !/^\d+$/.test(tmdbId)) {
      return NextResponse.json({ error: "A numeric tmdbId is required." }, { status: 400 });
    }
    try {
      const id = await tmdbExternalId(tmdbId, mediaType);
      if (!id) return NextResponse.json({ error: "No IMDb id found for that title." }, { status: 404 });
      return NextResponse.json({ id });
    } catch (e: any) {
      return NextResponse.json(
        { error: "TMDB lookup failed.", detail: e?.message || String(e) },
        { status: 502 }
      );
    }
  }

  // Step 1: Search as you type
  const q = String(searchParams.get("q") || "").trim().slice(0, MAX_QUERY);
  if (q.length < 2) {
    return NextResponse.json({ query: q, provider: null, results: [] });
  }

  try {
    if (TMDB_API_KEY) {
      const results = await tmdbSearch(q);
      return NextResponse.json({ query: q, provider: "tmdb", results });
    }
    const results = await imdbSuggest(q);
    return NextResponse.json({ query: q, provider: "imdb", results });
  } catch (e: any) {
    if (TMDB_API_KEY) {
      try {
        const results = await imdbSuggest(q);
        return NextResponse.json({ query: q, provider: "imdb", results });
      } catch {
        // Fall through
      }
    }
    return NextResponse.json(
      { error: "Title lookup failed.", detail: e?.message || String(e) },
      { status: 502 }
    );
  }
}
