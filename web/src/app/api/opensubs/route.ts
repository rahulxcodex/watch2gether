import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API_KEY = process.env.OPENSUBTITLES_API_KEY || "";
const OS_USER = process.env.OPENSUBTITLES_USERNAME || "";
const OS_PASS = process.env.OPENSUBTITLES_PASSWORD || "";
const USER_AGENT = "Watch2Gether Subtitle Importer v2.0";
const MAX_SEASONS = 50;
const MAX_RESULTS = 500;
const MAX_DOWNLOADS = 120;
const CONCURRENCY = 2;
const MAX_SUBTITLE_BYTES = 1500000;

function validImdb(value: any) {
  return /^tt\d{7,10}$/i.test(String(value || "").trim());
}

function imdbNumeric(value: any) {
  return String(value).trim().replace(/^tt/i, "");
}

function scoreSubtitle(attrs: any, fileName: string) {
  const n = `${attrs.release || ""} ${fileName || ""}`.toLowerCase();
  let score =
    Number(attrs.ratings || 0) * 10 +
    Math.min(Number(attrs.download_count || 0) / 100000, 10);
  if (attrs.from_trusted) score += 25;
  if (attrs.hearing_impaired) score -= 3;
  if (attrs.machine_translated || attrs.ai_translated) score -= 10;
  if (/\.(ass|ssa)$/i.test(fileName || "")) score += 50;
  if (/english|\.en[._-]|[._-]eng(?:[._-]|$)/i.test(n)) score += 10;
  return score;
}

async function osFetch(baseUrl: string, path: string, options: RequestInit = {}) {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const rel = path.replace(/^\/+/, "");
  const url = new URL(rel, base).href;
  const headers = {
    "Api-Key": API_KEY,
    "User-Agent": USER_AGENT,
    Accept: "application/json",
    ...(options.headers || {}),
  };
  return fetch(url, { ...options, headers });
}

async function readTextLimited(response: Response, maxBytes = MAX_SUBTITLE_BYTES) {
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new Error("Subtitle file is too large.");
  }
  return text.replace(/^\uFEFF/, "");
}

function detectEpisode(name: string, feature: any = {}) {
  const s = String(name || "");
  let season = Number.isInteger(feature.season_number) ? feature.season_number : null;
  let episode = Number.isInteger(feature.episode_number) ? feature.episode_number : null;
  let m = s.match(/(?:^|[^a-z])S(\d{1,3})[ ._-]*E(\d{1,4})(?:[^0-9]|$)/i);
  if (m) {
    season = +m[1];
    episode = +m[2];
  }
  if (season == null || episode == null) {
    m = s.match(/(?:^|[^0-9])(\d{1,2})x(\d{1,3})(?:[^0-9]|$)/i);
    if (m) {
      season = +m[1];
      episode = +m[2];
    }
  }
  const code =
    season != null && episode != null
      ? `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`
      : "";
  return { season, episode, code };
}

async function login() {
  if (!API_KEY || !OS_USER || !OS_PASS) {
    throw new Error(
      "OpenSubtitles API is not configured. Add OPENSUBTITLES_API_KEY, OPENSUBTITLES_USERNAME and OPENSUBTITLES_PASSWORD in environment."
    );
  }
  const r = await osFetch("https://api.opensubtitles.com/api/v1", "/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: OS_USER, password: OS_PASS }),
  });
  const raw = await r.text();
  if (!r.ok) {
    throw new Error(`OpenSubtitles login failed (HTTP ${r.status}). ${raw.slice(0, 400)}`);
  }
  const body = JSON.parse(raw);
  return {
    baseUrl: `https://${body.base_url || "api.opensubtitles.com"}/api/v1`,
    token: body.token,
    user: body.user || {},
  };
}

async function apiFetch(session: any, path: string, options: RequestInit = {}) {
  return osFetch(session.baseUrl, path, {
    ...options,
    headers: { Authorization: `Bearer ${session.token}`, ...(options.headers || {}) },
  });
}

async function getJson(session: any, path: string) {
  const r = await apiFetch(session, path);
  const raw = await r.text();
  let body: any = {};
  try {
    body = JSON.parse(raw);
  } catch {}
  if (!r.ok) {
    throw new Error(
      `OpenSubtitles API HTTP ${r.status}: ${String(body.message || raw).slice(0, 500)}`
    );
  }
  return body;
}

async function downloadFile(session: any, candidate: any) {
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
      let body: any = {};
      try {
        body = JSON.parse(raw);
      } catch {}
      if (!r.ok || !body.link) {
        last = new Error(`download HTTP ${r.status}: ${String(body.message || raw).slice(0, 300)}`);
        continue;
      }

      const sr = await fetch(body.link, { redirect: "follow", headers: { "User-Agent": USER_AGENT } });
      if (!sr.ok) throw new Error(`subtitle file HTTP ${sr.status}`);
      const text = await readTextLimited(sr);
      if (!text.trim()) throw new Error("Downloaded subtitle is empty.");
      const fileName = String(body.file_name || candidate.file_name || `subtitle.${format}`)
        .replace(/[\\/]/g, "_")
        .replace(/\.[^.]+$/, `.${format}`);
      return { text, fileName, remaining: body.remaining, requests: body.requests };
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error("Subtitle download failed.");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const imdbId = String(body?.imdbId || "").trim().toLowerCase();
    if (!validImdb(imdbId)) {
      return NextResponse.json({ error: "IMDb ID must look like tt1234567." }, { status: 400 });
    }

    const session = await login();
    const candidates = new Map();
    const isMovie = body?.movie === true || body?.movie === "true";

    if (isMovie) {
      const res = await getJson(
        session,
        `/subtitles?imdb_id=${imdbNumeric(imdbId)}&languages=en&type=movie&order_by=download_count&order_direction=desc&per_page=60`
      );
      for (const item of res.data || []) {
        const a = item.attributes || {};
        for (const f of a.files || []) {
          if (!f?.file_id) continue;
          const candidate = {
            file_id: Number(f.file_id),
            file_name: f.file_name || "",
            subtitle_id: a.subtitle_id || item.id,
            attributes: a,
            feature: a.feature_details || {},
          };
          const old = candidates.get("movie");
          if (
            !old ||
            scoreSubtitle(candidate.attributes, candidate.file_name) >
              scoreSubtitle(old.attributes, old.file_name)
          ) {
            candidates.set("movie", candidate);
          }
        }
      }
    } else {
      const requestedSeason = Number(body?.seasonNumber) || 1;
      const res = await getJson(
        session,
        `/subtitles?parent_imdb_id=${imdbNumeric(
          imdbId
        )}&season_number=${requestedSeason}&languages=en&type=episode&order_by=download_count&order_direction=desc&per_page=60`
      );
      for (const item of res.data || []) {
        const a = item.attributes || {};
        const ep = detectEpisode(a.release || a.feature_details?.movie_name, a.feature_details || {});
        if (ep.season == null || ep.episode == null) continue;
        for (const f of a.files || []) {
          if (!f?.file_id) continue;
          const key = `${ep.season}x${ep.episode}`;
          const candidate = {
            file_id: Number(f.file_id),
            file_name: f.file_name || "",
            subtitle_id: a.subtitle_id || item.id,
            attributes: a,
            feature: a.feature_details || {},
          };
          const old = candidates.get(key);
          if (
            !old ||
            scoreSubtitle(candidate.attributes, candidate.file_name) >
              scoreSubtitle(old.attributes, old.file_name)
          ) {
            candidates.set(key, candidate);
          }
        }
      }
    }

    if (!candidates.size) {
      return NextResponse.json(
        { error: "OpenSubtitles API returned no English subtitles for this IMDb ID." },
        { status: 404 }
      );
    }

    const chosen = [...candidates.values()].slice(0, 10);
    const files: any[] = [];
    for (const candidate of chosen) {
      try {
        const dl = await downloadFile(session, candidate);
        const ep = detectEpisode(
          candidate.attributes.release || candidate.feature.movie_name,
          candidate.feature
        );
        files.push({
          ...ep,
          id: String(candidate.subtitle_id),
          fileId: candidate.file_id,
          fileName: dl.fileName,
          text: dl.text,
          remaining: dl.remaining,
        });
      } catch {}
    }

    return NextResponse.json({
      imdbId,
      found: candidates.size,
      downloaded: files.length,
      files,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
