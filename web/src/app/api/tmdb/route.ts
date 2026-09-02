import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TMDB_BASE = "https://api.themoviedb.org/3";
const READ_TOKEN = process.env.TMDB_API_READ_ACCESS_TOKEN || "";
const API_KEY = process.env.TMDB_API_KEY || "";
const MAX = 120;
const clean = (s: any, n = MAX) => String(s || "").trim().slice(0, n);

async function fetchJsonWithTimeout(url: string | URL, options: RequestInit = {}, ms = 5000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url.toString(), { ...options, signal: c.signal });
  } finally {
    clearTimeout(t);
  }
}

function yearOf(x: any) {
  const d = String(x?.release_date || x?.first_air_date || "");
  return /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null;
}

async function tmdb(path: string, params: Record<string, any> = {}) {
  const u = new URL(TMDB_BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
  }
  if (!READ_TOKEN && !API_KEY) throw new Error("TMDB credentials are not configured");
  const h: Record<string, string> = { accept: "application/json" };
  if (READ_TOKEN) h.Authorization = `Bearer ${READ_TOKEN}`;
  else u.searchParams.set("api_key", API_KEY);
  const r = await fetchJsonWithTimeout(u, { headers: h }, 6500);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.status_message || `TMDB HTTP ${r.status}`);
  return d;
}

function normalize(x: any, type: string) {
  if (!x) return null;
  return {
    ok: true,
    source: "tmdb",
    tmdbId: x.id || null,
    mediaType: type,
    posterPath: x.poster_path || null,
    backdropPath: x.backdrop_path || null,
    overview: clean(x.overview, 1200),
    rating: typeof x.vote_average === "number" ? x.vote_average : null,
    voteCount: typeof x.vote_count === "number" ? x.vote_count : null,
    year: yearOf(x),
    title: clean(x.title || x.name),
    originalTitle: clean(x.original_title || x.original_name),
    tagline: clean(x.tagline, 220),
    status: clean(x.status, 60),
    runtime: typeof x.runtime === "number" ? x.runtime : null,
    episodeRunTime: Array.isArray(x.episode_run_time) ? x.episode_run_time.slice(0, 3) : [],
    genres: Array.isArray(x.genres)
      ? x.genres.slice(0, 12).map((g: any) => ({ id: g.id, name: clean(g.name, 60) }))
      : [],
    seasons:
      type === "tv" && Array.isArray(x.seasons)
        ? x.seasons.map((s: any) => ({
            id: s.id,
            seasonNumber: s.season_number,
            name: clean(s.name, 120),
            overview: clean(s.overview, 500),
            airDate: s.air_date || null,
            episodeCount: s.episode_count || 0,
            posterPath: s.poster_path || null,
            rating: typeof s.vote_average === "number" ? s.vote_average : null,
            voteCount: typeof s.vote_count === "number" ? s.vote_count : null,
          }))
        : [],
    externalIds: x.external_ids
      ? { imdbId: x.external_ids.imdb_id || null, tvdbId: x.external_ids.tvdb_id || null }
      : null,
  };
}

async function imdbFallback(title: string, imdbId: string, type: string) {
  const q = clean(title);
  let rows: any[] = [];
  try {
    const r = await fetchJsonWithTimeout(
      `https://v2.sg.media-imdb.com/suggestion/x/${encodeURIComponent(q)}.json?includeVideos=0`,
      { headers: { accept: "application/json" } },
      5000
    );
    const j = await r.json();
    rows = Array.isArray(j?.d) ? j.d : [];
  } catch {}
  const exact =
    rows.find((x) => imdbId && x?.id === imdbId) ||
    rows.find((x) => String(x?.l || "").toLowerCase() === q.toLowerCase()) ||
    rows[0];
  if (!exact) return null;
  const poster =
    typeof exact?.i?.imageUrl === "string"
      ? exact.i.imageUrl
      : typeof exact?.i === "string"
      ? exact.i
      : null;
  return {
    ok: true,
    source: "imdb",
    mediaType: type,
    title: clean(exact.l),
    year: Number(exact.y) || null,
    posterUrl: poster || null,
    backdropUrl: null,
    rating: null,
    voteCount: null,
    overview: "",
    genres: [],
  };
}

async function jikanFallback(title: string, type: string) {
  try {
    const r = await fetchJsonWithTimeout(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(clean(title))}&limit=5&sfw=true`,
      { headers: { accept: "application/json" } },
      5000
    );
    if (!r.ok) return null;
    const j = await r.json();
    const rows = Array.isArray(j?.data) ? j.data : [];
    const pick = rows.find((x: any) => (type === "movie" ? x.type === "Movie" : x.type !== "Movie")) || rows[0];
    if (!pick) return null;
    const img = pick.images?.jpg?.large_image_url || pick.images?.jpg?.image_url || null;
    return {
      ok: true,
      source: "jikan",
      mediaType: type,
      title: clean(pick.title),
      originalTitle: clean(pick.title_japanese),
      year: pick.year || null,
      posterUrl: img,
      backdropUrl: null,
      overview: clean(pick.synopsis, 1200),
      rating: typeof pick.score === "number" ? pick.score : null,
      voteCount: typeof pick.scored_by === "number" ? pick.scored_by : null,
      status: clean(pick.status, 60),
      genres: Array.isArray(pick.genres) ? pick.genres.map((g: any) => ({ id: g.mal_id, name: clean(g.name, 60) })) : [],
      seasons: [],
    };
  } catch {
    return null;
  }
}

async function fallback(title: string, imdbId: string, type: string) {
  const [imdb, anime] = await Promise.all([imdbFallback(title, imdbId, type), jikanFallback(title, type)]);
  if (anime) {
    return { ...imdb, ...anime, posterUrl: anime.posterUrl || imdb?.posterUrl || null };
  }
  return imdb;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const imdbId = clean(searchParams.get("imdbId"), 20).toLowerCase();
  const title = clean(searchParams.get("title"));
  const type = searchParams.get("type") === "movie" ? "movie" : "tv";
  const action = clean(searchParams.get("action"), 30).toLowerCase();

  if (action === "anime") {
    const q = clean(searchParams.get("title"), 180);
    if (!q) return NextResponse.json({ ok: true, results: [] });
    try {
      const d = await fetchJsonWithTimeout(
        `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=8&sfw=true`,
        { headers: { accept: "application/json" } },
        6000
      );
      const j = await d.json();
      const rows = (j.data || []).map((x: any) => ({
        mal_id: x.mal_id,
        title: clean(x.title, 180),
        title_english: clean(x.title_english, 180),
        year: x.year || null,
        episodes: x.episodes || null,
        score: typeof x.score === "number" ? x.score : null,
        synopsis: clean(x.synopsis, 1400),
        images: x.images || {},
      }));
      if (rows.length) return NextResponse.json({ ok: true, results: rows, source: "jikan" });
    } catch {}
    return NextResponse.json({ ok: false, results: [], error: "Anime metadata unavailable" });
  }

  if (action === "season") {
    if (!READ_TOKEN && !API_KEY) {
      return NextResponse.json({
        ok: true,
        source: "fallback",
        tmdbId: null,
        seasonNumber: Number(searchParams.get("season")),
        episodes: [],
      });
    }
    try {
      const id = String(searchParams.get("tmdbId") || "").replace(/\D/g, "");
      const s = Number(searchParams.get("season"));
      if (!id || !Number.isInteger(s) || s < 0) {
        return NextResponse.json({ ok: true, source: "fallback", seasonNumber: s, episodes: [] });
      }
      const d = await tmdb(`/tv/${id}/season/${s}`, { language: "en-US" });
      return NextResponse.json({
        ok: true,
        source: "tmdb",
        tmdbId: Number(id),
        seasonNumber: s,
        name: clean(d.name),
        overview: clean(d.overview, 700),
        airDate: d.air_date || null,
        episodes: Array.isArray(d.episodes)
          ? d.episodes.map((e: any) => ({
              id: e.id,
              episodeNumber: e.episode_number,
              seasonNumber: e.season_number,
              name: clean(e.name, 180),
              overview: clean(e.overview, 900),
              airDate: e.air_date || null,
              stillPath: e.still_path || null,
              rating: typeof e.vote_average === "number" ? e.vote_average : null,
            }))
          : [],
      });
    } catch {
      return NextResponse.json({
        ok: true,
        source: "fallback",
        seasonNumber: Number(searchParams.get("season")),
        episodes: [],
      });
    }
  }

  if (!READ_TOKEN && !API_KEY) {
    const fb = await fallback(title, imdbId, type);
    return NextResponse.json(fb || { ok: false, source: "none", error: "Metadata unavailable" });
  }

  try {
    let item = null;
    if (searchParams.get("tmdbId")) {
      item = await tmdb(
        `/${type}/${String(searchParams.get("tmdbId")).replace(/\D/g, "")}`,
        { language: "en-US", append_to_response: "credits,external_ids" }
      );
    } else {
      let found: any = null;
      if (imdbId) {
        const f = await tmdb(`/find/${encodeURIComponent(imdbId)}`, {
          external_source: "imdb_id",
          language: "en-US",
        });
        found = type === "movie" ? f?.movie_results?.[0] : f?.tv_results?.[0];
      }
      if (!found && title) {
        const f = await tmdb(`/search/${type}`, {
          query: title,
          include_adult: "false",
          language: "en-US",
          page: 1,
        });
        found = f?.results?.[0];
      }
      if (found?.id) {
        item = await tmdb(`/${type}/${found.id}`, {
          language: "en-US",
          append_to_response: "credits,external_ids",
        });
      }
    }
    if (!item) throw new Error("No TMDB match");
    return NextResponse.json(normalize(item, type));
  } catch {
    const fb = await fallback(title, imdbId, type);
    if (fb) return NextResponse.json(fb);
    return NextResponse.json({ ok: false, source: "none", error: "Metadata unavailable" });
  }
}
