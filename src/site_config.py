"""Site-wide settings and helpers shared by the build scripts.

SITE is the public origin. When the site moves to homoludens.games, change it here and run
`python3 build.py`: every page's OG tags, canonical links, sitemap.xml and robots.txt follow.
"""
import json, os

SITE = "https://homoludens.onuralp.co"

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))


def games():
    with open(os.path.join(ROOT, "public", "games.json"), encoding="utf-8") as fh:
        return json.load(fh)


# The author, as on the hub at onuralp.co (its Person JSON-LD has this @id), so search engines tie the games to him.
AUTHOR = {"@type": "Person", "@id": "https://onuralp.co/#me", "name": "Onuralp Çakır", "url": "https://onuralp.co/"}


def ld_script(data):
    """A <script type="application/ld+json"> block (safe to put inline: no "</" survives)."""
    return ('<script type="application/ld+json">' +
            json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/") + "</script>")


def video_game(g):
    """schema.org VideoGame for one games.json entry."""
    return {
        "@type": "VideoGame",
        "name": g["title"],
        "url": SITE + g["url"],
        "description": g["short"],
        "image": SITE + g["image"],
        "genre": "Historical",
        "gamePlatform": "Web browser",
        "applicationCategory": "Game",
        "operatingSystem": "Any",
        "isAccessibleForFree": True,
        "author": AUTHOR,
        "isPartOf": {"@type": "WebSite", "@id": SITE + "/#website", "name": "Homo Ludens", "url": SITE + "/"},
    }


def game_ld(game_id):
    """The VideoGame JSON-LD block for a game page (game_id as in games.json)."""
    for g in games():
        if g["id"] == game_id:
            return ld_script(dict({"@context": "https://schema.org"}, **video_game(g)))
    raise KeyError(game_id)


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
