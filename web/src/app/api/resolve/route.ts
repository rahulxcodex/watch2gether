import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export interface ResolvedMedia {
  streamUrl: string;
  resolvedUrl: string;
  originalUrl: string;
  mediaType: "MP4" | "YOUTUBE" | "HLS" | "LOCAL_FILE";
  title?: string;
  poster?: string;
  subtitleUrl?: string;
  needsProxy?: boolean;
  provider: "archive_org" | "youtube" | "dropbox" | "googledrive" | "vimeo" | "direct";
}

async function resolveUrl(rawUrlInput: string): Promise<NextResponse> {
  let rawUrl = String(rawUrlInput || "").trim();

  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // Clean leading junk or copy-paste artifacts
  rawUrl = rawUrl.replace(/^[^a-z0-9]*(?:r|view-source:)?(https?:\/\/)/i, "$1").split(/\s+/)[0];

  if (!/^https?:\/\//i.test(rawUrl)) {
    return NextResponse.json({ error: "Enter a valid public http(s) URL." }, { status: 400 });
  }

  // 1. YouTube Detection
  if (/youtube\.com|youtu\.be/i.test(rawUrl)) {
    return NextResponse.json({
      streamUrl: rawUrl,
      resolvedUrl: rawUrl,
      originalUrl: rawUrl,
      mediaType: "YOUTUBE",
      provider: "youtube",
    } satisfies ResolvedMedia);
  }

  // 2. Internet Archive (archive.org) Detection
  const archiveMatch = rawUrl.match(/archive\.org\/(?:details|embed|download|stream)\/([^/?#\s]+)/i);
  if (archiveMatch) {
    const identifier = decodeURIComponent(archiveMatch[1]);
    try {
      const metaRes = await fetch(`https://archive.org/metadata/${identifier}`, {
        headers: { "User-Agent": "Watch2Gether/2.0" },
        signal: AbortSignal.timeout(8000),
      });

      if (metaRes.ok) {
        const data = await metaRes.json();
        const files: any[] = Array.isArray(data.files) ? data.files : [];

        // Find playable video files
        const videoCandidates = files.filter((f) => {
          const name = String(f.name || "").toLowerCase();
          const format = String(f.format || "").toLowerCase();
          return (
            name.endsWith(".mp4") ||
            name.endsWith(".m3u8") ||
            format.includes("h.264") ||
            format.includes("mp4") ||
            format.includes("m3u8")
          );
        });

        if (videoCandidates.length > 0) {
          // Sort by highest resolution / bitrate / file size
          videoCandidates.sort((a, b) => {
            const sizeA = Number(a.size || 0);
            const sizeB = Number(b.size || 0);
            return sizeB - sizeA;
          });

          // Pick the best candidate
          const targetFileName = videoCandidates[0].name;

          // Also check for subtitle files (.srt or .vtt)
          const subFile = files.find((f) => {
            const name = String(f.name || "").toLowerCase();
            return name.endsWith(".srt") || name.endsWith(".vtt");
          });

          const resolvedUrl = `https://archive.org/download/${identifier}/${encodeURIComponent(targetFileName)}`;
          const isHls = targetFileName.endsWith(".m3u8");

          return NextResponse.json({
            streamUrl: resolvedUrl,
            resolvedUrl,
            originalUrl: rawUrl,
            mediaType: isHls ? "HLS" : "MP4",
            title: data.metadata?.title || identifier.replace(/_/g, " "),
            poster: `https://archive.org/services/img/${identifier}`,
            subtitleUrl: subFile
              ? `https://archive.org/download/${identifier}/${encodeURIComponent(subFile.name)}`
              : undefined,
            needsProxy: true,
            provider: "archive_org",
          } satisfies ResolvedMedia);
        }
      }
    } catch (err) {
      console.warn("Archive.org metadata lookup error:", err);
    }
  }

  // 3. Dropbox Direct Link Transformation
  if (/dropbox\.com/i.test(rawUrl)) {
    let resolvedUrl = rawUrl;
    if (resolvedUrl.includes("dl=0")) {
      resolvedUrl = resolvedUrl.replace("dl=0", "raw=1");
    } else if (!resolvedUrl.includes("raw=1")) {
      resolvedUrl += (resolvedUrl.includes("?") ? "&" : "?") + "raw=1";
    }
    return NextResponse.json({
      streamUrl: resolvedUrl,
      resolvedUrl,
      originalUrl: rawUrl,
      mediaType: "MP4",
      provider: "dropbox",
    } satisfies ResolvedMedia);
  }

  // 4. Google Drive Direct Stream
  const gDriveMatch = rawUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (gDriveMatch) {
    const fileId = gDriveMatch[1];
    const resolvedUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    return NextResponse.json({
      streamUrl: resolvedUrl,
      resolvedUrl,
      originalUrl: rawUrl,
      mediaType: "MP4",
      needsProxy: true,
      provider: "googledrive",
    } satisfies ResolvedMedia);
  }

  // 5. Default HLS vs MP4 Detection
  const isExplicitHls = /\.m3u8(?:[?#]|$)/i.test(rawUrl) || rawUrl.includes("/hls/");
  return NextResponse.json({
    streamUrl: rawUrl,
    resolvedUrl: rawUrl,
    originalUrl: rawUrl,
    mediaType: isExplicitHls ? "HLS" : "MP4",
    needsProxy: isExplicitHls,
    provider: "direct",
  } satisfies ResolvedMedia);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url") || "";
    return await resolveUrl(url);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to resolve media URL" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const url = String(body?.url || "");
    return await resolveUrl(url);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to resolve media URL" },
      { status: 500 }
    );
  }
}
