/**
 * Minimal per-IP rate limiter for routes that spend money or a shared quota
 * per request (LLM calls, OpenSubtitles downloads, the open bandwidth
 * proxy). None of these routes require auth — anyone with the deployed URL
 * can call them — so without *some* throttle a single caller can burn
 * through API credits or Worker/Vercel bandwidth in minutes.
 *
 * This is an in-memory sliding-window counter. It is intentionally simple
 * and has one known limitation: Vercel serverless functions are not
 * guaranteed to stay on the same instance between requests, so under real
 * multi-instance load this only rate-limits *within* whichever instance
 * happens to handle a given request, not globally. That's still a real
 * improvement over no limiting at all (it catches the common case: a script
 * hammering the endpoint from one place), but for a hard guarantee under
 * production traffic, swap the Map below for Vercel KV / Upstash Redis and
 * keep the same checkRateLimit(key, ...) call signature.
 */

const buckets = new Map(); // key -> { count, resetAt }

/** Returns { ok, remaining, retryAfterMs }. `key` should already include
 *  both the route name and the caller's IP so different routes and
 *  different callers don't share a bucket. */
export function checkRateLimit(key, { limit = 20, windowMs = 60_000 } = {}) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;

  // Cheap, occasional sweep so the Map doesn't grow forever on a
  // long-lived warm instance.
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
  }

  if (bucket.count > limit) {
    return { ok: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
  }
  return { ok: true, remaining: limit - bucket.count, retryAfterMs: 0 };
}

/** Best-effort caller IP from the headers Vercel sets in front of the
 *  function. Not spoof-proof against a caller who controls their own
 *  headers directly to origin, but Vercel's edge overwrites x-forwarded-for
 *  for requests that actually go through its network, which is the normal
 *  path for anyone hitting the public URL. */
export function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

/** Convenience wrapper: check the limit and, if exceeded, write a 429 and
 *  return true (caller should stop). Returns false if the request is
 *  allowed to proceed. */
export function rateLimited(req, res, routeName, opts) {
  const key = `${routeName}:${clientIp(req)}`;
  const result = checkRateLimit(key, opts);
  if (!result.ok) {
    res.setHeader("retry-after", Math.ceil(result.retryAfterMs / 1000));
    res.status(429).json({ error: "Too many requests, slow down." });
    return true;
  }
  return false;
}
