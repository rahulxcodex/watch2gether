/**
 * Anime library metadata, split across two free-tier providers so a single
 * provider's per-minute token cap doesn't stall the whole pipeline.
 *
 * POST /api/identify
 * Body: { series: string, url: string }
 *
 * Step 1 (research/web search): Groq `groq/compound`.
 * Step 2 (structured JSON):      OpenRouter `openai/gpt-oss-20b:free`.
 *
 * These are two separate free tiers with separate quotas, so load is spread
 * across providers instead of hammering Groq's 30k TPM cap twice per request.
 * Subtitle files are supplied by the user through the library UI and are
 * never searched for by either model.
 */
export const config = { runtime: "nodejs" };

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

function extractText(response) {
  return response?.choices?.[0]?.message?.content || "";
}

function parseRetryAfterSeconds(text) {
  const m = /try again in ([\d.]+)s/i.exec(text || "");
  return m ? Math.min(Math.ceil(parseFloat(m[1])) + 1, 20) : 5;
}

// Free-tier chat completion endpoints can burst past their per-minute
// token/request caps. That's transient, not exhaustion, so retry a couple
// of times with the wait time the provider itself reports before giving up.
async function fetchWithRetry(base, headers, body, attempts = 3) {
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

  const groqKey = process.env.GROQ_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (!groqKey) {
    return res.status(500).json({
      error: "GROQ_API_KEY is not configured in Vercel environment variables."
    });
  }
  if (!openrouterKey) {
    return res.status(500).json({
      error: "OPENROUTER_API_KEY is not configured in Vercel environment variables."
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
    // Kept small: Groq's free tier has a low tokens-per-minute ceiling, and
    // groq/compound's own web-search step adds further tokens on top of
    // whatever we send, so keep our own contribution well under the cap.
    if (r.ok) playlistHint = (await r.text()).slice(0, 400);
  } catch {}

  // JSON Schema for Groq's OpenAI-compatible strict structured-output mode.
  const schema = {
    type: "object",
    properties: {
      series: { type: "string" },
      seasonNumber: { type: ["integer", "null"] },
      episodeNumber: { type: ["integer", "null"] },
      episodeCode: { type: "string" },
      episodeTitle: { type: "string" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },

      seriesYear: { type: ["integer", "null"] },
      seriesImdbId: { type: ["string", "null"] },
      seriesImdbUrl: { type: ["string", "null"] },
      seriesImdbRating: { type: ["number", "null"] },
      seriesGenres: { type: "array", items: { type: "string" } },
      seriesSummary: { type: "string" },

      episodeImdbId: { type: ["string", "null"] },
      episodeImdbUrl: { type: ["string", "null"] },
      episodeImdbRating: { type: ["number", "null"] },
      episodeSummary: { type: "string" },

      metadataNotes: { type: "string" }
    },
    required: [
      "series","seasonNumber","episodeNumber","episodeCode","episodeTitle","confidence",
      "seriesYear","seriesImdbId","seriesImdbUrl","seriesImdbRating","seriesGenres",
      "seriesSummary","episodeImdbId","episodeImdbUrl","episodeImdbRating",
      "episodeSummary","metadataNotes"
    ],
    additionalProperties: false
  };

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

Never invent uncertain IDs, URLs, ratings or episode numbers. Use null when
unavailable and set confidence to low when evidence is weak.

Playlist text (may be empty):
${playlistHint}`;

  // groq/compound has built-in web search but doesn't support strict JSON
  // schema output. So this runs across two different free tiers:
  // 1) Groq's groq/compound does the grounded research as free-form text,
  // 2) OpenRouter's openai/gpt-oss-20b:free turns that research into the
  //    strict JSON shape the UI expects.
  // Splitting the two calls across providers means neither one's per-minute
  // cap has to absorb both requests.
  const groqBase = "https://api.groq.com/openai/v1/chat/completions";
  const groqHeaders = {
    "content-type": "application/json",
    authorization: `Bearer ${groqKey}`,
  };

  let research;
  try {
    const result = await fetchWithRetry(groqBase, groqHeaders, {
      model: "groq/compound",
      messages: [{ role: "user", content: prompt }],
      // Caps the response so input + output can't together exceed the
      // free-tier per-request/per-minute token ceiling (413 request_too_large
      // is a hard cap, not a transient rate limit, so retrying won't help).
      max_completion_tokens: 1200,
    });
    if (!result.ok) {
      return res.status(502).json({
        error: `Groq returned HTTP ${result.status}`,
        detail: result.raw.slice(0, 1200),
      });
    }
    let parsed;
    try { parsed = JSON.parse(result.raw); }
    catch { return res.status(502).json({ error: "Groq returned invalid JSON." }); }
    research = extractText(parsed);
  } catch (e) {
    return res.status(502).json({ error: `Groq request failed: ${e?.message || e}` });
  }
  if (!research) return res.status(502).json({ error: "Groq returned no research result." });
  research = research.slice(0, 4000);

  // openai/gpt-oss-20b:free is the smallest/cheapest OpenRouter free model
  // that still supports strict json_schema structured outputs, so this
  // formatting step burns the fewest tokens against OpenRouter's daily
  // free-tier request cap.
  const openrouterBase = "https://openrouter.ai/api/v1/chat/completions";
  const openrouterHeaders = {
    "content-type": "application/json",
    authorization: `Bearer ${openrouterKey}`,
    // Optional but recommended by OpenRouter for free-tier attribution.
    "HTTP-Referer": "https://watch2gether-lilac.vercel.app",
    "X-Title": "Parallel Watch Library",
  };

  let response;
  try {
    const result = await fetchWithRetry(openrouterBase, openrouterHeaders, {
      model: "openai/gpt-oss-20b:free",
      messages: [{
        role: "user",
        content: `Convert the following research notes into the required structured fields. Use null where information is not confidently known.\n\nResearch notes:\n${research}`
      }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "anime_library_metadata",
          schema,
          strict: true,
        },
      },
    });
    if (!result.ok) {
      return res.status(502).json({
        error: `OpenRouter returned HTTP ${result.status}`,
        detail: result.raw.slice(0, 1200),
      });
    }
    try { response = JSON.parse(result.raw); }
    catch { return res.status(502).json({ error: "OpenRouter returned invalid JSON." }); }
  } catch (e) {
    return res.status(502).json({ error: `OpenRouter request failed: ${e?.message || e}` });
  }

  const text = extractText(response);
  if (!text) return res.status(502).json({ error: "OpenRouter returned no structured result." });

  let data;
  try { data = JSON.parse(text); }
  catch { return res.status(502).json({ error: "OpenRouter returned non-JSON metadata." }); }

  for (const key of ["seriesImdbUrl", "episodeImdbUrl"]) {
    if (data[key] && badUrl(data[key])) data[key] = null;
  }

  return res.status(200).json(data);
}
