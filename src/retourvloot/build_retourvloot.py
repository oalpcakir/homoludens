"""Build Retourvloot into ../../public/retourvloot/ (run from this folder: python3 build_retourvloot.py)."""
import os, shutil
H = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(H, "..", ".."))
OUT = os.path.join(ROOT, "public", "retourvloot")
import sys
sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")))
from site_config import SITE, canonical, analytics_head  # noqa: E402
ph = analytics_head("retourvloot")
r = lambda f: open(os.path.join(H, f), encoding="utf-8").read()

desc = "Run the Dutch East India Company from Amsterdam, 1602 to 1799. Send silver east, wait a year for letters from Batavia, chase the spice monopolies and keep the shareholders paid."
og = f'''<meta name="description" content="{desc}">
<meta property="og:type" content="website">
<meta property="og:title" content="Retourvloot">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{SITE}/retourvloot/">
<meta property="og:image" content="{SITE}/og-retourvloot.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{SITE}/og-retourvloot.jpg">
{canonical("/retourvloot/")}'''
icon = "<link rel=\"icon\" href=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%2326457d'/%3E%3Cpath d='M6 20h20l-3 5H9z M15 6v13 M15 7l7 9h-7z M14 9l-6 8h6z' fill='%23e9e8e1' stroke='%23e9e8e1' stroke-width='1.2'/%3E%3C/svg%3E\">"
body = r("body.html").replace('<span class="row"><button type="button" class="btn ghost small" id="credits">',
    '<span class="row"><a class="btn ghost small" href="/" style="text-decoration:none">Homo Ludens</a><button type="button" class="btn ghost small" id="credits">')
html = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
{og}
{icon}
{ph}
<script src="/feedback.js" defer data-game="retourvloot"></script>
<script src="/next.js" defer data-game="retourvloot"></script>
<style>html,body{{margin:0}}</style>
{r("head.html")}
</head>
<body>
{body}
<script>
{r("model.js")}
{r("events.js")}
{r("images.js")}
{r("tut.js")}
{r("ui.js")}
</script>
</body>
</html>
'''
os.makedirs(os.path.join(OUT, "img"), exist_ok=True)
open(os.path.join(OUT, "index.html"), "w", encoding="utf-8", newline="\n").write(html)
for f in os.listdir(os.path.join(H, "img")):
    shutil.copy(os.path.join(H, "img", f), os.path.join(OUT, "img", f))
if os.path.exists(os.path.join(H, "og-retourvloot.jpg")):
    shutil.copy(os.path.join(H, "og-retourvloot.jpg"), os.path.join(ROOT, "public", "og-retourvloot.jpg"))
print("built", OUT)
