#!/usr/bin/env python3
"""Build the whole Homo Ludens site from src/ into public/, then validate it.

    python3 build.py            build everything, then run validate.py
    python3 build.py --check    build, validate, and fail if public/ differs from git (used by CI)

Each game keeps its own builder; this just runs them in the right order.
"""
import os, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
STEPS = [
    "src/borderlines/build_borderlines.py",  # first: patches the daily count in the portal template
    "src/portal/build_portal.py",
    "src/retourvloot/build_retourvloot.py",
    "src/cupoftea/build_cupoftea.py",
    "src/polder/build_polder.py",
    "src/kantar/build_kantar.py",
]


def run(args):
    print("$", " ".join(args), flush=True)
    r = subprocess.run(args, cwd=ROOT)
    if r.returncode:
        sys.exit(r.returncode)


def main():
    for s in STEPS:
        run([sys.executable, s])
    run([sys.executable, "validate.py"])
    if "--check" in sys.argv:
        # content changes only (builders copy images, which can touch file modes)
        r = subprocess.run(["git", "-c", "core.fileMode=false", "status", "--porcelain", "--", "public", "src"],
                           cwd=ROOT, capture_output=True, text=True)
        if r.stdout.strip():
            print("public/ or src/ is out of date with the sources. Run `python3 build.py` and commit:\n" + r.stdout)
            sys.exit(1)
        print("public/ matches the sources.")


if __name__ == "__main__":
    main()
