"""Build Kantar into ../../public/kantar/ (python3 src/kantar/build_kantar.py, from anywhere).

kantar.html is the whole game in one self-contained page (art, symbols and background embedded, sounds
synthesised). It is the site copy of the standalone build in the Claude project (v2.7 + portal link,
history notes and resume analytics). This script adds the shared head (meta, canonical, icon, analytics,
feedback button, image preloads), moves every embedded picture to img/ (the built page carries no image data)
and copies the share image and the portal plate.
"""
import os, re, shutil, sys
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
<script src="/next.js" defer data-game="kantar"></script>
<script src="/hl.js" defer data-game="kantar"></script>'''
src = open(os.path.join(H, "kantar.html"), encoding="utf-8").read()
# Painted art (art/*.webp at game size; full size in art/master/; prompts and review in art-studio.html), as CSS
# variables + art.css; the files themselves are served from img/ (see below).
# The four goods' card art lives in kantar.html itself (FULL_ART), so the bare source still plays; the build moves it to img/.
import base64
ART_VARS = {  # css variable -> art file
    "cirak": "ka_rival_cirak", "usta": "ka_rival_usta", "seal-uc": "ka_seal_threepans", "seal-kes": "ka_seal_cut",
    "ic-S": "ka_icon_S", "ic-I": "ka_icon_I", "ic-K": "ka_icon_K", "ic-B": "ka_icon_B", 
    "coin": "ka_coin", "light": "ka_lightload", "burn": "ka_burn", "narh": "ka_narh", "emblem": "ka_emblem",
    "beam": "ka_scale_beam", "pan": "ka_scale_pan", "stand": "ka_scale_stand",
    "cardback": "ka_cardback", "bg-tall": "ka_bg_tall",
    # optional: used when the file exists (art.css falls back to ka_end / the pan bowl)
    "end-win-cirak": "ka_end_win_cirak", "end-lose-cirak": "ka_end_lose_cirak", "end-draw-cirak": "ka_end_draw_cirak",
    "end-win-usta": "ka_end_win_usta", "end-lose-usta": "ka_end_lose_usta", "end-draw-usta": "ka_end_draw_usta",
    "tray": "ka_tray", "caravan": "ka_caravan", "advisor": "ka_advisor",
    # the Market panel: out-of-the-game chest, the goods table's weights and its two row glyphs (market-studio.html)
    "out": "ka_out", "weights": "ka_weights", "gl-count": "ka_gl_count", "gl-value": "ka_gl_value",
}
OPTIONAL = {"end-win-cirak", "end-lose-cirak", "end-draw-cirak", "end-win-usta", "end-lose-usta", "end-draw-usta", "tray", "caravan", "advisor"}
ART_VARS = {v: f for v, f in ART_VARS.items() if v not in OPTIONAL or os.path.exists(os.path.join(H, "art", f + ".webp"))}
# All art is served as cacheable files in img/ (relative URLs, so the itch.io / CrazyGames packages, which copy
# kantar/img to img/, keep working): the page itself carries no image data (it was 1.17 MB with 945 KB of data: URIs).
os.makedirs(os.path.join(OUT, "img"), exist_ok=True)
def _put(name, data):
    with open(os.path.join(OUT, "img", name), "wb") as fh:
        fh.write(data)
    return "img/" + name
for v, f in ART_VARS.items():
    shutil.copy(os.path.join(H, "art", f + ".webp"), os.path.join(OUT, "img", f + ".webp"))
_art = (":root{" + ";".join(f"--ka-{v}:url(img/{f}.webp)" for v, f in ART_VARS.items()) + "}\n"
        + open(os.path.join(H, "art.css"), encoding="utf-8").read())
assert src.count("/*KANTAR_ART*/") == 1
src = src.replace("/*KANTAR_ART*/", _art, 1)
# the bare source's own embedded images: CSS variables (--seal, --bazaar) and the goods' card art (FULL_ART)
EXT = {"png": "png", "webp": "webp", "jpeg": "jpg"}
def _css_var(m):
    return f"--{m.group(1)}:url({_put('ka_css_' + m.group(1) + '.' + EXT[m.group(2)], base64.b64decode(m.group(3)))})"
src, n = re.subn(r'--([\w-]+):url\("?data:image/(png|webp|jpeg);base64,([A-Za-z0-9+/=]+)"?\)', _css_var, src)
assert n >= 2, "embedded CSS images not found"
import json
fa = re.search(r"const FULL_ART=(\{.*?\});", src)
assert fa, "FULL_ART not found"
FA = json.loads(fa.group(1))
CARD = {c: _put(f"ka_card_{c}.webp", base64.b64decode(u.split(",", 1)[1])) for c, u in FA.items()}
src = src.replace(fa.group(0), "const FULL_ART=" + json.dumps(CARD) + ";", 1)
assert "data:image/webp" not in src and "data:image/png" not in src, "an image is still inlined"
# favicon: the brass steelyard emblem (a file too)
icon = f'<link rel="icon" type="image/png" href="{_put("favicon-64.png", open(os.path.join(H, "art", "favicon-64.png"), "rb").read())}">'
head = re.sub(r'<link rel="icon"[^>]*>', lambda m: icon, head, count=1)
# the first screen: the background (wide or tall, by the same media query as art.css), the scale and the goods' card art
# (drawn by script, so the browser would find it late)
_wide, _tall = "(min-width:701px) and (min-aspect-ratio:4/5)", "(max-width:700px),(max-aspect-ratio:4/5)"
head += "".join(f'\n<link rel="preload" as="image" href="{h}" type="image/webp"{f" media={chr(34)}{m}{chr(34)}" if m else ""}>' for h, m in [
    ("img/ka_css_bazaar.webp", _wide), ("img/ka_bg_tall.webp", _tall), ("img/ka_scale_beam.webp", ""), ("img/ka_scale_pan.webp", ""), ("img/ka_scale_stand.webp", "")] + [(h, "") for h in CARD.values()])
anchor = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
assert anchor in src
with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8", newline="\n") as fh:
    fh.write(src.replace(anchor, anchor + "\n" + head, 1))
shutil.copy(os.path.join(H, f"plate-{ART}.jpg"), os.path.join(OUT, "img", "portal-plate.jpg"))
shutil.copy(os.path.join(H, f"og-{ART}.jpg"), os.path.join(ROOT, "public", "og-kantar.jpg"))
print("built", OUT)
