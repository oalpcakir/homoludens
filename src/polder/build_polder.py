"""Build Polder into ../../public/polder/ (run from this folder: python3 build_polder.py).

polder.html is the whole game in one self-contained page; this script only adds the shared head
(meta tags, icon, analytics, feedback button) and copies the share image and the portal plate.
"""
import os, shutil
H = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(H, "..", ".."))
OUT = os.path.join(ROOT, "public", "polder")
import sys
sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")))
from site_config import SITE, canonical, analytics_head  # noqa: E402
ph = analytics_head("polder")
title = "Polder"
desc = "Build dikes, close them into rings and drain the sea, from the terp mounds of 1200 to the North Sea flood of 1953. Four regions of the Netherlands, each with its own storms and lakes."
icon = ("<link rel=\"icon\" href=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E"
        "%3Crect width='32' height='32' rx='7' fill='%2386cfe4'/%3E"
        "%3Crect x='3' y='15' width='26' height='14' rx='3' fill='%23b4de85'/%3E"
        "%3Crect x='3' y='13' width='26' height='4' rx='2' fill='%2393c46b'/%3E"
        "%3Cpath d='M16 6v9M11.5 8.5l9 4M11.5 12.5l9-4' stroke='%234a3a2e' stroke-width='1.6'/%3E%3C/svg%3E\">")
head = f'''<meta name="description" content="{desc}">
<meta property="og:type" content="website">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{SITE}/polder/">
<meta property="og:image" content="{SITE}/og-polder.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{SITE}/og-polder.png">
{canonical("/polder/")}
{icon}
{ph}
<script src="/feedback.js" defer data-game="polder"></script>'''
src = open(os.path.join(H, "polder.html"), encoding="utf-8").read()
anchor = '<meta name="viewport" content="width=device-width, initial-scale=1">'
assert anchor in src
html = src.replace(anchor, anchor + "\n" + head, 1)
os.makedirs(os.path.join(OUT, "img"), exist_ok=True)
open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(html)
shutil.copy(os.path.join(H, "portal-plate.jpg"), os.path.join(OUT, "img", "portal-plate.jpg"))
shutil.copy(os.path.join(H, "og-polder.png"), os.path.join(ROOT, "public", "og-polder.png"))
print("built", OUT)
