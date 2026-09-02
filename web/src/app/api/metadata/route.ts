import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Movie / TV show metadata search route with open fallback.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json({ results: [] });
  }

  try {
    // Open IMDb suggestion API lookup
    const cleanQuery = q.toLowerCase().replace(/[^a-z0-9]/g, "_");
    const prefix = cleanQuery.charAt(0);
    const imdbUrl = `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(cleanQuery)}.json`;

    const res = await fetch(imdbUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ results: [] });
    }

    const data = await res.json();
    const suggestions = (data.d || []).slice(0, 8).map((item: any) => ({
      id: item.id,
      title: item.l,
      year: item.y,
      type: item.q,
      actors: item.s,
      posterUrl: item.i?.imageUrl || null,
    }));

    return NextResponse.json({ results: suggestions });
  } catch (err: any) {
    return NextResponse.json({ results: [], error: err.message }, { status: 200 });
  }
}
