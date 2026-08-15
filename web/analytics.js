/* ---------------------------------------------------------------------------
 * "Our own" analytics — free, zero-extra-infrastructure.
 *
 * Piggybacks on the Firebase Realtime Database you already have wired up for
 * room sync, instead of pulling in a separate analytics service. Each call
 * appends one small, anonymous event under analytics/events/{pushId}. There
 * is no PII: no IP, no user agent, no cookie, nothing tied to a room's
 * content. The client can only append (see firebase/database.rules.json —
 * analytics/events is auth-required, write-only, one-shot per key) and can
 * never read the log back, so it can't be used to fingerprint or track
 * people across sessions either.
 *
 * If you don't want this at all, set CFG.ownAnalytics = false in config.js
 * and nothing is written.
 * ------------------------------------------------------------------------- */

export function createTracker(db, { ref, push, serverTimestamp }) {
  const evRef = ref(db, "analytics/events");

  // Random per-tab id, not per-person — purely so a burst of events from one
  // page load can be told apart from another. Never sent anywhere else.
  const sid = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
    .replace(/-/g, "")
    .slice(0, 12);

  return function track(type, extra) {
    try {
      const event = { type: String(type).slice(0, 40), sid, at: serverTimestamp() };
      if (extra && typeof extra === "object") {
        for (const [k, v] of Object.entries(extra).slice(0, 6)) {
          if (v == null) continue;
          event[String(k).slice(0, 20)] = typeof v === "number" ? v : String(v).slice(0, 60);
        }
      }
      push(evRef, event).catch(() => {}); // analytics must never break the app
    } catch {}
  };
}
