/**
 * Grok-powered anime library metadata.
 *
 * POST /api/identify
 * Body: { series: string, url: string }
 *
 * Grok handles metadata/web research only. Subtitle files are supplied by the
 * user through the library UI and are never searched for by Grok.
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
  if (typeof response.output_text === "string" && response.output_text) {
    return response.output_text;
  }
  for (const item of response.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
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

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "XAI_API_KEY is not configured in Vercel environment variables."
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

  let upstream;
  try {
    upstream = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        input: [{ role: "user", content: prompt }],
        tools: [{ type: "web_search" }],
        text: {
          format: {
            type: "json_schema",
            name: "anime_library_metadata",
            schema,
            strict: true,
          },
        },
      }),
    });
  } catch (e) {
    return res.status(502).json({ error: `xAI request failed: ${e?.message || e}` });
  }

  const raw = await upstream.text();
  if (!upstream.ok) {
    return res.status(502).json({
      error: `xAI returned HTTP ${upstream.status}`,
      detail: raw.slice(0, 1200),
    });
  }

  let response;
  try { response = JSON.parse(raw); }
  catch { return res.status(502).json({ error: "xAI returned invalid JSON." }); }

  const text = extractText(response);
  if (!text) return res.status(502).json({ error: "xAI returned no structured result." });

  let data;
  try { data = JSON.parse(text); }
  catch { return res.status(502).json({ error: "xAI returned non-JSON metadata." }); }

  for (const key of ["seriesImdbUrl", "episodeImdbUrl"]) {
    if (data[key] && badUrl(data[key])) data[key] = null;
  }

  return res.status(200).json(data);
}
