"""
The goal checker: how close did the work get to the goal?

When a goal ends (finished, stopped, or the team went quiet), an independent, read-only Claude agent that was not
on the team checks the result:
  1. it states in one sentence what the owner's prompt really wants (the intent),
  2. splits the goal into a few concrete requirements, each weighted core / important / extra
     (core = what the owner can't do without, e.g. the playable game when a game was asked for),
  3. opens the files the team made (it cannot change anything),
  4. marks each requirement met / partly / missing, with evidence and the files it saw,
  5. says in one sentence what was actually delivered.
When the owner agreed the requirements before the start (requirements.py), steps 1-2 are skipped: the checker
marks exactly that list, and its wording and weights are kept as agreed (agreed_marks).
The goal score is computed here from those marks, so scores are consistent:
    points: met = 1, partly = ½, missing = 0   ·   weights: core 3, important 2, extra 1
    a core requirement missing caps the score at 39% (not achieved); a core one only partly met caps it at 79%
    achieved ≥ 80%   ·   partly achieved 40–79%   ·   not achieved < 40%
Checks made before weights existed have none: every requirement counts as important, which is the same
equal-weight score they had.
If nothing was delivered and the goal was stopped (manually, or by closing the app), it is "stopped early": no
score, and it isn't counted in the success rates. Nothing delivered for any other reason (crashes, the team went
quiet, a usage limit) scores 0%. Neither runs the checker (no usage).

Why a goal fell short ("outcome") is decided without the checker, from what happened: finished by the team,
stopped manually, stopped at a usage limit, agents crashed, the team went quiet, or the app was closed.
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any

from api_key import require_key
from claude_agent_sdk import (AssistantMessage, ClaudeAgentOptions, ClaudeSDKClient, PermissionResultAllow,
                              PermissionResultDeny, ResultMessage, ToolUseBlock, create_sdk_mcp_server, tool)

from paths import DATA

ROOT = DATA  # goals' folders are kept relative to it ('workspaces/goal-…')
CHECK_MODEL = 'claude-haiku-4-5'
READ_ONLY = ['Read', 'Glob', 'Grep']
NOT_ALLOWED = ['SendMessage', 'ListAgents', 'Agent', 'ToolSearch', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit',
               'Bash', 'PowerShell', 'WebFetch', 'WebSearch']
MAX_TURNS = 30
VERDICTS = [(80, 'achieved'), (40, 'partly'), (0, 'not_achieved')]
WEIGHTS = {'core': 3, 'important': 2, 'extra': 1}
EARLY = ('stopped', 'app_closed')  # stopped with nothing delivered: "stopped early", not scored
OUTCOMES = {
    'completed': 'Finished by the team',
    'stopped': 'Stopped manually',
    'usage_limit': 'Stopped at a usage limit',
    'agent_errors': 'Agents crashed',
    'went_quiet': 'The team stopped before finishing',
    'app_closed': 'The app was closed during the goal',
}

SYSTEM = (
    'You are an independent reviewer. You did not do this work and you do not work for the team. Your job: judge how '
    'well the delivered work achieves the owner\'s goal, strictly and fairly, only by what you can see in the files. '
    'Do not trust what the team says it did without checking.\n'
    'Steps:\n'
    '1. Write the INTENT: one plain sentence on what the owner really wants from their prompt (the outcome they '
    'would be happy with), read generously but literally.\n'
    '2. Split the OWNER\'S GOAL into 3-8 concrete requirements the owner would check: what must exist, what it must '
    'contain or do, and any quality bar the goal states. Base them on the goal, not on the team\'s plan (their file '
    'names and steps are only context), and do not add your own wishes. For a broad goal, use the plain meaning a '
    'reasonable owner would expect (e.g. "a web app" means it opens and its main features work).\n'
    '   Weight each one: core = the thing itself the owner asked for, without which the result is useless to them '
    '(e.g. the playable game when a game was asked for; usually 1-2 requirements); important = clearly asked for or '
    'clearly expected; extra = supporting material (notes, specs, reports) the owner did not ask for directly.\n'
    '3. Inspect the files with Glob, Grep and Read. Read only what you need; for long files, read the relevant parts.\n'
    '4. Mark each requirement met (fully done), partly (started or incomplete) or missing (not there), with short '
    'evidence (which file and what you saw) and the list of files, relative to the team\'s folder, that you saw '
    'delivering it (empty when missing).\n'
    '5. Write DELIVERED: one plain sentence on what the owner actually got.\n'
    '6. Call mcp__check__submit_check exactly once with your verdict, then stop. You cannot change anything.\n'
    'Shared files the owner gave the team (if listed) are inputs and live outside the team\'s folder, so they are '
    'never in it. Judge a requirement to access, read or use such a file by the record of what the team opened and '
    'by whether the deliverables actually use its content (you may open the shared file to compare).')


def outcome(goal: dict[str, Any], events: list[dict[str, Any]]) -> str:
    """Why the goal ended the way it did (a key of OUTCOMES), from its status and what happened."""
    status, summary = goal.get('status', ''), (goal.get('summary') or '').lower()
    if status == 'complete':
        return 'completed'
    if status == 'interrupted' or status == 'running':
        return 'app_closed'
    if status == 'aborted':
        return 'usage_limit' if 'limit' in summary or 'budget' in summary else 'stopped'
    if any(e['kind'] == 'error' for e in events):
        return 'agent_errors'
    return 'went_quiet'


def verdict(score: float | None) -> str:
    if score is None:
        return 'unchecked'
    return next(v for floor, v in VERDICTS if score >= floor)


def score_of(requirements: list[dict[str, Any]]) -> int:
    """Weighted score (see the module notes). Requirements without a weight count as important."""
    if not requirements:
        return 0
    points = {'met': 1.0, 'partly': 0.5}
    weight = lambda r: WEIGHTS.get(r.get('weight'), WEIGHTS['important'])  # noqa: E731
    score = round(100 * sum(weight(r) * points.get(r.get('status'), 0.0) for r in requirements)
                  / sum(weight(r) for r in requirements))
    core = [r.get('status') for r in requirements if r.get('weight') == 'core']
    if 'missing' in core:
        return min(score, 39)
    if 'partly' in core:
        return min(score, 79)
    return score


def stopped_early(check: dict[str, Any] | None) -> bool:
    """A goal stopped before anything was delivered (also recognises checks saved before this flag existed)."""
    return bool(check) and (check.get('verdict') == 'stopped_early'
                            or (bool(check.get('auto')) and check.get('outcome') in EARLY))


def agreed_marks(agreed: dict[str, Any], marked: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The agreed requirements with the checker's marks: matched by wording, else by position. The wording and
    weights always stay as agreed, and one the checker skipped counts as missing."""
    key = lambda s: ' '.join(str(s).lower().split())  # noqa: E731
    by_text = {key(m['requirement']): j for j, m in enumerate(marked)}
    texts = [by_text.get(key(r['requirement'])) for r in agreed['requirements']]
    out = []
    for i, r in enumerate(agreed['requirements']):
        j = texts[i] if texts[i] is not None else (i if i < len(marked) and i not in texts else None)
        m = marked[j] if j is not None else None
        out.append({'requirement': r['requirement'], 'weight': r['weight'],
                    'status': m['status'] if m else 'missing',
                    'evidence': m['evidence'] if m else 'Not checked.', 'files': m['files'] if m else []})
    return out


def cards_of(goal: dict[str, Any], events: list[dict[str, Any]], state: dict[str, Any]) -> list[dict[str, Any]]:
    """The goal's task cards: saved in full at the end (newer goals), else rebuilt from the transcript."""
    if state.get('cards'):
        return state['cards']
    cards = []
    for e in events:
        if e['kind'] == 'plan_approved':
            for t in e['data'].get('tasks', []):
                cards.append({'name': t.get('worker', ''), 'title': (t.get('task') or '').splitlines()[0][:120],
                              'text': t.get('task', ''), 'status': '?'})
    return cards


def shared_reads(events: list[dict[str, Any]], folder: Path) -> dict[str, dict[str, str]]:
    """Which shared files the team opened: file name → {person: 'whole' | 'parts'} (from the transcript)."""
    try:
        root = folder.resolve()
    except OSError:
        return {}
    opened: dict[str, dict[str, str]] = {}
    for e in events:
        data = e['data']
        if e['kind'] != 'tool_use' or data.get('tool') != 'Read':
            continue
        try:
            inp = json.loads(data.get('input') or '{}')
            path = Path(str(inp.get('file_path') or '')).resolve()
        except (ValueError, OSError):
            continue
        if not path.is_relative_to(root):
            continue
        whole = not (inp.get('limit') or inp.get('pages'))
        who = opened.setdefault(path.name, {})
        if who.get(e['agent']) != 'whole':
            who[e['agent']] = 'whole' if whole else 'parts'
    return opened


def file_list(folder: Path, limit: int = 120) -> list[tuple[str, int]]:
    if not folder.is_dir():
        return []
    files = [(p.relative_to(folder).as_posix(), p.stat().st_size) for p in folder.rglob('*') if p.is_file()]
    return sorted(files)[:limit]


class GoalChecker:
    def __init__(self, store: Any, model: str | None = None, library: Any = None) -> None:
        self.store = store
        self.model = model or CHECK_MODEL
        self.library = library  # the owner's shared files (library.py), so inputs aren't mistaken for missing work

    def context(self, mission_id: int) -> dict[str, Any]:
        goal = self.store.mission(mission_id)
        if goal is None:
            raise ValueError('No such goal.')
        events = self.store.events(mission_id)
        workspace = (ROOT / goal['workspace']) if goal.get('workspace') else None
        shared, opened = [], {}
        if self.library and goal.get('company'):
            folder = self.library.folder(goal['company'])
            shared = [{'name': f['name'], 'path': str(folder / f['read_as']), 'size': f['read_size'],
                       'read_as': f['read_as']} for f in self.library.list(goal['company'])]
            opened = shared_reads(events, folder)
        agreed = next((e['data'].get('agreed') for e in events if e['kind'] == 'mission_start'), None)
        return {'goal': goal, 'events': events, 'outcome': outcome(goal, events), 'agreed': agreed or None,
                'cards': cards_of(goal, events, goal.get('state') or {}),
                'workspace': workspace, 'files': file_list(workspace) if workspace else [],
                'shared': shared, 'opened': opened}

    def prompt(self, ctx: dict[str, Any]) -> str:
        goal = ctx['goal']
        lines = [f'The owner\'s goal:\n{goal["goal"]}\n']
        if ctx.get('agreed'):  # agreed with the owner before the start: mark exactly these, don't write your own
            agreed = ctx['agreed']
            lines.append('The owner agreed these requirements before the team started. Use exactly this list, in this '
                         'order, with these weights: do not add, drop, merge or reword any. Use the given intent as your '
                         'INTENT. Under missing, list only what is still needed for these requirements and real defects '
                         'in the delivered files; never list files or steps from the team\'s own plan.\n'
                         + (f'Intent: {agreed.get("intent", "")}\n' if agreed.get('intent') else '')
                         + '\n'.join(f'  {i}. [{r["weight"]}] {r["requirement"]}'
                                     for i, r in enumerate(agreed['requirements'], 1)) + '\n')
        lines += [
                 f'How it ended: {OUTCOMES[ctx["outcome"]]}.' + (f' Team summary: {goal["summary"]}' if goal.get('summary') else ''),
                 f'\nThe team\'s folder: {ctx["workspace"]}']
        if ctx['files']:
            lines.append('Files in it:\n' + '\n'.join(f'  - {name} ({size} bytes)' for name, size in ctx['files']))
        if ctx.get('shared'):
            lines.append('\nShared files the owner gave the team (inputs, outside the team\'s folder):')
            for f in ctx['shared']:
                who = {**ctx['opened'].get(f['name'], {}), **ctx['opened'].get(f['read_as'], {})}
                seen = ', '.join(f'{p} ({how})' for p, how in sorted(who.items())) or 'nobody'
                lines.append(f'  - {f["name"]}: {f["path"]} ({f["size"]} bytes). Opened by: {seen}')
        if ctx['cards']:
            lines.append('\nThe task cards the team worked on (their own claims, to be checked):')
            for c in ctx['cards']:
                if c.get('text'):
                    lines.append(f'  - [{c.get("name", "")}] {c["text"][:600]}')
                else:
                    lines.append(f'  - {c.get("id", "")} "{c.get("title", "")}" by {c.get("name", "")}: {c.get("status", "")}'
                                 + (f'; deliver: {c["deliverable"]}' if c.get('deliverable') else '')
                                 + (f'; their summary: {c["summary"]}' if c.get('summary') else ''))
        lines.append('\nCheck the work against the goal, then call mcp__check__submit_check.')
        if re.search(r'[぀-ヿ一-鿿]', goal['goal']):  # the model doesn't reliably notice by itself
            lines.insert(0, 'Write every sentence of your verdict (intent, requirements, evidence, delivered, summary, '
                            'missing, next step) in Japanese.\n')
        return '\n'.join(lines)

    async def check(self, mission_id: int) -> dict[str, Any]:
        ctx = self.context(mission_id)
        base = {'outcome': ctx['outcome'], 'checked_at': time.time(), 'model': self.model, 'cost': 0.0}
        if not ctx['files']:  # nothing was delivered: no need to spend usage on a check
            if ctx['outcome'] in EARLY:
                return {**base, 'score': None, 'verdict': 'stopped_early', 'requirements': [], 'missing': [],
                        'summary': 'Stopped before anything was delivered, so it is not scored.', 'next_step': '', 'auto': True}
            return {**base, 'score': 0, 'verdict': 'not_achieved', 'requirements': [], 'missing': [ctx['goal']['goal'][:200]],
                    'summary': f'Nothing was delivered ({OUTCOMES[ctx["outcome"]].lower()}).', 'next_step': '', 'auto': True}
        verdict_box: dict[str, Any] = {}

        @tool('submit_check', 'Submit your verdict on how well the work achieves the goal. Call once.', {
            'type': 'object',
            'properties': {
                'intent': {'type': 'string', 'description': 'One sentence: what the owner really wants from the prompt.'},
                'requirements': {'type': 'array', 'items': {
                    'type': 'object', 'required': ['requirement', 'weight', 'status', 'evidence'],
                    'properties': {'requirement': {'type': 'string'},
                                   'weight': {'type': 'string', 'enum': ['core', 'important', 'extra']},
                                   'status': {'type': 'string', 'enum': ['met', 'partly', 'missing']},
                                   'evidence': {'type': 'string', 'description': 'File and what you saw (short).'},
                                   'files': {'type': 'array', 'items': {'type': 'string'},
                                             'description': "Files (relative to the team's folder) that deliver it."}}}},
                'delivered': {'type': 'string', 'description': 'One sentence: what the owner actually got.'},
                'summary': {'type': 'string', 'description': 'Two sentences: how close the work is to the goal.'},
                'missing': {'type': 'array', 'items': {'type': 'string'}, 'description': 'What is still missing or wrong.'},
                'next_step': {'type': 'string', 'description': 'The single most useful next step to reach the goal.'},
            },
            'required': ['intent', 'requirements', 'delivered', 'summary', 'missing']})
        async def submit_check(args: dict[str, Any]) -> dict[str, Any]:
            verdict_box.update(args)
            return {'content': [{'type': 'text', 'text': 'Verdict recorded. Stop now.'}]}

        async def read_only(name: str, inp: dict[str, Any], _ctx: Any):
            if name in READ_ONLY:
                return PermissionResultAllow(updated_input=inp)
            return PermissionResultDeny(message='The checker can only read.')

        options = ClaudeAgentOptions(
            model=self.model, cwd=str(ctx['workspace']), system_prompt=SYSTEM, max_turns=MAX_TURNS,
            tools=READ_ONLY, disallowed_tools=NOT_ALLOWED, setting_sources=[], env={'ENABLE_TOOL_SEARCH': 'false'},
            mcp_servers={'check': create_sdk_mcp_server(name='check', tools=[submit_check])},
            allowed_tools=['mcp__check__submit_check'], can_use_tool=read_only, max_buffer_size=64 * 1024 * 1024)
        cost = 0.0
        require_key()
        async with ClaudeSDKClient(options=options) as client:
            await client.query(self.prompt(ctx))
            async for msg in client.receive_response():
                if isinstance(msg, ResultMessage):
                    cost = msg.total_cost_usd or 0.0
                elif isinstance(msg, AssistantMessage):
                    for block in msg.content:
                        if isinstance(block, ToolUseBlock) and block.name == 'mcp__check__submit_check' and not verdict_box:
                            verdict_box.update(block.input)
        base['cost'] = cost
        if not verdict_box:
            return {**base, 'score': None, 'verdict': 'unchecked', 'requirements': [], 'missing': [],
                    'summary': 'The checker could not finish its check. Try again.', 'next_step': '', 'error': True}
        reqs = [{'requirement': str(r.get('requirement', ''))[:300],
                 'weight': r.get('weight') if r.get('weight') in WEIGHTS else 'important',
                 'status': r.get('status') if r.get('status') in ('met', 'partly', 'missing') else 'missing',
                 'evidence': str(r.get('evidence', ''))[:400],
                 'files': [str(f)[:200] for f in r.get('files') or [] if isinstance(f, str)][:10]}
                for r in verdict_box.get('requirements') or [] if isinstance(r, dict)][:12]
        intent = str(verdict_box.get('intent', ''))[:400]
        missing = [str(m)[:300] for m in verdict_box.get('missing') or []][:10]
        if ctx.get('agreed'):
            reqs, intent = agreed_marks(ctx['agreed'], reqs), ctx['agreed'].get('intent') or intent
            # only what was agreed: the checker tends to list files from the team's own plan here
            missing = [r['requirement'] for r in reqs if r['status'] != 'met']
        score = score_of(reqs)
        return {**base, 'score': score, 'verdict': verdict(score), 'requirements': reqs, 'weighted': True,
                **({'agreed': True} if ctx.get('agreed') else {}),
                'intent': intent, 'delivered': str(verdict_box.get('delivered', ''))[:400],
                'summary': str(verdict_box.get('summary', ''))[:800],
                'missing': missing,
                'next_step': str(verdict_box.get('next_step', ''))[:400]}


def brief(check: dict[str, Any] | None) -> dict[str, Any] | None:
    """The part of a check the inbox and scorecards show at a glance."""
    if not check:
        return None
    return {k: check.get(k) for k in ('score', 'verdict', 'summary', 'missing', 'next_step', 'outcome', 'error',
                                      'intent', 'delivered', 'agreed')}
