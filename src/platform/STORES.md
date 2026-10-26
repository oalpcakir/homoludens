# Store pages: itch.io (and CrazyGames)

Everything needed to put each game on itch.io: the upload, the settings, the cover, the screenshots and the page text.
Borderlines is already live; its page is in `src/borderlines/itch.md` (keep it, add the cross-links below).

**Build the uploads:** `python3 build.py && python3 src/platform/build_platforms.py` →
`dist/platforms/itch/<game>-itch.zip` (and `dist/platforms/crazygames/<game>-crazygames.zip`).
Re-upload a game only when it changes. Tests for the packages: `npm run platforms`.

**Covers (630 × 500):** `src/platform/covers/<game>-630x500.jpg`.
**Screenshots (1280 × 720):** `src/platform/screenshots/<game>-1280x720.jpg` (Tulip 7 also has a phone one).

## Same for every game

- Classification **Games** · Kind of project **HTML** · Release status **Released** · Pricing **No payments**
- Upload the ZIP and tick **This file will be played in the browser**
- **Community: Comments** (this is where itch players report mistakes; the site's Feedback button is not in the packages)
- **AI generation disclosure:** answer honestly per game (Kantar, Tulip 7, Polder and the portal use art made with ChatGPT image generation; the history and code were made with Claude)
- Visibility: **Draft** first, play it once from the itch page, then **Public**
- Add every game to one itch **collection** called *Homo Ludens* (Collections → New collection), and put the
  collection link in each description (the line under "Part of Homo Ludens"). Players who finish one game find
  the next there; the "next game" card at the end of each game links to the site.
- Theme: background `#f7f6f2`, text `#1f2b4a`, links `#9c2f45` work for all; or pick colours from each cover.

| Game | Project URL | Embed | Viewport | Fullscreen button | Scrollbars | Mobile friendly |
|---|---|---|---|---|---|---|
| Borderlines | borderlines | Embed in page | 1280 × 720 | yes | no | yes |
| Tulip 7 | tulip-7 | Embed in page | 1280 × 720 | yes | no | **yes** (portrait and landscape) |
| Kantar | kantar | Embed in page | 1280 × 800 | yes | yes | yes |
| Polder | polder | Embed in page | 1280 × 720 | yes | no | no (mouse game) |
| A Cup of Tea | a-cup-of-tea | Click to launch in fullscreen | (none) | yes | yes | no |
| Retourvloot | retourvloot | Click to launch in fullscreen | (none) | yes | yes | no |

Suggested order to publish (one or two a week keeps the devlog/collection active): **Tulip 7**, **Kantar**,
**Polder**, **A Cup of Tea**, **Retourvloot**.

---

## Tulip 7

- **Tagline:** A tavern card game of the 1637 tulip mania. Collect seven tulips, cash in before the crash.
- **Genre:** Card Game · **Tags:** card-game, push-your-luck, history, tulips, singleplayer, short, casual, cozy, mobile
- **Cover:** `tulip7-630x500.jpg` · **Screenshots:** `tulip7-1280x720.jpg`, `tulip7-phone-780x1688.jpg`

**Description**

Amsterdam, winter 1636. In the back room of a tavern, men who have never seen a bulb are buying and selling tulips
on paper.

Sit down with three traders from the archives. Take papers one at a time: every tulip you add is money on the table,
but draw a tulip you already hold and your whole evening goes up in smoke. Collect seven different ones and you
complete a tulip book.

**The winter of 1636** is eight evenings long. Your winnings are written on paper, and the price index climbs from
×1 to ×7. Hold your paper and ride the mania, or cash it in for a small fee before the crash of February 1637. You
can see the risk coming. So can everyone else.

- One push-your-luck decision at a time: take another paper, or stand up.
- Three rivals who play like the men they were: a cautious young buyer, a cooper who knew his tulips, a brewer who
  rode the index to the end.
- Special papers from the real trade: wine money, the broker who chalked the price, regret money to back out.
- 14 achievements, each one something that really happened.
- About 15 minutes. Plays on a phone, a tablet or a computer.

Prices and dates come from Peter Garber, *Tulipmania* (1989), and Anne Goldgar, *Tulipmania* (2007).

**Part of Homo Ludens**
Tulip 7 is No. 6 in [Homo Ludens](https://homoludens.oalpcakir.workers.dev/), small games about the past.
More games: [the Homo Ludens collection](COLLECTION-LINK) · Chat with other players on
[Discord](https://discord.gg/7PcDfAMdr5).

Your progress is saved in your browser, separately from the Homo Ludens site.

## Kantar

- **Tagline:** A two-player duel in the Grand Bazaar of Istanbul. You divide, they choose.
- **Genre:** Card Game · **Tags:** card-game, strategy, two-player, history, istanbul, turkish, board-game, singleplayer, tutorial
- **Cover:** `kantar-630x500.jpg` · **Screenshots:** `kantar-1280x720.jpg`

**Description**

The Grand Bazaar of Istanbul. A brass scale, a rival merchant, and a stall of saffron, silk, coffee and copper.

Put three goods on the scale, in two pans. Your rival takes the pan they like; you keep the other. Next round you
swap: they divide, you choose. Win the majority of a good and you score its value. Simple to learn, and every split
is a small puzzle about what your rival wants and what is coming next.

- High strategy, low luck: the next goods are always visible, and only three cards are hidden.
- Two wax seals each, *Three Pans* and *Cut*, to bend the rules once per match.
- *Narh* mode: the market price moves as goods are bought and burned.
- A teacher who explains the best move and why, while you learn.
- Two rivals: Çırak Yusuf, the apprentice, and Mehmed Usta, who looks two rounds ahead.
- About 10 minutes a match. English or Turkish. Any screen.

The rival and the teacher only ever use public information: they never see the hidden cards.

**Part of Homo Ludens**
Kantar is No. 5 in [Homo Ludens](https://homoludens.oalpcakir.workers.dev/), small games about the past.
More games: [the Homo Ludens collection](COLLECTION-LINK) · [Discord](https://discord.gg/7PcDfAMdr5).
Home-page art: Amadeo Preziosi, *The Grand Bazaar* (19th century, Pera Museum), public domain.

## Polder

- **Tagline:** Build dikes, drain the sea, survive seven centuries of Dutch storms.
- **Genre:** Puzzle · **Tags:** puzzle, strategy, roguelite, history, netherlands, tile-placement, relaxing, singleplayer
- **Cover:** `polder-630x500.jpg` · **Screenshots:** `polder-1280x720.jpg`

**Description**

The Netherlands, 1200. Half the country is sea, marsh and peat, and the sea wants the rest.

Place dike pieces to close off the water, then drain what you enclosed into new land. Storms come, cracks appear,
and you have only so many fingers to plug them. Every region is a new map and a new chapter of Dutch history, from
the terps of Friesland to the North Sea flood of 1953.

- Four regions, each with its own goals and dangers; unlock the next by reaching a score.
- Upgrade picks as you go: stone dikes, barges, sluices, more hands.
- Legacy perks carried over from every region you finish. Normal and Hard.
- A chronicle book of what really happened, with its sources.
- About 15 minutes a region. Best with a mouse.

Flood dates and drainage history from the sources listed in the game's Chronicle.

**Part of Homo Ludens**
Polder is No. 4 in [Homo Ludens](https://homoludens.oalpcakir.workers.dev/), small games about the past.
More games: [the Homo Ludens collection](COLLECTION-LINK) · [Discord](https://discord.gg/7PcDfAMdr5).
Cover painting: Jacob van Ruisdael, *The Windmill at Wijk bij Duurstede* (c. 1670, Rijksmuseum), public domain.

## A Cup of Tea

- **Tagline:** A grocer's receipt, London 1850. Read the papers of the day and find out who got every farthing.
- **Genre:** Puzzle · **Tags:** detective, deduction, history, mystery, educational, point-and-click, singleplayer, short
- **Cover:** `cupoftea-630x500.jpg` · **Screenshots:** `cupoftea-1280x720.jpg`

**Description**

East London, March 1850. A working family's receipt: one pound of brown sugar for 4½d, two ounces of tea for 5d.

You are a nameless detective with a desk of real papers: Parliamentary debates, newspaper letters, price lists of
the day. Collect the figures, do the sums with the old money (12 pence to the shilling, 20 shillings to the pound),
and fill the ledger line by line until every farthing is accounted for: the grocer, Her Majesty's Customs, the
shipowner, and the money that never reached London.

- Three scenes: a London shop, a sugar estate outside Havana, and back to the tea.
- Every puzzle has exactly one answer, and every figure comes from a source of the time.
- A money converter on the desk, so the arithmetic never gets in the way.
- Inspired by Sidney Mintz's *Sweetness and Power*.
- Best on a laptop or desktop.

**Part of Homo Ludens**
A Cup of Tea is No. 3 in [Homo Ludens](https://homoludens.oalpcakir.workers.dev/), small games about the past.
More games: [the Homo Ludens collection](COLLECTION-LINK) · [Discord](https://discord.gg/7PcDfAMdr5).
Sources are cited in the game: Hansard, Henry Mayhew, Dickens's *Household Narrative* and others. Engravings from
Wikimedia Commons, public domain.

## Retourvloot

- **Tagline:** Run the Dutch East India Company from Amsterdam, 1602–1799. Letters from Batavia take a year.
- **Genre:** Strategy · **Tags:** strategy, management, history, trading, simulation, singleplayer, dutch, colonial
- **Cover:** `retourvloot-630x500.jpg` · **Screenshots:** `retourvloot-1280x720.jpg`

**Description**

You are a director of the Dutch East India Company, in Amsterdam, from its founding in 1602 to its end in 1799.

Equip ships, send silver east and set the dividend. Then wait: a letter to Batavia takes a year to arrive, and the
answer another year to come back. Chase the spice monopolies, keep the shareholders paid, and watch the Company
slowly hollow out from the inside.

- Two centuries in 30 to 80 minutes, with the clock at your speed.
- Event cards with a real painting or print from the Rijksmuseum on every one.
- The other ledger: a running count of what the trade cost, and who paid for it.
- A bookkeeper who tells you why the debt is growing.
- Best on a laptop or desktop.

**Part of Homo Ludens**
Retourvloot is No. 2 in [Homo Ludens](https://homoludens.oalpcakir.workers.dev/), small games about the past.
More games: [the Homo Ludens collection](COLLECTION-LINK) · [Discord](https://discord.gg/7PcDfAMdr5).
All images from the Rijksmuseum, public domain (CC0); the full list is on the game's Sources page.

## Borderlines

Live already. Two small updates to its itch page: replace the "Part of Homo Ludens" paragraph's last sentence with
the collection link and the Discord line used above, and re-upload `borderlines-itch.zip` (the end card now links
the Discord too).

---

## CrazyGames

Submit the `-crazygames.zip` files in the Developer Portal (settings and QA checklist in `README.md` in this folder).
Mobile: Tulip 7, Kantar and Borderlines yes; Polder, A Cup of Tea and Retourvloot desktop only. All six save
progress through the SDK Data module.
