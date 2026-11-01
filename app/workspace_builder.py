"""
The workspace builder: designs a new workspace around what the owner wants to achieve.

In the Workspaces window, ✨ Build a workspace sends the owner's aim to a small model (Haiku, one short reply, no
tools, so it costs very little). The model answers with a small team: a workspace name, a world, and 2-4 hubs, each
with a practical purpose, a manager and 1-3 mini agents with roles. The owner sees the draft and can ask for changes
in their own words (a second short reply revises it), then creates it. Nothing is saved until then, and the new
workspace can be edited like any other in the Workspace panel.

The reply is cleaned with company.clean_company(strict=False), so an over-long purpose or a repeated name is
repaired instead of failing. Models are never chosen here: every hub uses the workspace defaults
(Settings → Agents & models).
"""
from __future__ import annotations

import json
from typing import Any

from company import (COLORS, HUB_STYLES, MAX_DEPARTMENTS, MAX_INTERNS, MAX_PER_DEPARTMENT, PURPOSE_LIMIT, SPARE_NAMES,
                     THEMES, clean_company)
from prompt_builder import japanese, one_line, reply
from templates import template

MAX_HUBS = 4      # small teams: each agent is a separate process, and fewer hubs use less of the limit
MAX_PEOPLE = 3    # mini agents per hub
MAX_AIM = 2000


def example(key: str) -> str:
    """A ready-made template written the way the model should answer, so purposes come out practical."""
    t = template(key)
    hubs = [{'name': h['name'], 'purpose': h['purpose'], 'style': h.get('style', 'desks'), 'manager': h['manager'],
             'mini_agents': [{'name': n, 'role': r} for n, r in h['interns']]} for h in t['hubs']]
    return json.dumps({'name': t['name'], 'theme': t.get('theme', 'office'), 'lead': hubs[0]['name'], 'hubs': hubs},
                      ensure_ascii=False)


DESIGN = (
    'Design a small team of AI agents for an owner. The agents work on the owner\'s computer: they read and write '
    'files in a goal folder, write and run code and scripts, and search the web. They cannot use apps with a screen, '
    'send email, buy things or talk to people. The team is a workspace made of hubs; each hub has a manager, who '
    'plans its work, and mini agents, who do it. Answer with ONLY one JSON object, no other text:\n'
    '{"name": "workspace name", "theme": "...", "lead": "the hub that owns the final result", "hubs": [{"name": '
    '"hub name", "purpose": "...", "style": "...", "manager": "first name", "mini_agents": [{"name": "first name", '
    '"role": "short role"}]}]}\n'
    f'Use as few hubs as the aim needs: 1 for a simple aim, at most {MAX_HUBS}. Give each hub 1-{MAX_PEOPLE} mini '
    'agents. Fewer agents use less of the owner\'s Claude limit, so never add a hub or agent "just in case". Split '
    'hubs by kind of work (e.g. research, making, checking), so each hub has a clear job and the hubs can hand work '
    'to each other.\n'
    'A purpose says what the hub does for the owner in practical terms: what it makes, which files it reads and '
    'writes (and in which format), what it runs on the computer, and a rule for quality. 1-3 sentences, under '
    f'{PURPOSE_LIMIT} characters. Hub names under 30 characters, workspace name under 40, roles under 60. Give every '
    'person (managers too) a different first name, under 24 characters.\n'
    f'theme is one of: {", ".join(THEMES)}. style (the hub\'s furniture) is one of: {", ".join(HUB_STYLES)}.\n'
    'Two examples of the shape and tone (ready-made workspaces; yours is made for this owner\'s aim):\n'
    + example('learning') + '\n' + example('data'))

REVISE = (
    'Change a draft team of AI agents as the owner asks. Keep everything the owner did not ask to change. Answer with '
    'ONLY the whole changed workspace, as one JSON object in the same shape as the draft, no other text. The same '
    f'rules still apply: at most {MAX_HUBS} hubs, 1-{MAX_PEOPLE} mini agents each (more only if the owner asks, at '
    f'most {MAX_PER_DEPARTMENT}), practical purposes under {PURPOSE_LIMIT} characters, a different first name for '
    f'every person, theme one of {", ".join(THEMES)}, style one of {", ".join(HUB_STYLES)}.')


def to_company(raw: Any) -> tuple[dict[str, Any], str] | None:
    """The model's answer as a cleaned company document (not saved) and the id of its lead hub; None if unusable."""
    if not isinstance(raw, dict) or not isinstance(raw.get('hubs'), list):
        return None
    hubs = [h for h in raw['hubs'] if isinstance(h, dict) and one_line(h.get('name'), 60)][:MAX_DEPARTMENTS]
    if not hubs:
        return None
    people = lambda h: [p for p in (h.get('mini_agents') or h.get('interns') or []) if isinstance(p, dict)]  # noqa: E731
    doc = {
        'name': one_line(raw.get('name'), 40) or 'My workspace',
        'template': 'builder',
        'design': {'theme': raw.get('theme') if raw.get('theme') in THEMES else 'office'},
        'departments': [{
            'name': one_line(h.get('name'), 30), 'color': COLORS[i % len(COLORS)],
            'purpose': one_line(h.get('purpose'), PURPOSE_LIMIT),
            'style': h.get('style') if h.get('style') in HUB_STYLES else 'desks',
            'manager': {'name': one_line(h.get('manager') if isinstance(h.get('manager'), str) else '', 24)},
            'interns': [{'name': one_line(p.get('name'), 24), 'role': one_line(p.get('role'), 60)}
                        for p in people(h)[:MAX_PER_DEPARTMENT]] or [{'name': '', 'role': 'Generalist'}],
        } for i, h in enumerate(hubs)],
    }
    while sum(len(d['interns']) for d in doc['departments']) > MAX_INTERNS:  # the office's total: trim the largest hub
        max(doc['departments'], key=lambda d: len(d['interns']))['interns'].pop()
    company = clean_company(doc, strict=False)
    lead_name = one_line(raw.get('lead'), 30).lower()
    lead = next((d['id'] for d in company['departments'] if d['name'].lower() == lead_name),
                company['departments'][0]['id'])
    return company, lead


def as_draft(company: dict[str, Any], lead: str) -> str:
    """A saved draft in the model's own shape, for a revision."""
    hubs = [{'name': d['name'], 'purpose': d['purpose'], 'style': d['style'], 'manager': d['manager']['name'],
             'mini_agents': [{'name': p['name'], 'role': p['role']} for p in d['interns']]} for d in company['departments']]
    lead_name = next((d['name'] for d in company['departments'] if d['id'] == lead), hubs[0]['name'])
    return json.dumps({'name': company['name'], 'theme': company['design']['theme'], 'lead': lead_name, 'hubs': hubs},
                      ensure_ascii=False)


def language(text: str) -> str:
    return ('Write the names, purposes and roles in Japanese (people\'s names may be Japanese first names).\n'
            if japanese(text) else '')


async def design(aim: str) -> tuple[dict[str, Any] | None, float]:
    """({company, lead} for the owner's aim or None, its cost in dollars). Every name in the reply is unique
    and spare names are offered, so the model can avoid inventing clashes."""
    prompt = (language(aim) + f'First names to choose from (or others): {", ".join(SPARE_NAMES)}\n\n'
              f'What the owner wants to achieve:\n{aim[:MAX_AIM]}')
    raw, cost = await reply(DESIGN, prompt)
    made = to_company(raw)
    return ({'company': made[0], 'lead': made[1]} if made else None), cost


async def revise(aim: str, company: dict[str, Any], lead: str, change: str) -> tuple[dict[str, Any] | None, float]:
    """({company, lead} changed as the owner asked or None, its cost in dollars)."""
    prompt = (language(aim + change) + f'What the owner wants to achieve:\n{aim[:MAX_AIM]}\n\n'
              f'The draft:\n{as_draft(company, lead)}\n\nWhat the owner wants changed:\n{change[:1000]}')
    raw, cost = await reply(REVISE, prompt)
    made = to_company(raw)
    return ({'company': made[0], 'lead': made[1]} if made else None), cost
