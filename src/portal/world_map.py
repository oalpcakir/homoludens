"""The world map on the portal's "Map" tab: Natural Earth land (from Borderlines' base.json),
projected and simplified into one SVG path at build time.

Projection: plain equirectangular, cropped to BOX. The portal's script places the game pins
with the same numbers (they reach the page as {{MAPCFG}}), so change them here only.
"""
import json, os

H = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.normpath(os.path.join(H, "..", "borderlines", "data", "base.json"))

# west, east, south, north (degrees) and the drawing width in SVG units
BOX = {"w": -100.0, "e": 140.0, "s": -42.0, "n": 76.0, "W": 1000}


def cfg():
    k = BOX["W"] / (BOX["e"] - BOX["w"])
    return dict(BOX, H=round((BOX["n"] - BOX["s"]) * k, 1), k=k)


def _xy(lon, lat, c):
    return (lon - c["w"]) * c["k"], (c["n"] - lat) * c["k"]


def _ring(ring, c, tol=1.1):
    pts = [_xy(lon, lat, c) for lon, lat in ring]
    out = [pts[0]]
    for p in pts[1:]:
        q = out[-1]
        if abs(p[0] - q[0]) + abs(p[1] - q[1]) >= tol:
            out.append(p)
    if len(out) < 4:
        return None
    xs = [p[0] for p in out]; ys = [p[1] for p in out]
    if max(xs) < -5 or min(xs) > c["W"] + 5 or max(ys) < -5 or min(ys) > c["H"] + 5:
        return None  # wholly outside the crop
    if (max(xs) - min(xs)) * (max(ys) - min(ys)) < 1.5:
        return None  # specks
    # relative moves on a 0.1 grid keep the path short
    g = [(round(x * 10), round(y * 10)) for x, y in out]
    d = [f"M{g[0][0] / 10:g},{g[0][1] / 10:g}l"]
    for (x0, y0), (x1, y1) in zip(g, g[1:]):
        d.append(f"{(x1 - x0) / 10:g},{(y1 - y0) / 10:g} ")
    return "".join(d).rstrip() + "z"


def build():
    c = cfg()
    land = json.load(open(BASE, encoding="utf-8"))["land"]
    polys = land["coordinates"] if land["type"] == "MultiPolygon" else [land["coordinates"]]
    parts = []
    for poly in polys:
        for ring in poly:
            d = _ring(ring, c)
            if d:
                parts.append(d)
    grat = []
    for lon in range(-90, 141, 30):
        x = _xy(lon, 0, c)[0]
        grat.append(f"M{x:.1f},0V{c['H']}")
    for lat in (-15, 0, 15, 30, 45, 60):
        y = _xy(0, lat, c)[1]
        grat.append(f"M0,{y:.1f}H{c['W']}")
    return {
        "WW": c["W"], "WH": c["H"], "WORLD": "".join(parts), "WGRAT": "".join(grat),
        "MAPCFG": json.dumps({k: round(v, 5) if isinstance(v, float) else v for k, v in c.items()}),
    }


if __name__ == "__main__":
    m = build()
    print(m["WW"], m["WH"], len(m["WORLD"]), "chars of land path")
