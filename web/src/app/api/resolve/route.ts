import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface ResolvedMedia {
  resolvedUrl: string;
  originalUrl: string;
  mediaType: "MP4" | "YOUTUBE" | "HLS" | "LOCAL_FILE";
  title?: string;
  poster?: string;
  subtitleUrl?: string;
  needsProxy?: boolean;
  provider: "archive_org" | "youtube" | "dropbox" | "googledrive" | "vimeo" | "direct";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    let rawUrl = String(body?.url || "").trim();

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
              name.endsWith(".webm") ||
              format.includes("mp4") ||
              format.includes("h.264") ||
              format.includes("mpeg4")
            );
          });

          // Score candidates: prefer 720p/1080p H.264 MP4 over 512Kb over webm
          videoCandidates.sort((a, b) => {
            const score = (f: any) => {
              const name = String(f.name || "").toLowerCase();
              const format = String(f.format || "").toLowerCase();
              let s = 0;
              if (name.endsWith(".mp4") || format.includes("h.264")) s += 100;
              if (name.includes("720p") || format.includes("720p")) s += 50;
              if (name.includes("1080p") || format.includes("1080p")) s += 60;
              if (format.includes("512kb")) s += 40;
              if (name.endsWith(".m3u8")) s += 80;
              if (name.includes("thumb") || name.includes("sample")) s -= 100;
              return s;
            };
            return score(b) - score(a);
          });

          const bestVideo = videoCandidates[0];

          // Check if specific file was requested in the URL
          const requestedFileMatch = rawUrl.match(/archive\.org\/(?:download|stream)\/[^/?#\s]+\/([^?#\s]+)/i);
          let targetFileName = bestVideo ? bestVideo.name : null;
          if (requestedFileMatch && requestedFileMatch[1].endsWith(".mp4")) {
            targetFileName = decodeURIComponent(requestedFileMatch[1]);
          }

          if (targetFileName) {
            // Find accompanying subtitle if available (.srt or .vtt)
            const subFile = files.find((f) => {
              const name = String(f.name || "").toLowerCase();
              return name.endsWith(".srt") || name.endsWith(".vtt");
            });

            const resolvedUrl = `https://archive.org/download/${identifier}/${encodeURIComponent(targetFileName)}`;
            const isHls = targetFileName.endsWith(".m3u8");

            return NextResponse.json({
              resolvedUrl,
              originalUrl: rawUrl,
              mediaType: isHls ? "HLS" : "MP4",
              title: data.metadata?.title || identifier.replace(/_/g, " "),
              poster: `https://archive.org/services/img/${identifier}`,
              subtitleUrl: subFile
                ? `https://archive.org/download/${identifier}/${encodeURIComponent(subFile.name)}`
                : undefined,
              needsProxy: true, // Archive.org download nodes do not supply permissive CORS headers
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
      resolvedUrl: rawUrl,
      originalUrl: rawUrl,
      mediaType: isExplicitHls ? "HLS" : "MP4",
      needsProxy: isExplicitHls,
      provider: "direct",
    } satisfies ResolvedMedia);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to resolve media URL" },
      { status: 500 }
    );
  }
}
