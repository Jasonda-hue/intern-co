"""
Companies: each is a set of hubs, and each hub has a purpose, a manager and interns with roles.

Each account keeps several saved companies (for example one made from the Research Lab template and
one from Study Buddy) and switches between them; CompanyBook stores them in the settings table under
'companies:<account id>'. (Internally a hub is still called a "department" in the data.)

clean_company(strict=True) checks what the owner submits and explains any problem.
clean_company(strict=False) is used when loading: it repairs older or odd documents
(missing managers, duplicate names…) instead of throwing the owner's setup away.
Names are unique within a company, because agents address each other by name.
"""
from __future__ import annotations

import re
import uuid
from typing import Any

from templates import company_from_template

MAX_DEPARTMENTS = 8
MAX_PER_DEPARTMENT = 12
MAX_INTERNS = 40
MAX_COMPANIES = 20
PURPOSE_LIMIT = 400
# Claude models an agent can run on ('' = inherit from the level above; at the top, Claude Code's default).
MODELS = {'claude-opus-5-5': 'Opus 5.5', 'claude-sonnet-5-5': 'Sonnet 5.5', 'claude-haiku-4-5': 'Haiku 4.5'}
# Helper sub-agents are off unless the owner turns them on: measured 2026-10-01, a Sonnet intern reading five source
# files fully used about half as much alone as with five Haiku helpers (each helper has its own ~10k-token overhead).
# They pay off only when an expensive model would otherwise read very large amounts of text itself.
HELPER_DEFAULT = 'off'


def clean_model(value: Any) -> str:
    value = str(value or '')
    if value.startswith('claude-haiku-4-5'):  # an older dated Haiku id → the current alias
        value = 'claude-haiku-4-5'
    return value if value in MODELS else ''


def model_for(company: dict[str, Any], dept: dict[str, Any], person: dict[str, Any], manager: bool) -> str | None:
    """Which model a person runs on: their own choice, else their hub's, else the company's; None = Claude Code's."""
    hub = dept.get('manager_model') if manager else dept.get('intern_model')
    return (('' if manager else person.get('model')) or hub or company.get('model') or None)


COLORS = ['#5B7DB1', '#C0975A', '#6E9C7A', '#C47A62', '#8A7DB3', '#4F9A9A', '#B5738F', '#7F8C5A', '#A0826D', '#6B7A8F']
SPARE_NAMES = ['Morgan', 'Sofia', 'Marcus', 'Nadia', 'Owen', 'Clara', 'Elliot', 'Hazel', 'Julian', 'Lucia', 'Rhys',
               'Stella', 'Tobias', 'Vivian', 'Adrian', 'Beatrice']


# How the world looks (visual only; office.js draws it). Changing it never affects the agents.
THEMES = ['office', 'space', 'forest', 'lab', 'library']
TIMES = ['day', 'sunset', 'night', 'live']          # 'live' follows the computer's clock
WEATHERS = ['clear', 'cloudy', 'rain', 'snow', 'fog']
LOOKS = ['people', 'robots', 'animals', 'shapes']
HUB_STYLES = ['desks', 'lab', 'greenhouse', 'workshop', 'studio', 'library', 'lounge']
# a hub's world (its furniture): '' = a random world that stays the same for that hub, 'match' = the company's theme
HUB_WORLDS = ['', 'match', *THEMES]
DEFAULT_DESIGN = {'theme': 'office', 'time': 'day', 'weather': 'clear', 'looks': 'people'}


def clean_design(value: Any) -> dict[str, str]:
    value = value if isinstance(value, dict) else {}
    pick = lambda key, options: value.get(key) if value.get(key) in options else DEFAULT_DESIGN[key]  # noqa: E731
    return {'theme': pick('theme', THEMES), 'time': pick('time', TIMES), 'weather': pick('weather', WEATHERS),
            'looks': pick('looks', LOOKS)}


def new_id(prefix: str) -> str:
    return f'{prefix}-{uuid.uuid4().hex[:8]}'


def default_company() -> dict[str, Any]:
    return clean_company(company_from_template('software'))


class _Cleaner:
    def __init__(self, strict: bool) -> None:
        self.strict = strict
        self.ids: set[str] = set()
        self.names: set[str] = set()
        self.reserved: set[str] = set()  # every name in the document, so invented names avoid them

    def text(self, value: Any, field: str, limit: int, required: bool = True, fallback: str = '') -> str:
        text = ' '.join(str(value or '').split())
        if required and not text:
            if self.strict or not fallback:
                raise ValueError(f'{field} cannot be empty.')
            text = fallback
        if len(text) > limit:
            if self.strict:
                raise ValueError(f'{field} is too long (max {limit} characters): "{text[:30]}…"')
            text = text[:limit].rstrip()
        return text

    def unique_id(self, value: Any, prefix: str) -> str:
        ident = str(value or '')
        if not ident or ident in self.ids:
            ident = new_id(prefix)
        self.ids.add(ident)
        return ident

    def person_name(self, value: Any, field: str) -> str:
        name = self.text(value, field, 24, fallback=self.spare_name())
        if name.lower() in self.names:
            if self.strict:
                raise ValueError(f'Two people are called "{name}". Names must be unique so the team can tell them apart.')
            base, n = name, 2
            while f'{base} {n}'.lower() in self.names:
                n += 1
            name = f'{base} {n}'
        self.names.add(name.lower())
        return name

    def spare_name(self) -> str:
        taken = self.names | self.reserved
        return next((n for n in SPARE_NAMES if n.lower() not in taken), f'Person {len(self.names) + 1}')


def clean_company(data: Any, strict: bool = True) -> dict[str, Any]:
    """Validate and normalise a company document. Raises ValueError with a message for the owner."""
    c = _Cleaner(strict)
    if not isinstance(data, dict):
        raise ValueError('The workspace data is not in the right format.')
    departments = data.get('departments')
    if not isinstance(departments, list) or not departments:
        raise ValueError('The workspace needs at least one hub.')
    if len(departments) > MAX_DEPARTMENTS:
        raise ValueError(f'At most {MAX_DEPARTMENTS} hubs fit in the office.')
    out: dict[str, Any] = {'id': str(data.get('id') or '') or new_id('co'),
                           'name': c.text(data.get('name'), 'Company name', 40, fallback='Intern Co.'),
                           'template': str(data.get('template') or ''),
                           'model': clean_model(data.get('model')),
                           # agents' base instructions: 'lean' (short, much cheaper) or 'full' (Claude Code's own)
                           'prompt_style': 'full' if data.get('prompt_style') == 'full' else 'lean',
                           # helper sub-agents: the model they run on, or 'off'
                           'helpers': clean_model(data.get('helpers')) or HELPER_DEFAULT,
                           'design': clean_design(data.get('design')),
                           'departments': []}
    seen_depts: set[str] = set()
    total = 0
    # a repaired (missing) manager name must not take a name someone further down already has
    for dept in departments:
        if isinstance(dept, dict):
            people = [dept.get('manager')] + list(dept.get('interns') or [])
            c.reserved |= {' '.join(str(p.get('name') or '').split()).lower() for p in people if isinstance(p, dict)}
    for i, dept in enumerate(departments):
        if not isinstance(dept, dict):
            raise ValueError('A hub in the workspace data is not in the right format.')
        name = c.text(dept.get('name'), 'Hub name', 30, fallback=f'Hub {i + 1}')
        if name.lower() in seen_depts:
            if strict:
                raise ValueError(f'There are two hubs called "{name}".')
            name = f'{name} {i + 1}'
        seen_depts.add(name.lower())
        color = str(dept.get('color') or '')
        if not re.fullmatch(r'#[0-9A-Fa-f]{6}', color):
            color = COLORS[i % len(COLORS)]
        interns = dept.get('interns') or []
        if not isinstance(interns, list):
            raise ValueError(f'{name}: mini agents must be a list.')
        if len(interns) > MAX_PER_DEPARTMENT:
            raise ValueError(f'{name} has {len(interns)} mini agents; one hub seats at most {MAX_PER_DEPARTMENT}.')
        total += len(interns)
        manager = dept.get('manager') if isinstance(dept.get('manager'), dict) else {}
        clean_manager = {'id': c.unique_id(manager.get('id'), 'mgr'),
                         'name': c.person_name(manager.get('name'), f"{name}'s manager")}
        clean_interns = []
        for intern in interns:
            if not isinstance(intern, dict):
                raise ValueError(f'{name}: each mini agent must be an object.')
            clean_interns.append({
                'id': c.unique_id(intern.get('id'), 'intern'),
                'name': c.person_name(intern.get('name'), f'Mini agent name in {name}'),
                'role': c.text(intern.get('role'), 'Role', 60, required=False) or 'Intern',
                'model': clean_model(intern.get('model')),
            })
        out['departments'].append({
            'id': c.unique_id(dept.get('id'), 'dept'), 'name': name, 'color': color.upper(),
            'purpose': c.text(dept.get('purpose'), f"{name}'s purpose", PURPOSE_LIMIT, required=False),
            'manager_model': clean_model(dept.get('manager_model')), 'intern_model': clean_model(dept.get('intern_model')),
            'style': dept.get('style') if dept.get('style') in HUB_STYLES else 'desks',
            'looks': dept.get('looks') if dept.get('looks') in LOOKS else '',  # '' = the company's look
            'world': dept.get('world') if dept.get('world') in HUB_WORLDS else '',
            'manager': clean_manager, 'interns': clean_interns})
    if total > MAX_INTERNS:
        raise ValueError(f'That is {total} mini agents; the office holds at most {MAX_INTERNS}.')
    return out


class CompanyBook:
    """The owner's saved companies and which one is open. Stored as one settings document:
    {'active': <company id>, 'companies': [<company>, …]}."""

    KEY = 'companies'

    def __init__(self, store: Any, user_id: str = '', inherit: bool = False) -> None:
        """Each account has its own book (settings 'companies:<user id>'). The owner's book starts from the
        companies saved before accounts existed (inherit=True)."""
        self.store = store
        self.inherit = inherit
        self.key = f'{self.KEY}:{user_id}' if user_id else self.KEY

    def _load(self) -> dict[str, Any]:
        book = self.store.setting(self.key)
        if isinstance(book, dict) and book.get('companies'):
            return book
        before = self.store.setting(self.KEY) if self.inherit and self.key != self.KEY else None
        if isinstance(before, dict) and before.get('companies'):  # the companies made before accounts existed
            self.store.save_setting(self.key, before)
            return before
        if self.key != self.KEY:  # a new account starts with the default company
            first = default_company()
            book = {'active': first['id'], 'companies': [first]}
            self.store.save_setting(self.key, book)
            return book
        # first run, or upgrading from the single saved company of earlier versions
        legacy = self.store.setting('company')
        try:
            first = clean_company(legacy, strict=False) if legacy else default_company()
        except ValueError:
            first = default_company()
        book = {'active': first['id'], 'companies': [first]}
        self.store.save_setting(self.key, book)
        return book

    def _save(self, book: dict[str, Any]) -> None:
        self.store.save_setting(self.key, book)

    def _repair(self, company: dict[str, Any]) -> dict[str, Any]:
        try:
            return clean_company(company, strict=False)
        except ValueError:  # beyond repair: keep the name, start its hubs from the default
            fresh = default_company()
            fresh['id'], fresh['name'] = company.get('id') or fresh['id'], company.get('name') or fresh['name']
            return fresh

    def active(self) -> dict[str, Any]:
        book = self._load()
        company = next((c for c in book['companies'] if c.get('id') == book['active']), book['companies'][0])
        return self._repair(company)

    def all(self) -> list[dict[str, Any]]:
        """Every saved company in full (for the Results window's Teams tab)."""
        return [self._repair(c) for c in self._load()['companies']]

    def list(self) -> dict[str, Any]:
        book = self._load()
        return {'active': book['active'], 'companies': [
            {'id': c.get('id'), 'name': c.get('name'), 'template': c.get('template', ''),
             'hubs': len(c.get('departments') or []),
             'interns': sum(len(d.get('interns') or []) for d in c.get('departments') or [])}
            for c in book['companies']]}

    def save_design(self, design: Any, hubs: Any) -> dict[str, Any]:
        """Change only how the open company looks (theme, weather, looks, hub styles). Safe during a goal."""
        company = self.active()
        company['design'] = clean_design(design)
        for dept in company['departments']:
            change = (hubs or {}).get(dept['id']) if isinstance(hubs, dict) else None
            if isinstance(change, dict):
                if change.get('style') in HUB_STYLES:
                    dept['style'] = change['style']
                if change.get('looks') in LOOKS or change.get('looks') == '':
                    dept['looks'] = change['looks']
                if change.get('world') in HUB_WORLDS:
                    dept['world'] = change['world']
        return self._replace(company)

    def list_full(self) -> list[dict[str, Any]]:
        """Every company in full (for export)."""
        return [self._repair(c) for c in self._load()['companies']]

    def import_companies(self, companies: list[Any]) -> int:
        """Add companies from an export. Each gets a new id (so nothing is overwritten) and a unique name."""
        book = self._load()
        names = {c.get('name') for c in book['companies']}
        added = 0
        for raw in companies[:20]:
            if not isinstance(raw, dict):
                continue
            raw = {**raw, 'id': ''}
            for d in raw.get('departments') or []:  # fresh ids for hubs and people too
                if isinstance(d, dict):
                    d['id'] = ''
                    if isinstance(d.get('manager'), dict):
                        d['manager']['id'] = ''
                    for i in d.get('interns') or []:
                        if isinstance(i, dict):
                            i['id'] = ''
            company = clean_company(raw, strict=False)
            base, n = company['name'], 2
            while company['name'] in names:
                company['name'], n = f'{base} ({n})', n + 1
            names.add(company['name'])
            book['companies'].append(company)
            added += 1
        if not added:
            raise ValueError('it has no workspaces')
        self._save(book)
        return added

    def save_agents(self, fields: dict[str, Any]) -> dict[str, Any]:
        """Company-wide agent defaults (Settings → Agents & models): model, prompt style, helpers. Goals already
        running keep what they started with."""
        company = self.active()
        if 'model' in fields:
            company['model'] = clean_model(fields['model'])
        if 'prompt_style' in fields:
            company['prompt_style'] = 'full' if fields['prompt_style'] == 'full' else 'lean'
        if 'helpers' in fields:
            company['helpers'] = clean_model(fields['helpers']) or HELPER_DEFAULT
        return self._replace(company)

    def save_active(self, company: dict[str, Any]) -> dict[str, Any]:
        """Replace the open company with an edited (already strictly cleaned) version. Its look is kept as stored
        (the Design panel owns it), so an older Company-panel draft can't undo a design change."""
        stored = self.active()
        company['design'] = stored['design']
        for key in ('model', 'prompt_style', 'helpers'):  # owned by Settings → Agents & models (save_agents)
            company[key] = stored.get(key)
        styles = {d['id']: d for d in stored['departments']}
        for dept in company['departments']:
            if dept['id'] in styles:
                for key in ('style', 'looks', 'world'):
                    dept[key] = styles[dept['id']].get(key, '')
        return self._replace(company)

    def _replace(self, company: dict[str, Any]) -> dict[str, Any]:
        book = self._load()
        company['id'] = book['active']
        book['companies'] = [company if c.get('id') == book['active'] else c for c in book['companies']]
        self._save(book)
        return company

    def create(self, template_key: str, name: str = '', built: dict[str, Any] | None = None) -> dict[str, Any]:
        """A new company from a template, or one made by the workspace builder (built, cleaned again here), opened."""
        book = self._load()
        if len(book['companies']) >= MAX_COMPANIES:
            raise ValueError(f'At most {MAX_COMPANIES} workspaces can be saved. Delete one first.')
        if built is not None:
            company = clean_company({**built, 'id': '', 'name': name.strip() or built.get('name'), 'template': 'builder',
                                     'model': '', 'prompt_style': '', 'helpers': ''})
        else:
            company = clean_company(company_from_template(template_key, name))
        book['companies'].append(company)
        book['active'] = company['id']
        self._save(book)
        return company

    def activate(self, company_id: str) -> dict[str, Any]:
        book = self._load()
        if not any(c.get('id') == company_id for c in book['companies']):
            raise ValueError('That workspace no longer exists.')
        book['active'] = company_id
        self._save(book)
        return self.active()

    def delete(self, company_id: str) -> None:
        book = self._load()
        if len(book['companies']) <= 1:
            raise ValueError('At least one workspace is required.')
        if company_id == book['active']:
            raise ValueError('Switch to another workspace before deleting this one.')
        book['companies'] = [c for c in book['companies'] if c.get('id') != company_id]
        self._save(book)
