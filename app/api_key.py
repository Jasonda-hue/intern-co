"""
This public version of Intern Co. runs only on the user's own Anthropic API key, never on a Claude plan login.

The key comes from the ANTHROPIC_API_KEY environment variable on the user's computer. The app does not store it,
show it or send it anywhere except to Claude Code. Every place that starts Claude calls require_key() first, so a
missing key stops the work instead of falling back to whatever login the computer has.
"""
from __future__ import annotations

import os

KEY = 'ANTHROPIC_API_KEY'


def have_key() -> bool:
    return bool(os.environ.get(KEY, '').strip())


def require_key() -> None:
    if not have_key():
        raise RuntimeError(f'{KEY} is not set on this computer.')
