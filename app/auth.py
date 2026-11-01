"""
App accounts: who can open Intern Co. and whose companies they see.

Step one of making this an app: accounts and sign-in, built so more people can be added later.
- The first account is created on first start and is the owner. The owner can add member accounts.
- Each account has its own companies (company.CompanyBook is per account) and sees only its own goals.
- How an account's agents reach Claude ('claude'):
    plan     this computer's connection to Claude: the owner's API key (see api_key.py; the name is historical)
    api_key  their own Anthropic API key - storing keys comes in a later step
    none     not connected yet: they can look around and set up companies, but not start goals
- An account can also be linked to a Google account and signed in to with it (oauth.py). The owner can add a
  member with only a Google address and no password (pw_hash ''); no password ever matches it.
- Passwords are stored as salted PBKDF2-SHA256 hashes. A sign-in is a random token in an HttpOnly cookie;
  only its SHA-256 is stored, so the database alone can't be used to sign in.
- Forgot password: there is no email, so the proof is access to this computer's files. A one-time 6-digit code
  is written to password-reset.txt in the app's data folder (next to the database); typing it with a new
  password sets the password and signs out the account's other sign-ins. The screen says the same whether or
  not the sign-in name exists; only the file says which. A code lasts 15 minutes and allows 5 wrong tries.
- The owner can also give a member a new password (Settings → Accounts → Reset password).
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import time
import uuid
from pathlib import Path
from typing import Any

from paths import DATA

COOKIE = 'interncoffice_session'
SESSION_DAYS = 30
ITERATIONS = 240_000
MIN_PASSWORD = 6
RESET_MINUTES = 15
RESET_TRIES = 5
RESET_GAP = 20  # seconds before another code can be asked for


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), ITERATIONS).hex()
    return f'pbkdf2_sha256${ITERATIONS}${salt}${digest}'


def check_password(password: str, stored: str) -> bool:
    try:
        _, iterations, salt, digest = stored.split('$')
        test = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), int(iterations)).hex()
    except ValueError:
        return False
    return hmac.compare_digest(test, digest)


def token_key(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def public(user: dict[str, Any] | None) -> dict[str, Any] | None:
    """What the browser may see about an account (never the password hash)."""
    if not user:
        return None
    return {**{k: user[k] for k in ('id', 'name', 'login', 'role', 'claude', 'created_at')},
            'has_password': bool(user.get('pw_hash'))}


class Accounts:
    def __init__(self, store: Any, reset_file: Path | None = None) -> None:
        self.store = store
        self.reset_file = reset_file or DATA / 'password-reset.txt'
        self.resets: dict[str, dict[str, Any]] = {}  # sign-in name (lower case) → the open reset code

    @property
    def setup_needed(self) -> bool:
        return not self.store.users()

    def _check(self, name: str, login: str, password: str, google_only: bool) -> tuple[str, str]:
        name, login = name.strip()[:60], login.strip()[:120]
        if not name:
            raise ValueError('Enter a name.')
        if not login:
            raise ValueError('Enter an email or a user name to sign in with.')
        if google_only and not password:
            if '@' not in login:
                raise ValueError('Without a password, the sign-in name must be their Google address.')
        elif len(password) < MIN_PASSWORD:
            raise ValueError(f'The password needs at least {MIN_PASSWORD} characters.')
        if self.store.user_by_login(login):
            raise ValueError('That sign-in name is already used.')
        return name, login

    def create(self, name: str, login: str, password: str, role: str = 'member',
               google_only: bool = False) -> dict[str, Any]:
        """A new account. The very first one is the owner and uses this computer's API key.
        `google_only`: an empty password is allowed, and the account signs in with Google (login = that address)."""
        name, login = self._check(name, login, password, google_only)
        first = self.setup_needed
        user = {'id': f'user-{uuid.uuid4().hex[:10]}', 'name': name, 'login': login,
                'pw_hash': hash_password(password) if password else '',
                'role': 'owner' if first else ('owner' if role == 'owner' else 'member'),
                'claude': 'plan' if first else 'none'}
        self.store.add_user(user)
        return self.store.user(user['id'])  # type: ignore[return-value]

    def sign_in(self, login: str, password: str) -> tuple[dict[str, Any], str]:
        user = self.store.user_by_login(login)
        if not user or not check_password(password, user['pw_hash']):
            time.sleep(0.4)  # slow down guessing a little
            raise ValueError('Incorrect email, username or password.')
        return user, self.new_session(user['id'])

    def new_session(self, user_id: str) -> str:
        token = secrets.token_urlsafe(32)
        self.store.add_session(token_key(token), user_id, time.time() + SESSION_DAYS * 86400)
        return token

    def user_for(self, token: str | None) -> dict[str, Any] | None:
        return self.store.session_user(token_key(token)) if token else None

    def sign_out(self, token: str | None) -> None:
        if token:
            self.store.delete_session(token_key(token))

    def change_password(self, user_id: str, old: str, new: str) -> None:
        user = self.store.user(user_id)
        if not user or (user['pw_hash'] and not check_password(old, user['pw_hash'])):  # none yet: a Google-only account
            raise ValueError('The current password is wrong.')
        if len(new) < MIN_PASSWORD:
            raise ValueError(f'The new password needs at least {MIN_PASSWORD} characters.')
        self.store.update_user(user_id, pw_hash=hash_password(new))

    def forgot(self, login: str) -> Path:
        """Writes a reset code for `login` to the reset file (or, for an unknown name, says so there)."""
        login = login.strip()[:120]
        if not login:
            raise ValueError('Enter your email or username.')
        key, now = login.lower(), time.time()
        if now - self.resets.get(key, {}).get('made', 0) < RESET_GAP:
            raise ValueError('A code was just made. Please wait a moment before requesting another.')
        user = self.store.user_by_login(login) or self.store.user(self.store.identity_user_by_email(login) or '')
        stamp = time.strftime('%Y-%m-%d %H:%M', time.localtime(now))
        if user:
            code = f'{secrets.randbelow(1_000_000):06d}'
            self.resets[key] = {'user': user['id'], 'code': token_key(code), 'made': now,
                                'expires': now + RESET_MINUTES * 60, 'tries': 0}
            text = (f'Intern Co. verification code ({stamp})\n\nAccount: {user["name"]} ({user["login"]})\n'
                    f'Code: {code}\n\nThis code expires in {RESET_MINUTES} minutes and can be used once.\n'
                    'If this code was not requested, this file can be deleted; the account is unchanged.\n')
        else:
            self.resets[key] = {'user': '', 'made': now, 'expires': 0, 'tries': 0}
            text = (f'Intern Co. verification code ({stamp})\n\nNo account was found for "{login}".\n'
                    'Check the spelling, or contact the owner of this workspace.\n')
        self.reset_file.write_text(text, encoding='utf-8')
        return self.reset_file

    def reset(self, login: str, code: str, new: str | None) -> tuple[dict[str, Any], str]:
        """Sets a new password with a code from `forgot`, signs out the account everywhere else, and signs in here.
        `new` None (Google only, where there are no passwords): only signs in."""
        key = login.strip().lower()
        open_ = self.resets.get(key)
        if not open_ or not open_['user'] or time.time() > open_['expires']:
            raise ValueError('This code is invalid or has expired. Request a new one.')
        if new is not None and len(new) < MIN_PASSWORD:
            raise ValueError(f'The new password needs at least {MIN_PASSWORD} characters.')
        if not hmac.compare_digest(token_key(code.strip()), open_['code']):
            time.sleep(0.4)
            open_['tries'] += 1
            if open_['tries'] >= RESET_TRIES:
                self.resets.pop(key, None)
                raise ValueError('Too many incorrect attempts. Request a new code.')
            raise ValueError('Incorrect code.')
        self.resets.pop(key, None)
        if new is not None:
            self.store.update_user(open_['user'], pw_hash=hash_password(new))
            self.store.delete_sessions(open_['user'])
        try:
            self.reset_file.unlink()
        except OSError:
            pass
        return self.store.user(open_['user']), self.new_session(open_['user'])  # type: ignore[return-value]

    def set_password(self, by: dict[str, Any], user_id: str, new: str) -> None:
        """The owner gives a member a new password; the member's sign-ins end."""
        if by['role'] != 'owner':
            raise ValueError('Only an owner can reset passwords.')
        if user_id == by['id']:
            raise ValueError('Use Change password for the signed-in account.')
        if not self.store.user(user_id):
            raise ValueError('That account no longer exists.')
        if len(new) < MIN_PASSWORD:
            raise ValueError(f'The new password needs at least {MIN_PASSWORD} characters.')
        self.store.update_user(user_id, pw_hash=hash_password(new))
        self.store.delete_sessions(user_id)

    def remove(self, by: dict[str, Any], user_id: str) -> None:
        if by['role'] != 'owner':
            raise ValueError('Only an owner can remove accounts.')
        if user_id == by['id']:
            raise ValueError('The signed-in account cannot remove itself.')
        self.store.delete_sessions(user_id)
        self.store.delete_user(user_id)

    def list(self) -> list[dict[str, Any]]:
        return [{**public(u), 'sign_ins': [i['provider'] for i in self.store.identities(u['id'])]}  # type: ignore[dict-item]
                for u in self.store.users()]
