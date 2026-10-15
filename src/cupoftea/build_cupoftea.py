"""Build A Cup of Tea into ../../public/cupoftea/ (run from this folder: python3 build_cupoftea.py).

scene1.html -> /cupoftea/, scene2.html -> /cupoftea/2/, scene3.html -> /cupoftea/3/
Each scene is a self-contained page; this script only adds the shared head (meta tags, icon,
analytics, feedback button) and fills in {{SITE}}.
"""
import os, shutil
H = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(H, "..", ".."))
OUT = os.path.join(ROOT, "public", "cupoftea")
import sys
sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")))
from site_config import SITE, canonical, analytics_head  # noqa: E402
ph = analytics_head("cupoftea")

SCENES = {
    1: ("", "A Cup of Tea", "East London, March 1850. A grocer's receipt: one pound of sugar, 4½d. Find out who got every farthing of it, from the Customs House to a sugar estate in Cuba."),
    2: ("2/", "A Cup of Tea · Scene 2: Havana", "Follow the money for a pound of London sugar to Havana, and keep the ledger in hours as well as pence."),
    3: ("3/", "A Cup of Tea · Scene 3: The tea", "Two ounces of Congou, 5d. Cross-examine two witnesses to find what the tea itself was worth, and how heavy the duty on it really was."),
}
icon = ("<link rel=\"icon\" href=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E"
        "%3Crect width='32' height='32' rx='6' fill='%233b2a1e'/%3E"
        "%3Cpath d='M7 12h15v5a7 7 0 0 1-7 7h-1a7 7 0 0 1-7-7z' fill='%23efe5cc'/%3E"
        "%3Cpath d='M22 14h2a3 3 0 0 1 0 6h-2' fill='none' stroke='%23efe5cc' stroke-width='2'/%3E"
        "%3Cpath d='M5 26h21' stroke='%23a7622f' stroke-width='2'/%3E%3C/svg%3E\">")

for n, (path, title, desc) in SCENES.items():
    src = open(os.path.join(H, f"scene{n}.html"), encoding="utf-8").read()
    url = f"{SITE}/cupoftea/{path}"
    head = f'''<meta name="description" content="{desc}">
<meta property="og:type" content="website">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{SITE}/og-cupoftea.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{SITE}/og-cupoftea.png">
{canonical("/cupoftea/" + path)}
{icon}
{ph}
<script src="/feedback.js" defer data-game="cupoftea"></script>'''
    anchor = '<meta name="viewport" content="width=device-width, initial-scale=1">'
    assert anchor in src, n
    html = src.replace(anchor, anchor + "\n" + head, 1).replace("{{SITE}}", SITE)
    d = os.path.join(OUT, path)
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(html)

os.makedirs(os.path.join(OUT, "img"), exist_ok=True)
for f in ("portal-plate.jpg", "flor-de-cuba.jpg"):
    if os.path.exists(os.path.join(H, f)):
        shutil.copy(os.path.join(H, f), os.path.join(OUT, "img", f))
if os.path.exists(os.path.join(H, "og-cupoftea.png")):
    shutil.copy(os.path.join(H, "og-cupoftea.png"), os.path.join(ROOT, "public", "og-cupoftea.png"))
print("built", OUT)
