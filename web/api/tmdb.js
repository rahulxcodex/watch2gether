/**
 * Small server-side TMDB artwork lookup.
 *
 * GET /api/tmdb?imdbId=tt1234567&type=movie&title=...
 * Returns only the fields the Netflix-style library needs. The TMDB token
 * never reaches the browser.
 */
export const config = { runtime: "nodejs" };

const TMDB_BASE = "https://api.themoviedb.org/3";
const TOKEN = process.env.TMDB_API_READ_ACCESS_TOKEN || process.env.TMDB_API_KEY || "";
const MAX_TITLE = 120;

function clean(s, n = MAX_TITLE) { return String(s || "").trim().slice(0, n); }
function yearOf(x) {
  const d = String(x?.release_date || x?.first_air_date || "");
  return /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null;
}
function normalize(x, type) {
  if (!x) return null;
  return {
    ok: true,
    tmdbId: x.id || null,
    mediaType: type,
    posterPath: x.poster_path || null,
    backdropPath: x.backdrop_path || null,
    overview: clean(x.overview, 700),
    rating: typeof x.vote_average === "number" ? x.vote_average : null,
    year: yearOf(x),
    title: clean(x.title || x.name),
    originalTitle: clean(x.original_title || x.original_name),
  };
}

async function tmdb(path, params = {}) {
  const qs = new URLSearchParams(params);
  const r = await fetch(`${TMDB_BASE}${path}?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, accept: "application/json" },
  });
  const raw = await r.text();
  let data = {};
  try { data = JSON.parse(raw); } catch {}
  if (!r.ok) throw new Error(`TMDB HTTP ${r.status}`);
  return data;
}

export default async function handler(req, res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("cache-control", "public, max-age=86400, stale-while-revalidate=604800");
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
  if (!TOKEN) return res.status(503).json({ ok: false, error: "TMDB is not configured. Add TMDB_API_READ_ACCESS_TOKEN or TMDB_API_KEY in Vercel." });

  const imdbId = clean(req.query?.imdbId, 20).toLowerCase();
  const title = clean(req.query?.title);
  const type = req.query?.type === "movie" ? "movie" : "tv";
  if (!imdbId && !title) return res.status(400).json({ ok: false, error: "IMDb ID or title is required." });
  if (imdbId && !/^tt\d{7,10}$/.test(imdbId)) return res.status(400).json({ ok: false, error: "Invalid IMDb ID." });

  try {
    let item = null;
    if (imdbId) {
      const found = await tmdb(`/find/${encodeURIComponent(imdbId)}`, {
        external_source: "imdb_id",
        language: "en-US",
      });
      item = type === "movie" ? found?.movie_results?.[0] : found?.tv_results?.[0];
    }

    // A few older anime/TV entries have an IMDb id that TMDB doesn't map.
    // Search by title as a fallback, still with one small request.
    if (!item && title) {
      const found = await tmdb(`/search/${type}`, {
        query: title,
        include_adult: "false",
        language: "en-US",
        page: "1",
      });
      item = found?.results?.[0] || null;
    }

    const result = normalize(item, type);
    if (!result) return res.status(404).json({ ok: false, error: "No TMDB title found." });
    return res.status(200).json(result);
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
}
