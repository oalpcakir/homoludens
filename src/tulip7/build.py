"""Kept for old habits: builds the standalone prototype. The site page is built by build_tulip7.py."""
import runpy, os
runpy.run_path(os.path.join(os.path.dirname(os.path.abspath(__file__)), "build_prototype.py"), run_name="__main__")
