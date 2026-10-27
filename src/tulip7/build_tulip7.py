"""Build Tulip 7 into ../../public/tulip7/ (python3 src/tulip7/build_tulip7.py, from anywhere).

The game is one self-contained page: ui.html (styles + layout) with art.js (all art as WebP data URIs,
merged from the ChatGPT art packs by merge_pack.py), carpet.b64, engine.js (rules, AI; no DOM) and
game.js (table, animations, achievements) inlined by build_prototype.page(). This script adds the shared
head (meta, canonical, icon, analytics, feedback button, next-game card) and copies the share image and
the portal plate. Design notes and history sources: TASARIM.md.
"""
import base64, os, shutil, sys
H = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(H, "..", ".."))
sys.path.insert(0, os.path.normpath(os.path.join(H, "..")))
sys.path.insert(0, H)
from site_config import SITE, canonical, analytics_head  # noqa: E402
from build_prototype import page  # noqa: E402
OUT = os.path.join(ROOT, "public", "tulip7")
title = "Tulip 7"
desc = ("Amsterdam, winter 1636. A tavern card game of the tulip mania: take papers one by one and collect seven "
        "different tulips, but a second copy burns your evening. Write your winnings on paper as the price index "
        "rises, and cash in before the crash of February 1637. About 15 minutes, any screen.")
# what the start screen shows first: the cover, the logo and the four portraits (the tavern behind the window and
# the sign come next, without competing with them)
FIRST = "\n".join('<link rel="preload" as="image" href="img/%s.webp"%s>' % (k, ' fetchpriority="high"' if k == "bg_cover" else '')
                  for k in ("bg_cover", "ui_logo", "c_cuyck", "c_busscher", "c_meeckeren", "c_theunisz"))
fav = base64.b64encode(open(os.path.join(H, "favicon-64.png"), "rb").read()).decode()
head = f'''<meta name="description" content="{desc}">
<meta property="og:type" content="website">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{SITE}/tulip7/">
<meta property="og:image" content="{SITE}/og-tulip7.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{SITE}/og-tulip7.jpg">
{canonical("/tulip7/")}
<link rel="icon" type="image/png" href="data:image/png;base64,{fav}">
{analytics_head("tulip")}
<script src="/feedback.js" defer data-game="tulip"></script>
<script src="/next.js" defer data-game="tulip"></script>
<script src="/hl.js" defer data-game="tulip"></script>
{FIRST}'''
src = page()
# Every ART image (cards, portraits, UI pieces, backgrounds, achievement tiles) is written to img/ instead of being
# inlined, as a relative img/<key>.webp URL (the itch / CrazyGames packages copy tulip7/img to img/ beside their page).
# The page itself drops from ~1.25 MB to the code; the images load in parallel and are cached. The first screen's
# images are preloaded in the head (FIRST above), and game.js decodes the card art before the first deal.
# The carpet fallback is not needed when ui_table exists.
import re
os.makedirs(os.path.join(OUT, "img"), exist_ok=True)
for f in os.listdir(os.path.join(OUT, "img")):  # stale files from an older build (the portal plate is copied below)
    if f.endswith(".webp"): os.remove(os.path.join(OUT, "img", f))
def _lazy(m):
    open(os.path.join(OUT, "img", m.group(1) + "." + m.group(2)), "wb").write(base64.b64decode(m.group(3)))
    return f'"{m.group(1)}": "img/{m.group(1)}.{m.group(2)}"'
src, n = re.subn(r'"([a-z0-9_]+)":\s*"data:image/(webp|png|jpeg);base64,([A-Za-z0-9+/=]+)"', _lazy, src)
assert n >= 50, n
assert ';base64,' not in src.split("const ART=", 1)[1].split("\n", 1)[0], "an ART image is still inlined"
if '"ui_table": "img/' in src:
    src, k = re.subn(r'const CARPET="[^"]*";', 'const CARPET="";', src)
    assert k == 1, k
anchor = '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
assert src.count(anchor) == 1
with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8", newline="\n") as fh:
    fh.write(src.replace(anchor, anchor + "\n" + head, 1))
shutil.copy(os.path.join(H, "plate.jpg"), os.path.join(OUT, "img", "portal-plate.jpg"))
shutil.copy(os.path.join(H, "og.jpg"), os.path.join(ROOT, "public", "og-tulip7.jpg"))
print("built", OUT)
