import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("url");

  if (!target || !/^https?:\/\//i.test(target)) {
    return NextResponse.json({ error: "Enter a valid public http(s) URL." }, { status: 400 });
  }

  let t: URL;
  try {
    t = new URL(target);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (
    /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|::1)/i.test(t.hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(t.hostname)
  ) {
    return NextResponse.json({ error: "Private network access refused." }, { status: 400 });
  }

  const range = req.headers.get("range");
  const upstreamHeaders: Record<string, string> = {
    "User-Agent": "Watch2Gether/1.0",
    Accept: "*/*",
  };
  if (range) upstreamHeaders["Range"] = range;

  try {
    const upstream = await fetch(target, {
      method: "GET",
      headers: upstreamHeaders,
    });

    const responseHeaders = new Headers();
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "Range");

    for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "etag"]) {
      const val = upstream.headers.get(h);
      if (val) responseHeaders.set(h, val);
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Proxy upstream fetch failed" }, { status: 502 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
      "Access-Control-Allow-Headers": "Range",
    },
  });
}
