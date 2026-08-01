# Parallel

A room where two people watch the same thing at the same time, kept within a few
frames of each other.

```
  Vercel / GitHub Pages ──── the page       static, free
  Firebase Realtime DB  ──── the room       free, no card
  YouTube · your disk   ──── the video      nothing to host
```

No server of ours anywhere in it. Setup is in **[DEPLOY.md](DEPLOY.md)**.

---

## What it does

**Sync.** The room agrees on four numbers — position, the server timestamp that
position was true at, speed, and whether the clock is running. Every client
derives its own target from those, so nobody is following anybody.

Firebase publishes `.info/serverTimeOffset`: the measured gap between this
device's clock and its servers'. That single number carries the whole scheme,
and it keeps correcting itself as the connection wanders. A laptop three seconds
out of step still lands within milliseconds.

Drift is corrected by leaning on playback speed rather than seeking. Under 120ms
nothing happens; beyond that playback runs up to 14% fast or slow until the gap
closes — inaudible, and it absorbs a one-second stall in about six seconds. Past
1.5s it gives up and seeks. You almost never see the picture jump.

**Three kinds of source, one player.**

- **YouTube** — paste any link: `watch?v=`, `youtu.be`, `/shorts/`, `/embed/`,
  `/live/`, a bare video ID, with or without a `?t=` timestamp. YouTube's own
  controls are hidden so speed, subtitles and the drift ribbon behave the same
  as everywhere else. Its bandwidth, not yours.
- **A local file** — both people open their own copy and the room syncs the
  playhead. Nothing is uploaded, nothing is stored, and file size stops
  mattering. This is the one that removes storage from the problem entirely.
- **Anything you've uploaded somewhere** — Cloudflare R2, Internet Archive,
  Backblaze, Supabase, or any HTTPS link to a video file. Paste an
  `archive.org/details/…` item and the app reads its file list, picks the best
  browser-playable copy, and pulls in any subtitles sitting beside it.

**The shelf** is what makes uploading worth it. Save any link and it stays in the
room for both of you, so nobody hunts for it twice. It doesn't care which host a
title lives on — mix R2, the Archive and YouTube in one list.
**[HOSTING.md](HOSTING.md)** compares the free options; R2 is the pick for your
own files at 10 GB with no bandwidth charge ever, and the app uploads to it
directly in 24 MB chunks.

YouTube can only be driven at fixed speeds, so drift there is corrected by
seeking with a wider deadband rather than by easing the rate. Everything else
behaves identically across the three.

**Subtitles** are parsed and drawn by the app rather than handed to a `<track>`
element — native cue styling is limited, inconsistent, and doesn't exist at all
over a YouTube iframe. SRT, WebVTT and basic ASS all work. Size, colour, backdrop,
typeface, edge, height, width, and a ±0.1s timing nudge. Drop an `.srt` on the
panel and it applies to whatever's playing, YouTube included.

Appearance and timing are per-person; what's playing, where, and how fast is
shared.

**Voice chat** is peer-to-peer over WebRTC, with the handshake relayed through
the room's own database node. No media server, nothing added to the bill. The
film ducks to a quarter volume while the other person talks.

**It remembers where you got to**, per title rather than per file, so switching
quality mid-film keeps your place. The last ninety seconds count as finished.

**The strip above the scrubber** shows both playheads. In sync they overlap.
When someone stalls they separate, a dashed line spans the gap with the distance
in milliseconds, and a ring pings when they come back together.

---

## Using it

Open the page, pick a name, send the other person the link. Whoever arrives first
is host; anyone can drive unless the host turns on **Host controls only**.

```
space / k     play, pause          ← →     5s      (shift: 30s)
f             fullscreen           j / l   10s
c             subtitles            [ ]     subtitle timing ±0.1s
m             mute                 ↑ ↓     volume
s             snap back into sync
```

**Room codes are the only lock.** Anyone can sign in anonymously, so a code is
what gets someone into a room. Use the generated ones — `amber-thistle-4k2p` is
a hundred million times harder to guess than two words alone.

---

## Files

```
web/index.html              markup and styles
web/app.js                  everything else
web/config.js               the only file you edit
HOSTING.md                  where to upload, and what each host costs
firebase/database.rules.json  publish these before sharing the link
.github/workflows/pages.yml   GitHub Pages deploy
worker/                     optional: a private R2 library
tools/prep.sh               optional: transcode + upload helper
```

---

## Uploading your own files

See **[HOSTING.md](HOSTING.md)**. Short version: Cloudflare R2 for anything
private (10 GB, no bandwidth charge, uploads from inside the app), Internet
Archive for anything you're allowed to publish (unlimited), unlisted YouTube if
you want zero setup.

Firebase can't host video — Cloud Storage requires the Blaze plan and a linked
card since February 2026, and Firebase Hosting allows 360 MB of transfer a day.

The R2 Worker deploys from GitHub Actions, so there's still nothing to install.

---

## Where to take it next

Video alongside the voice chat is a two-line change to the `getUserMedia`
constraints and one more element to render into. Beyond that: a synced queue so
you can line up several things, and `?list=` playlist support for YouTube.
