/**
 * Server-side fetcher for a subtitle URL supplied by the user.
 *
 * POST /api/subtitle
 * Body: { url: "https://.../subtitle.srt" }
 *
 * The browser stores the returned text in its library, so the subtitle is
 * preserved even if the original URL later disappears.
 */
export const config = { runtime: "nodejs" };

const MAX_URL_LENGTH = 4096;
const MAX_SUBTITLE_BYTES = 2 * 1024 * 1024;

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

export default async function handler(req, res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "Content-Type");
  res.setHeader("cache-control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const url = String(req.body?.url || "").trim();
  if (badUrl(url)) {
    return res.status(400).json({ error: "Enter a valid public http(s) subtitle URL." });
  }

  let upstream;
  try {
    upstream = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0",
        accept: "text/plain,text/vtt,application/x-subrip,*/*",
      },
    });
  } catch (e) {
    return res.status(502).json({ error: `Subtitle fetch failed: ${e?.message || e}` });
  }

  if (!upstream.ok) {
    return res.status(502).json({
      error: `Subtitle server returned HTTP ${upstream.status}.`
    });
  }

  const length = Number(upstream.headers.get("content-length") || 0);
  if (length > MAX_SUBTITLE_BYTES) {
    return res.status(413).json({ error: "Subtitle file is larger than 2 MB." });
  }

  let text;
  try { text = await upstream.text(); }
  catch (e) {
    return res.status(502).json({ error: `Couldn't read subtitle file: ${e?.message || e}` });
  }

  if (new TextEncoder().encode(text).byteLength > MAX_SUBTITLE_BYTES) {
    return res.status(413).json({ error: "Subtitle file is larger than 2 MB." });
  }

  if (!text.trim()) return res.status(422).json({ error: "Subtitle file is empty." });

  return res.status(200).json({
    url,
    text,
    contentType: upstream.headers.get("content-type") || "text/plain"
  });
}
