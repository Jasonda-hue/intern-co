"""
App settings (the Settings window), stored as one document. Each value has a default and a safe range;
anything out of range is clamped, anything unknown is dropped.

    usage        when to pause all work (% of the Claude plan's 5-hour and weekly windows), and the default
                 usage limit for new goals
    performance  how much runs at once (each agent is a separate Claude process using memory), how long an
                 agent's reply may run, and the largest single message an agent may send back
    memory       hub notebooks: on/off and how much each hub keeps
    safety       whether reading and testing commands inside a goal's folder run without asking, and whether
                 commands waiting for approval are explained in plain words (a small model)
    checks       whether each finished goal is checked against what you asked (a small read-only agent)
    plans        whether managers' plans are approved automatically (commands always still ask)
"""
from __future__ import annotations

from typing import Any

# section → key → (default, minimum, maximum); bools have no range
SPEC: dict[str, dict[str, tuple]] = {
    'usage': {'five_hour': (80, 5, 100), 'seven_day': (90, 5, 100), 'goal_default': (15, 1, 100)},
    'performance': {'agents_at_once': (6, 1, 12), 'goals_at_once': (4, 1, 8), 'max_turns': (30, 5, 120),
                    'messages_per_goal': (80, 10, 400), 'idle_close': (15, 5, 120), 'message_mb': (64, 1, 512)},
    'memory': {'enabled': (True,), 'size': (4000, 500, 20000)},
    'safety': {'auto_safe': (True,), 'explain': (True,)},  # explain: commands in plain words in the Inbox (explain.py)
    'checks': {'enabled': (True,)},  # check each finished goal against what you asked (goal_check.py)
    'plans': {'auto_approve': (False,)},  # approve plans as they arrive (the Inbox shows what was approved)
}
KEY = 'app_settings'


def clean(value: Any, base: dict[str, Any] | None = None) -> dict[str, Any]:
    """Merge `value` over `base` (or the defaults), keeping only known keys, within their ranges."""
    value = value if isinstance(value, dict) else {}
    out: dict[str, Any] = {}
    for section, keys in SPEC.items():
        given = value.get(section) if isinstance(value.get(section), dict) else {}
        before = (base or {}).get(section, {})
        out[section] = {}
        for key, spec in keys.items():
            v = given.get(key, before.get(key, spec[0]))
            if len(spec) == 1:
                out[section][key] = bool(v)
                continue
            try:
                v = float(v)
            except (TypeError, ValueError):
                v = spec[0]
            v = min(max(v, spec[1]), spec[2])
            out[section][key] = int(v) if float(v).is_integer() else round(v, 1)
    return out


def load(store: Any) -> dict[str, Any]:
    saved = store.setting(KEY)
    if saved is None:  # upgrading: the usage limits used to be stored on their own
        old = store.setting('usage_limits') or {}
        saved = {'usage': {k: old[k] for k in ('five_hour', 'seven_day') if k in old}}
    return clean(saved)


def save(store: Any, changes: Any) -> dict[str, Any]:
    merged = clean(changes, load(store))
    store.save_setting(KEY, merged)
    return merged
