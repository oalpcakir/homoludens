"""Standalone build: ui.html + art.js + carpet.b64 + engine.js + chart.js + game.js -> prototype.html (no site head).
The site page is built by build_tulip7.py; both share page() below."""
import os
H = os.path.dirname(os.path.abspath(__file__))
def page():
    rd = lambda f: open(os.path.join(H, f), encoding="utf-8").read()
    art = rd("art.js") + '\nconst CARPET="' + rd("carpet.b64").strip() + '";'
    s = rd("ui.html")
    for k, v in (("/*ART*/", art), ("/*ENGINE*/", rd("engine.js")), ("/*CHART*/", rd("chart.js")), ("/*GAME*/", rd("game.js"))):
        assert s.count(k) == 1, k
        s = s.replace(k, v)
    return s
if __name__ == "__main__":
    out = os.path.join(H, "prototype.html")
    open(out, "w", encoding="utf-8", newline="\n").write(page())
    print("built", out)
