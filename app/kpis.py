"""
Results for the office (the Results window).

goals_report: one scorecard per goal, with the goal checker's verdict (how close the work got to what you
asked, goal_check.py) and why goals fell short; the share of goals achieved / partly / not achieved.

compute: team and card details, from task cards (store.tasks) and goals (store.office_goals).
Definitions (a "card" is one task card an intern was given):
    success rate      passed cards / all cards
    first-time right  cards passed on the first attempt / passed cards
    rework            average extra attempts per card (0 = never sent back)
    checks met        "done when" checks the interns reported met / all checks
    cost per card     average work of the intern on a passed card (API-equivalent cost; the office shows it as
                      ≈ % of the 5-hour plan window, see OfficeEngine.pct_per_usd)
    time per card     average time from assignment to the final hand-in, for passed cards
    goals completed   goals the lead manager finished / all goals
    owner rating      goals you rated a success / goals you rated
Everything is also broken down by hub, by intern and by model.

teams: the Teams tab: each hub's and each person's performance across the goals, from three angles:
    contribution   the share of the goal checker's credit that came from their work. Each met requirement earns its
                   weight (core 3, important 2, extra 1; partly = half), split between the people who made the
                   files it was seen in: files they wrote or edited (the transcript), or their task card's
                   deliverable. Credit whose files can't be traced to anyone is shown as "untraced".
    reliability    passed cards / cards handed in at least once; first-try = passed without rework. Cards a stopped
                   goal cut off are "interrupted", cards that never began are "not started"; neither counts against.
    usage          the average usage per passed card, and the time per card
People and hubs are counted per company and hub, so the same name in two companies stays two people.
"""
from __future__ import annotations

import json
import re
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

from company import MODELS
from goal_check import OUTCOMES, ROOT, WEIGHTS, outcome, stopped_early

WRITES = ('Write', 'Edit', 'MultiEdit', 'NotebookEdit')
PATHLIKE = re.compile(r'[\w\-./\\]+\.[A-Za-z0-9]{1,6}\b|[\w\-./\\]+/')  # file paths and folders/ in the evidence


def _rate(part: float, whole: float) -> float | None:
    return round(part / whole, 4) if whole else None


def _avg(values: list[float]) -> float | None:
    values = [v for v in values if v is not None]
    return round(sum(values) / len(values), 4) if values else None


def card_stats(rows: list[dict[str, Any]]) -> dict[str, Any]:
    passed = [r for r in rows if r['status'] == 'passed']
    met = sum(r['checks_met'] or 0 for r in rows if r['checks_met'] is not None)
    total = sum(r['checks_total'] or 0 for r in rows if r['checks_met'] is not None)
    return {
        'cards': len(rows),
        'passed': len(passed),
        'success_rate': _rate(len(passed), len(rows)),
        'first_time_right': _rate(sum(1 for r in passed if r['attempts'] == 1), len(passed)),
        'rework': _avg([r['attempts'] - 1 for r in rows]),
        'checks_met': _rate(met, total),
        'cost_per_card': _avg([r['cost'] for r in passed]),
        'time_per_card': _avg([r['seconds'] for r in passed]),
        'total_cost': round(sum(r['cost'] for r in rows), 4),
    }


def breakdown(rows: list[dict[str, Any]], key: str) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        groups[r[key] or ''].append(r)
    out = []
    for name, items in groups.items():
        label = (MODELS.get(name, name) or 'Claude Code default') if key == 'model' else name or '(unknown)'
        out.append({'name': label, **card_stats(items)})
    return sorted(out, key=lambda x: (-x['cards'], x['name']))


def goals_report(store: Any, companies: list[str], days: int = 0) -> dict[str, Any]:
    """Goal scorecards (newest first) with the goal checker's verdicts, and the success / failure rates.
    A goal counts as achieved when its check scores ≥ 80%, partly 40-79%, not achieved < 40% (goal_check.py)."""
    since = time.time() - days * 86400 if days else 0.0
    wanted = set(companies)
    goals = [g for g in store.office_goals('', since) if g['company'] in wanted]
    checks = store.checks([g['id'] for g in goals])
    cards = {}
    for r in store.tasks('', since):
        if r['company'] in wanted:
            c = cards.setdefault(r['mission_id'], {'total': 0, 'passed': 0})
            c['total'] += 1
            c['passed'] += r['status'] == 'passed'
    cards_rows = []
    for g in reversed(goals):
        check = checks.get(g['id'])
        early = stopped_early(check)
        if early:  # older checks of such goals said "not achieved, 0%": show them as stopped early
            check = {**check, 'score': None, 'verdict': 'stopped_early',
                     'summary': 'Stopped before anything was delivered, so it is not scored.', 'missing': []}
        cards_rows.append({
            'id': g['id'], 'goal': g['goal'], 'status': g['status'], 'summary': g['summary'], 'workspace': g['workspace'],
            'document': g.get('document') or '', 'saved_to': g.get('saved_to') or '',
            'started_at': g['started_at'], 'ended_at': g['ended_at'], 'seconds': g['duration_s'], 'cost': g['cost'],
            'rating': g['rating'], 'cards': cards.get(g['id'], {'total': 0, 'passed': 0}),
            'outcome': (check or {}).get('outcome') or outcome(g, store.events(g['id'])) if g['status'] != 'running' else '',
            'check': check, 'early': early})
    finished = [g for g in cards_rows if g['status'] != 'running' and not g['early']]
    checked = [g for g in finished if g['check'] and g['check'].get('score') is not None]
    count = lambda v: sum(1 for g in checked if g['check']['verdict'] == v)  # noqa: E731
    short = [g for g in finished if not (g['check'] and g['check'].get('verdict') == 'achieved')]
    reasons: dict[str, int] = defaultdict(int)
    for g in short:
        reasons[g['outcome']] += 1
    return {
        'goals': cards_rows,
        'summary': {
            'finished': len(finished), 'checked': len(checked),
            'stopped_early': sum(1 for g in cards_rows if g['early']),
            'achieved': count('achieved'), 'partly': count('partly'), 'not_achieved': count('not_achieved'),
            'success_rate': _rate(count('achieved'), len(checked)),
            'failure_rate': _rate(count('not_achieved'), len(checked)),
            'average_score': _avg([g['check']['score'] / 100 for g in checked]),
            'reasons': dict(sorted(reasons.items(), key=lambda kv: -kv[1])),
        },
        'outcomes': OUTCOMES,
    }


def compute(store: Any, companies: list[str] | str = '', days: int = 0) -> dict[str, Any]:
    """KPIs over the given companies (a list of ids, one id, or '' for every company)."""
    since = time.time() - days * 86400 if days else 0.0
    wanted = None if companies == '' else {companies} if isinstance(companies, str) else set(companies)
    rows = [r for r in store.tasks('', since) if wanted is None or r['company'] in wanted]
    goals = [g for g in store.office_goals('', since) if wanted is None or g['company'] in wanted]
    rated = [g for g in goals if g['rating']]
    finished = [g for g in goals if g['status'] != 'running']
    return {
        'days': days,
        'overall': card_stats(rows),
        'goals': {
            'goals': len(goals),
            'completed': sum(1 for g in goals if g['status'] == 'complete'),
            'completion_rate': _rate(sum(1 for g in goals if g['status'] == 'complete'), len(finished)),
            'rated': len(rated),
            'owner_success': _rate(sum(1 for g in rated if g['rating'] == 'success'), len(rated)),
            'cost_per_goal': _avg([g['cost'] for g in finished]),
            'time_per_goal': _avg([g['duration_s'] for g in finished]),
        },
        'by_hub': breakdown(rows, 'hub'),
        'by_intern': breakdown(rows, 'intern'),
        'by_model': breakdown(rows, 'model'),
    }


# ── the Teams tab ─────────────────────────────────────────────────────────────
def _rel(path: str, root: Path) -> str | None:
    """A path as the lower-case POSIX path relative to the goal folder (None if outside it)."""
    path = path.strip().strip('`"\'').rstrip('.,;:)')
    if not path:
        return None
    p = Path(path.replace('\\', '/'))
    if p.is_absolute():
        try:
            p = p.resolve().relative_to(root)
        except (ValueError, OSError):
            return None
    out = p.as_posix().lstrip('./').lower()
    return out.rstrip('/') or None


def makers(events: list[dict[str, Any]], cards: list[dict[str, Any]], root: Path) -> dict[str, set[str]]:
    """Who made each file or folder of a goal: relative path → names (writes and edits, and card deliverables)."""
    made: dict[str, set[str]] = defaultdict(set)
    for e in events:
        if e['kind'] != 'tool_use' or e['data'].get('tool') not in WRITES or not e['agent']:
            continue
        try:
            inp = json.loads(e['data'].get('input') or '{}')
        except ValueError:
            continue
        rel = _rel(str(inp.get('file_path') or inp.get('notebook_path') or ''), root)
        if rel:
            made[rel].add(e['agent'])
    for c in cards:
        who = c.get('name') or ''
        paths = list(c.get('files') or [])  # what the card handed in, else the paths named in its deliverable
        for text in [str(c.get('deliverable') or '')]:
            paths += [m for m in re.findall(r'[A-Za-z]:\\[^\s:,;]+', text)] + PATHLIKE.findall(re.sub(r'[A-Za-z]:\\[^\s:,;]+', ' ', text))
        for p in paths if who else []:
            rel = _rel(str(p), root)
            if rel and '*' not in rel and (root / rel).exists():  # only what was really made (Windows: any case)
                made[rel].add(who)
    return made


def reads(events: list[dict[str, Any]], root: Path) -> dict[str, set[str]]:
    """The goal-folder files each person opened: name → relative paths."""
    out: dict[str, set[str]] = defaultdict(set)
    for e in events:
        if e['kind'] != 'tool_use' or e['data'].get('tool') != 'Read' or not e['agent']:
            continue
        try:
            rel = _rel(str(json.loads(e['data'].get('input') or '{}').get('file_path') or ''), root)
        except ValueError:
            continue
        if rel:
            out[e['agent']].add(rel)
    return out


def upstream(path: str, makers_: set[str], made: dict[str, set[str]], opened: dict[str, set[str]]) -> set[str]:
    """People whose files in the same folder the makers read while making `path` (parts assembled into a whole)."""
    folder = path.rsplit('/', 1)[0] + '/' if '/' in path else ''
    out: set[str] = set()
    for m in makers_:
        for r in opened.get(m, ()):
            if r != path and r in made and (r.startswith(folder) if folder else '/' not in r):
                out |= made[r] - makers_
    return out


def owners(path: str, made: dict[str, set[str]], names: dict[str, list[str]]) -> set[str]:
    """The people behind one file the checker cited: an exact path, a folder containing it, or a unique file name."""
    if path in made:
        return made[path]
    for known, who in made.items():  # a deliverable folder that holds the file, or a file inside a cited folder
        if path.startswith(known + '/') or known.startswith(path + '/'):
            return who
    base = path.rsplit('/', 1)[-1]
    if len(names.get(base, [])) == 1:
        return made[names[base][0]]
    return set()


def credit(check: dict[str, Any], made: dict[str, set[str]], root: Path,
           opened: dict[str, set[str]] | None = None) -> tuple[dict[str, float], float, float]:
    """(points per person, untraced points, total points earned) for one goal check. A file assembled from other
    people's files in its folder shares half of its credit with them."""
    names: dict[str, list[str]] = defaultdict(list)
    for known in made:
        names[known.rsplit('/', 1)[-1]].append(known)
    per: dict[str, float] = defaultdict(float)
    untraced = earned = 0.0
    for r in check.get('requirements') or []:
        part = {'met': 1.0, 'partly': 0.5}.get(r.get('status'), 0.0)
        if not part:
            continue
        points = part * WEIGHTS.get(r.get('weight'), WEIGHTS['important'])
        earned += points
        cited = [rel for rel in (_rel(str(f), root) for f in r.get('files') or PATHLIKE.findall(r.get('evidence') or '')) if rel]
        shares = [(rel, owners(rel, made, names)) for rel in cited]
        shares = [(rel, who) for rel, who in shares if who]
        if not shares:
            untraced += points
            continue
        for rel, who in shares:  # each traced file gets an equal part of the requirement's points
            part_points = points / len(shares)
            helpers = upstream(rel, who, made, opened or {})
            mine = part_points / 2 if helpers else part_points
            for name in who:
                per[name] += mine / len(who)
            for name in helpers:
                per[name] += (part_points - mine) / len(helpers)
    return per, untraced, earned


def _reliability(rows: list[dict[str, Any]]) -> dict[str, Any]:
    passed = [r for r in rows if r['status'] == 'passed']
    handed = [r for r in rows if r['status'] in ('passed', 'rework') or (r['attempts'] or 1) > 1]
    return {
        'cards': len(rows), 'passed': len(passed), 'handed_in': len(handed),
        'interrupted': sum(1 for r in rows if r['status'] in ('assigned', 'rework') and r not in handed),
        'not_started': sum(1 for r in rows if r['status'] == 'waiting'),
        'reliability': _rate(len(passed), len(handed)),
        'first_try': _rate(sum(1 for r in passed if r['attempts'] == 1), len(passed)),
        'cost_per_card': _avg([r['cost'] for r in passed]),
        'time_per_card': _avg([r['seconds'] for r in passed]),
        'total_cost': round(sum(r['cost'] or 0 for r in rows), 4),
    }


def teams(store: Any, companies: list[dict[str, Any]], days: int = 0) -> dict[str, Any]:
    """Hub and person scorecards across the goals of the given companies (full company records)."""
    since = time.time() - days * 86400 if days else 0.0
    by_id = {c['id']: c for c in companies}
    goals = [g for g in store.office_goals('', since) if g['company'] in by_id and g['status'] != 'running']
    checks = store.checks([g['id'] for g in goals])
    rows = [r for r in store.tasks('', since) if r['company'] in by_id]
    rows_of: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        rows_of[r['mission_id']].append(r)
    hubs: dict[tuple[str, str], dict[str, Any]] = {}
    people: dict[tuple[str, str, str], dict[str, Any]] = {}

    def hub_of(company: str, hub: str) -> dict[str, Any]:
        dept = next((d for d in by_id[company].get('departments') or [] if d['name'] == hub), {})
        return hubs.setdefault((company, hub), {'company': company, 'company_name': by_id[company].get('name', ''),
                                                'hub': hub, 'color': dept.get('color', ''), 'points': 0.0,
                                                'goals': set(), 'rows': []})

    def person_of(company: str, hub: str, name: str, role: str = '') -> dict[str, Any]:
        hub_of(company, hub)
        p = people.setdefault((company, hub, name), {'name': name, 'role': role, 'points': 0.0, 'goals': set(), 'rows': []})
        p['role'] = p['role'] or role
        return p

    untraced = earned = 0.0
    for g in goals:
        company = by_id[g['company']]
        where: dict[str, tuple[str, str]] = {}  # this goal's people → (hub, role)
        for d in company.get('departments') or []:
            if d.get('manager', {}).get('name'):
                where[d['manager']['name']] = (d['name'], 'Manager')
            for i in d.get('interns') or []:
                where[i['name']] = (d['name'], i.get('role') or 'Mini agent')
        for r in rows_of[g['id']]:  # who actually held a card in this goal wins over today's company
            where[r['intern']] = (r['hub'] or where.get(r['intern'], ('', ''))[0], where.get(r['intern'], ('', 'Mini agent'))[1])
            p = person_of(g['company'], where[r['intern']][0], r['intern'], where[r['intern']][1])
            p['rows'].append(r)
            p['goals'].add(g['id'])
            hub_of(g['company'], where[r['intern']][0])['rows'].append(r)
            hub_of(g['company'], where[r['intern']][0])['goals'].add(g['id'])
        check = checks.get(g['id'])
        if not check or stopped_early(check) or not check.get('requirements') or not g.get('workspace'):
            continue
        root = (ROOT / g['workspace']).resolve()
        state = (store.mission(g['id']) or {}).get('state') or {}
        events = store.events(g['id'])
        per, lost, total = credit(check, makers(events, state.get('cards') or [], root), root, reads(events, root))
        untraced += lost
        earned += total
        for name, points in per.items():
            hub, role = where.get(name, ('', ''))
            p = person_of(g['company'], hub, name, role)
            p['points'] += points
            p['goals'].add(g['id'])
            hub_of(g['company'], hub)['points'] += points
            hub_of(g['company'], hub)['goals'].add(g['id'])

    def card(x: dict[str, Any]) -> dict[str, Any]:
        stats = _reliability(x['rows'])
        return {'points': round(x['points'], 2), 'contribution': _rate(x['points'], earned), 'goals': len(x['goals']),
                'started': bool(stats['handed_in'] or stats['interrupted'] or x['points']), **stats}

    out = []
    for (company, hub), h in hubs.items():
        members = [{'name': p['name'], 'role': p['role'], **card(p)}
                   for (c, hb, _), p in people.items() if (c, hb) == (company, hub)]
        out.append({'company': h['company_name'], 'company_id': company, 'hub': h['hub'] or '(not in a hub)',
                    'color': h['color'], **card(h),
                    'people': sorted(members, key=lambda m: (-m['points'], -m['passed'], m['name']))})
    out.sort(key=lambda h: (-h['points'], -h['passed'], not h['started'], h['hub']))
    return {'hubs': out, 'earned': round(earned, 2), 'untraced': _rate(untraced, earned),
            'goals_scored': sum(1 for g in goals if checks.get(g['id']) and checks[g['id']].get('requirements')),
            'companies': len({h['company_id'] for h in out})}
