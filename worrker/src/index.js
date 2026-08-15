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

      case url.pathname === "/proxy":
        return proxy(url, request, env);

      case url.pathname.startsWith("/upload/"):
        return upload(url, request, env);

      default:
        return new Response("Not found", {
          status: 404,
          headers: { "content-type": "text/plain; charset=utf-8", ...cors(env) },
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

/* ------------------------------------------------------------------ *
 * Proxy — for HLS (or any) sources on a host that doesn't send CORS
 * headers. The browser can't read a cross-origin response without them,
 * so this fetches server-side (no CORS rules apply between servers) and
 * re-adds them on the way back. Range is forwarded both ways so hls.js's
 * segment requests still work.
 *
 * Open by design, same as /media: it only relays bytes, it doesn't hand
 * out anything private. Restricted to http(s) and blocks obviously-local
 * targets to stop it being used to probe the Worker's own network.
 * ------------------------------------------------------------------ */
/* NOTE: the old version of this function only pattern-matched the literal
 * hostname string. That stops "http://169.254.169.254/..." but not
 * "http://evil.example.com/..." whose DNS record simply points at
 * 169.254.169.254 (or 127.0.0.1, or an internal 10.x address) — classic DNS
 * rebinding. Workers have no `node:dns`, so we resolve via DNS-over-HTTPS
 * (Cloudflare's own resolver, reached over plain fetch) and check the
 * *actual* IP(s) a hostname comes back with, the same way api/_security.js
 * does on the Vercel side with dns.lookup(). */
function isPrivateIPv4(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true; // malformed -> refuse
  const [a, b] = p;
  if (a === 0) return true;                          // 0.0.0.0/8
  if (a === 10) return true;                          // 10.0.0.0/8
  if (a === 127) return true;                         // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true;            // 169.254.0.0/16 link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16.0.0/12
  if (a === 192 && b === 168) return true;             // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true;    // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0 && p[2] === 2) return true;   // 192.0.2.0/24 TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 224 || a >= 240) return true;              // multicast / reserved
  return false;
}

function isPrivateIPv6(ip) {
  const h = ip.toLowerCase();
  if (h === "::1" || h === "::") return true;          // loopback / unspecified
  if (h.startsWith("fe80:")) return true;               // link-local
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true;        // fc00::/7 unique local
  const mapped = h.match(/^::(ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[2]);          // IPv4-mapped/compatible
  return false;
}

function ipVersion(ip) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return 4;
  if (ip.includes(":")) return 6;
  return 0;
}

function isPrivateIP(ip) {
  const v = ipVersion(ip);
  if (v === 4) return isPrivateIPv4(ip);
  if (v === 6) return isPrivateIPv6(ip);
  return true; // couldn't classify -> refuse rather than guess
}

/* Resolve via DoH and refuse if ANY returned address is private. A host
 * with mixed public/internal A records is exactly the rebinding trick this
 * exists to stop, so one bad address fails the whole hostname. */
async function resolveAll(hostname) {
  const addrs = [];
  for (const type of ["A", "AAAA"]) {
    try {
      const res = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
        { headers: { accept: "application/dns-json" } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const ans of data.Answer || []) {
        if (ans.type === (type === "A" ? 1 : 28)) addrs.push(ans.data);
      }
    } catch { /* treat as unresolved for this record type */ }
  }
  return addrs;
}

async function hostnameIsSafe(hostname) {
  const h = hostname.toLowerCase();
  if (h === "localhost") return false;
  if (ipVersion(h)) return !isPrivateIP(h); // literal IP given directly
  const addrs = await resolveAll(h);
  if (!addrs.length) return false; // couldn't resolve -> refuse
  return addrs.every((ip) => !isPrivateIP(ip));
}

const MAX_REDIRECTS = 5;

/* redirect: "follow" only checks the URL we start with. A remote server can
 * 30x us to a private/local address afterwards (cloud metadata endpoint,
 * internal service, etc.) and the follower would go there anyway, since
 * this Worker runs inside Cloudflare's network. Walk the chain by hand and
 * re-check every hop — including its real resolved IP — against the guard. */
async function safeFetch(target, options) {
  let current = target;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    let t;
    try { t = new URL(current); } catch { throw new Error("Bad URL"); }
    if (!/^https?:$/.test(t.protocol)) throw new Error("Refused: only http(s) URLs are allowed.");
    if (!(await hostnameIsSafe(t.hostname))) throw new Error("Refused: private, local, or unresolvable target.");
    const res = await fetch(current, { ...options, redirect: "manual" });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("Redirect with no Location header.");
      current = new URL(loc, current).href;
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects.");
}

async function proxy(url, request, env) {
  const target = url.searchParams.get("url");
  if (!target || !/^https?:\/\//i.test(target)) {
    return json({ error: "Bad or missing ?url=" }, env, 400);
  }

  try { new URL(target); } catch { return json({ error: "Bad URL" }, env, 400); }

  const upstream = new Headers();
  const range = request.headers.get("range");
  if (range) upstream.set("range", range);
  upstream.set("user-agent", "Mozilla/5.0");
  upstream.set("accept", "*/*");

  let res;
  try {
    res = await safeFetch(target, { headers: upstream });
  } catch (e) {
    return json({ error: `Upstream fetch failed: ${e?.message || e}` }, env, 502);
  }

  const headers = new Headers(cors(env));
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "cache-control", "etag"]) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }

  // HLS playlists reference segments with relative paths; rewrite those to
  // go back through this same proxy, or the browser resolves them against
  // the page's own origin instead of the stream's.
  const ct = res.headers.get("content-type") || "";
  if (/mpegurl|m3u8/i.test(ct) || target.toLowerCase().includes(".m3u8")) {
    const text = await res.text();
    const base = target;
    const proxyBase = `${url.origin}/proxy?url=`;
    const rewritten = text.split("\n").map((line) => {
      const l = line.trim();
      if (!l || l.startsWith("#")) {
        // URI="..." attributes (e.g. on #EXT-X-KEY, #EXT-X-MAP)
        return line.replace(/URI="([^"]+)"/i, (_m, u) =>
          `URI="${proxyBase}${encodeURIComponent(new URL(u, base).href)}"`);
      }
      return proxyBase + encodeURIComponent(new URL(l, base).href);
    }).join("\n");
    headers.set("content-type", "application/vnd.apple.mpegurl");
    headers.delete("content-length");
    return new Response(rewritten, { status: res.status, headers });
  }

  return new Response(res.body, { status: res.status, headers });
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
/* Plain !== leaks timing info proportional to how many leading bytes match,
 * in principle letting an attacker recover the token byte-by-byte. The
 * Workers runtime exposes WebCrypto, so use a real constant-time compare
 * instead of a hand-rolled loop (which JIT/branch behavior can still leak). */
async function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const ab = enc.encode(a), bb = enc.encode(b);
  // Hash both first so the comparison itself always operates on fixed-length
  // digests regardless of input length (length itself is not secret here,
  // but this keeps the compare uniform either way).
  const [ah, bh] = await Promise.all(
    [ab, bb].map((buf) => crypto.subtle.digest("SHA-256", buf))
  );
  const au = new Uint8Array(ah), bu = new Uint8Array(bh);
  let diff = 0;
  for (let i = 0; i < au.length; i++) diff |= au[i] ^ bu[i];
  return diff === 0;
}

async function upload(url, request, env) {
  if (!env.UPLOAD_TOKEN) {
    return json({ error: "Uploads are off. Set the UPLOAD_TOKEN secret to turn them on." }, env, 503);
  }
  const given = request.headers.get("x-upload-token") || "";
  if (!(await timingSafeEqual(given, env.UPLOAD_TOKEN))) {
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

/* Writes are confined to library/<slug>/<file> — exactly three segments, no
   traversal. Nothing else in the bucket is reachable from a browser. */
const validKey = (k) =>
  typeof k === "string" &&
  k.startsWith("library/") &&
  !k.includes("..") &&
  k.split("/").length === 3 &&
  k.split("/").every((p) => p.length > 0) &&
  k.length < 512;
