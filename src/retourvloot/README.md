# Retourvloot (Homo Ludens No. 2)

VOC idle/management game, 1602–1799. Plain HTML/JS, no build tools.

- `model.js` simulation (fleet, Batavia, auctions, dividends, monopolies, dynamic events)
- `events.js` 43 events (dated + state-triggered); `images.js` Rijksmuseum image credits; `img/` the images (CC0)
- `tut.js` guided first ship, contextual tips, PostHog `track()` helper, sources sheet
- `ui.js` interface: top bar with the headline numbers, the SVG chart of the route east (ships, letters and posts drawn from the model state, click for details), the side drawer of departments, event and end cards (end card compares the run with the real VOC: `compareData`/`compareLine`/`REAL_VOC` in `model.js`, figures cited there and in Sources); `head.html` / `body.html` page shell
- `mapdata.js` coastlines for the chart (Natural Earth 1:50m land, public domain, simplified and projected; about 29 KB)
- `test.js` headless balance test: `node test.js`
- Tests: `node --test tests/retourvloot.test.mjs` (model) and `tests/smoke/retourvloot.test.mjs` (browser).
- Build: `python3 build_retourvloot.py` → `public/retourvloot/index.html`, `public/retourvloot/img/`, `public/og-retourvloot.jpg`. Uses `../borderlines/posthog_head.html`.

PostHog events (all carry `game: "retourvloot"` and `year`): game_start, game_resume, tutorial_step, tutorial_done, tutorial_skip, first_ship, tip, event_choice, decade, game_end.

Soft launch: the game lives at /retourvloot/ and is not linked from the portal yet.
