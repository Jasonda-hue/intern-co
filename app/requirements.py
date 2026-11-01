"""
The goal's requirements, agreed before the team starts.

When the owner types a goal, a small model (Haiku, one short reply, no tools, so it costs very little) drafts:
  - the intent: one sentence on what the owner really wants,
  - 3-8 concrete requirements, each weighted core / important / extra (the same weights as the goal check).
The owner edits the list in the goal dialog (wording, weights, add, remove) and starts the goal with it. The managers
receive it with the goal and plan their cards to cover it, and at the end the goal checker marks exactly these
requirements (goal_check.py), so the score measures what was agreed.

A goal started without a list (the draft failed, or a goal from before this existed) is checked the old way: the
checker writes its own list at the end.
"""
from __future__ import annotations

import json
import re
from typing import Any

from api_key import require_key
from claude_agent_sdk import AssistantMessage, ClaudeAgentOptions, ClaudeSDKClient, ResultMessage, TextBlock

from goal_check import WEIGHTS

DRAFT_MODEL = 'claude-haiku-4-5'
MAX_ITEMS = 10
NOT_ALLOWED = ['Bash', 'PowerShell', 'Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Glob', 'Grep', 'WebFetch',
               'WebSearch', 'Agent', 'SendMessage', 'ListAgents', 'ToolSearch']

SYSTEM = (
    'You turn an owner\'s goal into the acceptance criteria an AI team will be judged on. Nothing has been planned '
    'or built yet. Answer with ONLY one JSON object, no other text:\n'
    '{"intent": "one plain sentence: what the owner really wants (the outcome they would be happy with)",\n'
    ' "requirements": [{"requirement": "one short, checkable sentence", "weight": "core | important | extra"}]}\n'
    'Write 3-8 requirements: what must exist, what it must contain or do, and any quality bar the goal states. Read '
    'the goal generously but literally; do not add your own wishes, and never invent numbers, lengths, formats or '
    'counts the goal does not state (write "short" if it says short). One requirement per idea. For a broad goal, use the plain meaning a '
    'reasonable owner would expect (e.g. "a web app" means it opens and its main features work).\n'
    'Weights: core = the thing itself the owner asked for, without which the result is useless to them (e.g. the '
    'playable game when a game was asked for; usually 1-2 requirements); important = clearly asked for or clearly '
    'expected; extra = helpful supporting material the owner did not ask for directly (use rarely).\n'
    'Each requirement must be checkable by opening the delivered files. Keep each under 20 words. Write in the same '
    'language as the goal.')


def clean(raw: Any) -> dict[str, Any] | None:
    """An agreed list, checked and trimmed: {intent, requirements: [{requirement, weight}]}; None if empty."""
    if not isinstance(raw, dict):
        return None
    reqs = []
    for r in raw.get('requirements') or []:
        if not isinstance(r, dict):
            continue
        text = ' '.join(str(r.get('requirement') or '').split())[:300]
        if text:
            reqs.append({'requirement': text, 'weight': r.get('weight') if r.get('weight') in WEIGHTS else 'important'})
    if not reqs:
        return None
    return {'intent': ' '.join(str(raw.get('intent') or '').split())[:400], 'requirements': reqs[:MAX_ITEMS]}


def parse(text: str) -> dict[str, Any] | None:
    m = re.search(r'\{.*\}', text, re.S)
    if not m:
        return None
    try:
        return clean(json.loads(m.group(0)))
    except json.JSONDecodeError:
        return None


def brief(agreed: dict[str, Any] | None) -> str:
    """The list as the managers receive it with the goal."""
    if not agreed:
        return ''
    lines = '\n'.join(f'  {i}. [{r["weight"]}] {r["requirement"]}' for i, r in enumerate(agreed['requirements'], 1))
    return ((f'What the owner wants: {agreed["intent"]}\n' if agreed.get('intent') else '')
            + 'Requirements agreed with the owner (the result is judged on exactly these; core first, extra last):\n'
            + lines + '\nMake sure the cards together deliver every core and important requirement.')


async def draft(goal: str) -> tuple[dict[str, Any] | None, float]:
    """(the drafted list or None, its cost in dollars)."""
    japanese = bool(re.search(r'[぀-ヿ一-鿿]', goal))  # the model doesn't reliably notice by itself
    prompt = ('Write the intent and every requirement in Japanese.\n' if japanese else '') + f'The owner\'s goal:\n{goal[:3000]}'
    options = ClaudeAgentOptions(model=DRAFT_MODEL, system_prompt=SYSTEM, max_turns=1, tools=[],
                                 disallowed_tools=NOT_ALLOWED, setting_sources=[], env={'ENABLE_TOOL_SEARCH': 'false'})
    text, cost = '', 0.0
    require_key()
    async with ClaudeSDKClient(options=options) as client:
        await client.query(prompt)
        async for msg in client.receive_response():
            if isinstance(msg, ResultMessage):
                cost = msg.total_cost_usd or 0.0
            elif isinstance(msg, AssistantMessage):
                text += ''.join(b.text for b in msg.content if isinstance(b, TextBlock))
    return parse(text), cost
