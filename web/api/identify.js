/**
 * Minimal metadata resolver with provider fallback.
 *
 * POST /api/identify
 * Body: { series?: string, url?: string, imdbId?: string }
 *
 * Provider order (default): Gemini -> Grok -> OpenRouter.
 * Configure with LLM_PROVIDER_ORDER=gemini,grok,openrouter.
 *
 * Design goal: keep LLM input/output tiny. We fetch the supplied public IMDb
 * page ourselves when an IMDb ID is available, extract only compact JSON-LD
 * facts, and ask the LLM only for fields that cannot be determined locally.
 * No web-search tool and no two-pass research/formatting pipeline are used.
 */
export const config = { runtime: "nodejs" };

const MAX_URL_LENGTH = 4096;
const MAX_INPUT = 220;
const MAX_OUTPUT_TOKENS = 450;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const GROK_MODEL = process.env.GROK_MODEL || "grok-4.5";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openrouter/auto";

/* badUrl used to pattern-match the hostname *string*, which stops a literal
 * "http://169.254.169.254/..." but not a hostname whose DNS record simply
 * resolves to that address (rebinding) — and the playlist-hint fetch below
 * used plain redirect:"follow" with no re-check at each hop at all. Both now
 * go through the shared resolver-based guard — see api/_security.js. */
import { safeFetch, isBadUrl } from "./_security.js";
import { rateLimited } from "./_ratelimit.js";
const badUrl = (value) => isBadUrl(value, MAX_URL_LENGTH);

function extractGeminiText(response) {
  return (response?.candidates?.[0]?.content?.parts || [])
    .map(p => p.text || "").join("").trim();
}

function extractChatText(response) {
  return String(response?.choices?.[0]?.message?.content || "").trim();
}

function retrySeconds(raw) {
  try {
    const j = JSON.parse(raw);
    const d = j?.error?.details?.find?.(x => x.retryDelay);
    if (d?.retryDelay) return Math.min(Math.ceil(parseFloat(d.retryDelay) * 1.2) + 1, 12);
  } catch {}
  const m = /(?:try again in|retry-after)[^\d]*([\d.]+)s?/i.exec(raw || "");
  return m ? Math.min(Math.ceil(Number(m[1])) + 1, 12) : 3;
}

async function postJSON(url, headers, body, attempts = 2) {
  let last = { status: 0, raw: "" };
  for (let i = 0; i < attempts; i++) {
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const raw = await r.text();
    if (r.ok) return { ok: true, status: r.status, raw };
    last = { status: r.status, raw };
    if (![408, 429, 500, 502, 503, 504].includes(r.status) || i === attempts - 1) break;
    await new Promise(ok => setTimeout(ok, retrySeconds(raw) * 1000));
  }
  return { ok: false, ...last };
}

function parseJsonLoose(text) {
  if (!text) throw new Error("empty response");
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  throw new Error("provider returned non-JSON metadata");
}

function normalize(data, imdbId, fallbackSeries) {
  const out = {
    series: String(data?.series || fallbackSeries || "").trim().slice(0, 120),
    seasonNumber: Number.isInteger(data?.seasonNumber) ? data.seasonNumber : null,
    episodeNumber: Number.isInteger(data?.episodeNumber) ? data.episodeNumber : null,
    episodeCode: String(data?.episodeCode || "").slice(0, 20),
    episodeTitle: String(data?.episodeTitle || "").slice(0, 160),
    confidence: ["high", "medium", "low"].includes(data?.confidence) ? data.confidence : "low",
    seriesYear: Number.isInteger(data?.seriesYear) ? data.seriesYear : null,
    seriesImdbId: String(data?.seriesImdbId || imdbId || "").match(/^tt\d{7,10}$/i)?.[0] || null,
    seriesImdbUrl: null,
    seriesImdbRating: typeof data?.seriesImdbRating === "number" ? data.seriesImdbRating : null,
    seriesGenres: Array.isArray(data?.seriesGenres) ? data.seriesGenres.slice(0, 6).map(String) : [],
    seriesSummary: String(data?.seriesSummary || "").slice(0, 500),
    episodeImdbId: String(data?.episodeImdbId || "").match(/^tt\d{7,10}$/i)?.[0] || null,
    episodeImdbUrl: null,
    episodeImdbRating: typeof data?.episodeImdbRating === "number" ? data.episodeImdbRating : null,
    episodeSummary: String(data?.episodeSummary || "").slice(0, 500),
    metadataNotes: String(data?.metadataNotes || "").slice(0, 500),
  };
  if (out.seriesImdbId) out.seriesImdbUrl = `https://www.imdb.com/title/${out.seriesImdbId}/`;
  if (out.episodeImdbId) out.episodeImdbUrl = `https://www.imdb.com/title/${out.episodeImdbId}/`;
  if (!out.episodeCode && out.seasonNumber != null && out.episodeNumber != null) {
    out.episodeCode = `S${String(out.seasonNumber).padStart(2, "0")}E${String(out.episodeNumber).padStart(2, "0")}`;
  }
  return out;
}

async function fetchCompactImdb(imdbId) {
  if (!imdbId) return {};
  try {
    const r = await fetch(`https://www.imdb.com/title/${imdbId}/`, {
      headers: { "user-agent": "Mozilla/5.0", accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
    });
    if (!r.ok) return {};
    const html = (await r.text()).slice(0, 500000);
    const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const m of scripts) {
      try {
        const j = JSON.parse(m[1]);
        const x = Array.isArray(j) ? j.find(v => v?.['@type']) : j;
        if (!x) continue;
        return {
          name: x.name || "",
          year: Number(String(x.datePublished || "").slice(0, 4)) || null,
          rating: Number(x?.aggregateRating?.ratingValue) || null,
          genres: Array.isArray(x.genre) ? x.genre.slice(0, 6) : (x.genre ? [x.genre] : []),
          description: String(x.description || "").slice(0, 500),
          type: x['@type'] || "",
        };
      } catch {}
    }
  } catch {}
  return {};
}

function buildPrompt({ series, url, imdbId, imdb, playlistHint }) {
  return `Return ONLY compact JSON. Identify one anime/movie/episode.
Required keys: series,seasonNumber,episodeNumber,episodeCode,episodeTitle,confidence,seriesYear,seriesSummary,episodeSummary,metadataNotes.
Use null for unknown numbers. Never invent data. Keep summaries <=180 chars. Do not search for subtitles.
User series: ${series || ""}
IMDb: ${imdbId || ""}
Stream URL: ${url || ""}
IMDb facts: ${JSON.stringify(imdb).slice(0, 1400)}
Playlist hint: ${playlistHint.slice(0, 500)}
If IMDb facts already identify the title, trust them. Extract SxxEyy from the URL/hint when present.`;
}

async function callGemini(key, prompt) {
  const schema = {
    type: "object",
    properties: {
      series:{type:"string"},seasonNumber:{type:"integer",nullable:true},episodeNumber:{type:"integer",nullable:true},
      episodeCode:{type:"string"},episodeTitle:{type:"string"},confidence:{type:"string",enum:["high","medium","low"]},
      seriesYear:{type:"integer",nullable:true},seriesSummary:{type:"string"},episodeSummary:{type:"string"},metadataNotes:{type:"string"}
    },
    required:["series","seasonNumber","episodeNumber","episodeCode","episodeTitle","confidence","seriesYear","seriesSummary","episodeSummary","metadataNotes"]
  };
  const r = await postJSON(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
    {"content-type":"application/json"},
    {contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",responseSchema:schema,maxOutputTokens:MAX_OUTPUT_TOKENS,temperature:0}}
  );
  if (!r.ok) throw new Error(`Gemini HTTP ${r.status}`);
  return parseJsonLoose(extractGeminiText(JSON.parse(r.raw)));
}

async function callOpenAICompatible(base, key, model, prompt, extraHeaders = {}) {
  const r = await postJSON(`${base}/chat/completions`, {
    "content-type":"application/json", authorization:`Bearer ${key}`, ...extraHeaders
  }, {
    model,
    messages:[
      {role:"system",content:"You are a metadata extractor. Output only JSON, no markdown. Be concise and never invent facts."},
      {role:"user",content:prompt}
    ],
    temperature:0,
    max_tokens:MAX_OUTPUT_TOKENS,
    stream:false,
    ...(base.includes("x.ai") ? {reasoning_effort:"low"} : {})
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseJsonLoose(extractChatText(JSON.parse(r.raw)));
}

export default async function handler(req, res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "Content-Type");
  res.setHeader("cache-control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({error:"Method not allowed"});
  // This route makes a paid LLM call per request and has no auth in front
  // of it, so cap how often any one caller can hit it.
  if (rateLimited(req, res, "identify", { limit: 10, windowMs: 60_000 })) return;

  const series = String(req.body?.series || "").trim().slice(0, MAX_INPUT);
  const url = String(req.body?.url || "").trim();
  const imdbId = String(req.body?.imdbId || "").trim().toLowerCase();
  if (!series && !imdbId) return res.status(400).json({error:"Series name or IMDb ID is required."});
  if (url && await badUrl(url)) return res.status(400).json({error:"A valid public http(s) episode URL is required when a URL is supplied."});
  if (imdbId && !/^tt\d{7,10}$/i.test(imdbId)) return res.status(400).json({error:"IMDb ID must look like tt1234567."});

  const imdb = await fetchCompactImdb(imdbId);
  let playlistHint = "";
  if (url) {
    try {
      const r = await safeFetch(url,{headers:{"user-agent":"Mozilla/5.0",accept:"application/vnd.apple.mpegurl,text/plain,*/*"}});
      if (r.ok) playlistHint = (await r.text()).slice(0, 700);
    } catch {}
  }

  // If local evidence is enough, avoid an LLM call entirely.
  const combined = `${url}\n${playlistHint}`;
  const m = combined.match(/[Ss](\d{1,2})[ ._-]?[Ee](\d{1,3})/);
  const localSeries = series || imdb.name || `IMDb ${imdbId}`;
  if (m && imdb.name) {
    return res.status(200).json(normalize({series:imdb.name,seasonNumber:Number(m[1]),episodeNumber:Number(m[2]),confidence:"high",seriesYear:imdb.year,seriesSummary:imdb.description,metadataNotes:"Resolved locally from IMDb JSON-LD and episode code."}, imdbId, localSeries));
  }
  if (imdb.name && !url && !series) {
    return res.status(200).json(normalize({series:imdb.name,confidence:"high",seriesYear:imdb.year,seriesSummary:imdb.description,seriesImdbRating:imdb.rating,seriesGenres:imdb.genres,metadataNotes:"Resolved locally from IMDb JSON-LD; no LLM call needed."}, imdbId, localSeries));
  }

  const prompt = buildPrompt({series,url,imdbId,imdb,playlistHint});
  const order = String(process.env.LLM_PROVIDER_ORDER || "gemini,grok,openrouter").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
  const providers = [];
  for (const p of order) {
    if (p === "gemini" && process.env.GEMINI_API_KEY) providers.push(["gemini", () => callGemini(process.env.GEMINI_API_KEY,prompt)]);
    if (p === "grok" && process.env.XAI_API_KEY) providers.push(["grok", () => callOpenAICompatible("https://api.x.ai/v1",process.env.XAI_API_KEY,GROK_MODEL,prompt)]);
    if (p === "openrouter" && process.env.OPENROUTER_API_KEY) providers.push(["openrouter", () => callOpenAICompatible("https://openrouter.ai/api/v1",process.env.OPENROUTER_API_KEY,OPENROUTER_MODEL,prompt,{"HTTP-Referer":process.env.OPENROUTER_HTTP_REFERER || "https://parallel.app","X-Title":"Parallel Anime Library"})]);
  }
  if (!providers.length) return res.status(500).json({error:"No LLM provider is configured. Add GEMINI_API_KEY, XAI_API_KEY, or OPENROUTER_API_KEY."});

  const failures = [];
  for (const [name, fn] of providers) {
    try {
      const data = normalize(await fn(), imdbId, localSeries);
      if (data.series || data.episodeCode || data.episodeTitle) {
        if (!data.seriesYear && imdb.year) data.seriesYear = imdb.year;
        if (!data.seriesSummary && imdb.description) data.seriesSummary = imdb.description;
        if (!data.seriesImdbRating && imdb.rating) data.seriesImdbRating = imdb.rating;
        if (!data.seriesGenres.length && imdb.genres.length) data.seriesGenres = imdb.genres;
        data.metadataNotes = `${data.metadataNotes || ""}${data.metadataNotes ? " " : ""}Provider: ${name}.`;
        return res.status(200).json(data);
      }
      failures.push(`${name}: empty metadata`);
    } catch (e) { failures.push(`${name}: ${e?.message || e}`); }
  }

  return res.status(502).json({error:"All configured metadata providers failed.",detail:failures.join(" | ")});
}
