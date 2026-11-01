"""
Persistence for Intern Co.: goals, their full transcripts, task cards (KPIs), settings and accounts.

One SQLite file (dashboard.db, WAL mode) next to main.py. Everything runs on the
NiceGUI event loop thread; writes are tiny and synchronous.

    missions  one row per goal (the name is from the app's first version)
    events    the transcript: every prompt, reply, tool call/result, approval, message,
              plan and limit decision, as JSON
    tasks     one row per task card (the KPI data)
    settings  single documents: companies per account, app settings, notebooks, usage calibration
    users     app accounts; sessions: signed-in windows (see auth.py); identities: linked Google accounts (oauth.py)
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any

from paths import DATA

DB_PATH = Path(os.environ.get('AGENT_OPS_DB') or DATA / 'dashboard.db')

SCHEMA = '''
CREATE TABLE IF NOT EXISTS missions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    mode        TEXT NOT NULL,              -- 'office' (older rows: the first version's modes)
    goal        TEXT NOT NULL,
    status      TEXT NOT NULL,              -- running | complete | ended | failed | aborted | interrupted
    started_at  REAL NOT NULL,
    ended_at    REAL,
    duration_s  REAL NOT NULL DEFAULT 0,    -- active (unpaused) seconds, summed over resumes
    cost        REAL NOT NULL DEFAULT 0,
    budget      REAL NOT NULL DEFAULT 0,
    preset      TEXT NOT NULL DEFAULT '',
    workspace   TEXT NOT NULL DEFAULT '',
    summary     TEXT NOT NULL DEFAULT '',
    state       TEXT NOT NULL DEFAULT '{}'  -- what a resume needs: the agents' session ids
);
CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id  INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    ts          REAL NOT NULL,
    agent       TEXT NOT NULL DEFAULT '',
    kind        TEXT NOT NULL,
    data        TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS events_by_mission ON events (mission_id, id);
CREATE TABLE IF NOT EXISTS tasks (               -- one row per task card of an office goal (the KPI data)
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id    INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    company       TEXT NOT NULL DEFAULT '',
    card          TEXT NOT NULL,
    hub           TEXT NOT NULL DEFAULT '',
    intern        TEXT NOT NULL DEFAULT '',
    model         TEXT NOT NULL DEFAULT '',
    title         TEXT NOT NULL DEFAULT '',
    size          TEXT NOT NULL DEFAULT 'M',
    status        TEXT NOT NULL,              -- passed | rework | submitted | blocked | assigned | unfinished
    attempts      INTEGER NOT NULL DEFAULT 1,
    checks_met    INTEGER,
    checks_total  INTEGER NOT NULL DEFAULT 0,
    cost          REAL NOT NULL DEFAULT 0,
    seconds       REAL,
    created_at    REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS tasks_by_company ON tasks (company, created_at);
CREATE TABLE IF NOT EXISTS goal_checks (          -- the independent goal checker's verdict on a goal (goal_check.py)
    mission_id  INTEGER PRIMARY KEY REFERENCES missions(id) ON DELETE CASCADE,
    data        TEXT NOT NULL,              -- score, verdict, requirements met / partly / missing, what is missing …
    checked_at  REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,           -- e.g. 'company': the office's departments and interns
    data        TEXT NOT NULL,
    updated_at  REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS users (                -- app accounts (see auth.py)
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    login       TEXT NOT NULL UNIQUE COLLATE NOCASE,  -- what they sign in with (an email or a user name)
    pw_hash     TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'member',   -- owner | member
    claude      TEXT NOT NULL DEFAULT 'none',     -- how their agents reach Claude: plan (this computer's login) | api_key | none
    created_at  REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (             -- signed-in browsers / windows
    token       TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  REAL NOT NULL,
    expires_at  REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS identities (           -- real accounts (e.g. Google) linked to app accounts (see oauth.py)
    provider    TEXT NOT NULL,                    -- google
    subject     TEXT NOT NULL,                    -- the provider's id for the account (never changes)
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email       TEXT NOT NULL DEFAULT '',
    linked_at   REAL NOT NULL,
    PRIMARY KEY (provider, subject)
);
'''


class Store:
    def __init__(self, path: Path = DB_PATH) -> None:
        self.db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)  # autocommit
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=NORMAL')
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.executescript(SCHEMA)
        # newer columns on older databases
        cols = {r['name'] for r in self.db.execute('PRAGMA table_info(missions)')}
        if 'company' not in cols:
            self.db.execute("ALTER TABLE missions ADD COLUMN company TEXT NOT NULL DEFAULT ''")
        if 'rating' not in cols:  # the owner's verdict on a goal: success | partial | failed
            self.db.execute("ALTER TABLE missions ADD COLUMN rating TEXT NOT NULL DEFAULT ''")
        if 'user_id' not in cols:  # which account gave the goal
            self.db.execute("ALTER TABLE missions ADD COLUMN user_id TEXT NOT NULL DEFAULT ''")

    # ── missions ──────────────────────────────────────────────────────────
    def create_mission(self, mode: str, goal: str, budget: float, preset: str, workspace: str) -> int:
        cur = self.db.execute(
            'INSERT INTO missions (mode, goal, status, started_at, budget, preset, workspace) '
            "VALUES (?, ?, 'running', ?, ?, ?, ?)", (mode, goal, time.time(), budget, preset, workspace))
        return int(cur.lastrowid)

    def update_mission(self, mission_id: int, **fields: Any) -> None:
        if 'state' in fields and not isinstance(fields['state'], str):
            fields['state'] = json.dumps(fields['state'])
        cols = ', '.join(f'{k} = ?' for k in fields)
        self.db.execute(f'UPDATE missions SET {cols} WHERE id = ?', (*fields.values(), mission_id))

    def mission(self, mission_id: int) -> dict[str, Any] | None:
        row = self.db.execute('SELECT * FROM missions WHERE id = ?', (mission_id,)).fetchone()
        return self._mission_dict(row) if row else None

    def missions(self, limit: int = 200) -> list[dict[str, Any]]:
        rows = self.db.execute('SELECT * FROM missions ORDER BY id DESC LIMIT ?', (limit,)).fetchall()
        return [self._mission_dict(r) for r in rows]

    def mark_interrupted(self) -> int:
        """At startup: missions still 'running' were cut off by a restart or crash."""
        return self.db.execute("UPDATE missions SET status = 'interrupted' WHERE status = 'running'").rowcount

    @staticmethod
    def _mission_dict(row: sqlite3.Row) -> dict[str, Any]:
        d = dict(row)
        d['state'] = json.loads(d['state'] or '{}')
        return d

    # ── events (the transcript) ───────────────────────────────────────────
    def add_event(self, mission_id: int, agent: str, kind: str, data: dict[str, Any]) -> None:
        self.db.execute('INSERT INTO events (mission_id, ts, agent, kind, data) VALUES (?, ?, ?, ?, ?)',
                        (mission_id, time.time(), agent, kind, json.dumps(data, default=str)))

    def events(self, mission_id: int) -> list[dict[str, Any]]:
        rows = self.db.execute('SELECT ts, agent, kind, data FROM events WHERE mission_id = ? ORDER BY id',
                               (mission_id,)).fetchall()
        return [{'ts': r['ts'], 'agent': r['agent'], 'kind': r['kind'], 'data': json.loads(r['data'])} for r in rows]

    # ── task cards (KPIs) ─────────────────────────────────────────────────
    def save_tasks(self, mission_id: int, rows: list[dict[str, Any]]) -> None:
        self.db.execute('DELETE FROM tasks WHERE mission_id = ?', (mission_id,))
        self.db.executemany(
            'INSERT INTO tasks (mission_id, company, card, hub, intern, model, title, size, status, attempts, '
            'checks_met, checks_total, cost, seconds, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [(mission_id, r['company'], r['card'], r['hub'], r['intern'], r['model'], r['title'], r['size'], r['status'],
              r['attempts'], r['checks_met'], r['checks_total'], r['cost'], r['seconds'], r['created_at']) for r in rows])

    def mission_tasks(self, mission_id: int) -> list[dict[str, Any]]:
        """One goal's task-card rows (kept when the goal is continued)."""
        rows = self.db.execute('SELECT * FROM tasks WHERE mission_id = ? ORDER BY id', (mission_id,)).fetchall()
        return [dict(r) for r in rows]

    def tasks(self, company: str = '', since: float = 0.0) -> list[dict[str, Any]]:
        rows = self.db.execute('SELECT * FROM tasks WHERE (? = \'\' OR company = ?) AND created_at >= ? ORDER BY id',
                               (company, company, since)).fetchall()
        return [dict(r) for r in rows]

    def office_goals(self, company: str = '', since: float = 0.0) -> list[dict[str, Any]]:
        rows = self.db.execute("SELECT id, goal, status, summary, workspace, cost, duration_s, rating, started_at, ended_at, "
                               "company, user_id, json_extract(state, '$.document') AS document, "
                               "json_extract(state, '$.saved_to') AS saved_to FROM missions "
                               "WHERE mode = 'office' AND (? = '' OR company = ?) AND started_at >= ? ORDER BY id",
                               (company, company, since)).fetchall()
        return [dict(r) for r in rows]

    # ── goal checks ───────────────────────────────────────────────────────
    def save_check(self, mission_id: int, data: dict[str, Any]) -> None:
        self.db.execute('INSERT INTO goal_checks (mission_id, data, checked_at) VALUES (?, ?, ?) '
                        'ON CONFLICT(mission_id) DO UPDATE SET data = excluded.data, checked_at = excluded.checked_at',
                        (mission_id, json.dumps(data, default=str), time.time()))

    def checks(self, mission_ids: list[int]) -> dict[int, dict[str, Any]]:
        if not mission_ids:
            return {}
        marks = ','.join('?' * len(mission_ids))
        rows = self.db.execute(f'SELECT mission_id, data FROM goal_checks WHERE mission_id IN ({marks})', mission_ids)
        return {r['mission_id']: json.loads(r['data']) for r in rows}

    # ── settings (single JSON documents) ──────────────────────────────────
    def setting(self, key: str) -> Any:
        row = self.db.execute('SELECT data FROM settings WHERE key = ?', (key,)).fetchone()
        return json.loads(row['data']) if row else None

    def save_setting(self, key: str, data: Any) -> None:
        self.db.execute('INSERT INTO settings (key, data, updated_at) VALUES (?, ?, ?) '
                        'ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
                        (key, json.dumps(data), time.time()))

    # ── accounts and sign-in sessions ─────────────────────────────────────
    def users(self) -> list[dict[str, Any]]:
        return [dict(r) for r in self.db.execute('SELECT * FROM users ORDER BY created_at')]

    def user(self, user_id: str) -> dict[str, Any] | None:
        row = self.db.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
        return dict(row) if row else None

    def user_by_login(self, login: str) -> dict[str, Any] | None:
        row = self.db.execute('SELECT * FROM users WHERE login = ?', (login.strip(),)).fetchone()
        return dict(row) if row else None

    def add_user(self, user: dict[str, Any]) -> None:
        self.db.execute('INSERT INTO users (id, name, login, pw_hash, role, claude, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        (user['id'], user['name'], user['login'], user['pw_hash'], user['role'], user['claude'], time.time()))

    def update_user(self, user_id: str, **fields: Any) -> None:
        cols = ', '.join(f'{k} = ?' for k in fields)
        self.db.execute(f'UPDATE users SET {cols} WHERE id = ?', (*fields.values(), user_id))

    def delete_user(self, user_id: str) -> None:
        self.db.execute('DELETE FROM users WHERE id = ?', (user_id,))

    def add_session(self, token: str, user_id: str, expires_at: float) -> None:
        self.db.execute('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
                        (token, user_id, time.time(), expires_at))

    def session_user(self, token: str) -> dict[str, Any] | None:
        row = self.db.execute('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id '
                              'WHERE s.token = ? AND s.expires_at > ?', (token, time.time())).fetchone()
        return dict(row) if row else None

    def delete_session(self, token: str) -> None:
        self.db.execute('DELETE FROM sessions WHERE token = ?', (token,))

    def delete_sessions(self, user_id: str) -> None:
        self.db.execute('DELETE FROM sessions WHERE user_id = ?', (user_id,))

    def identities(self, user_id: str) -> list[dict[str, Any]]:
        return [dict(r) for r in self.db.execute('SELECT provider, email, linked_at FROM identities WHERE user_id = ?',
                                                 (user_id,))]

    def identity_user(self, provider: str, subject: str) -> str | None:
        row = self.db.execute('SELECT user_id FROM identities WHERE provider = ? AND subject = ?',
                              (provider, subject)).fetchone()
        return row['user_id'] if row else None

    def identity_user_by_email(self, email: str) -> str | None:
        """The account a linked address belongs to (for the backup code; sign-ins themselves match on the subject)."""
        row = self.db.execute('SELECT user_id FROM identities WHERE email = ? COLLATE NOCASE', (email.strip(),)).fetchone()
        return row['user_id'] if row else None

    def link_identity(self, provider: str, subject: str, user_id: str, email: str) -> None:
        self.db.execute('INSERT INTO identities (provider, subject, user_id, email, linked_at) VALUES (?, ?, ?, ?, ?)',
                        (provider, subject, user_id, email, time.time()))

    def unlink_identity(self, user_id: str, provider: str) -> None:
        self.db.execute('DELETE FROM identities WHERE user_id = ? AND provider = ?', (user_id, provider))
