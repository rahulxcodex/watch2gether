import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_SUBTITLE_BYTES = 1500000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const url = String(body?.url || "").trim();

    if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
      return NextResponse.json(
        { error: "Enter a valid public http(s) subtitle URL." },
        { status: 400 }
      );
    }

    const upstream = await fetch(url, {
      headers: {
        "User-Agent": "Watch2Gether/1.0",
        Accept: "text/plain,text/vtt,application/x-subrip,*/*",
      },
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Subtitle server returned HTTP ${upstream.status}.` },
        { status: 502 }
      );
    }

    const text = await upstream.text();
    if (new TextEncoder().encode(text).byteLength > MAX_SUBTITLE_BYTES) {
      return NextResponse.json(
        { error: "Subtitle file is larger than 1.5 MB." },
        { status: 413 }
      );
    }

    if (!text.trim()) {
      return NextResponse.json({ error: "Subtitle file is empty." }, { status: 422 });
    }

    return NextResponse.json({
      url,
      text,
      contentType: upstream.headers.get("content-type") || "text/plain",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Subtitle fetch failed: ${e?.message || e}` },
      { status: 502 }
    );
  }
}
