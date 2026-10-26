# Homo Ludens — source

Build sources behind the published site (the repo's `public/` folder holds the built pages).

## Build and test

```
python3 build.py            # build every page from src/ into public/, then run validate.py
python3 build.py --check    # same, and fail if public/ differs from what is committed (CI runs this)
python3 validate.py         # only the checks: games.json, links and assets, placeholders, sitemap
node --test tests/*.test.mjs  # worker (mocked KV, Resend, Turnstile, Discord) and Retourvloot model tests
npm ci && npx playwright install chromium   # once, for the browser tests
npm run smoke                 # every page in headless Chromium: no JS errors or missing files, games start, Polder save/resume/reset, Kantar first visit
python3 src/platform/build_platforms.py && npm run platforms   # the itch.io / CrazyGames packages
```

Python 3.10+ and Node 18+. The site itself has no npm packages; `package.json` only pins Playwright and D3 for the browser tests. `.github/workflows/check.yml` runs on every push and pull request: build + unit tests, then the browser smoke tests and the platform packages (uploaded as a build artifact). It never deploys.
`src/site_config.py` holds the site origin (`SITE`) for every builder: OG tags, canonical links, sitemap.xml and robots.txt. For the homoludens.games switch, change it there and run `python3 build.py`.

## portal/
- `portal.html` — portal template ({{POSTHOG}}, {{SITE}}, {{LAND}}, {{REALM}}, {{W}}, {{H}} placeholders for the analytics snippet, OG URLs and the map plate from `portal_svg.json`).
- `world_map.py` — the "World map" tab: projects Natural Earth land (Borderlines' `base.json`) into the {{WORLD}} {{WGRAT}} {{WW}} {{WH}} {{MAPCFG}} placeholders. Each game's pin, dates and label position are one line in the `ATLAS` list in `portal.html`; title, text, picture and link come from its card, so a new game needs only that line.
- `build_portal.py` — writes `public/index.html`, `public/sitemap.xml` and `public/robots.txt` (templates here). Edit the templates, never the files in `public/` (the next build overwrites them).


## borderlines/ (No. 1)
- `game.html` — game template; `/*DATA*/` is replaced by the page data (practice pool, base map, each daily's difficulty tiers).
- Each daily's realms live in `public/borderlines/days/<n>.json` and are fetched when that day is played, so the page stays the same size however many days there are.
- `data/base.json` — practice pool + base map. `data/history.json` — which realm and year every daily used (the updater's memory).
- `build_borderlines.py` — writes `public/borderlines/index.html` and updates the daily count in the portal.
- `auto_update.py` + `catalog.py` — the monthly updater. `.github/workflows/borderlines-monthly.yml` runs it on the 1st of every month: it adds enough days to stay ~5 weeks ahead (about 30), checks each realm against historical-basemaps (shape exists, big enough, capital inside), commits and pushes; Cloudflare redeploys. To add realms, add lines to `catalog.py`. To test locally: `python3 src/borderlines/auto_update.py --data <historical-basemaps>/geojson --today 2026-12-01 --dry-run`.
- `questions.py`, `basics.py`, `daily30.py`, `meta.py`, `prep3.py`, `build_site.py` — the original hand-made lists and one-off builders for days 1–42 and the pool. The updater reads the lists (old realms can come back as reruns) but the builders are no longer part of the pipeline.
- `posthog_head.html` — shared analytics snippet (PostHog US, cookieless) used by every page. Builders fill in the game id and the `version` from `public/games.json` (bump it when a game changes meaningfully). Every event carries `game` and `game_version`; besides each game's own events it sends the shared names `game_opened`, `game_started`, `tutorial_completed`, `game_progress`, `game_completed`, `result_shared`, `next_game_clicked` (with `legacy_event` = the original name). The mapping table is in the snippet.

## retourvloot/ (No. 2)
- Plain HTML/JS: `model.js`, `events.js`, `images.js`, `tut.js`, `ui.js`, `head.html`, `body.html`; images in `img/`.
- `build_retourvloot.py` — writes `public/retourvloot/` and `public/og-retourvloot.jpg`. `node test.js` runs a headless balance test.
- See `retourvloot/README.md` for details.

## cupoftea/ (No. 3)
- `scene1.html`, `scene2.html`, `scene3.html` — one self-contained page per scene (data, puzzle logic, Web Audio sound, the reprinted-receipt card). Design notes and the solution tables live in the project's TASARIM.md.
- `build_cupoftea.py` — adds the shared head (meta tags, icon, analytics, feedback button) and writes `public/cupoftea/` (scene 1), `public/cupoftea/2/`, `public/cupoftea/3/`, plus `public/og-cupoftea.jpg` and the portal plate.
- Progress is kept in the player's browser under `cupoftea.v1` (scenes solved, blots per scene); the portal reads it for the "Continue" card.

## polder/ (No. 4)
- `polder.html` — the whole game in one self-contained page (canvas, Web Audio sound and music, the Netherlands menu map, the Chronicle).
- `build_polder.py` — adds the shared head (meta tags, icon, analytics, feedback button) and writes `public/polder/`, `public/og-polder.jpg` and the portal plate.
- `nlmap_gen.py` — regenerates the menu map's region outlines (needs Natural Earth via the `world-atlas` npm package and shapely); paste its output into `NLGEO` in `polder.html`.
- A saved run is checked before Continue is offered (`validRun`); damaged or unknown saves are left alone and not offered. The run also stores the random-number state (`rp`, `rs`), so a reload continues the same pieces and storms. `window.__polderTest.snapshot()` is a read-only hook for the smoke tests.
- Kept in the player's browser: `polder.progress.v1` (stars and best fields per region, Chronicle pages `_seen`, achievements `_ach`, `_campaign`), `polder.run.v1` (the game in progress), `polder.settings.v1` (sound, music). The portal reads the first two.
- PostHog events: polder_menu, polder_level_start, polder_resume, polder_goal, polder_upgrade, polder_storm, polder_level_end, polder_quit, polder_share, polder_book, polder_achievement, polder_reset.

- Platform packages: `polder.html` runs unchanged in the itch.io and CrazyGames packages (see `platform/README.md`); with `window.POLDER_CG = true` saves go through the SDK Data module, gameplayStart/Stop follow the modal state, `happytime` on a region win, a midgame ad between regions, an optional rewarded ad for one extra finger, the platform's mute setting is respected, and site links (feedback, sidebar Discord, share URL) are left out. Store art (3 covers, 2 preview videos) is in `dist/crazygames/assets/` on the build machine; checklist in the project's `polder/CRAZYGAMES.md`.
## kantar/ (No. 5)
- `kantar.html` — the whole game in one self-contained page (English and Turkish, AI rival and teacher, Web Audio sound, inline art).
- `build_kantar.py` — adds the shared head (meta tags, canonical, icon, analytics, feedback button) and writes `public/kantar/`, `public/og-kantar.jpg` and the portal plate (`ART` picks the home-page art).
- Rules, AI, balance numbers, save keys and analytics events: see `kantar/STATUS.md`. `tests/kantar.test.mjs` checks the AI uses only public information.

## tulip7/ (No. 6)
- Sources: `ui.html` (styles and layout), `engine.js` (rules, winter, AI; no DOM, `node` can load it), `game.js` (table, animations, achievements, analytics), `art.js` (all art as WebP data URIs) and `carpet.b64`. `build_prototype.py` joins them into a standalone `prototype.html`; `build_tulip7.py` does the same with the shared head and writes `public/tulip7/`, `public/og-tulip7.jpg` and the portal plate (`plate.jpg`).
- Art: `ART-BRIEF.html` (tulips and objects), `ART-BRIEF-UI.html` (card back, frame, logo, table, sign, seal) and `ART-BRIEF-ACH.html` (achievement tiles) give the prompts and export packs; `python3 merge_pack.py <pack>.html` writes the pack into `art.js` (packs are git-ignored).
- Rules, balance, save keys, analytics events and history notes: `tulip7/STATUS.md` and `tulip7/TASARIM.md`.

## platform/ (itch.io and CrazyGames)
- `optimize_images.py` shrinks new game art (WebP re-encode, portal plates resized) after an art pack is merged; run it by hand, then rebuild. It never touches the full-size masters, and `optimized-images.json` stops it from re-encoding an image twice.
- `build_platforms.py` makes all twelve upload ZIPs (six games × itch.io and CrazyGames) from `public/` (`dist/platforms/<platform>/<game>-<platform>.zip`); `platform.js` is the adapter they share (SDK, saves, sound, gameplay events, ads, links). `npm run platforms` tests the packages with a mocked CrazyGames SDK. Settings for both stores and what is still open: `platform/README.md`; store page text, covers and screenshots: `platform/STORES.md`.
- `public/next.js` — the "next game" card at the end of every game (`<div data-hl-next>`); in itch packages it links to the site.

## Deploy & feedback
- `wrangler.jsonc` deploys `public/` to Cloudflare Workers; pushes to main redeploy.
- `worker.js` handles `/api/feedback` (Turnstile, rate limit, Discord), `/api/newsletter/*` (double opt-in list in KV), `/api/admin/*` (stats, announcement email) and `/borderlines/s/<score>` share pages. Announcement sends are locked, marked before sending, and carry a Resend idempotency key, so a double click or a retry never emails anyone twice. Tests: `tests/worker.test.mjs`.
- Worker secrets: `DISCORD_WEBHOOK_URL`, `TURNSTILE_SECRET` (set with `wrangler secret put`). The public Turnstile site key is in `public/feedback.js`.
- The feedback form doesn't work on a plain local server; everything else is static.

Aybükeyi seviyorum
