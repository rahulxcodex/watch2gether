/**
 * Groq-powered anime library metadata (free tier).
 *
 * POST /api/identify
 * Body: { series: string, url: string }
 *
 * Groq handles metadata/web research only. Subtitle files are supplied by
 * the user through the library UI and are never searched for by Groq.
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

export default async function handler(req, res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "Content-Type");
  res.setHeader("cache-control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "GROQ_API_KEY is not configured in Vercel environment variables."
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
    // large request bodies get rejected with a 413 as a result.
    if (r.ok) playlistHint = (await r.text()).slice(0, 1500);
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
  // schema output, and the structured-output models don't have web search.
  // So this runs in two small free-tier calls:
  // 1) groq/compound does the grounded research as free-form text, then
  // 2) openai/gpt-oss-120b turns that research into the strict JSON shape
  //    the UI expects.
  const base = "https://api.groq.com/openai/v1/chat/completions";
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };

  let research;
  try {
    const r = await fetch(base, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "groq/compound",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const raw = await r.text();
    if (!r.ok) {
      return res.status(502).json({
        error: `Groq returned HTTP ${r.status}`,
        detail: raw.slice(0, 1200),
      });
    }
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return res.status(502).json({ error: "Groq returned invalid JSON." }); }
    research = extractText(parsed);
  } catch (e) {
    return res.status(502).json({ error: `Groq request failed: ${e?.message || e}` });
  }
  if (!research) return res.status(502).json({ error: "Groq returned no research result." });
  research = research.slice(0, 6000);

  let upstream;
  try {
    upstream = await fetch(base, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
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
      }),
    });
  } catch (e) {
    return res.status(502).json({ error: `Groq request failed: ${e?.message || e}` });
  }

  const raw = await upstream.text();
  if (!upstream.ok) {
    return res.status(502).json({
      error: `Groq returned HTTP ${upstream.status}`,
      detail: raw.slice(0, 1200),
    });
  }

  let response;
  try { response = JSON.parse(raw); }
  catch { return res.status(502).json({ error: "Groq returned invalid JSON." }); }

  const text = extractText(response);
  if (!text) return res.status(502).json({ error: "Groq returned no structured result." });

  let data;
  try { data = JSON.parse(text); }
  catch { return res.status(502).json({ error: "Groq returned non-JSON metadata." }); }

  for (const key of ["seriesImdbUrl", "episodeImdbUrl"]) {
    if (data[key] && badUrl(data[key])) data[key] = null;
  }

  return res.status(200).json(data);
}
