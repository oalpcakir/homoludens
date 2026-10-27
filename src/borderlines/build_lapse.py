"""Border time-lapse data: for every realm the game asks (practice pool + every daily), write
public/borderlines/lapse/<question id>.json with the realm's borders in the nearest dataset years around the round's year.

The game lists which ids have a file (build_borderlines.py reads this folder) and fetches one only when the player
opens "See it change" on a result card, so nothing here is ever loaded before a realm has been played.

How a realm is matched across years: historical-basemaps keys every shape by its NAME, and the same realm is often
renamed between files ("Ming Empire" 1492 / "Ming Chinese Empire" 1500, "Austro-Hungarian Empire" 1914 / "Austria
Hungary" 1900). Years are walked outward from the round's year, each one compared with the snapshot next to it:
  1. features with the round's NAME (or another dataset name the catalog gives the same label, e.g. "Han" / "Han
     Empire") count when they share at least OVERLAP of the smaller shape;
     SAME lists a few renames by hand (Persia / Iran, Abyssinia / Ethiopia, Siam / Thailand ...);
  2. otherwise the feature that best matches the neighbouring snapshot counts only when it also shares a distinctive
     name word with the round's realm and covers clearly the same land (IoU >= IOU_NAMED): "Union of South Africa",
     "Ming Chinese Empire", "Kyivan Rus". A successor with another name (Sui → Tang, Fatimids → Mamluks) never counts.
The walk stops at the first year that fails, so a lapse never jumps across a gap or into a different realm. It covers
SPAN years either side, reaching up to SPAN_MAX on a side that would otherwise have fewer than two snapshots (ancient
files are centuries apart). A realm with fewer than MIN_SNAPS snapshots gets no file; the game hides the control.

Deterministic: same inputs → byte-identical files (fixed tolerances, rounding, key order).
Needs shapely and a historical-basemaps checkout (the same pinned commit as the monthly updater):
  python3 src/borderlines/build_lapse.py --data <historical-basemaps>/geojson [--only d73-1,d73-2]
then python3 src/borderlines/build_borderlines.py (auto_update.py does both for new days).
"""
import argparse, glob, json, os, re, sys

H = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, H)
from shapely.geometry import shape, box, MultiPolygon  # noqa: E402
from shapely.ops import unary_union  # noqa: E402
from auto_update import YEARS, year_num, year_label, d3orient, rnd, drop_outliers  # noqa: E402

ROOT = os.path.normpath(os.path.join(H, "..", ".."))
PUB = os.path.join(ROOT, "public", "borderlines")
OUT = os.path.join(PUB, "lapse")
SPAN = 150        # years either side of the round's year
MAX_SNAPS = 8
MIN_SNAPS = 3     # the round's year plus at least two others
SPAN_MAX = 300
OVERLAP = 0.25    # same NAME: share of the smaller shape the two must have in common
IOU_NAMED = 0.55  # another NAME that shares a word with the round's name
ND = 2            # decimals kept
# dataset names that are the same polity under another name (beyond the catalog's shared labels)
SAME = [["Persia", "Iran"], ["Abyssinia", "Ethiopia", "Ethiopia (Italy)"], ["Rattanakosin Kingdom", "Siam", "Thailand"],
        ["Belgian Congo", "Zaire (Belgium)", "Zaire"], ["Anglo-Egyptian Sudan", "Sudan"], ["British East Africa", "Kenya"],
        ["Annam", "Đại Việt"], ["Kingdom of Brazil", "Viceroyalty of Brazil", "Portuguese Brazil", "Brazil"],
        ["United Provinces of the Río de la Plata", "Argentina"], ["England", "English territory"],
        ["United Kingdom", "United Kingdom of Great Britain and Ireland"], ["Grand Duchy of Moscow", "Tsardom of Muscovy"],
        ["Fulani Empire", "Sokoto Caliphate"], ["Parhae", "Balhae"]]
# share a name word but are different states
NOT_SAME = [{"Czechoslovakia", "Czech Republic"}]
GENERIC = {"empire", "kingdom", "of", "the", "and", "state", "states", "republic", "principality", "duchy", "grand",
           "khanate", "caliphate", "sultanate", "emirate", "dynasty", "great", "united", "union", "territory",
           "colony", "imperial", "horde", "confederation", "confederacy", "federation", "chinese", "de", "la", "del", "el"}


def aliases():
    from catalog import CATALOG
    by_label, out = {}, {}
    for c in CATALOG:
        by_label.setdefault(c["label"], []).append(c["name"])
    for names in list(by_label.values()) + SAME:
        for n in names:
            out[n] = sorted(set(out.get(n, [])) | set(names))
    return out


class World:
    """One dataset year at a time: each NAME's features merged into one shape, plus a spatial index over them."""
    def __init__(self, folder):
        self.folder, self.cache = folder, {}

    def year(self, y):
        if y not in self.cache:
            from shapely.strtree import STRtree
            p = os.path.join(self.folder, f"world_{y}.geojson")
            fs = json.load(open(p, encoding="utf-8"))["features"] if os.path.exists(p) else []
            idx = {}
            for f in fs:
                n = f["properties"].get("NAME")
                if n and f.get("geometry"):
                    idx.setdefault(n, []).append(shape(f["geometry"]).buffer(0))
            names = sorted(idx)
            shapes = [unary_union(idx[n]) for n in names]
            self.cache[y] = (dict(zip(names, shapes)), names, STRtree(shapes) if shapes else None)
        return self.cache[y]


def words(name):
    """Distinctive words of a name, folded so near-spellings meet ("Kievan" / "Kyivan" → "kivan")."""
    import unicodedata
    n = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return {re.sub(r"[aeiouy]", "", w)[:4] or w for w in re.findall(r"[a-z]+", n) if w not in GENERIC and len(w) > 2}


def iou(a, b):
    i = a.intersection(b).area
    return i / (a.area + b.area - i) if i else 0.0


def clean(g, tol):
    """Clip, simplify and drop specks; None when nothing usable is left."""
    if g is None or g.is_empty:
        return None
    g = g.buffer(0).intersection(box(-170, -58, 180, 84)).simplify(tol, preserve_topology=True)
    if g.geom_type == "GeometryCollection":
        g = unary_union([p for p in g.geoms if p.geom_type in ("Polygon", "MultiPolygon")])
    if g.is_empty or g.geom_type not in ("Polygon", "MultiPolygon"):
        return None
    if g.geom_type == "MultiPolygon":
        big = max(p.area for p in g.geoms)
        keep = [p for p in g.geoms if p.area > max(0.08, min(0.4, big * 0.005))]
        if not keep:
            return None
        g = drop_outliers(unary_union(keep))
    if g.is_empty or g.bounds[2] - g.bounds[0] >= 300:
        return None
    return g


def geo(g):
    from shapely.geometry import mapping
    m = mapping(d3orient(g))
    return {"type": m["type"], "coordinates": rnd(m["coordinates"], ND)}


def tolerance(ref):
    """Coarser for bigger realms: the lapse is a small animation, not a scored answer."""
    x0, y0, x1, y1 = ref.bounds
    return round(min(0.3, max(0.05, max(x1 - x0, y1 - y0) / 250)), 3)


def match(world, y, names, prev, tol, key):
    """The realm in dataset year y, judged against prev (the neighbouring snapshot). None when it isn't there."""
    by_name, order, tree = world.year(y)
    parts = [by_name[n] for n in names if n in by_name]
    if parts:
        g = clean(unary_union(parts), tol)
        if g is not None and g.intersection(prev).area >= OVERLAP * min(g.area, prev.area):
            return g
        return None
    if tree is None:
        return None
    best_name, best_iou = None, 0.0
    for i in sorted(int(j) for j in tree.query(prev, predicate="intersects")):
        v = iou(by_name[order[i]], prev)
        if v > best_iou:
            best_name, best_iou = order[i], v
    if best_name is None:
        return None
    if any(best_name in pair and set(names) & pair for pair in NOT_SAME):
        return None
    if best_iou >= IOU_NAMED and words(best_name) & key:
        return clean(by_name[best_name], tol)
    return None


def snapshots(world, names, ykey, ref, tol):
    """ref: the round's own shape. Returns [(year key, shape)] in time order, or [] when too few."""
    i0 = YEARS.index(ykey)
    y0 = year_num(ykey)
    key = set().union(*(words(n) for n in names))
    got = {ykey: ref}
    for step in (-1, 1):
        i, prev, side = i0 + step, ref, 0
        while 0 <= i < len(YEARS):
            dy = abs(year_num(YEARS[i]) - y0)
            if dy > SPAN_MAX or (dy > SPAN and side >= 2):
                break
            g = match(world, YEARS[i], names, prev, tol, key)
            if g is None:
                break
            got[YEARS[i]] = prev = g
            side += 1
            i += step
    keys = sorted(got, key=lambda y: (abs(year_num(y) - y0), year_num(y)))[:MAX_SNAPS]
    keys.sort(key=year_num)
    return [(k, got[k]) for k in keys] if len(keys) >= MIN_SNAPS else []


def questions():
    """(id, dataset year key, dataset NAME, game geometry) for the pool and every daily."""
    hist = json.load(open(os.path.join(H, "data", "history.json"), encoding="utf-8"))
    base = json.load(open(os.path.join(H, "data", "base.json"), encoding="utf-8"))
    out = []
    assert len(hist["pool"]) == len(base["pool"]), "history.json pool and base.json pool differ"
    for (y, n), q in zip(hist["pool"], base["pool"]):
        out.append((q["id"], y, n, q))
    for d, picks in enumerate(hist["days"]):
        p = os.path.join(PUB, "days", f"{d + 1}.json")
        if not os.path.exists(p):
            continue
        day = json.load(open(p, encoding="utf-8"))
        for (y, n), q in zip(picks, day):
            out.append((q["id"], y, n, q))
    return out


def build(data, only=None, quiet=False):
    world, al = World(data), aliases()
    os.makedirs(OUT, exist_ok=True)
    made, skipped = 0, []
    for qid, ykey, name, q in questions():
        if only is not None and qid not in only:
            continue
        assert year_num(ykey) == q["year"], f"{qid}: history year {ykey} != question year {q['year']}"
        raw = shape(q["geometry"])
        tol = tolerance(raw)
        ref = clean(raw, tol)
        snaps = snapshots(world, al.get(name, [name]), ykey, ref, tol) if ref is not None else []
        path = os.path.join(OUT, f"{qid}.json")
        if not snaps:
            skipped.append(qid)
            if os.path.exists(path):
                os.remove(path)
            continue
        doc = {"id": qid, "year": q["year"],
               "snaps": [{"year": year_num(k), "label": year_label(k), "geometry": geo(g)} for k, g in snaps]}
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(doc, fh, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        made += 1
    total = sum(os.path.getsize(p) for p in glob.glob(os.path.join(OUT, "*.json")))
    if not quiet:
        print(f"lapse: {made} written, {len(skipped)} without enough matching years; folder {total // 1024} KB")
    return made, skipped, total


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="historical-basemaps/geojson folder")
    ap.add_argument("--only", help="comma-separated question ids (default: all)")
    a = ap.parse_args()
    build(a.data, set(a.only.split(",")) if a.only else None)
