"""
Where Intern Co. keeps its files. The app's folder holds:
  app/    the Python code (this folder)
  web/    what the app window loads: office.js, i18n.js and the logo
  data/   private, never shared: dashboard.db, library/ (shared files), workspaces/ (one folder per goal)
and, at the top, the launchers, README.txt, MANUAL.md and google_client.json (when it has been made).
"""
from __future__ import annotations

from pathlib import Path

HOME = Path(__file__).resolve().parent.parent  # the app's folder
APP = HOME / 'app'
WEB = HOME / 'web'
DATA = HOME / 'data'
DATA.mkdir(exist_ok=True)  # a fresh copy has none yet; the database is made inside it on the first start
