"""Site-wide settings and helpers shared by the build scripts.

SITE is the public origin. When the site moves to homoludens.games, change it here and run
`python3 build.py`: every page's OG tags, canonical links, sitemap.xml and robots.txt follow.
"""
import json, os

SITE = "https://homoludens.oalpcakir.workers.dev"

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))


def games():
    with open(os.path.join(ROOT, "public", "games.json"), encoding="utf-8") as fh:
        return json.load(fh)


def canonical(path):
    """<link rel="canonical"> for a site path such as "/polder/"."""
    return f'<link rel="canonical" href="{SITE}{path}">'


def analytics_head(game):
    """The shared PostHog snippet, tagged with the game id and its version from games.json."""
    with open(os.path.join(ROOT, "src", "borderlines", "posthog_head.html"), encoding="utf-8") as fh:
        ph = fh.read().strip()
    version = "site"
    for g in games():
        if g["id"] == game:
            version = str(g.get("version", "1"))
    return ph.replace("{{HL_GAME}}", game).replace("{{HL_VERSION}}", version)
