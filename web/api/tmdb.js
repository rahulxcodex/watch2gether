/**
 * Small server-side TMDB artwork lookup.
 *
 * GET /api/tmdb?imdbId=tt1234567&type=movie&title=...
 * Returns only the fields the Netflix-style library needs. The TMDB token
 * never reaches the browser.
 */
export const config = { runtime: "nodejs" };

const TMDB_BASE = "https://api.themoviedb.org/3";
const READ_TOKEN = process.env.TMDB_API_READ_ACCESS_TOKEN || "";
const API_KEY = process.env.TMDB_API_KEY || "";
const MAX_TITLE = 120;

function clean(s, n = MAX_TITLE) { return String(s || "").trim().slice(0, n); }
function yearOf(x) {
  const d = String(x?.release_date || x?.first_air_date || "");
  return /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null;
}
function cleanList(arr, n = 20) {
  return Array.isArray(arr) ? arr.slice(0, n).map((x) => clean(x, 100)).filter(Boolean) : [];
}

function normalize(x, type) {
  if (!x) return null;
  return {
    ok: true,
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
    genres: Array.isArray(x.genres) ? x.genres.slice(0, 12).map(g => ({ id: g.id, name: clean(g.name, 60) })) : [],
    creators: Array.isArray(x.created_by) ? x.created_by.slice(0, 8).map(c => ({ id: c.id, name: clean(c.name, 100), profilePath: c.profile_path || null })) : [],
    networks: Array.isArray(x.networks) ? x.networks.slice(0, 8).map(n => ({ id: n.id, name: clean(n.name, 100), logoPath: n.logo_path || null })) : [],
    productionCountries: Array.isArray(x.production_countries) ? x.production_countries.slice(0, 8).map(c => c.iso_3166_1).filter(Boolean) : [],
    seasons: type === "tv" && Array.isArray(x.seasons) ? x.seasons.map(s => ({
      id: s.id, seasonNumber: s.season_number, name: clean(s.name, 120), overview: clean(s.overview, 500),
      airDate: s.air_date || null, episodeCount: s.episode_count || 0, posterPath: s.poster_path || null,
      rating: typeof s.vote_average === "number" ? s.vote_average : null, voteCount: typeof s.vote_count === "number" ? s.vote_count : null
    })) : [],
    externalIds: x.external_ids ? { imdbId: x.external_ids.imdb_id || null, tvdbId: x.external_ids.tvdb_id || null } : null,
    credits: x.credits ? {
      cast: Array.isArray(x.credits.cast) ? x.credits.cast.slice(0, 12).map(c => ({ id:c.id, name:clean(c.name,80), character:clean(c.character,100), profilePath:c.profile_path||null })) : [],
      crew: Array.isArray(x.credits.crew) ? x.credits.crew.filter(c => ["Director","Writer","Screenplay","Producer"].includes(c.job)).slice(0, 12).map(c => ({ id:c.id,name:clean(c.name,80),job:clean(c.job,50),profilePath:c.profile_path||null })) : []
    } : null
  };
}

function normalizeEpisode(e) {
  return {
    id: e.id || null,
    episodeNumber: e.episode_number || null,
    seasonNumber: e.season_number || null,
    name: clean(e.name, 180),
    overview: clean(e.overview, 900),
    airDate: e.air_date || null,
    stillPath: e.still_path || null,
    rating: typeof e.vote_average === "number" ? e.vote_average : null,
    voteCount: typeof e.vote_count === "number" ? e.vote_count : null,
    runtime: typeof e.runtime === "number" ? e.runtime : null,
    productionCode: clean(e.production_code, 80),
    guestStars: Array.isArray(e.guest_stars) ? e.guest_stars.slice(0, 8).map(g => ({ id:g.id,name:clean(g.name,80),character:clean(g.character,100),profilePath:g.profile_path||null })) : []
  };
}

async function findTitle(imdbId, title, type) {
  let item = null;
  if (imdbId) {
    const found = await tmdb(`/find/${encodeURIComponent(imdbId)}`, { external_source: "imdb_id", language: "en-US" });
    item = type === "movie" ? found?.movie_results?.[0] : found?.tv_results?.[0];
  }
  if (!item && title) {
    const found = await tmdb(`/search/${type}`, { query: title, include_adult: "false", language: "en-US", page: "1" });
    item = found?.results?.[0] || null;
  }
  return item;
}

export default async function handler(req, res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("cache-control", "public, max-age=21600, stale-while-revalidate=604800");
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
  if (!READ_TOKEN && !API_KEY) return res.status(503).json({ ok: false, error: "TMDB is not configured. Add TMDB_API_READ_ACCESS_TOKEN or TMDB_API_KEY in Vercel." });

  const imdbId = clean(req.query?.imdbId, 20).toLowerCase();
  const title = clean(req.query?.title);
  const type = req.query?.type === "movie" ? "movie" : "tv";
  const action = clean(req.query?.action, 20).toLowerCase();
  if (!imdbId && !title && !req.query?.tmdbId) return res.status(400).json({ ok: false, error: "IMDb ID, TMDB ID or title is required." });
  if (imdbId && !/^tt\d{7,10}$/.test(imdbId)) return res.status(400).json({ ok: false, error: "Invalid IMDb ID." });

  try {
    if (action === "season") {
      const tmdbId = String(req.query.tmdbId || "").replace(/\D/g, "");
      const seasonNumber = Number(req.query.season);
      if (!tmdbId || !Number.isInteger(seasonNumber) || seasonNumber < 0 || seasonNumber > 99) return res.status(400).json({ ok:false,error:"TMDB id and valid season are required." });
      const data = await tmdb(`/tv/${tmdbId}/season/${seasonNumber}`, { language:"en-US" });
      return res.status(200).json({ ok:true, tmdbId:Number(tmdbId), seasonNumber, name:clean(data.name,120), overview:clean(data.overview,700), airDate:data.air_date||null, posterPath:data.poster_path||null, rating:typeof data.vote_average === "number" ? data.vote_average : null, voteCount:typeof data.vote_count === "number" ? data.vote_count : null, episodes:Array.isArray(data.episodes)?data.episodes.map(normalizeEpisode):[] });
    }

    let item = null;
    if (req.query?.tmdbId) {
      const tmdbId = String(req.query.tmdbId).replace(/\D/g, "");
      if (!tmdbId) return res.status(400).json({ ok:false,error:"Invalid TMDB ID." });
      item = await tmdb(`/${type}/${tmdbId}`, { language:"en-US", append_to_response:"credits,external_ids" });
    } else {
      item = await findTitle(imdbId, title, type);
      if (item?.id) item = await tmdb(`/${type}/${item.id}`, { language:"en-US", append_to_response:"credits,external_ids" });
    }
    const result = normalize(item, type);
    if (!result) return res.status(404).json({ ok: false, error: "No TMDB title found." });
    return res.status(200).json(result);
  } catch (e) {
    return res.status(502).json({ ok: false, error: String(e?.message || e) });
  }
}
