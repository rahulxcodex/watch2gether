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
  const upstreamHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Accept: "*/*",
    Referer: t.origin + "/",
  };
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

    const contentType = upstream.headers.get("content-type") || "";
    const contentLength = Number(upstream.headers.get("content-length") || 0);
    const isExplicitHls =
      /mpegurl|m3u8/i.test(contentType) ||
      /\.m3u8(?:$|[?#])/i.test(target);

    // If it's a GET request and not a byte-range request, check if it's an HLS playlist
    // (either explicitly by URL/MIME or disguised under .jpg/.png/.txt with < 1.5MB size)
    const couldBeHlsPlaylist =
      method === "GET" &&
      !range &&
      !contentType.startsWith("video/") &&
      !contentType.startsWith("audio/") &&
      (isExplicitHls || !contentLength || contentLength < 1500000);

    if (couldBeHlsPlaylist) {
      const buffer = await upstream.arrayBuffer();
      const magic = Buffer.from(buffer.slice(0, 16)).toString("utf-8").trimStart();
      const isHls = magic.startsWith("#EXTM3U") || isExplicitHls;

      if (isHls) {
        const text = Buffer.from(buffer).toString("utf-8");
        const proxyBase = "/api/proxy?url=";

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

            // Non-comment lines in .m3u8 are media segments (.ts, .jpg, .png) or child playlist URLs
            try {
              const absolute = new URL(trimmed, target).href;
              return `${proxyBase}${encodeURIComponent(absolute)}`;
            } catch {
              return line;
            }
          })
          .join("\n");

        responseHeaders.delete("content-length");
        responseHeaders.set("content-type", "application/vnd.apple.mpegurl");
        return new NextResponse(rewritten, {
          status: upstream.status,
          headers: responseHeaders,
        });
      }

      // If it wasn't HLS, return the uncorrupted binary buffer
      return new NextResponse(buffer, {
        status: upstream.status,
        headers: responseHeaders,
      });
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
