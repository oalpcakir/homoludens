#!/bin/sh
# Rebuild the four CrazyGames preview videos. Takes about an hour on 2 cores (each frame is rendered at full size).
#   CHROME=/path/to/chromium sh src/platform/videos/make.sh [work-dir]
set -e
V=$(cd "$(dirname "$0")" && pwd); W=${1:-/tmp/hl-video-work}; mkdir -p "$W"; cd "$V"
[ -f "${FONTS:-/tmp/hl-video-fonts}/fonts.css" ] || sh fonts.sh
node covers.mjs "$W/covers"
node t7.mjs land "$W/t7-land" & node ka.mjs land "$W/ka-land" & wait
node t7.mjs port "$W/t7-port" & node ka.mjs port "$W/ka-port" & wait
python3 assemble.py "$W" "$W/covers" "$V"
