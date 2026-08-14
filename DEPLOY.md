# Deploying Parallel

Nothing runs on your machine and nothing runs on a server you rent. The page is
static files; the room is a few dozen bytes of JSON in Firebase that both
browsers subscribe to.

```
  Vercel / GitHub Pages ──── the page (static, free, unlimited-ish)
  Firebase Realtime DB  ──── the room: who's here, what's playing, where
  YouTube / your disk   ──── the video itself
```

Two of those are free permanently. The third is a file you already have.

---

## Part 1 — Firebase (about 10 minutes)

You already have a project: **watch2gether-41847**. Four things to switch on.

### 1.1 Create the Realtime Database

Not Firestore. Firestore bills per document read, and a once-a-second heartbeat
would burn through its 50,000/day allowance before lunch. Realtime Database
charges by bytes transferred instead, and this app moves very few.

Firebase console → **Build → Realtime Database → Create Database**. Pick a
region, and choose **Start in locked mode** — you're about to publish rules that
open exactly the right doors.

Copy the URL at the top of that page. It looks like:

```
https://watch2gether-41847-default-rtdb.firebaseio.com
```

or, outside the US, `…-default-rtdb.europe-west1.firebasedatabase.app`.

Paste it into `databaseURL` in `web/config.js`. Your original config snippet
didn't have this field — Firebase only adds it once a database exists, which is
how I know this step hasn't been done yet.

### 1.2 Publish the security rules

**Do this before you share the link with anyone.**

Realtime Database → **Rules** → paste the contents of
`firebase/database.rules.json` → **Publish**.

This is the part that matters. Your `apiKey` is not a secret — Google
[documents it as safe to publish](https://firebase.google.com/docs/projects/api-keys),
and it's visible to anyone who opens the page. It identifies your project; it
doesn't grant access to it. The rules are what grant access. Ship with the
default open rules and anyone who views source can read and rewrite your entire
database.

The rules included here mean: you must be signed in, you can't list rooms, you
can only edit your own presence entry, and you can't read anyone else's voice-chat
signalling.

### 1.3 Enable anonymous sign-in

**Authentication → Sign-in method → Anonymous → Enable.**

Nobody makes an account; each browser gets a throwaway identity so the rules have
something to check. Without this, joining fails with `admin-restricted-operation`
and the app will tell you so.

### 1.4 Authorise your domains

**Authentication → Settings → Authorized domains → Add domain.**

Add whichever you end up using:

```
your-project.vercel.app
your-username.github.io
```

`localhost` is there already. Skip this and sign-in fails on the deployed site
while working perfectly on your machine — a confusing half-hour if you don't
know to look here.

---

## Part 2 — the page

Put the repo on GitHub first. Both options deploy straight from it, and neither
needs anything installed locally.

### Option A — Vercel

1. [vercel.com](https://vercel.com) → sign in with GitHub → **Add New → Project**
2. Pick the repo
3. **Root Directory → `web`** — the one setting that isn't automatic
4. Framework preset: **Other**. No build command, no output directory.
5. **Deploy**

You get `your-project.vercel.app`. Every push to `main` redeploys. Add that
domain to Firebase's authorised list (1.4) and you're done.

### Option B — GitHub Pages

The workflow in `.github/workflows/pages.yml` is already set up.

1. Push to `main`
2. Repo → **Settings → Pages → Source: GitHub Actions**
3. Wait for the green tick under **Actions**

You get `your-username.github.io/repo-name/`. The app uses relative paths, so a
subdirectory is fine.

**Both are free.** Vercel gives a cleaner URL and instant redeploys; GitHub Pages
keeps everything in one place. Vercel's free tier is for non-commercial use.

### A note on GitHub

`config.js` contains your Firebase config, and a public repo publishes it. That
is genuinely fine — see 1.2 — but it only stays fine while the rules are right.
If that makes you uneasy, make the repo private. GitHub Pages needs a paid plan
for private repos; Vercel deploys private repos on the free tier.

---

## Part 3 — check it works

Open the page in two different browsers, not two tabs — tabs share a microphone
and you couldn't tell the two playheads apart. A normal window and a private
window is enough.

Join the same room code in both, paste a YouTube link, and watch the strip above
the scrubber: two marks sitting on top of each other. Pause one and they
separate, with the gap in milliseconds. Let it go and they slide back together.

Then try **Open a local file** in both, pointing at the same film. That's the one
with no storage cost at all.

---

## Part 4 — optional: a private library

Everything above works without this. Add it only if you want a shelf of your own
files that both of you can pick from without hunting for them on disk.

Firebase can't host the video. Cloud Storage for Firebase
[requires the Blaze plan and a linked card](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)
as of 3 February 2026, even at zero usage, and Firebase Hosting allows 360 MB of
transfer a day — about one viewing.

The quickest no-setup route is different: upload to
[archive.org/create](https://archive.org/create) or as an unlisted YouTube video,
paste the link into the app, and press **Save to shelf**. Nothing to deploy at
all. The trade-offs are in [HOSTING.md](HOSTING.md).

Cloudflare R2 is the free option that still exists: 10 GB, and no egress charge
ever. The `worker/` folder holds a Worker that lists the bucket and handles
chunked uploads. **[HOSTING.md](HOSTING.md)** compares this against the
alternatives.

Full walkthrough with troubleshooting: **[CLOUDFLARE.md](CLOUDFLARE.md)**. The
short version, with nothing installed on your machine:

1. **Cloudflare dashboard → R2 → Create bucket**, name it `watchtogether-media`.
2. **My Profile → API Tokens → Create Token → "Edit Cloudflare Workers"**. Copy it.
3. Grab your account ID from the **Workers & Pages** overview page.
4. GitHub repo → **Settings → Secrets and variables → Actions**, add three:
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `UPLOAD_TOKEN`
   (any long random string — it's what gates uploading).
5. Push. `.github/workflows/worker.yml` deploys it and prints the URL in the
   Actions log.

Put that URL in `CFG.API` in `web/config.js`. An **Upload** button appears beside
the shelf, and drag-and-drop starts working. Set `ALLOW_ORIGIN` in
`worker/wrangler.toml` to your Vercel or Pages URL and push again.

---

## What this costs

| | Free allowance | What that means here |
|---|---|---|
| Realtime Database | 10 GB/month transfer | Roughly 20,000 hours of watching. |
| | 1 GB stored | A room is about 2 KB. |
| | 100 concurrent connections | 50 pairs watching at once. |
| Authentication | unlimited anonymous | — |
| Vercel | 100 GB/month | The page is ~90 KB. |
| GitHub Pages | 100 GB/month | Same. |
| Voice chat | — | Peer-to-peer. Never touches a server. |
| YouTube | — | Their bandwidth, not yours. |
| Local files | — | Never leaves either machine. |

Spark has no billing attached at all: if a quota runs out the service stops
answering until it resets. It cannot produce a bill. That's worth more than the
headroom.

---

## Voice chat and NAT

Voice is peer-to-peer, with the handshake relayed through the room's database
node — no media server, nothing extra to deploy. It finds a path using public
STUN servers.

Most connections work. Roughly one in ten — both people behind symmetric NAT,
which some mobile and corporate networks do — needs a relay, and you'll see
"Voice couldn't get through". [Cloudflare Calls](https://developers.cloudflare.com/calls/turn/)
has a free TURN allowance. With credentials in hand, from the browser console:

```js
localStorage.wtTurn = JSON.stringify({
  urls: "turn:turn.cloudflare.com:3478",
  username: "...", credential: "..."
});
```

Reload. Nothing else in the app is affected either way.

---

## When something's wrong

| What you see | What it usually is |
|---|---|
| "config.js has no databaseURL" | Step 1.1 |
| "Anonymous sign-in is switched off" | Step 1.3 |
| Sign-in works locally, fails when deployed | Step 1.4 — domain not authorised |
| `PERMISSION_DENIED` in the console | Rules not published, or published to the wrong database |
| "Firebase SDK wouldn't load" | Set `sdkVersion` in config.js to a current release |
| Nothing syncs, no errors | Two different room codes, or two different Firebase projects |
| "The owner has disabled embedding" | That video only plays on YouTube. Nothing to fix. |
| YouTube player never appears | An ad blocker is blocking `iframe_api` |
| A direct video URL won't load | The host may block hotlinking, or it isn't H.264/MP4 |
| An archive.org item won't resolve | Copy the MP4 link under Download Options and paste that |
| Subtitles from a URL won't load | Fetching them needs CORS; drop the .srt on the panel instead |
| Voice connects then drops | Symmetric NAT — see above |
| Blank page, console says module error | `file://` won't run ES modules. Use a real URL, or `npx serve web` |


## Episode metadata and subtitle lookup (Gemini free tier)

The landing-page library can automatically identify anime episodes and search the web for a direct English subtitle file. The browser never receives the Gemini API key.

This uses Google's Gemini API (Google AI Studio), which has a genuinely free tier — no credit card, no billing setup. This app calls the `gemini-flash-latest` alias rather than a dated model ID, since Google has been retiring/renaming Flash model IDs faster than expected — sometimes returning 404s before a model's documented shutdown date. The alias always resolves to whatever the current stable Flash model is, so you shouldn't need to touch this again. Actual RPM/RPD limits vary by whichever model the alias currently points to — check your project's live limits at https://aistudio.google.com/app/usage or https://ai.google.dev/gemini-api/docs/rate-limits. Google Search grounding also gets its own separate free monthly allowance on top of the base model quota. Get a key at https://aistudio.google.com/apikey.

In Vercel, add an Environment Variable named `GEMINI_API_KEY` with your Gemini API key. Enable it for the environments you deploy to (at minimum Production; Preview too if you test preview deployments). Redeploy after adding or changing the variable.

The Vercel function is `web/api/identify.js` and calls Gemini's `generateContent` API in two steps, both on the `gemini-flash-latest` alias (set via the `MODEL` constant at the top of the file): a grounded research pass using the built-in `google_search` tool, then a structuring pass using a `responseSchema` to produce the strict JSON shape the UI expects (the current Flash generation doesn't reliably support search grounding and schema-constrained output in the same call). If Gemini cannot confidently identify an episode or cannot find a reliable direct subtitle file, the episode is still added without that metadata/subtitle. If you hit HTTP 429, check your project's live usage dashboard at https://aistudio.google.com/app/usage — it shows actual RPM/TPM/RPD limits and consumption for whatever model the alias currently resolves to, which is more reliable than any third-party blog's numbers. If you see HTTP 404 errors mixed in, that generally means the underlying model behind the alias isn't yet enabled for your account/region — try regenerating the API key in a fresh AI Studio project (Project → Settings → Environment Variables in Vercel to update `GEMINI_API_KEY` afterward).


---

## Part 5 — Anime library metadata and subtitles

The landing page uses Gemini (free tier) for web-search research and
structured JSON output in one provider. It identifies the episode and finds
IMDb details; it does not search for subtitle downloads.

### 5.1 Vercel environment variable

Get a free Gemini API key at https://aistudio.google.com/apikey (no credit
card required).

Vercel → Project → Settings → Environment Variables:

```text
GEMINI_API_KEY=your-gemini-key
```

Enable it for Production (and Preview if desired). Never put the Gemini key
in `web/config.js` or `web/app.js`.

### 5.2 Add an episode

From the landing page:

1. Enter the series name.
2. Paste the episode M3U8/video URL.
3. Optionally paste an English subtitle URL, OR upload an `.srt`, `.vtt`,
   `.ass`, or `.ssa` file (up to 2 MB).
4. Click **Analyze & add**.

Groq fills season/episode, episode title, series year, series IMDb details,
episode IMDb details when available, and concise series/episode summaries.

The subtitle is supplied by you. If you paste a subtitle URL, `/api/subtitle`
fetches it server-side and the app stores the actual subtitle text locally.
Uploaded subtitles are stored the same way, so the episode does not depend on
the original subtitle URL continuing to exist.

### 5.3 Publish updated Firebase rules

The room state can carry saved subtitle text so another participant in the same
room can use it. The rules allow subtitle text up to 1.5 MB.

After updating the project:

```bash
firebase deploy --only database
```

or paste `firebase/database.rules.json` into Firebase Console → Realtime
Database → Rules → Publish.

## OpenSubtitles subtitle importer

The importer no longer scrapes `opensubtitles.org` pages. It accepts the legacy search URL the user pastes, reads the supplied IMDb ID, then searches and downloads subtitles through the official OpenSubtitles.com REST API. This avoids the legacy website's HTTP 403 blocking.

Add these Vercel environment variables:

- `OPENSUBTITLES_API_KEY` — API key from the user's OpenSubtitles.com developer/profile area.
- `OPENSUBTITLES_USERNAME` — OpenSubtitles username.
- `OPENSUBTITLES_PASSWORD` — OpenSubtitles password.

The credentials are server-side only and are never sent to the browser. The importer searches English episode subtitles season-by-season, picks the highest-scoring subtitle for each episode, asks the API for ASS first and SRT as a fallback, downloads the temporary URL server-side, and returns the subtitle text to Parallel for automatic SxxExx mapping.

OpenSubtitles currently documents an official REST API with authenticated login, structured `/subtitles` search and `/download` endpoints. Download calls consume the account's subtitle quota, so the importer reports the remaining quota and does not intentionally download multiple variants for the same episode.

## Minimal LLM metadata + fallback providers

The metadata endpoint now uses a **single compact LLM call at most**. Before calling an LLM it fetches the supplied IMDb page and extracts a small JSON-LD payload locally. If the URL/playlist already contains an `SxxEyy` code and IMDb identifies the title, no LLM call is made at all.

Provider order defaults to:

`Gemini → Grok → OpenRouter`

Configure these Vercel environment variables as needed:

```text
GEMINI_API_KEY=...
XAI_API_KEY=...
OPENROUTER_API_KEY=...
```

Optional model/provider settings:

```text
LLM_PROVIDER_ORDER=gemini,grok,openrouter
GEMINI_MODEL=gemini-flash-latest
GROK_MODEL=grok-4.5
OPENROUTER_MODEL=openrouter/auto
OPENROUTER_HTTP_REFERER=https://your-domain.example
```

You can use any subset. For example, if Gemini is causing rate/token problems, set:

```text
LLM_PROVIDER_ORDER=grok,openrouter,gemini
```

The endpoint deliberately avoids Gemini web-search grounding and the old two-request research + JSON pipeline. Output is capped to a small JSON payload and summaries are limited to 180 characters at prompt level. The app also limits genres and metadata strings before saving them.

Keep all provider keys in Vercel Environment Variables. Never put them in `web/config.js` or browser JavaScript.

## Series/movie name -> IMDb ID autocomplete (no LLM)

While adding a series or movie to the library, typing its name shows a
dropdown of matching titles (poster, year, Movie/Series badge); picking one
fills in the IMDb ID field automatically. This is a plain title-database
lookup — `web/api/imdb-search.js` — and never calls an LLM.

It uses one of two providers:

1. **TMDB** (recommended) — official, documented, free API key.
2. **IMDb's public suggestion feed** — no key required, used automatically
   whenever `TMDB_API_KEY` is not set. This is the same endpoint imdb.com's
   own search box calls, but it's undocumented/unofficial, so treat it as a
   zero-setup fallback rather than something to depend on long-term.

### Get a free TMDB API key

1. Create a free account at https://www.themoviedb.org/signup.
2. Go to Settings → API (https://www.themoviedb.org/settings/api) and
   request an API key (choose "Developer", any hobby/app description works).
3. Copy the **API Key (v3 auth)** value — it's a plain key, not a bearer token.

### Add the Vercel environment variable

Vercel → Project → Settings → Environment Variables:

```text
TMDB_API_KEY=your-tmdb-v3-api-key
```

Enable it for Production (and Preview if desired), then redeploy. Never put
this key in `web/config.js` or browser JavaScript — it's only ever used
server-side, inside `web/api/imdb-search.js`.

Leave `TMDB_API_KEY` unset and the feature still works via the no-key IMDb
fallback — nothing else to configure.

### How it resolves an IMDb ID

- If the IMDb fallback is answering, each suggestion already carries its own
  `tt...` id directly, so picking one is instant.
- If TMDB is answering, the search step only returns TMDB's own numeric ids
  (TMDB doesn't return IMDb ids on `/search`). The app makes one extra call —
  `GET /api/imdb-search?resolve=1&tmdbId=...&mediaType=movie|tv`, wrapping
  TMDB's `/external_ids` endpoint — but only for the single title the user
  actually clicks, not for every row in the dropdown.

### Series vs. movies

Both providers distinguish TV series (including mini-series) from movies and
badge them accordingly in the dropdown. Picking a series always fills in the
**series-level** IMDb ID — exactly what the rest of the app already expects.
Season and episode numbers are unaffected; they're still entered per-episode
in the fields below, same as before.
