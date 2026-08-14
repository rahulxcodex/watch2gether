/**
 * Title autocomplete -> IMDb ID. No LLM involved.
 *
 * GET /api/imdb-search?q=demon+slayer
 *   -> { query, provider, results: [{ id, title, year, endYear, type,
 *        typeLabel, isSeries, poster, tmdbId, mediaType }] }
 *
 * GET /api/imdb-search?resolve=1&tmdbId=1429&mediaType=tv
 *   -> { id }   (the IMDb id for a TMDB search result, fetched lazily —
 *                only once the user actually picks that result)
 *
 * Two providers, tried in this order:
 *   1. TMDB  — official, documented, free API key (themoviedb.org/settings/api).
 *              Set TMDB_API_KEY to use it. Search itself doesn't return an
 *              IMDb id, so we resolve it with one extra call (/external_ids)
 *              only for the title the user actually picks — not for every
 *              row in the dropdown.
 *   2. IMDb's own public suggestion feed — no key required, used
 *      automatically whenever TMDB_API_KEY isn't set. Same one imdb.com's
 *      search box uses; undocumented and unofficial, kept as a zero-setup
 *      fallback so this still works out of the box.
 *
 * Either way: no LLM, no generation, just a lookup against a title database.
 */
export const config = { runtime: "nodejs" };

const MAX_QUERY = 100;
const MAX_RESULTS = 8;
const TMDB_API_KEY = process.env.TMDB_API_KEY || "";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG_BASE = "https://image.tmdb.org/t/p/w92";

const TYPE_LABELS = {
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
  "feature", "tvSeries", "tvMiniSeries", "tvMovie", "tvSpecial", "short", "video",
]);

/* ---------------------------------------------------------------- TMDB -- */

async function tmdbSearch(query) {
  const url = `${TMDB_BASE}/search/multi?api_key=${encodeURIComponent(TMDB_API_KEY)}&query=${encodeURIComponent(query)}&include_adult=false&page=1`;
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`TMDB search HTTP ${r.status}`);
  const j = JSON.parse(await r.text());
  const rows = Array.isArray(j?.results) ? j.results : [];
  return rows
    .filter((it) => it.media_type === "movie" || it.media_type === "tv")
    .map((it) => {
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
        endYear: null, // TMDB search doesn't give an end year up front
        type: isTv ? "tvSeries" : "feature",
        typeLabel: isTv ? "Series" : "Movie",
        isSeries: isTv,
        poster: it.poster_path ? `${TMDB_IMG_BASE}${it.poster_path}` : null,
        popularity: it.popularity || 0,
      };
    })
    .filter((it) => it.title)
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, MAX_RESULTS);
}

async function tmdbExternalId(tmdbId, mediaType) {
  const kind = mediaType === "tv" ? "tv" : "movie";
  const url = `${TMDB_BASE}/${kind}/${encodeURIComponent(tmdbId)}/external_ids?api_key=${encodeURIComponent(TMDB_API_KEY)}`;
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`TMDB external_ids HTTP ${r.status}`);
  const j = JSON.parse(await r.text());
  const id = String(j?.imdb_id || "");
  return /^tt\d{7,10}$/i.test(id) ? id : null;
}

/* --------------------------------------------------- IMDb suggest feed -- */

function normalizeImdbType(raw) {
  const s = String(raw || "").trim().toLowerCase();
  const map = {
    feature: "feature", movie: "feature",
    "tv series": "tvSeries", tvseries: "tvSeries",
    "tv mini-series": "tvMiniSeries", "tv mini series": "tvMiniSeries", tvminiseries: "tvMiniSeries",
    "tv movie": "tvMovie", tvmovie: "tvMovie",
    "tv special": "tvSpecial", tvspecial: "tvSpecial",
    "tv episode": "tvEpisode", tvepisode: "tvEpisode",
    short: "short", video: "video",
    "video game": "videoGame", videogame: "videoGame",
  };
  return map[s] || "";
}

async function imdbSuggest(query) {
  const r = await fetch(
    `https://v2.sg.media-imdb.com/suggestion/x/${encodeURIComponent(query)}.json?includeVideos=0`,
    { headers: { "user-agent": "Mozilla/5.0", accept: "application/json" } }
  );
  if (!r.ok) throw new Error(`IMDb suggest HTTP ${r.status}`);
  const j = JSON.parse(await r.text());
  const rows = Array.isArray(j?.d) ? j.d : [];
  return rows
    .filter((e) => /^tt\d{7,10}$/i.test(e?.id || ""))
    .map((e) => {
      const type = normalizeImdbType(e.q);
      const posterSrc = e?.i?.imageUrl || e?.i;
      return {
        provider: "imdb",
        id: e.id,
        title: String(e.l || "").trim(),
        year: Number.isInteger(e.y) ? e.y : (Number(e.y) || null),
        endYear: Number.isInteger(e.yr?.[1]) ? e.yr[1] : null,
        type,
        typeLabel: TYPE_LABELS[type] || "Title",
        isSeries: type === "tvSeries" || type === "tvMiniSeries",
        poster: typeof posterSrc === "string" ? posterSrc : null,
      };
    })
    .filter((e) => e.title && ALLOWED_TYPES.has(e.type))
    .slice(0, MAX_RESULTS);
}

/* ------------------------------------------------------------- handler -- */

export default async function handler(req, res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,OPTIONS");
  res.setHeader("access-control-allow-headers", "Content-Type");
  res.setHeader("cache-control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // Step 2: resolve a TMDB pick's IMDb id, lazily, once the user chooses it.
  if (req.query?.resolve) {
    const tmdbId = String(req.query?.tmdbId || "").trim();
    const mediaType = String(req.query?.mediaType || "").trim();
    if (!TMDB_API_KEY) return res.status(500).json({ error: "TMDB_API_KEY is not configured." });
    if (!tmdbId || !/^\d+$/.test(tmdbId)) return res.status(400).json({ error: "A numeric tmdbId is required." });
    try {
      const id = await tmdbExternalId(tmdbId, mediaType);
      if (!id) return res.status(404).json({ error: "No IMDb id found for that title." });
      return res.status(200).json({ id });
    } catch (e) {
      return res.status(502).json({ error: "TMDB lookup failed.", detail: e?.message || String(e) });
    }
  }

  // Step 1: search-as-you-type.
  const q = String(req.query?.q || "").trim().slice(0, MAX_QUERY);
  if (q.length < 2) return res.status(200).json({ query: q, provider: null, results: [] });

  try {
    if (TMDB_API_KEY) {
      const results = await tmdbSearch(q);
      return res.status(200).json({ query: q, provider: "tmdb", results });
    }
    const results = await imdbSuggest(q);
    return res.status(200).json({ query: q, provider: "imdb", results });
  } catch (e) {
    // If TMDB is configured but hiccups, fall back to the no-key IMDb feed
    // rather than leaving the user with nothing.
    if (TMDB_API_KEY) {
      try {
        const results = await imdbSuggest(q);
        return res.status(200).json({ query: q, provider: "imdb", results });
      } catch { /* fall through to error below */ }
    }
    return res.status(502).json({ error: "Title lookup failed.", detail: e?.message || String(e) });
  }
}
