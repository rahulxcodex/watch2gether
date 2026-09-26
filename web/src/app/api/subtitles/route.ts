import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Subtitles proxy and open search endpoint.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  // If a direct subtitle URL is requested, fetch and return it with permissive CORS
  if (url) {
    try {
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return NextResponse.json({ error: "Invalid subtitle URL" }, { status: 400 });
      }

      let t: URL;
      try {
        t = new URL(url);
      } catch {
        return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
      }

      if (
        /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|::1)/i.test(t.hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(t.hostname) ||
        t.hostname.endsWith(".local") ||
        t.hostname.endsWith(".internal")
      ) {
        return NextResponse.json(
          { error: "Private network access refused." },
          { status: 400 }
        );
      }

      const res = await fetch(url, {
        headers: { "User-Agent": "Watch2Gether/1.0" },
      });

      if (!res.ok) {
        return NextResponse.json({ error: "Failed to load subtitle file" }, { status: 502 });
      }

      const text = await res.text();
      return new NextResponse(text, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err: any) {
      return NextResponse.json({ error: err.message || "Proxy error" }, { status: 500 });
    }
  }

  return NextResponse.json({
    subtitles: [],
    message: "Specify ?url= to proxy subtitle text",
  });
}
