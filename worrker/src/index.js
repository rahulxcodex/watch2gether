/**
 * Watch-together sync server.
 *
 *   GET   /health                    liveness
 *   GET   /library                   auto-generated catalogue from the R2 bucket
 *   GET   /media/<key>               range-aware byte streaming (private-bucket mode)
 *   POST  /upload/start              begin a multipart upload
 *   PUT   /upload/part?...           one chunk
 *   POST  /upload/finish             stitch the chunks
 *   POST  /upload/abort              bin them
 *   PUT   /upload/direct?key=..      one-shot, for anything under a part
 *
 * That is the whole Worker. Room sync lives in Firebase, so there is no state
 * here at all — just a bucket listing, byte streaming, and chunked uploads.
 * One file, one binding, no migrations.
 */

const JSONH = { "content-type": "application/json; charset=utf-8" };

const VIDEO_EXT = /\.(mp4|m4v|webm|mkv|mov|m3u8|mpd)$/i;
const SUB_EXT = /\.(vtt|srt|ass|ssa)$/i;
const POSTER_EXT = /\.(jpg|jpeg|png|webp|avif)$/i;

/* Parts must clear R2's 5 MB floor and stay under Cloudflare's 100 MB request
   body ceiling. 24 MB also keeps each part comfortably inside the Worker's
   128 MB of memory while it's buffered. */
const PART_SIZE = 24 * 1024 * 1024;

function cors(env) {
  return {
    "access-control-allow-origin": env.ALLOW_ORIGIN || "*",
    "access-control-allow-methods": "GET,HEAD,PUT,POST,OPTIONS",
    "access-control-allow-headers": "range,content-type,x-upload-token",
    "access-control-expose-headers":
      "content-length,content-range,accept-ranges,etag,content-type",
    "access-control-max-age": "86400",
  };
}

const json = (data, env, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...JSONH, ...cors(env) },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(env) });
    }

    switch (true) {
      case url.pathname === "/health":
        return json({ ok: true, uploads: !!env.UPLOAD_TOKEN, partSize: PART_SIZE }, env);

      case url.pathname === "/library":
        return library(env);

      case url.pathname.startsWith("/media/"):
        return media(decodeURIComponent(url.pathname.slice(7)), request, env);

      case url.pathname.startsWith("/upload/"):
        return upload(url, request, env);

      default:
        return new Response("Not found", {
          status: 404,
          headers: { ...TEXT, ...cors(env) },
        });
    }
  },
};

/* ------------------------------------------------------------------ *
 * Library — the bucket layout is the database.
 *
 *   library/<title-slug>/video-1080p.mp4
 *   library/<title-slug>/video-720p.mp4
 *   library/<title-slug>/poster.jpg
 *   library/<title-slug>/subs.en.vtt
 *   library/<title-slug>/subs.hi.vtt
 *
 * Anything matching those extensions is picked up automatically. Drop files in
 * the bucket, reload the app, they're there. No admin panel to build.
 * ------------------------------------------------------------------ */
async function library(env) {
  if (!env.MEDIA) return json({ titles: [], error: "No R2 bucket bound" }, env, 500);

  const titles = new Map();
  let cursor;

  do {
    const page = await env.MEDIA.list({ prefix: "library/", cursor, limit: 1000 });
    cursor = page.truncated ? page.cursor : undefined;

    for (const obj of page.objects) {
      const parts = obj.key.split("/");
      if (parts.length < 3) continue;
      const slug = parts[1];
      const file = parts.slice(2).join("/");

      if (!titles.has(slug)) {
        titles.set(slug, {
          slug,
          title: prettify(slug),
          sources: [],
          subtitles: [],
          poster: null,
          bytes: 0,
        });
      }
      const t = titles.get(slug);
      t.bytes += obj.size;

      if (VIDEO_EXT.test(file)) {
        // Only top-level files are playable sources. An HLS package puts its
        // master playlist here and everything else — variant playlists (which
        // ffmpeg also calls index.m3u8) and segments — in subfolders. Listing
        // those would turn one title into five.
        if (file.includes("/")) continue;

        t.sources.push({
          key: obj.key,
          label: labelFor(file),
          size: obj.size,
          hls: /\.(m3u8|mpd)$/i.test(file),
        });
      } else if (SUB_EXT.test(file)) {
        t.subtitles.push({ key: obj.key, label: langFor(file) });
      } else if (POSTER_EXT.test(file) && /poster/i.test(file)) {
        t.poster = obj.key;
      }
    }
  } while (cursor);

  const list = [...titles.values()]
    .filter((t) => t.sources.length)
    .map((t) => {
      // Highest resolution first, so the default pick is the best one.
      t.sources.sort((a, b) => rank(b.label) - rank(a.label));
      t.subtitles.sort((a, b) => a.label.localeCompare(b.label));
      return t;
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  return json({ titles: list }, env);
}

const prettify = (slug) =>
  slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const labelFor = (file) => {
  const m = file.match(/(\d{3,4})p/);
  if (m) return `${m[1]}p`;
  if (/\.(m3u8|mpd)$/i.test(file)) return "Adaptive";
  return "Original";
};

const rank = (label) => (label === "Adaptive" ? 9999 : parseInt(label, 10) || 0);

const LANGS = {
  en: "English", hi: "हिन्दी", es: "Español", fr: "Français", de: "Deutsch",
  pt: "Português", ru: "Русский", ja: "日本語", ko: "한국어", zh: "中文",
  ar: "العربية", ta: "தமிழ்", te: "తెలుగు", bn: "বাংলা", mr: "मराठी",
  pa: "ਪੰਜਾਬੀ", ur: "اردو", it: "Italiano", tr: "Türkçe", id: "Bahasa",
};

const langFor = (file) => {
  const m = file.match(/[.\-_]([a-z]{2})(?:[.\-_]|$)/i);
  const code = m ? m[1].toLowerCase() : null;
  return (code && LANGS[code]) || file.replace(SUB_EXT, "").replace(/^subs?[.\-_]/i, "");
};

/* ------------------------------------------------------------------ *
 * Media proxy — only needed if the bucket stays private.
 *
 * If you attach a public custom domain to the bucket instead, point the app at
 * that hostname and skip this route: R2 serves the bytes directly and none of
 * it counts against the Worker request budget.
 * ------------------------------------------------------------------ */
async function media(key, request, env) {
  if (!env.MEDIA) return new Response("No bucket", { status: 500, headers: cors(env) });
  if (!key || key.includes("..")) {
    return new Response("Bad key", { status: 400, headers: cors(env) });
  }

  const object = await env.MEDIA.get(key, {
    range: request.headers,
    onlyIf: request.headers,
  });

  if (!object) return new Response("Not found", { status: 404, headers: cors(env) });

  const headers = new Headers(cors(env));
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "public, max-age=604800, immutable");

  if (!headers.has("content-type")) {
    headers.set("content-type", guessType(key));
  }

  // On a failed precondition R2 hands back a head-only object with no body.
  // Which status that means depends on which header did the failing.
  if (!("body" in object) || object.body === undefined) {
    const conditional = request.headers.has("if-none-match") || request.headers.has("if-modified-since");
    return new Response(null, { status: conditional ? 304 : 412, headers });
  }

  let status = 200;
  const r = object.range;
  if (r) {
    const start = "offset" in r && r.offset !== undefined
      ? r.offset
      : object.size - (r.suffix ?? 0);
    const length = "length" in r && r.length !== undefined
      ? r.length
      : object.size - start;
    const end = start + length - 1;
    if (start > 0 || end < object.size - 1) {
      headers.set("content-range", `bytes ${start}-${end}/${object.size}`);
      headers.set("content-length", String(length));
      status = 206;
    }
  }

  return new Response(object.body, { status, headers });
}

function guessType(key) {
  const ext = key.split(".").pop().toLowerCase();
  return {
    mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm",
    mkv: "video/x-matroska", mov: "video/quicktime",
    m3u8: "application/vnd.apple.mpegurl", mpd: "application/dash+xml",
    ts: "video/mp2t", m4s: "video/iso.segment",
    vtt: "text/vtt", srt: "text/plain", ass: "text/plain", ssa: "text/plain",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    webp: "image/webp", avif: "image/avif",
  }[ext] || "application/octet-stream";
}


/* ------------------------------------------------------------------ *
 * Uploads — multipart, so a two-gigabyte film can go up through a
 * platform that caps request bodies at a hundred megabytes.
 *
 * Fails closed: with no UPLOAD_TOKEN set this whole surface is off, so a
 * fresh deploy can't be turned into someone else's file host.
 *   wrangler secret put UPLOAD_TOKEN
 * ------------------------------------------------------------------ */
async function upload(url, request, env) {
  if (!env.UPLOAD_TOKEN) {
    return json({ error: "Uploads are off. Set the UPLOAD_TOKEN secret to turn them on." }, env, 503);
  }
  if (request.headers.get("x-upload-token") !== env.UPLOAD_TOKEN) {
    return json({ error: "Wrong upload key." }, env, 403);
  }
  if (!env.MEDIA) return json({ error: "No bucket bound" }, env, 500);

  const op = url.pathname.slice(8);
  const key = url.searchParams.get("key") || "";

  try {
    switch (op) {
      case "start": {
        const body = await request.json();
        if (!validKey(body.key)) return json({ error: "Bad key" }, env, 400);
        const mp = await env.MEDIA.createMultipartUpload(body.key, {
          httpMetadata: { contentType: body.contentType || guessType(body.key) },
        });
        return json({ uploadId: mp.uploadId, partSize: PART_SIZE }, env);
      }

      case "part": {
        const uploadId = url.searchParams.get("uploadId");
        const partNumber = Number(url.searchParams.get("part"));
        if (!validKey(key) || !uploadId || !(partNumber >= 1)) {
          return json({ error: "Bad part request" }, env, 400);
        }
        const mp = env.MEDIA.resumeMultipartUpload(key, uploadId);
        const part = await mp.uploadPart(partNumber, await request.arrayBuffer());
        return json({ partNumber: part.partNumber, etag: part.etag }, env);
      }

      case "finish": {
        const body = await request.json();
        if (!validKey(body.key) || !body.uploadId || !Array.isArray(body.parts)) {
          return json({ error: "Bad finish request" }, env, 400);
        }
        const mp = env.MEDIA.resumeMultipartUpload(body.key, body.uploadId);
        const obj = await mp.complete(
          body.parts.slice().sort((a, b) => a.partNumber - b.partNumber)
        );
        return json({ key: body.key, size: obj.size }, env);
      }

      case "abort": {
        const body = await request.json();
        if (validKey(body.key) && body.uploadId) {
          await env.MEDIA.resumeMultipartUpload(body.key, body.uploadId).abort();
        }
        return json({ ok: true }, env);
      }

      case "direct": {
        if (!validKey(key)) return json({ error: "Bad key" }, env, 400);
        // Buffered rather than streamed: R2 wants a known length, and anything
        // reaching this route is under one part anyway.
        const obj = await env.MEDIA.put(key, await request.arrayBuffer(), {
          httpMetadata: { contentType: request.headers.get("content-type") || guessType(key) },
        });
        return json({ key, size: obj.size }, env);
      }

      default:
        return json({ error: "Unknown upload step" }, env, 404);
    }
  } catch (e) {
    return json({ error: String(e?.message || e) }, env, 500);
  }
}

/* Writes stay under library/<slug>/... and can't traverse out. Depth is capped
   rather than fixed at three, because an HLS package is a tree: a master
   playlist beside one folder of segments per rendition. */
const validKey = (k) => {
  if (typeof k !== "string" || !k.startsWith("library/") || k.includes("..")) return false;
  const parts = k.split("/");
  return parts.length >= 3 && parts.length <= 6 &&
         parts.every((p) => p.length > 0 && p !== ".") &&
         k.length < 512;
};
