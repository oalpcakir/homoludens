# Platform packages: itch.io and CrazyGames

```
npm ci                                   # once (D3 for the Borderlines package, Playwright for the tests)
python3 build.py                         # the site, into public/
python3 src/platform/build_platforms.py  # 10 packages, into dist/platforms/<platform>/<game>-<platform>.zip
npm run platforms                        # package tests in headless Chromium (CrazyGames SDK mocked)
```

`python3 src/platform/build_platforms.py kantar` builds one game; `--only itch` or `--only crazygames` one platform.
The unpacked folders next to the ZIPs (`dist/platforms/<platform>/<game>/`) can be served locally for testing:
`npx http-server dist/platforms/crazygames/kantar` and open `http://127.0.0.1:8080/index.html`
(the real SDK reports `environment: "local"` on 127.0.0.1 and shows a placeholder instead of ads).

## How it works

Nothing in a game is forked. Each package is the built site page plus:

- `platform.js` (the adapter, see its header): it holds the game's scripts until it is ready, swaps storage
  (CrazyGames: SDK Data, same keys; storage blocked anywhere: memory, with a notice), suspends Web Audio during
  ads, platform mute and hidden tabs, sends gameplay start/stop, runs midgame ads at natural breaks, and handles
  links to the site.
- a few lines of per-game config in `build_platforms.py` (`GAMES`): what "playing" means, which controls are
  natural breaks for an ad, what to hide.
- paths rewritten so every file is inside the package (relative, `index.html` spelled out, D3 shipped locally).

Ads: one at a time. From the request until it is over (finished, failed, unfilled, or no answer within 10 s) the
adapter reports gameplay stopped and will not restart it, puts a transparent layer over the page that takes every
click, tap and key, and answers a second request with "no ad". Each request has an id, so callbacks that arrive
late (an `adStarted` after the 10 s limit) are ignored and cannot leave the sound off or the page locked. The SDK
file itself is loaded by the adapter with the same 8 s limit as `init()`, so a stuck download cannot hang the page.
Polder's own `PF.ad` goes through this adapter in the packages; its midgame is asked only on "Next region / Try
again", not on the "All regions" button, and the board stays locked while its rewarded ad runs.

Game code changes made for this (all also live on the site, no behaviour change there):
Polder's `PF.init` uses the adapter when present; Kantar and Polder share links use the site address;
Borderlines can fall back to the dailies inside the package (the live copy gets 4 s) and leaves the link out of
the result text when it has no site to link to; Polder exposes two test hooks in `__polder.dbg` (`crack`, `end`).

| | itch.io | CrazyGames |
|---|---|---|
| SDK | none (itch.io has no required HTML5 SDK) | `https://sdk.crazygames.com/crazygames-sdk-v3.js`, `SDK.init()` awaited (8 s limit) before the game runs |
| Saves | browser localStorage (memory + notice if blocked) | `SDK.data` (same keys; synced for logged-in players) |
| Analytics | PostHog, events tagged `source: itch` | none (no third-party tracking) |
| Feedback button | removed (Turnstile works on our domain only) | removed |
| Links to the site | open in a new tab; "next game" card links to the site | hidden (no cross-promotion); share buttons hidden |
| Ads | none | midgame at natural breaks; Polder's rewarded finger |

## Per game

| Game | Gameplay start/stop | Midgame ad (CrazyGames) | Rewarded | Notes |
|---|---|---|---|---|
| Borderlines | map round in progress; home, results, archive, stats are breaks | "Play again / Practice" after a finished game | none (no natural reward) | dailies: live site first (`/borderlines/tiers.json`, `/borderlines/days/`, CORS open), package copy as fallback; 72 days bundled. When the bundled days run out and the site is unreachable the game says "New realms coming soon". D3 7.9.0 shipped in the package. |
| Retourvloot | clock running (speed > 0) and no modal | "Start a new company" after an ending | none | never during play: a run is one long session, the only natural break is the end |
| A Cup of Tea | desk open (intro and end door closed) | "next scene" link at the end of scene 1 and 2 | none | three pages in one package (`index.html`, `2/index.html`, `3/index.html`), progress `cupoftea.v1` shared |
| Polder | its own (`PF.start/stop`, modal-aware) | between regions (its own) | one extra finger per region, given only on `adFinished` | first visit starts Friesland directly |
| Kantar | match in progress with no sheet open | "Play again" after a match | none | onboarding, EN/TR, teacher, AI, resume and stats unchanged; first visit follows a Turkish platform locale |

## itch.io settings (Edit game → Uploads / Embed options)

Kind of project: **HTML**. Upload the ZIP, tick **This file will be played in the browser**.

| Game | Embed | Viewport | Fullscreen button | Scrollbars | Mobile friendly |
|---|---|---|---|---|---|
| Borderlines | Embed in page | 1280 × 720 | yes | no | yes (landscape or portrait) |
| Retourvloot | Click to launch in fullscreen | (none) | yes | **yes** (the page scrolls) | no |
| A Cup of Tea | Click to launch in fullscreen | (none) | yes | **yes** | no |
| Polder | Embed in page | 1280 × 720 | yes | no | no (mouse game) |
| Kantar | Embed in page | 1280 × 800 | yes | **yes** (taller than 720) | yes |

"Click to play" can stay on (sound starts on that click anyway). Limits checked by the builder: < 1000 files,
relative paths only, `index.html` at the root.

## Store screenshots

`src/platform/screenshots/<game>-1280x720.jpg`: one real gameplay screenshot per game for the itch.io page and the
CrazyGames submission (the portal's smaller copies are in `src/portal/shots/`). Covers and preview videos still need making.

## CrazyGames submission (Developer Portal)

- Upload: HTML5, the `-crazygames.zip`. Orientation: landscape (all five).
- Mobile: Kantar and Borderlines yes; Retourvloot, A Cup of Tea, Polder desktop only.
- "Does your game save progress?": **yes** for all five (saves go through the Data module).
- Fullscreen: CrazyGames provides it; no game has its own fullscreen button.
- Test in the portal's QA tool before submitting: gameplay start/stop in the event log, a midgame at the break,
  Polder's rewarded flow, saves after a reload, mute from the CrazyGames menu.

## Not done / to decide

- Real platform previews have not been run (no account access from here): the CrazyGames tests use a mock of the
  documented v3 calls, and the itch tests serve the package locally. Both must be checked on the real sites.
- `SDK.user.systemInfo` has no documented locale field; the adapter reads `locale` / `language` if present, else
  the browser language.
- Retourvloot, A Cup of Tea and Kantar are taller than a 16:9 frame and scroll. Fine on itch with scrollbars on;
  on CrazyGames this is a likely quality-review note (the game should fit the frame).
- Polder's rewarded "one more finger" opens from inside a region (as a modal that pauses the game). CrazyGames asks
  that the request button not be on an active gameplay screen; their QA may want it moved to between turns.
- Borderlines on CrazyGames still fetches new dailies from homoludens (not a link or a promotion, just data).
  If CrazyGames objects, set `daysUrl` to the package copy only and re-upload monthly.
