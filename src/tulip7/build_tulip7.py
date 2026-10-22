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
<script src="/next.js" defer data-game="tulip"></script>'''
src = page()
anchor = '<meta name="viewport" content="width=device-width,initial-scale=1">'
assert src.count(anchor) == 1
os.makedirs(os.path.join(OUT, "img"), exist_ok=True)
with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8", newline="\n") as fh:
    fh.write(src.replace(anchor, anchor + "\n" + head, 1))
shutil.copy(os.path.join(H, "plate.jpg"), os.path.join(OUT, "img", "portal-plate.jpg"))
shutil.copy(os.path.join(H, "og.jpg"), os.path.join(ROOT, "public", "og-tulip7.jpg"))
print("built", OUT)
