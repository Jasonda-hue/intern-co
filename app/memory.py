"""
Hub notebooks: what a hub remembers between goals.

A hub's manager saves short notes with the office tool `remember` (lessons learned, the owner's preferences, what
worked); the owner can add or delete notes in Settings. The notebook goes into the manager's instructions at the
start of each goal, newest first, cut to the size set in Settings (memory.size characters), so it stays cheap.
Notes are per company (settings 'memory:<company id>' → {hub id: [{at, by, text}]}).
"""
from __future__ import annotations

import time
from typing import Any

NOTE_LIMIT = 300   # characters per note
KEEP = 60          # notes kept per hub (the oldest go first)


class Notebooks:
    def __init__(self, store: Any) -> None:
        self.store = store

    def _key(self, company_id: str) -> str:
        return f'memory:{company_id}'

    def all(self, company_id: str) -> dict[str, list[dict[str, Any]]]:
        data = self.store.setting(self._key(company_id))
        return data if isinstance(data, dict) else {}

    def notes(self, company_id: str, hub_id: str) -> list[dict[str, Any]]:
        return self.all(company_id).get(hub_id, [])

    def add(self, company_id: str, hub_id: str, text: str, by: str) -> dict[str, Any]:
        text = ' '.join(str(text).split())[:NOTE_LIMIT]
        if not text:
            raise ValueError('The note is empty.')
        data = self.all(company_id)
        notes = [n for n in data.get(hub_id, []) if n['text'].lower() != text.lower()]  # no duplicates
        note = {'at': time.time(), 'by': by, 'text': text}
        data[hub_id] = (notes + [note])[-KEEP:]
        self.store.save_setting(self._key(company_id), data)
        return note

    def remove(self, company_id: str, hub_id: str, at: float) -> None:
        data = self.all(company_id)
        data[hub_id] = [n for n in data.get(hub_id, []) if abs(n['at'] - at) > 1e-6]
        self.store.save_setting(self._key(company_id), data)

    def clear(self, company_id: str, hub_id: str = '') -> None:
        data = self.all(company_id)
        if hub_id:
            data.pop(hub_id, None)
        else:
            data = {}
        self.store.save_setting(self._key(company_id), data)

    def prompt(self, company_id: str, hub_id: str, size: int) -> str:
        """The notebook as the manager reads it: newest first, within `size` characters."""
        lines, used = [], 0
        for n in reversed(self.notes(company_id, hub_id)):
            line = f'  - {n["text"]}' + (' (from the owner)' if n['by'] == 'owner' else '')
            if used + len(line) > size:
                break
            lines.append(line)
            used += len(line) + 1
        return '\n'.join(lines)
