#!/bin/bash
# Opens Intern Co. in its own window on a Mac. Closing the window stops it; this Terminal window shows messages
# and errors. (Run setup-mac.command once first.)
cd "$(dirname "$0")" || exit 1
# where Claude Code usually lives, and the app's own Python first, so the app and its agents find both
export PATH="$PWD/.venv/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if [ ! -x .venv/bin/python ]; then
  echo "Intern Co. is not set up yet. Double-click setup-mac.command first."
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi
exec .venv/bin/python app/main.py "$@"
