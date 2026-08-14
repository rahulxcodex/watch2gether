/**
 * Gemini-powered anime library metadata (free tier).
 *
 * POST /api/identify
 * Body: { series: string, url: string }
 *
 * Gemini handles metadata/web research only. Subtitle files are supplied by
 * the user through the library UI and are never searched for by Gemini.
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
  const parts = response?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    if (typeof part.text === "string" && part.text) return part.text;
  }
  return "";
}

export default async function handler(req, res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "Content-Type");
  res.setHeader("cache-control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
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
    if (r.ok) playlistHint = (await r.text()).slice(0, 12000);
  } catch {}

  // Gemini's structured-output schema is OpenAPI-style: nullable fields use
  // `nullable: true` alongside a single `type` rather than a type array.
  const schema = {
    type: "object",
    properties: {
      series: { type: "string" },
      seasonNumber: { type: "integer", nullable: true },
      episodeNumber: { type: "integer", nullable: true },
      episodeCode: { type: "string" },
      episodeTitle: { type: "string" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },

      seriesYear: { type: "integer", nullable: true },
      seriesImdbId: { type: "string", nullable: true },
      seriesImdbUrl: { type: "string", nullable: true },
      seriesImdbRating: { type: "number", nullable: true },
      seriesGenres: { type: "array", items: { type: "string" } },
      seriesSummary: { type: "string" },

      episodeImdbId: { type: "string", nullable: true },
      episodeImdbUrl: { type: "string", nullable: true },
      episodeImdbRating: { type: "number", nullable: true },
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

  // Gemini can't combine the google_search grounding tool with a strict
  // responseSchema in a single call, so this runs in two small steps:
  // 1) a grounded research pass (free-form text, web search enabled), then
  // 2) a structuring pass that turns that research into the strict JSON
  //    shape the UI expects (no tools, so responseSchema is honored).
  const model = "gemini-3.1-flash-lite";
  const base = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  let research;
  try {
    const r = await fetch(`${base}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
    });
    const raw = await r.text();
    if (!r.ok) {
      return res.status(502).json({
        error: `Gemini returned HTTP ${r.status}`,
        detail: raw.slice(0, 1200),
      });
    }
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return res.status(502).json({ error: "Gemini returned invalid JSON." }); }
    research = extractText(parsed);
  } catch (e) {
    return res.status(502).json({ error: `Gemini request failed: ${e?.message || e}` });
  }
  if (!research) return res.status(502).json({ error: "Gemini returned no research result." });

  let upstream;
  try {
    upstream = await fetch(`${base}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
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
      }),
    });
  } catch (e) {
    return res.status(502).json({ error: `Gemini request failed: ${e?.message || e}` });
  }

  const raw = await upstream.text();
  if (!upstream.ok) {
    return res.status(502).json({
      error: `Gemini returned HTTP ${upstream.status}`,
      detail: raw.slice(0, 1200),
    });
  }

  let response;
  try { response = JSON.parse(raw); }
  catch { return res.status(502).json({ error: "Gemini returned invalid JSON." }); }

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
