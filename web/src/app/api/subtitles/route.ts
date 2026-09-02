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
