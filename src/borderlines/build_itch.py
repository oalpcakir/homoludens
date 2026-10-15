"""Write dist/itch/borderlines-itch.zip: the Borderlines page, ready to upload to itch.io as an HTML game.

Built from public/borderlines/index.html (run build_borderlines.py first). Differences from the site version:
- dailies and their tiers are fetched from the live site, so new months reach itch without a re-upload
  (needs the CORS lines in public/_headers to be deployed);
- links back to Homo Ludens open in a new tab instead of inside itch's frame;
- no feedback button (its Turnstile check only works on our own domain); players use itch comments;
- analytics events carry source = "itch".
Run from anywhere: python3 src/borderlines/build_itch.py
"""
import os, re, zipfile

H = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(H, "..", ".."))
import sys
sys.path.insert(0, os.path.normpath(os.path.join(H, "..")))
from site_config import SITE  # noqa: E402  (change it in src/site_config.py)
SRC = os.path.join(ROOT, "public", "borderlines", "index.html")
OUT = os.path.join(ROOT, "dist", "itch")

LOADER = """<script>
(function () {
  // Refresh the daily tiers from the site, then start the game (falls back to the built-in tiers).
  var started = false;
  function start() {
    if (started) return; started = true;
    var s = document.createElement("script");
    s.text = document.getElementById("hlGame").textContent;
    document.body.appendChild(s);
    ["portalLink", "btnMore"].forEach(function (id) { var a = document.getElementById(id); if (a) { a.target = "_blank"; a.rel = "noopener"; } });
  }
  var D = window.GAME_DATA;
  fetch("%s/borderlines/tiers.json", { cache: "no-cache" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (t) { if (t && t.start === D.dailyStart && Array.isArray(t.days) && t.days.length >= D.days.length) D.days = t.days; })
    .catch(function () {})
    .then(start);
  setTimeout(start, 4000);
})();
</script>
""" % SITE


def build():
    h = open(SRC, encoding="utf-8").read()

    cfg = re.search(r"window\.BORDERLINES_CONFIG = \{.*?\};", h, re.S)
    assert cfg, "config block not found"
    h = h.replace(cfg.group(0), f"""window.BORDERLINES_CONFIG = {{
    reportEndpoint: "",
    siteUrl: "{SITE}/borderlines/",
    portalUrl: "{SITE}/",
    daysUrl: "{SITE}/borderlines/days/"
  }};""")

    fb = '<script src="/feedback.js" defer data-game="borderlines"></script>'
    assert h.count(fb) == 1, "feedback script tag not found"
    h = h.replace(fb, '<script>try { posthog.register({ source: "itch" }); } catch (e) {}</script>')

    # The game itself is the last script; hold it until the tiers are refreshed.
    i = h.rindex("<script>")
    j = h.index("</script>", i)
    assert "window.__borderlines" in h[i:j], "game script not found"
    h = h[:i] + '<script type="text/plain" id="hlGame">' + h[i + len("<script>"):j] + "</script>\n" + LOADER + h[j + len("</script>"):]

    os.makedirs(OUT, exist_ok=True)
    zp = os.path.join(OUT, "borderlines-itch.zip")
    with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("index.html", h)
    print(f"built {zp} ({os.path.getsize(zp) // 1024} KB)")
    return h


if __name__ == "__main__":
    build()
