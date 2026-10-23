#!/usr/bin/env python3
"""Build the portal: src/portal/portal.html -> public/index.html.

Placeholders: {{POSTHOG}} (shared analytics snippet), {{SITE}} (site origin for OG tags),
{{W}} {{H}} {{LAND}} {{REALM}} (the Borderlines map plate, from portal_svg.json).
Also writes public/sitemap.xml and public/robots.txt from the templates here.
The Borderlines builder patches the daily count (`days: N`) in portal.html, so run it first
(build.py does this).
"""
import json, os, re, sys

H = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(H, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "src"))
from site_config import SITE, analytics_head  # noqa: E402


def build():
    tpl = open(os.path.join(H, "portal.html"), encoding="utf-8").read()
    svg = json.load(open(os.path.join(H, "portal_svg.json"), encoding="utf-8"))
    ph = analytics_head("portal")
    vals = {"POSTHOG": ph, "SITE": SITE, "W": svg["W"], "H": svg["H"], "LAND": svg["land"], "REALM": svg["realm"]}
    # the "World map" tab: land, graticule and projection numbers ({{WORLD}} {{WGRAT}} {{WW}} {{WH}} {{MAPCFG}})
    sys.path.insert(0, H)
    import world_map  # noqa: E402
    vals.update(world_map.build())
    out = re.sub(r"\{\{([A-Z]+)\}\}", lambda m: str(vals[m.group(1)]), tpl)
    left = re.findall(r"\{\{[A-Z]+\}\}", out)
    if left:
        raise SystemExit(f"unfilled placeholders: {left}")
    dst = os.path.join(ROOT, "public", "index.html")
    with open(dst, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(out)
    print(f"built {dst}")
    # gameplay screenshots shown on the cards (hover): src/portal/shots/*.jpg -> public/shots/
    import shutil
    os.makedirs(os.path.join(ROOT, "public", "shots"), exist_ok=True)
    for f in sorted(os.listdir(os.path.join(H, "shots"))):
        shutil.copy(os.path.join(H, "shots", f), os.path.join(ROOT, "public", "shots", f))
    # sitemap.xml and robots.txt carry the site origin too
    for name in ("sitemap.xml", "robots.txt"):
        t = open(os.path.join(H, name), encoding="utf-8").read().replace("{{SITE}}", SITE)
        with open(os.path.join(ROOT, "public", name), "w", encoding="utf-8", newline="\n") as fh:
            fh.write(t)


if __name__ == "__main__":
    build()
