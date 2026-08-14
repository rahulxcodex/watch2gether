# Where to upload your video

The app plays from anywhere that serves a video file over HTTPS. This is the
short version of which "anywhere" is worth using.

| | Free storage | Free bandwidth | Upload from | Catch |
|---|---|---|---|---|
| **Cloudflare R2** | 10 GB | **unlimited, forever** | the app itself | needs the Worker deployed once |
| **Internet Archive** | **unlimited** | unlimited | archive.org web form | public library; only for material you may publish |
| **Backblaze B2** | 10 GB | 3× stored/day | B2 web form | must set a CORS rule for subtitles |
| **Supabase Storage** | 1 GB | 5 GB/month | Supabase dashboard | ~one film; project sleeps when idle |
| **YouTube (unlisted)** | unlimited | unlimited | youtube.com | Content ID; no custom subtitle styling |
| Firebase Storage | — | — | — | **needs a card since Feb 2026** |
| Firebase Hosting | 10 GB | 360 MB/**day** | — | about one viewing per day |

Whichever you pick, paste the resulting link into the app, press **Play**, then
**Save to shelf**. It stays in the room for both of you from then on, so nobody
has to find it twice. The shelf doesn't care where the file lives — you can mix
all of these in one room.

---

## Cloudflare R2 — the one to use for your own files

Ten gigabytes, and no charge for bandwidth ever. That second part is the whole
reason: most hosts give you storage cheaply and then bill you for every viewing.
Ten gigabytes is roughly 19 hours at 720p.

The app uploads to it directly — drag a file onto the Source panel and it goes up
in 24 MB chunks with a progress bar, because Cloudflare caps a request body at
100 MB and films are not that.

It needs the small Worker in `worker/` deployed once. **You don't need to install
anything** — see DEPLOY.md Part 4 for the dashboard route, or push to GitHub and
let `.github/workflows/worker.yml` do it.

## Internet Archive — unlimited, with a condition

Genuinely unlimited, genuinely free, and it has been since 1996. Upload at
[archive.org/create](https://archive.org/create) with a free account.

Then paste the item link — `archive.org/details/whatever` — straight into the
app. It reads the item's file list, picks the best browser-playable copy
(preferring full-quality H.264 over the low-bitrate derivative), and pulls in any
VTT or SRT subtitles sitting alongside it.

**The condition matters.** This is a public library, not a private drive. Anyone
can find and watch what you put there, and uploading material you don't hold the
rights to breaches their terms and gets removed. It's the right home for your own
footage, public-domain film, and openly licensed work — and the wrong home for a
rip of something commercial.

If the metadata lookup fails — that call is the only part needing CORS
permission, and the Archive's headers have been inconsistent over the years —
open the item, copy the MP4 link under **Download Options**, and paste that
instead. Playback itself never needs CORS.

## Backblaze B2

10 GB stored, and free downloads up to three times your stored amount each day.
Make the bucket public, upload through the web form, and use the "Friendly URL".

Add a CORS rule if you want subtitle files to load
(`b2_download_file_by_name`, origin `*`). Video playback works without one.

## Supabase Storage

1 GB is about one film, so it's really for short things. Create a public bucket,
upload in the dashboard, copy the public URL. Free projects pause after a week
of inactivity and need waking from the dashboard.

## YouTube, unlisted

Costs nothing, streams anywhere, adapts quality to whoever's watching, and needs
no setup at all — paste the link and go.

Two things you give up: Content ID still scans unlisted uploads, and YouTube's
own captions can't be restyled from outside. Drop an `.srt` onto the Source panel
and the app's own subtitle rendering takes over, which gets that second one back.

---

## Encoding, whichever host you choose

One flag decides whether playback starts in a second or after the entire file
downloads:

```bash
ffmpeg -i in.mkv -vf scale=-2:720 \
  -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ac 2 \
  -movflags +faststart out.mp4
```

`+faststart` moves the index to the front of the file. Without it the browser
must fetch the whole thing before it can show frame one.

Raise `-crf` to trade quality for size — 23 is visually clean, 26 is noticeably
smaller and still fine on a laptop. Stick to **H.264 in MP4**: Chrome won't play
H.265, and most MKV files need remuxing at minimum.

`tools/prep.sh` does all of this plus a poster and embedded-subtitle extraction
in one command, if you'd rather not remember the flags.

## A note on what you upload

Self-hosting doesn't make the copyright question go away — it moves it from a
platform's filter onto you, and onto whichever host's terms you've agreed to.
Fine for your own footage, licensed material, and public-domain film. Worth being
deliberate about beyond that, and worth knowing that **local file mode** exists
precisely so that watching something together never requires uploading it
anywhere at all.
