#!/bin/sh
# The games load EB Garamond and Source Sans 3 from Google Fonts, which the capture browser cannot reach.
# This puts the same families (fontsource packages from npm) in $FONTS (default /tmp/hl-video-fonts); lib.mjs
# answers the Google Fonts requests from there.
set -e
F=${FONTS:-/tmp/hl-video-fonts}; mkdir -p "$F/files" "$F/pkg"; cd "$F/pkg"
npm pack -q @fontsource/eb-garamond@5.3.0 @fontsource/source-sans-3@5.3.1 >/dev/null
for t in *.tgz; do mkdir -p "${t%.tgz}"; tar xzf "$t" -C "${t%.tgz}"; cp "${t%.tgz}"/package/files/*.woff2 "$F/files/"; done
G=$(ls -d fontsource-eb-garamond-*/package); S=$(ls -d fontsource-source-sans-3-*/package)
( for w in 400 500 600 700 400-italic; do cat $G/$w.css; echo; done; for w in 400 500 600 700 800; do cat $S/$w.css; echo; done ) |
  sed 's#url(\./files/#url(https://fonts.gstatic.com/__f/#g' > "$F/fonts.css"
echo "fonts in $F"
