#!/usr/bin/env python3
"""Build the portal: src/portal/portal.html -> public/index.html.

Placeholders: {{POSTHOG}} (shared analytics snippet), {{SITE}} (site origin for OG tags),
{{W}} {{H}} {{LAND}} {{REALM}} (the Borderlines map plate, from portal_svg.json).
The Borderlines builder patches the daily count (`days: N`) in portal.html, so run it first
(build.py does this).
"""
import json, os, re, sys

H = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(H, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "src"))
from site_config import SITE  # noqa: E402


def build():
    tpl = open(os.path.join(H, "portal.html"), encoding="utf-8").read()
    svg = json.load(open(os.path.join(H, "portal_svg.json"), encoding="utf-8"))
    ph = open(os.path.join(ROOT, "src", "borderlines", "posthog_head.html"), encoding="utf-8").read().strip()
    vals = {"POSTHOG": ph, "SITE": SITE, "W": svg["W"], "H": svg["H"], "LAND": svg["land"], "REALM": svg["realm"]}
    out = re.sub(r"\{\{([A-Z]+)\}\}", lambda m: str(vals[m.group(1)]), tpl)
    left = re.findall(r"\{\{[A-Z]+\}\}", out)
    if left:
        raise SystemExit(f"unfilled placeholders: {left}")
    dst = os.path.join(ROOT, "public", "index.html")
    with open(dst, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(out)
    print(f"built {dst}")


if __name__ == "__main__":
    build()
