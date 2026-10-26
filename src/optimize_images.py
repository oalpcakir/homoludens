"""Shrink the game art that ships with the pages. Run by hand after adding or replacing art, then rebuild:

    python3 src/optimize_images.py          # re-encode what is new, report the savings
    python3 src/optimize_images.py --dry    # only report

What it touches (all in src/, never public/):
- game-size WebP art: src/kantar/art/*.webp, src/polder/art/*.webp
- WebP data URIs inside src/tulip7/art.js and src/kantar/kantar.html (the goods' card art)
- portal plates (the cover on each portal card): resized to PLATE_W wide (the cards are at most ~340 CSS px,
  so this is still sharp on a 2x screen) and saved as progressive JPEG
Full-size masters (art/master/) are never touched, so nothing is lost: to redo an image, export it again from
the master or the art pack.

An image is only replaced when the new file is at least MIN_SAVING smaller, and every output's hash is listed in
src/optimized-images.json, so running this again never re-encodes an image twice (no generation loss).
Needs Pillow (pip install pillow); the site build itself does not.
"""
import base64, glob, hashlib, io, json, os, re, sys

from PIL import Image

H = os.path.dirname(os.path.abspath(__file__))
LEDGER = os.path.join(H, "optimized-images.json")
WEBP = dict(quality=82, method=6, alpha_quality=80)
JPEG = dict(quality=80, optimize=True, progressive=True)
MIN_SAVING = 0.15
PLATE_W = 760
DRY = "--dry" in sys.argv

done = set(json.load(open(LEDGER))) if os.path.exists(LEDGER) else set()
total = [0, 0]


def sha(b):
    return hashlib.sha256(b).hexdigest()[:16]


def webp(b):
    """Re-encode WebP bytes; return the new bytes, or None to keep the original."""
    if sha(b) in done:
        return None
    im = Image.open(io.BytesIO(b))
    im = im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") or "transparency" in im.info else im.convert("RGB")
    out = io.BytesIO()
    im.save(out, "WEBP", **WEBP)
    nb = out.getvalue()
    if len(nb) > len(b) * (1 - MIN_SAVING):
        done.add(sha(b))  # already tight: remember it, don't try again
        return None
    done.add(sha(nb))
    return nb


def report(name, old, new):
    total[0] += old
    total[1] += new
    if old != new:
        print(f"  {name:44s} {old // 1024:5d} KB -> {new // 1024:5d} KB")


def files(pattern):
    for f in sorted(glob.glob(os.path.join(H, pattern))):
        b = open(f, "rb").read()
        nb = webp(b)
        report(os.path.relpath(f, H), len(b), len(nb or b))
        if nb and not DRY:
            open(f, "wb").write(nb)


def uris(path):
    s = open(path, encoding="utf-8").read()
    def sub(m):
        b = base64.b64decode(m.group(1))
        nb = webp(b)
        report(f"{os.path.relpath(path, H)} [{len(b) // 1024} KB image]", len(b), len(nb or b))
        return "data:image/webp;base64," + base64.b64encode(nb).decode() if nb else m.group(0)
    ns = re.sub(r"data:image/webp;base64,([A-Za-z0-9+/=]{4000,})", sub, s)
    if ns != s and not DRY:
        open(path, "w", encoding="utf-8", newline="\n").write(ns)


def plate(path):
    b = open(path, "rb").read()
    if sha(b) in done:
        report(os.path.relpath(path, H), len(b), len(b))
        return
    im = Image.open(path).convert("RGB")
    if im.width > PLATE_W:
        im = im.resize((PLATE_W, round(im.height * PLATE_W / im.width)), Image.LANCZOS)
    out = io.BytesIO()
    im.save(out, "JPEG", **JPEG)
    nb = out.getvalue()
    if len(nb) > len(b) * (1 - MIN_SAVING):
        done.add(sha(b))
        nb = b
    else:
        done.add(sha(nb))
        if not DRY:
            open(path, "wb").write(nb)
    report(os.path.relpath(path, H), len(b), len(nb))


print("game art (WebP files)")
files("kantar/art/*.webp")
files("polder/art/*.webp")
print("game art (inline)")
uris(os.path.join(H, "tulip7", "art.js"))
uris(os.path.join(H, "kantar", "kantar.html"))
print("portal plates")
for p in ("kantar/plate-a.jpg", "kantar/plate-b.jpg", "cupoftea/portal-plate.jpg", "polder/portal-plate.jpg", "tulip7/plate.jpg"):
    if os.path.exists(os.path.join(H, p)):
        plate(os.path.join(H, p))
print(f"total {total[0] // 1024} KB -> {total[1] // 1024} KB" + ("  (dry run, nothing written)" if DRY else ""))
if not DRY:
    json.dump(sorted(done), open(LEDGER, "w"), indent=0)
