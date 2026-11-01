#!/bin/bash
# Sets up Intern Co. on a Mac (run once): makes a private Python environment in .venv and installs the packages.
# Then start the app with "Intern Co.command".
cd "$(dirname "$0")" || exit 1
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

finish() {
  echo
  read -n 1 -s -r -p "Press any key to close."
  echo
  exit "$1"
}

PY=""
for cmd in python3.14 python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "$cmd" >/dev/null 2>&1 && "$cmd" -c 'import sys; sys.exit(sys.version_info < (3, 10))' 2>/dev/null; then
    PY="$cmd"
    break
  fi
done
if [ -z "$PY" ]; then
  echo "Intern Co. needs Python 3.10 or newer, and this Mac does not have it."
  echo "Install it from https://www.python.org/downloads/ and run this setup again."
  finish 1
fi
echo "Using $("$PY" --version)."

echo "Installing the packages (this takes a minute or two)..."
"$PY" -m venv .venv || finish 1
.venv/bin/python -m pip install --quiet --upgrade pip
.venv/bin/python -m pip install --quiet -r requirements.txt || { echo "The packages could not be installed."; finish 1; }
chmod +x "Intern Co.command"

echo
echo "Setup is done."
if command -v claude >/dev/null 2>&1; then
  echo "Claude Code is installed. You also need your own ANTHROPIC_API_KEY: see MANUAL.md, section 1."
else
  echo "One more step: Intern Co. runs its agents with Claude Code, which is not installed yet."
  echo "  1. In Terminal, run:  curl -fsSL https://claude.ai/install.sh | bash"
  echo "  2. Then set your own ANTHROPIC_API_KEY: see MANUAL.md, section 1."
fi
echo "After that, double-click \"Intern Co.command\" to start the app."
finish 0
