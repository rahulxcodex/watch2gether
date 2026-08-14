/* ===========================================================================
 * Parallel — watch together
 *
 *   page        static, on Vercel or GitHub Pages
 *   sync        Firebase Realtime Database
 *   sources     YouTube, any direct video URL, or a file on your own disk
 *
 * There is no server of ours anywhere in this. The room is a few dozen bytes
 * of JSON that both browsers subscribe to.
 * ======================================================================== */

import { firebaseConfig, CFG } from "./config.js";

const SDK = firebaseConfig.sdkVersion || "11.0.2";
const cdn = (m) => `https://www.gstatic.com/firebasejs/${SDK}/firebase-${m}.js`;

const [fbApp, fbAuth, fbDb] = await Promise.all([
  import(cdn("app")), import(cdn("auth")), import(cdn("database")),
]).catch((e) => {
  document.body.innerHTML =
    `<div style="padding:40px;font:15px system-ui;color:#E7ECF4">
       <b>Firebase SDK wouldn't load.</b><br><br>
       Tried version ${SDK}. Set <code>sdkVersion</code> in config.js to a current
       release if that one has been withdrawn.<br><br>
       <span style="color:#8592A6">${e}</span></div>`;
  throw e;
});

const { initializeApp } = fbApp;
const { getAuth, signInAnonymously, onAuthStateChanged } = fbAuth;
const {
  getDatabase, ref, onValue, onChildAdded, set, update, remove, push,
  onDisconnect, serverTimestamp, query, limitToLast, runTransaction,
} = fbDb;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

if (CFG.analytics) {
  import(cdn("analytics"))
    .then((m) => m.getAnalytics(app))
    .catch(() => {});   // blocked by extensions more often than not
}

/* ------------------------------------------------------------- shorthands */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtRate = (r) => (r === 1 ? "1×" : `${r}×`);
const fmtSize = (b) => (b > 1e9 ? (b / 1e9).toFixed(1) + " GB" : Math.round(b / 1e6) + " MB");
const fmtDrift = (d) => (Math.abs(d) < 0.05 ? "locked" : `${d > 0 ? "−" : "+"}${Math.abs(d).toFixed(2)}s`);

function fmtTime(t) {
  if (!isFinite(t)) return "0:00";
  t = Math.max(0, Math.floor(t));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
           : `${m}:${String(s).padStart(2, "0")}`;
}

let toastT;
function say(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("on"), 3200);
}

/* ------------------------------------------------------------------ state */
const R = {
  uid: null, name: "", room: "",
  state: null, members: [], progress: {},
  offset: 0,                       // Firebase hands us the server clock skew
  cues: [], cueTrack: null, cueIdx: -1, localSub: null,
  ccOn: true, delay: 0, ytCC: false,
  dragging: false, blocked: false, seenSep: false, shownResume: "",
  refs: {},
  pendingSource: null,
};

/* ------------------------------------------------------------------ icons */
const ICON = {
  play:'<path d="M6 4l13 8-13 8z" fill="currentColor" stroke="none"/>',
  pause:'<path d="M8 5v14M16 5v14" stroke-width="2.2"/>',
  back:'<path d="M11 5L4 12l7 7"/><path d="M4 12h10a6 6 0 010 12h-1"/>',
  fwd:'<path d="M13 5l7 7-7 7"/><path d="M20 12H10a6 6 0 000 12h1"/>',
  vol:'<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9.5a3.5 3.5 0 010 5"/><path d="M19.5 7a7 7 0 010 10"/>',
  mute:'<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 10l4 4M21 10l-4 4"/>',
  cc:'<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10 10.5a2 2 0 100 3M16.5 10.5a2 2 0 100 3"/>',
  cog:'<circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M21 12h-2M5 12H3M18.4 5.6l-1.4 1.4M7 17l-1.4 1.4M18.4 18.4L17 17M7 7L5.6 5.6"/>',
  fs:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  exit:'<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  rail:'<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M15 4v16"/>',
  mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
  micoff:'<path d="M9 6a3 3 0 016 0v4M15 14a3 3 0 01-6-2"/><path d="M5 11a7 7 0 0011 5.6M19 11a7 7 0 01-.4 2.3M12 18v3"/><path d="M4 3l16 18"/>',
};
const ic = (n) => `<svg viewBox="0 0 24 24">${ICON[n]}</svg>`;

/* ========================================================= landing library
 * Personal library and saved rooms live in this browser. Firebase still owns
 * shared room state/progress, while this small index lets you find your series
 * and rooms again without another backend.
 * ======================================================================== */

const LIBRARY_KEY = "wtLibraryV1";
const ROOMS_KEY = "wtRoomsV1";

const readStore = (key, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v ?? fallback;
  } catch {
    return fallback;
  }
};

let MY_LIBRARY = readStore(LIBRARY_KEY, []);
let SAVED_ROOMS = readStore(ROOMS_KEY, []);

function writeLibrary() {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(MY_LIBRARY));
  renderLanding();
}

function writeRooms() {
  localStorage.setItem(ROOMS_KEY, JSON.stringify(SAVED_ROOMS));
  renderLanding();
}

function rememberRoom(code, patch = {}) {
  if (!code) return;
  const now = Date.now();
  const i = SAVED_ROOMS.findIndex((r) => r.code === code);
  const base = i >= 0 ? SAVED_ROOMS[i] : {
    code, name: localStorage.wtName || "Guest", createdAt: now
  };
  const next = {
    ...base,
    ...patch,
    code,
    lastUsed: now,
  };
  if (i >= 0) SAVED_ROOMS[i] = next;
  else SAVED_ROOMS.unshift(next);
  SAVED_ROOMS = SAVED_ROOMS
    .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
    .slice(0, 30);
  localStorage.setItem(ROOMS_KEY, JSON.stringify(SAVED_ROOMS));
}

function removeSavedRoom(code) {
  SAVED_ROOMS = SAVED_ROOMS.filter((r) => r.code !== code);
  writeRooms();
}

function makeId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function findSeries(name) {
  return MY_LIBRARY.find((s) => s.name.toLowerCase() === name.toLowerCase());
}

function showLanding() {
  $("#landing").classList.add("on");
  $("#gate").style.display = "none";
  $("#app").classList.remove("on");
  renderLanding();
}

function showGate(code = "") {
  $("#landing").classList.remove("on");
  $("#gate").style.display = "grid";
  $("#app").classList.remove("on");
  if (code) $("#code").value = code;
  if ($("#who").value) $("#enter").focus();
  else $("#who").focus();
}

function openRoom(code) {
  $("#code").value = code;
  showGate(code);
}

async function watchLibraryEpisode(series, ep) {
  let episodeUrl = String(ep.url || "").trim();

  // Older library entries created before URL persistence may not have ep.url.
  // Offer a one-time repair instead of sending undefined to Firebase.
  // (Previously an early `if (!episodeUrl) return say(...)` above this block
  // made this repair flow unreachable dead code — removed so it actually runs.)
  if (!episodeUrl) {
    const repaired = await ask({
      title: "Episode link missing",
      body: `This saved episode was created by an older library version that did not store its stream URL. Paste the episode .m3u8/direct-video link to repair it.`,
      value: "",
      ok: "Save & watch",
    });
    if (!repaired || !/^https?:\/\//i.test(repaired)) {
      if (repaired != null) say("Please enter a valid http(s) episode link.");
      return;
    }
    if (!parseSource(repaired)) return say("That doesn't look like a playable video or HLS URL.");
    ep.url = repaired;
    writeLibrary();
    episodeUrl = repaired;
  }

  const parsed = parseSource(episodeUrl);
  if (!parsed) return say("This episode has an invalid or unsupported stream link.");

  const source = {
    kind: parsed.kind,
    ref: episodeUrl,
    title: `${series.name} — ${ep.title || parsed.title || "Episode"}`,
    label: "Library",
    episodeId: ep.id,
    subs: ep.subtitleText
      ? [{ key: "local", label: ep.subtitleLanguage || "English" }]
      : (ep.subtitleUrl ? [{ key: ep.subtitleUrl, label: ep.subtitleLanguage || "English" }] : []),
    subtitleText: ep.subtitleText || "",
    subtitleName: ep.subtitleFileName || "",
    size: 0,
  };

  // Already connected to a room (the user just stepped into the library view
  // via the "Library" button while watching something) — swap the video
  // inside that same room instead of routing to a different room. Previously
  // "Library" always did a full page reload, which dropped R.room, so this
  // path never had a room to reuse and always rolled/joined a new one,
  // splitting anyone else watching along away from you.
  if (R.room) {
    rememberRoom(R.room, { episodeId: ep.id });
    setSource(source);
    $("#landing").classList.remove("on");
    $("#app").classList.add("on");
    say(`Switched to ${series.name} — ${ep.title || "episode"}`);
    return;
  }

  const existing = SAVED_ROOMS.find((r) => r.episodeId === ep.id);
  const code = existing?.code || roll();

  R.pendingSource = source;

  $("#code").value = code;
  showGate(code);
  if ($("#who").value) join();
}

/* Lets the user replace the stream link on a library episode that already
 * has one — e.g. a dead/expired .m3u8 link — without deleting and re-adding
 * the whole episode. Reuses the same "paste link" prompt as the repair flow
 * in watchLibraryEpisode(). */
async function changeLibraryEpisodeVideo(series, ep) {
  const updated = await ask({
    title: "Change video link",
    body: `Paste a new .m3u8/direct-video link for "${ep.title || "this episode"}". This replaces the current link.`,
    value: String(ep.url || ""),
    ok: "Save",
  });
  if (updated == null) return;
  if (!/^https?:\/\//i.test(updated)) return say("Please enter a valid http(s) episode link.");
  if (!parseSource(updated)) return say("That doesn't look like a playable video or HLS URL.");
  ep.url = updated;
  writeLibrary();
  say(`${series.name} — ${ep.title || "episode"} · video link updated`);
}

async function addLibraryEpisode(form) {
  const fd = new FormData(form);
  const seriesName = String(fd.get("series") || "").trim();
  const episodeOverride = String(fd.get("episode") || "").trim();
  const url = String(fd.get("url") || "").trim();
  const imdbId = String(fd.get("imdbId") || "").trim().toLowerCase();
  const subtitleUrl = String(fd.get("subtitleUrl") || "").trim();
  const subtitleFile = fd.get("subtitleFile");

  if (!seriesName) return say("Enter a series name.");
  if (!/^tt\d{7,10}$/i.test(imdbId)) return say("Enter a valid IMDb ID such as tt1234567.");
  if (!url || !/^https?:\/\//i.test(url)) return say("Enter a valid http(s) episode URL.");
  if (!parseSource(url)) return say("That doesn't look like a playable video or HLS URL.");
  if (subtitleUrl && !/^https?:\/\//i.test(subtitleUrl)) return say("Subtitle URL must start with http:// or https://.");
  if (subtitleUrl && subtitleFile?.size) return say("Use either a subtitle URL or an uploaded subtitle file, not both.");
  if (subtitleFile?.size > 1500000) return say("Subtitle file is larger than 1.5 MB.");

  const submit = form.querySelector('button[type="submit"]');
  const oldText = submit?.textContent;
  if (submit) { submit.disabled = true; submit.textContent = "Preparing…"; }

  try {
    let subtitleText = "";
    let subtitleFileName = "";
    let subtitleSource = "";

    if (subtitleFile?.size) {
      subtitleText = await subtitleFile.text();
      subtitleFileName = subtitleFile.name;
      subtitleSource = "Uploaded subtitle file";
      if (!parseSubs(subtitleText).length) {
        return say("That subtitle file doesn't contain readable SRT/VTT/ASS/SSA cues.");
      }
    } else if (subtitleUrl) {
      if (submit) submit.textContent = "Saving subtitle…";
      const sr = await fetch("/api/subtitle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: subtitleUrl }),
      });
      const sb = await sr.json().catch(() => ({}));
      if (!sr.ok) return say(sb.error || "Couldn't fetch that subtitle URL.");
      subtitleText = String(sb.text || "");
      subtitleFileName = subtitleUrl.split("/").pop()?.split("?")[0] || "subtitle.srt";
      subtitleSource = subtitleUrl;
      if (!parseSubs(subtitleText).length) {
        return say("The subtitle URL was fetched, but it doesn't contain readable subtitle cues.");
      }
    }

    if (submit) submit.textContent = "Finding episode…";

    let meta;
    try {
      const r = await fetch("/api/identify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ series: seriesName, url, imdbId }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || `Metadata service returned ${r.status}`);
      meta = body;
    } catch (e) {
      meta = {
        series: seriesName, seasonNumber: null, episodeNumber: null, episodeCode: "",
        episodeTitle: "", confidence: "low", seriesYear: null, seriesImdbId: null,
        seriesImdbUrl: null, seriesImdbRating: null, seriesGenres: [], seriesSummary: "",
        episodeImdbId: null, episodeImdbUrl: null, episodeImdbRating: null,
        episodeSummary: "", metadataNotes: String(e.message || e),
      };
      say("Metadata lookup failed — saving with your supplied details. The app will try Gemini → Grok → OpenRouter automatically when configured.");
    }

    const resolvedSeries = String(meta.series || seriesName).trim() || seriesName;
    const season = Number.isInteger(meta.seasonNumber) ? meta.seasonNumber : null;
    const epNo = Number.isInteger(meta.episodeNumber) ? meta.episodeNumber : null;
    const generatedCode = meta.episodeCode ||
      (season != null && epNo != null ? `S${String(season).padStart(2, "0")}E${String(epNo).padStart(2, "0")}` : "");
    const title = episodeOverride ||
      [generatedCode, String(meta.episodeTitle || "").trim()].filter(Boolean).join(" · ") ||
      `Episode ${((findSeries(resolvedSeries)?.episodes.length || 0) + 1)}`;

    let series = MY_LIBRARY.find((x) => x.imdbId && x.imdbId.toLowerCase() === imdbId) || findSeries(resolvedSeries);
    if (!series) {
      series = {
        id: makeId("series"), name: resolvedSeries.slice(0, 120), episodes: [],
        year: Number.isInteger(meta.seriesYear) ? meta.seriesYear : null,
        imdbId, imdbUrl: meta.seriesImdbUrl || `https://www.imdb.com/title/${imdbId}/`,
        imdbRating: typeof meta.seriesImdbRating === "number" ? meta.seriesImdbRating : null,
        genres: Array.isArray(meta.seriesGenres) ? meta.seriesGenres.slice(0, 10) : [],
        summary: String(meta.seriesSummary || "").slice(0, 1200), addedAt: Date.now(),
      };
      MY_LIBRARY.unshift(series);
    } else {
      Object.assign(series, {
        year: Number.isInteger(meta.seriesYear) ? meta.seriesYear : (series.year ?? null),
        imdbId: series.imdbId || imdbId,
        imdbUrl: meta.seriesImdbUrl || series.imdbUrl || `https://www.imdb.com/title/${imdbId}/`,
        imdbRating: typeof meta.seriesImdbRating === "number" ? meta.seriesImdbRating : (series.imdbRating ?? null),
        genres: Array.isArray(meta.seriesGenres) && meta.seriesGenres.length ? meta.seriesGenres.slice(0, 10) : (series.genres || []),
        summary: String(meta.seriesSummary || series.summary || "").slice(0, 1200),
      });
    }

    const duplicate = series.episodes.find((e) => e.url === url) ||
      (season != null && epNo != null
        ? series.episodes.find((e) => !e.url && e.seasonNumber === season && e.episodeNumber === epNo)
        : null);
    const episodePatch = {
      url,
      title, seasonNumber: season, episodeNumber: epNo, episodeCode: generatedCode,
      seriesImdbId: imdbId,
      episodeImdbId: meta.episodeImdbId || null, episodeImdbUrl: meta.episodeImdbUrl || null,
      episodeImdbRating: typeof meta.episodeImdbRating === "number" ? meta.episodeImdbRating : null,
      episodeSummary: String(meta.episodeSummary || "").slice(0, 1200),
      metadataConfidence: meta.confidence || "low",
      metadataNotes: String(meta.metadataNotes || "").slice(0, 1000),
      subtitleUrl: subtitleUrl || (duplicate?.subtitleUrl || ""),
      subtitleText: subtitleText || (duplicate?.subtitleText || ""),
      subtitleFileName: subtitleFileName || (duplicate?.subtitleFileName || ""),
      subtitleLanguage: subtitleText ? "English" : (duplicate?.subtitleLanguage || ""),
      subtitleSource: subtitleSource || (duplicate?.subtitleSource || ""),
      updatedAt: Date.now(),
    };

    if (duplicate) {
      Object.assign(duplicate, episodePatch);
      writeLibrary();
      say(`${series.name} — updated existing episode`);
      return;
    }

    const ep = { id: makeId("ep"), ...episodePatch, addedAt: Date.now() };
    series.episodes.push(ep);
    series.episodes.sort((a, b) => {
      const sa = Number.isInteger(a.seasonNumber) ? a.seasonNumber : 9999;
      const sb = Number.isInteger(b.seasonNumber) ? b.seasonNumber : 9999;
      const ea = Number.isInteger(a.episodeNumber) ? a.episodeNumber : 9999;
      const eb = Number.isInteger(b.episodeNumber) ? b.episodeNumber : 9999;
      return sa - sb || ea - eb || (a.addedAt || 0) - (b.addedAt || 0);
    });

    writeLibrary();
    form.reset();
    $("#libraryFormWrap").hidden = true;
    say(subtitleText ? `${series.name} — ${ep.title} · English subtitles saved` : `${series.name} — ${ep.title} · added`);
  } finally {
    if (submit) { submit.disabled = false; submit.textContent = oldText || "Analyze & add"; }
  }
}


async function importOpenSubtitles(form) {
  const fd = new FormData(form);
  const url = String(fd.get("url") || "").trim();
  const imdbId = String(fd.get("imdbId") || "").trim().toLowerCase();
  const seasonRaw = String(fd.get("seasonNumber") || "").trim();
  const seasonNumber = /^\d+$/.test(seasonRaw) ? Number(seasonRaw) : undefined;
  const episodeNumbers = String(fd.get("episodeNumbers") || "").trim() || undefined;
  if (!/^https?:\/\/(?:www\.)?opensubtitles\.org\//i.test(url)) {
    return say("Paste an OpenSubtitles.org search page URL.");
  }
  if (!/^tt\d{7,10}$/i.test(imdbId)) return say("Enter a valid IMDb ID such as tt1234567.");
  if (episodeNumbers && seasonNumber === undefined) {
    return say("Pick a season number too when specifying which episodes to import.");
  }

  const submit = form.querySelector('button[type="submit"]');
  const oldText = submit?.textContent;
  if (submit) { submit.disabled = true; submit.textContent = "Downloading subtitles…"; }

  try {
    const r = await fetch("/api/opensubs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, imdbId, seasonNumber, episodeNumbers }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return say(body.error || "OpenSubtitles import failed.");
    if (!Array.isArray(body.files) || !body.files.length) return say("No usable subtitles were found.");

    if (submit) submit.textContent = "Mapping IMDb…";
    let meta = null;
    try {
      const mr = await fetch("/api/identify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imdbId }),
      });
      if (mr.ok) meta = await mr.json();
    } catch {}

    const resolvedSeries = String(meta?.series || "IMDb " + imdbId).trim();
    let series = MY_LIBRARY.find((x) => x.imdbId && x.imdbId.toLowerCase() === imdbId) || findSeries(resolvedSeries);
    if (!series) {
      series = {
        id: makeId("series"), name: resolvedSeries.slice(0, 120), episodes: [],
        year: Number.isInteger(meta?.seriesYear) ? meta.seriesYear : null,
        imdbId, imdbUrl: meta?.seriesImdbUrl || `https://www.imdb.com/title/${imdbId}/`,
        imdbRating: typeof meta?.seriesImdbRating === "number" ? meta.seriesImdbRating : null,
        genres: Array.isArray(meta?.seriesGenres) ? meta.seriesGenres.slice(0, 10) : [],
        summary: String(meta?.seriesSummary || "").slice(0, 1200), addedAt: Date.now(),
      };
      MY_LIBRARY.unshift(series);
    } else {
      Object.assign(series, {
        imdbId: series.imdbId || imdbId,
        imdbUrl: meta?.seriesImdbUrl || series.imdbUrl || `https://www.imdb.com/title/${imdbId}/`,
        year: Number.isInteger(meta?.seriesYear) ? meta.seriesYear : (series.year ?? null),
        imdbRating: typeof meta?.seriesImdbRating === "number" ? meta.seriesImdbRating : (series.imdbRating ?? null),
        genres: Array.isArray(meta?.seriesGenres) && meta.seriesGenres.length ? meta.seriesGenres.slice(0, 10) : (series.genres || []),
        summary: String(meta?.seriesSummary || series.summary || "").slice(0, 1200),
      });
    }

    let created = 0, updated = 0;
    for (const file of body.files) {
      const season = Number.isInteger(file.season) ? file.season : null;
      const epNo = Number.isInteger(file.episode) ? file.episode : null;
      const code = String(file.code || (season != null && epNo != null
        ? `S${String(season).padStart(2, "0")}E${String(epNo).padStart(2, "0")}` : "")).trim();
      const existing = season != null && epNo != null
        ? series.episodes.find((e) => e.seasonNumber === season && e.episodeNumber === epNo)
        : series.episodes.find((e) => e.subtitleSource === "OpenSubtitles" && e.seasonNumber == null && e.episodeNumber == null);

      const title = existing?.title || (code ? `${code} · ${file.fileName.replace(/\.[^.]+$/, "")}` : file.fileName.replace(/\.[^.]+$/, "Movie"));
      const patch = {
        url: existing?.url || "",
        title,
        seasonNumber: season,
        episodeNumber: epNo,
        episodeCode: code,
        subtitleText: String(file.text || ""),
        subtitleFileName: String(file.fileName || "subtitle.ass").slice(-180),
        subtitleLanguage: "English",
        subtitleSource: "OpenSubtitles",
        metadataConfidence: "high",
        metadataNotes: `Imported from OpenSubtitles subtitle ${file.id}.`,
        updatedAt: Date.now(),
      };

      if (existing) {
        Object.assign(existing, patch);
        updated++;
      } else {
        series.episodes.push({ id: makeId("ep"), ...patch, addedAt: Date.now() });
        created++;
      }
    }

    series.episodes.sort((a, b) => {
      const sa = Number.isInteger(a.seasonNumber) ? a.seasonNumber : 9999;
      const sb = Number.isInteger(b.seasonNumber) ? b.seasonNumber : 9999;
      const ea = Number.isInteger(a.episodeNumber) ? a.episodeNumber : 9999;
      const eb = Number.isInteger(b.episodeNumber) ? b.episodeNumber : 9999;
      return sa - sb || ea - eb || (a.addedAt || 0) - (b.addedAt || 0);
    });

    writeLibrary();
    form.reset();
    $("#subtitleImportWrap").hidden = true;
    say(`${series.name}: imported ${body.files.length} subtitle${body.files.length === 1 ? "" : "s"} · ${updated} updated, ${created} created${body.failed ? ` · ${body.failed} downloads failed` : ""}`);
  } finally {
    if (submit) { submit.disabled = false; submit.textContent = oldText || "Import subtitles"; }
  }
}

function deleteLibraryEpisode(seriesId, epId) {
  const series = MY_LIBRARY.find((s) => s.id === seriesId);
  if (!series) return;
  series.episodes = series.episodes.filter((e) => e.id !== epId);
  if (!series.episodes.length) MY_LIBRARY = MY_LIBRARY.filter((s) => s.id !== seriesId);
  writeLibrary();
}

function deleteLibrarySeries(seriesId) {
  MY_LIBRARY = MY_LIBRARY.filter((s) => s.id !== seriesId);
  writeLibrary();
}

function renderLanding() {
  const lib = $("#landingLibrary");
  const rooms = $("#landingRooms");
  if (!lib || !rooms) return;

  lib.innerHTML = "";

  if (!MY_LIBRARY.length) {
    lib.innerHTML = `<div class="landing-empty">
      <b>Your library is empty.</b>
      <span>Add a series, paste an episode link, and optionally paste or upload its English subtitle file.</span>
    </div>`;
  } else {
    for (const series of MY_LIBRARY) {
      const card = document.createElement("section");
      card.className = "library-series";

      const imdb = series.imdbUrl
        ? `<a class="imdb-link" href="${esc(series.imdbUrl)}" target="_blank" rel="noopener">IMDb${series.imdbRating != null ? ` ${esc(series.imdbRating)}` : ""}</a>`
        : "";
      const genres = Array.isArray(series.genres) && series.genres.length
        ? `<span class="library-genres">${esc(series.genres.join(" · "))}</span>` : "";

      card.innerHTML = `
        <div class="library-series-head">
          <div>
            <h3>${esc(series.name)}${series.year ? ` <span class="library-year">(${esc(series.year)})</span>` : ""}</h3>
            <div class="library-series-meta">
              <span>${series.episodes.length} episode${series.episodes.length === 1 ? "" : "s"}</span>
              ${imdb}${genres}
            </div>
            ${series.summary ? `<p class="library-summary">${esc(series.summary)}</p>` : ""}
          </div>
          <div class="library-series-actions">
            <button class="library-add-episode" type="button">+ Add episode</button>
            <button class="library-delete-series" type="button">Delete series</button>
          </div>
        </div>
        <div class="library-episodes"></div>`;

      card.querySelector(".library-delete-series").onclick = () => deleteLibrarySeries(series.id);
      card.querySelector(".library-add-episode").onclick = () => openLibraryForm(series.name);
      const list = card.querySelector(".library-episodes");

      for (const ep of series.episodes) {
        const subtitleLabel = ep.subtitleText
          ? `English subtitles saved · ${esc(ep.subtitleFileName || "subtitle")}`
          : "No subtitle saved";
        const watchLabel = ep.url ? "Watch" : "Add video link";
        const epImdb = ep.episodeImdbUrl
          ? `<a class="imdb-link" href="${esc(ep.episodeImdbUrl)}" target="_blank" rel="noopener">Episode IMDb${ep.episodeImdbRating != null ? ` ${esc(ep.episodeImdbRating)}` : ""}</a>`
          : "";

        const row = document.createElement("div");
        row.className = "library-episode";
        row.innerHTML = `
          <div class="episode-meta">
            <b>${esc(ep.title)}</b>
            <span>${subtitleLabel}${epImdb ? ` · ${epImdb}` : ""}</span>
            ${ep.episodeSummary ? `<p class="episode-summary">${esc(ep.episodeSummary)}</p>` : ""}
          </div>
          <div class="episode-actions">
            <button class="btn primary episode-watch" type="button">${watchLabel}</button>
            <button class="episode-change-video" type="button" title="Change video link">Edit link</button>
            <button class="episode-delete" type="button" title="Remove episode">×</button>
          </div>`;
        row.querySelector(".episode-watch").onclick = () => {
          if (ep.url) watchLibraryEpisode(series, ep);
          else openLibraryForm(series.name);
        };
        row.querySelector(".episode-change-video").onclick = () => changeLibraryEpisodeVideo(series, ep);
        row.querySelector(".episode-delete").onclick = () => deleteLibraryEpisode(series.id, ep.id);
        list.appendChild(row);
      }
      lib.appendChild(card);
    }
  }

  rooms.innerHTML = "";
  const last = SAVED_ROOMS[0];

  if (last) {
    const cont = document.createElement("div");
    cont.className = "continue-card";
    cont.innerHTML = `
      <div>
        <span class="eyebrow">Continue watching</span>
        <b>${esc(last.title || "Saved room")}</b>
        <small>${esc(last.code)}${last.episodeTitle ? ` · ${esc(last.episodeTitle)}` : ""}</small>
      </div>
      <button class="btn primary" type="button">Resume room</button>`;
    cont.querySelector("button").onclick = () => openRoom(last.code);
    rooms.appendChild(cont);
  }

  if (SAVED_ROOMS.length) {
    const list = document.createElement("div");
    list.className = "saved-room-list";
    for (const room of SAVED_ROOMS) {
      const row = document.createElement("div");
      row.className = "saved-room";
      row.innerHTML = `
        <div>
          <b>${esc(room.title || "Untitled room")}</b>
          <span class="mono">${esc(room.code)}</span>
          ${room.ref ? `<small>${esc(room.episodeTitle || room.ref)}</small>` : ""}
        </div>
        <div class="saved-room-actions">
          <button class="btn ghost room-open" type="button">Open</button>
          <button class="room-delete" type="button" title="Forget room">×</button>
        </div>`;
      row.querySelector(".room-open").onclick = () => openRoom(room.code);
      row.querySelector(".room-delete").onclick = () => removeSavedRoom(room.code);
      list.appendChild(row);
    }
    rooms.appendChild(list);
  } else {
    rooms.innerHTML += `<div class="landing-empty"><span>No saved rooms yet. Joining a room saves its code automatically on this device.</span></div>`;
  }
}

/* =============================================================== the gate */
const WORDS_A = "amber autumn quiet velvet copper hollow silver paper linen ember slate meadow".split(" ");
const WORDS_B = "fig lantern harbour thistle otter comet willow bramble tide sparrow moth reef".split(" ");
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/* Anyone can sign in anonymously, so the room code is the whole lock. Two
   words alone is 144 combinations — trivially walked. The suffix takes it
   past a hundred million. */
const roll = () => {
  const rnd = crypto.getRandomValues(new Uint8Array(3));
  const tail = [...rnd].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 4);
  return `${pick(WORDS_A)}-${pick(WORDS_B)}-${tail}`;
};

$("#dbLabel").textContent = (firebaseConfig.projectId || "firebase");
$("#who").value = localStorage.wtName || "";
$("#code").value = (decodeURIComponent(location.hash.slice(1)) || roll()).toLowerCase();
$("#roll").onclick = () => ($("#code").value = roll());
$("#enter").onclick = join;
$("#gate").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.tagName !== "BUTTON") join();
});

/* Fills the "Series" dropdown with every series already in the library, so
 * adding another episode doesn't require retyping (and possibly misspelling
 * — which would silently create a second, duplicate series) a name you've
 * already entered once. "+ New series" stays first and is the default. */
function populateSeriesSelect(selectName) {
  const sel = $("#librarySeriesSelect");
  if (!sel) return;
  sel.innerHTML = '<option value="">+ New series</option>';
  for (const series of MY_LIBRARY) {
    const opt = document.createElement("option");
    opt.value = series.name;
    opt.textContent = series.name;
    sel.appendChild(opt);
  }
  sel.value = selectName && findSeries(selectName) ? selectName : "";
  syncSeriesFields();
}

/* Existing series picked -> hide/unrequire the free-text name field and
 * carry the picked name over to it (addLibraryEpisode still just reads
 * form field "series", so nothing downstream needs to change).
 * "+ New series" picked -> show the field and make it required again. */
function syncSeriesFields() {
  const sel = $("#librarySeriesSelect");
  const field = $("#newSeriesField");
  const input = $("#librarySeries");
  if (!sel || !field || !input) return;
  if (sel.value) {
    field.hidden = true;
    input.required = false;
    input.value = sel.value;
    const imdb = findSeries(sel.value)?.imdbId || "";
    const imdbField = $("#libraryForm")?.querySelector('[name="imdbId"]');
    if (imdbField && imdb) imdbField.value = imdb;
  } else {
    field.hidden = false;
    input.required = true;
    const imdbField = $("#libraryForm")?.querySelector('[name="imdbId"]');
    if (imdbField && !findSeries(input.value)?.imdbId) imdbField.value = "";
  }
}

function openLibraryForm(seriesName) {
  populateSeriesSelect(seriesName);
  $("#libraryFormWrap").hidden = false;
  // When opened from a specific series' "+ Add episode" button, that series
  // is already picked and its name field is hidden — so send focus straight
  // to the episode link instead of a hidden input.
  const chosenSeries = seriesName ? findSeries(seriesName) : null;
  const imdbField = $("#libraryForm").querySelector('[name="imdbId"]');
  if (imdbField) { imdbField.value = chosenSeries?.imdbId || ""; }
  const target = chosenSeries
    ? $("#libraryForm").querySelector('[name="url"]')
    : $("#librarySeries");
  target?.focus();
}

$("#landingImportSubsBtn").onclick = () => {
  $("#subtitleImportWrap").hidden = !$("#subtitleImportWrap").hidden;
  if (!$("#subtitleImportWrap").hidden) $("#subtitleImportForm").querySelector('[name="url"]')?.focus();
};
$("#subtitleImportCancel").onclick = () => {
  $("#subtitleImportWrap").hidden = true;
  $("#subtitleImportForm").reset();
};
$("#subtitleImportForm").addEventListener("submit", (e) => {
  e.preventDefault();
  importOpenSubtitles(e.currentTarget);
});

$("#landingAddBtn").onclick = () => {
  if ($("#libraryFormWrap").hidden) openLibraryForm();
  else $("#libraryFormWrap").hidden = true;
};
$("#librarySeriesSelect").onchange = syncSeriesFields;
$("#landingJoinBtn").onclick = () => showGate();
$("#homeBtn").onclick = () => {
  // While connected to a room, just switch to the library view without a
  // full reload — reload used to wipe R.room from memory, so picking another
  // episode had no idea a room was already active and always jumped you into
  // a brand new one instead of updating the one you were just in.
  if (R.room) {
    $("#app").classList.remove("on");
    $("#landing").classList.add("on");
    renderLanding();
    return;
  }
  location.hash = "";
  location.reload();
};
$("#landingNewRoomBtn").onclick = () => {
  $("#code").value = roll();
  showGate();
};
$("#libraryForm").addEventListener("submit", (e) => {
  e.preventDefault();
  addLibraryEpisode(e.currentTarget);
});
$("#libraryCancel").onclick = () => {
  $("#libraryFormWrap").hidden = true;
  $("#libraryForm").reset();
  populateSeriesSelect();
};

if (location.hash.slice(1)) showGate($("#code").value);
else showLanding();

async function join() {
  const name = $("#who").value.trim() || "Guest";
  const code = $("#code").value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  const err = $("#gateErr");

  if (code.length < 6) return void (err.textContent = "Room codes need at least 6 characters. Use New code.");
  if (!firebaseConfig.databaseURL) {
    return void (err.textContent =
      "config.js has no databaseURL. Create a Realtime Database in the Firebase console and paste its URL in.");
  }

  $("#enter").disabled = true;
  err.textContent = "Signing in…";

  try {
    await signInAnonymously(auth);
  } catch (e) {
    $("#enter").disabled = false;
    const hint = /admin-restricted|operation-not-allowed/.test(String(e.code || e))
      ? "Anonymous sign-in is switched off. Firebase console → Authentication → Sign-in method → enable Anonymous."
      : String(e.message || e);
    return void (err.textContent = hint);
  }

  localStorage.wtName = name;
  R.name = name;
  R.room = code;
  R.uid = auth.currentUser.uid;
  location.hash = code;

  $("#gate").style.display = "none";
  $("#landing").classList.remove("on");
  $("#app").classList.add("on");
  $("#roomName").textContent = code;

  rememberRoom(code, {
    name,
    ...(R.pendingSource?.episodeId ? { episodeId: R.pendingSource.episodeId } : {}),
  });
  writeRooms();

  restoreLook();
  wireRoom();
  wireShelf();
  if (CFG.API) { $("#addBtn").hidden = false; loadLibrary(); }

  const pending = R.pendingSource;
  R.pendingSource = null;
  if (pending) {
    setTimeout(() => setSource(pending), 250);
  }
}

/* ============================================================ the room
 * Everything below is plain database reads and writes. The shared clock is
 * four fields; each client derives its own target position from them.
 * ==================================================================== */

function wireRoom() {
  const base = `rooms/${R.room}`;
  R.refs = {
    state:   ref(db, `${base}/state`),
    members: ref(db, `${base}/members`),
    me:      ref(db, `${base}/members/${R.uid}`),
    chat:    ref(db, `${base}/chat`),
    sig:     ref(db, `${base}/sig/${R.uid}`),
    seen:    ref(db, `${base}/seen`),
  };

  /* Firebase measures the gap between this device's clock and its servers'.
     That single number is what the whole sync rests on — no handshake of our
     own, and it stays corrected as the connection wanders. */
  onValue(ref(db, ".info/serverTimeOffset"), (s) => {
    R.offset = s.val() || 0;
    $("#netVal").textContent = `clock offset ${R.offset >= 0 ? "+" : ""}${Math.round(R.offset)}ms`;
  });

  onValue(ref(db, ".info/connected"), (s) => {
    if (!s.val()) return void say("Offline — reconnecting");
    // Re-arm on every reconnect: a disconnect handler only fires once.
    onDisconnect(R.refs.me).remove();
    onDisconnect(R.refs.sig).remove();
    set(R.refs.me, {
      name: R.name, pos: 0, dur: 0, stalled: false,
      voice: VOICE.on, noFile: false, at: serverTimestamp(),
    }).catch((e) => fbError(e, "presence write"));
  });

  runTransaction(R.refs.state, (cur) => {
    const blank = {
      kind: "none", ref: "", title: "", label: "",
      playing: false, pos: 0, rate: 1, at: Date.now(),
      hostId: R.uid, locked: false, pauseOnBuffer: true,
    };
    if (cur === null) return blank;
    // Fill any gaps rather than passing the node back as-is. A state missing
    // one field — `rate`, say — failed validation on every subsequent write,
    // including the write that would have repaired it. Rooms in that condition
    // were permanently stuck; this heals them the next time someone joins.
    for (const k of Object.keys(blank)) {
      if (cur[k] === undefined || cur[k] === null) cur[k] = blank[k];
    }
    return cur;
  }).catch((e) => fbError(e, "room setup"));

  onValue(R.refs.state, (s) => {
    const st = s.val();
    if (!st) return;
    R.state = st;
    rememberRoom(R.room, {
      name: R.name,
      title: st.title || "",
      kind: st.kind || "",
      ref: st.ref || "",
      episodeTitle: st.title || "",
    });
    applyState(st);
  }, (e) => fbError(e, "room read"));

  // If the room never materialises, say so rather than sitting there blank.
  setTimeout(() => {
    if (!R.state) {
      $("#emptyMsg").textContent =
        "Connected, but the room never loaded. Almost always the database rules — " +
        "open the browser console for the exact error.";
    }
  }, 6000);

  onValue(R.refs.members, (s) => {
    const val = s.val() || {};
    R.members = Object.entries(val)
      .map(([uid, m]) => ({ uid, ...m }))
      .sort((a, b) => (a.at || 0) - (b.at || 0));
    drawMembers();
    electHost();
  });

  onValue(R.refs.seen, (s) => {
    R.progress = s.val() || {};
    drawLists();
    if (R.state) offerResume(R.state);   // bookmarks often land after the state
  });

  onChildAdded(query(R.refs.chat, limitToLast(60)), (s) => addMsg(s.val()));
  onChildAdded(R.refs.sig, (s) => {
    const m = s.val();
    remove(s.ref);
    if (m?.from && m.from !== R.uid) onSignal(m.from, m.data);
  });
}

/* If the host's tab closed, presence removes them and the earliest-joined
   member left takes over. Everyone computes the same answer, and the
   transaction settles it if two try at once. */
function electHost() {
  if (!R.state || !R.members.length) return;
  const present = R.members.some((m) => m.uid === R.state.hostId);
  if (present) return;
  if (R.members[0].uid !== R.uid) return;
  runTransaction(R.refs.state, (cur) => {
    if (cur && !R.members.some((m) => m.uid === cur.hostId)) cur.hostId = R.uid;
    return cur;
  });
}

const canDrive = () =>
  !R.state?.locked || !R.state.hostId || R.state.hostId === R.uid;

function ctl(patch) {
  if (!R.state) return say("Still joining the room — give it a second.");
  if (!canDrive()) return say("The host has playback locked.");
  // Always carry playing/pos/rate. Without them a partial patch could land on
  // a partial node and leave it partial forever.
  patch = {
    playing: R.state.playing ?? false,
    pos: R.state.pos ?? 0,
    rate: R.state.rate ?? 1,
    ...patch,
  };
  // `at` is the instant `pos` was true. Restamping it without a fresh `pos`
  // would silently rewind everyone, so only position-carrying writes get it.
  update(R.refs.state, "pos" in patch ? { ...patch, at: serverTimestamp() } : patch)
    .catch((e) => fbError(e, "playback update"));
}

/* A rejected write used to fail in silence, which is the worst possible way for
   a rules mismatch to present itself: the app simply sits there. Now it says
   which write was refused and why. */
function fbError(e, what) {
  const msg = String(e?.message || e);
  console.error(`[parallel] ${what} refused:`, e);
  if (/permission|PERMISSION_DENIED/i.test(msg)) {
    say(`The database refused the ${what}. Your rules don't allow it — ` +
        `publish firebase/database.rules.json, then reload.`);
  } else {
    say(`${what} failed: ${msg}`);
  }
}

const serverNow = () => Date.now() + R.offset;

const expectedPos = () => {
  const s = R.state;
  if (!s) return 0;
  return s.playing ? s.pos + ((serverNow() - s.at) / 1000) * s.rate : s.pos;
};

/* One bookmark per title, so switching quality mid-film keeps your place. */
const titleId = (s) => {
  if (!s || s.kind === "none" || !s.ref) return "";
  // A library title keys off its folder, not the file, so switching to 720p
  // halfway through keeps your place. Firebase forbids . # $ / [ ] in keys.
  const base = s.kind === "r2" ? (String(s.ref).split("/")[1] || s.ref) : s.ref;
  return "t_" + `${s.kind}:${base}`.replace(/[.#$/\[\]]/g, "_").slice(0, 90);
};

/* ==========================================================================
 * Player adapter
 *
 * A <video> element and a YouTube iframe have nothing in common except that
 * both can be asked what time it is. Everything above this layer talks to PL
 * and never learns which one is mounted.
 * ======================================================================== */

const v = $("#v");

const PL = {
  kind: "none",
  yt: null,
  ytReady: false,
  readyWatch: 0,
  baseDur: 0,        // the film's real length, captured before any ad runs

  time() {
    if (this.kind === "yt") return this.ytReady ? this.yt.getCurrentTime() || 0 : 0;
    return v.currentTime || 0;
  },
  dur() {
    if (this.kind === "yt") {
      // Hold the real length: mid-ad, getDuration() reports the ad's instead,
      // which would make the scrubber jump and the drift maths nonsense.
      if (this.baseDur) return this.baseDur;
      return this.ytReady ? this.yt.getDuration() || 0 : 0;
    }
    return isFinite(v.duration) ? v.duration : 0;
  },

  /* No API tells you an ad is running. But the reported duration changing out
     from under an already-loaded video is a reliable enough tell. */
  adPlaying() {
    if (this.kind !== "yt" || !this.ytReady || !this.baseDur) return false;
    const d = this.yt.getDuration() || 0;
    return d > 0 && Math.abs(d - this.baseDur) > 2;
  },
  seek(t) {
    if (this.kind === "yt") { if (this.ytReady) this.yt.seekTo(Math.max(0, t), true); }
    else if (isFinite(v.duration)) v.currentTime = Math.max(0, t);
  },
  play() {
    if (this.kind === "yt") { if (this.ytReady) this.yt.playVideo(); return Promise.resolve(); }
    return v.play();
  },
  pause() {
    if (this.kind === "yt") { if (this.ytReady) this.yt.pauseVideo(); }
    else v.pause();
  },
  paused() {
    if (this.kind === "yt") return !this.ytReady || this.yt.getPlayerState() !== 1;
    return v.paused;
  },
  setRate(r) {
    if (this.kind === "yt") { if (this.ytReady) this.yt.setPlaybackRate(nearestYtRate(r)); }
    else v.playbackRate = r;
  },
  setVol(x) {
    if (this.kind === "yt") { if (this.ytReady) this.yt.setVolume(Math.round(x * 100)); }
    else v.volume = x;
  },
  setMuted(m) {
    if (this.kind === "yt") { if (this.ytReady) m ? this.yt.mute() : this.yt.unMute(); }
    else v.muted = m;
  },
  isMuted() {
    if (this.kind === "yt") return this.ytReady ? this.yt.isMuted() : false;
    return v.muted;
  },
  buffered() {
    if (this.kind === "yt") return this.ytReady ? this.yt.getVideoLoadedFraction() || 0 : 0;
    if (v.buffered.length && v.duration) return v.buffered.end(v.buffered.length - 1) / v.duration;
    return 0;
  },
  stalled() {
    if (this.kind === "yt") {
      return this.ytReady && (this.yt.getPlayerState() === 3 || this.adPlaying());
    }
    return v.readyState < 3 && !v.paused;
  },
};

/* YouTube exposes a fixed ladder of speeds, so a request for 1.07× has to be
   rounded to whatever it actually offers. */
function nearestYtRate(r) {
  const avail = PL.yt?.getAvailablePlaybackRates?.() || [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  return avail.reduce((best, x) => (Math.abs(x - r) < Math.abs(best - r) ? x : best), avail[0]);
}

let ytApi;
const loadYT = () => (ytApi ||= new Promise((ok, no) => {
  if (window.YT?.Player) return ok(window.YT);
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => { prev?.(); ok(window.YT); };
  const s = document.createElement("script");
  s.src = "https://www.youtube.com/iframe_api";
  s.onerror = () => no(new Error("blocked"));
  document.head.appendChild(s);
  setTimeout(() => no(new Error("timeout")), 12000);
}));

async function mountYT(videoId) {
  showSurface("yt");
  let YT;
  try { YT = await loadYT(); }
  catch { return say("Couldn't load YouTube's player — an extension may be blocking it."); }

  destroyYT();
  const host = document.createElement("div");
  $("#yt").appendChild(host);

  clearTimeout(PL.readyWatch);
  PL.readyWatch = setTimeout(() => {
    if (PL.ytReady) return;
    say("YouTube's player didn't finish loading — an ad blocker or privacy " +
        "extension is the usual cause. Allowlist this site and reload.");
    $("#emptyMsg").textContent =
      "YouTube's player never became ready. Try allowlisting this site in your " +
      "ad blocker, or use a direct video link or a local file instead.";
    $("#empty").style.display = "grid";
  }, 12000);

  PL.yt = new YT.Player(host, {
    videoId,
    width: "100%",
    height: "100%",
    // controls:0 hands the whole interface to ours, so speed, subtitles and
    // the drift ribbon stay consistent across every kind of source.
    playerVars: {
      controls: 0, disablekb: 1, modestbranding: 1, rel: 0, cc_load_policy: 0,
      playsinline: 1, iv_load_policy: 3, fs: 0, autoplay: 0, origin: location.origin,
    },
    events: {
      onReady: () => {
        clearTimeout(PL.readyWatch);
        PL.ytReady = true;
        PL.baseDur = PL.yt.getDuration() || 0;
        PL.setVol(LOOK.vol);
        PL.setMuted(false);
        $("#tEnd").textContent = fmtTime(PL.dur());
        drawTracks();
        hardSync();
        // The real title is only knowable once the player has loaded, so the
        // placeholder gets swapped out here rather than at paste time.
        try {
          const real = PL.yt.getVideoData?.().title;
          if (real && R.state?.kind === "yt" && R.state.title === "YouTube video") {
            ctl({ title: real.slice(0, 200) });
          }
        } catch {}
      },
      onStateChange: (e) => {
        setStall(e.data === 3 || PL.adPlaying(), PL.adPlaying() ? "Ad playing" : "Buffering");
        pushPresence({ stalled: e.data === 3 });
        if (e.data === 1 || e.data === 2) $("#tEnd").textContent = fmtTime(PL.dur());
      },
      onError: (e) => {
        const why = {
          2: "That video ID doesn't look right.",
          5: "YouTube can't play this one in a browser player.",
          100: "That video is private, deleted, or doesn't exist.",
          101: "The owner has disabled embedding, so it can only play on YouTube.",
          150: "The owner has disabled embedding, so it can only play on YouTube.",
        }[e.data] || "YouTube refused to play that.";
        say(why);
        $("#emptyMsg").textContent = why;
        $("#empty").style.display = "grid";
      },
    },
  });
}

function destroyYT() {
  clearTimeout(PL.readyWatch);
  PL.ytReady = false;
  PL.baseDur = 0;
  if (PL.yt) { try { PL.yt.destroy(); } catch {} PL.yt = null; }
  $("#yt").innerHTML = "";
}

function showSurface(which) {
  PL.kind = which;
  $("#ytwrap").classList.toggle("on", which === "yt");
  v.hidden = which === "yt" || which === "none";
  if (which !== "yt") destroyYT();
  if (which === "none") { v.removeAttribute("src"); v.load?.(); }
  $("#syncNote").textContent = which === "yt"
    ? "YouTube only accepts fixed playback speeds, so drift here is corrected by seeking rather than by easing the rate."
    : "Drift under 0.12s is left alone; beyond that the speed leans by up to 14% until it closes.";
  $("#ccNote").textContent = which === "yt"
    ? "YouTube's own captions can't be restyled from outside. Drop an .srt onto the panel to use one these settings apply to."
    : "";
}

/* ======================================================== the sync loop */

const SOFT = 0.12, HARD = 1.5, GAIN = 0.35, CAP = 0.14;
const YT_TOL = 0.7;

setInterval(sync, 1000);

function sync() {
  const s = R.state;
  if (!s || s.kind === "none" || R.dragging) return;
  const dur = PL.dur();
  if (!dur) return;

  if (PL.adPlaying()) {
    setStall(true, "Ad playing");
    $("#driftVal").textContent = "ad";
    return;                       // don't chase a position inside someone's ad
  }

  const want = expectedPos();
  const drift = want - PL.time();
  $("#driftVal").textContent = fmtDrift(drift);

  if (!s.playing) {
    if (!PL.paused()) PL.pause();
    if (Math.abs(drift) > 0.25) PL.seek(want);
    PL.setRate(s.rate);
    return;
  }

  if (PL.paused() && !R.blocked) {
    PL.play()?.catch(() => { R.blocked = true; $("#tap").classList.add("on"); });
  }

  if (PL.kind === "yt") {
    // No fine speed control available, so hold a wider deadband and jump.
    if (Math.abs(drift) > YT_TOL) PL.seek(want);
    PL.setRate(s.rate);
    return;
  }

  if (Math.abs(drift) > HARD) {
    PL.seek(want);
    PL.setRate(s.rate);
  } else if (Math.abs(drift) > SOFT) {
    // Behind -> run slightly fast; ahead -> slightly slow. Converges in a few
    // seconds and stays inaudible as long as the gain is capped.
    PL.setRate(clamp(s.rate * (1 + clamp(drift * GAIN, -CAP, CAP)), 0.25, 4));
  } else {
    PL.setRate(s.rate);
  }
}

const hardSync = () => { if (PL.dur()) PL.seek(expectedPos()); };
$("#resync").onclick = () => { hardSync(); say("Snapped to the room"); };

/* Position heartbeat: drives the other person's drift ribbon, and is what the
   bookmark is written from. */
let beat = 0;
setInterval(() => {
  if (!R.uid || !R.state) return;
  // A paused room only needs a heartbeat every five seconds, which keeps the
  // database's monthly download allowance comfortably out of reach.
  if (!R.state.playing && ++beat % 5) return;
  pushPresence({ pos: PL.time(), dur: PL.dur(), stalled: PL.stalled() });
  saveProgress();
}, 1000);

function pushPresence(patch) {
  if (R.refs.me) update(R.refs.me, patch).catch(() => {});
}

let lastSave = 0;
function saveProgress() {
  const s = R.state;
  if (!s?.playing || s.kind === "none") return;
  if (Date.now() - lastSave < 20000) return;
  lastSave = Date.now();
  const id = titleId(s), dur = PL.dur(), at = PL.time();
  if (!id || !dur) return;
  // The last ninety seconds count as finished — nobody wants dropping back
  // into the credits.
  const done = at > dur - 90;
  update(ref(db, `rooms/${R.room}/seen/${id}`), {
    pos: done ? 0 : at, dur, done, title: s.title || "", at: serverTimestamp(),
  }).catch(() => {});
}

/* ================================================================ sources */

const LOCAL = { file: null, url: null };

/* One text box takes YouTube in any of its shapes, or a plain video URL. */
function parseSource(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;

  const yt = s.match(
    /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/
  );
  if (yt) {
    const t = s.match(/[?&](?:t|start)=(\d+)/);
    return { kind: "yt", ref: yt[1], start: t ? +t[1] : 0, title: "YouTube video" };
  }
  if (/^[\w-]{11}$/.test(s)) return { kind: "yt", ref: s, start: 0, title: "YouTube video" };

  if (/^https?:\/\//i.test(s)) {
    let name = "Video";
    let path = s;
    try { path = new URL(s).pathname; name = decodeURIComponent(path.split("/").pop()) || "Video"; } catch {}
    const kind = /\.m3u8($|\?)/i.test(path) || /\.m3u8(?:[?#]|$)/i.test(s) ? "hls" : "url";
    return { kind, ref: s, start: 0, title: name.replace(/\.[^.]+$/, "") || "Stream" };
  }
  return null;
}

/* Internet Archive items are directories, not files. Ask the metadata API
   which of them is actually playable and stream that. */
const ARCHIVE_RE = /archive\.org\/(?:details|download|embed|stream)\/([^/?#]+)/i;

async function resolveArchive(id) {
  const r = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(`archive.org returned ${r.status}`);
  const j = await r.json();
  const files = j.files || [];

  // Prefer a browser-decodable H.264 MP4; the same item often also holds
  // MPEG-2, OGV and other formats Chrome won't touch.
  const score = (f) => {
    const n = f.name.toLowerCase(), fmt = (f.format || "").toLowerCase();
    if (!/\.(mp4|m4v|webm|ogv)$/.test(n)) return -1;
    let s = 0;
    if (n.endsWith(".mp4") || n.endsWith(".m4v")) s += 100;
    if (fmt.includes("h.264") || fmt.includes("mpeg4")) s += 50;
    if (n.endsWith(".webm")) s += 40;
    if (n.endsWith(".ogv")) s += 10;
    if (/512kb|_256kb|low/.test(n)) s -= 20;     // derivatives, not the good copy
    return s;
  };

  const best = files.filter((f) => score(f) > 0).sort((a, b) => score(b) - score(a))[0];
  if (!best) throw new Error("no MP4 or WebM in that item");

  const url = (f) => `https://archive.org/download/${id}/${encodeURIComponent(f.name)}`;
  const subs = files
    .filter((f) => /\.(vtt|srt)$/i.test(f.name))
    .slice(0, 8)
    .map((f) => ({ key: url(f), label: f.name.replace(/\.[^.]+$/, "").slice(-18) }));

  return {
    kind: "url", ref: url(best), label: "Archive",
    title: j.metadata?.title || id, subs,
  };
}

$("#urlGo").onclick = playPasted;
$("#urlIn").addEventListener("keydown", (e) => e.key === "Enter" && playPasted());

async function playPasted() {
  const raw = $("#urlIn").value.trim();
  if (!raw) return;

  const arc = raw.match(ARCHIVE_RE);
  if (arc) {
    $("#urlGo").textContent = "…";
    try {
      const src = await resolveArchive(arc[1]);
      $("#urlIn").value = "";
      setSource({ ...src, size: 0 });
      say(`Found ${src.title}`);
    } catch (e) {
      // The metadata call is the only part that needs CORS; playback doesn't.
      say(`Couldn't read that archive.org item (${e.message}). Open the item, ` +
          `right-click the MP4 under "Download Options" and paste that link instead.`);
    } finally {
      $("#urlGo").textContent = "Play";
    }
    return;
  }

  const parsed = parseSource(raw);
  if (!parsed) return say("That doesn't look like a YouTube link or a video URL.");
  $("#urlIn").value = "";
  setSource({
    kind: parsed.kind, ref: parsed.ref, title: parsed.title,
    label: parsed.kind === "yt" ? "YouTube" : "Link", subs: [], size: 0,
  }, parsed.start);
}

/* ------------------------------------------------------------------ shelf
 * Whatever you upload and wherever you upload it, saving the link here means
 * neither of you has to find it again. Lives in the room, so the room code
 * doubles as your shared collection. */

let SHELF = [];

function wireShelf() {
  onValue(ref(db, `rooms/${R.room}/shelf`), (s) => {
    const val = s.val() || {};
    SHELF = Object.entries(val).map(([id, e]) => ({ id, ...e }))
      .sort((a, b) => (b.at || 0) - (a.at || 0));
    drawLists();
  });
}

$("#saveBtn").onclick = async () => {
  const s = R.state;
  if (!s || !["url", "hls", "yt"].includes(s.kind)) {
    return say("Only links can be shelved — local files stay on your own machine.");
  }
  if (SHELF.some((e) => e.ref === s.ref)) return say("Already on the shelf.");

  const title = await ask({
    title: "Save to the shelf",
    body: "Both of you will see this in the room from now on.",
    value: s.title || "Untitled", ok: "Save",
  });
  if (!title) return;

  await push(ref(db, `rooms/${R.room}/shelf`), {
    kind: s.kind, ref: s.ref, title: title.slice(0, 200),
    label: s.label || "", subs: s.subs || [], at: serverTimestamp(),
  }).catch((e) => say("Couldn't save: " + e.message));
  say("Saved");
};

function drawLists() {
  const box = $("#shelfList");
  box.innerHTML = "";
  for (const e of SHELF) {
    const card = document.createElement("button");
    card.className = "title-card";
    card.dataset.ref = e.ref;
    card.innerHTML =
      `<span class="thumb"></span>` +
      `<span class="meta"><span class="nm">${esc(e.title)}</span>` +
      `<span class="host">${esc(e.label || hostOf(e.ref))}</span>` +
      `${progBarFor({ kind: e.kind, ref: e.ref })}</span>` +
      `<span class="kill" title="Remove">&times;</span>`;
    card.onclick = (ev) => {
      if (ev.target.classList.contains("kill")) {
        ev.stopPropagation();
        return void remove(ref(db, `rooms/${R.room}/shelf/${e.id}`));
      }
      setSource({ kind: e.kind, ref: e.ref, title: e.title, label: e.label, subs: e.subs || [], size: 0 });
    };
    box.appendChild(card);
  }
  $("#shelfSect").hidden = !SHELF.length;
  $("#listEmpty").hidden = !!(SHELF.length || LIB.length);
  markLib();
}

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, "").split(".").slice(-2)[0]; }
  catch { return "link"; }
}

function setSource(src, startAt = 0) {
  const kind = String(src?.kind || "");
  const ref = String(src?.ref || "").trim();

  if (!kind || !ref) {
    return say("This source has no playable link. Re-add the episode link from the library.");
  }

  const patch = {
    kind,
    ref,
    title: String(src?.title || "Untitled"),
    label: String(src?.label || ""),
    size: Number(src?.size || 0),
    subs: Array.isArray(src?.subs) ? src.subs : [],
    subtitleText: String(src?.subtitleText || ""),
    subtitleName: String(src?.subtitleName || ""),
    playing: false,
    pos: Number(startAt || 0),
  };

  ctl(patch);
}

/* --------------------------------------------------------- local files
 * Nothing is uploaded. Both people open their own copy and the room syncs the
 * playhead, which takes storage out of the equation completely. */

$("#localBtn").onclick = () => $("#filePick").click();
$("#filePick").onchange = (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  adoptLocal(f);
  setSource({
    kind: "local", ref: f.name, size: f.size, label: "Local",
    title: f.name.replace(/\.[^.]+$/, ""), subs: [],
  });
};

function adoptLocal(f) {
  if (LOCAL.url) URL.revokeObjectURL(LOCAL.url);
  LOCAL.file = f;
  LOCAL.url = URL.createObjectURL(f);
}

/* Upload a subtitle while already inside a room. The subtitle text is stored
 * in the shared room state, so the other viewer gets the same track too.
 *
 * This uses its own #subPick input rather than the library's #upPick — the
 * two used to share one input/onchange pair, and whichever assignment ran
 * last (library uploads, below) silently won and swallowed subtitle picks,
 * so "Upload subtitle" quietly stopped syncing to the room. */
$("#subPick").onchange = async (e) => {
  const f = e.target.files?.[0];
  e.target.value = "";
  if (!f) return;

  if (f.size > 1500000) {
    return say("Subtitle file is larger than 1.5 MB.");
  }

  const name = f.name || "subtitle.srt";
  if (!/\.(srt|vtt|ass|ssa)$/i.test(name)) {
    return say("Use an .srt, .vtt, .ass, or .ssa subtitle file.");
  }

  try {
    const text = await f.text();
    const cues = parseSubs(text);
    if (!cues.length) {
      return say("That subtitle file doesn't contain readable SRT/VTT/ASS/SSA cues.");
    }

    R.localSub = {
      label: name.replace(/\.[^.]+$/, "").slice(0, 24) || "English",
      cues,
    };
    R.cueTrack = "local";
    setCues(cues);

    // Keep the subtitle in the shared room state. This also makes it survive
    // when another viewer joins or the source is remounted.
    ctl({
      subtitleText: text,
      subtitleName: name.slice(0, 120),
      subs: [{ key: "local", label: "English" }],
    });

    drawTracks();
    say(`Loaded ${name} — subtitles are now shared in this room.`);
  } catch (err) {
    console.error(err);
    say("Couldn't read that subtitle file.");
  }
};

function loadLocal(src) {
  if (LOCAL.file && LOCAL.file.name === src.ref) {
    showSurface("file");
    v.src = LOCAL.url;
    pushPresence({ noFile: false });
    $("#empty").style.display = "none";
  } else {
    showSurface("none");
    pushPresence({ noFile: true });
    $("#empty").style.display = "grid";
    $("#emptyMsg").textContent =
      `Open your copy of "${src.ref}"${src.size ? ` (${fmtSize(src.size)})` : ""} to join in.`;
    askForLocal(src);
  }
}

async function askForLocal(src) {
  const go = await ask({
    title: "Open your copy",
    body: `Someone's playing "${src.ref}". Pick the same file from your computer and you'll share a playhead — nothing is uploaded either way.`,
    input: false, ok: "Choose file",
  });
  if (!go) return;

  const p = document.createElement("input");
  p.type = "file";
  p.accept = "video/*,.mkv,.mp4,.webm,.mov";
  p.onchange = () => {
    const f = p.files[0];
    if (!f) return;
    if (src.size && Math.abs(f.size - src.size) > 1024) {
      say("Different file size — if it's a different encode the timings may not line up.");
    }
    adoptLocal(f);
    loadLocal(R.state);
    hardSync();
  };
  p.click();
}

/* ----------------------------------------------------------- apply state */

function applyState(s) {
  const key = `${s.kind}:${s.ref}`;
  if (key !== applyState.last) {
    applyState.last = key;
    mountSource(s);
  }

  $("#nowLabel").innerHTML = s.kind === "none" ? "" :
    `<b>${esc(s.title || "Untitled")}</b><span class="src">${esc(s.label || s.kind)}</span>`;
  $("#lock").setAttribute("aria-pressed", String(!!s.locked));
  $("#pob").setAttribute("aria-pressed", String(!!s.pauseOnBuffer));
  $("#rateBtn").textContent = fmtRate(s.rate);
  $("#rateVal").textContent = fmtRate(s.rate);
  $$("#rates .chip").forEach((c) => c.classList.toggle("on", +c.dataset.rate === s.rate));
  paintPlay();
  drawHosts();
  drawTracks();
  $("#saveBtn").hidden = !["url", "hls", "yt"].includes(s.kind) ||
                          SHELF.some((e) => e.ref === s.ref);
  offerResume(s);
  markLib();
}

/* Only Safari plays .m3u8 natively via <video src>; everywhere else needs
 * hls.js to demux the stream into something MSE can take. Loaded lazily and
 * only once, torn down whenever a different source is mounted.
 *
 * Most third-party HLS hosts don't send CORS headers, so the browser refuses
 * to read the response at all — no client-side flag fixes that. If CFG.API
 * points at the deployed Worker, every playlist and segment request is
 * routed through its /proxy route instead, which fetches server-side (no
 * CORS applies between servers) and re-adds the headers on the way back. */
const proxied = (u) =>
  CFG.API
    ? `${CFG.API.replace(/\/$/, "")}/proxy?url=${encodeURIComponent(u)}`
    : `/api/proxy?url=${encodeURIComponent(u)}`;

let hlsMod = null;
function teardownHls() {
  if (R.hls) { try { R.hls.destroy(); } catch {} R.hls = null; }
}
async function mountHls(url) {
  const canNative = v.canPlayType("application/vnd.apple.mpegurl");
  if (canNative) { v.src = proxied(url); return; }
  if (!hlsMod) hlsMod = await import("https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js").catch(() => null);
  const Hls = hlsMod?.default || window.Hls;
  if (!Hls || !Hls.isSupported()) {
    say("This browser can't play HLS streams (.m3u8).");
    return;
  }
  const hls = new Hls();
  R.hls = hls;
  hls.on(Hls.Events.MANIFEST_PARSED, () => drawQuals());
  hls.on(Hls.Events.LEVEL_SWITCHED, () => drawQuals());
  hls.on(Hls.Events.ERROR, (_evt, data) => {
    if (!data?.fatal) return;
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
    else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
    else { teardownHls(); say("That stream wouldn't load."); }
  });
  hls.loadSource(proxied(url));
  hls.attachMedia(v);
}

function mountSource(s) {
  R.localSub = null;
  R.cueTrack = null;
  setCues([]);
  R.blocked = false;
  $("#tap").classList.remove("on");
  teardownHls();

  if (s.subtitleText) {
    const cues = parseSubs(s.subtitleText);
    if (cues.length) {
      R.localSub = {
        label: s.subtitleName ? s.subtitleName.replace(/\.[^.]+$/, "").slice(0, 24) : "English",
        cues,
      };
      R.cueTrack = "local";
      setCues(cues);
    }
  }

  switch (s.kind) {
    case "yt":
      $("#empty").style.display = "none";
      mountYT(s.ref);
      break;
    case "local":
      loadLocal(s);
      break;
    case "hls":
      showSurface("file");
      $("#empty").style.display = "none";
      mountHls(s.ref);
      { const first = (s.subs || [])[0]; if (first && !s.subtitleText) pickTrack(first.key); }
      break;
    case "url":
    case "r2": {
      showSurface("file");
      $("#empty").style.display = "none";
      v.src = s.kind === "r2" ? mediaUrl(s.ref) : s.ref;
      const first = (s.subs || [])[0];
      if (first && !s.subtitleText) pickTrack(first.key);
      break;
    }
    default:
      showSurface("none");
      $("#empty").style.display = "grid";
      $("#emptyMsg").textContent = "Paste a YouTube link, or open a file from your computer.";
  }
  drawQuals();
}

/* Offer the bookmark once, and only while it's still paused near the start. */
function offerResume(s) {
  const box = $("#resume");
  const seen = R.progress[titleId(s)];
  const at = seen && !seen.done ? seen.pos : 0;
  const tag = `${s.kind}:${s.ref}:${Math.round(at)}`;
  if (!(at > 30) || s.playing || s.pos > 30 || R.shownResume === tag) {
    return void box.classList.remove("on");
  }
  R.shownResume = tag;
  $("#resumeAt").textContent = fmtTime(at);
  box.classList.add("on");
  $("#resumeGo").onclick = () => { box.classList.remove("on"); seekTo(at); };
  $("#resumeNo").onclick = () => { box.classList.remove("on"); seekTo(0); };
}

/* ============================================================== controls */

function toggle() {
  if (!R.state || R.state.kind === "none") return say("Pick something to watch first.");
  ctl({ playing: !R.state.playing, pos: PL.time() });
}
const seekTo = (t) => ctl({ pos: clamp(t, 0, PL.dur() || 0) });
const nudgeBy = (d) => seekTo(PL.time() + d);

$("#playBtn").onclick = toggle;
$("#back10").onclick = () => nudgeBy(-10);
$("#fwd10").onclick = () => nudgeBy(10);
$("#tapBtn").onclick = () => {
  R.blocked = false;
  $("#tap").classList.remove("on");
  PL.setMuted(false);
  PL.play()?.catch(() => {});
};

function paintPlay() {
  const playing = !!R.state?.playing;
  $("#playBtn").innerHTML = ic(playing ? "pause" : "play");
  $("#playBtn").setAttribute("aria-label", playing ? "Pause" : "Play");
}

const scrub = $("#scrub");
const frac = (e) => {
  const r = scrub.getBoundingClientRect();
  return clamp(((e.touches?.[0]?.clientX ?? e.clientX) - r.left) / r.width, 0, 1);
};
scrub.addEventListener("pointerdown", (e) => {
  if (!PL.dur()) return;
  R.dragging = true;
  scrub.classList.add("dragging");
  scrub.setPointerCapture(e.pointerId);
  paintScrub(frac(e) * PL.dur());
});
scrub.addEventListener("pointermove", (e) => {
  const d = PL.dur();
  if (!d) return;
  const f = frac(e);
  $("#tip").textContent = fmtTime(f * d);
  $("#tip").style.left = f * 100 + "%";
  if (R.dragging) paintScrub(f * d);
});
scrub.addEventListener("pointerup", (e) => {
  if (!R.dragging) return;
  R.dragging = false;
  scrub.classList.remove("dragging");
  seekTo(frac(e) * PL.dur());
});

function paintScrub(t) {
  const d = PL.dur() || 0;
  const pct = d ? (t / d) * 100 : 0;
  $("#fill").style.width = pct + "%";
  $("#knob").style.left = pct + "%";
  $("#tNow").textContent = fmtTime(t);
}

/* One clock for the readouts, so YouTube (which fires no timeupdate) and the
   <video> element are painted the same way. */
setInterval(() => {
  if (!R.dragging) paintScrub(PL.time());
  $("#tEnd").textContent = fmtTime(PL.dur());
  $("#buf").style.width = (PL.buffered() * 100).toFixed(1) + "%";
}, 250);

v.addEventListener("waiting", () => { setStall(true); pushPresence({ stalled: true }); });
v.addEventListener("playing", () => { setStall(false); pushPresence({ stalled: false }); });
v.addEventListener("canplay", () => setStall(false));
v.addEventListener("loadedmetadata", hardSync);
v.addEventListener("error", () => {
  if (PL.kind !== "file") return;
  say(R.state?.kind === "url"
    ? "That URL wouldn't load. Direct video links need to allow cross-origin requests."
    : R.state?.kind === "hls"
    ? "That stream wouldn't load. It may not allow cross-origin playback."
    : "That file wouldn't play in this browser.");
});

function setStall(on, why = "Buffering") {
  $("#stall").classList.toggle("on", on);
  if (on) $("#stallWhy").textContent = why;
}

/* Pause everyone when one person stalls — usually wanted, occasionally
   maddening, hence the switch. */
let stallGuard = 0;
setInterval(() => {
  // One writer only, or a single stall produces a write per person.
  if (!R.state?.pauseOnBuffer || !R.state.playing) return;
  if (R.state.hostId !== R.uid) return;
  const stuck = R.members.some((m) => m.stalled);
  if (stuck && Date.now() - stallGuard > 4000) {
    stallGuard = Date.now();
    ctl({ playing: false, pos: expectedPos() });
    say("Paused — someone's buffering");
  }
}, 1200);

/* ============================================================== subtitles
 * Parsed and painted by us rather than handed to a <track> element. Native
 * cue styling is limited and inconsistent, and it doesn't exist at all over a
 * YouTube iframe — this way one set of controls works everywhere. */

function parseSubs(text) {
  text = text.replace(/\r/g, "");
  const cues = [];

  if (/^\[Script Info\]/m.test(text) || /^Dialogue:/m.test(text)) {
    for (const line of text.split("\n")) {
      if (!line.startsWith("Dialogue:")) continue;
      const f = line.slice(9).split(",");
      if (f.length < 10) continue;
      const start = tc(f[1]), end = tc(f[2]);
      if (start == null || end == null) continue;
      cues.push({ start, end, text: tidy(f.slice(9).join(",")) });
    }
  } else {
    for (const block of text.split(/\n{2,}/)) {
      const lines = block.split("\n").filter((l) => l.trim());
      if (!lines.length) continue;
      const i = lines[0].includes("-->") ? 0 : 1;
      if (!lines[i]?.includes("-->")) continue;
      const [a, b] = lines[i].split("-->");
      const start = tc(a), end = tc(b);
      if (start == null || end == null) continue;
      cues.push({ start, end, text: tidy(lines.slice(i + 1).join("\n")) });
    }
  }
  return cues.sort((a, b) => a.start - b.start);
}

function tc(s) {
  const m = String(s).trim().match(/(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/);
  if (!m) return null;
  return (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, "0") / 1000;
}

const tidy = (s) =>
  s.replace(/\{[^}]*\}/g, "")          // ASS override blocks
   .replace(/\\N|\\n/g, "\n")
   .replace(/<(?!\/?i\b)[^>]*>/g, "")  // keep <i>, drop the rest
   .trim();

function setCues(c) { R.cues = c; R.cueIdx = -1; $("#subs").innerHTML = ""; }

async function pickTrack(key) {
  R.cueTrack = key;
  drawTracks();
  if (!key) return setCues([]);
  if (key === "local") return setCues(R.localSub?.cues || []);
  try {
    const source = /^https?:\/\//i.test(key) ? proxied(key) : mediaUrl(key);
    setCues(parseSubs(await (await fetch(source)).text()));
  } catch { setCues([]); say("Couldn't load that subtitle file."); }
}

function drawTracks() {
  const box = $("#tracks");
  if (!box) return;
  box.innerHTML = "";

  const upload = document.createElement("button");
  upload.className = "chip";
  upload.textContent = "Upload subtitle";
  upload.onclick = () => $("#subPick").click();
  box.appendChild(upload);

  const off = document.createElement("button");
  off.className = "chip" + (R.cueTrack ? "" : " on");
  off.textContent = "Off";
  off.onclick = () => pickTrack(null);
  box.appendChild(off);

  if (R.localSub) {
    const b = document.createElement("button");
    b.className = "chip" + (R.cueTrack === "local" ? " on" : "");
    b.textContent = R.localSub.label;
    b.onclick = () => pickTrack("local");
    box.appendChild(b);
  }

  if (PL.kind === "yt" && PL.ytReady) {
    const b = document.createElement("button");
    b.className = "chip" + (R.ytCC ? " on" : "");
    b.textContent = "YouTube CC";
    b.title = "YouTube's own captions — these can't be restyled";
    b.onclick = () => {
      R.ytCC = !R.ytCC;
      try { R.ytCC ? PL.yt.loadModule("captions") : PL.yt.unloadModule("captions"); }
      catch { say("This video has no YouTube captions."); }
      drawTracks();
    };
    box.appendChild(b);
  }

  for (const s of R.state?.subs || []) {
    const b = document.createElement("button");
    b.className = "chip" + (s.key === R.cueTrack ? " on" : "");
    b.textContent = s.label;
    b.onclick = () => pickTrack(s.key);
    box.appendChild(b);
  }

  if (!R.localSub && !(R.state?.subs || []).length && PL.kind !== "yt") {
    const n = document.createElement("span");
    n.style.cssText = "font-size:12px;color:var(--dimmer);align-self:center";
    n.textContent = "Upload an SRT, VTT, ASS, or SSA subtitle.";
    box.appendChild(n);
  }
}

(function paintCue() {
  requestAnimationFrame(paintCue);
  const box = $("#subs");
  if (!R.ccOn || !R.cues.length) { if (box.innerHTML) box.innerHTML = ""; return; }
  const t = PL.time() - R.delay;

  let i = R.cueIdx;
  if (i < 0 || !R.cues[i] || t < R.cues[i].start || t > R.cues[i].end) {
    i = R.cues.findIndex((c) => t >= c.start && t <= c.end);
  }
  if (i === R.cueIdx) return;
  R.cueIdx = i;
  box.innerHTML = i < 0 ? "" : R.cues[i].text.split("\n")
    .map((l) => `<span>${esc(l).replace(/&lt;i&gt;/g, "<i>").replace(/&lt;\/i&gt;/g, "</i>")}</span>`)
    .join("<br>");
})();

/* =========================================================== look & feel */

const LOOK = {
  size: 3.1, color: "#FFFFFF", bg: 0.62, font: "var(--ui)",
  edge: "shadow", pos: 9, wid: 82, vol: 1, delay: 0, cc: true,
};

const SUB_COLORS = ["#FFFFFF", "#F7E7A1", "#5EEAD4", "#F5A9C4", "#C9D3E0"];
const SUB_FONTS = [
  { l: "Sans", v: "var(--ui)" },
  { l: "Serif", v: 'Georgia,"Times New Roman",serif' },
  { l: "Mono", v: "var(--mono)" },
  { l: "System", v: "system-ui,-apple-system,sans-serif" },
];
const EDGES = {
  none: "none",
  shadow: "0 2px 10px rgba(0,0,0,.85)",
  outline: "-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000,0 0 4px rgba(0,0,0,.9)",
  glow: "0 0 12px rgba(0,0,0,1),0 0 4px rgba(0,0,0,1)",
};

function applyLook() {
  const r = document.documentElement.style;
  r.setProperty("--sub-scale", LOOK.size);
  r.setProperty("--sub-color", LOOK.color);
  r.setProperty("--sub-bg", `rgba(0,0,0,${LOOK.bg})`);
  r.setProperty("--sub-bottom", LOOK.pos + "%");
  r.setProperty("--sub-width", LOOK.wid + "%");
  r.setProperty("--sub-family", LOOK.font);
  r.setProperty("--sub-edge", EDGES[LOOK.edge]);
  sizeSubs();

  $("#sizeVal").textContent = Math.round((LOOK.size / 3.1) * 100) + "%";
  $("#bgVal").textContent = Math.round(LOOK.bg * 100) + "%";
  $("#posVal").textContent = LOOK.pos + "%";
  $("#widVal").textContent = LOOK.wid + "%";
  $("#delayVal").textContent = (LOOK.delay >= 0 ? "+" : "") + LOOK.delay.toFixed(1) + "s";
  $("#delOut").textContent = !LOOK.delay ? "in sync"
    : LOOK.delay > 0 ? `${LOOK.delay.toFixed(1)}s later` : `${(-LOOK.delay).toFixed(1)}s earlier`;
  R.delay = LOOK.delay;
  R.cueIdx = -1;
  localStorage.wtLook = JSON.stringify(LOOK);
}

/* Sized as a share of the picture, not a fixed pixel count, so it reads the
   same in a small window and on a projector. */
function sizeSubs() {
  const w = $("#stage").clientWidth || 900;
  $("#subs").style.fontSize = (LOOK.size * w) / 100 + "px";
}
addEventListener("resize", sizeSubs);

function restoreLook() {
  try { Object.assign(LOOK, JSON.parse(localStorage.wtLook || "{}")); } catch {}
  R.ccOn = LOOK.cc;
  R.delay = LOOK.delay;
  v.volume = LOOK.vol;
  $("#volume").value = LOOK.vol;
  $("#size").value = LOOK.size;
  $("#bg").value = LOOK.bg;
  $("#pos").value = LOOK.pos;
  $("#wid").value = LOOK.wid;
  $("#ccBtn").setAttribute("aria-pressed", String(R.ccOn));
  buildChips();
  applyLook();
  paintVol();
}

function buildChips() {
  const rates = $("#rates");
  rates.innerHTML = "";
  for (const r of [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]) {
    const b = document.createElement("button");
    b.className = "chip";
    b.dataset.rate = r;
    b.textContent = fmtRate(r);
    b.onclick = () => ctl({ rate: r, pos: PL.time() });
    rates.appendChild(b);
  }
  const cols = $("#colors");
  cols.innerHTML = "";
  for (const c of SUB_COLORS) {
    const b = document.createElement("button");
    b.className = "chip sw" + (c === LOOK.color ? " on" : "");
    b.style.background = c;
    b.title = c;
    b.onclick = () => { LOOK.color = c; applyLook(); syncChips(); };
    cols.appendChild(b);
  }
  const fonts = $("#fonts");
  fonts.innerHTML = "";
  for (const f of SUB_FONTS) {
    const b = document.createElement("button");
    b.className = "chip" + (f.v === LOOK.font ? " on" : "");
    b.textContent = f.l;
    b.style.fontFamily = f.v;
    b.onclick = () => { LOOK.font = f.v; applyLook(); syncChips(); };
    fonts.appendChild(b);
  }
  const edges = $("#edges");
  edges.innerHTML = "";
  for (const k of Object.keys(EDGES)) {
    const b = document.createElement("button");
    b.className = "chip" + (k === LOOK.edge ? " on" : "");
    b.textContent = k[0].toUpperCase() + k.slice(1);
    b.onclick = () => { LOOK.edge = k; applyLook(); syncChips(); };
    edges.appendChild(b);
  }
}

function syncChips() {
  $$("#colors .chip").forEach((b, i) => b.classList.toggle("on", SUB_COLORS[i] === LOOK.color));
  $$("#fonts .chip").forEach((b, i) => b.classList.toggle("on", SUB_FONTS[i].v === LOOK.font));
  $$("#edges .chip").forEach((b, i) => b.classList.toggle("on", Object.keys(EDGES)[i] === LOOK.edge));
}

const bindRange = (id, key) =>
  ($(id).oninput = (e) => { LOOK[key] = +e.target.value; applyLook(); });
bindRange("#size", "size"); bindRange("#bg", "bg");
bindRange("#pos", "pos"); bindRange("#wid", "wid");

const shiftDelay = (d) => { LOOK.delay = clamp(+(LOOK.delay + d).toFixed(1), -30, 30); applyLook(); };
$("#delMinus").onclick = () => shiftDelay(-0.1);
$("#delPlus").onclick = () => shiftDelay(0.1);

$("#volume").oninput = (e) => {
  LOOK.vol = +e.target.value;
  PL.setMuted(false);
  PL.setVol(LOOK.vol);
  paintVol();
  applyLook();
};
$("#muteBtn").onclick = () => { PL.setMuted(!PL.isMuted()); paintVol(); };
function paintVol() {
  const m = PL.isMuted() || !LOOK.vol;
  $("#muteBtn").innerHTML = ic(m ? "mute" : "vol");
  $("#volume").value = m ? 0 : LOOK.vol;
}

/* ================================================================= chrome */

$("#back10").innerHTML = ic("back");
$("#fwd10").innerHTML = ic("fwd");
$("#ccBtn").innerHTML = ic("cc");
$("#setBtn").innerHTML = ic("cog");
$("#fsBtn").innerHTML = ic("fs");
$("#railBtn").innerHTML = ic("rail");
paintPlay();

$("#ccBtn").onclick = () => {
  R.ccOn = LOOK.cc = !R.ccOn;
  $("#ccBtn").setAttribute("aria-pressed", String(R.ccOn));
  applyLook();
};
$("#setBtn").onclick = () => {
  const on = $("#sheet").classList.toggle("on");
  $("#setBtn").setAttribute("aria-pressed", String(on));
  $("#subs").classList.toggle("lifted", on);
};
$("#rateBtn").onclick = () => { $("#setBtn").click(); showTab("play"); };
$("#fsBtn").onclick = () =>
  document.fullscreenElement ? document.exitFullscreen() : $("#stage").requestFullscreen?.();
document.addEventListener("fullscreenchange", () => {
  $("#fsBtn").innerHTML = ic(document.fullscreenElement ? "exit" : "fs");
  sizeSubs();
});
$("#railBtn").onclick = () => {
  const off = $("#app").classList.toggle("rail-off");
  $("#railBtn").setAttribute("aria-pressed", String(!off));
  setTimeout(sizeSubs, 260);
};

$$(".tab").forEach((t) => (t.onclick = () => showTab(t.dataset.tab)));
function showTab(name) {
  $$(".tab").forEach((t) => t.classList.toggle("on", t.dataset.tab === name));
  $$("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== name));
}
$$(".rail-tab").forEach((t) => (t.onclick = () => {
  $$(".rail-tab").forEach((x) => x.classList.toggle("on", x === t));
  $$(".pane").forEach((p) => p.classList.toggle("on", p.dataset.pane === t.dataset.pane));
}));

let idle;
const wake = () => {
  $("#stage").classList.remove("idle");
  clearTimeout(idle);
  idle = setTimeout(() => {
    if (R.state?.playing && !$("#sheet").classList.contains("on")) $("#stage").classList.add("idle");
  }, 2600);
};
["pointermove", "pointerdown", "keydown"].forEach((e) => $("#stage").addEventListener(e, wake));
wake();

// The shield sits over the YouTube iframe so our click handling wins.
$("#shield").addEventListener("click", toggle);
$("#shield").addEventListener("dblclick", () => $("#fsBtn").click());

addEventListener("keydown", (e) => {
  if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  const hit = {
    " ": toggle, k: toggle,
    ArrowLeft: () => nudgeBy(e.shiftKey ? -30 : -5),
    ArrowRight: () => nudgeBy(e.shiftKey ? 30 : 5),
    j: () => nudgeBy(-10), l: () => nudgeBy(10),
    ArrowUp: () => { LOOK.vol = clamp(LOOK.vol + 0.05, 0, 1); PL.setVol(LOOK.vol); paintVol(); applyLook(); },
    ArrowDown: () => { LOOK.vol = clamp(LOOK.vol - 0.05, 0, 1); PL.setVol(LOOK.vol); paintVol(); applyLook(); },
    m: () => $("#muteBtn").click(),
    f: () => $("#fsBtn").click(),
    c: () => $("#ccBtn").click(),
    "[": () => shiftDelay(-0.1),
    "]": () => shiftDelay(0.1),
    s: () => $("#resync").click(),
  }[e.key];
  if (hit) { e.preventDefault(); hit(); }
});

/* ================================================================= people */

const PALETTE = ["#5EEAD4", "#F5A9C4", "#F2B65A", "#A8B4F5", "#8FE388"];
const colorOf = (i) => PALETTE[i % PALETTE.length];

function drawMembers() {
  const box = $("#whoList");
  box.innerHTML = "";
  R.members.forEach((m, i) => {
    const row = document.createElement("div");
    row.className = "person" + (m.noFile ? " away" : "");
    row.dataset.uid = m.uid;
    row.innerHTML =
      `<span class="dot" style="background:${colorOf(i)}"></span>` +
      `<span class="nm">${esc(m.name || "Guest")}${m.uid === R.uid ? " (you)" : ""}</span>` +
      (m.voice ? `<span class="lvl" style="color:${colorOf(i)}"></span>` : "") +
      (m.noFile ? `<span class="tagline">no file</span>` : "") +
      (m.uid === R.state?.hostId ? `<span class="tagline">host</span>` : "");
    box.appendChild(row);
  });
  if (!R.members.length) box.innerHTML = `<span class="hollow" style="padding:0">Just you so far.</span>`;
  drawHosts();
  drawRibbon();
  syncPeers();
}

function drawHosts() {
  const box = $("#hosts");
  box.innerHTML = "";
  for (const m of R.members) {
    const b = document.createElement("button");
    b.className = "chip" + (m.uid === R.state?.hostId ? " on" : "");
    b.textContent = m.name || "Guest";
    b.onclick = () => {
      if (!canDrive()) return say("Only the host can pass control while the room is locked.");
      update(R.refs.state, { hostId: m.uid });
    };
    box.appendChild(b);
  }
}

$("#lock").onclick = (e) => {
  const next = e.currentTarget.getAttribute("aria-pressed") !== "true";
  if (R.state?.hostId && R.state.hostId !== R.uid) return say("Only the host can change this.");
  update(R.refs.state, { locked: next });
};
$("#pob").onclick = (e) =>
  ctl({ pauseOnBuffer: e.currentTarget.getAttribute("aria-pressed") !== "true" });

/* ---------------- the drift ribbon: both playheads on one strip ---------- */

const heads = new Map();

function drawRibbon() {
  const rib = $("#ribbon"), d = PL.dur();
  if (!d) {
    heads.forEach((el) => el.remove());
    heads.clear();
    return void $("#gap").classList.remove("on");
  }

  const pts = R.members.map((m, i) => ({
    uid: m.uid,
    pos: m.uid === R.uid ? PL.time() : m.pos || 0,
    stalled: m.stalled,
    color: colorOf(i),
  })).filter((p) => isFinite(p.pos));

  for (const [uid, el] of heads) {
    if (!pts.some((p) => p.uid === uid)) { el.remove(); heads.delete(uid); }
  }

  for (const p of pts) {
    let el = heads.get(p.uid);
    const to = clamp((p.pos / d) * 100, 0, 100);
    if (!el) {
      el = document.createElement("div");
      el.className = "head";
      el.style.background = p.color;
      if (p.uid === R.uid) el.style.height = "17px";
      rib.appendChild(el);
      heads.set(p.uid, el);
      el.style.left = to + "%";
      continue;
    }
    // A one-second glide reads as motion; a seek should read as a jump.
    if (Math.abs(to - parseFloat(el.style.left || 0)) > 4) {
      el.style.transition = "none";
      el.style.left = to + "%";
      void el.offsetWidth;
      el.style.transition = "";
    } else {
      el.style.left = to + "%";
    }
    el.classList.toggle("stalled", !!p.stalled);
  }

  const gap = $("#gap"), label = $("#gapLabel");
  if (pts.length < 2) return void gap.classList.remove("on");

  const lo = Math.min(...pts.map((p) => p.pos));
  const hi = Math.max(...pts.map((p) => p.pos));
  const spread = hi - lo;

  if (spread > 0.35) {
    R.seenSep = true;
    gap.classList.add("on");
    gap.style.left = (lo / d) * 100 + "%";
    gap.style.width = (spread / d) * 100 + "%";
    label.textContent = spread < 1 ? `${Math.round(spread * 1000)}ms apart` : `${spread.toFixed(1)}s apart`;
  } else {
    gap.classList.remove("on");
    if (R.seenSep) {                 // they just came back together
      R.seenSep = false;
      const c = $("#conv");
      c.style.left = ((lo + spread / 2) / d) * 100 + "%";
      c.classList.remove("ping");
      void c.offsetWidth;
      c.classList.add("ping");
    }
  }
}
setInterval(drawRibbon, 1000);

/* =================================================================== chat */

$("#chatIn").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const text = e.target.value.trim();
  if (!text) return;
  push(R.refs.chat, { uid: R.uid, name: R.name, text, at: serverTimestamp() })
    .catch((e) => fbError(e, "chat message"));
  e.target.value = "";
});

function addMsg(m) {
  if (!m) return;
  const box = $("#msgs");
  const i = R.members.findIndex((x) => x.uid === m.uid);
  const el = document.createElement("div");
  el.className = "msg";
  el.innerHTML = `<span class="from" style="color:${colorOf(i < 0 ? 0 : i)}">${esc(m.name || "Guest")}</span>${esc(m.text)}`;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

$("#copyBtn").onclick = async () => {
  const link = location.origin + location.pathname + "#" + R.room;
  try { await navigator.clipboard.writeText(link); } catch { prompt("Copy this link", link); }
  const b = $("#copyBtn");
  b.textContent = "Copied";
  b.classList.add("done");
  setTimeout(() => { b.textContent = "Copy link"; b.classList.remove("done"); }, 1600);
};

/* ================================================================= dialog */

function ask({ title, body, value = "", ok = "OK", input = true }) {
  return new Promise((done) => {
    const box = $("#ask"), field = $("#askIn");
    $("#askTitle").textContent = title;
    $("#askBody").textContent = body || "";
    $("#askBody").style.display = body ? "" : "none";
    field.style.display = input ? "" : "none";
    field.value = value;
    $("#askYes").textContent = ok;
    box.classList.add("on");
    if (input) { field.focus(); field.select(); }

    const close = (val) => {
      box.classList.remove("on");
      field.onkeydown = $("#askYes").onclick = $("#askNo").onclick = null;
      done(val);
    };
    $("#askYes").onclick = () => close(input ? field.value.trim() : true);
    $("#askNo").onclick = () => close(null);
    field.onkeydown = (e) => { if (e.key === "Enter") close(field.value.trim()); };
  });
}

/* ================================================================== voice
 * Peer-to-peer over WebRTC. The offer/answer handshake is relayed through the
 * room's own database node, so there's no signalling server to run and no
 * media ever touches anyone's infrastructure. */

const VOICE = {
  on: false, stream: null, ctx: null, readLocal: null,
  peers: new Map(), duck: true, duckUntil: 0, level: 0,
};

const rtcConfig = () => {
  const ice = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];
  try { if (localStorage.wtTurn) ice.push(JSON.parse(localStorage.wtTurn)); } catch {}
  return { iceServers: ice };
};

const signal = (to, data) =>
  push(ref(db, `rooms/${R.room}/sig/${to}`), { from: R.uid, data }).catch(() => {});

$("#micBtn").onclick = () => (VOICE.on ? stopVoice() : startVoice());

async function startVoice() {
  try {
    VOICE.stream = await navigator.mediaDevices.getUserMedia({
      // Echo cancellation matters more than usual here: without it each side
      // hears the film back through the other's microphone.
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    return say("No microphone available, or permission was declined.");
  }
  VOICE.on = true;
  VOICE.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
  VOICE.ctx.resume?.();
  VOICE.readLocal = meter(VOICE.stream);
  paintMic();
  pushPresence({ voice: true });
  syncPeers();
  say("Microphone on");
}

function stopVoice() {
  VOICE.on = false;
  VOICE.stream?.getTracks().forEach((t) => t.stop());
  VOICE.stream = null;
  VOICE.readLocal = null;
  [...VOICE.peers.keys()].forEach(dropPeer);
  pushPresence({ voice: false });
  if (!PL.isMuted()) PL.setVol(LOOK.vol);
  paintMic();
}

function paintMic() {
  const b = $("#micBtn");
  b.innerHTML = ic(VOICE.on ? "mic" : "micoff");
  b.classList.toggle("live", VOICE.on);
  b.title = VOICE.on ? "Turn the microphone off" : "Turn the microphone on";
}

function syncPeers() {
  const want = new Set(
    VOICE.on ? R.members.filter((m) => m.voice && m.uid !== R.uid).map((m) => m.uid) : []
  );
  for (const uid of [...VOICE.peers.keys()]) if (!want.has(uid)) dropPeer(uid);
  for (const uid of want) ensurePeer(uid, true);
}

function ensurePeer(uid, mayOffer) {
  let p = VOICE.peers.get(uid);
  if (p) return p;

  const pc = new RTCPeerConnection(rtcConfig());
  const el = document.createElement("audio");
  el.autoplay = true;
  $("#voices").appendChild(el);
  p = { pc, el, read: null, level: 0 };
  VOICE.peers.set(uid, p);

  if (VOICE.stream) for (const t of VOICE.stream.getTracks()) pc.addTrack(t, VOICE.stream);

  pc.onicecandidate = (e) => e.candidate && signal(uid, { ice: e.candidate.toJSON() });
  pc.ontrack = (e) => {
    p.el.srcObject = e.streams[0];
    p.el.play().catch(() => {});
    p.read = meter(e.streams[0]);
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") {
      say("Voice couldn't get through — see the TURN note in DEPLOY.md.");
      dropPeer(uid);
    }
  };

  // Both sides run this at once, so exactly one of them must make the offer.
  // Comparing uids gives a stable answer without another round trip.
  if (mayOffer && R.uid < uid) makeOffer(uid);
  return p;
}

async function makeOffer(uid) {
  const p = VOICE.peers.get(uid);
  if (!p) return;
  try {
    await p.pc.setLocalDescription(await p.pc.createOffer());
    signal(uid, { sdp: p.pc.localDescription.toJSON() });
  } catch {}
}

async function onSignal(from, d) {
  if (!VOICE.on || !d) return;
  const p = ensurePeer(from, false);
  try {
    if (d.sdp) {
      await p.pc.setRemoteDescription(d.sdp);
      if (d.sdp.type === "offer") {
        await p.pc.setLocalDescription(await p.pc.createAnswer());
        signal(from, { sdp: p.pc.localDescription.toJSON() });
      }
    } else if (d.ice) {
      await p.pc.addIceCandidate(d.ice);
    }
  } catch { /* candidates can land before the description; harmless */ }
}

function dropPeer(uid) {
  const p = VOICE.peers.get(uid);
  if (!p) return;
  try { p.pc.close(); } catch {}
  p.el.remove();
  VOICE.peers.delete(uid);
}

/* RMS off the raw waveform — cheap, and enough to tell talking from silence. */
function meter(stream) {
  try {
    VOICE.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    const an = VOICE.ctx.createAnalyser();
    an.fftSize = 512;
    an.smoothingTimeConstant = 0.55;
    VOICE.ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    return () => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const b of buf) { const x = (b - 128) / 128; sum += x * x; }
      return Math.sqrt(sum / buf.length);
    };
  } catch { return null; }
}

const TALK = 0.045;

setInterval(() => {
  if (!VOICE.on) return;
  let peak = 0;
  for (const p of VOICE.peers.values()) {
    p.level = p.read ? p.read() : 0;
    peak = Math.max(peak, p.level);
  }
  VOICE.level = VOICE.readLocal ? VOICE.readLocal() : 0;

  // Duck on the far side's voice only. Your own mic is already cancelled out,
  // and ducking on yourself would fight the echo canceller.
  if (VOICE.duck && peak > TALK) VOICE.duckUntil = Date.now() + 700;
  if (!PL.isMuted()) {
    PL.setVol(VOICE.duck && Date.now() < VOICE.duckUntil ? LOOK.vol * 0.28 : LOOK.vol);
  }

  for (const row of $$(".person")) {
    const uid = row.dataset.uid;
    const lvl = uid === R.uid ? VOICE.level : VOICE.peers.get(uid)?.level || 0;
    row.classList.toggle("talking", lvl > TALK);
    const dot = $(".lvl", row);
    if (dot) dot.style.transform = `scale(${1 + clamp(lvl * 22, 0, 4)})`;
  }
}, 120);

$("#duck").onclick = (e) => {
  VOICE.duck = e.currentTarget.getAttribute("aria-pressed") !== "true";
  e.currentTarget.setAttribute("aria-pressed", String(VOICE.duck));
  if (!VOICE.duck && !PL.isMuted()) PL.setVol(LOOK.vol);
};

paintMic();

/* ====================================================== optional library
 * Only live if CFG.API points at a deployed Cloudflare Worker. Without one
 * the app still does everything else — this is just for a private shelf of
 * your own files. */

let LIB = [];

const mediaUrl = (key) => {
  if (/^https?:\/\//i.test(key)) return key;      // shelf entries carry full URLs
  const path = String(key).split("/").map(encodeURIComponent).join("/");
  return CFG.MEDIA ? `${CFG.MEDIA.replace(/\/$/, "")}/${path}` : `${CFG.API}/media/${path}`;
};

async function loadLibrary() {
  const pane = $("#libList");
  try {
    LIB = (await (await fetch(CFG.API + "/library")).json()).titles || [];
  } catch {
    LIB = [];
    $("#libSect").hidden = true;
    return void say("Couldn't reach the bucket. Check CFG.API and its ALLOW_ORIGIN.");
  }
  pane.innerHTML = "";
  $("#libSect").hidden = !LIB.length;
  $("#listEmpty").hidden = !!(SHELF.length || LIB.length);
  if (!LIB.length) return;
  for (const t of LIB) {
    const card = document.createElement("button");
    card.className = "title-card";
    card.dataset.ref = t.sources[0].key;
    card.innerHTML =
      (t.poster ? `<img class="thumb" src="${mediaUrl(t.poster)}" alt="" loading="lazy">`
                : `<span class="thumb"></span>`) +
      `<span class="meta"><span class="nm">${esc(t.title)}</span>` +
      `<span class="sub">${t.sources.map((s) => s.label).join(" · ")}` +
      (t.subtitles.length ? ` · ${t.subtitles.length} CC` : "") +
      ` · ${fmtSize(t.bytes)}</span>${progBarFor({ kind: "r2", ref: t.sources[0].key })}</span>`;
    card.onclick = () => setSource({
      kind: "r2", ref: t.sources[0].key, title: t.title,
      label: t.sources[0].label, subs: t.subtitles, size: t.sources[0].size,
    });
    pane.appendChild(card);
  }
  markLib();
}

function progBarFor(s) {
  const p = R.progress[titleId(s)];
  if (!p || p.done || !p.dur || p.pos < 30) return "";
  return `<span class="prog" title="${fmtTime(p.pos)} in"><i style="width:${
    clamp((p.pos / p.dur) * 100, 2, 100)}%"></i></span>`;
}

function markLib() {
  const cur = R.state?.ref || "";
  // Shelf cards carry a full URL; bucket cards carry a key, and any quality of
  // the same title should light up.
  const slug = R.state?.kind === "r2" ? String(cur).split("/")[1] : null;
  $$(".title-card").forEach((c) => {
    const r = c.dataset.ref || "";
    c.classList.toggle("on", r === cur || (!!slug && r.includes(`/${slug}/`)));
  });
}

function drawQuals() {
  const box = $("#quals");
  box.innerHTML = "";
  const s = R.state;

  if (s?.kind === "hls") {
    const levels = R.hls?.levels;
    if (!R.hls || !levels || levels.length < 2) {
      box.innerHTML = `<span style="font-size:12px;color:var(--dimmer)">${
        R.hls ? "One quality in this stream." : "Loading stream…"}</span>`;
      return;
    }
    const cur = R.hls.currentLevel; // -1 = auto
    const mk = (label, level, on) => {
      const b = document.createElement("button");
      b.className = "chip" + (on ? " on" : "");
      b.textContent = label;
      b.onclick = () => { R.hls.currentLevel = level; drawQuals(); };
      return b;
    };
    box.appendChild(mk("Auto", -1, cur === -1));
    levels.forEach((lv, i) => {
      box.appendChild(mk(lv.height ? `${lv.height}p` : `${Math.round(lv.bitrate / 1000)}kbps`, i, cur === i));
    });
    return;
  }

  if (!s || s.kind !== "r2") {
    box.innerHTML = `<span style="font-size:12px;color:var(--dimmer)">${
      s?.kind === "yt" ? "YouTube picks its own quality per viewer."
      : "One version of this source."}</span>`;
    return;
  }
  const t = LIB.find((x) => x.sources.some((q) => q.key === s.ref));
  if (!t || t.sources.length < 2) {
    box.innerHTML = `<span style="font-size:12px;color:var(--dimmer)">Only one version of this title.</span>`;
    return;
  }
  for (const q of t.sources) {
    const b = document.createElement("button");
    b.className = "chip" + (q.key === s.ref ? " on" : "");
    b.textContent = q.label;
    b.onclick = () => {
      const at = PL.time();
      setSource({ kind: "r2", ref: q.key, title: t.title, label: q.label, subs: t.subtitles, size: q.size });
      setTimeout(() => seekTo(at), 500);   // hold your place across the switch
    };
    box.appendChild(b);
  }
}

/* ---------------------------------------------------------------- uploads
 * Chunked, because Cloudflare caps a request body at 100 MB and films are not
 * that. Only reachable when a Worker is configured. */

const UP = { token: localStorage.wtUpToken || "", size: 24 * 1024 * 1024, busy: 0 };
const authHeaders = () => ({ "x-upload-token": UP.token });
const SUB_RE = /\.(srt|vtt|ass|ssa)$/i;
const slugify = (s) => s.toLowerCase().replace(/\.[^.]+$/, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

$("#addBtn").onclick = () => $("#upPick").click();
$("#upPick").onchange = (e) => { takeFiles([...e.target.files]); e.target.value = ""; };

const dropBox = $("#drop"), srcPane = $("#srcPane");
let dragDepth = 0;
srcPane.addEventListener("dragenter", (e) => { e.preventDefault(); dragDepth++; dropBox.classList.add("on"); });
srcPane.addEventListener("dragover", (e) => e.preventDefault());
srcPane.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; dropBox.classList.remove("on"); } });
srcPane.addEventListener("drop", (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropBox.classList.remove("on");
  takeFiles([...e.dataTransfer.files]);
});

async function takeFiles(files) {
  if (!files.length) return;

  // A dropped subtitle is used directly, whatever the source is — including
  // over a YouTube video, which can't otherwise be restyled.
  if (files.every((f) => SUB_RE.test(f.name))) {
    const cues = parseSubs(await files[0].text());
    if (!cues.length) return say("Couldn't read any cues out of that file.");
    R.localSub = { label: files[0].name.replace(/\.[^.]+$/, "").slice(0, 24), cues };
    pickTrack("local");
    return say(`Loaded ${cues.length} subtitle cues`);
  }

  // A dropped video with no library configured plays locally rather than failing.
  const video = files.find((f) => !SUB_RE.test(f.name) && !f.type.startsWith("image/"));
  if (!CFG.API) {
    if (!video) return say("Add a Worker in config.js to upload posters and subtitle files.");
    adoptLocal(video);
    return setSource({
      kind: "local", ref: video.name, size: video.size, label: "Local",
      title: video.name.replace(/\.[^.]+$/, ""), subs: [],
    });
  }

  if (!UP.token) {
    const t = await ask({
      title: "Upload key",
      body: "Uploads are gated by the UPLOAD_TOKEN secret on your Worker. Paste it once and it stays in this browser.",
      ok: "Save",
    });
    if (!t) return;
    UP.token = localStorage.wtUpToken = t;
  }

  const current = R.state?.kind === "r2" ? String(R.state.ref).split("/")[1] : "";
  const name = await ask({
    title: video ? "Name this title" : "Add to which title?",
    body: "This becomes the folder in your bucket and the name in the library.",
    value: video ? video.name.replace(/\.[^.]+$/, "")
                 : current.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    ok: "Upload",
  });
  if (!name) return;
  const slug = slugify(name);
  if (!slug) return say("That name doesn't work as a folder name.");

  for (const f of files) uploadOne(f, keyFor(f, slug));
}

function keyFor(f, slug) {
  const ext = (f.name.split(".").pop() || "bin").toLowerCase();
  if (SUB_RE.test(f.name)) {
    const m = f.name.match(/[.\-_]([a-z]{2})[.\-_]/i);
    return `library/${slug}/subs.${(m ? m[1] : "en").toLowerCase()}.${ext}`;
  }
  if (f.type.startsWith("image/")) return `library/${slug}/poster.${ext}`;
  const q = f.name.match(/(\d{3,4})p/);
  return `library/${slug}/video-${q ? q[1] + "p" : "Original"}.${ext}`;
}

function uploadRow(name) {
  const el = document.createElement("div");
  el.className = "up";
  el.innerHTML = `<span class="nm"><span>${esc(name)}</span><span class="s">0%</span></span>
                  <span class="bar2"><i></i></span>`;
  $("#uploads").appendChild(el);
  return {
    pct: (f) => {
      $("i", el).style.width = (f * 100).toFixed(0) + "%";
      $(".s", el).textContent = (f * 100).toFixed(0) + "%";
    },
    done: () => { $(".s", el).textContent = "done"; setTimeout(() => el.remove(), 2200); },
    fail: (m) => { el.classList.add("bad"); $(".s", el).textContent = String(m).slice(0, 28); },
  };
}

async function uploadOne(file, key) {
  const row = uploadRow(file.name);
  UP.busy++;
  try {
    if (file.size <= UP.size) {
      const r = await fetch(`${CFG.API}/upload/direct?key=${encodeURIComponent(key)}`, {
        method: "PUT",
        headers: { ...authHeaders(), "content-type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      row.pct(1);
    } else {
      const { uploadId, partSize } = await upJSON("POST", "/upload/start", { key, contentType: file.type });
      UP.size = partSize || UP.size;
      const total = Math.ceil(file.size / UP.size);
      const parts = new Array(total);
      let next = 0, finished = 0;

      const pump = async () => {
        for (let i = next++; i < total; i = next++) {
          parts[i] = await putPart(key, uploadId, i + 1, file.slice(i * UP.size, (i + 1) * UP.size));
          row.pct(++finished / total);
        }
      };
      try { await Promise.all([pump(), pump(), pump()]); }
      catch (e) {
        upJSON("POST", "/upload/abort", { key, uploadId }).catch(() => {});
        throw e;
      }
      await upJSON("POST", "/upload/finish", { key, uploadId, parts });
    }
    row.done();
  } catch (e) {
    row.fail(e.message || e);
    say(`${file.name} failed: ${e.message || e}`);
  } finally {
    if (--UP.busy === 0) setTimeout(loadLibrary, 400);
  }
}

/* A dropped connection mid-film shouldn't cost you the whole upload. */
async function putPart(key, uploadId, n, blob, attempt = 1) {
  const url = `${CFG.API}/upload/part?key=${encodeURIComponent(key)}` +
              `&uploadId=${encodeURIComponent(uploadId)}&part=${n}`;
  try {
    const r = await fetch(url, { method: "PUT", headers: authHeaders(), body: blob });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    if (attempt >= 3) throw e;
    await new Promise((ok) => setTimeout(ok, 800 * attempt));
    return putPart(key, uploadId, n, blob, attempt + 1);
  }
}

async function upJSON(method, path, body) {
  const r = await fetch(CFG.API + path, {
    method,
    headers: { ...authHeaders(), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

addEventListener("beforeunload", () => {
  if (VOICE.on) stopVoice();
  if (LOCAL.url) URL.revokeObjectURL(LOCAL.url);
  if (R.refs.me) remove(R.refs.me);
});
