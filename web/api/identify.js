/**
 * Anime library metadata via Gemini (free tier, single provider).
 *
 * POST /api/identify
 * Body: { series: string, url: string }
 *
 * Step 1 (research/web search): gemini-3.1-flash-lite with the built-in
 *   google_search grounding tool.
 * Step 2 (structured JSON):      gemini-3.1-flash-lite again, this time
 *   with a responseSchema so the reply is constrained JSON instead of
 *   free text.
 *
 * gemini-2.5-flash was dropped in favor of the `gemini-flash-latest` alias:
 * Google has been retiring dated Flash model IDs (gemini-2.5-flash,
 * gemini-3.1-flash-lite, etc.) faster than expected, sometimes returning
 * 404s for a model ID before its documented shutdown date, or before it's
 * fully rolled out to every account/region. `gemini-flash-latest` is an
 * alias Google keeps pointed at whatever the current stable Flash model
 * is, so this stops needing a code change every time Google reshuffles
 * model names. If it ever needs to be pinned to a specific dated model
 * instead, check https://ai.google.dev/gemini-api/docs/models for the
 * current free-tier, non-deprecated list.
 *
 * Gemini's free tier (Google AI Studio, no credit card) covers both steps
 * with generous request/day and RPM limits, and Google Search grounding has
 * its own separate free monthly allowance, so there's no need to split
 * load across two different providers the way the Groq/OpenRouter version
 * did. Subtitle files are supplied by the user through the library UI and
 * are never searched for by the model.
 */
export const config = { runtime: "nodejs" };

const MODEL = "gemini-flash-latest";
const MAX_URL_LENGTH = 4096;

function badUrl(value) {
  if (!value || typeof value !== "string" || value.length > MAX_URL_LENGTH) return true;
  if (!/^https?:\/\//i.test(value)) return true;
  try {
    const h = new URL(value).hostname.toLowerCase();
    return (
      /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|::1)$/i.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h)
    );
  } catch {
    return true;
  }
}

// Gemini's response shape: candidates[0].content.parts[] with text chunks.
function extractText(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || "").join("").trim();
}

// Gemini reports 429s with a retryDelay (e.g. "12s") inside
// error.details[], not a "try again in Xs" sentence like Groq. Handle both
// shapes so this keeps working if the pipeline ever mixes providers again.
function parseRetryAfterSeconds(raw) {
  let sec = null;
  try {
    const parsed = JSON.parse(raw);
    const detail = parsed?.error?.details?.find((d) => d.retryDelay);
    if (detail) sec = parseFloat(detail.retryDelay);
  } catch {}
  if (sec == null) {
    const m = /try again in ([\d.]+)s/i.exec(raw || "");
    if (m) sec = parseFloat(m[1]);
  }
  if (sec == null) return 5;
  // Small buffer so a retry doesn't land right at the reset instant.
  return Math.min(Math.ceil(sec * 1.3) + 1, 18);
}

// Free-tier endpoints can burst past their per-minute request/token caps.
// That's transient, not exhaustion, so retry with the wait time the
// provider reports before giving up. attempts=4 with an 18s cap keeps
// worst case under the 60s maxDuration set for this function in vercel.json.
async function fetchWithRetry(base, headers, body, attempts = 4) {
  let lastRaw = "", lastStatus = 0;
  for (let i = 0; i < attempts; i++) {
    const r = await fetch(base, { method: "POST", headers, body: JSON.stringify(body) });
    const raw = await r.text();
    if (r.ok) return { ok: true, raw };
    lastRaw = raw;
    lastStatus = r.status;
    if (r.status !== 429 || i === attempts - 1) break;
    const waitSec = parseRetryAfterSeconds(raw);
    await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
  }
  return { ok: false, raw: lastRaw, status: lastStatus };
}

export default async function handler(req, res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "Content-Type");
  res.setHeader("cache-control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is not configured in Vercel environment variables."
    });
  }

  const series = String(req.body?.series || "").trim().slice(0, 160);
  const url = String(req.body?.url || "").trim();

  if (!series) return res.status(400).json({ error: "Series name is required." });
  if (badUrl(url)) {
    return res.status(400).json({ error: "A valid public http(s) episode URL is required." });
  }

  let playlistHint = "";
  try {
    const r = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0",
        accept: "application/vnd.apple.mpegurl,text/plain,*/*"
      },
      redirect: "follow",
    });
    // Kept small: even generous free tiers charge input tokens, and a huge
    // playlist blob adds nothing an episode/series name search doesn't
    // already give the model.
    if (r.ok) playlistHint = (await r.text()).slice(0, 800);
  } catch {}

  const prompt = `You are the metadata agent for a personal anime watch library.

User-provided series name:
${series}

Episode stream URL:
${url}

Identify the exact anime episode represented by this stream.

Use web search when necessary. Prefer IMDb for IMDb-specific facts and
reputable anime episode guides for episode numbering and titles.

Return:
1. Series name.
2. Season number.
3. Episode number.
4. Official/common episode title.
5. Concise episode summary.
6. Concise series summary.
7. Series IMDb ID, URL, release year, rating and genres.
8. Episode IMDb ID, URL and rating when an individual IMDb episode page exists.

Do NOT search for, provide, or infer subtitle download URLs. The user will
supply subtitles separately.

Never invent uncertain IDs, URLs, ratings or episode numbers. Say so plainly
when something is unknown, and note weak evidence explicitly.

Playlist text (may be empty):
${playlistHint}`;

  const geminiBase = (model) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
  const jsonHeaders = { "content-type": "application/json" };

  // Step 1: grounded research as free-form text. This model generation's
  // built-in google_search tool and its strict JSON response mode can't
  // both be relied on in the same call, so this stays a two-step pipeline,
  // just within one provider instead of two.
  let research;
  try {
    const result = await fetchWithRetry(geminiBase(MODEL), jsonHeaders, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
    });
    if (!result.ok) {
      return res.status(502).json({
        error: `Gemini returned HTTP ${result.status}`,
        detail: result.raw.slice(0, 1200),
      });
    }
    let parsed;
    try { parsed = JSON.parse(result.raw); }
    catch { return res.status(502).json({ error: "Gemini returned invalid JSON." }); }
    research = extractText(parsed);
  } catch (e) {
    return res.status(502).json({ error: `Gemini request failed: ${e?.message || e}` });
  }
  if (!research) return res.status(502).json({ error: "Gemini returned no research result." });
  research = research.slice(0, 4000);

  // Gemini's response schema is a restricted subset of OpenAPI's Schema
  // object: no `type: [...]` unions for nullable fields. Nullability is
  // expressed with a separate `nullable: true` flag instead.
  const nullableString = { type: "string", nullable: true };
  const nullableInteger = { type: "integer", nullable: true };
  const nullableNumber = { type: "number", nullable: true };

  const schema = {
    type: "object",
    properties: {
      series: { type: "string" },
      seasonNumber: nullableInteger,
      episodeNumber: nullableInteger,
      episodeCode: { type: "string" },
      episodeTitle: { type: "string" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },

      seriesYear: nullableInteger,
      seriesImdbId: nullableString,
      seriesImdbUrl: nullableString,
      seriesImdbRating: nullableNumber,
      seriesGenres: { type: "array", items: { type: "string" } },
      seriesSummary: { type: "string" },

      episodeImdbId: nullableString,
      episodeImdbUrl: nullableString,
      episodeImdbRating: nullableNumber,
      episodeSummary: { type: "string" },

      metadataNotes: { type: "string" }
    },
    required: [
      "series","seasonNumber","episodeNumber","episodeCode","episodeTitle","confidence",
      "seriesYear","seriesImdbId","seriesImdbUrl","seriesImdbRating","seriesGenres",
      "seriesSummary","episodeImdbId","episodeImdbUrl","episodeImdbRating",
      "episodeSummary","metadataNotes"
    ]
  };

  // Step 2: turn the research text into the strict JSON shape the UI
  // expects. No tools here, just responseSchema-constrained generation.
  let response;
  try {
    const result = await fetchWithRetry(geminiBase(MODEL), jsonHeaders, {
      contents: [{
        role: "user",
        parts: [{
          text: `Convert the following research notes into the required structured fields. Use null where information is not confidently known.\n\nResearch notes:\n${research}`
        }],
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });
    if (!result.ok) {
      return res.status(502).json({
        error: `Gemini returned HTTP ${result.status}`,
        detail: result.raw.slice(0, 1200),
      });
    }
    response = JSON.parse(result.raw);
  } catch (e) {
    return res.status(502).json({ error: `Gemini request failed: ${e?.message || e}` });
  }

  const text = extractText(response);
  if (!text) return res.status(502).json({ error: "Gemini returned no structured result." });

  let data;
  try { data = JSON.parse(text); }
  catch { return res.status(502).json({ error: "Gemini returned non-JSON metadata." }); }

  for (const key of ["seriesImdbUrl", "episodeImdbUrl"]) {
    if (data[key] && badUrl(data[key])) data[key] = null;
  }

  return res.status(200).json(data);
}
