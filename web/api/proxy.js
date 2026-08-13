/**
 * Vercel CORS / HLS proxy.
 *
 * GET /api/proxy?url=<target-url>
 *
 * - Fetches the target server-side.
 * - Forwards Range requests.
 * - Adds CORS headers.
 * - Rewrites HLS playlists so segments and nested playlists
 *   continue through this same proxy.
 */

export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,HEAD,OPTIONS");
  res.setHeader("access-control-allow-headers", "Range");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const target = req.query?.url;

  if (!target || typeof target !== "string") {
    return res.status(400).json({ error: "Bad or missing ?url=" });
  }

  if (!/^https?:\/\//i.test(target)) {
    return res.status(400).json({ error: "Only http(s) URLs are allowed" });
  }

  let t;
  try {
    t = new URL(target);
  } catch {
    return res.status(400).json({ error: "Bad URL" });
  }

  // Same private/local target guard as worker/src/index.js.
  if (
    /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|::1)/i.test(t.hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(t.hostname)
  ) {
    return res.status(400).json({ error: "Refused" });
  }

  const upstreamHeaders = new Headers();
  const range = req.headers.range;

  if (range) upstreamHeaders.set("range", range);
  upstreamHeaders.set("user-agent", "Mozilla/5.0");
  upstreamHeaders.set("accept", "*/*");

  let upstream;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers: upstreamHeaders,
      redirect: "follow",
    });
  } catch (e) {
    return res.status(502).json({
      error: `Upstream fetch failed: ${e?.message || e}`,
    });
  }

  // Copy only the headers requested for this proxy.
  for (const header of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
  ]) {
    const value = upstream.headers.get(header);
    if (value) res.setHeader(header, value);
  }

  const contentType = upstream.headers.get("content-type") || "";
  const isHls =
    /mpegurl/i.test(contentType) ||
    /\.m3u8(?:$|[?#])/i.test(target);

  if (isHls) {
    let text;

    try {
      text = await upstream.text();
    } catch (e) {
      return res.status(502).json({
        error: `Could not read HLS playlist: ${e?.message || e}`,
      });
    }

    const forwardedProto = req.headers["x-forwarded-proto"];
    const protocol = Array.isArray(forwardedProto)
      ? forwardedProto[0]
      : (forwardedProto || "https");

    const host = req.headers.host;
    const proxyBase =
      `${protocol}://${host}/api/proxy?url=`;

    const rewritten = text
      .split(/\r?\n/)
      .map((line) => {
        const trimmed = line.trim();

        if (!trimmed) return line;

        // HLS tags can contain URI="..." attributes, e.g. EXT-X-KEY
        // and EXT-X-MAP. Rewrite every URI attribute.
        if (trimmed.startsWith("#")) {
          return line.replace(/URI="([^"]+)"/gi, (_match, uri) => {
            try {
              const absolute = new URL(uri, target).href;
              return `URI="${proxyBase}${encodeURIComponent(absolute)}"`;
            } catch {
              return `URI="${uri}"`;
            }
          });
        }

        // Non-comment lines are media/playlist URLs. Resolve them against
        // the URL of the playlist, then point them back at this proxy.
        try {
          const absolute = new URL(trimmed, target).href;
          return `${proxyBase}${encodeURIComponent(absolute)}`;
        } catch {
          return line;
        }
      })
      .join("\n");

    // The rewritten body has a different length.
    res.removeHeader("content-length");
    res.setHeader("content-type", "application/vnd.apple.mpegurl");

    return res.status(upstream.status).send(rewritten);
  }

  if (req.method === "HEAD" || !upstream.body) {
    return res.status(upstream.status).end();
  }

  // Stream non-HLS responses through unchanged.
  try {
    const reader = upstream.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }

    return res.end();
  } catch (e) {
    try {
      return res.end();
    } catch {}
  }
}
