#!/usr/bin/env python3
"""Build the itch.io and CrazyGames packages of every game from the built site in public/.

    python3 build.py                                   build the site first (the packages are made from public/)
    python3 src/platform/build_platforms.py            all games, both platforms
    python3 src/platform/build_platforms.py kantar     one game, both platforms
    python3 src/platform/build_platforms.py --only itch

Writes dist/platforms/<platform>/<game>/ (unpacked, for local testing) and
dist/platforms/<platform>/<game>-<platform>.zip (upload this). index.html is at the root of every ZIP.

Nothing in the game code is copied or forked: each package is the site page plus
- src/platform/platform.js (the adapter: storage, SDK, sound, gameplay events, ads, links; see its header),
- a small per-game config below (what "playing" means, where midgame ads may go, what to hide),
- root-relative paths rewritten to paths inside the package.
CrazyGames packages: CrazyGames SDK v3, no PostHog, no feedback/next-game/share/portal links.
itch.io packages: PostHog kept (tagged source=itch), no feedback button (its Turnstile check only works on our
own domain), links to the site open in a new tab, the "next game" card links to the site.
"""
import json, os, re, shutil, sys, zipfile

H = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(H, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "src"))
from site_config import SITE  # noqa: E402

PUB = os.path.join(ROOT, "public")
OUT = os.path.join(ROOT, "dist", "platforms")
SDK_URL = "https://sdk.crazygames.com/crazygames-sdk-v3.js"  # docs.crazygames.com/sdk/html5-v3/intro (checked 2026-10-16)
D3_CDN = "https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"
D3_LOCAL = os.path.join(ROOT, "node_modules", "d3", "dist", "d3.min.js")

# Per-game settings. JS values are written into the page as they are.
GAMES = {
    "borderlines": {
        "pages": {"index.html": "borderlines/index.html"},
        "assets": [("borderlines/days", "days")],
        "playing": """function () { var $ = function (i) { return document.getElementById(i); };
            return !$('stage').classList.contains('idle') && $('end').hidden && $('stats').hidden && $('report').hidden && $('archive').hidden; }""",
        # new dailies: the list of days comes from the live site when it answers within 4 s, otherwise the package's copy
        "before": """function (P) {
            return fetch(P.site + '/borderlines/tiers.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; })
              .then(function (t) { window.__hlTiers = t; }).catch(function () {}); }""",
        "adBefore": ["#btnAgain"],
        "hide": {"crazygames": ["#btnShare", "#portalLink", "#btnMore", "#btnReport"], "itch": ["#btnReport"]},
        "keys": [],
    },
    "retourvloot": {
        "pages": {"index.html": "retourvloot/index.html"},
        "assets": [("retourvloot/img", "img")],
        "playing": "function () { return typeof S !== 'undefined' && S && !S.ended && !modalOpen && S.speed > 0; }",
        "adBefore": ["#m-new"],
        "hide": {"crazygames": ['a[href="/"]'], "itch": []},
        "keys": ["retourvloot.v1", "retourvloot.runs"],
    },
    "cupoftea": {
        "pages": {"index.html": "cupoftea/index.html", "2/index.html": "cupoftea/2/index.html", "3/index.html": "cupoftea/3/index.html"},
        "assets": [("cupoftea/img", "img")],
        "playing": "function () { var i = document.getElementById('intro'), d = document.getElementById('door'); return i && i.classList.contains('off') && !(d && d.classList.contains('on')); }",
        "adBefore": ['a.nextbtn[href$="index.html"]'],
        "hide": {"crazygames": ['a[href="/"]'], "itch": []},
        "keys": ["cupoftea.v1"],
    },
    "polder": {
        "pages": {"index.html": "polder/index.html"},
        "assets": [],
        "playing": None,  # Polder reports gameplay start/stop itself (PF in polder.html)
        "before": "function (P) { if (P.id === 'crazygames') window.POLDER_CG = true; }",
        "adBefore": [],  # its own midgame between regions and its rewarded "one more finger"
        "hide": {"crazygames": [], "itch": []},
        "keys": ["polder.progress.v1", "polder.run.v1", "polder.settings.v1"],
    },
    "kantar": {
        "pages": {"index.html": "kantar/index.html"},
        "assets": [],
        "playing": """function () { var $ = function (i) { return document.getElementById(i); };
            return typeof G !== 'undefined' && G && started && G.phase !== 'end' && $('rules').classList.contains('hide') && $('endM').classList.contains('hide') && $('statsM').classList.contains('hide'); }""",
        # first visit on CrazyGames: follow the platform's language when it is Turkish
        "before": "function (P) { try { if (!localStorage.getItem('kantar-lang') && /^tr/i.test(P.locale || navigator.language || '')) localStorage.setItem('kantar-lang', 'tr'); } catch (e) {} }",
        "adBefore": ["#again"],
        "hide": {"crazygames": ["#endShare", ".hl-back"], "itch": []},
        "keys": ["kantar-set", "kantar-lang", "kantar-game-v04", "kantar.stats.v1", "kantar.record.v1"],
    },
}

POSTHOG_RE = re.compile(r"<!-- Analytics: PostHog.*?</script>\s*", re.S)


def split_scripts(html):
    """Yield (before, open_tag, body, close) chunks the way an HTML parser sees <script> elements."""
    out, i = [], 0
    while True:
        a = html.find("<script", i)
        if a < 0:
            out.append((html[i:], None, None)); return out
        b = html.index(">", a) + 1
        c = html.index("</script>", b)
        out.append((html[i:a], html[a:b], html[b:c]))
        i = c + len("</script>")


def defer_scripts(html):
    """Hold every executable script until the adapter is ready (type="text/hl-deferred")."""
    res = []
    for before, tag, body in split_scripts(html):
        res.append(before)
        if tag is None:
            break
        typ = re.search(r'\stype="([^"]*)"', tag)
        if typ and typ.group(1) not in ("text/javascript", "module"):
            res.append(tag + body + "</script>"); continue
        src = re.search(r'\ssrc="([^"]*)"', tag)
        if src:
            res.append(f'<script type="text/hl-deferred" data-src="{src.group(1)}"' + re.sub(r'\s(src|type|defer|async)(="[^"]*")?', "", tag[len("<script"):]) + "</script>")
        else:
            res.append('<script type="text/hl-deferred">' + body + "</script>")
    return "".join(res)


def js_config(game, platform, cfg):
    hide = cfg["hide"].get(platform, [])
    parts = [f"id: {json.dumps(platform)}", f"game: {json.dumps(game)}", f"site: {json.dumps(SITE)}",
             f"adBefore: {json.dumps(cfg['adBefore'] if platform == 'crazygames' else [])}",
             f"hide: {json.dumps(hide)}", f"keys: {json.dumps(cfg['keys'])}"]
    if cfg.get("playing"):
        parts.append("playing: " + cfg["playing"])
    if cfg.get("before"):
        parts.append("before: " + cfg["before"])
    return "<script>window.HL_PLATFORM = {\n  " + ",\n  ".join(parts) + "\n};</script>\n"


def page_for(game, platform, cfg, rel_out, src_rel):
    html = open(os.path.join(PUB, src_rel), encoding="utf-8").read()
    up = "../" * rel_out.count("/")
    # site services
    html = re.sub(r'<script src="/feedback\.js"[^>]*></script>\n?', "", html)
    nxt = re.search(r'<script src="/next\.js"[^>]*></script>', html)
    if nxt:
        html = html.replace(nxt.group(0), "" if platform == "crazygames" else
                            f'<script src="{up}next.js" defer data-game="{game}" data-base="{SITE}"></script>')
    if platform == "crazygames":
        html = POSTHOG_RE.sub("", html)
    else:
        m = POSTHOG_RE.search(html)
        if m:
            html = html.replace(m.group(0), m.group(0) + '<script>try { posthog.register({ source: "itch" }); } catch (e) {}</script>\n')
    # game-specific paths
    if game == "borderlines":
        cfg_re = re.search(r"window\.BORDERLINES_CONFIG = \{.*?\};", html, re.S)
        assert cfg_re, "BORDERLINES_CONFIG not found"
        cg = platform == "crazygames"
        html = html.replace(cfg_re.group(0), "window.BORDERLINES_CONFIG = " + json.dumps({
            "reportEndpoint": "", "siteUrl": "" if cg else SITE + "/borderlines/", "portalUrl": "" if cg else SITE + "/",
            "daysUrl": SITE + "/borderlines/days/", "daysFallback": "days/"}) + ";")
        assert html.count(D3_CDN) == 1, "D3 script not found"
        html = html.replace(D3_CDN, "d3.min.js")
        # the live list of dailies (fetched in "before"), applied once the page data exists
        marker = "window.GAME_DATA"
        i = html.index(marker); j = html.index("</script>", i)
        html = html[:j + 9] + """
<script>(function () { var t = window.__hlTiers, D = window.GAME_DATA;
  if (t && D && t.start === D.dailyStart && Array.isArray(t.days) && t.days.length >= D.days.length) D.days = t.days; })();</script>""" + html[j + 9:]
    if game == "cupoftea":
        html = html.replace('"/cupoftea/img/', f'"{up}img/')
        html = html.replace('href="/cupoftea/${k>1?k+"/":""}"', f'href="{up}' + '${k>1?k+"/":""}index.html"')
        html = html.replace('href="/cupoftea/2/"', f'href="{up}2/index.html"').replace('href="/cupoftea/3/"', f'href="{up}3/index.html"')
        html = html.replace('href="/cupoftea/"', f'href="{up}index.html"')
        assert "/cupoftea/" not in re.sub(r"https?://\S+", "", html), "root path left in A Cup of Tea"
    # adapter first, before any game script
    head = js_config(game, platform, cfg)
    if platform == "crazygames":
        head = f'<script src="{SDK_URL}"></script>\n' + head
    head += f'<script src="{up}platform.js"></script>\n'
    anchor = '<meta name="viewport" content="width=device-width, initial-scale=1">'
    if anchor not in html:
        anchor = re.search(r'<meta name="viewport"[^>]*>', html).group(0)
    a = html.index(anchor) + len(anchor)
    html = html[:a] + "\n" + head + defer_scripts(html[a:])
    # the adapter's own tags must stay executable
    return html


def build(game, platform):
    cfg = GAMES[game]
    d = os.path.join(OUT, platform, game)
    shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
    for rel_out, src_rel in cfg["pages"].items():
        os.makedirs(os.path.dirname(os.path.join(d, rel_out)) or d, exist_ok=True)
        with open(os.path.join(d, rel_out), "w", encoding="utf-8", newline="\n") as fh:
            fh.write(page_for(game, platform, cfg, rel_out, src_rel))
    for src, dst in cfg["assets"]:
        sp = os.path.join(PUB, src)
        if os.path.isdir(sp):
            shutil.copytree(sp, os.path.join(d, dst), ignore=shutil.ignore_patterns("portal-plate.jpg"))
    shutil.copy(os.path.join(H, "platform.js"), os.path.join(d, "platform.js"))
    if platform == "itch":
        shutil.copy(os.path.join(PUB, "next.js"), os.path.join(d, "next.js"))
    if game == "borderlines":
        if not os.path.exists(D3_LOCAL):
            raise SystemExit("node_modules/d3 missing: run `npm ci` first (the package ships D3 instead of loading it from a CDN)")
        shutil.copy(D3_LOCAL, os.path.join(d, "d3.min.js"))
    # checks: every local reference resolves inside the package, no root-relative asset paths
    files = []
    for base, _, names in os.walk(d):
        for n in names:
            files.append(os.path.relpath(os.path.join(base, n), d).replace(os.sep, "/"))
    for f in files:
        if f.endswith(".html"):
            h = open(os.path.join(d, f), encoding="utf-8").read()
            for ref in re.findall(r'(?:src|data-src)="([^"#]+)"', h):
                if re.match(r"^(https?:|data:|\$\{)", ref):
                    continue
                p = os.path.normpath(os.path.join(os.path.dirname(f), ref)).replace(os.sep, "/")
                if p not in files:
                    raise SystemExit(f"{platform}/{game}/{f}: {ref} is not in the package")
    assert "index.html" in files and len(files) < 1000
    zp = os.path.join(OUT, platform, f"{game}-{platform}.zip")
    with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(files):
            z.write(os.path.join(d, f), f)
    print(f"  {platform:10} {game:12} {len(files):4} files  {os.path.getsize(zp) / 1e6:5.2f} MB  {os.path.relpath(zp, ROOT)}")
    return zp


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    if only:
        args = [a for a in args if a != only]
    games = args or list(GAMES)
    platforms = [only] if only else ["itch", "crazygames"]
    for g in games:
        if g not in GAMES:
            raise SystemExit(f"unknown game {g}")
    print("building packages from public/ (run python3 build.py first if sources changed)")
    for p in platforms:
        for g in games:
            build(g, p)


if __name__ == "__main__":
    main()
