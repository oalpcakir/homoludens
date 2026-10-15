"""Write public/borderlines/index.html from game.html + data/base.json + the day files.

The page only carries the practice pool, the base map and each day's difficulty tiers. The realms of each
daily live in public/borderlines/days/<n>.json and are fetched when that day is played, so the page stays
small however many days there are and future answers are not in the page source.

Also writes public/borderlines/tiers.json (read by the itch.io build) and updates the daily count the portal uses for its "Today" box (public/index.html, src/portal/portal.html).
Run from anywhere: python3 src/borderlines/build_borderlines.py
"""
import json, os, re, glob

H = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(H, "..", ".."))
PUB = os.path.join(ROOT, "public")
DAYS = os.path.join(PUB, "borderlines", "days")
import sys
sys.path.insert(0, os.path.normpath(os.path.join(H, "..")))
from site_config import SITE, canonical, analytics_head  # noqa: E402


def og(title, desc, url, img):
    return (f'<meta property="og:type" content="website">\n<meta property="og:title" content="{title}">\n'
            f'<meta property="og:description" content="{desc}">\n<meta property="og:url" content="{url}">\n'
            f'<meta property="og:image" content="{img}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'
            f'<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:image" content="{img}">\n')


def day_count():
    n = 0
    while os.path.exists(os.path.join(DAYS, f"{n + 1}.json")):
        n += 1
    extra = len(glob.glob(os.path.join(DAYS, "*.json")))
    assert extra == n, f"day files are not numbered 1..{n} without gaps"
    return n


def build():
    base = json.load(open(os.path.join(H, "data", "base.json"), encoding="utf-8"))
    n = day_count()
    tiers = []
    for i in range(n):
        day = json.load(open(os.path.join(DAYS, f"{i + 1}.json"), encoding="utf-8"))
        assert len(day) == 5 and [q["id"] for q in day] == [f"d{i + 1}-{j + 1}" for j in range(5)], f"day {i + 1} is malformed"
        tiers.append([q["tier"] for q in day])
    data = dict(base, days=tiers)
    data_js = "window.GAME_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"

    ph = analytics_head("borderlines")
    g = open(os.path.join(H, "game.html"), encoding="utf-8").read().replace("/*DATA*/", data_js)
    head = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="A daily history map game. Paint the land a historical realm ruled, then see how close you came.">
{og("Borderlines", "You get a year and a realm. Paint the land it ruled. A daily history map game.", SITE + "/borderlines/", SITE + "/og-borderlines.png")}{canonical("/borderlines/")}
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%231f2b4a'/%3E%3Cpath d='M7 22l6-12 5 8 3-4 4 8z' fill='%23f7f6f2'/%3E%3C/svg%3E">
<script>
  window.BORDERLINES_CONFIG = {{
    reportEndpoint: "",
    siteUrl: "{SITE}/borderlines/",
    portalUrl: "/",
    daysUrl: "/borderlines/days/"
  }};
</script>
{ph}
<script src="/feedback.js" defer data-game="borderlines"></script>
<style>html,body{{margin:0}}[hidden]{{display:none!important}}</style>
'''
    i = g.index('<div id="app">')
    out = os.path.join(PUB, "borderlines", "index.html")
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(head + g[:i] + "</head>\n<body>\n" + g[i:] + "\n</body>\n</html>\n")

    # The itch.io build ships with the tiers it was built with and refreshes them from this file,
    # so new monthly dailies reach it without a re-upload (CORS for it is set in public/_headers).
    with open(os.path.join(PUB, "borderlines", "tiers.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"start": base["dailyStart"], "days": tiers}, fh, separators=(",", ":"))

    # The portal's "Today" box needs to know how many dailies exist.
    for p in (os.path.join(PUB, "index.html"), os.path.join(ROOT, "src", "portal", "portal.html")):
        if not os.path.exists(p):
            continue
        s = open(p, encoding="utf-8").read()
        t = re.sub(r'(start: "' + re.escape(base["dailyStart"]) + r'", days: )\d+', rf"\g<1>{n}", s)
        if t != s:
            with open(p, "w", encoding="utf-8", newline="\n") as fh:
                fh.write(t)
    print(f"built {out}: {n} dailies, page {os.path.getsize(out) // 1024} KB")
    return n


if __name__ == "__main__":
    build()
