# Homo Ludens

Small games about the past: short history games with one mechanic, one idea, and a note on what really happened. Named after Johan Huizinga's 1938 book.

▶ **Play:** [homoludens.oalpcakir.workers.dev](https://homoludens.oalpcakir.workers.dev)

## Games

| No. | Game | What you do | Length |
|---|---|---|---|
| 1 | [**Borderlines**](https://homoludens.oalpcakir.workers.dev/borderlines/) | Paint the land a historical realm ruled, then see how close you came. Daily challenge. | 5 minutes |
| 2 | [**Retourvloot**](https://homoludens.oalpcakir.workers.dev/retourvloot/) | Run the Dutch East India Company from Amsterdam, 1602–1799. Letters from Batavia take a year. | 30–80 minutes, desktop |
| 3 | [**A Cup of Tea**](https://homoludens.oalpcakir.workers.dev/cupoftea/) | A grocer's receipt, London 1850: find out who got every farthing, from the Customs House to Havana. | 3 scenes, desktop |
| 4 | [**Polder**](https://homoludens.oalpcakir.workers.dev/polder/) | Build dikes and drain the sea across four Dutch regions, from the terps of 1200 to the North Sea flood of 1953. | ~15 minutes per region, desktop |
| 5 | [**Kantar**](https://homoludens.oalpcakir.workers.dev/kantar/) | A two-player duel in the Grand Bazaar of Istanbul: put three goods on a brass scale, your rival takes a pan, you keep the other. A teacher explains the best move as you learn. | ~10 minutes, any screen, English or Turkish |
| 6 | [**Tulip 7**](https://homoludens.oalpcakir.workers.dev/tulip7/) | Amsterdam, winter 1636: a tavern card game of the tulip mania. Collect seven different tulips without drawing one twice, write your winnings on paper as prices rise, and cash in before the crash of February 1637. | ~15 minutes, any screen |

## Spotted a mistake?

History is messy and some of it is disputed. Use the **Feedback** button on any page, or open an issue in this repository.

## Credits

- **Borderlines:** historical borders from [historical-basemaps](https://github.com/aourednik/historical-basemaps) (André Ourednik and contributors, GPL-3.0); base map from [Natural Earth](https://www.naturalearthdata.com/) (public domain); rendering with [D3.js](https://d3js.org/).
- **Retourvloot:** all images from the [Rijksmuseum](https://www.rijksmuseum.nl/), public domain (CC0); full list in the game's Sources page.
- **A Cup of Tea:** prices and quotations from Hansard, Henry Mayhew's Morning Chronicle letters, Dickens's Household Narrative, S. P. Day, Sir George Staunton, R. R. Madden and Engels (each cited in the game); engravings from Wikimedia Commons (public domain, copied into the game); the grocer's receipt and the Havana shipping note are invented game documents.
- **Polder:** flood dates and drainage history checked against the sources listed in the game's Chronicle (Sources tab); map of the Netherlands from [Natural Earth](https://www.naturalearthdata.com/) (public domain), region borders drawn by hand; music and sound generated in the browser.
- **Kantar:** home-page art is Amadeo Preziosi, *The Grand Bazaar* (19th century, Pera Museum, Istanbul; public domain); sound generated in the browser; the rival and the teacher are a small search over public information only, so they never see hidden cards.
- **Tulip 7:** prices and dates from Peter Garber, "Tulipmania" (1989), and Anne Goldgar, *Tulipmania* (2007) and in *History Today*; the traders at the table are real people from Goldgar's archive work; art made for the game (ChatGPT image generation, prompts in `src/tulip7/ART-BRIEF*.html`); sound generated in the browser.
- Fonts via Google Fonts.

## Licence

Game code is released under GPL-3.0, matching the historical borders dataset Borderlines is built on.

## How it's made

Plain HTML, CSS and JavaScript, with no framework and no npm packages on the site. Each game is one self-contained page under `public/<game>/`, built from `src/<game>/` by its own Python script; `public/games.json` lists the games for the portal, the newsletter and the admin page. A Cloudflare Worker (`worker.js`) serves the site and handles feedback, the newsletter and the admin stats.

```
python3 build.py              # build every page from src/ into public/, then validate
node --test tests/*.test.mjs  # worker and game-model tests
npm ci && npm run smoke       # every page in headless Chromium
```

The same games are packaged for itch.io and CrazyGames by `src/platform/build_platforms.py` (one small adapter, no forked game code).

Details for each game, the analytics events and the deploy are in [`src/README.md`](src/README.md).
