"""
Sign in with Google: an app account can be linked to a real Google account (more providers can be added to PROVIDERS).

- The Google "Desktop app" OAuth client is built into the app: google_client.json next to this file (the JSON
  Google Cloud Console downloads, or {"client_id", "client_secret"}), shipped with the app, so nobody else has
  to set Google up. A desktop client's secret is not secret by Google's own rules (anyone can read it from the app);
  PKCE and the loopback redirect protect the sign-in. The owner can still paste another client in Settings →
  Account (kept in the database, settings 'sign_in'); a pasted client wins over the built-in one.
- Google only ('only' in the setting): the password sign-in is refused and the sign-in screen shows only Google,
  with a backup code in a file on this computer (auth.Accounts.forgot). It can only be turned on once the owner's
  account is linked to Google, and Google can't be turned off or unlinked while it is on. With no working client
  (none built in or pasted), the password sign-in comes back, so nobody is locked out by a missing file.
- First start with Google: when there are no accounts yet, the first Google sign-in started from the first-start
  screen creates the owner (name and address from Google, no password) and turns Google only on.
- Google refuses to show its sign-in page inside embedded app windows, so sign-in happens in this computer's own
  browser: the app window starts it, the server opens Google in the browser, Google sends the browser back to
  /api/auth/google/callback on this server, and the app window, which polls with a token only it knows, gets the
  sign-in cookie. The `state` sent to Google and the `poll` token are different, so the token that signs in never
  appears in a URL. Both are one-time and expire after 10 minutes.
- Accounts are matched on Google's account id ('sub'), never on the email alone. The one exception: an account the
  owner added with a Google address and no password is linked on its first Google sign-in (verified email only).
- Linking is done from Settings → Account while signed in; an unknown Google account is refused, not signed up.
- PKCE (S256) protects the code exchange.
"""
from __future__ import annotations

import base64
import hashlib
import json
import secrets
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import httpx

from paths import HOME

PROVIDERS: dict[str, dict[str, str]] = {
    'google': {'name': 'Google',
               'auth': 'https://accounts.google.com/o/oauth2/v2/auth',
               'token': 'https://oauth2.googleapis.com/token',
               'userinfo': 'https://openidconnect.googleapis.com/v1/userinfo',
               'scope': 'openid email profile'},
}
PENDING_SECONDS = 600
SETTING = 'sign_in'
BUILT_IN = {'google': HOME / 'google_client.json'}


def redirect_uri(provider: str, port: int) -> str:
    return f'http://127.0.0.1:{port}/api/auth/{provider}/callback'


def read_client(path: Path) -> dict[str, str] | None:
    """A client file: Google Cloud Console's download ({"installed": {...}}) or a plain {"client_id", "client_secret"}."""
    try:
        raw = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None
    raw = raw.get('installed') or raw.get('web') or raw if isinstance(raw, dict) else {}
    cid, secret = str(raw.get('client_id') or '').strip(), str(raw.get('client_secret') or '').strip()
    return {'client_id': cid, 'client_secret': secret} if cid and secret else None


class SignInWith:
    def __init__(self, store: Any, accounts: Any) -> None:
        self.store = store
        self.accounts = accounts  # auth.Accounts: the first Google sign-in creates the owner
        self.pending: dict[str, dict[str, Any]] = {}  # by state

    # ── the provider settings ─────────────────────────────────────────────
    def _config(self) -> dict[str, Any]:
        return self.store.setting(SETTING) or {}

    def pasted(self, provider: str) -> dict[str, str] | None:
        c = self._config().get(provider) or {}
        return c if c.get('client_id') else None

    def built_in(self, provider: str) -> dict[str, str] | None:
        return read_client(BUILT_IN[provider]) if provider in BUILT_IN else None

    def client(self, provider: str) -> dict[str, str] | None:
        return self.pasted(provider) or self.built_in(provider)

    def enabled(self) -> list[str]:
        return [p for p in PROVIDERS if self.client(p)]

    def only(self) -> bool:
        """Google only, in effect (it needs a working client)."""
        return bool(self._config().get('only')) and 'google' in self.enabled()

    def set_only(self, on: bool, owner_id: str) -> list[str]:
        """Turns Google only on or off. Returns the names of accounts that can then no longer sign in."""
        config = self._config()
        if on:
            if 'google' not in self.enabled():
                raise ValueError('Set up Google sign-in first.')
            if not self.store.identities(owner_id):
                raise ValueError('Link this account to Google first (above), so it can still sign in.')
        config['only'] = bool(on)
        self.store.save_setting(SETTING, config)
        if not on:
            return []
        return [u['name'] for u in self.store.users() if u['id'] != owner_id and not self.store.identities(u['id'])]

    def public_config(self, port: int) -> dict[str, Any]:
        """For Settings: the Client ID may be shown, the secret never."""
        return {**{p: {'name': PROVIDERS[p]['name'], 'client_id': (self.pasted(p) or {}).get('client_id', ''),
                       'has_secret': bool((self.pasted(p) or {}).get('client_secret')),
                       'built_in': bool(self.built_in(p)),
                       'redirect': redirect_uri(p, port)} for p in PROVIDERS},
                'only': self.only()}

    def save_config(self, provider: str, client_id: str, client_secret: str) -> None:
        """A blank secret keeps the saved one; a blank Client ID removes the pasted client (the built-in one, if
        any, is used again)."""
        if provider not in PROVIDERS:
            raise ValueError('Unknown sign-in provider.')
        config = self._config()
        old = config.get(provider) or {}
        client_id, client_secret = client_id.strip(), client_secret.strip()
        if not client_id:
            if self.only() and not self.built_in(provider):
                raise ValueError('Turn off "Google only" first, or nobody could sign in.')
            config.pop(provider, None)
        else:
            secret = client_secret or (old.get('client_secret', '') if old.get('client_id') == client_id else '')
            if not secret:
                raise ValueError('Paste the client secret too.')
            config[provider] = {'client_id': client_id, 'client_secret': secret}
        self.store.save_setting(SETTING, config)

    # ── one sign-in or link attempt ───────────────────────────────────────
    def start(self, provider: str, port: int, link_user: str = '', setup: bool = False) -> tuple[str, str]:
        """(the provider's sign-in page, the poll token for the app window). `setup`: from the first-start screen."""
        client = self.client(provider)
        if not client:
            raise ValueError(f'Sign-in with {PROVIDERS.get(provider, {}).get("name", provider)} is not set up.')
        if setup and not self.accounts.setup_needed:
            raise ValueError('An account already exists. Sign in instead.')
        now = time.time()
        self.pending = {k: v for k, v in self.pending.items() if v['expires'] > now}
        state, poll, verifier = secrets.token_urlsafe(24), secrets.token_urlsafe(32), secrets.token_urlsafe(48)
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
        self.pending[state] = {'provider': provider, 'poll': poll, 'verifier': verifier, 'link': link_user, 'setup': setup,
                               'redirect': redirect_uri(provider, port), 'expires': now + PENDING_SECONDS, 'result': None}
        p = PROVIDERS[provider]
        url = p['auth'] + '?' + urlencode({
            'client_id': client['client_id'], 'redirect_uri': redirect_uri(provider, port), 'response_type': 'code',
            'scope': p['scope'], 'state': state, 'code_challenge': challenge, 'code_challenge_method': 'S256',
            'prompt': 'select_account'})
        return url, poll

    async def callback(self, provider: str, state: str, code: str, error: str) -> tuple[bool, str]:
        """The browser came back from the provider. (ok, what to show in the browser tab)."""
        attempt = self.pending.get(state)
        if not attempt or attempt['provider'] != provider or attempt['expires'] < time.time() or attempt['result']:
            return False, 'This sign-in session has expired. Please try again from Intern Co.'
        if error or not code:
            attempt['result'] = ('error', 'Sign-in was cancelled.')
            return False, attempt['result'][1]
        try:
            profile = await self._profile(provider, code, attempt)
            attempt['result'] = ('ok', self._resolve(provider, profile, attempt['link'], attempt['setup']))
        except ValueError as e:
            attempt['result'] = ('error', str(e))
        except httpx.HTTPError:
            attempt['result'] = ('error', f'{PROVIDERS[provider]["name"]} could not be reached. Try again.')
        return attempt['result'][0] == 'ok', attempt['result'][1] if attempt['result'][0] == 'error' else ''

    async def _profile(self, provider: str, code: str, attempt: dict[str, Any]) -> dict[str, Any]:
        p, client = PROVIDERS[provider], self.client(provider)
        if not client:
            raise ValueError(f'Sign-in with {p["name"]} is not set up.')
        async with httpx.AsyncClient(timeout=15) as http:
            r = await http.post(p['token'], data={
                'code': code, 'client_id': client['client_id'], 'client_secret': client['client_secret'],
                'redirect_uri': attempt['redirect'], 'grant_type': 'authorization_code',
                'code_verifier': attempt['verifier']})
            if r.status_code != 200:
                raise ValueError(f'{p["name"]} refused the sign-in. Check the Client ID and secret in Settings → Account.')
            r = await http.get(p['userinfo'], headers={'Authorization': f'Bearer {r.json()["access_token"]}'})
            r.raise_for_status()
            profile = r.json()
        if not profile.get('sub'):
            raise ValueError(f'{p["name"]} did not say which account signed in.')
        if not profile.get('email') or str(profile.get('email_verified')).lower() != 'true':  # a boolean (or "true")
            raise ValueError(f'The {p["name"]} account has no verified email address.')
        return profile

    def _resolve(self, provider: str, profile: dict[str, Any], link_user: str, setup: bool = False) -> str:
        """The app account this Google account signs in to (or is now linked to, or, on first start, creates)."""
        name, sub, email = PROVIDERS[provider]['name'], str(profile['sub']), str(profile['email'])
        owner_of = self.store.identity_user(provider, sub)
        if link_user:
            if owner_of and owner_of != link_user:
                raise ValueError(f'That {name} account is already linked to another account here.')
            self.store.unlink_identity(link_user, provider)
            self.store.link_identity(provider, sub, link_user, email)
            return link_user
        if owner_of:
            return owner_of
        if setup and self.accounts.setup_needed:  # first start: this Google account becomes the owner
            user = self.accounts.create(str(profile.get('name') or email.split('@')[0]), email, '', google_only=True)
            self.store.link_identity(provider, sub, user['id'], email)
            config = self._config()
            config['only'] = True
            self.store.save_setting(SETTING, config)
            return user['id']
        # added by the owner with this address (and no password, unless Google only is on: passwords are not used then)
        invited = self.store.user_by_login(email)
        if invited and (not invited['pw_hash'] or self.only()) and not self.store.identities(invited['id']):
            self.store.link_identity(provider, sub, invited['id'], email)
            return invited['id']
        if self.only():
            raise ValueError(f'No Intern Co. account is linked to {email}. Contact the owner of this app for access.')
        raise ValueError(f'No Intern Co. account is linked to {email}. Sign in with your password, then link {name} '
                         'in Settings → Account.')

    def finish(self, poll: str) -> tuple[str, str, bool]:
        """For the polling app window: (status, value, was a link) with status 'waiting', 'ok' (value: the user id),
        'error' (value: the message) or 'gone'."""
        for state, attempt in list(self.pending.items()):
            if secrets.compare_digest(attempt['poll'], poll):
                link = bool(attempt['link'])
                if attempt['expires'] < time.time():
                    del self.pending[state]
                    return 'error', 'This sign-in session has expired. Please try again.', link
                if not attempt['result']:
                    return 'waiting', '', link
                del self.pending[state]  # one-time
                return (*attempt['result'], link)
        return 'gone', '', False

    def cancel(self, poll: str) -> None:
        self.pending = {k: v for k, v in self.pending.items() if not secrets.compare_digest(v['poll'], poll)}
