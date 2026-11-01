"""
Intern Co. // the open-plan office where Claude agents run the company.

Hubs (each with a purpose and a manager) and their interns work in a 3D office (office.js).
Give one or more hubs a goal; their managers plan it, the owner approves the plans, and the teams do the work as
real Claude Code agents (office_engine.py), using this computer's `claude` login. Start companies from
templates (templates.py: Research Lab, Study Buddy, Software Studio…) and switch between them.

Accounts (auth.py): the first start creates the owner account. Each account has its own
companies and goals, and can be linked to a Google account to sign in with (oauth.py). Settings (settings.py, the Settings window) hold usage limits, performance and memory.

Run:
    pip install -r requirements.txt
    python app/main.py                # opens Intern Co. in its own window (needs pywebview; else the browser)
    python app/main.py --browser      # open it in the browser instead, at http://localhost:8080
    python app/main.py --no-browser   # only start the server
Stop by closing the window, or with Ctrl+C in this terminal.

Settings (environment variables, mostly for testing):
    AGENT_OPS_PORT           port (default 8080)
    AGENT_OPS_DB             database file (default data/dashboard.db)
    AGENT_OPS_OFFICE_MODEL   Claude model for the agents (default: Claude Code's default)
    AGENT_OPS_LIBRARY        folder for the companies' shared files (default data/library/)

The previous game-style dashboard is kept in extras/archive/ for reference.
"""
from __future__ import annotations

import asyncio
import html
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import time
import webbrowser
from pathlib import Path
from typing import Any

from fastapi import Request
from fastapi.responses import HTMLResponse, JSONResponse, Response
from nicegui import app, ui

import kpis
from auth import COOKIE, SESSION_DAYS, Accounts, public
from company import CompanyBook, clean_company
from library import LIBRARY, Library
from oauth import PROVIDERS, SignInWith
from paths import HOME, WEB
from office_engine import WORKSPACES, OfficeEngine
import prompt_builder
import workspace_builder
import requirements
from store import DB_PATH, Store
from templates import summaries as template_summaries

PORT = int(os.environ.get('AGENT_OPS_PORT') or 8080)

store = Store()
store.mark_interrupted()  # a goal still 'running' from last time was cut off when the server stopped
accounts = Accounts(store, DB_PATH.parent / 'password-reset.txt')
sign_in_with = SignInWith(store, accounts)
GOOGLE_ONLY = 'Password sign-in is turned off. Continue with Google.'
library = Library(Path(os.environ['AGENT_OPS_LIBRARY']) if os.environ.get('AGENT_OPS_LIBRARY') else LIBRARY)
office = OfficeEngine(store, model=os.environ.get('AGENT_OPS_OFFICE_MODEL') or None, library=library)
BUSY = 'A goal is running. Change workspaces after it ends (or stop it).'
APP_VERSION = '0.14'  # raise with each set of features (shown in Settings → About app)
APP_DATE = '21 October 2026'
OPEN_PATHS = ('/api/auth/',)  # everything else under /api needs a signed-in account


def refused(message: str, status: int = 400) -> JSONResponse:
    return JSONResponse({'error': message}, status_code=status)


# ── accounts: who is signed in ──────────────────────────────────────────────
@app.middleware('http')
async def require_sign_in(request: Request, call_next: Any) -> Any:
    path = request.url.path
    if path.startswith('/api/') and not path.startswith(OPEN_PATHS):
        user = accounts.user_for(request.cookies.get(COOKIE))
        if user is None:
            return refused('Please sign in.', 401)
        request.state.user = user
    return await call_next(request)


def me(request: Request) -> dict[str, Any]:
    return request.state.user


def book(request: Request) -> CompanyBook:
    """The signed-in account's companies. The first owner keeps the companies made before accounts existed."""
    user = me(request)
    first = store.users()[0]['id'] if store.users() else ''
    return CompanyBook(store, user['id'], inherit=user['id'] == first)


def busy(request: Request) -> bool:
    return any(r.active and r.user_id == me(request)['id'] for r in office.runs.values())


def signed_in(user: dict[str, Any], token: str) -> JSONResponse:
    response = JSONResponse({'user': public(user)})
    response.set_cookie(COOKIE, token, max_age=SESSION_DAYS * 86400, httponly=True, samesite='lax')
    return response


@app.get('/api/auth/state')
def auth_state(request: Request) -> dict[str, Any]:
    return {'setup_needed': accounts.setup_needed, 'user': public(accounts.user_for(request.cookies.get(COOKIE))),
            'providers': [{'id': p, 'name': PROVIDERS[p]['name']} for p in sign_in_with.enabled()],
            'google_only': sign_in_with.only()}


@app.post('/api/auth/setup')
async def auth_setup(request: Request) -> Any:
    """First start: create the owner's account (with a password; with Google it is made by the Google sign-in)."""
    if not accounts.setup_needed:
        return refused('An account already exists. Sign in instead.', 409)
    if 'google' in sign_in_with.enabled():
        return refused('Use Google to create the owner account.')
    body = await request.json()
    try:
        user = accounts.create(str(body.get('name', '')), str(body.get('login', '')), str(body.get('password', '')))
    except ValueError as e:
        return refused(str(e))
    return signed_in(user, accounts.new_session(user['id']))


@app.post('/api/auth/login')
async def auth_login(request: Request) -> Any:
    if sign_in_with.only():
        return refused(GOOGLE_ONLY, 403)
    body = await request.json()
    try:
        user, token = accounts.sign_in(str(body.get('login', '')), str(body.get('password', '')))
    except ValueError as e:
        return refused(str(e), 401)
    return signed_in(user, token)


def show_file(path: Path) -> None:
    """Opens the file's folder in this computer's file manager, with the file selected."""
    if sys.platform == 'win32':
        subprocess.Popen(['explorer', f'/select,{path}'])
    elif sys.platform == 'darwin':
        subprocess.Popen(['open', '-R', str(path)])
    else:
        subprocess.Popen(['xdg-open', str(path.parent)])


# Forgot password (auth.py): the code goes into a file on this computer, so only someone at it can read it.
@app.post('/api/auth/forgot')
async def auth_forgot(request: Request) -> Any:
    body = await request.json()
    try:
        path = accounts.forgot(str(body.get('login', '')))
    except ValueError as e:
        return refused(str(e), 429 if 'just made' in str(e) else 400)
    except OSError:
        return refused('The verification code could not be saved.', 500)
    try:
        show_file(path)
    except OSError:
        pass  # the path is shown on screen as well
    return {'file': str(path)}


@app.post('/api/auth/forgot/show')
def auth_forgot_show() -> Any:
    if not accounts.reset_file.exists():
        return refused('No verification code is waiting. Request a new one.', 404)
    show_file(accounts.reset_file)
    return {'ok': True}


@app.post('/api/auth/reset')
async def auth_reset(request: Request) -> Any:
    body = await request.json()
    try:
        user, token = await asyncio.to_thread(accounts.reset, str(body.get('login', '')), str(body.get('code', '')),
                                              None if sign_in_with.only() else str(body.get('password', '')))
    except ValueError as e:
        return refused(str(e))
    return signed_in(user, token)


@app.post('/api/auth/logout')
def auth_logout(request: Request) -> Any:
    accounts.sign_out(request.cookies.get(COOKIE))
    response = JSONResponse({'ok': True})
    response.delete_cookie(COOKIE)
    return response


# Sign in with Google (oauth.py). Google won't show its page inside the app window, so it opens in this computer's
# browser; the app window polls /api/auth/finish with its token until the browser comes back to the callback.
async def start_external(provider: str, link_user: str = '', setup: bool = False) -> Any:
    if provider not in PROVIDERS:
        return refused('Unknown sign-in provider.', 404)
    try:
        url, poll = sign_in_with.start(provider, PORT, link_user, setup)
    except ValueError as e:
        return refused(str(e))
    if not await asyncio.to_thread(webbrowser.open, url):  # the server runs on this computer, so this is its browser
        sign_in_with.cancel(poll)
        return refused('The web browser could not be opened.')
    return {'poll': poll, 'url': url}


@app.post('/api/auth/{provider}/start')
async def auth_external_start(provider: str, setup: bool = False) -> Any:
    return await start_external(provider, setup=setup)


@app.get('/api/auth/{provider}/callback')
async def auth_external_callback(provider: str, state: str = '', code: str = '', error: str = '') -> HTMLResponse:
    """Where the provider sends the browser back. The sign-in itself is picked up by the app window."""
    ok, message = await sign_in_with.callback(provider, state, code, error)
    title = 'Signed in to Intern Co.' if ok else 'Sign-in failed'
    text = ('You can close this tab and return to Intern Co.<br>'
            'このタブを閉じて、Intern Co. に戻ってください。') if ok else html.escape(message)
    return HTMLResponse(f'''<!doctype html><html><head><meta charset="utf-8"><title>{title}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1"></head>
      <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#F4F1EA;font:15px system-ui,sans-serif;color:#2B3038">
      <div style="background:#fff;border-radius:20px;padding:28px;max-width:420px;margin:16px;box-shadow:0 10px 40px rgba(0,0,0,.08)">
      <div style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#8A7DB3">Intern Co.</div>
      <h1 style="font-size:21px;margin:8px 0 10px">{title}</h1><p style="line-height:1.5;color:#555B65">{text}</p></div></body></html>''',
                        status_code=200 if ok else 400)


@app.post('/api/auth/finish')
async def auth_external_finish(request: Request) -> Any:
    status, value, link = sign_in_with.finish(str((await request.json()).get('poll', '')))
    if status == 'waiting':
        return {'waiting': True}
    if status == 'gone':
        return refused('This sign-in session has expired. Please try again.', 410)
    if status == 'error':
        return refused(value)
    user = store.user(value)
    if not user:
        return refused('That account no longer exists.')
    return {'linked': True} if link else signed_in(user, accounts.new_session(user['id']))


@app.post('/api/auth/cancel')
async def auth_external_cancel(request: Request) -> Any:
    sign_in_with.cancel(str((await request.json()).get('poll', '')))
    return {'ok': True}


@app.post('/api/account/{provider}/link')
async def link_external(provider: str, request: Request) -> Any:
    return await start_external(provider, link_user=me(request)['id'])


@app.delete('/api/account/{provider}/link')
def unlink_external(provider: str, request: Request) -> Any:
    user = me(request)
    if sign_in_with.only():
        return refused('Google only is on, so the Google account cannot be unlinked.')
    if not user['pw_hash']:
        return refused('Set a password first, so the account can still sign in.')
    store.unlink_identity(user['id'], provider)
    return {'ok': True}


@app.get('/api/accounts')
def list_accounts(request: Request) -> Any:
    return accounts.list()


@app.post('/api/accounts')
async def add_account(request: Request) -> Any:
    if me(request)['role'] != 'owner':
        return refused('Only an owner can add accounts.', 403)
    body = await request.json()
    try:
        password = '' if sign_in_with.only() else str(body.get('password', ''))  # Google only: they sign in with Google
        return public(accounts.create(str(body.get('name', '')), str(body.get('login', '')), password,
                                      google_only='google' in sign_in_with.enabled()))
    except ValueError as e:
        return refused(str(e))


@app.delete('/api/accounts/{user_id}')
def remove_account(user_id: str, request: Request) -> Any:
    try:
        accounts.remove(me(request), user_id)
    except ValueError as e:
        return refused(str(e))
    return {'ok': True}


@app.post('/api/accounts/{user_id}/password')
async def reset_member_password(user_id: str, request: Request) -> Any:
    if sign_in_with.only():
        return refused(GOOGLE_ONLY)
    try:
        accounts.set_password(me(request), user_id, str((await request.json()).get('password', '')))
    except ValueError as e:
        return refused(str(e))
    return {'ok': True}


@app.post('/api/account/password')
async def change_password(request: Request) -> Any:
    if sign_in_with.only():
        return refused(GOOGLE_ONLY)
    body = await request.json()
    try:
        accounts.change_password(me(request)['id'], str(body.get('old', '')), str(body.get('new', '')))
    except ValueError as e:
        return refused(str(e))
    return {'ok': True}


# ── companies: hubs, managers, interns; templates ───────────────────────────
@app.get('/api/company')
def get_company(request: Request) -> dict[str, Any]:
    return book(request).active()


@app.put('/api/company')
async def put_company(request: Request) -> Any:
    if busy(request):  # renaming or removing someone mid-goal would cut them off from their team
        return refused(BUSY, 409)
    try:
        return book(request).save_active(clean_company(await request.json()))
    except ValueError as e:
        return refused(str(e))


@app.put('/api/company/design')
async def put_design(request: Request) -> Any:
    """How the open company looks: theme, time of day, weather, agent looks, hub styles. Visual only, so it is
    allowed while a goal runs."""
    body = await request.json()
    return book(request).save_design(body.get('design'), body.get('hubs'))


# ── shared files (library.py): documents every hub's agents can read ───────
@app.get('/api/files')
def list_files(request: Request) -> list[dict[str, Any]]:
    return library.list(book(request).active()['id'])


@app.post('/api/files')
async def add_file(request: Request, name: str, note: str = '') -> Any:
    """The file's bytes are the request body (no form encoding needed)."""
    try:
        return library.add(book(request).active()['id'], name, await request.body(), note)
    except ValueError as e:
        return refused(str(e))


@app.put('/api/files/{name}')
async def note_file(name: str, request: Request) -> Any:
    try:
        library.set_note(book(request).active()['id'], name, str((await request.json()).get('note', '')))
    except ValueError as e:
        return refused(str(e))
    return {'ok': True}


@app.delete('/api/files/{name}')
def remove_file(name: str, request: Request) -> Any:
    try:
        library.remove(book(request).active()['id'], name)
    except ValueError as e:
        return refused(str(e))
    return {'ok': True}


@app.get('/api/companies')
def list_companies(request: Request) -> dict[str, Any]:
    return book(request).list()


@app.get('/api/templates')
def list_templates() -> list[dict[str, Any]]:
    return template_summaries()


@app.post('/api/companies')
async def create_company(request: Request) -> Any:
    if busy(request):
        return refused(BUSY, 409)
    body = await request.json()
    built = body.get('company') if isinstance(body.get('company'), dict) else None  # from the workspace builder
    try:
        return book(request).create(str(body.get('template', '')), str(body.get('name', '')), built)
    except ValueError as e:
        return refused(str(e))


@app.post('/api/companies/design')
async def design_company(request: Request) -> Any:
    """The workspace builder (workspace_builder.py): a draft workspace for what the owner wants to achieve, or the
    draft changed as asked ({aim, company, lead, change}). Nothing is saved; POST /api/companies creates it."""
    body = await request.json()
    aim = str(body.get('aim', '')).strip()
    change = str(body.get('change', '')).strip()
    if not aim:
        return refused('Say what you want to achieve first.')
    if me(request).get('claude') != 'plan':
        return refused(PLAN_ONLY)
    if office.claude not in ('plan', 'api_key'):
        await office.refresh_usage(force=True)
    try:
        if change and isinstance(body.get('company'), dict):
            draft = clean_company(body['company'], strict=False)
            made, _ = await workspace_builder.revise(aim, draft, str(body.get('lead', '')), change)
        else:
            made, _ = await workspace_builder.design(aim)
    except Exception:  # not connected, or the CLI failed
        made = None
    if not made:
        return refused('The workspace could not be designed. Try again, or start from a template.', 502)
    return made


@app.post('/api/companies/{company_id}/open')
def open_company(company_id: str, request: Request) -> Any:
    if busy(request):
        return refused(BUSY, 409)
    try:
        return book(request).activate(company_id)
    except ValueError as e:
        return refused(str(e))


@app.delete('/api/companies/{company_id}')
def delete_company(company_id: str, request: Request) -> Any:
    try:
        book(request).delete(company_id)
    except ValueError as e:
        return refused(str(e))
    library.remove_company(company_id)
    office.notebooks.clear(company_id)
    return {'ok': True}


# ── goals and the real agents (office_engine.py) ────────────────────────────
# All async: they must run on the event loop together with the agents.
@app.get('/api/office/state')
async def office_state(request: Request, since: int = 0) -> dict[str, Any]:
    return office.state(since, me(request)['id'])


DRAFTS: dict[str, dict[str, Any]] = {}  # account id → {text, cost}: the prompt builder and requirement drafts for the goal about to start
PLAN_ONLY = 'Goals currently run on the owner\'s API key, which only the owner\'s account may use.'


@app.post('/api/office/prompt/questions')
async def office_prompt_questions(request: Request) -> Any:
    """The prompt builder's questions about the goal (prompt_builder.py). Nothing starts yet."""
    text = str((await request.json()).get('text', '')).strip()
    if not text:
        return refused('Describe the goal first.')
    user = me(request)
    if user.get('claude') != 'plan':
        return refused(PLAN_ONLY)
    if office.claude not in ('plan', 'api_key'):
        await office.refresh_usage(force=True)
    try:
        asked, cost = await prompt_builder.questions(text)
    except Exception:  # not connected, or the CLI failed: the goal can still go on as typed
        asked, cost = None, 0.0
    last = DRAFTS.get(user['id'])
    DRAFTS[user['id']] = {'text': text, 'cost': cost + (last['cost'] if last and last['text'] == text else 0.0)}
    if not asked:
        return refused('The questions could not be written. Try again, or go on with the goal as it is.', 502)
    return asked


@app.post('/api/office/prompt/rewrite')
async def office_prompt_rewrite(request: Request) -> Any:
    """The goal rewritten with the owner's answers. The usage so far moves to the new text, so it counts toward the
    goal if that text is started."""
    body = await request.json()
    text = str(body.get('text', '')).strip()
    answers = body.get('answers') if isinstance(body.get('answers'), list) else []
    if not text:
        return refused('Describe the goal first.')
    user = me(request)
    if user.get('claude') != 'plan':
        return refused(PLAN_ONLY)
    try:
        goal, cost = await prompt_builder.rewrite(text, answers)
    except Exception:
        goal, cost = None, 0.0
    last = DRAFTS.get(user['id'])
    DRAFTS[user['id']] = {'text': goal or text, 'cost': cost + (last['cost'] if last and last['text'] == text else 0.0)}
    if not goal:
        return refused('The goal could not be rewritten. Try again, or go on with the goal as it is.', 502)
    return {'goal': goal}


@app.post('/api/office/requirements')
async def office_requirements(request: Request) -> Any:
    """Draft the goal's requirements for the goal dialog (requirements.py). Nothing starts yet."""
    text = str((await request.json()).get('text', '')).strip()
    if not text:
        return refused('Describe the goal first.')
    user = me(request)
    if user.get('claude') != 'plan':
        return refused(PLAN_ONLY)
    if office.claude not in ('plan', 'api_key'):
        await office.refresh_usage(force=True)
    try:
        agreed, cost = await requirements.draft(text)
    except Exception:  # not connected, or the CLI failed: the goal can still start without a list
        agreed, cost = None, 0.0
    last = DRAFTS.get(user['id'])
    DRAFTS[user['id']] = {'text': text, 'cost': cost + (last['cost'] if last and last['text'] == text else 0.0)}
    if not agreed:
        return refused('The requirements could not be drafted. Try again, or start without them.', 502)
    return agreed


@app.post('/api/office/goal')
async def office_goal(request: Request) -> Any:
    body = await request.json()
    hubs = body.get('hubs') or ([body['department']] if body.get('department') else [])
    if office.claude not in ('plan', 'api_key'):  # not connected at the last check: signed in to Claude since?
        await office.refresh_usage(force=True)
    user = me(request)
    text = str(body.get('text', ''))
    draft = DRAFTS.get(user['id'])  # its usage counts toward this goal only if it was drafted for this goal
    error = office.start_goal(book(request).active(), text, [str(h) for h in hubs],
                              float(body.get('budget') or 1), lead=str(body.get('lead', '')),
                              limit_pct=body.get('limit_pct'), user=user, agreed=body.get('agreed'),
                              draft_cost=draft['cost'] if draft and draft['text'] == text.strip() else 0.0)
    if not error:
        DRAFTS.pop(user['id'], None)
    return refused(error) if error else {'ok': True}


@app.post('/api/office/inbox/{item_id}')
async def office_answer(item_id: str, request: Request) -> Any:
    body = await request.json()
    action = str(body.pop('action', ''))
    error = office.answer(item_id, action, user_id=me(request)['id'], **body)
    return refused(error) if error else {'ok': True}


@app.post('/api/office/rate/{mission_id}')
async def office_rate(mission_id: int, request: Request) -> Any:
    mission = store.mission(mission_id)
    if not mission or mission.get('user_id') not in ('', me(request)['id']):
        return refused('No such goal.', 404)
    error = office.rate(mission_id, str((await request.json()).get('rating', '')))
    return refused(error) if error else {'ok': True}


@app.get('/api/results')
def get_results(request: Request, days: int = 0, scope: str = 'company') -> dict[str, Any]:
    """The Results window: goal scorecards with the goal checker's verdicts, success and failure rates, and the
    team and card details; for the open company (default) or all of this account's companies."""
    mine = book(request)
    full = mine.all() if scope == 'all' else [mine.active()]
    companies = [c['id'] for c in full]
    return {**kpis.goals_report(store, companies, days), 'cards': kpis.compute(store, companies, days),
            'teams': kpis.teams(store, full, days),
            'checking': sorted(office.checking), 'checks_enabled': office.setting('checks', 'enabled')}


@app.post('/api/results/{mission_id}/check')
async def check_goal(mission_id: int, request: Request) -> Any:
    """Check (or re-check) a finished goal against what was asked."""
    goal = store.mission(mission_id)
    mine = {c['id'] for c in book(request).list()['companies']}
    if not goal or goal.get('company') not in mine:
        return refused('No such goal.', 404)
    if goal['status'] == 'running':
        return refused('This goal is still running; it is checked when it ends.')
    office.queue_check(mission_id)
    return {'checking': True}


@app.post('/api/results/{mission_id}/document')
def open_document(mission_id: int, request: Request) -> Any:
    """Open a goal's main document (its PDF, or HTML page) in this computer's own viewer."""
    goal = store.mission(mission_id)
    mine = {c['id'] for c in book(request).list()['companies']}
    if not goal or goal.get('company') not in mine:
        return refused('No such goal.', 404)
    folder = (WORKSPACES.parent / goal['workspace']).resolve()
    name = str((goal.get('state') or {}).get('document') or '')
    path = (folder / name).resolve()
    if not name or not path.is_relative_to(folder) or not path.is_file():
        return refused('This goal has no document to open.', 404)
    show_on_computer(path)
    return {'ok': True}


@app.post('/api/results/{mission_id}/folder')
def open_result_folder(mission_id: int, request: Request) -> Any:
    """Open a goal's files in this computer's file manager: the copy in the output folder, else the goal folder."""
    goal = store.mission(mission_id)
    mine = {c['id'] for c in book(request).list()['companies']}
    if not goal or goal.get('company') not in mine:
        return refused('No such goal.', 404)
    saved = Path(str((goal.get('state') or {}).get('saved_to') or ''))
    folder = saved if saved.is_absolute() and saved.is_dir() else (WORKSPACES.parent / goal['workspace']).resolve()
    if not folder.is_dir():
        return refused("This goal's folder no longer exists.", 404)
    show_on_computer(folder)
    return {'ok': True}


def show_on_computer(path: Path) -> None:
    """Open a file in its own app, or a folder in the file manager."""
    if sys.platform == 'win32':
        os.startfile(path)  # type: ignore[attr-defined]
    else:
        subprocess.Popen(['open' if sys.platform == 'darwin' else 'xdg-open', str(path)])


@app.post('/api/office/stop')
async def office_stop(request: Request) -> dict[str, Any]:
    """Stop one goal ({"goal": id}), or every running goal of this account."""
    try:
        goal = (await request.json()).get('goal')
    except ValueError:
        goal = None
    office.stop(int(goal) if goal else None, user_id=me(request)['id'])
    return {'ok': True}


@app.post('/api/office/pause')
async def office_pause(request: Request) -> Any:
    """Pause ({"goal": id, "on": true}) or resume (on: false) one running goal of this account."""
    body = await request.json()
    error = office.hold(int(body.get('goal') or 0), bool(body.get('on')), user_id=me(request)['id'])
    return refused(error) if error else {'ok': True}


@app.post('/api/results/{mission_id}/continue')
async def continue_goal(mission_id: int, request: Request) -> Any:
    """Continue a stopped, ended or interrupted goal of the active company, from where it was left."""
    if office.claude not in ('plan', 'api_key'):
        await office.refresh_usage(force=True)
    error = office.continue_goal(book(request).active(), mission_id, user=me(request))
    return refused(error) if error else {'ok': True}


# ── your Claude plan usage (5-hour and weekly windows) and the limits that pause work ──
@app.get('/api/usage')
async def get_usage() -> dict[str, Any]:
    asyncio.create_task(office.refresh_usage())  # a fresh reading in the background, if the last one is old
    return office.usage()


@app.post('/api/usage/refresh')
async def refresh_usage() -> dict[str, Any]:
    await office.refresh_usage(force=True)
    return office.usage()


# ── Settings ────────────────────────────────────────────────────────────────
def folder_size(path: Path) -> tuple[int, int]:
    """(bytes, files) under a folder."""
    total = count = 0
    for f in path.rglob('*') if path.exists() else []:
        if f.is_file():
            total += f.stat().st_size
            count += 1
    return total, count


def goal_folders() -> list[Path]:
    return sorted(p for p in WORKSPACES.glob('goal-*') if p.is_dir()) if WORKSPACES.exists() else []


@app.get('/api/settings')
def get_settings(request: Request) -> dict[str, Any]:
    company = book(request).active()
    ws_bytes, _ = folder_size(WORKSPACES)
    lib_bytes, lib_files = folder_size(library.root)
    db_bytes = sum(p.stat().st_size for p in DB_PATH.parent.glob(DB_PATH.name + '*') if p.is_file())
    return {
        'app': office.settings,
        'agents': {k: company.get(k) for k in ('model', 'prompt_style', 'helpers')},
        'account': public(me(request)),
        'identities': store.identities(me(request)['id']),  # the Google account(s) linked to it
        'sign_in': sign_in_with.public_config(PORT) if me(request)['role'] == 'owner' else None,
        'providers': sign_in_with.enabled(),
        'google_only': sign_in_with.only(),
        'claude': office.usage(),
        'data': {'output': office.output, 'native': app.native.main_window is not None,
                 'workspaces': str(WORKSPACES), 'workspaces_bytes': ws_bytes, 'goal_folders': len(goal_folders()),
                 'library': str(library.root), 'library_bytes': lib_bytes, 'library_files': lib_files,
                 'database': str(DB_PATH), 'database_bytes': db_bytes},
    }


@app.put('/api/settings')
async def put_settings(request: Request) -> Any:
    if me(request)['role'] != 'owner':  # these apply to the whole app (and its Claude plan)
        return refused('Only an owner can change these settings.', 403)
    return office.save_settings(await request.json())


@app.put('/api/settings/output')
async def put_output(request: Request) -> Any:
    """The output folder (Settings → Data): each finished goal's files are copied there. Blank turns it off."""
    if me(request)['role'] != 'owner':
        return refused('Only an owner can change these settings.', 403)
    try:
        return {'output': office.set_output(str((await request.json()).get('folder', '')))}
    except ValueError as e:
        return refused(str(e))


@app.post('/api/settings/output/choose')
async def choose_output(request: Request) -> Any:
    """Ask for a folder with the computer's own folder picker (only in the app window). Doesn't save it."""
    if me(request)['role'] != 'owner':
        return refused('Only an owner can change these settings.', 403)
    window = app.native.main_window
    if window is None:
        return refused('The folder picker works in the app window. Type or paste the folder path instead.')
    import webview
    picked = await window.create_file_dialog(webview.FileDialog.FOLDER, directory=office.output or str(Path.home()))
    return {'folder': str(picked[0]) if picked else ''}


@app.post('/api/settings/output/open')
def open_output(request: Request) -> Any:
    folder = Path(office.output) if office.output else None
    if folder is None:
        return refused('No output folder is set.')
    folder.mkdir(parents=True, exist_ok=True)
    show_on_computer(folder)
    return {'ok': True}


@app.put('/api/settings/sign-in')
async def put_sign_in(request: Request) -> Any:
    """The owner's Google OAuth client (Settings → Account). A blank Client ID turns Google sign-in off."""
    if me(request)['role'] != 'owner':
        return refused('Only an owner can change these settings.', 403)
    body = await request.json()
    try:
        sign_in_with.save_config(str(body.get('provider', 'google')), str(body.get('client_id', '')),
                                 str(body.get('client_secret', '')))
    except ValueError as e:
        return refused(str(e))
    return sign_in_with.public_config(PORT)


@app.put('/api/settings/sign-in/only')
async def put_google_only(request: Request) -> Any:
    """Google only on or off (Settings → Account). On needs the owner's account linked to Google."""
    user = me(request)
    if user['role'] != 'owner':
        return refused('Only an owner can change these settings.', 403)
    try:
        locked_out = sign_in_with.set_only(bool((await request.json()).get('on')), user['id'])
    except ValueError as e:
        return refused(str(e))
    return {**sign_in_with.public_config(PORT), 'locked_out': locked_out}


@app.put('/api/settings/agents')
async def put_agent_settings(request: Request) -> Any:
    company = book(request).save_agents(await request.json())
    return {k: company.get(k) for k in ('model', 'prompt_style', 'helpers')}


@app.get('/api/about')
def about() -> dict[str, Any]:
    """Settings → About app: the version, this computer's setup, and the manual (MANUAL.md) as HTML."""
    import platform

    import markdown2  # comes with NiceGUI
    manual = HOME / 'MANUAL.md'
    html = markdown2.markdown(manual.read_text(encoding='utf-8'), extras=['tables', 'header-ids', 'fenced-code-blocks']) \
        if manual.exists() else '<p>The manual (MANUAL.md) is missing from the app folder.</p>'
    return {'name': 'Intern Co.', 'version': APP_VERSION, 'date': APP_DATE, 'manual': html,
            'python': platform.python_version(), 'claude_code': office.claude_version, 'folder': str(HOME)}


# hub notebooks (memory.py)
@app.get('/api/memory')
def get_memory(request: Request) -> dict[str, Any]:
    return office.notebooks.all(book(request).active()['id'])


@app.post('/api/memory/{hub_id}')
async def add_memory(hub_id: str, request: Request) -> Any:
    try:
        return office.notebooks.add(book(request).active()['id'], hub_id, str((await request.json()).get('text', '')),
                                    'owner')
    except ValueError as e:
        return refused(str(e))


@app.delete('/api/memory/{hub_id}')
def remove_memory(hub_id: str, request: Request, at: float = 0) -> Any:
    company = book(request).active()['id']
    if at:
        office.notebooks.remove(company, hub_id, at)
    else:
        office.notebooks.clear(company, hub_id if hub_id != 'all' else '')
    return {'ok': True}


# data: clean up old goal folders, export / import companies
@app.post('/api/data/cleanup')
async def cleanup(request: Request) -> Any:
    if me(request)['role'] != 'owner':
        return refused('Only an owner can delete goal folders.', 403)
    days = max(float((await request.json()).get('days', 30)), 0)
    keep = {r.workspace.resolve() for r in office.runs.values() if r.active}
    cutoff, removed, freed = time.time() - days * 86400, 0, 0
    for folder in goal_folders():
        if folder.resolve() in keep or folder.stat().st_mtime > cutoff:
            continue
        freed += folder_size(folder)[0]
        shutil.rmtree(folder, ignore_errors=True)
        removed += 1
    return {'removed': removed, 'freed_bytes': freed}


@app.get('/api/data/export')
def export_companies(request: Request) -> Response:
    data = {'app': 'Intern Co.', 'exported_at': time.time(), 'companies': book(request).list_full()}
    return Response(json.dumps(data, indent=1), media_type='application/json',
                    headers={'Content-Disposition': 'attachment; filename="intern-co-companies.json"'})


@app.post('/api/data/import')
async def import_companies(request: Request) -> Any:
    if busy(request):
        return refused(BUSY, 409)
    try:
        data = json.loads(await request.body())
        added = book(request).import_companies(data.get('companies') or [])
    except (ValueError, AttributeError) as e:
        return refused(f'That file could not be imported: {e}')
    return {'added': added}


# ── the page ────────────────────────────────────────────────────────────────
@ui.page('/')
def office_page() -> None:
    """The office itself is drawn by office.js (after the sign-in screen); this page only hosts it."""
    ui.add_head_html('<link rel="preconnect" href="https://fonts.googleapis.com">'
                     '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" '
                     'rel="stylesheet"><script type="module" src="/office.js"></script>')
    ui.query('.nicegui-content').classes('p-0 gap-0')
    ui.element('div').props('id=office-stage')


app.on_shutdown(office.on_shutdown)
app.on_startup(lambda: asyncio.create_task(office.refresh_usage(force=True)))  # the plan's usage, at start
app.add_static_file(local_file=WEB / 'office.js', url_path='/office.js', max_cache_age=0)
app.add_static_file(local_file=WEB / 'i18n.js', url_path='/i18n.js', max_cache_age=0)  # English / Japanese screens
app.add_static_file(local_file=WEB / 'intern-co.png', url_path='/intern-co.png')

if __name__ in {'__main__', '__mp_main__'}:
    # its own window (pywebview) unless asked for the browser; the window keeps you signed in between starts
    native = '--browser' not in sys.argv and '--no-browser' not in sys.argv and bool(importlib.util.find_spec('webview'))
    if native:
        app.native.start_args['private_mode'] = False
        app.native.settings['ALLOW_DOWNLOADS'] = True  # Settings → Data → Export saves a file from the app window
        app.native.window_args['min_size'] = (900, 600)
    ui.run(
        title='Intern Co.',
        host='127.0.0.1',
        port=PORT,
        dark=False,
        reload=False,
        native=native,
        window_size=(1440, 900) if native else None,
        show=not native and '--no-browser' not in sys.argv,
        favicon=WEB / 'intern-co.ico',  # the logo: a white "I" on a purple tile (also the desktop shortcut's icon)
    )
