# Retourvloot (Homo Ludens No. 2)

VOC idle/management game, 1602–1799. Plain HTML/JS, no build tools.

- `model.js` simulation (fleet, Batavia, auctions, dividends, monopolies, dynamic events)
- `events.js` 42 events (dated + state-triggered); `images.js` Rijksmuseum image credits; `img/` the images (CC0)
- `tut.js` guided first ship, contextual tips, PostHog `track()` helper, sources sheet
- `ui.js` interface, map, accounts; `head.html` / `body.html` page shell
- `test.js` headless balance test: `node test.js`
- Build: `python3 build_retourvloot.py` → `public/retourvloot/index.html`, `public/retourvloot/img/`, `public/og-retourvloot.jpg`. Uses `../borderlines/posthog_head.html`.

PostHog events (all carry `game: "retourvloot"` and `year`): game_start, game_resume, tutorial_step, tutorial_done, tutorial_skip, first_ship, tip, event_choice, decade, game_end.

Soft launch: the game lives at /retourvloot/ and is not linked from the portal yet.
