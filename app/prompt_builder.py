"""
The prompt builder: turns a short goal into a clear one before the team sees it.

In the goal dialog, ✨ Improve with questions sends the goal to a small model (Haiku, one short reply, no tools, so it
costs very little), which asks 3-5 questions about what the goal leaves open (scope, look and feel, must-have features,
platform, what "done" means), each with a few suggested answers. The owner picks or types answers (or skips a
question), and a second short reply rewrites the goal with them into one clear brief for the managers. The rewritten
goal replaces the text in the dialog, where it can still be edited or undone; the requirements are then drafted from it
as usual (requirements.py).
"""
from __future__ import annotations

import json
import re
from typing import Any

from api_key import require_key
from claude_agent_sdk import AssistantMessage, ClaudeAgentOptions, ClaudeSDKClient, ResultMessage, TextBlock

from requirements import DRAFT_MODEL, NOT_ALLOWED

MAX_QUESTIONS = 5
MAX_OPTIONS = 4
MAX_GOAL = 2500  # requirements.draft reads the first 3000 characters

ASK = (
    'An owner is about to give a goal to an AI team that will build or write it on its own, without asking anything '
    'later. Find what the goal leaves open that would most change the result, and ask about it. Answer with ONLY one '
    'JSON object, no other text:\n'
    '{"questions": [{"question": "one short question", "options": ["short answer", "short answer"]}]}\n'
    'Ask 3-5 questions, the most important first. Good topics: scope and size, look and feel, the must-have features, '
    'platform or format (e.g. runs in the browser, a Python script, a PDF), the audience, and what "done" looks like. '
    'Do not ask what the goal already answers, and do not ask about budget, deadlines or who does the work. Give each '
    'question 2-4 concrete answers to pick from, the most likely first; keep each under 8 words. Keep each question '
    'under 15 words. Write in the same language as the goal.')

REWRITE = (
    'Rewrite an owner\'s goal for an AI team, using the owner\'s answers to a few questions about it. The team works '
    'on its own from this text alone. Answer with ONLY one JSON object, no other text:\n'
    '{"goal": "the rewritten goal"}\n'
    'Write it as the owner asking, in one short paragraph of 2-5 full, grammatical sentences that flow into each '
    'other (joined with words like "and", "so", "with", "which", "when"), so a person can read it easily: first what '
    'to make, then what it must have or do and how it should look or feel, and last what counts as done. Never a '
    'list, bullet points or one fragment per line. Keep everything the original goal asks for (every quality word, '
    'such as "flashy" or "simple"), and say each point once. Use only what the goal and the answers say: do not add '
    'features, numbers, technologies or formats the owner did not give, and leave out skipped questions. Keep the '
    'owner\'s own wording where it is clear. Plain text, under 150 words. Write in the same language as the goal.')


def japanese(text: str) -> bool:  # the model doesn't reliably notice by itself
    return bool(re.search(r'[぀-ヿ一-鿿]', text))


def one_line(value: Any, limit: int) -> str:
    return ' '.join(str(value or '').split())[:limit]


def clean_questions(raw: Any) -> dict[str, Any] | None:
    """{questions: [{question, options: [str]}]}, checked and trimmed; None if empty."""
    if not isinstance(raw, dict):
        return None
    questions = []
    for q in raw.get('questions') or []:
        if not isinstance(q, dict) or not one_line(q.get('question'), 200):
            continue
        options = [one_line(o, 80) for o in (q.get('options') or []) if isinstance(o, str) and o.strip()]
        questions.append({'question': one_line(q.get('question'), 200), 'options': options[:MAX_OPTIONS]})
    return {'questions': questions[:MAX_QUESTIONS]} if questions else None


def parse(text: str) -> Any:
    m = re.search(r'\{.*\}', text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


async def reply(system: str, prompt: str) -> tuple[Any, float]:
    """(the model's JSON answer or None, its cost in dollars)."""
    options = ClaudeAgentOptions(model=DRAFT_MODEL, system_prompt=system, max_turns=1, tools=[],
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


async def questions(goal: str) -> tuple[dict[str, Any] | None, float]:
    """(the questions to ask about the goal or None, their cost in dollars)."""
    prompt = ('Write every question and answer in Japanese.\n' if japanese(goal) else '') + f'The owner\'s goal:\n{goal[:3000]}'
    raw, cost = await reply(ASK, prompt)
    return clean_questions(raw), cost


async def rewrite(goal: str, answers: list[dict[str, Any]]) -> tuple[str | None, float]:
    """(the goal rewritten with the owner's answers or None, its cost in dollars). answers: [{question, answer}];
    an empty answer means the owner skipped that question."""
    lines = '\n'.join(f'- {one_line(a.get("question"), 200)}: {one_line(a.get("answer"), 300) or "(skipped)"}'
                      for a in answers[:MAX_QUESTIONS] if isinstance(a, dict))
    prompt = (('Write the goal in Japanese.\n' if japanese(goal) else '')
              + f'The owner\'s goal:\n{goal[:3000]}\n\nThe owner\'s answers:\n{lines or "(none)"}')
    raw, cost = await reply(REWRITE, prompt)
    text = str(raw.get('goal') or '').strip() if isinstance(raw, dict) else ''
    text = re.sub(r'\n{3,}', '\n\n', text)[:MAX_GOAL].strip()
    return text or None, cost
