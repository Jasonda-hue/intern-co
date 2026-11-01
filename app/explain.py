"""
Plain-language explanations of the commands agents ask to run, for the owner's Inbox.

An intern's command that needs approval is often a long script. Before the owner decides, a small model (Haiku,
one short reply, no tools, so it costs very little) independently explains it: what it does in one sentence, why
it is needed for the intern's task, what it touches (reads, changes, deletes, installs, the internet…), how risky
it is, and whether to allow it. The explainer did not write the command and cannot run anything.

Settings → Safety & commands → "Explain commands in plain words" turns it off (then only the command is shown).
The explanation's usage counts toward the goal's usage, like the agents' own work.
"""
from __future__ import annotations

import json
import re
from typing import Any

from api_key import require_key
from claude_agent_sdk import AssistantMessage, ClaudeAgentOptions, ClaudeSDKClient, ResultMessage, TextBlock

EXPLAIN_MODEL = 'claude-haiku-4-5'
MAX_COMMAND = 6000
EFFECTS = ('reads', 'changes_goal_files', 'changes_other_files', 'deletes', 'installs', 'internet', 'runs_program')
NOT_ALLOWED = ['Bash', 'PowerShell', 'Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Glob', 'Grep', 'WebFetch',
               'WebSearch', 'Agent', 'SendMessage', 'ListAgents', 'ToolSearch']

SYSTEM = (
    'You explain commands to a non-technical owner who must decide whether an AI mini agent may run them on their '
    'computer. You did not write the command and do not trust it. Read it carefully, including any script inside it.\n'
    'Answer with ONLY one JSON object, no other text:\n'
    '{"summary": "one plain sentence: what the command does, in everyday words (no code, no flags)",\n'
    ' "why": "one plain sentence: why this helps the mini agent\'s task",\n'
    f' "effects": [any of {", ".join(EFFECTS)}],\n'
    ' "risk": "low | medium | high",\n'
    ' "risk_reason": "one short sentence",\n'
    ' "recommend": "allow | deny",\n'
    ' "recommend_reason": "one short sentence"}\n'
    'Effects: reads = only reads or lists files or prints information; changes_goal_files = creates or changes files '
    'inside the goal folder; changes_other_files = creates or changes files anywhere else; deletes = deletes or '
    'overwrites files; installs = installs or updates software or packages; internet = downloads or sends data; '
    'runs_program = runs a script or program (say in the summary what it does).\n'
    'Risk: low = reads, or changes only files in the goal folder for the task; medium = runs code whose effect is '
    'hard to see, installs packages, or uses the internet; high = deletes or changes files outside the goal folder, '
    'changes system settings, sends personal data, or anything that does not fit the task. Recommend deny for high '
    'risk or anything unrelated to the task.\n'
    'Write the sentences in the same language as the owner\'s goal. Keep each sentence under 25 words.')


def parse(text: str) -> dict[str, Any] | None:
    """The explainer's JSON, checked and trimmed (None if it isn't usable)."""
    m = re.search(r'\{.*\}', text, re.S)
    if not m:
        return None
    try:
        raw = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    if not isinstance(raw, dict) or not str(raw.get('summary', '')).strip():
        return None
    short = lambda k: str(raw.get(k) or '').strip()[:300]  # noqa: E731
    return {'summary': short('summary'), 'why': short('why'),
            'effects': [e for e in raw.get('effects') or [] if e in EFFECTS] if isinstance(raw.get('effects'), list) else [],
            'risk': raw.get('risk') if raw.get('risk') in ('low', 'medium', 'high') else 'medium',
            'risk_reason': short('risk_reason'),
            'recommend': 'deny' if raw.get('recommend') == 'deny' else 'allow',
            'recommend_reason': short('recommend_reason')}


async def explain_command(command: str, *, tool: str, description: str, who: str, task: str, goal: str,
                          folder: str) -> tuple[dict[str, Any] | None, float]:
    """(the explanation or None, its cost in dollars)."""
    japanese = bool(re.search(r'[぀-ヿ一-鿿]', goal))  # the model doesn't reliably notice by itself
    prompt = (('Write every sentence of your answer in Japanese.\n' if japanese else '') +
              f'The owner\'s goal: {goal[:600]}\n'
              f'The mini agent: {who}. Their current task: {task[:600] or "(not given)"}\n'
              f'The goal folder: {folder}\n'
              f'Shell: {tool}. The mini agent\'s own note on the command: {description[:300] or "(none)"}\n'
              f'The command:\n```\n{command[:MAX_COMMAND]}\n```'
              + ('\n(The command was cut here; it is longer.)' if len(command) > MAX_COMMAND else ''))
    options = ClaudeAgentOptions(model=EXPLAIN_MODEL, system_prompt=SYSTEM, max_turns=1, tools=[],
                                 disallowed_tools=NOT_ALLOWED, setting_sources=[], cwd=folder,
                                 env={'ENABLE_TOOL_SEARCH': 'false'})
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
