"""Monthly Borderlines content: keep the daily schedule about five weeks ahead.

Run by .github/workflows/borderlines-monthly.yml on the 1st of every month. It
  1. works out how many new days are needed so the last daily is at least AHEAD days after today,
  2. picks realms for them from catalog.py (plus every realm used before, for occasional reruns),
     checking each one against the historical-basemaps data (shape exists, big enough, capital inside),
  3. writes public/borderlines/days/<n>.json and records the picks in data/history.json,
  4. writes their border time-lapse files (build_lapse.py) and rebuilds public/borderlines/index.html and the portal's daily count.

Picking rules: each day has 1 hard realm, 1–2 easy ones and the rest medium. A realm is chosen by
least-recent use, so every realm comes round before any repeats; a realm + year pair is not reused
within REPEAT_GAP days. Choices are seeded by the day number, so a rerun gives the same days.

Usage: python3 src/borderlines/auto_update.py --data <historical-basemaps/geojson> [--today YYYY-MM-DD] [--ahead 36] [--dry-run]
"""
import argparse, colorsys, datetime as dt, hashlib, json, os, random, sys
from shapely.geometry import shape, mapping, box, MultiPolygon, Point
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

H = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, H)
ROOT = os.path.normpath(os.path.join(H, "..", ".."))
DAYS = os.path.join(ROOT, "public", "borderlines", "days")
HIST = os.path.join(H, "data", "history.json")
BASE = os.path.join(H, "data", "base.json")

AHEAD = 36          # keep at least this many days of dailies after today
REPEAT_GAP = 365    # never rerun the same realm in the same year within this many days
MIN_AREA = 1.5      # square degrees; smaller realms are too fiddly to paint
YEARS = ["bc3000", "bc2000", "bc1500", "bc1000", "bc700", "bc500", "bc400", "bc323", "bc300", "bc200", "bc100", "bc1",
         "100", "200", "300", "400", "500", "600", "700", "800", "900", "1000", "1100", "1200", "1279", "1300", "1400",
         "1492", "1500", "1530", "1600", "1650", "1700", "1715", "1783", "1800", "1815", "1878", "1880", "1900", "1914",
         "1920", "1930", "1938", "1945", "1960", "1994"]


def year_num(y): return -int(y[2:]) if y.startswith("bc") else int(y)
def year_label(y): return f"{y[2:]} BC" if y.startswith("bc") else y


def rnd(o, nd):
    if isinstance(o, float): return round(o, nd)
    if isinstance(o, (list, tuple)): return [rnd(x, nd) for x in o]
    return o


def d3orient(g):
    if g.geom_type == "Polygon": return orient(g, -1.0)
    if g.geom_type == "MultiPolygon": return MultiPolygon([orient(p, -1.0) for p in g.geoms])
    return g


def band(hexc):
    r, g_, b = (int(hexc[i:i + 2], 16) / 255 for i in (1, 3, 5))
    h, l, s = colorsys.rgb_to_hls(r, g_, b)
    l = min(max(l, 0.30), 0.48); s = min(max(s, 0.08), 0.62)
    r, g_, b = colorsys.hls_to_rgb(h, l, s)
    return "#%02x%02x%02x" % tuple(round(v * 255) for v in (r, g_, b))


def drop_outliers(g):
    """Drop small far-flung pieces (an island colony in the Caribbean for a European kingdom, say):
    they add almost nothing to the score but make the answer sprawl across half the world."""
    if g.geom_type != "MultiPolygon":
        return g
    parts = sorted(g.buffer(0).geoms if g.buffer(0).geom_type == "MultiPolygon" else [g.buffer(0)], key=lambda p: -p.area)
    keep, rest = [parts[0]], parts[1:]
    big = lambda p: p.area >= 3 or p.area >= 0.1 * g.area
    changed = True
    while changed:  # keep anything sizeable, and anything within 15 degrees of what is kept
        changed = False
        for p in list(rest):
            if big(p) or min(p.distance(k) for k in keep) <= 15:
                keep.append(p); rest.remove(p); changed = True
    return unary_union(keep) if rest else g


class Basemaps:
    def __init__(self, folder):
        self.folder, self.cache, self.shapes = folder, {}, {}

    def world(self, y):
        if y not in self.cache:
            p = os.path.join(self.folder, f"world_{y}.geojson")
            self.cache[y] = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {"features": []}
        return self.cache[y]

    def shape(self, y, name):
        """Same clean-up as prep3.py: clip, simplify, drop specks. None if missing or unusable."""
        k = (y, name)
        if k not in self.shapes:
            parts = [shape(f["geometry"]).buffer(0) for f in self.world(y)["features"]
                     if f["properties"].get("NAME") == name and f.get("geometry")]
            g = None
            if parts:
                g = unary_union(parts).intersection(box(-170, -58, 180, 84)).simplify(0.03, preserve_topology=True)
                if g.geom_type == "MultiPolygon":
                    big = max(p.area for p in g.geoms)
                    g = unary_union([p for p in g.geoms if p.area > max(0.05, min(0.3, big * 0.004))])
                    g = drop_outliers(g)
                if g.is_empty or g.geom_type not in ("Polygon", "MultiPolygon") or g.bounds[2] - g.bounds[0] >= 300:
                    g = None
            self.shapes[k] = g
        return self.shapes[k]


def options(bm):
    """Every askable (realm, year): catalog ranges plus every realm used before (same year, same note)."""
    from catalog import CATALOG
    from questions import POOL, DAILY
    from basics import BASICS
    from daily30 import NEW
    from meta import META
    out = []
    for c in CATALOG:
        for y in YEARS:
            n = year_num(y)
            cap = next((cp for cp in c["caps"] if cp[0] <= n <= cp[1]), None)
            if cap:
                out.append({"y": y, "name": c["name"], "label": c["label"], "tier": c["tier"], "fact": c["note"],
                            "capital": [cap[2], cap[3], cap[4]], "colour": c["colour"]})
    for it in POOL + [x for d in DAILY for x in d] + BASICS + NEW:
        (lon, lat, cname), col = (it[5], it[6]) if len(it) > 5 else META[(it[0], it[1])]
        out.append({"y": it[0], "name": it[1], "label": it[2], "tier": it[3], "fact": it[4],
                    "capital": [lon, lat, cname], "colour": col, "rerun": True})
    good, seen = [], set()
    for o in out:
        k = (o["y"], o["name"])
        if k in seen:
            continue
        g = bm.shape(o["y"], o["name"])
        if g is None or g.area < MIN_AREA:
            continue
        if not g.buffer(0.5).contains(Point(o["capital"][0], o["capital"][1])):
            print(f"  skip {year_label(o['y'])} {o['label']}: {o['capital'][2]} is outside the shape")
            continue
        seen.add(k)
        good.append(o)
    return good


def question(o, g, qid):
    m = mapping(d3orient(g))
    return {"id": qid, "year": year_num(o["y"]), "yearLabel": year_label(o["y"]), "label": o["label"], "tier": o["tier"],
            "fact": o["fact"], "capital": o["capital"], "color": band(o["colour"]),
            "geometry": {"type": m["type"], "coordinates": rnd(m["coordinates"], 3)}}


def pick_day(day_no, opts, hist, pool=()):
    """day_no is 1-based. hist: earlier days, each a list of [year, NAME]. pool: practice-pool [year, NAME]s."""
    # "Realm" for rotation purposes is the label players see, so two dataset names for the same realm
    # (e.g. "Novgorod" and "Principality of Novgorod") share one turn.
    label_of = {(o["y"], o["name"]): o["label"] for o in opts}
    last_label, last_pair = {}, {}
    for i, d in [(-1, pool)] + list(enumerate(hist)):  # the practice pool counts as used on day 0
        for y, n in d:
            last_pair[(y, n)] = i + 1
            last_label[label_of.get((y, n), n)] = i + 1
    r = random.Random(int(hashlib.md5(f"borderlines-day-{day_no}".encode()).hexdigest(), 16))
    tiers = [3, 1, 1 if day_no % 2 == 0 else 2, 2, 2]
    chosen = []
    for t in tiers:
        used_names = {o["name"] for o in chosen}
        used_labels = {o["label"] for o in chosen}
        used_years = {o["y"] for o in chosen}
        modern = sum(year_num(o["y"]) >= 1900 for o in chosen)

        def ok(o, tier_ok, gap, strict):
            if not tier_ok(o["tier"]) or o["name"] in used_names or o["label"] in used_labels:
                return False
            # keep it a history game: at most one realm from 1900 or later a day
            if strict and year_num(o["y"]) >= 1900 and modern >= 1:
                return False
            lp = last_pair.get((o["y"], o["name"]))
            return lp is None or day_no - lp >= gap

        # Strictest rules first; relax them step by step rather than ever fail (the catalog can run thin).
        cands = []
        for gap, tier_ok, strict in [(REPEAT_GAP, lambda x: x == t, True), (REPEAT_GAP, lambda x: abs(x - t) == 1, True),
                                     (180, lambda x: x == t, True), (90, lambda x: x == t, True), (90, lambda x: abs(x - t) == 1, True),
                                     (45, lambda x: True, False), (0, lambda x: True, False)]:
            cands = [o for o in opts if ok(o, tier_ok, gap, strict)]
            if cands:
                break
        assert cands, f"no realm left for day {day_no} tier {t}"
        # least recently used realm first; then a year never asked, then a year not already in this day
        oldest = min(last_label.get(o["label"], -10**6) for o in cands)
        cands = [o for o in cands if last_label.get(o["label"], -10**6) == oldest]
        label = r.choice(sorted({o["label"] for o in cands}))
        cands = [o for o in cands if o["label"] == label]
        cands.sort(key=lambda o: ((o["y"], o["name"]) in last_pair, o["y"] in used_years, o.get("rerun", False), YEARS.index(o["y"])))
        best = [o for o in cands if (((o["y"], o["name"]) in last_pair), o["y"] in used_years, o.get("rerun", False)) ==
                (((cands[0]["y"], cands[0]["name"]) in last_pair), cands[0]["y"] in used_years, cands[0].get("rerun", False))]
        chosen.append(r.choice(best))
    return sorted(chosen, key=lambda o: (o["tier"], YEARS.index(o["y"])))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="historical-basemaps geojson folder")
    ap.add_argument("--today", help="YYYY-MM-DD, defaults to today (UTC)")
    ap.add_argument("--ahead", type=int, default=AHEAD)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    base = json.load(open(BASE, encoding="utf-8"))
    hist = json.load(open(HIST, encoding="utf-8"))
    start = dt.date.fromisoformat(base["dailyStart"])
    today = dt.date.fromisoformat(a.today) if a.today else dt.datetime.now(dt.timezone.utc).date()
    n = len(hist["days"])
    assert os.path.exists(os.path.join(DAYS, f"{n}.json")) and not os.path.exists(os.path.join(DAYS, f"{n + 1}.json")), \
        "history.json and the day files disagree"
    last = start + dt.timedelta(days=n - 1)
    need = (today + dt.timedelta(days=a.ahead) - last).days
    print(f"{n} dailies, last on {last}; today {today}; adding {max(0, need)}")
    if need <= 0:
        return 0

    bm = Basemaps(a.data)
    opts = options(bm)
    print(f"{len(opts)} askable realm-years")
    days = list(hist["days"])
    new = []
    for k in range(need):
        no = n + k + 1
        picks = pick_day(no, opts, days, hist["pool"])
        days.append([[o["y"], o["name"]] for o in picks])
        qs = [question(o, bm.shape(o["y"], o["name"]), f"d{no}-{j + 1}") for j, o in enumerate(picks)]
        new.append(qs)
        when = start + dt.timedelta(days=no - 1)
        print(f"  #{no} {when}: " + " | ".join(f"{q['yearLabel']} {q['label']} (t{q['tier']})" for q in qs))
    if a.dry_run:
        return 0
    for k, qs in enumerate(new):
        with open(os.path.join(DAYS, f"{n + k + 1}.json"), "w", encoding="utf-8", newline="\n") as fh:
            json.dump(qs, fh, ensure_ascii=False, separators=(",", ":"))
    hist["days"] = days
    with open(HIST, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(hist, fh, ensure_ascii=False, indent=0)
    # border time-lapse files for the new days (the older ones are already there)
    import build_lapse
    build_lapse.build(a.data, only={f"d{n + k + 1}-{j + 1}" for k in range(need) for j in range(5)})
    from build_borderlines import build
    build()
    return need


if __name__ == "__main__":
    main()
