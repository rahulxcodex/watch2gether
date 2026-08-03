#!/usr/bin/env bash
# Turn any source file into the folder layout the app expects, then upload it.
#
#   ./prep.sh movie.mkv "The Third Man"
#   ./prep.sh movie.mkv "The Third Man" 480      # smaller, if you're tight on space
#
# Produces ./out/<slug>/ containing video-<H>p.mp4, poster.jpg and subs.<lang>.vtt,
# then pushes it to R2. Requires ffmpeg and wrangler.
set -euo pipefail

SRC=${1:?usage: prep.sh <file> <title> [height]}
TITLE=${2:?usage: prep.sh <file> <title> [height]}
H=${3:-720}
BUCKET=${BUCKET:-watchtogether-media}

slug=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]\+/-/g;s/^-//;s/-$//')
dir="out/$slug"
mkdir -p "$dir"
echo "→ $TITLE  ($slug, ${H}p)"

# -movflags +faststart moves the index to the front of the file. Without it the
# browser has to download the whole thing before it can show frame one.
ffmpeg -hide_banner -loglevel error -stats -i "$SRC" \
  -vf "scale=-2:$H" \
  -c:v libx264 -preset slow -crf 23 -profile:v high -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ac 2 \
  -movflags +faststart \
  -y "$dir/video-${H}p.mp4"

# Poster from 25% in — far enough past the titles to catch an actual frame.
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC" | cut -d. -f1)
ffmpeg -hide_banner -loglevel error -ss $((dur / 4)) -i "$SRC" \
  -vframes 1 -vf "scale=-2:600" -y "$dir/poster.jpg"

# Pull out any embedded subtitle tracks and convert them to WebVTT.
idx=0
while ffmpeg -hide_banner -loglevel error -i "$SRC" \
        -map "0:s:$idx" -c:s webvtt -y "$dir/.probe.vtt" 2>/dev/null; do
  lang=$(ffprobe -v error -select_streams "s:$idx" \
           -show_entries stream_tags=language -of csv=p=0 "$SRC" | head -1)
  lang=${lang:-und}
  mv "$dir/.probe.vtt" "$dir/subs.${lang:0:2}.vtt"
  echo "  subtitles: ${lang:0:2}"
  idx=$((idx + 1))
done
rm -f "$dir/.probe.vtt"

echo "→ uploading to r2://$BUCKET/library/$slug/"
for f in "$dir"/*; do
  wrangler r2 object put "$BUCKET/library/$slug/$(basename "$f")" --file "$f" --remote
done

echo "done — reload the app and it'll be in the library."
