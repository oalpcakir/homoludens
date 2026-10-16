"""Superseded: the itch.io package of Borderlines (and of every other game) is built by src/platform/build_platforms.py.

    python3 src/platform/build_platforms.py borderlines --only itch   ->  dist/platforms/itch/borderlines-itch.zip

Kept so old notes that call this script still work.
"""
import os, subprocess, sys

H = os.path.dirname(os.path.abspath(__file__))
sys.exit(subprocess.call([sys.executable, os.path.join(H, "..", "platform", "build_platforms.py"), "borderlines", "--only", "itch"]))
