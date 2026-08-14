/**
 * Shared SSRF guard for api/proxy.js and api/subtitle.js.
 *
 * The old per-file `isPrivateHost()` only pattern-matched the literal
 * hostname string. That stops "http://169.254.169.254/..." but not
 * "http://evil.example.com/..." where evil.example.com's DNS record simply
 * points at 169.254.169.254 (or 127.0.0.1, or an internal 10.x address).
 * That's DNS rebinding, and it's the standard way to walk an SSRF filter
 * that only ever looked at the string.
 *
 * Fix: resolve the hostname ourselves and check the IP address it actually
 * comes back with, at every hop of every redirect. If a hostname is already
 * a literal IP, dns.lookup() just hands it back unchanged, so one code path
 * covers both cases.
 */
import dns from "node:dns/promises";
import net from "node:net";

const MAX_REDIRECTS = 5;

function isPrivateIPv4(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true; // malformed -> refuse
  const [a, b] = p;
  if (a === 0) return true;                    // 0.0.0.0/8
  if (a === 10) return true;                   // 10.0.0.0/8
  if (a === 127) return true;                  // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true;      // 169.254.0.0/16 link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true;      // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0 && p[2] === 2) return true; // 192.0.2.0/24 TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 224 || a >= 240) return true;       // multicast / reserved
  return false;
}

function isPrivateIPv6(ip) {
  const h = ip.toLowerCase();
  if (h === "::1") return true;                 // loopback
  if (h === "::") return true;                   // unspecified
  if (h.startsWith("fe80:")) return true;         // link-local
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true;  // fc00::/7 unique local
  // IPv4-mapped / IPv4-compatible IPv6 (::ffff:a.b.c.d, ::a.b.c.d) — unwrap
  // and re-check as v4 rather than letting it slide through as "not v4".
  const mapped = h.match(/^::(ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[2]);
  return false;
}

function isPrivateIP(ip) {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return true; // couldn't classify it -> refuse rather than guess
}

/** Resolve a hostname and refuse if ANY of its addresses are private. A
 *  multi-A-record host that mixes one public and one internal address is
 *  exactly the rebinding trick this exists to stop, so one bad address
 *  fails the whole hostname. */
async function hostnameIsSafe(hostname) {
  const h = hostname.toLowerCase();
  if (h === "localhost") return false;
  const literal = net.isIP(h);
  if (literal) return !isPrivateIP(h);
  let records;
  try {
    records = await dns.lookup(h, { all: true, verbatim: true });
  } catch {
    return false; // couldn't resolve -> refuse
  }
  if (!records.length) return false;
  return records.every((r) => !isPrivateIP(r.address));
}

/** Fetch with per-hop SSRF re-validation. Mirrors the redirect-chain walk
 *  that used to live separately in proxy.js and subtitle.js. */
export async function safeFetch(url, options, { maxRedirects = MAX_REDIRECTS } = {}) {
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    let parsed;
    try { parsed = new URL(current); } catch { throw new Error("Bad URL"); }
    if (!/^https?:$/.test(parsed.protocol)) {
      throw new Error("Refused: only http(s) URLs are allowed.");
    }
    if (!(await hostnameIsSafe(parsed.hostname))) {
      throw new Error("Refused: private, local, or unresolvable target.");
    }
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

/** Quick synchronous-looking check for validating a URL before doing any
 *  work (e.g. 400 fast on an obviously bad URL). Still async because it has
 *  to resolve DNS — there's no way to make this check truly synchronous and
 *  also correct. */
export async function isBadUrl(value, maxLength = 4096) {
  if (!value || typeof value !== "string" || value.length > maxLength) return true;
  if (!/^https?:\/\//i.test(value)) return true;
  let parsed;
  try { parsed = new URL(value); } catch { return true; }
  return !(await hostnameIsSafe(parsed.hostname));
}
