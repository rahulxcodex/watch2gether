/* ===========================================================================
Parallel — watch together

page        static, on Vercel or GitHub Pages
sync        Firebase Realtime Database
sources     YouTube, any direct video URL, an HLS stream, or a file on disk

There is no server of ours anywhere in this. The room is a few dozen bytes
of JSON that both browsers subscribe to.

BUG-FIXED BUILD — changes vs. the previous version:
  1. importOpenSubtitles(): isMovie was referenced but never declared,
     killing every import of a title not already in the library.
  2. join(): the screen now flips over BEFORE any localStorage access,
     every storage write is guarded, and the Join button is re-enabled on
     success so the gate works again later in the session.
  3. Voice chat: mic-off users can now actually HEAR (onSignal no longer
     drops their signals), offer arbitration works for mixed mic on/off
     pairs, tracks are attached when the mic is turned on late, and
     stopVoice() rebuilds receive-only peers instead of staying deaf.
  4. fetchTmdbSeason(): the fallback referenced an undefined season
     variable instead of the seasonNumber parameter.
  5. normalizeLibraryMediaTypes() is now actually run on startup.
  6. Landing nav works even when the landing isn't visible.
======================================================================== */
const APP_BUILD = "20260814-6";

import { firebaseConfig, CFG } from "./config.js";

const SDK = firebaseConfig.sdkVersion || "11.0.2";
const cdn = (m) => https://www.gstatic.com/firebasejs/${SDK}/firebase-${m}.js;

const [fbApp, fbAuth, fbDb] = await Promise.all([
  import(cdn("app")), import(cdn("auth")), import(cdn("database")),
]).catch((e) => {
  document.body.innerHTML =
    
     Firebase SDK wouldn't load.
     Tried version ${SDK}. Set sdkVersion in config.js to a
     current release if that one has been withdrawn.
     ${e};
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

/* Keep one anonymous-auth request alive and reuse it. signInAnonymously()
returns the authenticated user directly, so don't wait for currentUser. */
let anonymousAuthInFlight = null;
async function ensureAnonymousAuth(timeoutMs = 12000) {
  if (auth.currentUser) return auth.currentUser;
  if (anonymousAuthInFlight) return anonymousAuthInFlight;
  anonymousAuthInFlight = (async () => {
    const credential = await Promise.race([
      signInAnonymously(auth),
      new Promise((_, reject) => setTimeout(() => {
        const e = new Error("Firebase Authentication did not respond in time.");
        e.code = "auth-timeout";
        reject(e);
      }, timeoutMs)),
    ]);
    const user = credential?.user || auth.currentUser;
    if (!user) {
      const e = new Error("Firebase Authentication did not create a user.");
      e.code = "auth-no-user";
      throw e;
    }
    return user;
  })().finally(() => { anonymousAuthInFlight = null; });
  return anonymousAuthInFlight;
}

if (CFG.analytics) {
  import(cdn("analytics"))
    .then((m) => m.getAnalytics(app))
    .catch(() => {});   // blocked by extensions more often than not
}

/ ------------------------------------------------------------- shorthands /
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "": "&gt;", '"': "&quot;" }[c]));
const fmtRate = (r) => (r === 1 ? "1×" : ${r}×);
const fmtSize = (b) => (b > 1e9 ? (b / 1e9).toFixed(1) + " GB" : Math.round(b / 1e6) + " MB");
const fmtDrift = (d) => (Math.abs(d)  0 ? "−" : "+"}${Math.abs(d).toFixed(2)}s);

function fmtTime(t) {
  if (!isFinite(t)) return "0:00";
  t = Math.max(0, Math.floor(t));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? ${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}
           : ${m}:${String(s).padStart(2, "0")};
}

let toastT;
function say(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("on"), 3200);
}

/ ------------------------------------------------------------------ state /
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

/ ------------------------------------------------------------------ icons /
const ICON = {
  play:   '',
  pause:  '',
  back:   '',
  fwd:    '',
  vol:    '',
  mute:   '',
  cc:     '',
  cog:    '',
  fs:     '',
  exit:   '',
  rail:   '',
  mic:    '',
  micoff: '',
};
const ic = (n) => ${ICON[n]};

/* ========================================================= landing library
Personal library and saved rooms live in this browser. Firebase still owns
shared room state/progress; this index just lets you find things again.
======================================================================== */
const LIBRARY_KEY = "wtLibraryV1";

function mediaTypeOf(series, item = null) {
  if (item?.mediaType === "movie" || series?.mediaType === "movie") return "movie";
  if (item?.mediaType === "series" || series?.mediaType === "series") return "series";
  if (item?.episodeCode === "Movie") return "movie";
  // Legacy movie entries explicitly used episodeCode=Movie. That is safe
  // evidence of a movie; missing S/E numbers alone are NOT.
  if (!item && Array.isArray(series?.episodes) &&
      series.episodes.some(e => e?.mediaType === "movie" || e?.episodeCode === "Movie")) return "movie";
  return "series";
}
function isMovieItem(series, item) {
  return mediaTypeOf(series, item) === "movie";
}

function normalizeLibraryMediaTypes() {
  let changed = false;
  for (const series of MY_LIBRARY) {
    const legacyMovieName = /\s[—-]\sMovie\s$/i.test(String(series.name || ""));
    const inferredMovie = series.mediaType === "movie" || legacyMovieName ||
      (Array.isArray(series.episodes) && series.episodes.length &&
       series.episodes.every((e) => e.mediaType === "movie" || e.episodeCode === "Movie"));
    const nextSeriesType = inferredMovie ? "movie" : "series";
    if (series.mediaType !== nextSeriesType) {
      series.mediaType = nextSeriesType;
      changed = true;
    }
    if (!Array.isArray(series.episodes)) {
      series.episodes = [];
      changed = true;
    }
    for (const item of series.episodes) {
      const nextItemType = item.mediaType === "movie" || nextSeriesType === "movie" ||
        item.episodeCode === "Movie" ? "movie" : "episode";
      if (item.mediaType !== nextItemType) {
        item.mediaType = nextItemType;
        changed = true;
      }
      if (nextItemType === "movie") {
        if (item.seasonNumber != null || item.episodeNumber != null) {
          item.seasonNumber = null;
          item.episodeNumber = null;
          changed = true;
        }
        if (item.episodeCode !== "Movie") {
          item.episodeCode = "Movie";
          changed = true;
        }
      }
    }
  }
  if (changed) writeLibrary();
}

const ROOMS_KEY = "wtRoomsV1";
const readStore = (key, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v ?? fallback;
  } catch {
    return fallback;
  }
};

let MYLIBRARY = readStore(LIBRARYKEY, []);
let SAVEDROOMS = readStore(ROOMSKEY, []);

/* BUG 5 FIX: run the legacy-library migration once at startup. It was
defined but never called, so old entries were never normalised. */
normalizeLibraryMediaTypes();

/* BUG 3 FIX: every localStorage write is guarded. On iOS Safari private
mode / some in-app webviews setItem throws; that must never break the app. */
function writeLibrary() {
  try { localStorage.setItem(LIBRARYKEY, JSON.stringify(MYLIBRARY)); } catch {}
  renderLanding();
}
function writeRooms() {
  try { localStorage.setItem(ROOMSKEY, JSON.stringify(SAVEDROOMS)); } catch {}
  renderLanding();
}

function rememberRoom(code, patch = {}) {
  if (!code) return;
  const now = Date.now();
  const i = SAVED_ROOMS.findIndex((r) => r.code === code);
  const base = i >= 0 ? SAVED_ROOMS[i] : {
    code,
    name: (() => { try { return localStorage.wtName || "Guest"; } catch { return "Guest"; } })(),
    createdAt: now,
  };
  const next = { ...base, ...patch, code, lastUsed: now };
  if (i >= 0) SAVED_ROOMS[i] = next;
  else SAVED_ROOMS.unshift(next);
  SAVEDROOMS = SAVEDROOMS
    .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
    .slice(0, 30);
  /* Persisting saved rooms is nice-to-have, not a prerequisite for
  entering the room. Never let storage failures throw out of join(). */
  try { localStorage.setItem(ROOMSKEY, JSON.stringify(SAVEDROOMS)); } catch {}
}

function removeSavedRoom(code) {
  SAVEDROOMS = SAVEDROOMS.filter((r) => r.code !== code);
  writeRooms();
}

function makeId(prefix = "id") {
  return ${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)};
}
function findSeries(name) {
  return MY_LIBRARY.find((s) => s.name.toLowerCase() === name.toLowerCase());
}

function showLanding() {
  document.body.classList.add("landing-page");
  $("#landing").classList.add("on");
  $("#gate").style.display = "none";
  $("#app").classList.remove("on");
  renderLanding();
}
function showGate(code = "") {
  document.body.classList.remove("landing-page");
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
  // Older entries may predate URL persistence — offer a one-time repair.
  if (!episodeUrl) {
    const repaired = await ask({
      title: "Episode link missing",
      body: This saved episode was created by an older library version that did not store its stream URL. Paste the episode .m3u8/direct-video link to repair it.,
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
    title: ${series.name} — ${ep.title || parsed.title || "Episode"},
    label: "Library",
    episodeId: ep.id,
    subs: ep.subtitleText
      ? [{ key: "local", label: ep.subtitleLanguage || "English" }]
      : (ep.subtitleUrl ? [{ key: ep.subtitleUrl, label: ep.subtitleLanguage || "English" }] : []),
    subtitleText: ep.subtitleText || "",
    subtitleName: ep.subtitleFileName || "",
    size: 0,
  };
  // Already in a room — swap the video inside it instead of a new room.
  if (R.room) {
    rememberRoom(R.room, { episodeId: ep.id });
    setSource(source);
    $("#landing").classList.remove("on");
    $("#app").classList.add("on");
    say(Switched to ${series.name} — ${ep.title || "episode"});
    return;
  }
  const existing = SAVED_ROOMS.find((r) => r.episodeId === ep.id);
  const code = existing?.code || roll();
  R.pendingSource = source;
  $("#code").value = code;
  showGate(code);
  if ($("#who").value) join();
}

async function changeLibraryEpisodeVideo(series, ep) {
  const updated = await ask({
    title: "Change video link",
    body: Paste a new .m3u8/direct-video link for "${ep.title || "this episode"}". This replaces the current link.,
    value: String(ep.url || ""),
    ok: "Save",
  });
  if (updated == null) return;
  if (!/^https?:\/\//i.test(updated)) return say("Please enter a valid http(s) episode link.");
  if (!parseSource(updated)) return say("That doesn't look like a playable video or HLS URL.");
  ep.url = updated;
  writeLibrary();
  say(${series.name} — ${ep.title || "episode"} · video link updated);
}

async function addLibraryEpisode(form) {
  const fd = new FormData(form);
  const seriesName = String(fd.get("series") || "").trim();
  const episodeOverride = String(fd.get("episode") || "").trim();
  const url = String(fd.get("url") || "").trim();
  const imdbId = String(fd.get("imdbId") || "").trim().toLowerCase();
  const isMovie = String(fd.get("mediaType") || "series") === "movie";
  const seasonRaw = String(fd.get("seasonNumber") || "").trim();
  const episodeRaw = String(fd.get("episodeNumber") || "").trim();
  const season = /^\d+$/.test(seasonRaw) ? Number(seasonRaw) : null;
  const epNo = /^\d+$/.test(episodeRaw) ? Number(episodeRaw) : null;
  const subtitleUrl = String(fd.get("subtitleUrl") || "").trim();
  const subtitleFile = fd.get("subtitleFile");

  if (!seriesName) return say(isMovie ? "Enter a movie name." : "Enter a series name.");
  if (!/^tt\d{7,10}$/i.test(imdbId)) return say("Enter a valid IMDb ID such as tt1234567.");
  if (!isMovie && (season == null || season  1500000) return say("Subtitle file is larger than 1.5 MB.");

  const generatedCode = isMovie ? "Movie" : S${String(season).padStart(2, "0")}E${String(epNo).padStart(2, "0")};
  const itemMediaType = isMovie ? "movie" : "episode";
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
    } else {
      // Nothing pasted/uploaded — go straight to OpenSubtitles for the exact
      // episode, then fall back to asking for a manual file.
      if (submit) submit.textContent = "Finding subtitles…";
      const auto = isMovie
        ? await autoImportMovieSubtitle(imdbId)
        : await autoImportEpisodeSubtitle(imdbId, season, epNo);
      if (auto.ok) {
        subtitleText = auto.text;
        subtitleFileName = auto.fileName;
        subtitleSource = "OpenSubtitles (auto)";
      } else {
        const wantsManual = await ask({
          title: "No subtitles found",
          body: Automatic OpenSubtitles lookup for ${generatedCode} didn't work: ${auto.error} Manually choose a subtitle file instead?,
          input: false,
          ok: "Choose file",
        });
        if (wantsManual) {
          if (submit) submit.textContent = "Waiting for file…";
          const file = await pickSubtitleFile();
          if (file) {
            if (file.size > 1500000) {
              say("Subtitle file is larger than 1.5 MB — skipped.");
            } else {
              const manualText = await file.text();
              if (!parseSubs(manualText).length) {
                say("That subtitle file doesn't contain readable SRT/VTT/ASS/SSA cues — skipped.");
              } else {
                subtitleText = manualText;
                subtitleFileName = file.name;
                subtitleSource = "Uploaded subtitle file";
              }
            }
          }
        }
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
      if (!r.ok) throw new Error(body.error || Metadata service returned ${r.status});
      meta = body;
    } catch (e) {
      meta = {
        series: seriesName, mediaType: isMovie ? "movie" : "series", seasonNumber: season, episodeNumber: epNo, episodeCode: generatedCode,
        episodeTitle: "", confidence: "low", seriesYear: null, seriesImdbId: null,
        seriesImdbUrl: null, seriesImdbRating: null, seriesGenres: [], seriesSummary: "",
        episodeImdbId: null, episodeImdbUrl: null, episodeImdbRating: null,
        episodeSummary: "", metadataNotes: String(e.message || e),
      };
      say("Metadata lookup failed — saving with your supplied details. The app will try Gemini → Grok → OpenRouter automatically when configured.");
    }

    const resolvedSeries = String(meta.series || seriesName).trim() || seriesName;
    const desiredType = isMovie ? "movie" : "series";
    // Season/episode numbers typed by the user always win over LLM metadata.
    const title = episodeOverride ||
      (isMovie
        ? (String(meta.title || meta.seriesTitle || resolvedSeries).trim() || resolvedSeries)
        : ([generatedCode, String(meta.episodeTitle || "").trim()].filter(Boolean).join(" · ") ||
           Episode ${((findSeries(resolvedSeries)?.episodes.length || 0) + 1)}));

    let series = MY_LIBRARY.find((x) => x.imdbId && x.imdbId.toLowerCase() === imdbId) || findSeries(resolvedSeries);
    if (series) {
      const existingType = mediaTypeOf(series) === "movie" ? "movie" : "series";
      if (series.episodes.length && existingType !== desiredType) {
        return say("${series.name}" is already saved as a ${existingType}. Create a separate ${desiredType} entry instead.);
      }
      Object.assign(series, {
        year: Number.isInteger(meta.seriesYear) ? meta.seriesYear : (series.year ?? null),
        mediaType: desiredType,
        imdbId: series.imdbId || imdbId,
        imdbUrl: meta.seriesImdbUrl || series.imdbUrl || https://www.imdb.com/title/${imdbId}/,
        imdbRating: typeof meta.seriesImdbRating === "number" ? meta.seriesImdbRating : (series.imdbRating ?? null),
        genres: Array.isArray(meta.seriesGenres) && meta.seriesGenres.length ? meta.seriesGenres.slice(0, 10) : (series.genres || []),
        summary: String(meta.seriesSummary || series.summary || "").slice(0, 1200),
      });
    } else {
      series = {
        id: makeId("series"), name: resolvedSeries.slice(0, 120), mediaType: desiredType, episodes: [],
        year: Number.isInteger(meta.seriesYear) ? meta.seriesYear : null,
        imdbId, imdbUrl: meta.seriesImdbUrl || https://www.imdb.com/title/${imdbId}/,
        imdbRating: typeof meta.seriesImdbRating === "number" ? meta.seriesImdbRating : null,
        genres: Array.isArray(meta.seriesGenres) ? meta.seriesGenres.slice(0, 10) : [],
        summary: String(meta.seriesSummary || "").slice(0, 1200), addedAt: Date.now(),
      };
      MY_LIBRARY.unshift(series);
    }

    // Same movie or same SxxExx updates instead of duplicating.
    const duplicate = isMovie
      ? series.episodes.find((e) => mediaTypeOf(series, e) === "movie")
      : series.episodes.find((e) => e.seasonNumber === season && e.episodeNumber === epNo);

    const episodePatch = {
      url,
      mediaType: itemMediaType,
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
      say(${series.name} — updated existing ${isMovie ? "movie" : "episode"});
      return;
    }

    const ep = { id: makeId("ep"), ...episodePatch, addedAt: Date.now() };
    series.episodes.push(ep);
    series.episodes.sort((a, b) => {
      const am = mediaTypeOf(series, a) === "movie";
      const bm = mediaTypeOf(series, b) === "movie";
      if (am !== bm) return am ? -1 : 1;
      const sa = Number.isInteger(a.seasonNumber) ? a.seasonNumber : 9999;
      const sb = Number.isInteger(b.seasonNumber) ? b.seasonNumber : 9999;
      const ea = Number.isInteger(a.episodeNumber) ? a.episodeNumber : 9999;
      const eb = Number.isInteger(b.episodeNumber) ? b.episodeNumber : 9999;
      return sa - sb || ea - eb || (a.addedAt || 0) - (b.addedAt || 0);
    });
    writeLibrary();
    form.reset();
    syncMovieFields();
    $("#libraryFormWrap").hidden = true;
    $("#libraryFormOverlay").hidden = true;
    const subMsg = subtitleSource === "OpenSubtitles (auto)"
      ? "English subtitles auto-downloaded from OpenSubtitles"
      : subtitleText ? "English subtitles saved" : "";
    say(subMsg ? ${series.name} — ${ep.title} · ${subMsg} : ${series.name} — ${ep.title} · ${isMovie ? "movie added" : "episode added"});
  } finally {
    if (submit) { submit.disabled = false; submit.textContent = oldText || "Analyze & add"; }
  }
}

/ Auto subtitle fetch for one episode via /api/opensubs. /
async function autoImportEpisodeSubtitle(imdbId, season, episodeNumber) {
  try {
    const r = await fetch("/api/opensubs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: https://www.opensubtitles.org/en/search/imdbid-${imdbId.replace(/^tt/i, "")},
        imdbId,
        seasonNumber: season,
        episodeNumbers: String(episodeNumber),
      }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: body.error || OpenSubtitles API returned HTTP ${r.status}. };
    const file = Array.isArray(body.files)
      ? (body.files.find((f) => f.season === season && f.episode === episodeNumber) || body.files[0])
      : null;
    if (!file || !String(file.text || "").trim()) {
      return { ok: false, error: body.error || "No English subtitle was found for this episode." };
    }
    return {
      ok: true,
      text: String(file.text),
      fileName: String(file.fileName || S${String(season).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}.srt).slice(-180),
    };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/ Same for movies — they hit /api/opensubs with movie: true. /
async function autoImportMovieSubtitle(imdbId) {
  try {
    const r = await fetch("/api/opensubs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: https://www.opensubtitles.org/en/search/imdbid-${imdbId.replace(/^tt/i, "")},
        imdbId,
        movie: true,
      }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: body.error || OpenSubtitles API returned HTTP ${r.status}. };
    const file = Array.isArray(body.files) ? body.files[0] : null;
    if (!file || !String(file.text || "").trim()) {
      return { ok: false, error: body.error || "No English subtitle was found for this movie." };
    }
    return {
      ok: true,
      text: String(file.text),
      fileName: String(file.fileName || "movie.srt").slice(-180),
    };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/ Native file picker on demand; null on cancel. /
function pickSubtitleFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".srt,.vtt,.ass,.ssa,text/vtt,application/x-subrip";
    input.style.display = "none";
    let settled = false;
    const finish = (file) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("focus", onFocus, true);
      input.remove();
      resolve(file || null);
    };
    const onFocus = () => setTimeout(() => finish(input.files?.[0] || null), 300);
    input.onchange = () => finish(input.files?.[0] || null);
    window.addEventListener("focus", onFocus, true);
    document.body.appendChild(input);
    input.click();
  });
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

    /* BUG 1 FIX: isMovie was referenced below but never declared in this
    function, throwing ReferenceError and killing every new-series import.
    Derive it from the metadata response; default to series. */
    const isMovie = meta?.mediaType === "movie";

    const resolvedSeries = String(meta?.series || "IMDb " + imdbId).trim();
    let series = MY_LIBRARY.find((x) => x.imdbId && x.imdbId.toLowerCase() === imdbId) || findSeries(resolvedSeries);
    if (!series) {
      series = {
        id: makeId("series"), name: resolvedSeries.slice(0, 120), mediaType: isMovie ? "movie" : "series", episodes: [],
        year: Number.isInteger(meta?.seriesYear) ? meta.seriesYear : null,
        imdbId, imdbUrl: meta?.seriesImdbUrl || https://www.imdb.com/title/${imdbId}/,
        imdbRating: typeof meta?.seriesImdbRating === "number" ? meta.seriesImdbRating : null,
        genres: Array.isArray(meta?.seriesGenres) ? meta.seriesGenres.slice(0, 10) : [],
        summary: String(meta?.seriesSummary || "").slice(0, 1200), addedAt: Date.now(),
      };
      MY_LIBRARY.unshift(series);
    } else {
      Object.assign(series, {
        imdbId: series.imdbId || imdbId,
        imdbUrl: meta?.seriesImdbUrl || series.imdbUrl || https://www.imdb.com/title/${imdbId}/,
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
        ? S${String(season).padStart(2, "0")}E${String(epNo).padStart(2, "0")} : "")).trim();
      const existing = season != null && epNo != null
        ? series.episodes.find((e) => e.seasonNumber === season && e.episodeNumber === epNo)
        : series.episodes.find((e) => e.subtitleSource === "OpenSubtitles" && e.seasonNumber == null && e.episodeNumber == null);
      const title = existing?.title || (code ? ${code} · ${file.fileName.replace(/\.[^.]+$/, "")} : file.fileName.replace(/\.[^.]+$/, "Movie"));
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
        metadataNotes: Imported from OpenSubtitles subtitle ${file.id}.,
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
    $("#subtitleImportOverlay").hidden = true;
    say(${series.name}: imported ${body.files.length} subtitle${body.files.length === 1 ? "" : "s"} · ${updated} updated, ${created} created${body.failed ?  · ${body.failed} downloads failed : ""});
  } finally {
    if (submit) { submit.disabled = false; submit.textContent = oldText || "Import subtitles"; }
  }
}

function deleteLibraryEpisode(seriesId, epId) {
  const series = MY_LIBRARY.find((s) => s.id === seriesId);
  if (!series) return;
  series.episodes = series.episodes.filter((e) => e.id !== epId);
  if (!series.episodes.length) MYLIBRARY = MYLIBRARY.filter((s) => s.id !== seriesId);
  writeLibrary();
}
function deleteLibrarySeries(seriesId) {
  MYLIBRARY = MYLIBRARY.filter((s) => s.id !== seriesId);
  writeLibrary();
}

/ Edit an episode without re-adding the video or rerunning metadata. /
function openEpisodeEdit(series, ep) {
  const movie = mediaTypeOf(series, ep) === "movie";
  const overlay = $("#episodeEditOverlay");
  const form = $("#episodeEditForm");
  if (!overlay || !form) return;
  form.dataset.seriesId = series.id;
  form.dataset.episodeId = ep.id;
  $("#episodeEditTitle").textContent = movie ? "Edit movie" : "Edit episode";
  $("#editEpisodeName").textContent = ${series.name} — ${ep.title || (movie ? "Movie" : "Episode")};
  $("#editSeasonField").hidden = movie;
  $("#editEpisodeField").hidden = movie;
  $("#editSeason").value = movie ? "" : (Number.isInteger(ep.seasonNumber) ? ep.seasonNumber : "");
  $("#editEpisode").value = movie ? "" : (Number.isInteger(ep.episodeNumber) ? ep.episodeNumber : "");
  $("#editEpisodeTitle").value = ep.title || "";
  $("#editDownloadSubs").checked = false;
  $("#editSubtitleStatus").textContent = ep.subtitleText
    ? Current subtitles: ${ep.subtitleFileName || "English subtitle"}. They will be kept unless you enable re-download.
    : "No subtitle is currently saved. Enable re-download to search OpenSubtitles after saving the new number.";
  overlay.hidden = false;
  $("#editSeason")?.focus();
}

async function saveEpisodeEdit(form) {
  const series = MY_LIBRARY.find((s) => s.id === form.dataset.seriesId);
  const ep = series?.episodes?.find((e) => e.id === form.dataset.episodeId);
  if (!series || !ep) return say("That library episode no longer exists.");
  const movie = mediaTypeOf(series, ep) === "movie";
  const seasonRaw = String($("#editSeason")?.value || "").trim();
  const episodeRaw = String($("#editEpisode")?.value || "").trim();
  const season = /^\d+$/.test(seasonRaw) ? Number(seasonRaw) : null;
  const epNo = /^\d+$/.test(episodeRaw) ? Number(episodeRaw) : null;
  const title = String($("#editEpisodeTitle")?.value || "").trim();
  const downloadAgain = !!$("#editDownloadSubs")?.checked;
  const submit = form.querySelector('button[type="submit"]');
  const oldText = submit?.textContent;

  if (!movie && (season == null || season  other.id !== ep.id &&
        other.seasonNumber === season && other.episodeNumber === epNo);
      if (collision) return say(${newCode} is already assigned to another saved episode.);
    }
    ep.title = title || (movie ? series.name : newCode);
    ep.mediaType = movie ? "movie" : "episode";
    ep.seasonNumber = movie ? null : season;
    ep.episodeNumber = movie ? null : epNo;
    ep.episodeCode = newCode;
    ep.updatedAt = Date.now();

    if (downloadAgain && !movie) {
      const result = await autoImportEpisodeSubtitle(series.imdbId || ep.seriesImdbId, season, epNo);
      if (result.ok) {
        ep.subtitleText = result.text;
        ep.subtitleFileName = result.fileName;
        ep.subtitleLanguage = "English";
        ep.subtitleSource = "OpenSubtitles (auto)";
        ep.subtitleUrl = "";
      } else {
        const choice = await ask({
          title: "No subtitles found",
          body: OpenSubtitles could not find an English subtitle for ${newCode}. Keep the existing subtitle, or cancel and try again with a different number?,
          value: "",
          ok: "Keep existing",
        });
        if (choice == null) {
          Object.assign(ep, snapshot);
          return;
        }
      }
    } else if (downloadAgain && movie) {
      const result = await autoImportMovieSubtitle(series.imdbId || ep.seriesImdbId);
      if (result.ok) {
        ep.subtitleText = result.text;
        ep.subtitleFileName = result.fileName;
        ep.subtitleLanguage = "English";
        ep.subtitleSource = "OpenSubtitles (auto)";
        ep.subtitleUrl = "";
      } else {
        say(Movie number/title saved, but subtitle re-download failed: ${result.error});
      }
    }

    if (!movie) {
      series.episodes.sort((a, b) => {
        const am = mediaTypeOf(series, a) === "movie";
        const bm = mediaTypeOf(series, b) === "movie";
        if (am !== bm) return am ? -1 : 1;
        const sa = Number.isInteger(a.seasonNumber) ? a.seasonNumber : 9999;
        const sb = Number.isInteger(b.seasonNumber) ? b.seasonNumber : 9999;
        const ea = Number.isInteger(a.episodeNumber) ? a.episodeNumber : 9999;
        const eb = Number.isInteger(b.episodeNumber) ? b.episodeNumber : 9999;
        return sa - sb || ea - eb || (a.addedAt || 0) - (b.addedAt || 0);
      });
    }

    $("#episodeEditOverlay").hidden = true;
    const detailWasOpen = !$("#libraryDetail").hidden;
    writeLibrary();
    if (detailWasOpen) await openLibraryDetail(series);
    const subMsg = downloadAgain && ep.subtitleText ? " · English subtitles updated" : "";
    say(${series.name} — ${ep.title} · ${newCode} saved${subMsg});
  } finally {
    if (submit) { submit.disabled = false; submit.textContent = oldText || "Save changes"; }
  }
}

/ ------------------------------------------------- artwork & metadata /
const TMDBCACHEKEY = "wtTmdbV2";
const TMDBSEASONCACHE_KEY = "wtTmdbSeasonsV1";
const TMDB_IMG = "https://image.tmdb.org/t/p/";

let TMDBCACHE = readStore(TMDBCACHE_KEY, {});
let TMDBSEASONCACHE = readStore(TMDBSEASONCACHE_KEY, {});
let activeLibraryTitle = null;
let tmdbHydrationInFlight = false;
let tmdbUnavailable = false;

const TMDB_FAILED = new Map();
const TMDBRETRYMS = 10  60  1000;
const TMDB_INFLIGHT = new Map();
const TMDBSEASONFAILED = new Map();
const TMDBSEASONINFLIGHT = new Map();

const JIKANCACHEKEY = "wtJikanV1";
let JIKANCACHE = readStore(JIKANCACHE_KEY, {});
const ANILISTCACHEKEY = "wtAniListV1";
let ANILISTCACHE = readStore(ANILISTCACHE_KEY, {});

function saveAniListCache() { try { localStorage.setItem(ANILISTCACHEKEY, JSON.stringify(ANILIST_CACHE)); } catch {} }
const JIKAN_INFLIGHT = new Map();
const JIKAN_FAILED = new Map();
const JIKANRETRYMS = 15  60  1000;

function saveTmdbCache() {
  try { localStorage.setItem(TMDBCACHEKEY, JSON.stringify(TMDB_CACHE)); } catch {}
}
function saveTmdbSeasonCache() {
  try { localStorage.setItem(TMDBSEASONCACHEKEY, JSON.stringify(TMDBSEASON_CACHE)); } catch {}
}
function tmdbArt(series) {
  const key = String(series.imdbId || series.name || series.id || "").toLowerCase();
  return TMDB_CACHE[key] || null;
}
function saveJikanCache() {
  try { localStorage.setItem(JIKANCACHEKEY, JSON.stringify(JIKAN_CACHE)); } catch {}
}
function normalizeTitleKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function fetchAniListAnime(series, force = false) {
  const title = String(series?.name || "").trim();
  if (!title) return null;
  const key = anilist:${normalizeTitleKey(title)};
  if (!force && ANILISTCACHE[key]) return ANILISTCACHE[key];
  const q = query ($search:String!) { Page(page:1, perPage:8) { media(search:$search, type:ANIME, sort:[SEARCHMATCH, POPULARITYDESC]) { id idMal format title { romaji english native userPreferred } startDate { year } episodes duration description(asHtml:false) coverImage { extraLarge large medium } bannerImage averageScore popularity genres status siteUrl } } };
  try {
    const r = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query: q, variables: { search: title } }),
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => ({}));
    const rows = Array.isArray(j?.data?.Page?.media) ? j.data.Page.media : [];
    const wanted = normalizeTitleKey(title);
    const norm = (v) => normalizeTitleKey(v);
    const pick = rows.find(x => [x?.title?.english, x?.title?.romaji, x?.title?.userPreferred, x?.title?.native]
      .some(v => norm(v) === wanted))
      || rows.find(x => [x?.title?.english, x?.title?.romaji, x?.title?.userPreferred]
      .some(v => { const a = norm(v); return a && (a.includes(wanted) || wanted.includes(a)); }));
    if (!pick) return null;
    const poster = pick.coverImage?.extraLarge || pick.coverImage?.large || pick.coverImage?.medium || "";
    const result = {
      ok: true, source: "anilist", provider: "anilist",
      anilistId: pick.id || null, malId: pick.idMal || null,
      mediaType: mediaTypeOf(series) === "movie" ? "movie" : "tv",
      title: pick.title?.english || pick.title?.romaji || pick.title?.userPreferred || title,
      originalTitle: pick.title?.native || "",
      year: pick.startDate?.year || null,
      posterUrl: poster,
      backdropUrl: pick.bannerImage || poster,
      posterPath: null, backdropPath: null,
      overview: String(pick.description || "").replace(/]+>/g, " ").replace(/\s+/g, " ").trim(),
      rating: typeof pick.averageScore === "number" ? pick.averageScore / 10 : null,
      voteCount: null,
      popularity: typeof pick.popularity === "number" ? pick.popularity : null,
      status: pick.status || "",
      runtime: typeof pick.duration === "number" ? pick.duration : null,
      runtimeText: typeof pick.duration === "number" ? fmtRuntime(pick.duration) : "",
      episodeRunTime: typeof pick.duration === "number" ? [pick.duration] : [],
      episodesTotal: pick.episodes || null,
      genres: Array.isArray(pick.genres) ? pick.genres.map((name, i) => ({ id: i + 1, name })) : [],
      seasons: [], siteUrl: pick.siteUrl || null,
    };
    ANILIST_CACHE[key] = result;
    saveAniListCache();
    return result;
  } catch { return null; }
}

async function fetchJikanAnime(series, force = false) {
  const title = String(series?.name || "").trim();
  const key = jikan:${normalizeTitleKey(title)};
  if (!force && JIKANCACHE[key]) return JIKANCACHE[key];
  const failedAt = JIKAN_FAILED.get(key) || 0;
  if (!force && failedAt && Date.now() - failedAt  {
    try {
      let data = null;
      try {
        const proxy = await fetch(/api/tmdb?action=anime&title=${encodeURIComponent(title)}, { headers: { accept: "application/json" } });
        if (proxy.ok) data = await proxy.json();
      } catch {}
      const rows = Array.isArray(data?.results) ? data.results : [];
      if (!rows.length) throw new Error("No Jikan match");
      const wanted = normalizeTitleKey(title);
      const exact = rows.find(x => normalizeTitleKey(x?.title) === wanted)
        || rows.find(x => normalizeTitleKey(x?.title_english) === wanted)
        || rows.find(x => normalizeTitleKey(x?.title || "").includes(wanted) || wanted.includes(normalizeTitleKey(x?.title || "")))
        || rows[0];
      if (!exact?.mal_id) throw new Error("No Jikan match");
      const full = exact;
      const poster = full?.images?.jpg?.largeimageurl || full?.images?.jpg?.imageurl || exact?.images?.jpg?.largeimage_url || null;
      const genres = Array.isArray(full?.genres) ? full.genres.map(g => ({ id: g.mal_id, name: g.name })) : [];
      const studios = Array.isArray(full?.studios) ? full.studios.map(g => ({ id: g.mal_id, name: g.name })) : [];
      const producers = Array.isArray(full?.producers) ? full.producers.map(g => ({ id: g.mal_id, name: g.name })) : [];
      const cast = Array.isArray(full?.characters) ? full.characters.slice(0, 12).map(c => ({ id: c?.character?.malid, name: c?.character?.name, character: "", profilePath: c?.character?.images?.jpg?.imageurl || null })) : [];
      const result = {
        ok: true, source: "jikan", provider: "jikan", malId: full.mal_id,
        mediaType: mediaTypeOf(series) === "movie" ? "movie" : "tv",
        title: full.title || exact.title || title,
        originalTitle: full.titlejapanese || exact.titlejapanese || "",
        year: full.year || (full.aired?.from ? Number(String(full.aired.from).slice(0, 4)) : null),
        posterUrl: poster, backdropUrl: poster,
        posterPath: null, backdropPath: null,
        overview: full.synopsis || "",
        background: full.background || "",
        rating: typeof full.score === "number" ? full.score : null,
        voteCount: typeof full.scoredby === "number" ? full.scoredby : null,
        rank: typeof full.rank === "number" ? full.rank : null,
        popularity: typeof full.popularity === "number" ? full.popularity : null,
        members: typeof full.members === "number" ? full.members : null,
        favorites: typeof full.favorites === "number" ? full.favorites : null,
        status: full.status || "",
        runtimeText: full.duration || "",
        runtime: null,
        episodeRunTime: [],
        genres, studios, producers, credits: { cast, crew: [] },
        malUrl: full.url || exact.url || null,
        airedFrom: full.aired?.from || null,
        airedTo: full.aired?.to || null,
        episodesTotal: full.episodes || exact.episodes || null,
        seasons: []
      };
      JIKAN_CACHE[key] = result;
      saveJikanCache();
      JIKAN_FAILED.delete(key);
      return result;
    } catch (e) {
      JIKAN_FAILED.set(key, Date.now());
      return null;
    } finally {
      JIKAN_INFLIGHT.delete(key);
    }
  })();
  JIKAN_INFLIGHT.set(key, request);
  return request;
}

async function fetchJikanEpisodes(series, season = 1) {
  const art = await fetchJikanAnime(series);
  if (!art?.malId) return null;
  const key = jikan-episodes:${art.malId};
  if (JIKANCACHE[key]) return JIKANCACHE[key];
  try {
    let all = [];
    const proxy = await fetch(/api/tmdb?action=anime-episodes&malId=${encodeURIComponent(art.malId)}, { headers: { accept: "application/json" } });
    if (proxy.ok) {
      const pd = await proxy.json();
      if (Array.isArray(pd?.episodes)) all = pd.episodes;
    }
    const result = {
      ok: true, source: "jikan", seasonNumber: Number(season),
      episodes: all.map(e => ({
        id: e.malid, episodeNumber: e.episode ?? e.malid, seasonNumber: Number(season),
        name: e.title || Episode ${e.episode || e.mal_id || ""},
        overview: e.synopsis || "", airDate: e.aired || null,
        stillPath: e.images?.jpg?.largeimageurl || e.images?.jpg?.image_url || null,
        stillUrl: e.images?.jpg?.largeimageurl || e.images?.jpg?.image_url || null,
        rating: typeof e.score === "number" ? e.score : null,
        voteCount: typeof e.scoredby === "number" ? e.scoredby : null, runtime: null
      }))
    };
    JIKAN_CACHE[key] = result; saveJikanCache(); return result;
  } catch { return null; }
}

async function fetchTmdbArt(series, force = false) {
  const key = String(series.imdbId || series.name || series.id || "").toLowerCase();
  if (!key) return null;
  if (!force && TMDBCACHE[key]) return TMDBCACHE[key];
  const failedAt = TMDB_FAILED.get(key) || 0;
  if (!force && failedAt && Date.now() - failedAt  {
    try {
      const type = mediaTypeOf(series) === "movie" ? "movie" : "tv";
      const params = new URLSearchParams({ type });
      if (series.imdbId) params.set("imdbId", series.imdbId);
      params.set("title", series.name || "");
      let data = null;
      try {
        params.set("v", "20260814-4");
        const r = await fetch(/api/tmdb?${params.toString()}, { cache: "no-store", headers: { accept: "application/json" } });
        data = await r.json().catch(() => ({}));
        if (!r.ok || !data?.ok) {
          if (r.status === 503) tmdbUnavailable = true;
          data = null;
        }
      } catch {}
      if (data?.ok && (data.posterPath || data.posterUrl || data.backdropPath || data.backdropUrl)) {
        TMDB_FAILED.delete(key);
        TMDB_CACHE[key] = data;
        saveTmdbCache();
        return data;
      }
      const ani = await fetchAniListAnime(series);
      if (ani?.posterUrl || ani?.backdropUrl) {
        const fallback = { ...ani, backdropUrl: ani.backdropUrl || ani.posterUrl || "" };
        TMDB_CACHE[key] = fallback;
        saveTmdbCache();
        return fallback;
      }
      const anime = await fetchJikanAnime(series);
      const wanted = normalizeTitleKey(series.name);
      const animeTitle = normalizeTitleKey(anime?.title);
      const animeMatch = anime && (animeTitle === wanted || animeTitle.includes(wanted) || wanted.includes(animeTitle));
      if (animeMatch) {
        const fallback = { ...anime, backdropUrl: anime.backdropUrl || anime.posterUrl || "" };
        TMDB_CACHE[key] = fallback;
        saveTmdbCache();
        return fallback;
      }
      TMDB_FAILED.set(key, Date.now());
      return null;
    } catch {
      const ani = await fetchAniListAnime(series);
      if (ani?.posterUrl || ani?.backdropUrl) {
        const fallback = { ...ani, backdropUrl: ani.backdropUrl || ani.posterUrl || "" };
        TMDB_CACHE[key] = fallback; saveTmdbCache(); return fallback;
      }
      TMDB_FAILED.set(key, Date.now());
      const anime = await fetchJikanAnime(series);
      if (anime) {
        const fallback = { ...anime, backdropUrl: anime.backdropUrl || anime.posterUrl || "" };
        TMDB_CACHE[key] = fallback; saveTmdbCache(); return fallback;
      }
      return null;
    } finally {
      TMDB_INFLIGHT.delete(key);
    }
  })();
  TMDB_INFLIGHT.set(key, request);
  return request;
}

async function fetchTmdbSeason(series, seasonNumber, force = false) {
  const art = tmdbArt(series);
  const tmdbId = art?.tmdbId;
  if (!tmdbId || mediaTypeOf(series) === "movie") return fetchJikanEpisodes(series, seasonNumber);
  const key = ${tmdbId}:s${seasonNumber};
  if (!force && TMDBSEASONCACHE[key]) return TMDBSEASONCACHE[key];
  const failedAt = TMDBSEASONFAILED.get(key) || 0;
  if (!force && failedAt && Date.now() - failedAt  {
    try {
      const params = new URLSearchParams({ action: "season", type: "tv", tmdbId: String(tmdbId), season: String(seasonNumber) });
      const r = await fetch(/api/tmdb?${params.toString()});
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) throw new Error(data?.error || TMDB season HTTP ${r.status});
      TMDBSEASONFAILED.delete(key);
      TMDBSEASONCACHE[key] = data;
      saveTmdbSeasonCache();
      return data;
    } catch {
      TMDBSEASONFAILED.set(key, Date.now());
      /* BUG 4 FIX: was fetchJikanEpisodes(series, season) — season
      doesn't exist here; the parameter is seasonNumber. */
      return fetchJikanEpisodes(series, seasonNumber);
    } finally {
      TMDBSEASONINFLIGHT.delete(key);
    }
  })();
  TMDBSEASONINFLIGHT.set(key, request);
  return request;
}

function fmtRuntime(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n  Number(s.seasonNumber)).filter(Number.isInteger) : [];
  const fromLocal = (series.episodes || []).map(e => Number(e.seasonNumber)).filter(n => Number.isInteger(n) && n > 0);
  return [...new Set([...fromTmdb, ...fromLocal])].sort((a, b) => a - b);
}
function localEpisodesForSeason(series, season) {
  return (series.episodes || []).filter(e => Number(e.seasonNumber) === Number(season)).sort((a, b) => (a.episodeNumber || 9999) - (b.episodeNumber || 9999));
}

async function openInlineSeries(series) {
  // Legacy inline expansion is disabled; one consistent detail modal instead.
  return openLibraryDetail(series);
}

async function hydrateLibraryArt() {
  if (tmdbHydrationInFlight || !MY_LIBRARY.length) return;
  const pending = MY_LIBRARY.slice(0, 30).filter((series) => {
    const key = String(series.imdbId || series.name || series.id || "").toLowerCase();
    if (!key || TMDB_CACHE[key]) return false;
    const failedAt = TMDB_FAILED.get(key) || 0;
    return !failedAt || Date.now() - failedAt >= TMDBRETRYMS;
  });
  if (!pending.length) return;
  tmdbHydrationInFlight = true;
  let changed = false;
  try {
    for (const series of pending) {
      const before = tmdbArt(series);
      const after = await fetchTmdbArt(series);
      if (!before && after) changed = true;
    }
  } finally {
    tmdbHydrationInFlight = false;
  }
  if (changed) renderLanding();
}

function posterUrl(art, size = "w342") {
  return art?.posterUrl || (art?.posterPath ? ${TMDB_IMG}${size}${art.posterPath} : "");
}
function backdropUrl(art, size = "w1280") {
  return art?.backdropUrl || (art?.backdropPath ? ${TMDB_IMG}${size}${art.backdropPath} : "");
}
function episodeStillUrl(tmdbEp, size = "w300") {
  if (!tmdbEp) return "";
  if (tmdbEp.stillUrl) return tmdbEp.stillUrl;
  if (tmdbEp.stillPath) return /^https?:\/\//i.test(tmdbEp.stillPath) ? tmdbEp.stillPath : ${TMDB_IMG}${size}${tmdbEp.stillPath};
  return "";
}
function setBackgroundWithFallback(el, url, fallbackLabel = "") {
  if (!el) return;
  el.classList.remove("bg-fallback");
  el.style.backgroundImage = "";
  const isLeaf = el.children.length === 0;
  if (isLeaf) el.textContent = "";
  if (!url) {
    if (fallbackLabel && isLeaf) { el.classList.add("bg-fallback"); el.textContent = fallbackLabel; }
    return;
  }
  const probe = new Image();
  probe.onload = () => { el.style.backgroundImage = url("${url}"); };
  probe.onerror = () => {
    if (fallbackLabel && isLeaf) { el.classList.add("bg-fallback"); el.textContent = fallbackLabel; }
  };
  probe.src = url;
}

function titleMeta(series) {
  const art = tmdbArt(series) || {};
  const type = mediaTypeOf(series) === "movie" ? "Movie" : "Series";
  const count = Number.isFinite(Number(series?.episodes?.length)) ? Number(series.episodes.length) : 0;
  const rawYear = series?.year ?? art?.year ?? "";
  const rawRating = art?.rating ?? series?.imdbRating ?? "";
  const year = rawYear === null || rawRating === undefined && rawYear === undefined ? "" : String(rawYear ?? "");
  const ratingNumber = Number(rawRating);
  const rating = Number.isFinite(ratingNumber) && ratingNumber > 0 ? ★ ${ratingNumber.toFixed(1)} : "";
  const episodeText = type === "Series" ? ${count} episode${count === 1 ? "" : "s"} : "";
  return [type, String(year), rating, episodeText].filter(Boolean).map((x) => String(x));
}

async function openLibraryDetail(series) {
  activeLibraryTitle = series;
  let art = tmdbArt(series);
  if (!art) art = await fetchTmdbArt(series);

  const hero = $("#libraryDetailHero");
  const heroImage = backdropUrl(art) || posterUrl(art, "w1280");
  setBackgroundWithFallback(hero, heroImage);
  $("#libraryDetailTitle").textContent = art?.title || series.name || "Untitled";
  $("#libraryDetailSummary").textContent = art?.overview || series.summary || "No synopsis available.";
  const isMovie = mediaTypeOf(series) === "movie";
  const body = $(".library-detail-body");
  const list = $("#libraryDetailEpisodes");
  list.innerHTML = "";
  $("#libraryDetailHeading").textContent = isMovie ? "Movie" : "Seasons & Episodes";
  const addBtn = $("#libraryDetailAdd");
  if (addBtn) {
    addBtn.textContent = isMovie ? "Edit movie" : "+ Add episode";
    addBtn.onclick = () => {
      if (isMovie) {
        const only = series.episodes?.[0];
        if (only) openEpisodeEdit(series, only);
      } else {
        $("#libraryDetail").hidden = true;
        openLibraryForm(series.name);
      }
    };
  }

  const meta = [];
  const rating = art?.rating ?? series.imdbRating;
  if (rating != null) meta.push(★ ${Number(rating).toFixed(1)});
  if (art?.year || series.year) meta.push(String(art?.year || series.year));
  if (art?.status) meta.push(art.status);
  if (art?.runtimeText || art?.runtime) meta.push(art.runtimeText || fmtRuntime(art.runtime));
  if (art?.voteCount) meta.push(${Number(art.voteCount).toLocaleString()} votes);
  const oldInfo = body.querySelector(".detail-info-grid");
  oldInfo?.remove();
  if (meta.length) {
    const chips = document.createElement("div"); chips.className = "detail-info-grid";
    meta.forEach(x => { const c = document.createElement("span"); c.className = "detail-info-chip"; c.textContent = x; chips.appendChild(c); });
    body.insertBefore(chips, body.firstChild);
  }

  if (isMovie) {
    const ep = series.episodes?.[0];
    if (ep) list.appendChild(renderDetailEpisode(series, ep, null, true));
    $("#libraryDetail").hidden = false;
    return;
  }

  const tabs = document.createElement("div"); tabs.className = "detail-season-tabs";
  const content = document.createElement("div"); content.id = "detailSeasonContent";
  list.append(tabs, content);
  const seasons = seasonNumbers(series);
  if (!seasons.length) {
    content.innerHTML = 'No season number has been assigned yet. Use Edit on an episode to set its season and episode number.';
    $("#libraryDetail").hidden = false;
    return;
  }

  const renderSeason = async (season) => {
    tabs.querySelectorAll(".detail-season-tab").forEach(b => b.classList.toggle("active", Number(b.dataset.season) === Number(season)));
    content.innerHTML = 'Loading season details…';
    const tmdbSeason = await fetchTmdbSeason(series, season);
    let local = localEpisodesForSeason(series, season);
    if (Number(season) === 1 && local.length  Number(e.seasonNumber)).filter(n => Number.isInteger(n) && n > 0);
      if (new Set(explicit).size  e.seasonNumber == null)];
    }
    const remote = [...(tmdbSeason?.episodes || [])].sort((a, b) => (a.episodeNumber || 9999) - (b.episodeNumber || 9999));
    const merged = [];
    const used = new Set();
    for (const te of remote) {
      const le = local.find(x => !used.has(x.id) && Number(x.episodeNumber) === Number(te.episodeNumber));
      if (le) used.add(le.id);
      merged.push({ local: le, tmdb: te });
    }
    for (const le of local) if (!used.has(le.id)) merged.push({ local: le, tmdb: null });
    merged.sort((a, b) => Number(a.tmdb?.episodeNumber ?? a.local?.episodeNumber ?? 9999) - Number(b.tmdb?.episodeNumber ?? b.local?.episodeNumber ?? 9999));
    content.innerHTML = "";
    const head = document.createElement("div"); head.className = "inline-season-head";
    const h = document.createElement("h4"); h.textContent = tmdbSeason?.name || Season ${season};
    const seasonMeta = [];
    if (tmdbSeason?.episodeCount) seasonMeta.push(${tmdbSeason.episodeCount} episodes);
    if (tmdbSeason?.rating != null) seasonMeta.push(★ ${Number(tmdbSeason.rating).toFixed(1)});
    if (tmdbSeason?.voteCount) seasonMeta.push(${Number(tmdbSeason.voteCount).toLocaleString()} votes);
    const sp = document.createElement("span");
    sp.textContent = seasonMeta.join(" · ");
    head.append(h, sp); content.appendChild(head);
    const grid = document.createElement("div"); grid.className = "detail-episodes"; content.appendChild(grid);
    if (!merged.length) { grid.innerHTML = 'No episodes found for this season.'; return; }
    merged.forEach(x => grid.appendChild(renderDetailEpisode(series, x.local, x.tmdb, false)));
  };

  seasons.forEach(season => {
    const info = (art?.seasons || []).find(s => Number(s.seasonNumber) === Number(season));
    const b = document.createElement("button"); b.type = "button"; b.className = "detail-season-tab"; b.dataset.season = season;
    b.innerHTML = Season ${season}${info?.episodeCount || localEpisodesForSeason(series, season).length || 0} eps${info?.rating != null ?  · ★ ${Number(info.rating).toFixed(1)} : ""};
    b.onclick = () => renderSeason(season); tabs.appendChild(b);
  });
  $("#libraryDetail").hidden = false;
  await renderSeason(seasons[0]);
}

function renderDetailEpisode(series, ep, tmdbEp, movie = false) {
  const row = document.createElement("div"); row.className = "detail-episode";
  const artUrl = movie ? posterUrl(tmdbArt(series), "w500") : episodeStillUrl(tmdbEp, "w300");
  const art = document.createElement("div"); art.className = "detail-episode-art"; setBackgroundWithFallback(art, artUrl, movie ? (series.name || "Movie") : "");
  const copy = document.createElement("div"); copy.className = "detail-episode-copy";
  const n = movie ? "Movie" : S${String(tmdbEp?.seasonNumber ?? ep?.seasonNumber ?? 1).padStart(2, "0")}E${String(tmdbEp?.episodeNumber ?? ep?.episodeNumber ?? 1).padStart(2, "0")};
  const title = tmdbEp?.name || ep?.title || n;
  const b = document.createElement("b"); b.textContent = title;
  const rating = tmdbEp?.rating != null ? ★ ${Number(tmdbEp.rating).toFixed(1)} : "";
  const date = tmdbEp?.airDate ? new Date(tmdbEp.airDate + "T00:00:00").toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
  const meta = document.createElement("small"); meta.textContent = [n, rating, date, ep?.subtitleText ? "English subtitles" : ""].filter(Boolean).join(" · ");
  copy.append(b, meta);
  const ov = document.createElement("div"); ov.className = "detail-episode-overview"; ov.textContent = tmdbEp?.overview || ep?.episodeSummary || ""; copy.appendChild(ov);
  const actions = document.createElement("div"); actions.className = "detail-episode-actions";
  const edit = document.createElement("button"); edit.className = "btn ghost"; edit.type = "button"; edit.textContent = "Edit"; edit.disabled = !ep; edit.onclick = e => { e.stopPropagation(); if (ep) openEpisodeEdit(series, ep); };
  const watch = document.createElement("button"); watch.className = "btn primary"; watch.type = "button"; watch.textContent = ep?.url ? "▶ Watch" : "Add link"; watch.onclick = e => { e.stopPropagation(); $("#libraryDetail").hidden = true; ep?.url ? watchLibraryEpisode(series, ep) : openLibraryForm(series.name); };
  actions.append(watch, edit); copy.appendChild(actions); row.append(art, copy); return row;
}

function renderNetflixCard(series) {
  const art = tmdbArt(series);
  const type = mediaTypeOf(series) === "movie" ? "Movie" : "Series";
  const meta = titleMeta(series).filter((x) => x !== type).slice(0, 2).join(" · ");
  const card = document.createElement("article");
  card.className = "netflix-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.dataset.libraryId = String(series.id || "");
  card.setAttribute("aria-label", Open ${series.name || type});
  const poster = posterUrl(art);
  const skeleton = document.createElement("div");
  skeleton.className = "netflix-card-skeleton";
  card.appendChild(skeleton);
  const installPoster = (url) => {
    skeleton.remove();
    const old = card.querySelector("img,.poster-fallback");
    if (old) old.remove();
    if (!url) {
      card.insertBefore(makePosterFallback(series.name || type), card.firstChild);
      return;
    }
    const img = document.createElement("img");
    img.src = url;
    img.alt = series.name || type;
    img.loading = "lazy";
    img.addEventListener("load", () => img.classList.add("loaded"), { once: true });
    img.addEventListener("error", () => {
      img.replaceWith(makePosterFallback(series.name || type));
    }, { once: true });
    card.insertBefore(img, card.firstChild);
  };
  if (poster) {
    installPoster(poster);
  } else {
    installPoster("");
    fetchTmdbArt(series).then((fresh) => {
      const url = posterUrl(fresh);
      if (url && card.isConnected) installPoster(url);
    }).catch(() => {});
  }
  const shade = document.createElement("div");
  shade.className = "netflix-card-shade";
  const info = document.createElement("div");
  info.className = "netflix-card-info";
  info.innerHTML = ${esc(series.name || "Untitled")}${esc(meta || type)};
  card.append(shade, info);
  const open = () => openLibraryDetail(series);
  card.addEventListener("click", (e) => {
    if (card.dataset.dragMoved === "1") { card.dataset.dragMoved = "0"; return; }
    open();
  });
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
  });
  return card;
}

function makePosterFallback(name) {
  const el = document.createElement("div");
  el.className = "poster-fallback";
  el.textContent = name;
  return el;
}

function setupNetflixRows() {
  document.querySelectorAll(".netflix-row").forEach((row) => {
    if (row.dataset.scrollReady === "1") return;
    row.dataset.scrollReady = "1";
    row.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaY)  {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      down = true;
      moved = false;
      startX = e.clientX;
      startScroll = row.scrollLeft;
      row.classList.add("is-dragging");
      // No setPointerCapture: it changes the click target in Chromium.
    });
    row.addEventListener("pointermove", (e) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 7) moved = true;
      row.scrollLeft = startScroll - dx;
    });
    row.addEventListener("pointerup", () => {
      down = false;
      row.classList.remove("is-dragging");
      if (moved) {
        row.dataset.suppressClickUntil = String(Date.now() + 120);
        moved = false;
      }
    });
    row.addEventListener("pointercancel", () => {
      down = false;
      row.classList.remove("is-dragging");
      moved = false;
    });
    row.addEventListener("click", (e) => {
      if (Number(row.dataset.suppressClickUntil || 0) > Date.now()) {
        e.preventDefault(); e.stopPropagation();
      }
    }, true);
  });
}

function renderLanding() {
  const allRow = $("#allRow");
  const moviesRow = $("#moviesRow");
  const seriesRow = $("#seriesRow");
  const count = $("#libraryCount");
  const empty = $("#landingEmpty");
  if (!allRow || !moviesRow || !seriesRow) return;

  const movies = MY_LIBRARY.filter((s) => mediaTypeOf(s) === "movie");
  const series = MY_LIBRARY.filter((s) => mediaTypeOf(s) !== "movie");
  allRow.innerHTML = "";
  moviesRow.innerHTML = "";
  seriesRow.innerHTML = "";
  if (count) count.textContent = ${MYLIBRARY.length} title${MYLIBRARY.length === 1 ? "" : "s"};
  empty.hidden = MY_LIBRARY.length > 0;
  $("#moviesSection").hidden = !movies.length;
  $("#seriesSection").hidden = !series.length;
  $("#allSection").hidden = !MY_LIBRARY.length;

  const ordered = [...MY_LIBRARY].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  for (const item of ordered) allRow.appendChild(renderNetflixCard(item));
  for (const item of movies) moviesRow.appendChild(renderNetflixCard(item));
  for (const item of series) seriesRow.appendChild(renderNetflixCard(item));
  setupNetflixRows();

  const heroTitle = $("#libraryHeroTitle");
  const heroSummary = $("#libraryHeroSummary");
  const heroMeta = $("#libraryHeroMeta");
  const heroBackdrop = $("#libraryHeroBackdrop");
  const hero = ordered[0] || null;
  if (hero) {
    activeLibraryTitle = activeLibraryTitle && MY_LIBRARY.some((x) => x.id === activeLibraryTitle.id) ? activeLibraryTitle : hero;
    const h = activeLibraryTitle;
    const art = tmdbArt(h);
    const back = backdropUrl(art) || posterUrl(art, "w1280");
    const heroPoster = $("#libraryHeroPoster");
    const heroPosterWrap = $(".netflix-hero-poster-wrap");
    const poster = posterUrl(art, "w500") || posterUrl(art);
    if (heroPoster && heroPosterWrap) {
      heroPoster.classList.remove("loaded");
      heroPosterWrap.classList.toggle("is-empty", !poster);
      heroPoster.onload = () => heroPoster.classList.add("loaded");
      heroPoster.onerror = () => { heroPosterWrap.classList.add("is-empty"); };
      /* BUG 8 FIX: an empty src can make some browsers request the page
      itself — drop the attribute instead of setting "". */
      if (poster) heroPoster.src = poster;
      else heroPoster.removeAttribute("src");
      heroPoster.alt = h.name || "";
    }
    heroTitle.textContent = h.name || "Your library";
    heroSummary.textContent = h.summary || art?.overview || "Pick a title and watch together.";
    heroMeta.innerHTML = titleMeta(h).map((m) => {
      const text = String(m ?? "");
      return ${esc(text)};
    }).join("");
    setBackgroundWithFallback(heroBackdrop, back);
    const heroWatch = $("#libraryHeroWatch");
    const playableHeroEpisode = Array.isArray(h.episodes) ? h.episodes.find((e) => String(e?.url || "").trim()) : null;
    heroWatch.disabled = false;
    heroWatch.textContent = playableHeroEpisode ? "▶ Play" : "▶ View";
    heroWatch.onclick = () => playableHeroEpisode ? watchLibraryEpisode(h, playableHeroEpisode) : openLibraryDetail(h);
    $("#libraryHeroInfo").onclick = () => openLibraryDetail(h);
    if (!art) {
      fetchTmdbArt(h).then((fresh) => { if (fresh) renderLanding(); });
    }
  } else {
    activeLibraryTitle = null;
    heroTitle.textContent = "Your library";
    heroSummary.textContent = "Add a movie or series to build your personal library.";
    heroMeta.innerHTML = "";
    heroBackdrop.style.backgroundImage = "";
    const emptyHeroPoster = $(".netflix-hero-poster-wrap");
    if (emptyHeroPoster) emptyHeroPoster.classList.add("is-empty");
    $("#libraryHeroWatch").disabled = true;
    $("#libraryHeroInfo").onclick = () => $("#landingAddBtn").click();
  }

  const continueSection = $("#continueSection");
  const continueRow = $("#continueRow");
  continueRow.innerHTML = "";
  if (SAVED_ROOMS.length) {
    continueSection.hidden = false;
    for (const room of SAVED_ROOMS.slice(0, 10)) {
      const card = document.createElement("div");
      card.className = "netflix-room";
      card.innerHTML = ${esc(room.title || "Saved room")}${esc(room.code)}${esc(room.episodeTitle || room.ref || "Ready to resume")}ResumeForget;
      card.querySelector(".btn.primary").onclick = () => openRoom(room.code);
      card.querySelector(".btn.ghost").onclick = () => removeSavedRoom(room.code);
      continueRow.appendChild(card);
    }
  } else continueSection.hidden = true;

  const rooms = $("#landingRooms");
  rooms.innerHTML = "";
  if (SAVED_ROOMS.length) {
    for (const room of SAVED_ROOMS.slice(0, 12)) {
      const card = document.createElement("div");
      card.className = "netflix-room";
      card.innerHTML = ${esc(room.title || "Untitled room")}${esc(room.code)}${esc(room.episodeTitle || room.ref || "No saved media")}Open×;
      card.querySelector(".btn.primary").onclick = () => openRoom(room.code);
      card.querySelector(".btn.ghost").onclick = () => removeSavedRoom(room.code);
      rooms.appendChild(card);
    }
  } else {
    rooms.innerHTML = No saved rooms yet. Joining a room saves its code automatically on this device.;
  }

  // Hydrate art after first paint so the library stays usable if TMDB is slow.
  hydrateLibraryArt();
}

/ =============================================================== the gate /
const WORDS_A = "amber autumn quiet velvet copper hollow silver paper linen ember slate meadow".split(" ");
const WORDS_B = "fig lantern harbour thistle otter comet willow bramble tide sparrow moth reef".split(" ");
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/* The room code is the whole lock. Two words alone is 144 combinations —
the suffix takes it past a hundred million. */
const roll = () => {
  const rnd = crypto.getRandomValues(new Uint8Array(3));
  const tail = [...rnd].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 4);
  return ${pick(WORDSA)}-${pick(WORDSB)}-${tail};
};

$("#dbLabel").textContent = (firebaseConfig.projectId || "firebase");
/ BUG 3 FIX: guarded localStorage read. /
$("#who").value = (() => { try { return localStorage.wtName || ""; } catch { return ""; } })();
$("#code").value = (decodeURIComponent(location.hash.slice(1)) || roll()).toLowerCase();
$("#roll").onclick = () => ($("#code").value = roll());
$("#enter").onclick = join;
$("#gate").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.tagName !== "BUTTON") join();
});

function populateSeriesSelect(selectName) {
  const sel = $("#librarySeriesSelect");
  if (!sel) return;
  sel.innerHTML = '+ New series';
  for (const series of MY_LIBRARY) {
    const opt = document.createElement("option");
    opt.value = series.name;
    opt.textContent = series.name;
    sel.appendChild(opt);
  }
  sel.value = selectName && findSeries(selectName) ? selectName : "";
  syncSeriesFields();
}

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
  $("#libraryFormOverlay").hidden = false;
  $("#libraryFormWrap").hidden = false;
  const chosenSeries = seriesName ? findSeries(seriesName) : null;
  const imdbField = $("#libraryForm").querySelector('[name="imdbId"]');
  if (imdbField) { imdbField.value = chosenSeries?.imdbId || ""; }
  const mediaType = $("#libraryMediaType");
  if (mediaType) { mediaType.value = chosenSeries ? (mediaTypeOf(chosenSeries) === "movie" ? "movie" : "series") : "series"; mediaType.disabled = !!chosenSeries; }
  syncMovieFields();
  const target = chosenSeries
    ? $("#libraryForm").querySelector('[name="url"]')
    : $("#librarySeries");
  target?.focus();
}

/ Series-name -> IMDb ID autocomplete via /api/imdb-search. /
(function setupImdbAutocomplete() {
  const input = $("#librarySeries");
  const box = $("#imdbSuggest");
  const imdbField = $("#libraryImdbId");
  const hint = $("#imdbIdHint");
  if (!input || !box || !imdbField) return;
  let debounceTimer = null;
  let abortCtrl = null;
  let items = [];
  let activeIndex = -1;
  let lastPickedName = "";

  function hideBox() {
    box.hidden = true;
    box.innerHTML = "";
    activeIndex = -1;
  }
  function markAutoFilled(on) {
    if (hint) hint.hidden = !on;
  }
  function renderItems() {
    if (!items.length) {
      box.innerHTML = 'No matches on IMDb.';
      box.hidden = false;
      return;
    }
    box.innerHTML = "";
    items.forEach((it, i) => {
      const row = document.createElement("div");
      row.className = "imdb-suggest-item" + (i === activeIndex ? " active" : "");
      row.setAttribute("role", "option");
      const yearText = it.year ? (it.isSeries ? ${it.year}\u2013${it.endYear || ""} : String(it.year)) : "";
      row.innerHTML = ${it.poster ?  : ''}${escapeHtml(it.title)}${escapeHtml(yearText)} ${it.id}${escapeHtml(it.typeLabel)};
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        pick(it);
      });
      box.appendChild(row);
    });
    box.hidden = false;
  }
  async function pick(it) {
    input.value = it.title;
    lastPickedName = it.title;
    hideBox();
    if (it.provider === "imdb" && it.id) {
      imdbField.value = it.id;
      markAutoFilled(true);
      return;
    }
    imdbField.value = "";
    imdbField.placeholder = "Looking up IMDb id\u2026";
    try {
      const r = await fetch(/api/imdb-search?resolve=1&tmdbId=${encodeURIComponent(it.tmdbId)}&mediaType=${encodeURIComponent(it.mediaType)});
      const data = await r.json();
      if (r.ok && data.id) {
        imdbField.value = data.id;
        markAutoFilled(true);
      } else {
        markAutoFilled(false);
        imdbField.placeholder = "No IMDb id found \u2014 enter manually";
      }
    } catch {
      markAutoFilled(false);
      imdbField.placeholder = "Lookup failed \u2014 enter manually";
    }
  }
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  async function search(q) {
    if (abortCtrl) abortCtrl.abort();
    abortCtrl = new AbortController();
    try {
      const r = await fetch(/api/imdb-search?q=${encodeURIComponent(q)}, { signal: abortCtrl.signal });
      if (!r.ok) { hideBox(); return; }
      const data = await r.json();
      if (input.value.trim() !== q) return;
      items = Array.isArray(data.results) ? data.results : [];
      renderItems();
    } catch (e) {
      if (e?.name !== "AbortError") hideBox();
    }
  }
  input.addEventListener("input", () => {
    if (input.value.trim() !== lastPickedName) markAutoFilled(false);
    const q = input.value.trim();
    clearTimeout(debounceTimer);
    if (q.length  search(q), 280);
  });
  input.addEventListener("keydown", (e) => {
    if (box.hidden || !items.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, items.length - 1); renderItems(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); renderItems(); }
    else if (e.key === "Enter" && activeIndex >= 0) { e.preventDefault(); pick(items[activeIndex]); }
    else if (e.key === "Escape") { hideBox(); }
  });
  input.addEventListener("blur", () => setTimeout(hideBox, 120));
  input.addEventListener("focus", () => { if (items.length && input.value.trim().length >= 2) box.hidden = false; });
})();

function openSubtitleImport() {
  $("#subtitleImportOverlay").hidden = false;
  $("#subtitleImportWrap").hidden = false;
  $("#subtitleImportForm").querySelector('[name="url"]')?.focus();
}
$("#navImportSubs")?.addEventListener("click", openSubtitleImport);
$("#subtitleImportClose")?.addEventListener("click", () => { $("#subtitleImportOverlay").hidden = true; });
$("#subtitleImportCancel").onclick = () => {
  $("#subtitleImportOverlay").hidden = true;
  $("#subtitleImportForm").reset();
};
$("#subtitleImportForm").addEventListener("submit", (e) => {
  e.preventDefault();
  importOpenSubtitles(e.currentTarget);
});

$("#landingAddBtn").onclick = () => {
  if ($("#libraryFormOverlay").hidden) openLibraryForm();
  else $("#libraryFormOverlay").hidden = true;
};
$("#libraryFormClose")?.addEventListener("click", () => { $("#libraryFormOverlay").hidden = true; });

function scrollLandingTo(selector) {
  const target = $(selector);
  if (!target || target.hidden) return;
  const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - 76);
  window.scrollTo({ top, behavior: "smooth" });
}

$("#navHome")?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!$("#landing")?.classList.contains("on")) { showLanding(); }
  window.scrollTo({ top: 0, behavior: "smooth" });
});
$("#navMovies")?.addEventListener("click", (e) => { e.preventDefault(); scrollLandingTo("#moviesSection"); });
$("#navSeries")?.addEventListener("click", (e) => { e.preventDefault(); scrollLandingTo("#seriesSection"); });
$("#navRooms")?.addEventListener("click", (e) => { e.preventDefault(); scrollLandingTo("#roomsSection"); });

/* Event delegation keeps cards and navigation clickable after re-renders.
BUG 7 FIX: this capture-phase handler stops propagation, which used to kill
the direct #navHome listener (the only one calling showLanding). Bring the
landing back here whenever it isn't visible. */
document.addEventListener("click", (e) => {
  const nav = e.target.closest?.("#navHome,#navMovies,#navSeries,#navRooms");
  if (nav) {
    e.preventDefault();
    e.stopPropagation();
    if (!$("#landing")?.classList.contains("on")) showLanding();
    if (nav.id === "navHome") { window.scrollTo({ top: 0, behavior: "smooth" }); }
    else if (nav.id === "navMovies") scrollLandingTo("#moviesSection");
    else if (nav.id === "navSeries") scrollLandingTo("#seriesSection");
    else if (nav.id === "navRooms") scrollLandingTo("#roomsSection");
    return;
  }
  const card = e.target.closest?.(".netflix-card");
  if (card && !card.dataset.dragMoved) {
    const id = card.dataset.libraryId;
    const item = MY_LIBRARY.find(x => String(x.id) === String(id));
    if (item) { e.preventDefault(); e.stopPropagation(); openLibraryDetail(item); }
  }
}, true);

$("#librarySeriesSelect").onchange = syncSeriesFields;

function syncMovieFields() {
  const isMovie = $("#libraryMediaType")?.value === "movie";
  const form = $("#libraryForm");
  if (form) {
    const seriesLabel = form.querySelector('[name="series"]')?.closest(".field")?.querySelector(".eyebrow");
    const titleLabel = form.querySelector('[name="episode"]')?.closest(".field")?.querySelector(".eyebrow");
    const urlLabel = form.querySelector('[name="url"]')?.closest(".field")?.querySelector(".eyebrow");
    if (seriesLabel) seriesLabel.firstChild.textContent = isMovie ? "Movie name" : "Series name";
    if (titleLabel) titleLabel.firstChild.textContent = isMovie ? "Movie title" : "Episode title";
    if (urlLabel) urlLabel.firstChild.textContent = isMovie ? "Movie link" : "Episode link";
  }
  const seasonField = $("#seasonField");
  const episodeField = $("#episodeField");
  const seasonInput = seasonField?.querySelector("input");
  const episodeInput = episodeField?.querySelector("input");
  const note = $("#autoSubNote");
  if (!seasonField || !episodeField) return;
  seasonField.hidden = isMovie;
  episodeField.hidden = isMovie;
  if (seasonInput) seasonInput.required = !isMovie;
  if (episodeInput) episodeInput.required = !isMovie;
  if (note) {
    note.textContent = isMovie
      ? "Parallel pulls the best matching English subtitle for this movie straight from OpenSubtitles using its IMDb ID — no separate lookup step. If none is found, you'll be asked whether to upload a file by hand instead."
      : "Since you already entered the season and episode number, Parallel pulls the best matching English subtitle for that exact episode straight from OpenSubtitles — no separate lookup step. If none is found, you'll be asked whether to upload a file by hand instead.";
  }
}
$("#libraryMediaType")?.addEventListener("change", syncMovieFields);
syncMovieFields();

$("#landingJoinBtn").onclick = () => showGate();
$("#homeBtn").onclick = () => {
  // While in a room, switch to the library view without a full reload.
  if (R.room) {
    document.body.classList.add("landing-page");
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
  $("#libraryFormOverlay").hidden = true;
  $("#libraryFormWrap").hidden = true;
  $("#libraryForm").reset();
  const mt = $("#libraryMediaType"); if (mt) { mt.disabled = false; mt.value = "series"; }
  syncMovieFields();
  populateSeriesSelect();
};
$("#episodeEditClose")?.addEventListener("click", () => { $("#episodeEditOverlay").hidden = true; });
$("#episodeEditCancel")?.addEventListener("click", () => { $("#episodeEditOverlay").hidden = true; });
$("#episodeEditOverlay")?.addEventListener("click", (e) => { if (e.target === $("#episodeEditOverlay")) $("#episodeEditOverlay").hidden = true; });
$("#episodeEditForm")?.addEventListener("submit", (e) => { e.preventDefault(); saveEpisodeEdit(e.currentTarget); });
$("#editDownloadSubs")?.addEventListener("change", () => {
  const on = $("#editDownloadSubs").checked;
  $("#editSubtitleStatus").textContent = on
    ? "On: after saving, Parallel will search OpenSubtitles again using the new season/episode number and replace the saved subtitle if one is found."
    : "Off: the existing subtitle will be kept; only the season/episode number and title will change.";
});
$("#libraryDetailClose")?.addEventListener("click", () => { $("#libraryDetail").hidden = true; });
$("#libraryDetail")?.addEventListener("click", (e) => { if (e.target === $("#libraryDetail")) $("#libraryDetail").hidden = true; });

if (location.hash.slice(1)) showGate($("#code").value);
else showLanding();

/* BUG 2 + 3 FIX: full replacement of join().
 - the screen flips over BEFORE any localStorage access
 - every storage write is try/catch'd (iOS private mode, quota, webviews)
 - #enter is re-enabled on success so the gate works again this session */
async function join() {
  const name = $("#who").value.trim() || "Guest";
  const code = $("#code").value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  const err = $("#gateErr");
  if (code.length  setSource(pending), 250);
}

/* ============================================================ the room
Everything below is plain database reads and writes. The shared clock is
four fields; each client derives its own target position from them.
==================================================================== */
function wireRoom() {
  const base = rooms/${R.room};
  R.refs = {
    state:   ref(db, ${base}/state),
    members: ref(db, ${base}/members),
    me:      ref(db, ${base}/members/${R.uid}),
    chat:    ref(db, ${base}/chat),
    sig:     ref(db, ${base}/sig/${R.uid}),
    seen:    ref(db, ${base}/seen),
  };

  / The measured gap between this device's clock and Firebase's. /
  onValue(ref(db, ".info/serverTimeOffset"), (s) => {
    R.offset = s.val() || 0;
    $("#netVal").textContent = clock offset ${R.offset >= 0 ? "+" : ""}${Math.round(R.offset)}ms;
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
    // Heal rooms with missing fields instead of passing them back broken.
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
    if (R.state) offerResume(R.state);
  });

  onChildAdded(query(R.refs.chat, limitToLast(60)), (s) => addMsg(s.val()));

  onChildAdded(R.refs.sig, (s) => {
    const m = s.val();
    remove(s.ref);
    if (m?.from && m.from !== R.uid) onSignal(m.from, m.data);
  });
}

/ Host election: earliest-joined member left takes over. /
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
  patch = {
    playing: R.state.playing ?? false,
    pos: R.state.pos ?? 0,
    rate: R.state.rate ?? 1,
    ...patch,
  };
  // at is only restamped on position-carrying writes, or it would rewind.
  update(R.refs.state, "pos" in patch ? { ...patch, at: serverTimestamp() } : patch)
    .catch((e) => fbError(e, "playback update"));
}

function fbError(e, what) {
  const msg = String(e?.message || e);
  console.error([parallel] ${what} refused:, e);
  if (/permission|PERMISSION_DENIED/i.test(msg)) {
    say(The database refused the ${what}. Your rules don't allow it — +
      publish firebase/database.rules.json, then reload.);
  } else {
    say(${what} failed: ${msg});
  }
}

const serverNow = () => Date.now() + R.offset;
const expectedPos = () => {
  const s = R.state;
  if (!s) return 0;
  return s.playing ? s.pos + ((serverNow() - s.at) / 1000) * s.rate : s.pos;
};

/ One bookmark per title, so switching quality keeps your place. /
const titleId = (s) => {
  if (!s || s.kind === "none" || !s.ref) return "";
  const base = s.kind === "r2" ? (String(s.ref).split("/")[1] || s.ref) : s.ref;
  return "t" + ${s.kind}:${base}.replace(/[.#$/[\]]/g, "").slice(0, 90);
};

/* ==========================================================================
Player adapter — a  element and a YouTube iframe behind one API.
======================================================================== */
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
      if (this.baseDur) return this.baseDur;
      return this.ytReady ? this.yt.getDuration() || 0 : 0;
    }
    return isFinite(v.duration) ? v.duration : 0;
  },
  / Duration changing out from under a loaded video = an ad is running. /
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
    return v.readyState  (Math.abs(x - r)  (ytApi ||= new Promise((ok, no) => {
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
    playerVars: {
      controls: 0, disablekb: 1, modestbranding: 1, rel: 0, ccloadpolicy: 0,
      playsinline: 1, ivloadpolicy: 3, fs: 0, autoplay: 0, origin: location.origin,
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

/ ======================================================== the sync loop /
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
    // No fine speed control — wider deadband and jump.
    if (Math.abs(drift) > YT_TOL) PL.seek(want);
    PL.setRate(s.rate);
    return;
  }
  if (Math.abs(drift) > HARD) {
    PL.seek(want);
    PL.setRate(s.rate);
  } else if (Math.abs(drift) > SOFT) {
    PL.setRate(clamp(s.rate  (1 + clamp(drift  GAIN, -CAP, CAP)), 0.25, 4));
  } else {
    PL.setRate(s.rate);
  }
}

const hardSync = () => { if (PL.dur()) PL.seek(expectedPos()); };
$("#resync").onclick = () => { hardSync(); say("Snapped to the room"); };

/ Position heartbeat: drives the drift ribbon and writes the bookmark. /
let beat = 0;
setInterval(() => {
  if (!R.uid || !R.state) return;
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
  if (Date.now() - lastSave  dur - 90;   // last ninety seconds = finished
  update(ref(db, rooms/${R.room}/seen/${id}), {
    pos: done ? 0 : at, dur, done, title: s.title || "", at: serverTimestamp(),
  }).catch(() => {});
}

/ ================================================================ sources /
const LOCAL = { file: null, url: null };

function parseSource(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const yt = s.match(
    /(?:youtube.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu.be\/)([\w-]{11})/
  );
  if (yt) {
    const t = s.match(/?&=(\d+)/);
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

/ Internet Archive items are directories — resolve the playable file. /
const ARCHIVE_RE = /archive.org\/(?:details|download|embed|stream)\/([^/?#]+)/i;

async function resolveArchive(id) {
  const r = await fetch(https://archive.org/metadata/${encodeURIComponent(id)});
  if (!r.ok) throw new Error(archive.org returned ${r.status});
  const j = await r.json();
  const files = j.files || [];
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
  const url = (f) => https://archive.org/download/${id}/${encodeURIComponent(f.name)};
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
      say(Found ${src.title});
    } catch (e) {
      say(Couldn't read that archive.org item (${e.message}). Open the item, +
        right-click the MP4 under "Download Options" and paste that link instead.);
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

/ ------------------------------------------------------------------ shelf /
let SHELF = [];

function wireShelf() {
  onValue(ref(db, rooms/${R.room}/shelf), (s) => {
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
  await push(ref(db, rooms/${R.room}/shelf), {
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
       +
      ${esc(e.title)} +
      ${esc(e.label || hostOf(e.ref))} +
      ${progBarFor({ kind: e.kind, ref: e.ref })} +
      &times;;
    card.onclick = (ev) => {
      if (ev.target.classList.contains("kill")) {
        ev.stopPropagation();
        return void remove(ref(db, rooms/${R.room}/shelf/${e.id}));
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
  const refVal = String(src?.ref || "").trim();
  if (!kind || !refVal) {
    return say("This source has no playable link. Re-add the episode link from the library.");
  }
  const patch = {
    kind,
    ref: refVal,
    title: String(src?.title || "Untitled"),
    label: String(src?.label || ""),
    size: Number(src?.size || 0),
    subs: Array.isArray(src?.subs) ? src.subs : [],
    subtitleText: String(src?.subtitleText || ""),
    subtitleName: String(src?.subtitleName || ""),
    playing: true,
    pos: Number(startAt || 0),
  };
  ctl(patch);
}

/ --------------------------------------------------------- local files /
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

/ Room subtitle upload — stored in shared room state for both viewers. /
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
    ctl({
      subtitleText: text,
      subtitleName: name.slice(0, 120),
      subs: [{ key: "local", label: "English" }],
    });
    drawTracks();
    say(Loaded ${name} — subtitles are now shared in this room.);
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
      Open your copy of "${src.ref}"${src.size ?  (${fmtSize(src.size)}) : ""} to join in.;
    askForLocal(src);
  }
}

async function askForLocal(src) {
  const go = await ask({
    title: "Open your copy",
    body: Someone's playing "${src.ref}". Pick the same file from your computer and you'll share a playhead — nothing is uploaded either way.,
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

/ ----------------------------------------------------------- apply state /
function applyState(s) {
  const key = ${s.kind}:${s.ref};
  if (key !== applyState.last) {
    applyState.last = key;
    mountSource(s);
  }
  $("#nowLabel").innerHTML = s.kind === "none" ? "" :
    ${esc(s.title || "Untitled")}${esc(s.label || s.kind)};
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

/* HLS: Safari native; hls.js elsewhere. Routed through /proxy when the
host doesn't send CORS headers (server-side fetch re-adds them). */
const proxied = (u) =>
  CFG.API
    ? ${CFG.API.replace(/\/$/, "")}/proxy?url=${encodeURIComponent(u)}
    : /api/proxy?url=${encodeURIComponent(u)};

let hlsMod = null;

function teardownHls() {
  if (R.hls) { try { R.hls.destroy(); } catch {} R.hls = null; }
}

async function mountHls(url) {
  const canNative = v.canPlayType("application/vnd.apple.mpegurl");
  if (canNative) { v.src = proxied(url); v.load?.(); if (R.state?.playing) v.play().catch(() => {}); return; }
  if (!hlsMod) hlsMod = await import("https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js").catch(() => null);
  const Hls = hlsMod?.default || window.Hls;
  if (!Hls || !Hls.isSupported()) {
    say("This browser can't play HLS streams (.m3u8).");
    return;
  }
  const hls = new Hls();
  R.hls = hls;
  hls.on(Hls.Events.MANIFEST_PARSED, () => { drawQuals(); if (R.state?.playing) v.play().catch(() => {}); });
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
      v.pause();
      v.removeAttribute("src");
      v.load?.();
      v.src = s.kind === "r2" ? mediaUrl(s.ref) : s.ref;
      v.load?.();
      if (s.playing) v.play().catch(() => {});
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

/ Offer the bookmark once, only while paused near the start. /
function offerResume(s) {
  const box = $("#resume");
  const seen = R.progress[titleId(s)];
  const at = seen && !seen.done ? seen.pos : 0;
  const tag = ${s.kind}:${s.ref}:${Math.round(at)};
  if (!(at > 30) || s.playing || s.pos > 30 || R.shownResume === tag) {
    return void box.classList.remove("on");
  }
  R.shownResume = tag;
  $("#resumeAt").textContent = fmtTime(at);
  box.classList.add("on");
  $("#resumeGo").onclick = () => { box.classList.remove("on"); seekTo(at); };
  $("#resumeNo").onclick = () => { box.classList.remove("on"); seekTo(0); };
}

/ ============================================================== controls /
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

/ One clock for the readouts — YouTube fires no timeupdate. /
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

/ Pause everyone when one person stalls. One writer only. /
let stallGuard = 0;
setInterval(() => {
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
Parsed and painted by us rather than handed to a  element. */
function parseSubs(text) {
  text = text.replace(/\r/g, "");
  const cues = [];
  if (/^[Script Info]/m.test(text) || /^Dialogue:/m.test(text)) {
    for (const line of text.split("\n")) {
      if (!line.startsWith("Dialogue:")) continue;
      const f = line.slice(9).split(",");
      if (f.length  l.trim());
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
  const m = String(s).trim().match(/(?:(\d+):)?(\d{1,2}):(\d{2}).,/);
  if (!m) return null;
  return (+(m[1] || 0))  3600 + +m[2]  60 + +m[3] + +m[4].padEnd(3, "0") / 1000;
}

const tidy = (s) =>
  s.replace(/{[^}]*}/g, "")          // ASS override blocks
   .replace(/\\N|\n/g, "\n")
   .replace(/]*>/g, "")  // keep , drop the rest
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
  if (i  R.cues[i].end) {
    i = R.cues.findIndex((c) => t >= c.start && t  ${esc(l).replace(/&lt;i&gt;/g, "").replace(/&lt;\/i&gt;/g, "")})
    .join("");
})();

/ =========================================================== look & feel /
const LOOK = {
  size: 3.1, color: "#FFFFFF", bg: 0.62, font: "var(--ui)",
  edge: "shadow", pos: 9, wid: 82, vol: 1, delay: 0, cc: true,
};
const SUB_COLORS = ["#FFFFFF", "#F7E7A1", "#5EEAD4", "#F5A9C4", "#C9D3E0"];
const SUB_FONTS = [
  { l: "Sans", v: "var(--ui)" },
  { l: "Serif", v: 'Georgia, "Times New Roman",serif' },
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
  r.setProperty("--sub-bg", rgba(0,0,0,${LOOK.bg}));
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
    : LOOK.delay > 0 ? ${LOOK.delay.toFixed(1)}s later : ${(-LOOK.delay).toFixed(1)}s earlier;
  R.delay = LOOK.delay;
  R.cueIdx = -1;
  try { localStorage.wtLook = JSON.stringify(LOOK); } catch {}   // BUG 3 FIX
}

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

/ ================================================================= chrome /
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

/ ================================================================= people /
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
       +
      ${esc(m.name || "Guest")}${m.uid === R.uid ? " (you)" : ""} +
      (m.voice ?  : "") +
      (m.noFile ? no file : "") +
      (m.uid === R.state?.hostId ? host : "");
    box.appendChild(row);
  });
  if (!R.members.length) box.innerHTML = Just you so far.;
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

/ ---------------- the drift ribbon: both playheads on one strip ---------- /
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
  if (pts.length  p.pos));
  const hi = Math.max(...pts.map((p) => p.pos));
  const spread = hi - lo;
  if (spread > 0.35) {
    R.seenSep = true;
    gap.classList.add("on");
    gap.style.left = (lo / d) * 100 + "%";
    gap.style.width = (spread / d) * 100 + "%";
    label.textContent = spread  {
  if (e.key !== "Enter") return;
  const text = e.target.value.trim();
  if (!text) return;
  push(R.refs.chat, { uid: R.uid, name: R.name, text, at: serverTimestamp() })
    .catch((err) => fbError(err, "chat message"));
  e.target.value = "";
});

function addMsg(m) {
  if (!m) return;
  const box = $("#msgs");
  const i = R.members.findIndex((x) => x.uid === m.uid);
  const el = document.createElement("div");
  el.className = "msg";
  el.innerHTML = ${esc(m.name || "Guest")}${esc(m.text)};
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

/ ================================================================= dialog /
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
BUG 4 FIXES — peer-to-peer WebRTC, handshake relayed through the room's
database node. Four repairs:

 - onSignal() no longer drops signals when our mic is off. Previously a
   mic-off user could never answer an offer, so they heard nothing at all.
 - syncPeers() offer arbitration now handles mixed mic on/off pairs: the
   broadcaster always offers to a non-broadcaster; the uid tiebreak only
   applies when BOTH are broadcasting. Before, a broadcaster with the
   higher uid and a mic-off partner meant nobody ever made the offer.
 - ensurePeer() attaches tracks and renegotiates when the mic is turned on
   after the peer already existed (previously audio stayed one-way).
 - stopVoice() rebuilds receive-only peers to anyone still broadcasting,
   instead of leaving you deaf until the presence round-trip.
======================================================================== */
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
  push(ref(db, rooms/${R.room}/sig/${to}), { from: R.uid, data }).catch(() => {});

$("#micBtn").onclick = () => (VOICE.on ? stopVoice() : startVoice());

async function startVoice() {
  try {
    VOICE.stream = await navigator.mediaDevices.getUserMedia({
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
  /* BUG 4 FIX: dropPeer tore down every connection including receive-only
  ones for members still broadcasting — rebuild those immediately rather
  than waiting on the presence round-trip through Firebase. */
  syncPeers();
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
  // Mic on  -> connect to everyone (send + receive).
  // Mic off -> still create receive-only peers for broadcasting members.
  const want = new Set(
    R.members
      .filter((m) => m.uid !== R.uid && (VOICE.on || m.voice))
      .map((m) => m.uid)
  );
  for (const uid of [...VOICE.peers.keys()]) if (!want.has(uid)) dropPeer(uid);
  for (const uid of want) {
    const other = R.members.find((m) => m.uid === uid);
    /* Offer arbitration. Both broadcasting -> the lower uid offers.
    When only WE are broadcasting we must offer regardless of uid order,
    otherwise a mic-off pair with the broadcaster holding the higher uid
    never connects at all. */
    ensurePeer(uid, VOICE.on && (other?.voice ? R.uid  s.track));
      let added = false;
      for (const t of VOICE.stream.getTracks()) {
        if (!already.has(t)) { p.pc.addTrack(t, VOICE.stream); added = true; }
      }
      if (added) {
        const otherVoice = R.members.find((m) => m.uid === uid)?.voice;
        // We're the (new) broadcaster: renegotiate ourselves unless the
        // other side is also broadcasting with the lower uid.
        if (!otherVoice || R.uid  e.candidate && signal(uid, { ice: e.candidate.toJSON() });
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
  // mayOffer already encodes the arbitration decision from syncPeers().
  if (mayOffer) makeOffer(uid);
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
  /* BUG 4 FIX: the guard used to be if (!VOICE.on || !d) return;, which
  threw away every offer arriving at a mic-off user. Signals can only be
  written to our own sig node by authenticated room members, so accepting
  them while muted is safe — worst case we finish a receive-only
  connection, which is exactly the point. */
  if (!d) return;
  const p = ensurePeer(from, false);
  try {
    if (d.sdp) {
      await p.pc.setRemoteDescription(d.sdp);
      if (p.pendingIce.length) {
        for (const candidate of p.pendingIce.splice(0)) {
          try { await p.pc.addIceCandidate(candidate); } catch {}
        }
      }
      if (d.sdp.type === "offer") {
        await p.pc.setLocalDescription(await p.pc.createAnswer());
        signal(from, { sdp: p.pc.localDescription.toJSON() });
      }
    } else if (d.ice) {
      if (p.pc.remoteDescription) {
        await p.pc.addIceCandidate(d.ice);
      } else {
        p.pendingIce.push(d.ice);
      }
    }
  } catch { / a stale/invalid candidate should not kill the peer / }
}

function dropPeer(uid) {
  const p = VOICE.peers.get(uid);
  if (!p) return;
  try { p.pc.close(); } catch {}
  p.el.remove();
  VOICE.peers.delete(uid);
}

/ RMS off the raw waveform — cheap, and enough to tell talking from silence. /
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
  // Duck on the far side's voice only — ducking on yourself would fight
  // the echo canceller.
  if (VOICE.duck && peak > TALK) VOICE.duckUntil = Date.now() + 700;
  if (!PL.isMuted()) {
    PL.setVol(VOICE.duck && Date.now()  TALK);
    const dot = $(".lvl", row);
    if (dot) dot.style.transform = scale(${1 + clamp(lvl * 22, 0, 4)});
  }
}, 120);

$("#duck").onclick = (e) => {
  VOICE.duck = e.currentTarget.getAttribute("aria-pressed") !== "true";
  e.currentTarget.setAttribute("aria-pressed", String(VOICE.duck));
  if (!VOICE.duck && !PL.isMuted()) PL.setVol(LOOK.vol);
};
paintMic();

/* ====================================================== optional library
Only live if CFG.API points at a deployed Cloudflare Worker.
======================================================================== */
let LIB = [];

const mediaUrl = (key) => {
  if (/^https?:\/\//i.test(key)) return key;      // shelf entries carry full URLs
  const path = String(key).split("/").map(encodeURIComponent).join("/");
  return CFG.MEDIA ? ${CFG.MEDIA.replace(/\/$/, "")}/${path} : ${CFG.API}/media/${path};
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
      (t.poster ? 
        : ) +
      ${esc(t.title)} +
      ${t.sources.map((s) => s.label).join(" · ")} +
      (t.subtitles.length ? · ${t.subtitles.length} CC : "") +
      · ${fmtSize(t.bytes)}${progBarFor({ kind: "r2", ref: t.sources[0].key })};
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
  if (!p || p.done || !p.dur || p.pos ;
}

function markLib() {
  const cur = R.state?.ref || "";
  const slug = R.state?.kind === "r2" ? String(cur).split("/")[1] : null;
  $$(".title-card").forEach((c) => {
    const r = c.dataset.ref || "";
    c.classList.toggle("on", r === cur || (!!slug && r.includes(/${slug}/)));
  });
}

function drawQuals() {
  const box = $("#quals");
  box.innerHTML = "";
  const s = R.state;
  if (s?.kind === "hls") {
    const levels = R.hls?.levels;
    if (!R.hls || !levels || levels.length ${R.hls ? "One quality in this stream." : "Loading stream…"};
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
      box.appendChild(mk(lv.height ? ${lv.height}p : ${Math.round(lv.bitrate / 1000)}kbps, i, cur === i));
    });
    return;
  }
  if (!s || s.kind !== "r2") {
    box.innerHTML = ${s?.kind === "yt" ? "YouTube picks its own quality per viewer." : "One version of this source."};
    return;
  }
  const t = LIB.find((x) => x.sources.some((q) => q.key === s.ref));
  if (!t || t.sources.length Only one version of this title.;
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
Chunked, because Cloudflare caps a request body at 100 MB and films are not.
======================================================================== */
/ BUG 3 FIX: guarded token read. /
const UP = {
  token: (() => { try { return localStorage.wtUpToken || ""; } catch { return ""; } })(),
  size: 24  1024  1024,
  busy: 0,
};
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
srcPane.addEventListener("dragleave", () => { if (--dragDepth  {
  e.preventDefault();
  dragDepth = 0;
  dropBox.classList.remove("on");
  takeFiles([...e.dataTransfer.files]);
});

async function takeFiles(files) {
  if (!files.length) return;
  // A dropped subtitle is used directly, whatever the source is.
  if (files.every((f) => SUB_RE.test(f.name))) {
    const cues = parseSubs(await files[0].text());
    if (!cues.length) return say("Couldn't read any cues out of that file.");
    R.localSub = { label: files[0].name.replace(/\.[^.]+$/, "").slice(0, 24), cues };
    pickTrack("local");
    return say(Loaded ${cues.length} subtitle cues);
  }
  // A dropped video with no library configured plays locally.
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
    try { UP.token = localStorage.wtUpToken = t; } catch { UP.token = t; }   // BUG 3 FIX
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
    const m = f.name.match(/.-[.-]/i);
    return library/${slug}/subs.${(m ? m[1] : "en").toLowerCase()}.${ext};
  }
  if (f.type.startsWith("image/")) return library/${slug}/poster.${ext};
  const q = f.name.match(/(\d{3,4})p/);
  return library/${slug}/video-${q ? q[1] + "p" : "Original"}.${ext};
}

function uploadRow(name) {
  const el = document.createElement("div");
  el.className = "up";
  el.innerHTML = ${esc(name)}0%;
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
    if (file.size  ({}))).error || HTTP ${r.status});
      row.pct(1);
    } else {
      const { uploadId, partSize } = await upJSON("POST", "/upload/start", { key, contentType: file.type });
      UP.size = partSize || UP.size;
      const total = Math.ceil(file.size / UP.size);
      const parts = new Array(total);
      let next = 0, finished = 0;
      const pump = async () => {
        for (let i = next++; i  {});
        throw e;
      }
      await upJSON("POST", "/upload/finish", { key, uploadId, parts });
    }
    row.done();
  } catch (e) {
    row.fail(e.message || e);
    say(${file.name} failed: ${e.message || e});
  } finally {
    if (--UP.busy === 0) setTimeout(loadLibrary, 400);
  }
}

/ A dropped connection mid-film shouldn't cost you the whole upload. /
async function putPart(key, uploadId, n, blob, attempt = 1) {
  const url = ${CFG.API}/upload/part?key=${encodeURIComponent(key)} +
    &uploadId=${encodeURIComponent(uploadId)}&part=${n};
  try {
    const r = await fetch(url, { method: "PUT", headers: authHeaders(), body: blob });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || HTTP ${r.status});
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
  if (!r.ok) throw new Error(data.error || HTTP ${r.status});
  return data;
}

addEventListener("beforeunload", () => {
  if (VOICE.on) stopVoice();
  if (LOCAL.url) URL.revokeObjectURL(LOCAL.url);
  if (R.refs.me) remove(R.refs.me);
});


/* ========================================================================
   PARITY PATCH — paste these into the fixed app.js if you want it to
   contain everything the old 4200-line file had.
   All three are legacy/dead code (nothing calls them), so the app runs
   identically with or without them.
   ======================================================================== */

/ 1) INSERT after fetchJikanEpisodes(), before fetchTmdbArt() ----------- /
async function fetchLibraryArtworkFallback(series) {
  const key = fallback:${String(series.imdbId || series.name || series.id || "").toLowerCase()};
  if (!key.slice(9)) return null;
  if (TMDBINFLIGHT.has(key)) return TMDBINFLIGHT.get(key);
  const req = (async () => {
    try {
      const p = new URLSearchParams({ title: series.name || "" });
      if (series.imdbId) p.set("imdbId", series.imdbId);
      p.set("type", mediaTypeOf(series) === "movie" ? "movie" : "tv");
      const r = await fetch(/api/tmdb?fallback=1&${p.toString()});
      const data = await r.json().catch(() => ({}));
      return data?.ok ? data : null;
    } catch { return null; }
    finally { TMDB_INFLIGHT.delete(key); }
  })();
  TMDB_INFLIGHT.set(key, req);
  return req;
}

/ 2) INSERT after localEpisodesForSeason(), before openLibraryDetail() --- /
function renderInlineEpisode(series, ep, tmdbEp) {
  const wrap = document.createElement("article");
  wrap.className = "inline-episode";
  const still = document.createElement("div");
  still.className = "inline-episode-still";
  setBackgroundWithFallback(still, episodeStillUrl(tmdbEp, "w300"));
  const copy = document.createElement("div");
  copy.className = "inline-episode-copy";
  const n = tmdbEp?.episodeNumber ?? ep?.episodeNumber;
  const title = tmdbEp?.name || ep?.title || Episode ${n || ""};
  const rating = tmdbEp?.rating != null ? ★ ${Number(tmdbEp.rating).toFixed(1)} : "";
  const date = tmdbEp?.airDate
    ? new Date(tmdbEp.airDate + "T00:00:00").toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "";
  const meta = [E${String(n || "").padStart(2, "0")}, rating, date,
    tmdbEp?.runtime ? fmtRuntime(tmdbEp.runtime) : ""].filter(Boolean).join(" · ");
  copy.innerHTML =
    ${esc(title)} +
    ${esc(meta)} +
    ${esc(tmdbEp?.overview || ep?.episodeSummary || "")};
  const actions = document.createElement("div");
  actions.className = "inline-episode-actions";
  const watch = document.createElement("button");
  watch.type = "button"; watch.className = "btn primary";
  watch.textContent = ep?.url ? "▶ Watch" : "Add link";
  watch.onclick = () => ep?.url ? watchLibraryEpisode(series, ep) : openLibraryForm(series.name);
  const edit = document.createElement("button");
  edit.type = "button"; edit.className = "btn ghost"; edit.textContent = "Edit";
  edit.onclick = () => openEpisodeEdit(series, ep);
  actions.append(watch, edit);
  copy.appendChild(actions);
  wrap.append(still, copy);
  return wrap;
}

/* 3) INSERT right after renderInlineEpisode() ----------------------------
   NOTE: the return openLibraryDetail(series); on the second line is
   intentional and was already there in the old file — everything below it
   is unreachable legacy inline expansion, kept only for parity. */
async function openInlineSeries(series) {
  // Legacy inline expansion is intentionally disabled; the library now uses
  // one consistent centered detail modal for movies and series.
  return openLibraryDetail(series);

  const panel = $("#libraryInlineExpand");
  if (!panel) return openLibraryDetail(series);
  if (panel.dataset.seriesId === String(series.id) && !panel.hidden) {
    panel.hidden = true; panel.innerHTML = ""; panel.dataset.seriesId = "";
    return;
  }
  panel.dataset.seriesId = String(series.id);
  panel.hidden = false;
  requestAnimationFrame(() => panel.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  const art = tmdbArt(series);
  const genres = (art?.genres || []).map((g) => g.name).filter(Boolean).join(" · ");
  const cast = (art?.credits?.cast || []).slice(0, 5).map((c) => c.name).filter(Boolean).join(", ");
  panel.innerHTML =
     +
    ${esc(art?.title || series.name || "Series")} +
    ${tmdbRichMeta(series).map((x) => ${esc(x)}).join("")} +
    ${esc(art?.overview || series.summary || "No synopsis available.")} +
    (genres ? ${esc(genres)} : "") +
    (cast ? Cast: ${esc(cast)} : "") +
     +
    Loading seasons… +
    Loading…;
  setBackgroundWithFallback(panel.querySelector("#inlineExpandHero"), backdropUrl(art));
  const tabs = panel.querySelector("#inlineSeasonTabs");
  const content = panel.querySelector("#inlineSeasonContent");
  const seasons = seasonNumbers(series);
  if (!seasons.length) {
    content.innerHTML = 'No seasons found for this series yet. Add an episode with a season number.';
    tabs.innerHTML = "";
    return;
  }
  tabs.innerHTML = "";
  const renderSeason = async (season) => {
    tabs.querySelectorAll(".season-tab").forEach((b) =>
      b.classList.toggle("active", Number(b.dataset.season) === Number(season)));
    content.innerHTML = 'Loading season details and episode ratings…';
    const tmdbSeason = await fetchTmdbSeason(series, season);
    let local = localEpisodesForSeason(series, season);
    if (Number(season) === 1 && local.length  Number(e.seasonNumber))
        .filter((n) => Number.isInteger(n) && n > 0);
      if (new Set(explicitSeasons).size  e.seasonNumber == null);
        local = [...local, ...unnumbered].sort((a, b) => (a.episodeNumber || 9999) - (b.episodeNumber || 9999));
      }
    }
    const tmdbEpisodes = tmdbSeason?.episodes || [];
    const merged = [];
    const max = Math.max(local.length, tmdbEpisodes.length);
    for (let i = 0; i  Number(x.episodeNumber) === Number(te?.episodeNumber)) || local[i];
      if (le || te) merged.push({ local: le, tmdb: te });
    }
    const seasonInfo = (tmdbArt(series)?.seasons || []).find((s) => Number(s.seasonNumber) === Number(season));
    const sr = tmdbSeason?.rating ?? seasonInfo?.rating;
    const sv = tmdbSeason?.voteCount ?? seasonInfo?.voteCount;
    content.innerHTML =
      ${esc(tmdbSeason?.name || Season ${season})} +
      ${[
        tmdbSeason?.episodeCount ? ${tmdbSeason.episodeCount} episodes : "",
        sr != null ? ★ ${Number(sr).toFixed(1)} season rating : "",
        sv ? ${Number(sv).toLocaleString()} votes : "",
      ].filter(Boolean).join(" · ")};
    const grid = content.querySelector(".inline-episodes");
    for (const item of merged) grid.appendChild(renderInlineEpisode(series, item.local, item.tmdb));
    if (!merged.length) grid.innerHTML = 'No episodes found for this season.';
  };
  seasons.forEach((season) => {
    const meta = (art?.seasons || []).find((s) => Number(s.seasonNumber) === season);
    const b = document.createElement("button");
    b.type = "button"; b.className = "season-tab"; b.dataset.season = season;
    b.innerHTML = Season ${season}${meta?.episodeCount || localEpisodesForSeason(series, season).length || 0} eps${meta?.rating != null ?  · ★ ${Number(meta.rating).toFixed(1)} : ""};
    b.onclick = () => renderSeason(season);
    tabs.appendChild(b);
  });
  await renderSeason(seasons[0]);
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
