"""Build Kantar into ../../public/kantar/ (python3 src/kantar/build_kantar.py, from anywhere).

kantar.html is the whole game in one self-contained page (art, symbols and background embedded, sounds
synthesised). It is the site copy of the standalone build in the Claude project (v2.7 + portal link,
history notes and resume analytics). This script adds the shared head (meta, canonical, icon, analytics,
feedback button) and copies the share image and the portal plate.
"""
import os, shutil, sys
H = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(H, "..", ".."))
sys.path.insert(0, os.path.normpath(os.path.join(H, "..")))
from site_config import SITE, canonical, analytics_head  # noqa: E402
OUT = os.path.join(ROOT, "public", "kantar")
# Home-page art: "b" = Amadeo Preziosi, The Grand Bazaar (Pera Museum, public domain; original in
# preziosi-grand-bazaar.jpg), "a" = the game's brass scale over its bazaar background.
# Switching to "a" also means changing the caption in src/portal/portal.html.
ART = "b"
title = "Kantar"
desc = ("A two-player duel in the Grand Bazaar of Istanbul. Divide three goods between the pans of a brass scale, "
        "let your rival choose, and fight for saffron, silk, coffee and copper. Six rounds, about 10 minutes, English or Turkish.")
icon = ("<link rel=\"icon\" href=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E"
        "%3Crect width='32' height='32' rx='7' fill='%235a1f1a'/%3E"
        "%3Cpath d='M16 6v20M7 10h18' stroke='%23d2a650' stroke-width='2' stroke-linecap='round'/%3E"
        "%3Cpath d='M4 17a4 3 0 0 0 7 0zM21 17a4 3 0 0 0 7 0z' fill='%23d2a650'/%3E"
        "%3Cpath d='M7 10l-3 7M7 10l4 7M25 10l-4 7M25 10l3 7' stroke='%23d2a650' stroke-width='.8'/%3E"
        "%3Crect x='11' y='25' width='10' height='2.5' rx='1' fill='%23d2a650'/%3E%3C/svg%3E\">")
head = f'''<meta name="description" content="{desc}">
<meta property="og:type" content="website">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{SITE}/kantar/">
<meta property="og:image" content="{SITE}/og-kantar.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{SITE}/og-kantar.jpg">
{canonical("/kantar/")}
{icon}
{analytics_head("kantar")}
<script src="/feedback.js" defer data-game="kantar"></script>
<script src="/next.js" defer data-game="kantar"></script>'''
src = open(os.path.join(H, "kantar.html"), encoding="utf-8").read()
anchor = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
assert anchor in src
os.makedirs(os.path.join(OUT, "img"), exist_ok=True)
with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8", newline="\n") as fh:
    fh.write(src.replace(anchor, anchor + "\n" + head, 1))
shutil.copy(os.path.join(H, f"plate-{ART}.jpg"), os.path.join(OUT, "img", "portal-plate.jpg"))
shutil.copy(os.path.join(H, f"og-{ART}.jpg"), os.path.join(ROOT, "public", "og-kantar.jpg"))
print("built", OUT)
