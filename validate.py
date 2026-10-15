#!/usr/bin/env python3
"""Checks the built site in public/. Exit code 1 on any problem.

- games.json: valid JSON, required fields, unique ids, url/image exist
- the game registry is in sync: every games.json id is known to worker.js and linked from the portal
- every HTML page: no unfilled {{PLACEHOLDERS}}, a <title>, local src/href targets exist,
  og:image points at an existing file
- every JSON file in public/ parses; sitemap URLs exist
"""
import glob, json, os, re, sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(ROOT, "public")
sys.path.insert(0, os.path.join(ROOT, "src"))
from site_config import SITE  # noqa: E402

errors = []
def err(msg): errors.append(msg)

def local_path(u, base_dir):
    """Map a site URL to a file in public/, or None if it isn't a local static file."""
    u = u.split("#")[0].split("?")[0]
    if u.startswith(SITE):
        u = u[len(SITE):] or "/"
    if not u or re.match(r"^[a-z]+:", u) or u.startswith("//") or "${" in u or "{{" in u:
        return None
    if u.startswith("/api/") or u.startswith("/borderlines/s/"):
        return None  # served by worker.js
    p = os.path.join(PUB, u.lstrip("/")) if u.startswith("/") else os.path.join(base_dir, u)
    p = os.path.normpath(p)
    if u.endswith("/") or os.path.isdir(p):
        p = os.path.join(p, "index.html")
    return p

# ---- games.json
REQ = {"id": str, "no": int, "title": str, "url": str, "image": str, "short": str, "announce": str}
try:
    games = json.load(open(os.path.join(PUB, "games.json"), encoding="utf-8"))
except Exception as e:
    games = []; err(f"games.json does not parse: {e}")
ids = [g.get("id") for g in games]
if len(set(ids)) != len(ids): err(f"games.json: duplicate ids {ids}")
for g in games:
    for k, t in REQ.items():
        if not isinstance(g.get(k), t) or (t is str and not g[k].strip()):
            err(f"games.json {g.get('id')}: field '{k}' missing or not {t.__name__}")
    if not re.fullmatch(r"[a-z]+", str(g.get("id", ""))): err(f"games.json: id '{g.get('id')}' must be lowercase letters (admin URLs rely on it)")
    for k in ("url", "image"):
        p = local_path(str(g.get(k, "")), PUB)
        if p and not os.path.exists(p): err(f"games.json {g.get('id')}: {k} {g.get(k)} not found")

# ---- registry sync
worker = open(os.path.join(ROOT, "worker.js"), encoding="utf-8").read()
m = re.search(r"const GAMES = \{([^}]*)\}", worker)
known = set(re.findall(r"(\w+):", m.group(1))) if m else set()
portal = open(os.path.join(PUB, "index.html"), encoding="utf-8").read()
for g in games:
    if g.get("id") not in known: err(f"worker.js GAMES does not know '{g.get('id')}' (feedback would file it under Portal)")
    if f'href="{g.get("url")}"' not in portal: err(f"portal does not link to {g.get('url')}")

# ---- HTML pages
class Refs(HTMLParser):
    def __init__(self):
        super().__init__(); self.refs = []; self.title = False; self.og = None
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "title": self.title = True
        if tag == "meta" and a.get("property") == "og:image": self.og = a.get("content")
        for k in ("src", "href"):
            v = a.get(k)
            if v and not (tag == "link" and a.get("rel") in ("preconnect", "dns-prefetch")):
                self.refs.append(v)

pages = sorted(glob.glob(os.path.join(PUB, "**", "*.html"), recursive=True))
for f in pages:
    rel = os.path.relpath(f, ROOT)
    s = open(f, encoding="utf-8").read()
    left = sorted(set(re.findall(r"\{\{[A-Z_]+\}\}", s)))
    if left: err(f"{rel}: unfilled placeholders {left}")
    r = Refs()
    try: r.feed(s)
    except Exception as e: err(f"{rel}: HTML parse error {e}")
    if not r.title: err(f"{rel}: no <title>")
    if r.og:
        p = local_path(r.og, os.path.dirname(f))
        if p and not os.path.exists(p): err(f"{rel}: og:image {r.og} not found")
    for u in r.refs:
        p = local_path(u, os.path.dirname(f))
        if p and not os.path.exists(p): err(f"{rel}: link/asset {u} not found")

# ---- JSON + sitemap
for f in glob.glob(os.path.join(PUB, "**", "*.json"), recursive=True):
    try: json.load(open(f, encoding="utf-8"))
    except Exception as e: err(f"{os.path.relpath(f, ROOT)}: invalid JSON ({e})")
sm = os.path.join(PUB, "sitemap.xml")
if os.path.exists(sm):
    for loc in re.findall(r"<loc>([^<]+)</loc>", open(sm, encoding="utf-8").read()):
        p = local_path(loc, PUB)
        if not loc.startswith(SITE): err(f"sitemap: {loc} is not on {SITE}")
        elif p and not os.path.exists(p): err(f"sitemap: {loc} not found")

print(f"validate: {len(pages)} pages, {len(games)} games checked")
if errors:
    print(f"{len(errors)} problem(s):"); [print("  -", e) for e in errors]; sys.exit(1)
print("validate: OK")
