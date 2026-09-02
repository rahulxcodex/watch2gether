import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handleProxyRequest(req, "GET");
}

export async function HEAD(req: NextRequest) {
  return handleProxyRequest(req, "HEAD");
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type, Accept",
      "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
    },
  });
}

async function handleProxyRequest(req: NextRequest, method: "GET" | "HEAD") {
  const { searchParams } = new URL(req.url);
  let target = searchParams.get("url");
  if (target) {
    target = target.trim().replace(/^[^a-z0-9]*(?:r|view-source:)?(https?:\/\/)/i, "$1");
  }

  if (!target || !/^https?:\/\//i.test(target)) {
    return NextResponse.json(
      { error: "Enter a valid public http(s) URL." },
      { status: 400 }
    );
  }

  let t: URL;
  try {
    t = new URL(target);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Guard against loopback and local networks
  if (
    /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|::1)/i.test(t.hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(t.hostname)
  ) {
    return NextResponse.json(
      { error: "Private network access refused." },
      { status: 400 }
    );
  }

  const range = req.headers.get("range");
  const customReferer = searchParams.get("referer") || req.headers.get("x-proxy-referer");

  const upstreamHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Accept: "*/*",
  };

  // Only pass Referer if explicitly requested by client — NEVER default to t.origin + "/"
  // because upstream media CDNs (e.g. info.movieboxnoob.cc) trigger 403 WAF blocks on origin referrers.
  if (customReferer) {
    upstreamHeaders["Referer"] = customReferer;
  }
  if (range) upstreamHeaders["Range"] = range;

  try {
    const upstream = await fetch(target, {
      method,
      headers: upstreamHeaders,
    });

    const responseHeaders = new Headers();
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "Range, Content-Type, Accept");
    responseHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");

    for (const h of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "etag",
      "cache-control",
    ]) {
      const val = upstream.headers.get(h);
      if (val) responseHeaders.set(h, val);
    }
    if (!responseHeaders.has("accept-ranges")) {
      responseHeaders.set("accept-ranges", "bytes");
    }

    // If upstream returned an error (e.g. 403, 404, 500), return as-is without attempting M3U8 parsing
    if (!upstream.ok) {
      return new NextResponse(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    }

    const contentType = upstream.headers.get("content-type") || "";
    const contentLength = Number(upstream.headers.get("content-length") || 0);
    const isExplicitHls =
      /mpegurl|m3u8/i.test(contentType) ||
      /\.m3u8(?:$|[?#])/i.test(target);

    // If it's an explicit HLS playlist (.m3u8 or mpegurl), ALWAYS rewrite it even if the browser sent Range: bytes=0-
    const couldBeHlsPlaylist =
      method === "GET" &&
      !contentType.startsWith("video/") &&
      !contentType.startsWith("audio/") &&
      (isExplicitHls || (!range && (!contentLength || contentLength < 1500000)));

    if (couldBeHlsPlaylist) {
      const buffer = await upstream.arrayBuffer();
      const magic = Buffer.from(buffer.slice(0, 16)).toString("utf-8").trimStart();
      const text = Buffer.from(buffer).toString("utf-8");
      const isRealHls =
        magic.startsWith("#EXTM3U") ||
        text.includes("#EXTINF:") ||
        text.includes("#EXT-X-STREAM-INF:");

      if (isRealHls) {
        // Absolute proxyBase ensures that all clients (browser, mobile, ExoPlayer) resolve cleanly to the proxy
        const proxyBase = `${new URL(req.url).origin}/api/proxy?url=`;

        const rewritten = text
          .split(/\r?\n/)
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return line;

            // Rewrite URI="..." attributes in HLS tags (e.g. EXT-X-KEY, EXT-X-MAP, EXT-X-MEDIA)
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

            // Non-comment lines in .m3u8 are media segments (.ts, .html, .jpg, .png) or child playlist URLs
            try {
              const absolute = new URL(trimmed, target).href;
              return `${proxyBase}${encodeURIComponent(absolute)}`;
            } catch {
              return line;
            }
          })
          .join("\n");

        responseHeaders.delete("content-length");
        responseHeaders.delete("content-range");
        responseHeaders.set("cache-control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        responseHeaders.set("content-type", "application/vnd.apple.mpegurl");
        return new NextResponse(rewritten, {
          status: 200,
          headers: responseHeaders,
        });
      }

      // If it wasn't HLS, normalize MIME type if upstream disguised video/audio as text/html
      if (
        /video_|\.mp4|\.m4s|_init\./i.test(target) ||
        contentType.includes("text/html") && /video/i.test(target)
      ) {
        responseHeaders.set("content-type", "video/mp4");
      } else if (/audio_/i.test(target)) {
        responseHeaders.set("content-type", "audio/mp4");
      } else if (/\.ts(?:$|[?#])/i.test(target)) {
        responseHeaders.set("content-type", "video/mp2t");
      }

      return new NextResponse(buffer, {
        status: upstream.status,
        headers: responseHeaders,
      });
    }

    // Media streaming (segments, MP4s): normalize disguised MIME types
    if (
      /video_|\.mp4|\.m4s|_init\./i.test(target) ||
      contentType.includes("text/html") && /video/i.test(target)
    ) {
      responseHeaders.set("content-type", "video/mp4");
    } else if (/audio_/i.test(target)) {
      responseHeaders.set("content-type", "audio/mp4");
    } else if (/\.ts(?:$|[?#])/i.test(target)) {
      responseHeaders.set("content-type", "video/mp2t");
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Proxy upstream fetch failed" },
      { status: 502 }
    );
  }
}
