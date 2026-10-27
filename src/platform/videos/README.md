# CrazyGames preview videos: Kantar and Tulip 7

| File | Size | Length |
|---|---|---|
| `kantar-crazygames-1920x1080.mp4` | 3.6 MB | 15.3 s |
| `kantar-crazygames-1080x1620.mp4` | 4.1 MB | 15.3 s |
| `tulip7-crazygames-1920x1080.mp4` | 6.2 MB | 18.7 s |
| `tulip7-crazygames-1080x1620.mp4` | 6.4 MB | 18.7 s |

All four are H.264 (High), yuv420p, 30 fps, `+faststart`, with **no audio track**.
`*-cover-*.jpg` are the opening frames (see below).

## The spec followed

Source: CrazyGames developer docs, "Game covers" → "Video Requirements",
<https://docs.crazygames.com/requirements/game-covers/> (read 27 Oct 2026).

- Length 15–20 s maximum; longer videos are cut to 20 s.
- 50 MB maximum.
- Two sizes, both mandatory: full-screen landscape, 1080p 16:9 (1920 × 1080), and full-screen portrait, 1080p 2:3
  (1080 × 1620).
- No sound.
- No fast-forwarding (CrazyGames speeds the video up slightly itself): everything is at the game's real speed.
- Avoid: a black screen and logo transition, black bars top and bottom, the default mouse cursor, "Play now" or
  other promotional text, app or social media icons.
- Use your static cover as the opening frame, so the thumbnail runs straight into the preview.
- The docs name no container or codec (they suggest HandBrake); MP4/H.264 is the safe choice.

**Opening frame.** Each video opens on a still cover (0.6 s, then a 0.25 s crossfade into play). The covers are
`*-cover-1920x1080.jpg` and `*-cover-1080x1620.jpg`, made by `covers.mjs` with the title only (Tulip 7: the game's
cover painting and wordmark; Kantar: Preziosi's *The Grand Bazaar*, public domain). CrazyGames also asks for
1920 × 1080, 800 × 1200 and 800 × 800 cover images. **Upload these covers, scaled, so they match the videos.** If you
upload different covers, change `covers.mjs` to draw them and run the build again.

## What is in them

Real play in the real game builds (`public/kantar/`, `public/tulip7/`), in English, played as on CrazyGames
(`HL_PLATFORM = crazygames`: no passport toast, share button or site links). The site's feedback and Discord buttons
are hidden. There is no cursor.

- **Tulip 7** (Speed: fast, Help: off): the deal flies out to the four traders; cards fly and flip into your hand
  until the tulip book is complete (7/7, "+15"); your next hand goes up in smoke; evening VII ends and the price board moves on to ×7; you cash in
  on the last evening; the crash; the end sheet ("You finish richest.") with the price curve drawing in.
- **Kantar** (Narh rules, vs Apprentice Yusuf): you put three goods on the brass scale with the Three Pans seal; the
  rival cuts with its own seal and picks a pan; one pan burns; the rival divides; you use Cut and take a pan; the
  winning end sheet with its art (You 11, Rival 8).

The script plays the human seat. For Tulip 7 it also picks which paper comes off the pile on some draws, keeps the
crash for after evening VIII, and has the rivals hold their paper on the last evening, so the camera sees a book, a
burn and a crash with paper on the table. For Kantar the human plays the engine's own search from its side of the
table. It is made to use Three Pans on turn 1 and Cut on turn 2. Seed 1 is a match it wins. Everything on screen is
the game's own engine, AI, rendering and animation.

## How they were made

`lib.mjs` serves `public/` with `tests/smoke/server.mjs` in headless Chromium (Playwright). It blocks every
external host. The page runs on a **virtual clock**: `setTimeout`/`setInterval`, `Date`, `performance.now`,
`requestAnimationFrame` and all CSS and Web Animations stand still until the script advances them, 1/30 s at a time.
After each step it takes a full-resolution CDP screenshot. So the video is a smooth 30 fps at the game's real speed,
even though one frame takes about half a second to render here. `Math.random` is seeded, so a rerun plays the same
game.

The games load EB Garamond and Source Sans 3 from Google Fonts. The capture serves the same families from local
fontsource copies (`fonts.sh`), so the type is right. `assemble.py` holds the edit, as frame ranges per clip. It cuts
them with crossfades after the cover and encodes with ffmpeg (`-preset veryfast -crf 18`).

## Regenerate

```
CHROME=/path/to/chromium sh src/platform/videos/make.sh [/tmp/work]   # about an hour on 2 cores
```

`make.sh` runs `fonts.sh` (once; npm), `covers.mjs`, then `t7.mjs land|port` and `ka.mjs land|port`. Their clips go
to `<work>/<game>-<variant>/cN/*.jpg`. Last it runs `assemble.py <work> <work>/covers src/platform/videos`.

If a game changes, the clips may shift. Look at the frames before trusting the old cut list, e.g.
`ffmpeg -framerate 30 -i <work>/t7-land/c1/%05d.jpg -vf "select='not(mod(n,15))',scale=480:-1,tile=6x5" sheet.jpg`.
Then fix the frame ranges in `EDITS` in `assemble.py`.
