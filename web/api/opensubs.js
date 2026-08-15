/**
 * OpenSubtitles importer.
 *
 * Uses the official OpenSubtitles.com REST API instead of scraping the legacy
 * .org HTML. The URL the user pastes is still accepted; its IMDb id is used
 * as the stable title identity. API credentials stay server-side in Vercel.
 *
 * Required Vercel environment variables:
 *   OPENSUBTITLES_API_KEY
 *   OPENSUBTITLES_USERNAME
 *   OPENSUBTITLES_PASSWORD
 */
export const config = { runtime: "nodejs" };
import { rateLimited } from "./_ratelimit.js";

const API_KEY = process.env.OPENSUBTITLES_API_KEY || "";
const OS_USER = process.env.OPENSUBTITLES_USERNAME || "";
const OS_PASS = process.env.OPENSUBTITLES_PASSWORD || "";
const USER_AGENT = "Parallel Subtitle Importer v2.0";
const MAX_SEASONS = 50;
const MAX_RESULTS = 500;
const MAX_DOWNLOADS = 120;
const CONCURRENCY = 2;
// Kept in sync with web/api/subtitle.js, the client-side upload cap in
// web/app.js, and the firebase/database.rules.json subtitleText limit.
// This used to be 2MB while the other three were 1.5MB, so a subtitle
// between 1.5MB and 2MB would download fine here and then get silently
// rejected by the Firebase write with no error shown to the user.
const MAX_SUBTITLE_BYTES = 1500000;
const SUBTITLE_EXT = /\.(ass|ssa|srt|vtt)$/i;

function validImdb(value) { return /^tt\d{7,10}$/i.test(String(value || "").trim()); }
function imdbNumeric(value) { return String(value).trim().replace(/^tt/i, ""); }

function assertOpenSubtitlesUrl(value) {
  const u = new URL(value);
  if (!/^https?:$/i.test(u.protocol) || !/(^|\.)opensubtitles\.org$/i.test(u.hostname)) {
    throw new Error("Paste an OpenSubtitles.org search page URL.");
  }
  return u;
}

async function osFetch(baseUrl, path, options = {}) {
  // A leading "/" on `path` makes `new URL()` resolve it as absolute from
  // the domain root, discarding the "/api/v1" in baseUrl entirely — every
  // call was hitting e.g. https://api.opensubtitles.com/login (404) instead
  // of https://api.opensubtitles.com/api/v1/login. Strip the leading slash
  // so it resolves relative to baseUrl's path as intended.
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const rel = path.replace(/^\/+/, "");
  const url = new URL(rel, base).href;
  const headers = {
    "Api-Key": API_KEY,
    "User-Agent": USER_AGENT,
    "Accept": "application/json",
    ...(options.headers || {}),
  };
  return fetch(url, { ...options, headers });
}

async function readTextLimited(response, maxBytes = MAX_SUBTITLE_BYTES) {
  const len = Number(response.headers.get("content-length") || 0);
  if (len && len > maxBytes) throw new Error("Subtitle file is too large.");
  const reader = response.body?.getReader();
  if (!reader) return Buffer.from(await response.arrayBuffer()).toString("utf8");
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch {}
      throw new Error("Subtitle file is too large.");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, "");
}

function detectEpisode(name, feature = {}) {
  const s = String(name || "");
  let season = Number.isInteger(feature.season_number) ? feature.season_number : null;
  let episode = Number.isInteger(feature.episode_number) ? feature.episode_number : null;
  let m = s.match(/(?:^|[^a-z])S(\d{1,3})[ ._-]*E(\d{1,4})(?:[^0-9]|$)/i);
  if (m) { season = +m[1]; episode = +m[2]; }
  if (season == null || episode == null) {
    m = s.match(/(?:^|[^0-9])(\d{1,2})x(\d{1,3})(?:[^0-9]|$)/i);
    if (m) { season = +m[1]; episode = +m[2]; }
  }
  if (season == null || episode == null) {
    m = s.match(/(?:season|s)[ ._-]*(\d{1,3}).*?(?:episode|e)[ ._-]*(\d{1,4})/i);
    if (m) { season = +m[1]; episode = +m[2]; }
  }
  const code = season != null && episode != null
    ? `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}` : "";
  return { season, episode, code };
}

function scoreSubtitle(attrs, fileName) {
  const n = `${attrs.release || ""} ${fileName || ""}`.toLowerCase();
  let score = Number(attrs.ratings || 0) * 10 + Math.min(Number(attrs.download_count || 0) / 100000, 10);
  if (attrs.from_trusted) score += 25;
  if (attrs.hearing_impaired) score -= 3;
  if (attrs.machine_translated || attrs.ai_translated) score -= 10;
  if (/\.(ass|ssa)$/i.test(fileName || "")) score += 50;
  if (/english|\.en[._-]|[._-]eng(?:[._-]|$)/i.test(n)) score += 10;
  return score;
}

async function login() {
  if (!API_KEY || !OS_USER || !OS_PASS) {
    throw new Error("OpenSubtitles API is not configured. Add OPENSUBTITLES_API_KEY, OPENSUBTITLES_USERNAME and OPENSUBTITLES_PASSWORD in Vercel.");
  }
  const r = await osFetch("https://api.opensubtitles.com/api/v1", "/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: OS_USER, password: OS_PASS }),
  });
  const raw = await r.text();
  if (!r.ok) throw new Error(`OpenSubtitles login failed (HTTP ${r.status}). ${raw.slice(0, 400)}`);
  const body = JSON.parse(raw);
  return { baseUrl: `https://${body.base_url || "api.opensubtitles.com"}/api/v1`, token: body.token, user: body.user || {} };
}

async function apiFetch(session, path, options = {}) {
  return osFetch(session.baseUrl, path, {
    ...options,
    headers: { Authorization: `Bearer ${session.token}`, ...(options.headers || {}) },
  });
}

async function getJson(session, path) {
  const r = await apiFetch(session, path);
  const raw = await r.text();
  let body = {};
  try { body = JSON.parse(raw); } catch {}
  if (!r.ok) throw new Error(`OpenSubtitles API HTTP ${r.status}: ${String(body.message || raw).slice(0, 500)}`);
  return body;
}

async function searchSeason(session, imdbId, season) {
  const params = new URLSearchParams({
    parent_imdb_id: imdbNumeric(imdbId),
    season_number: String(season),
    languages: "en",
    type: "episode",
    order_by: "download_count",
    order_direction: "desc",
    per_page: "60",
  });
  return getJson(session, `/subtitles?${params}`);
}

// Movies aren't part of a season/episode tree on OpenSubtitles — they need
// their own imdb_id + type=movie query. Reusing searchSeason's
// parent_imdb_id/type=episode params for a movie's IMDb id always returned
// zero results, since that id was never registered as a TV "parent".
async function searchMovie(session, imdbId) {
  const params = new URLSearchParams({
    imdb_id: imdbNumeric(imdbId),
    languages: "en",
    type: "movie",
    order_by: "download_count",
    order_direction: "desc",
    per_page: "60",
  });
  return getJson(session, `/subtitles?${params}`);
}

async function downloadFile(session, candidate) {
  const fileId = candidate.file_id;
  const tries = ["ass", "srt"];
  let last = null;
  for (const format of tries) {
    try {
      const r = await apiFetch(session, "/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId, sub_format: format }),
      });
      const raw = await r.text();
      let body = {};
      try { body = JSON.parse(raw); } catch {}
      if (!r.ok || !body.link) { last = new Error(`download HTTP ${r.status}: ${String(body.message || raw).slice(0, 300)}`); continue; }

      const sr = await fetch(body.link, { redirect: "follow", headers: { "User-Agent": USER_AGENT } });
      if (!sr.ok) throw new Error(`subtitle file HTTP ${sr.status}`);
      const text = await readTextLimited(sr);
      if (!text.trim()) throw new Error("Downloaded subtitle is empty.");
      const fileName = String(body.file_name || candidate.file_name || `subtitle.${format}`)
        .replace(/[\\/]/g, "_")
        .replace(/\.[^.]+$/, `.${format}`);
      return { text, fileName, remaining: body.remaining, requests: body.requests };
    } catch (e) { last = e; }
  }
  throw last || new Error("Subtitle download failed.");
}

function parseEpisodeSelector(value) {
  // Accepts an array of numbers (e.g. [1,2,5]) or a range string like
  // "1-5,8,10". Returns null (meaning "no filter, take everything") when
  // nothing usable was supplied, or a Set of episode numbers to keep.
  if (Array.isArray(value)) {
    const nums = value.map(Number).filter((n) => Number.isInteger(n) && n >= 1);
    return nums.length ? new Set(nums) : null;
  }
  const str = String(value || "").trim();
  if (!str) return null;
  const out = new Set();
  for (const part of str.split(",").map((s) => s.trim()).filter(Boolean)) {
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      let [a, b] = [Number(range[1]), Number(range[2])];
      if (a > b) [a, b] = [b, a];
      for (let n = a; n <= b && n - a < 200; n++) out.add(n); // guard against absurd ranges
    } else if (/^\d+$/.test(part)) {
      out.add(Number(part));
    }
  }
  return out.size ? out : null;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try { out[i] = { ok: true, value: await fn(items[i], i) }; }
      catch (e) { out[i] = { ok: false, error: String(e?.message || e) }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export default async function handler(req, res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "Content-Type");
  res.setHeader("cache-control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  // A single request here can trigger dozens of searches and up to
  // MAX_DOWNLOADS downloads against a shared OpenSubtitles account with no
  // auth in front of this route — keep callers from looping it.
  if (rateLimited(req, res, "opensubs", { limit: 6, windowMs: 60_000 })) return;

  const url = String(req.body?.url || "").trim();
  const imdbId = String(req.body?.imdbId || "").trim().toLowerCase();
  if (!url) return res.status(400).json({ error: "OpenSubtitles page URL is required." });
  if (!validImdb(imdbId)) return res.status(400).json({ error: "IMDb ID must look like tt1234567." });
  try { assertOpenSubtitlesUrl(url); } catch (e) { return res.status(400).json({ error: e.message }); }

  try {
    const session = await login();
    const candidates = new Map();
    const isMovie = req.body?.movie === true || req.body?.movie === "true";

    if (isMovie) {
      // Single lookup by the movie's own IMDb id — no season/episode tree
      // to walk.
      const body = await searchMovie(session, imdbId);
      for (const item of (body.data || [])) {
        const a = item.attributes || {};
        for (const f of (a.files || [])) {
          if (!f?.file_id) continue;
          const key = "movie";
          const candidate = { file_id: Number(f.file_id), file_name: f.file_name || "", subtitle_id: a.subtitle_id || item.id, attributes: a, feature: a.feature_details || {} };
          const old = candidates.get(key);
          if (!old || scoreSubtitle(candidate.attributes, candidate.file_name) > scoreSubtitle(old.attributes, old.file_name)) candidates.set(key, candidate);
        }
      }
      if (!candidates.size) {
        return res.status(404).json({ error: "OpenSubtitles API returned no English subtitles for this movie's IMDb ID." });
      }
    } else {
      const requestedSeason = Number(req.body?.seasonNumber);
      const seasons = Number.isInteger(requestedSeason) && requestedSeason >= 1 && requestedSeason <= MAX_SEASONS
        ? [requestedSeason] : Array.from({ length: MAX_SEASONS }, (_, i) => i + 1);
      // Optional episode filter (e.g. { episodeNumbers: "1-5,8,10" } or
      // { episodeNumbers: [1,2,5] }) so a 20+ episode season doesn't force an
      // all-or-nothing download.
      const episodeFilter = parseEpisodeSelector(req.body?.episodeNumbers ?? req.body?.episodeNumber);

      for (const season of seasons) {
        const body = await searchSeason(session, imdbId, season);
        for (const item of (body.data || [])) {
          const a = item.attributes || {};
          const feature = a.feature_details || {};
          const ep = detectEpisode(a.release || a.feature_details?.movie_name, feature);
          if (ep.season == null || ep.episode == null) continue;
          if (episodeFilter && !episodeFilter.has(ep.episode)) continue;
          for (const f of (a.files || [])) {
            if (!f?.file_id) continue;
            const key = `${ep.season}x${ep.episode}`;
            const candidate = { file_id: Number(f.file_id), file_name: f.file_name || "", subtitle_id: a.subtitle_id || item.id, attributes: a, feature };
            const old = candidates.get(key);
            if (!old || scoreSubtitle(candidate.attributes, candidate.file_name) > scoreSubtitle(old.attributes, old.file_name)) candidates.set(key, candidate);
          }
        }
        // Stop once a season returns no results. This avoids 50 needless API calls
        // for ordinary shows while still discovering every populated season.
        if (!(body.data || []).length && season > 1) break;
        if (candidates.size >= MAX_RESULTS) break;
      }

      if (!candidates.size) {
        return res.status(404).json({
          error: episodeFilter
            ? `OpenSubtitles API returned no English subtitles for episode(s) ${[...episodeFilter].sort((a,b)=>a-b).join(", ")}.`
            : "OpenSubtitles API returned no English episode subtitles for this IMDb ID.",
        });
      }
    }

    const chosen = [...candidates.values()].slice(0, MAX_DOWNLOADS);
    const results = await mapLimit(chosen, CONCURRENCY, async (candidate) => {
      const dl = await downloadFile(session, candidate);
      const ep = detectEpisode(candidate.attributes.release || candidate.feature.movie_name, candidate.feature);
      return {
        ...ep,
        id: String(candidate.subtitle_id),
        fileId: candidate.file_id,
        fileName: dl.fileName,
        text: dl.text,
        remaining: dl.remaining,
        release: candidate.attributes.release || "",
      };
    });

    const files = results.filter(x => x.ok).map(x => x.value);
    const failed = results.filter(x => !x.ok);
    const quota = files.map(x => x.remaining).filter(x => Number.isFinite(Number(x)));

    return res.status(200).json({
      imdbId,
      mode: "official-api",
      found: candidates.size,
      selected: chosen.length,
      downloaded: files.length,
      failed: failed.length,
      remaining: quota.length ? Math.min(...quota.map(Number)) : null,
      errors: failed.slice(0, 10).map(x => x.error),
      files,
    });
  } catch (e) {
    return res.status(502).json({ error: String(e?.message || e) });
  }
}
