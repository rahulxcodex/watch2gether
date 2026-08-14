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
// Kept in sync with the client-side upload cap in web/app.js and the
// firebase/database.rules.json subtitleText limit — all three used to
// disagree (1.5MB / 2MB / 1.5MB chars), so a URL-fetched subtitle between
// 1.5MB and 2MB would pass this endpoint and then get silently rejected by
// the Firebase write with no error shown to the user.
const MAX_SUBTITLE_BYTES = 1500000;

/* badUrl/safeFetch used to pattern-match the hostname *string*, which stops
 * a literal "http://169.254.169.254/..." but not a hostname whose DNS
 * record simply resolves to that address (rebinding). Both now resolve and
 * check the real IP, at every redirect hop — see api/_security.js. */
import { safeFetch, isBadUrl } from "./_security.js";
const badUrl = (value) => isBadUrl(value, MAX_URL_LENGTH);

export default async function handler(req, res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "Content-Type");
  res.setHeader("cache-control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const url = String(req.body?.url || "").trim();
  if (await badUrl(url)) {
    return res.status(400).json({ error: "Enter a valid public http(s) subtitle URL." });
  }

  let upstream;
  try {
    upstream = await safeFetch(url, {
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
    return res.status(413).json({ error: "Subtitle file is larger than 1.5 MB." });
  }

  let text;
  try { text = await upstream.text(); }
  catch (e) {
    return res.status(502).json({ error: `Couldn't read subtitle file: ${e?.message || e}` });
  }

  if (new TextEncoder().encode(text).byteLength > MAX_SUBTITLE_BYTES) {
    return res.status(413).json({ error: "Subtitle file is larger than 1.5 MB." });
  }

  if (!text.trim()) return res.status(422).json({ error: "Subtitle file is empty." });

  return res.status(200).json({
    url,
    text,
    contentType: upstream.headers.get("content-type") || "text/plain"
  });
}
