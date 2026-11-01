"""
The office's real agents: hub managers and interns as Claude Agent SDK sessions.
(In the data a hub is still called a "department".)

Chain of command (the owner's design):
    Owner ──goal──▶ one or more hubs' managers (one leads) ──plans──▶ Owner approves ──▶ interns get task cards
    Interns talk only to their own manager and teammates; only managers talk across hubs.
    A manager asked for help by another hub plans that work too, and the owner approves it.
    Each hub's written purpose is part of its people's instructions.
Several goals can run at once (GoalRun, coordinated by OfficeEngine), each with its own folder and budget;
a hub works on one goal at a time.

What needs the owner: every plan, and shell commands other than reading and testing inside the goal's folder
(safe_command). File edits inside the folder don't; edits anywhere else are refused. Everything else an agent
can't do is refused by default.

Only people with work run as real agents, and at most performance.agents_at_once sessions are open at once (each
is a separate `claude` process): an agent waits for a free slot, and closes its session after performance.idle_close
seconds without mail, resuming the same session (by id) when it is messaged again.

The browser polls state() for live status, inbox items and a stream of events (messages, plan
hand-offs, reports) that the office animates.
"""
from __future__ import annotations

import asyncio
import importlib.util
import json
import os
import re
import shutil
import sys
import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from api_key import have_key, require_key
from claude_agent_sdk import (AgentDefinition, AssistantMessage, CLINotFoundError, ClaudeAgentOptions, HookMatcher, ClaudeSDKClient, PermissionResultAllow,
                              PermissionResultDeny, RateLimitEvent, ResultMessage, SystemMessage, TextBlock,
                              ToolPermissionContext, ToolResultBlock, ToolUseBlock, UserMessage, create_sdk_mcp_server, tool)

from company import model_for
import documents
from explain import explain_command
from goal_check import GoalChecker, brief
from library import Library
from memory import Notebooks
import requirements
import settings as app_settings
from paths import DATA
from store import Store

WORKSPACES = DATA / 'workspaces'


def _start_claude_hidden() -> None:
    """On Windows, start every `claude` process without a console window. When the app runs without a terminal
    (the desktop shortcut uses pythonw), Windows would otherwise open a new console window for each agent and each
    command it runs. The SDK starts claude with anyio.open_process, so that is where the flag goes; the commands an
    agent runs share claude's invisible console and stay hidden too."""
    if os.name != 'nt':
        return
    import subprocess

    import anyio
    if getattr(anyio.open_process, 'hidden_window', False):
        return
    original = anyio.open_process

    async def open_process(*args: Any, **kwargs: Any) -> Any:
        kwargs['creationflags'] = kwargs.get('creationflags', 0) | subprocess.CREATE_NO_WINDOW
        return await original(*args, **kwargs)

    open_process.hidden_window = True  # type: ignore[attr-defined]
    anyio.open_process = open_process


_start_claude_hidden()
QUIET_END = 6.0         # everyone idle this long (nothing pending) ends the goal
CALIBRATE_MIN_PCT = 2.0  # % of the 5-hour window observed before "% per unit of work" is trusted
USAGE_FRESH = 300.0      # seconds a usage reading counts as fresh (no new check needed)
SHOW_ENDED = 90.0       # seconds an ended goal stays in the office view
PACE_DEFAULT = {'S': 60.0, 'M': 150.0, 'L': 360.0}  # seconds per card until there is history (see progress())
REVIEW_SECONDS = 25.0   # a manager's review, added to each card's estimate
CARD_COST_DEFAULT = {'S': 0.03, 'M': 0.08, 'L': 0.20}  # API-equivalent work per card until there is history
REVIEW_SHARE = 0.2      # a manager's review adds about this share to a card's usage
# Why a goal cannot start when this computer has no working Claude sign-in (see OfficeEngine.claude).
NOT_CONNECTED = {
    'signed_out': 'No working Anthropic API key was found on this computer, so the agents cannot work. Set '
                  'ANTHROPIC_API_KEY (MANUAL.md, section 1), restart the app and start the goal again.',
    'missing': 'Claude Code was not found on this computer, so the agents cannot work. Install it (MANUAL.md, '
               'section 1), restart the app and start the goal again.'}
PEER_TOOLS = ['SendMessage', 'ListAgents', 'Agent', 'ToolSearch']  # reach other Claude sessions on this machine
NO_TOOL_SEARCH = {'ENABLE_TOOL_SEARCH': 'false'}
# On a Mac (and Linux) agents' commands run in bash, the shell the command rules below are written for; a Mac's
# own default, zsh, has more ways to run code. Claude Code falls back to its own choice if this is not a shell.
AGENT_ENV = ({**NO_TOOL_SEARCH, 'CLAUDE_CODE_SHELL': '/bin/bash'} if os.name != 'nt' and Path('/bin/bash').exists()
             else NO_TOOL_SEARCH)
READ_TOOLS = ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch']
WRITE_TOOLS = {'Edit', 'Write', 'MultiEdit', 'NotebookEdit'}
SHELL_TOOLS = {'Bash', 'PowerShell'}
FREE_TOOLS = {'Read', 'Glob', 'Grep', 'LS', 'WebFetch', 'WebSearch', 'TodoWrite'}
# one shell is enough, and each tool's definition costs tokens on every turn: PowerShell on Windows, Bash elsewhere
INTERN_TOOLS = READ_TOOLS + ['Edit', 'Write', 'PowerShell' if os.name == 'nt' else 'Bash']
MANAGER_TOOLS = READ_TOOLS

# Commands that run without asking the owner: reading and testing inside the goal's folder. Every part of the
# command must be on the allow list, nothing may write, delete, install, download or start other programs, and
# every path must stay inside the folder. Anything else (or anything this check can't read) still asks.
SAFE_READ = {'get-childitem', 'gci', 'ls', 'dir', 'get-content', 'gc', 'cat', 'type', 'select-string', 'sls',
             'measure-object', 'measure', 'test-path', 'get-item', 'gi', 'resolve-path', 'rvpa', 'write-output', 'echo',
             'get-location', 'pwd', 'select-object', 'select', 'sort-object', 'sort', 'where-object', 'where', '?',
             'format-table', 'ft', 'format-list', 'fl', 'out-string', 'convertfrom-json', 'get-filehash', 'head', 'tail',
             'wc', 'grep', 'find', 'tree'}
SAFE_RUN = {'python', 'python3', 'py', 'pytest', 'node'}  # running a script or test that is inside the folder
SAFE_MODULES = {'pytest', 'unittest', 'py_compile', 'json.tool', 'doctest'}
UNSAFE = re.compile(r'(?i)(>|\binvoke-|\biex\b|\bstart-|\bremove-|\bset-|\bnew-|\bmove-|\bcopy-|\brename-|\bclear-|'
                    r'\bout-file|\badd-content|(?<![\w.])(rm|del|erase|rd|rmdir|mv|cp|ren|mkdir|md|curl|wget|iwr|irm|pip|npm|'
                    r'npx|git|winget|choco|reg|sc|shutdown|taskkill|format-volume|stop-|restart-)\b|-exec\b|-delete\b|'
                    r'\$\(|`|\.\.[\\/]|-encodedcommand|\bdownload|'
                    r'<\(|<<|-execdir\b|-ok(dir)?\b|-fprint|-fls\b|'  # bash: sub-shells, inline input, find's writers
                    r'\.\w+\s*\(|::|\$(?!_\b|_\.))')  # no method or .NET calls; no variables but the pipeline's $_


# Commands refused outright, even with the owner's OK: stopping or killing processes (an intern once stopped every
# Python process, which took down the office server itself), shutting down, and starting background programs.
BLOCKED = re.compile(r'(?i)\b(stop-process|spps|kill|taskkill|pkill|killall|stop-computer|restart-computer|shutdown|'
                     r'logoff|stop-service|restart-service|wmic|start-job|start-process|'
                     r'launchctl|osascript|nohup|disown|setsid|sudo|reboot|halt|poweroff)\b|&\s*$')  # macOS / Linux
# In bash (Mac, Linux) a single & anywhere starts a background program, and `open` starts an app, like Start-Process.
BACKGROUND = re.compile(r'(?<![&>|])&(?![&>])')
OPENERS = {'open', 'xdg-open'}
QUOTED = re.compile(r'"[^"]*"|\'[^\']*\'')
WINDOWS = os.name == 'nt'


def command_parts(command: str) -> list[list[str]]:
    """The words of each command in a pipeline or chain, e.g. 'ls | grep x' gives [['ls'], ['grep', 'x']]."""
    parts = [re.findall(r'"[^"]*"|\'[^\']*\'|\S+', part.strip()) for part in re.split(r'\|\||&&|[|;\n]', command)]
    return [words for words in parts if words]


def blocked(command: str, windows: bool = WINDOWS) -> bool:
    """True for a command that is always refused (see BLOCKED). `windows` is a parameter so both shells can be tested."""
    if BLOCKED.search(command):
        return True
    # an & or ; inside quotes (a web address, a sentence) starts nothing
    flat = QUOTED.sub(lambda m: re.sub(r'[;|&\n]', ' ', m.group()), command)
    return not windows and bool(BACKGROUND.search(flat)
                                or any(words[0].strip('"\'').lower() in OPENERS for words in command_parts(flat)))


def inside(path: str, root: Path) -> bool:
    """True if `path` (absolute, or relative to `root`) stays inside `root`."""
    if path.startswith('~'):
        return False
    try:
        return (root / path).resolve().is_relative_to(root)
    except (OSError, ValueError):
        return False


def safe_command(command: str, workspace: Path, windows: bool = WINDOWS) -> bool:
    """True if a shell command only reads or tests things inside `workspace` (see SAFE_READ / SAFE_RUN)."""
    if not command.strip() or UNSAFE.search(command) or len(command) > 400 or blocked(command, windows):
        return False
    if not windows and '(' in QUOTED.sub('', command):
        return False  # bash and zsh run code inside (...): sub-shells, and zsh's =(...) and *(e:...:) patterns
    root = workspace.resolve()
    for words in command_parts(command):
        head = words[0].strip('"\'&').lower()
        name = Path(head).name.removesuffix('.exe') if ('\\' in head or '/' in head) and head.endswith('.exe') else head
        if name not in SAFE_READ | SAFE_RUN:
            return False
        args = [w.strip('"\'') for w in words[1:]]
        if '&' in args:
            return False
        if name in SAFE_RUN:
            for a in args:  # inline code could do anything, also inside a group of flags (-Bc) or as --eval=...
                short = a[1:] if a.startswith('-') and not a.startswith('--') else ''
                if any(flag in short for flag in 'cep') or ('m' in short and a != '-m') or a.startswith(('--eval', '--print')):
                    return False
            if '-m' in args and (args.index('-m') + 1 >= len(args) or args[args.index('-m') + 1] not in SAFE_MODULES):
                return False
        for a in args:  # every path-like argument stays inside the folder
            if re.match(r'^([a-zA-Z]:|[\\/]|~|\\\\)', a):
                if not inside(a, root):
                    return False
            elif a.startswith('-'):  # a path given inside an option: --output=/x, -o/x, -Path:C:\x
                values = re.split(r'[=:]', a, maxsplit=1)[1:] + ([a[2:]] if not a.startswith('--') else [])
                if any(re.search(r'[\\/~]', v) and not inside(v, root) for v in values):
                    return False
            elif name in SAFE_RUN and a not in SAFE_MODULES:
                if not inside(a, root):
                    return False
    return True


# The command that runs Python here ('' if none): `python` on Windows; `python3` on a Mac, where plain `python`
# often exists only inside the app's own environment and an agent's shell may not see it.
PYTHON = next((cmd for cmd in (('python', 'python3') if WINDOWS else ('python3', 'python')) if shutil.which(cmd)), '')


def browser_here() -> str:
    """The browser on this computer that scripts can run without a window: 'Edge', 'Chrome' or ''. On a Mac the
    name comes with the program's path, because browsers there are not commands a script can simply call."""
    for name, cmd in [('Edge', 'msedge'), ('Chrome', 'google-chrome'), ('Chrome', 'chromium')]:
        if shutil.which(cmd):
            return name
    if os.name == 'nt':
        return 'Edge' if Path(os.environ.get('ProgramFiles(x86)', ''), 'Microsoft/Edge/Application/msedge.exe').exists() else ''
    if sys.platform == 'darwin':
        for name, program in [('Chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
                              ('Edge', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge')]:
            if Path(program).exists():
                return f'{name}, at "{program}"'
    return ''


def tools_here() -> str:
    """Which common programs this computer has, so interns don't try ones that aren't installed."""
    browser = browser_here()
    found = {'Python' if PYTHON != 'python3' else 'Python (the command is python3)': bool(PYTHON),
             'Node.js': bool(shutil.which('node')), 'git': bool(shutil.which('git')),
             f'a web browser ({browser})' if browser else 'a web browser (Edge or Chrome)': bool(browser)}
    has = [k for k, v in found.items() if v]
    lacks = [k for k, v in found.items() if not v]
    libraries = [name for name, module in (('matplotlib', 'matplotlib'), ('numpy', 'numpy'), ('pandas', 'pandas'),
                                           ('Pillow', 'PIL')) if not importlib.util.find_spec(module)]
    return (f'This computer has {", ".join(has) or "none of the usual tools"}' +
            (f'; it does NOT have {", ".join(lacks)}, so do not use them.' if lacks else '.') +
            (f' Python has no {", ".join(libraries)}: use the standard library (draw charts as SVG).' if libraries else ''))


TOOLS_HERE = tools_here()
# examples of commands that run without asking, in this computer's shell (see safe_command)
SAFE_EXAMPLES = (('Get-ChildItem, Get-Content, Select-String' if os.name == 'nt' else 'ls, cat, grep') +
                 f', {PYTHON or "python"} test_x.py, {PYTHON or "python"} -m pytest')


# The "lean" base prompt: a few hundred tokens of working habits instead of Claude Code's full ~20k-token
# instructions (measured: a small task costs ~63% less). The company can switch back to 'full'.
LEAN_BASE = (
    'You are a Claude agent working as a member of a small team, on a {os} computer, inside one shared project folder.\n'
    'How to work well:\n'
    '- Understand before acting: look at the relevant files first (Glob/Grep to find them, Read to read them).\n'
    '- Read a file before you edit it. Prefer small, precise edits; create new files only when needed.\n'
    '- Use absolute paths inside the shared folder. {shell_note}\n'
    '- Check your work in the cheapest reliable way (re-read the file, run the code or test once when it matters).\n'
    '- Be honest: report exactly what you did and verified. Never invent results, sources or file contents; say '
    'when something failed or is uncertain.\n'
    '- Be concise in messages and reports. Do only your assigned part; do not expand the scope.\n'
    '- Never touch anything outside the shared folder, and never run destructive or system-changing commands.\n'
)


# Helper sub-agents: an agent can hand reading-heavy work to a cheaper, read-only helper that returns a summary.
# Claude Code's own helper types are blocked (some can edit files or Claude Code's settings); helpers' tool calls
# still pass through the agent's permission gate (verified).
BUILTIN_AGENTS = ['general-purpose', 'Explore', 'Plan', 'claude', 'statusline-setup']
HELPER_TOOLS = ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch']
HELPER_PROMPT = (
    'You are a helper for a team member. Do the reading or research you are asked to (search and read files, look '
    'things up online), then reply with a short, factual summary that includes the file paths or sources you used. '
    'Never invent anything; say clearly what you could not find. You cannot edit files or run commands.')
HELPER_NOTE = (
    '\n\nYou have helpers (Agent tool, subagent_type "helper"). They run on a cheaper model, read and research for you, '
    'and return a short summary, which keeps your own work much smaller and cheaper. Rule of thumb: if your task needs '
    'reading more than three files, any long document, or web research, send that reading to helpers (you can start '
    'several at once, e.g. one per file or topic) and work from their summaries; do not also read those files '
    'yourself. Their results come back to you before you continue. Tell each helper exactly what to look '
    'for and what to report. Do the writing, editing and decisions yourself, and check a summary yourself only where '
    'a mistake would matter.')


async def helpers_in_foreground(input_data: dict[str, Any], tool_use_id: str | None, context: Any) -> dict[str, Any]:
    """PreToolUse hook on the Agent tool. Several helpers started at once otherwise run in the background, and the
    agent ends its turn before their summaries arrive (the office then sees a quiet team). Forcing foreground keeps
    the results inside the turn (verified). Anything but our own helper is refused here too, as a second guard."""
    tool_input = dict(input_data.get('tool_input') or {})
    if tool_input.get('subagent_type') != 'helper':
        return {'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'permissionDecision': 'deny',
                                       'permissionDecisionReason': 'Only subagent_type "helper" is available here.'}}
    tool_input['run_in_background'] = False
    return {'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'permissionDecision': 'allow',
                                   'updatedInput': tool_input}}


def helper_definition(model: str) -> AgentDefinition:
    # background=False: the agent waits for the helper's summary within its turn. (In the background, results
    # arrive after the agent's turn ends, and the office would see a quiet team and end the goal without them.)
    return AgentDefinition(description='A fast, low-cost, read-only helper for reading-heavy work: searching files, '
                                       'reading many of them, or looking things up online. Returns a short summary.',
                           prompt=HELPER_PROMPT, tools=HELPER_TOOLS, model=model, background=False)


def base_prompt(style: str, brief: str) -> dict[str, Any] | str:
    """System prompt for an agent: Claude Code's full preset plus the brief, or the lean base plus the brief."""
    if style == 'full':
        return {'type': 'preset', 'preset': 'claude_code', 'append': brief}
    windows = os.name == 'nt'
    return LEAN_BASE.format(os='Windows' if windows else 'Mac' if sys.platform == 'darwin' else 'Linux',
                            shell_note='Shell commands run in PowerShell.' if windows else 'Shell commands run in bash.') \
        + '\n' + brief


def clip(text: str, limit: int) -> str:
    text = ' '.join(str(text).split())
    return text if len(text) <= limit else text[:limit - 1] + '…'


# ── continuing a stopped goal: what the managers are told about the earlier attempt ──
CONTINUABLE = ('aborted', 'ended', 'interrupted')
HOW_IT_ENDED = {'aborted': 'was stopped by the owner', 'ended': 'ended when the team went quiet before finishing',
                'interrupted': 'was cut off when the app closed'}


def continue_brief(goal: dict[str, Any], cards: list[dict[str, Any]], workspace: Path, most_files: int = 60) -> str:
    """The note a continued goal starts with: how it ended, each earlier card and the files in the folder."""
    lines = [f'[Note] This goal was started before and {HOW_IT_ENDED.get(goal["status"], "did not finish")}. '
             'The owner asked to continue it: same goal, same folder; everything made so far is still there.']
    summary = ' '.join(str(goal.get('summary') or '').split())
    if summary:
        lines.append(f'How it ended: {clip(summary, 400)}')
    if cards:
        lines.append('Earlier task cards (their ids are taken; new cards continue the numbering):')
        for c in cards:
            files = ', '.join(str(f) for f in (c.get('files') or [])[:6])
            lines.append(f'  - {c.get("id")} {clip(c.get("title") or "", 80)} ({c.get("name") or "?"}): '
                         f'{c.get("status") or "?"}' + (f'. {clip(c["summary"], 240)}' if c.get('summary') else '')
                         + (f' Files: {files}' if files else ''))
    found = sorted(p for p in workspace.rglob('*') if p.is_file() and not any(
        part.startswith('.') for part in p.relative_to(workspace).parts)) if workspace.is_dir() else []
    if found:
        lines.append(f'Files in the folder now ({len(found)}):')
        lines += [f'  - {p.relative_to(workspace).as_posix()} ({max(p.stat().st_size // 1024, 1)} KB)'
                  for p in found[:most_files]]
        if len(found) > most_files:
            lines.append(f'  - … and {len(found) - most_files} more')
    else:
        lines.append('The folder is empty: nothing was made yet.')
    lines.append('Before planning, look at what exists (read the files that matter). Plan only what is left: unfinished '
                 'or failed cards, and anything missing for the goal. Do not redo work that passed unless it is broken.')
    return '\n'.join(lines)


# ── the owner's output folder: a copy of each goal's files where the owner wants them ──
def output_problem(folder: str) -> str:
    """Why `folder` can't be the output folder ('' when it can)."""
    path = Path(folder).expanduser()
    if not path.is_absolute():
        return 'Give the full path of a folder, such as C:\\Users\\you\\Documents\\Intern Co.'
    if path.resolve().is_relative_to(DATA.resolve()):
        return "Choose a folder outside the app's own data folder."
    if path.exists() and not path.is_dir():
        return 'That is a file, not a folder.'
    return ''


def result_folder_name(text: str, started: float) -> str:
    """'2026-10-25 1428 Build a flashy snake game': the goal's date and its first words, safe as a folder name."""
    title = re.sub(r'[<>:"/\\|?*\x00-\x1f]', ' ', ' '.join(text.split()[:12]))
    title = ' '.join(title.split())
    if len(title) > 60:  # cut at a word where there is one
        title = title[:60].rsplit(' ', 1)[0] if ' ' in title[30:60] else title[:60]
    title = title.rstrip(' .') or 'Goal'
    return f'{datetime.fromtimestamp(started):%Y-%m-%d %H%M} {title}'


def copy_result(workspace: Path, output: Path, name: str, again: Path | None = None) -> Path | None:
    """Copy a goal's folder (but not hidden files) into output/name, next to earlier ones; a continued goal updates
    its earlier copy (again) instead. None if the goal folder is empty."""
    if not workspace.is_dir() or not any(p for p in workspace.iterdir() if not p.name.startswith('.')):
        return None
    if again is not None and again.is_dir():
        dest = again
    else:
        output.mkdir(parents=True, exist_ok=True)
        dest, n = output / name, 2
        while dest.exists():
            dest, n = output / f'{name} ({n})', n + 1
    shutil.copytree(workspace, dest, ignore=lambda _dir, names: [x for x in names if x.startswith('.')],
                    dirs_exist_ok=True)
    return dest


# ── task cards: the prompt a manager writes for an intern ──────────────────
# An intern starts with nothing but its card (plus the shared-files list), so a card carries everything needed:
# why, what to deliver and where, how, what to use, what not to do, and objective checks. Cards can wait for
# earlier cards ("after"); a waiting card is delivered with those cards' results when they pass.
CARD_GUIDE = (
    'How to write a task card (the mini agent sees only the card, so make it complete):\n'
    '- title: a few words. goal: what to produce and what it is for, in one or two sentences.\n'
    '- context: what the mini agent must know that is not in the files: the bigger goal, decisions made, the '
    'audience, how this card fits with the others.\n'
    '- deliverable: exactly what to hand in and where, e.g. "notes/sources.md: a Markdown table of 5-8 '
    'sources (title, author, year, link, one-line relevance)". One deliverable per card; never two cards '
    'writing the same file.\n'
    '- steps: only if the approach matters (3-6 short steps). inputs: exact file paths (shared files, earlier '
    'cards\' outputs) or sources to use.\n'
    '- avoid: what is out of scope or must not change (keeps the work small).\n'
    '- done_when: 2-4 checks anyone can verify by looking: a file exists with given sections, a count, a test '
    'passes, every claim cites a source. Not "is good" or "is complete".\n'
    '- after: numbers of EARLIER cards in this plan that this card truly cannot start without (e.g. [1]); it waits '
    'until they pass, then receives their summary and files. Use it rarely: a waiting mini agent sits idle. Prefer '
    'parallel work: agree the shared details up front in each card\'s context (file names, function names, data '
    'format), so everyone starts at once. Most plans need "after" only for a final check or write-up.\n'
    '- size: S (minutes), M (one focused sitting), L (split it instead if you can).\n'
    'Fewer, well-scoped cards beat many tiny ones: each card is a separate agent session that costs money. One '
    'card per mini agent is often enough; do not create cards for work nobody needs.\n'
    'Read big files once: reading a long document is the most expensive thing an agent does. Never have several '
    'cards each read the same whole document. Give one card the job of reading it and writing a short digest '
    '(summary, a section map with page ranges, key facts and quotes) that the other cards use ("after"), or give '
    'each card only the pages or sections it needs. The office enforces this: once one agent has read a large '
    'shared file whole, everyone else can read only parts of it, so plan the digest card first.\n'
    'Never plan a job another hub already covers (see the work split and other hubs\' cards, if given).\n'
    'A document the owner will read (report, paper, summary, guide) is delivered as a PDF that a mini agent makes from '
    'Markdown with make_document, e.g. deliverable "report/report.pdf (from report/report.md)"; notes, digests and '
    'drafts stay Markdown. Its done_when asks for what makes it clear and trustworthy, where it fits: tables for '
    'numbers and comparisons, figures with captions, and every fact from a source cited [n] in a numbered reference '
    'list at the end ("参考文献" for a Japanese goal) that make_document reports as all opened. When the goal\'s result '
    'is such a document, pass it as document to finish_goal so the owner can open it.\n')

DOC_GUIDE = (
    'Documents for the owner: write Markdown, then call mcp__office__make_document on it to make the PDF, and Read '
    'the PDF (pages="1-3", then the pages with tables and figures) to check it before handing it in. Use Markdown '
    'tables for numbers and comparisons. Keep figures in a figures/ folder and include them as '
    '![Figure N: caption](figures/name.svg): draw charts and diagrams as SVG (write the SVG yourself, or with a '
    'Python script that uses only the standard library), or use pictures from the shared files (their pictures '
    'folder); say in the caption where a picture comes from. Cite where each fact comes from as [n], and end with a '
    'numbered "References" list ("参考文献" in Japanese): for a web page the author or site, title, year, URL and '
    'the date opened; for a shared file its name and page. Cite only pages you opened with WebFetch (the office '
    'lists every page opened in this goal in _sources.json in the shared folder) or files you read; never invent a '
    'source, author, year or URL.')

VAGUE_CHECK = re.compile(r'^(it |the (work|task|result|output) )?(is |looks |seems )?(good|done|complete|finished|'
                         r'correct|high[- ]quality|well[- ]written|accurate|clear|ok|fine)\b', re.I)
CONCRETE_CHECK = re.compile(r'\d|\.[a-z]{1,5}\b|["\'`]|\b(pass(es)?|exists?|lists?|contains?|includes?|cites?|'
                            r'runs?|returns?|matches|shows?|has|have|each|every|all|no|at least|under|below|'
                            r'section|table|column|heading|link|source|test|ordered|sorted|sentences?|words?|'
                            r'first|mentions?|names?|labell?ed|format(ted)?)\b', re.I)


def card_from(raw: dict[str, Any]) -> dict[str, Any] | None:
    """A task card from a manager's (or the owner's edited) plan entry; None if it lacks a goal or checks.
    A bare {'task': text} (older style) becomes a card with one general check."""
    def items(value: Any, limit: int = 8) -> list[str]:
        if isinstance(value, str):
            value = [v for v in value.splitlines()]
        return [clip(str(v), 300) for v in (value or []) if str(v).strip()][:limit]

    title = clip(str(raw.get('title') or ''), 80)
    goal = str(raw.get('goal') or raw.get('task') or '').strip()
    done_when = items(raw.get('done_when'))
    if not goal:
        return None
    if not done_when and raw.get('task'):
        done_when = ['The task is done as described, and you checked the result.']
    if not done_when:
        return None
    after = raw.get('after') or []
    if isinstance(after, (int, str)):
        after = re.findall(r'\d+', str(after))
    after = sorted({int(a) for a in (str(x).strip().lstrip('#T') for x in after) if a.isdigit()})
    return {'title': title or clip(goal, 60), 'goal': goal[:1500], 'context': str(raw.get('context') or '').strip()[:1500],
            'deliverable': str(raw.get('deliverable') or '').strip()[:400], 'steps': items(raw.get('steps'), 10),
            'inputs': items(raw.get('inputs')), 'avoid': items(raw.get('avoid'), 6), 'done_when': done_when,
            'after': after, 'size': raw.get('size') if raw.get('size') in ('S', 'M', 'L') else 'M'}


def card_hints(card: dict[str, Any]) -> list[str]:
    """Quality hints for the owner, computed for free (no model call). They never block a plan."""
    hints = []
    if len(card['goal']) < 40:
        hints.append('The goal is very short: say what to produce and what it is for.')
    if not card.get('deliverable'):
        hints.append('No deliverable: say exactly what to hand in, and where.')
    for check in card['done_when']:
        if VAGUE_CHECK.match(check.strip()) or not CONCRETE_CHECK.search(check):
            hints.append(f'Hard to verify: "{clip(check, 60)}"')
    if card['size'] == 'L':
        hints.append('A large card: smaller cards are reviewed more reliably.')
    if len(card['steps']) > 7:
        hints.append('Many steps: the mini agent may need less detail, or this is two cards.')
    return hints[:4]


def plan_hints(tasks: list[dict[str, Any]]) -> list[str]:
    hints, per_intern, outputs = [], {}, {}
    for n, t in enumerate(tasks, 1):
        per_intern[t['name']] = per_intern.get(t['name'], 0) + 1
        key = deliverable_file(t)
        if key and key in outputs:
            hints.append(f'Cards {outputs[key]} and {n} both deliver "{clip(key, 40)}": they may overwrite each other.')
        outputs.setdefault(key, n)
    waiting = sum(1 for t in tasks if t.get('after'))
    if len(tasks) > 2 and waiting >= len(tasks) / 2:
        hints.append(f'{waiting} of {len(tasks)} cards wait for other cards, so only {len(tasks) - waiting} mini agent(s) '
                     'start at first. Untick "Starts after" where the cards can run in parallel.')
    busy = [f'{name} ({count})' for name, count in per_intern.items() if count > 3]
    if busy:
        hints.append(f'Many cards for one mini agent: {", ".join(busy)}. Fewer, larger cards cost less.')
    return hints


STOPWORDS = set('a an and the of to in on for with by from as at or is are be it its this that these those each every '
                'into about their them they your our all any one two three per not no new use using write read make '
                'create find list file files md txt pdf paper manuscript goal task card cards hub team'.split())


def words(text: str) -> set[str]:
    return {w for w in re.findall(r'[a-z][a-z0-9]{2,}', text.lower()) if w not in STOPWORDS}


def deliverable_file(card: dict[str, Any]) -> str:
    """The file a card delivers, e.g. "notes/sources.md" from "C:\\…\\notes\\sources.md: a table of …" ('' if none)."""
    found = re.findall(r'[\w\-./\\]*?([\w\-]+\.[A-Za-z0-9]{1,5})\b', card.get('deliverable') or '')
    return found[0].lower() if found else ''


def same_job(a: dict[str, Any], b: dict[str, Any]) -> bool:
    """Two cards that look like the same job: the same deliverable file, or mostly the same words (free check)."""
    if deliverable_file(a) and deliverable_file(a) == deliverable_file(b):
        return True
    wa, wb = words(f'{a["title"]} {a["goal"]}'), words(f'{b["title"]} {b["goal"]}')
    return bool(wa and wb) and len(wa & wb) / min(len(wa), len(wb)) >= 0.5


BIG_FILE = 60_000   # bytes: a shared file this large is read whole only once per goal
SKIM_LINES = 150    # managers read large shared files at most this many lines at a time
PART_LINES = 400    # a read of up to this many lines counts as reading a part, not the whole file
PART_SHARE = 0.5    # after the first whole read, anyone else may read up to this share of the file in parts


def reads(t: dict[str, Any], stem: str) -> bool:
    """Whether a card works from the file named stem (it appears in its goal, context, steps or inputs)."""
    return stem in ' '.join([t['goal'], t.get('context', ''), *t.get('steps', []), *t.get('inputs', [])]).lower()


def big_file_hint(tasks: list[dict[str, Any]], big_files: list[tuple[str, int]],
                  others: list[tuple[str, dict[str, Any]]] | None = None) -> list[str]:
    """Several cards of the goal (this plan, and other hubs' cards) reading the same large shared file (free check)."""
    hints = []
    for name, size in big_files:
        stem = name.lower().removesuffix('.txt')
        here = [n for n, t in enumerate(tasks, 1) if reads(t, stem)]
        elsewhere = [f'{o["name"]} ({hub})' for hub, o in others or [] if reads(o, stem)]
        if here and len(here) + len(elsewhere) >= 3:
            where = f'card{"s" if len(here) > 1 else ""} {", ".join(map(str, here))} here' + (
                f', plus {", ".join(elsewhere)}' if elsewhere else '')
            hints.append(f'{len(here) + len(elsewhere)} cards of this goal read {stem} (~{size // 1024} KB): {where}. '
                         'One digest card that the others use would cost much less.')
    return hints


def card_text(card: dict[str, Any], handoffs: list[dict[str, Any]] | None = None) -> str:
    """A task card as the intern reads it (handoffs: the passed cards it waited for)."""
    parts = [f'Task: {card["title"]}  (size {card.get("size", "M")})', f'Goal: {card["goal"]}']
    if card.get('context'):
        parts.append(f'Context: {card["context"]}')
    if card.get('deliverable'):
        parts.append(f'Deliver: {card["deliverable"]}')
    if card.get('steps'):
        parts.append('Steps:\n' + '\n'.join(f'  {i}. {s}' for i, s in enumerate(card['steps'], 1)))
    if card.get('inputs'):
        parts.append('Use:\n' + '\n'.join(f'  - {s}' for s in card['inputs']))
    if card.get('avoid'):
        parts.append('Do not:\n' + '\n'.join(f'  - {s}' for s in card['avoid']))
    for h in handoffs or []:
        parts.append(f'Builds on {h["id"]} "{h["title"]}" by {h["name"]} (passed): {h.get("summary") or "no summary"}'
                     + (f'\n  Files: {", ".join(h["files"])}' if h.get('files') else ''))
    parts.append('Done when (every check must be met):\n' + '\n'.join(f'  - {s}' for s in card['done_when']))
    return '\n'.join(parts)


class Slots:
    """At most `size` agents hold an open Claude session at once (each is a process using memory). Unlike a
    semaphore, the size can change while goals run (Settings → Memory & performance)."""

    def __init__(self, size: int) -> None:
        self.size = size
        self.used = 0
        self._changed: asyncio.Condition | None = None

    @property
    def changed(self) -> asyncio.Condition:
        if self._changed is None:  # made on the running loop
            self._changed = asyncio.Condition()
        return self._changed

    async def __aenter__(self) -> None:
        async with self.changed:
            await self.changed.wait_for(lambda: self.used < self.size)
            self.used += 1

    async def __aexit__(self, *exc: Any) -> None:
        async with self.changed:
            self.used -= 1
            self.changed.notify_all()

    def resize(self, size: int) -> None:
        self.size = size
        try:
            asyncio.get_running_loop().create_task(self._wake())
        except RuntimeError:  # no loop yet: nobody is waiting
            pass

    async def _wake(self) -> None:
        async with self.changed:
            self.changed.notify_all()


def tool_reply(text: str) -> dict[str, Any]:
    return {'content': [{'type': 'text', 'text': text}]}


def result_text(content: Any) -> str:
    if isinstance(content, list):
        return '\n'.join(str(p.get('text', '')) if isinstance(p, dict) else str(p) for p in content)
    return '' if content is None else str(content)


@dataclass
class InboxItem:
    """Something for the owner: a plan or command to decide on, a budget stop, an update or a result."""
    id: str
    kind: str                     # plan | command | question | budget | usage | update | result
    frm: str                      # person id ('' for the system)
    title: str
    body: str = ''
    data: dict[str, Any] = field(default_factory=dict)
    future: asyncio.Future | None = field(default=None, repr=False)  # set for items that block someone
    at: float = field(default_factory=time.time)
    goal: int = 0                 # the goal (mission id) it belongs to
    user: str = ''                # the account it is for ('' = everyone, e.g. the plan-wide usage hold)

    @property
    def open(self) -> bool:
        return self.future is not None and not self.future.done()

    def public(self) -> dict[str, Any]:
        return {'id': self.id, 'kind': self.kind, 'from': self.frm, 'title': self.title, 'body': self.body,
                'data': self.data, 'waiting': self.open, 'at': self.at, 'goal': self.goal}


class Member:
    """One manager or intern with a real Claude session for the current goal."""

    def __init__(self, office: GoalRun, person: dict[str, Any], dept: dict[str, Any], kind: str) -> None:
        self.office = office
        self.id: str = person['id']
        self.name: str = person['name']
        self.role: str = person.get('role') or ('Hub manager' if kind == 'manager' else 'Mini agent')
        self.dept = dept
        self.kind = kind              # 'manager' | 'intern'
        self.mailbox: asyncio.Queue[tuple[str, str]] = asyncio.Queue()  # (sender name, text as delivered)
        self.session_id = str(uuid.uuid4())
        self.started = False          # the session exists on disk (it has received a prompt)
        self.cost = 0.0
        self._session_cost = 0.0      # SDK running total for the open process
        self.model_costs: dict[str, float] = {}       # spend per model (their own model, and their helpers')
        self._session_model_cost: dict[str, float] = {}
        self.helper_calls = 0
        self.status = 'idle'          # idle | queued | working | waiting | done | error
        self.activity = 'Waiting for work'
        self.busy = False
        self.task: asyncio.Task | None = None
        self.last_text = ''
        self.requested_by = ''  # a manager helping another department: who asked (shown on their plan)
        # the model set in the Company panel (person → hub → company); an engine-wide override (tests) wins
        self.model = office.model or model_for(office.company, dept, person, kind == 'manager')

    @property
    def manager(self) -> bool:
        return self.kind == 'manager'

    # ── who may talk to whom ──────────────────────────────────────────────
    def allowed_recipients(self) -> dict[str, dict[str, Any]]:
        """name (lower) → person, for everyone this member may message."""
        people: dict[str, dict[str, Any]] = {}
        own = self.dept
        if self.manager:
            for intern in own['interns']:
                people[intern['name'].lower()] = intern
            for other in self.office.company['departments']:
                if other['id'] != own['id']:
                    people[other['manager']['name'].lower()] = other['manager']
        else:
            people[own['manager']['name'].lower()] = own['manager']
            for intern in own['interns']:
                if intern['id'] != self.id:
                    people[intern['name'].lower()] = intern
        return people

    # ── prompts ───────────────────────────────────────────────────────────
    def system_brief(self) -> str:
        o, d = self.office, self.dept
        team = '\n'.join(f'  - {i["name"]} ({i["role"]})' for i in d['interns']) or '  (no mini agents)'
        common = (f'You work at {o.company["name"]}, a company whose staff are Claude agents. The owner is a human who '
                  f'gives goals and approves plans. All work for the current goal happens in the shared folder '
                  f'{o.workspace}. Messages you receive arrive as new turns starting with [from <name>]. '
                  'Answer people with mcp__office__message: plain text in your reply is not delivered to anyone. '
                  'Keep messages short and factual. Never invent results or claim something you did not see or '
                  'verify: pass on only what actually happened. When your part is done, end your turn; never wait, '
                  'poll or loop.\n\n') + (o.shared_files + '\n' if o.shared_files else '')
        purpose = f'Your hub\'s purpose: {d["purpose"]}\n' if d.get('purpose') else ''
        if self.manager:
            others = '\n'.join(f'  - {x["name"]} (manager {x["manager"]["name"]})'
                               + (f': {x["purpose"]}' if x.get('purpose') else '')
                               for x in o.company['departments'] if x['id'] != d['id']) or '  (none)'
            lead = (' You lead this goal: when the whole goal is done and verified by your team, call '
                    'mcp__office__finish_goal with a summary of the result and where the files are.'
                    if d['id'] == o.lead_dept_id else '')
            memory = ''
            if o.engine.setting('memory', 'enabled'):
                notes = o.engine.notebooks.prompt(o.company.get('id', ''), d['id'], o.engine.setting('memory', 'size'))
                memory = ((f'\nYour hub\'s notebook (kept between goals; newest first):\n{notes}\n' if notes else '') +
                          '5. When you learn something worth keeping for FUTURE goals (the owner\'s preferences, what '
                          'worked, a pitfall to avoid), save one short note with mcp__office__remember. Not details of '
                          'this goal, and nothing already in the notebook.\n')
            return common + (
                f'You are {self.name}, the manager of the {d["name"]} hub.\n{purpose}Your team:\n{team}\n'
                f'Other hubs (talk to them only through their manager; ask the hub whose purpose fits):\n{others}\n\n'
                'How you work:\n'
                '1. When you get a goal or a request, look at the folder and any relevant shared file only as much '
                f'as you need to plan. Skim: for a large file read its start (at most {SKIM_LINES} lines, e.g. the '
                'abstract and headings) or Grep it for headings; your mini agents do the detailed reading, and whole '
                'reads of large shared files are refused for managers. Then send task cards for your own '
                'team with mcp__office__submit_plan, matching each card to the mini agent whose role fits. Then END YOUR '
                'TURN: the owner approves or returns the plan, and approved cards are delivered for you (cards with '
                '"after" are delivered when the cards they wait for pass).\n'
                f'{CARD_GUIDE}{TOOLS_HERE} Plan with that in mind (e.g. how mini agents can test their work).\n'
                '2. Mini agents hand cards in with submit_work. Review each one with mcp__office__review_work: open the '
                'deliverable and check every done-when check yourself; pass only if all are truly met, otherwise send '
                'it back with exact, numbered fixes. Answer questions with mcp__office__message. You do not write '
                'files or run commands yourself.\n'
                '3. Only you talk to other hubs, by messaging their manager. If another manager asks your team '
                'for help, plan that work with submit_plan too, and message them the outcome when it is done.\n'
                '4. The owner is not a technical expert. Use mcp__office__report only for news they need (a finished '
                'part, a real problem), in plain words: what happened and what it means, without card numbers or '
                'jargon. When only the owner can decide something, use mcp__office__ask_owner with 2-4 clear options '
                '(mark the one you recommend), not a report. To change a plan still waiting for approval, call '
                f'submit_plan again: the new plan replaces it.{lead}\n{memory}')
        manager = d['manager']['name']
        mates = ', '.join(i['name'] for i in d['interns'] if i['id'] != self.id) or 'none'
        return common + (
            f'You are {self.name}, {self.role} in the {d["name"]} hub. {purpose}Your manager is {manager}; '
            f'your teammates are {mates}. You may message only your manager and teammates, with '
            'mcp__office__message. Do your assigned task in the shared folder. Editing files there is allowed. '
            f'Reading and testing commands inside the folder run at once (e.g. {SAFE_EXAMPLES}); '
            'any other command waits for the owner\'s approval, '
            f'so use those only when needed. {TOOLS_HERE} Never start servers or background programs, never open '
            'apps or browser windows, and never stop or kill processes: other work runs on this computer. To check a web '
            'page, read its files or run a short script that exits by itself. Your work comes as task cards: '
            'produce exactly the card\'s deliverable, use its inputs, respect its "do not" list and stay in its scope. '
            'Before handing a card in, check every "done when" check yourself. Then hand it in with '
            'mcp__office__submit_work: a short summary, each check with met true/false and how you checked it, and '
            f'the files you changed. If you are blocked, hand it in as blocked, or ask {manager}.\n{DOC_GUIDE}')

    # ── tools ─────────────────────────────────────────────────────────────
    def office_server(self):
        o, me = self.office, self

        @tool('message', 'Send a short message to someone you may talk to. It arrives as their next turn. '
                         'Returns immediately; never wait for a reply.', {'to': str, 'text': str})
        async def message(args: dict[str, Any]) -> dict[str, Any]:
            return tool_reply(o.send(me, str(args.get('to', '')), str(args.get('text', ''))))

        tools = [message]
        if not self.manager:
            @tool('submit_work', 'Hand in a task card to your manager when you finish it (or are blocked).', {
                'type': 'object',
                'properties': {
                    'card': {'type': 'string', 'description': 'The card id, e.g. T2.'},
                    'status': {'type': 'string', 'enum': ['done', 'blocked']},
                    'summary': {'type': 'string', 'description': 'What you did, in two or three sentences.'},
                    'criteria': {'type': 'array', 'description': 'Every "done when" check of the card, in order.',
                                 'items': {'type': 'object', 'required': ['met'],
                                           'properties': {'criterion': {'type': 'string'}, 'met': {'type': 'boolean'},
                                                          'evidence': {'type': 'string',
                                                                       'description': 'How you checked it.'}}}},
                    'files': {'type': 'array', 'items': {'type': 'string'}, 'description': 'Files you created or changed.'},
                },
                'required': ['card', 'status', 'summary', 'criteria']})
            async def submit_work(args: dict[str, Any]) -> dict[str, Any]:
                return tool_reply(o.submit_work(me, args))

            tools.append(submit_work)

            @tool('make_document', 'Turn a Markdown document in the shared folder into a finished PDF (and an HTML '
                                   'page) next to it, with its tables, figures and reference list. Reports missing '
                                   'pictures and web references nobody opened in this goal.', {'path': str})
            async def make_document(args: dict[str, Any]) -> dict[str, Any]:
                return tool_reply(await o.make_document(me, str(args.get('path', ''))))

            tools.append(make_document)
        if self.manager:
            names = [i['name'] for i in self.dept['interns']]

            @tool('submit_plan', 'Send the owner your plan as task cards for mini agents of YOUR team. Then end your turn.', {
                'type': 'object',
                'properties': {
                    'summary': {'type': 'string', 'description': 'One or two sentences: how your team will do it.'},
                    'tasks': {'type': 'array', 'description': 'Task cards, numbered 1, 2, 3… in this order.',
                              'items': {
                        'type': 'object', 'required': ['intern', 'title', 'goal', 'deliverable', 'done_when'],
                        'properties': {
                            'intern': {'type': 'string', 'enum': names or ['(nobody)'],
                                       'description': 'The mini agent who does this card.'},
                            'title': {'type': 'string', 'description': 'A short name for the task.'},
                            'goal': {'type': 'string', 'description': 'What to produce and what it is for.'},
                            'context': {'type': 'string', 'description': 'What the mini agent must know that is not in '
                                                                         'the files.'},
                            'deliverable': {'type': 'string', 'description': 'Exactly what to hand in and where '
                                                                             '(file path and format).'},
                            'steps': {'type': 'array', 'items': {'type': 'string'}, 'description': 'Only if the approach '
                                                                                                    'matters.'},
                            'inputs': {'type': 'array', 'items': {'type': 'string'},
                                       'description': 'Exact file paths or sources to use.'},
                            'avoid': {'type': 'array', 'items': {'type': 'string'},
                                      'description': 'Out of scope, or must not change.'},
                            'done_when': {'type': 'array', 'items': {'type': 'string'},
                                          'description': '2-4 checks anyone can verify; all must be met.'},
                            'after': {'type': 'array', 'items': {'type': 'integer'},
                                      'description': 'Numbers of earlier cards in this plan whose results this needs.'},
                            'size': {'type': 'string', 'enum': ['S', 'M', 'L'], 'description': 'Rough effort.'}}}},
                },
                'required': ['summary', 'tasks']})
            async def submit_plan(args: dict[str, Any]) -> dict[str, Any]:
                return tool_reply(o.submit_plan(me, args))

            @tool('review_work', 'Review a task card a mini agent handed in: pass it, or send it back for rework.', {
                'type': 'object',
                'properties': {'card': {'type': 'string'}, 'verdict': {'type': 'string', 'enum': ['pass', 'rework']},
                               'notes': {'type': 'string', 'description': 'For rework: exactly what to fix.'}},
                'required': ['card', 'verdict']})
            async def review_work(args: dict[str, Any]) -> dict[str, Any]:
                return tool_reply(o.review_work(me, args))

            tools.append(review_work)

            @tool('report', 'Tell the owner important news (a finished part, a real problem), in plain words. '
                            'For a decision, use ask_owner instead.', {'text': str})
            async def report(args: dict[str, Any]) -> dict[str, Any]:
                return tool_reply(o.report(me, str(args.get('text', ''))))

            @tool('ask_owner', 'Ask the owner to decide something only they can decide. Give 2-4 clear options; they '
                               'pick one or write their own answer. Then end your turn: the answer arrives as a message.', {
                'type': 'object',
                'properties': {
                    'question': {'type': 'string', 'description': 'The decision, as one short plain question.'},
                    'why': {'type': 'string', 'description': '1-2 plain sentences of background: what happened and '
                                                             'why it needs the owner. No card numbers or jargon.'},
                    'options': {'type': 'array', 'minItems': 2, 'maxItems': 4, 'items': {
                        'type': 'object', 'required': ['label', 'description'],
                        'properties': {'label': {'type': 'string', 'description': 'A few words.'},
                                       'description': {'type': 'string', 'description': 'What happens if chosen.'}}}},
                    'recommended': {'type': 'integer', 'description': 'Number (1-4) of the option you recommend.'}},
                'required': ['question', 'options']})
            async def ask_owner(args: dict[str, Any]) -> dict[str, Any]:
                return tool_reply(o.ask_question(me, args))

            tools += [submit_plan, report, ask_owner]
            if o.engine.setting('memory', 'enabled'):
                @tool('remember', "Save one short note in your hub's notebook, for future goals.", {'note': str})
                async def remember(args: dict[str, Any]) -> dict[str, Any]:
                    try:
                        o.engine.notebooks.add(o.company.get('id', ''), me.dept['id'], str(args.get('note', '')), me.name)
                    except ValueError as e:
                        return tool_reply(f'ERROR: {e}')
                    o.record(me, 'remember', note=str(args.get('note', ''))[:300])
                    return tool_reply('Saved in your hub\'s notebook.')

                tools.append(remember)
            if self.dept['id'] == o.lead_dept_id:
                @tool('finish_goal', 'Declare the whole goal done, with a summary of the result and where it is.', {
                    'type': 'object',
                    'properties': {'summary': {'type': 'string'},
                                   'document': {'type': 'string', 'description': 'When the result is a document the '
                                                'owner reads: its Markdown or PDF file, which the owner can then open '
                                                'from the result. Leave empty otherwise.'}},
                    'required': ['summary']})
                async def finish_goal(args: dict[str, Any]) -> dict[str, Any]:
                    note = await o.main_document(me, str(args.get('document') or '').strip())
                    return tool_reply(note + o.finish(me, str(args.get('summary', ''))))

                tools.append(finish_goal)
                if o.split is None:  # a goal shared by several hubs: the lead divides it first
                    @tool('split_work', 'Divide this goal between its hubs: one non-overlapping part per hub (yours '
                                        'included), with the files each delivers. Call once, before planning.', {
                        'type': 'object',
                        'properties': {'parts': {'type': 'array', 'items': {
                            'type': 'object', 'required': ['hub', 'part'],
                            'properties': {'hub': {'type': 'string', 'enum': [o.dept_of(h)['name'] for h in o.hubs]},  # type: ignore[index]
                                           'part': {'type': 'string', 'description': 'What this hub does, in 1-3 sentences.'},
                                           'deliverables': {'type': 'array', 'items': {'type': 'string'},
                                                            'description': 'Files this hub hands in (paths).'},
                                           'after': {'type': 'array', 'items': {'type': 'string'},
                                                     'description': 'Hubs whose results this part needs first (their '
                                                                    'cards must pass before this hub\'s cards start). '
                                                                    'Leave empty to work in parallel.'}}}}},
                        'required': ['parts']})
                    async def split_work(args: dict[str, Any]) -> dict[str, Any]:
                        return tool_reply(o.split_work(me, args))

                    tools.append(split_work)
        return create_sdk_mcp_server(name='office', tools=tools), [f'mcp__office__{t.name}' for t in tools]

    @property
    def helper_cost(self) -> float:
        """What this agent's helpers cost (only separable when helpers run on a different model)."""
        helper = self.helper_model
        if not helper or helper == self.model:
            return 0.0
        return sum(cost for model, cost in self.model_costs.items() if model.startswith(helper))

    def describe(self, name: str, inp: dict[str, Any]) -> str:
        if name == 'Agent':
            return f'Asking a helper: {clip(str(inp.get("description") or "a reading task"), 50)}'
        if name.startswith('mcp__office__'):
            short = name.removeprefix('mcp__office__')
            if short == 'message':
                return f'Messaging {inp.get("to", "?")}'
            if short in ('submit_work', 'review_work'):
                return f'{"Handing in" if short == "submit_work" else "Reviewing"} card {inp.get("card", "")}'
            return {'submit_plan': 'Submitting the plan for approval', 'report': 'Writing an update',
                    'ask_owner': 'Asking the owner a question',
                    'finish_goal': 'Wrapping up the goal', 'split_work': 'Splitting the work between hubs',
                    'make_document': 'Making the document (PDF)',
                    'remember': 'Saving a note to the hub notebook'}.get(short, short)
        for key in ('file_path', 'notebook_path', 'path', 'pattern', 'command', 'query', 'url'):
            if inp.get(key):
                value = str(inp[key])
                if key in ('file_path', 'notebook_path', 'path'):
                    value = self.office.short_path(value)
                verb = {'Read': 'Reading', 'Write': 'Writing', 'Edit': 'Editing', 'Glob': 'Looking for', 'Grep': 'Searching',
                        'Bash': 'Running', 'PowerShell': 'Running', 'WebFetch': 'Opening', 'WebSearch': 'Searching the web for'}
                return f'{verb.get(name, name)} {clip(value, 60)}'
        return name

    # ── permission gate ───────────────────────────────────────────────────
    async def can_use(self, name: str, inp: dict[str, Any], ctx: ToolPermissionContext):
        o = self.office
        await o.checkpoint()  # a paused goal (budget) holds here
        if name == 'Read':  # a whole PDF is large and costly; shared PDFs have a text copy next to them
            target = str(inp.get('file_path') or '')
            text_copy = Path(target + '.txt')
            if target.lower().endswith('.pdf') and not inp.get('pages') and text_copy.is_file():
                return PermissionResultDeny(message=f'Read the text copy instead: {text_copy} (page by page, much '
                                                    'cheaper). Open the PDF only for a specific figure, with pages="N".')
            refusal = o.big_read(self, inp)
            if refusal:
                o.record(self, 'blocked', tool=name, path=str(inp.get('file_path') or ''), reason='read_once')
                return PermissionResultDeny(message=refusal)
        if name in ('WebFetch', 'WebSearch'):
            o.note_source(self, name, inp)
        if name in FREE_TOOLS:
            return PermissionResultAllow(updated_input=inp)
        if name in WRITE_TOOLS:
            target = inp.get('file_path') or inp.get('notebook_path') or ''
            if self.manager:
                return PermissionResultDeny(message='Managers do not edit files. Ask one of your mini agents.')
            if target and o.inside_workspace(target):
                o.record(self, 'edit', tool=name, path=o.short_path(target))
                return PermissionResultAllow(updated_input=inp)
            o.record(self, 'blocked', tool=name, path=target)
            return PermissionResultDeny(message=f'Only files inside {o.workspace} may be changed.')
        if name in SHELL_TOOLS:
            if self.manager:
                return PermissionResultDeny(message='Managers do not run commands. Ask one of your mini agents.')
            command = str(inp.get('command', ''))
            if blocked(command):
                o.record(self, 'blocked', tool=name, command=command)
                return PermissionResultDeny(message='Not allowed in the office: stopping processes, starting background '
                                                    'programs or servers, and shutting down. Check your work another way, '
                                                    'e.g. read the file or run a short script that exits.')
            if o.engine.setting('safety', 'auto_safe') and safe_command(command, o.workspace):  # read/test in the folder
                o.record(self, 'auto_command', command=command)
                self.activity = f'Running {clip(command, 60)}'
                return PermissionResultAllow(updated_input=inp)
            self.status, self.activity = 'waiting', f'Awaiting approval to run: {clip(command, 60)}'
            description = str(inp.get('description', ''))
            data: dict[str, Any] = {'description': description, 'tool': name, 'explain': None,
                                    'explaining': bool(o.engine.setting('safety', 'explain'))}
            if data['explaining']:
                asyncio.create_task(o.explain(self, command, name, description, data))
            try:
                ok = await o.ask_owner('command', self, f'{self.name} ({self.dept["name"]}) asks to run a command',
                                       command, data)
            finally:
                self.status = 'working'
            if ok is True:
                self.activity = f'Running {clip(command, 60)}'
                return PermissionResultAllow(updated_input=inp)
            note = ok if isinstance(ok, str) and ok.strip() else ''
            return PermissionResultDeny(message='The owner did not approve this command.' + (f' They said: {note}' if note else ''))
        return PermissionResultDeny(message=f'{name} is not available in this office.')

    # ── session ───────────────────────────────────────────────────────────
    def options(self) -> ClaudeAgentOptions:
        server, office_tools = self.office_server()
        session = {'resume': self.session_id} if self.started else {'session_id': self.session_id}
        tools = list(MANAGER_TOOLS if self.manager else INTERN_TOOLS)
        disallowed = list(PEER_TOOLS)
        brief = self.system_brief()
        helper = self.helper_model
        if helper:  # allow the Agent tool for our read-only helper only
            tools.append('Agent')
            disallowed = [t for t in disallowed if t != 'Agent'] + [f'Agent({b})' for b in BUILTIN_AGENTS]
            brief += HELPER_NOTE
        return ClaudeAgentOptions(
            cwd=str(self.office.workspace),
            max_turns=self.office.engine.setting('performance', 'max_turns'),
            # the largest single message from the agent: reading a PDF or image arrives as one big message (SDK default 1 MB)
            max_buffer_size=int(self.office.engine.setting('performance', 'message_mb') * 1024 * 1024),
            can_use_tool=self.can_use,
            setting_sources=[],
            tools=tools,
            disallowed_tools=disallowed,
            env=AGENT_ENV,
            mcp_servers={'office': server},
            allowed_tools=office_tools,  # talking, planning and reporting never need the owner
            system_prompt=base_prompt(self.office.company.get('prompt_style') or 'lean', brief),
            model=self.model,
            agents={'helper': helper_definition(helper)} if helper else None,
            hooks={'PreToolUse': [HookMatcher(matcher='Agent', hooks=[helpers_in_foreground])]} if helper else None,
            **session,
        )

    @property
    def helper_model(self) -> str | None:
        """The model this agent's helpers run on, or None when helpers are off. A test override applies here too."""
        setting = self.office.company.get('helpers') or 'off'
        return None if setting == 'off' else (self.office.model or setting)

    async def run(self) -> None:
        """Wake on mail; hold a live slot only while there is work (plus a short grace period)."""
        o = self.office
        try:
            carried: list[tuple[str, str]] = []  # mail that arrived while the goal was paused
            while True:
                batch = carried or [await self.mailbox.get()]
                carried = []
                if o.held:  # paused by the owner: wait without taking a desk slot
                    self.status, self.activity = 'idle', 'Paused'
                    await o.checkpoint()
                self.status, self.activity = 'queued', 'Waiting for a free desk slot'
                async with o.slots:
                    if o.held:  # paused while waiting for the slot: give it back
                        carried = batch
                        continue
                    self._session_cost = 0.0
                    self._session_model_cost = {}
                    require_key()
                    async with ClaudeSDKClient(options=self.options()) as client:
                        while True:
                            while not self.mailbox.empty():
                                batch.append(self.mailbox.get_nowait())
                            if o.held:  # paused since: close the session (it resumes later) and free the slot
                                carried = batch
                                break
                            await o.checkpoint()
                            self.busy = True
                            try:
                                await self.reply(client, batch)
                            finally:
                                self.busy = False
                            self.status, self.activity = 'idle', 'Done for now'
                            mail = await self.next_mail(o.engine.setting('performance', 'idle_close'))
                            if mail is None:  # idle long enough, or the goal was paused: close the session
                                break
                            batch = [mail]
                self.status = 'idle'
        except asyncio.CancelledError:
            raise
        except Exception as e:  # CLI missing, auth, crashed process…
            self.busy = False
            self.status, self.activity = 'error', f'Session error: {clip(str(e), 80)}'
            o.record(self, 'error', error=f'{type(e).__name__}: {e}')
            o.add_item(InboxItem(uuid.uuid4().hex[:10], 'update', self.id, f'{self.name} stopped working',
                                 f'Their Claude session failed: {type(e).__name__}: {clip(str(e), 300)}'))

    async def next_mail(self, idle: float) -> tuple[str, str] | None:
        """The next message, or None after `idle` seconds without one, or as soon as the owner pauses the goal."""
        end = time.monotonic() + idle
        while not self.office.held and (left := end - time.monotonic()) > 0:
            try:
                return await asyncio.wait_for(self.mailbox.get(), min(left, 1.0))
            except asyncio.TimeoutError:
                pass
        return None

    async def reply(self, client: ClaudeSDKClient, batch: list[tuple[str, str]]) -> None:
        # Agents sometimes answer a colleague in plain text, which reaches nobody. Rather than forward that text
        # (it may be narration, not an answer), remind them once, in the same session, to send it properly.
        senders = {s for s, _ in batch if s != 'Owner'}
        answered = await self.turn(client, '\n\n'.join(text for _, text in batch))
        if not answered and len(senders) == 1 and self.office.active:
            sender = senders.pop()
            self.office.record(self, 'nudge', to=sender)
            await self.turn(client, f'[office] Your last reply was plain text, so {sender} did not receive it. If they '
                                    f'need an answer, send it now with mcp__office__message; otherwise just end your turn.')

    async def turn(self, client: ClaudeSDKClient, prompt: str) -> bool:
        """One prompt → response. Returns whether the agent sent anything through the office tools."""
        o = self.office
        self.status, self.activity = 'working', 'Reading new messages'
        o.record(self, 'prompt', text=prompt)
        self.started = True
        answered = False
        await client.query(prompt)
        async for msg in client.receive_response():
            if isinstance(msg, AssistantMessage):
                for block in msg.content:
                    if isinstance(block, TextBlock) and block.text.strip():
                        self.last_text = block.text.strip()
                        o.record(self, 'text', text=self.last_text)
                    elif isinstance(block, ToolUseBlock):
                        answered |= block.name.startswith('mcp__office__')
                        if block.name == 'Agent':  # handing work to a helper sub-agent
                            self.helper_calls += 1
                            o.emit('helper', frm=self.id, text=clip(str(block.input.get('description') or ''), 80))
                        if self.status != 'waiting':
                            self.activity = self.describe(block.name, block.input)
                        o.record(self, 'tool_use', tool=block.name, label=self.describe(block.name, block.input),
                                 input=json.dumps(block.input, default=str)[:20_000])
            elif isinstance(msg, UserMessage) and isinstance(msg.content, list):
                for block in msg.content:
                    if isinstance(block, ToolResultBlock):
                        o.record(self, 'tool_result', id=block.tool_use_id, error=bool(block.is_error),
                                 output=result_text(block.content)[:4_000])
            elif isinstance(msg, RateLimitEvent):  # how much of the owner's Claude plan is used (sent every session)
                o.engine.on_rate_limit(msg.rate_limit_info.raw)
            elif isinstance(msg, ResultMessage):
                spent = max((msg.total_cost_usd or 0.0) - self._session_cost, 0.0)
                self._session_cost = msg.total_cost_usd or 0.0
                self.cost += spent
                o.engine.spent_total += spent
                for model, usage in (getattr(msg, 'model_usage', None) or {}).items():  # running totals per session
                    total = float(usage.get('costUSD') or 0.0)
                    self.model_costs[model] = self.model_costs.get(model, 0.0) + max(
                        total - self._session_model_cost.get(model, 0.0), 0.0)
                    self._session_model_cost[model] = total
                o.record(self, 'reply_end', cost=spent, turns=msg.num_turns, outcome=msg.subtype, error=bool(msg.is_error))
                for card in o.cards.values():  # cards handed in during this reply: their cost is known now
                    if card['intern'] == self.id and card.get('cost_pending'):
                        card['cost'], card['cost_pending'] = round(self.cost - card['cost_start'], 5), False
                o.on_spend()
        return answered


class GoalRun:
    """One goal: its hubs, people, task cards, folder and budget. Several run at once (see OfficeEngine), each on
    its own hubs; they share the owner's inbox, the office's event stream and the limit on open sessions."""

    def __init__(self, engine: OfficeEngine) -> None:
        self.engine = engine
        self.store = engine.store
        self.model = engine.model
        self.library = engine.library
        self.shared_files = ''  # the shared-files list agents see, fixed for the goal (keeps prompts cacheable)
        self.big_files: dict[str, tuple[str, int, int]] = {}  # large shared files: path key → (name, bytes, lines)
        self.whole_reads: dict[str, str] = {}                # path key → who read it whole first
        self.part_reads: dict[tuple[str, str], int] = {}      # (path key, person) → lines read in parts so far
        self.pace: dict[str, float] = {}  # expected seconds per card size, from past goals (set at goal start)
        self.company: dict[str, Any] = {}
        self.goal: dict[str, Any] | None = None
        self.lead_dept_id = ''
        self.hubs: list[str] = []  # hubs on this goal: the ones you chose, then any asked to help
        self.window_start = 0.0    # the 5-hour plan window's use (%) when the goal started
        self.split: dict[str, Any] | None = {}  # multi-hub goals: hub id → its part (None until the lead splits)
        self.done_hubs: set[str] = set()         # hubs whose cards have all passed (the lead has been told)
        self.user_id = ''          # the account that gave the goal
        self.workspace = WORKSPACES
        self.members: dict[str, Member] = {}
        self.approved_depts: set[str] = set()
        self.pending_plans: dict[str, InboxItem] = {}  # dept id → its open plan
        self.cards: dict[str, dict[str, Any]] = {}     # task cards of the current goal, by id (T1, T2…)
        self._card_seq = 0
        self.messages = 0
        self.explain_cost = 0.0    # small helper calls (command explanations, the requirements draft), part of the goal's usage
        self.agreed: dict[str, Any] | None = None  # the requirements agreed before the start (requirements.py)
        self._finish: str | None = None
        self._finished_by: Member | None = None
        self._document = ''  # the goal's main document (a PDF or HTML page in its folder), for the owner to open
        self.sources: dict[str, list[str]] = {'pages': [], 'searches': []}  # the web pages opened and searches made
        self._watcher: asyncio.Task | None = None
        self.paused = False        # on hold at its usage limit (an Inbox decision ends it)
        self.held = False          # paused by the owner (⏸ Pause; ▶ Resume ends it)
        self.held_at = 0.0
        self.held_seconds = 0.0    # time spent paused by the owner (not counted as working time)
        self._resume = asyncio.Event()
        self._resume.set()
        self._budget_warned = False
        # a continued goal: what its earlier runs used, did and saved (see OfficeEngine.continue_goal)
        self.prior_cost = 0.0
        self.prior_seconds = 0.0
        self.prior_cards: list[dict[str, Any]] = []
        self.prior_tasks: list[dict[str, Any]] = []
        self.saved_to = ''         # the copy in the owner's output folder, once made
        self.earlier_brief = ''    # what every manager is told about the earlier runs (continue_brief)

    # ── helpers ───────────────────────────────────────────────────────────
    @property
    def active(self) -> bool:
        return self.goal is not None and self.goal['status'] == 'running'

    @property
    def id(self) -> int:
        return self.goal['id'] if self.goal else 0

    @property
    def slots(self) -> asyncio.Semaphore:  # shared by all goals
        return self.engine.slots

    @property
    def inbox(self) -> list[InboxItem]:
        """This goal's items in the owner's (shared) inbox."""
        return [i for i in self.engine.inbox if i.goal == self.id]

    def add_item(self, item: InboxItem) -> InboxItem:
        item.goal = self.id
        item.user = self.user_id
        self.engine.inbox.append(item)
        return item

    def drop_item(self, item: InboxItem) -> None:
        self.engine.inbox = [i for i in self.engine.inbox if i is not item]

    def inside_workspace(self, target: str) -> bool:
        return (self.workspace / target).resolve().is_relative_to(self.workspace.resolve())

    def short_path(self, target: str) -> str:
        try:
            return (self.workspace / target).resolve().relative_to(self.workspace.resolve()).as_posix()
        except ValueError:
            return target

    @staticmethod
    def _path_key(target: Any) -> str:
        try:
            return str(Path(str(target or '')).resolve()).lower() if target else ''
        except (OSError, ValueError):
            return ''

    def _big_files(self) -> dict[str, tuple[str, int, int]]:
        """The large shared files (the copies agents read), for the read-once rule."""
        if not self.library:
            return {}
        big = {}
        for f in self.library.list(self.company.get('id', '')):
            if f['read_size'] >= BIG_FILE and f['readable']:
                path = self.library.folder(self.company.get('id', '')) / f['read_as']
                try:
                    with open(path, 'rb') as fh:
                        lines = sum(1 for _ in fh)
                except OSError:
                    continue
                big[self._path_key(path)] = (f['read_as'], f['read_size'], lines)
        return big

    def big_read(self, m: Member, inp: dict[str, Any]) -> str | None:
        """Read-once for large shared files: managers only skim them; the first agent to read one whole may, and
        everyone after reads only parts (pointed to the digest). Returns the refusal, or None to allow the read."""
        key = self._path_key(inp.get('file_path'))
        if key not in self.big_files:
            return None
        name, size, lines = self.big_files[key]
        try:
            limit = max(int(inp.get('limit') or 0), 0)
        except (TypeError, ValueError):
            limit = 0
        find = ('Find the part you need with Grep (a topic, a heading, or "--- Page N ---"), then Read with offset '
                'and limit.')
        if m.manager:
            if 0 < limit <= SKIM_LINES:
                return None
            return (f'Managers skim large shared files: read at most {SKIM_LINES} lines at a time (e.g. limit={SKIM_LINES} '
                    f'for the start: abstract and headings), or Grep it. {find} Leave the full reading to one '
                    'mini agent\'s digest card.')
        if not limit or limit > PART_LINES:  # a whole read
            first = self.whole_reads.setdefault(key, m.name)
            if first == m.name:
                return None
            stem = name.lower().removesuffix('.txt')
            digests = [f'{deliverable_file(c) or c["deliverable"][:80]} ({c["name"]}, {c["status"]})'
                       for c in self.cards.values()
                       if c['status'] in ('submitted', 'passed') and c['name'] != m.name and reads(c, stem)]
            use = ('Use what the team already made from it: ' + '; '.join(digests[:4]) + '.' if digests else
                   'Use the digest or notes your team made from it (look in the goal folder, or ask your manager).')
            return (f'{first} already read all of {name} for this goal; a second whole read (~{size // 1024} KB) is '
                    f'the costliest step there is. {use} If you need more, read only those pages: {find} '
                    f'(up to {PART_LINES} lines at a time).')
        done = self.part_reads.get((key, m.name), 0)
        if key in self.whole_reads and self.whole_reads[key] != m.name and done + limit > lines * PART_SHARE:
            return (f'You have read much of {name} in parts already; the rest is in the digest or notes your team '
                    'made from it (look in the goal folder, or ask your manager).')
        self.part_reads[(key, m.name)] = done + limit
        return None

    def dept_of(self, dept_id: str) -> dict[str, Any] | None:
        return next((d for d in self.company['departments'] if d['id'] == dept_id), None)

    def person(self, person_id: str) -> tuple[dict[str, Any], dict[str, Any], str] | None:
        for d in self.company['departments']:
            if d['manager']['id'] == person_id:
                return d['manager'], d, 'manager'
            for i in d['interns']:
                if i['id'] == person_id:
                    return i, d, 'intern'
        return None

    def member(self, person_id: str) -> Member:
        """The real agent for this person, created (and started) the first time they get work."""
        if person_id not in self.members:
            person, dept, kind = self.person(person_id)  # type: ignore[misc]
            m = self.members[person_id] = Member(self, person, dept, kind)
            m.task = asyncio.create_task(m.run(), name=f'office-{m.name}')
        return self.members[person_id]

    def emit(self, kind: str, **data: Any) -> None:
        """An event for the office view."""
        self.engine.emit(kind, gid=self.id, **data)

    def record(self, m: Member | None, kind: str, **data: Any) -> None:
        if self.goal:
            self.store.add_event(self.goal['id'], m.name if m else '', kind, data)

    # ── documents and their sources (documents.py) ────────────────────────
    def note_source(self, m: Member, tool: str, inp: dict[str, Any]) -> None:
        """Log a web page opened or a search made, in the goal's _sources.json: a document's reference list is
        checked against it, and agents can read it to cite what was really opened."""
        kind, value = ('pages', str(inp.get('url') or '')) if tool == 'WebFetch' else ('searches', str(inp.get('query') or ''))
        if not value or value in self.sources[kind]:
            return
        self.sources[kind].append(value)
        self.record(m, 'source', tool=tool, value=value[:500])
        try:
            (self.workspace / documents.SOURCES_FILE).write_text(json.dumps(self.sources, indent=1, ensure_ascii=False),
                                                                 encoding='utf-8')
        except OSError:
            pass

    async def make_document(self, m: Member, path: str) -> str:
        source = (self.workspace / path).resolve() if path else None
        if not source or not source.is_relative_to(self.workspace.resolve()):
            return f'ERROR: give the path of a Markdown file inside {self.workspace}.'
        if source.suffix.lower() not in ('.md', '.markdown') or not source.is_file():
            return f'ERROR: {path} is not a Markdown (.md) file in the shared folder.'
        roots = [self.library.folder(self.company.get('id', ''))] if self.library else []
        m.activity = f'Making the document {self.short_path(str(source))}'
        try:
            result = await documents.make_async(source, self.workspace, roots)
        except Exception as e:  # never let a rendering problem take the agent down
            return f'ERROR: the document could not be made ({e}).'
        self.record(m, 'document', path=self.short_path(str(source)), pdf=bool(result['pdf']),
                    unopened=len(result['unopened']), missing_images=len(result['missing_images']))
        return documents.report(result, lambda p: self.short_path(str(p)))

    async def main_document(self, m: Member, path: str) -> str:
        """Set the goal's main document for the owner (made fresh from its Markdown when given one). Returns a note
        for the manager, or '' when there is nothing to say."""
        if not path:
            return ''
        target = (self.workspace / path).resolve()
        if not target.is_relative_to(self.workspace.resolve()) or not target.is_file():
            return f'Note: the document {path} was not found in the shared folder, so the owner gets no document link.\n'
        note = ''
        if target.suffix.lower() in ('.md', '.markdown'):
            note = await self.make_document(m, str(target))
            made = [target.with_suffix(x) for x in ('.pdf', '.html') if target.with_suffix(x).is_file()]
            target = made[0] if made else target
            note = f'Document made for the owner:\n{note}\n\n'
        self._document = self.short_path(str(target))
        return note

    @property
    def on_hold(self) -> bool:
        return self.paused or self.held or self.engine.paused

    async def checkpoint(self) -> None:
        """A goal on hold (paused by the owner, its own limit, or the plan-wide usage limit) holds its agents here."""
        while self.on_hold:
            await self._resume.wait()
            await self.engine._resume.wait()

    def _wake(self) -> None:
        if not self.paused and not self.held:
            self._resume.set()

    def hold(self, on: bool) -> str | None:
        """The owner pauses (on) or resumes the goal. Replies under way stop at their next step; nothing new starts,
        and agents with nothing under way give their desk slot to other goals. An error message, or None."""
        if not self.active:
            return 'That goal is not running.'
        if on == self.held:
            return None
        self.held = on
        if on:
            self.held_at = time.time()
            self._resume.clear()
        else:
            self.held_seconds += time.time() - self.held_at
            self._wake()
        self.record(None, 'hold' if on else 'unhold')
        self.emit('notice', text='Goal paused' if on else 'Goal resumed')
        return None

    def working_seconds(self) -> float:
        """Time worked on the goal, over all its runs, without the time paused by the owner."""
        held = self.held_seconds + (time.time() - self.held_at if self.held else 0.0)
        return self.prior_seconds + max(time.time() - self.goal['started'] - held, 0.0)  # type: ignore[index]

    def total_cost(self) -> float:
        """Usage over all the goal's runs (spend() is this run's, which its limit applies to)."""
        return self.prior_cost + self.spend()

    def deliver(self, sender: str, target_id: str, text: str, framed: str | None = None) -> None:
        """Put a message in someone's mailbox (waking their agent) and show it in the office."""
        target = self.member(target_id)
        source = self.members.get(self.id_of(sender))
        if target.manager and source and source.manager and source.dept['id'] != target.dept['id']:
            target.requested_by = f'{source.name} ({source.dept["name"]})'
        self.emit('message', frm=self.id_of(sender), to=target_id, text=clip(text, 160))
        self.record(None, 'message', frm=sender, to=target.name, text=text)
        target.mailbox.put_nowait((sender, framed or f'[from {sender}] {text}'))

    def id_of(self, name: str) -> str:
        if name == 'Owner':
            return 'owner'
        for d in self.company.get('departments', []):
            for p in [d['manager'], *d['interns']]:
                if p['name'] == name:
                    return p['id']
        return ''

    # ── goals ─────────────────────────────────────────────────────────────
    def start(self, company: dict[str, Any], text: str, hub_ids: list[str], lead_id: str, budget: float,
              limit_pct: float | None = None, agreed: dict[str, Any] | None = None, draft_cost: float = 0.0,
              earlier: dict[str, Any] | None = None) -> None:
        """Give the goal to the chosen hubs' managers (checked by OfficeEngine.start_goal). The lead hub's manager
        owns the result and finishes the goal. agreed: the requirements agreed in the goal dialog, if any.
        earlier: continuing a stopped goal (OfficeEngine.continue_goal): its id, folder, what was done, and a brief."""
        self.company = company
        self.agreed = agreed
        self.explain_cost += draft_cost
        agreed_text = f'\n\n{requirements.brief(agreed)}' if agreed else ''
        stamp = datetime.now()
        names = ', '.join(self.dept_of(h)['name'] for h in hub_ids)  # type: ignore[index]
        if earlier:  # the same goal and folder: the team picks up from what is there
            mission_id, rel = earlier['id'], earlier['workspace']
            self.workspace = WORKSPACES.parent / rel
            self.prior_cost, self.prior_seconds = earlier['cost'], earlier['seconds']
            self.prior_cards, self.prior_tasks = earlier['cards'], earlier['tasks']
            self.saved_to = earlier.get('saved_to') or ''
            self._document = earlier.get('document') or ''
            self._card_seq = max([int(c['id'][1:]) for c in self.prior_cards
                                  if re.fullmatch(r'T\d+', str(c.get('id') or ''))] + [0])
            self.store.update_mission(mission_id, status='running', ended_at=None, preset=names, budget=budget)
            self.earlier_brief = earlier['brief']
            agreed_text += f'\n\n{self.earlier_brief}'
        else:
            mission_id = self.store.create_mission('office', text, budget, names, '')
            self.workspace = WORKSPACES / f'goal-{stamp:%Y%m%d-%H%M%S}-{mission_id}'
            rel = self.workspace.relative_to(WORKSPACES.parent).as_posix()
        self.workspace.mkdir(parents=True, exist_ok=True)
        self.store.update_mission(mission_id, company=company.get('id', ''), workspace=rel, user_id=self.user_id)
        self.goal = {'id': mission_id, 'text': text, 'dept': lead_id, 'budget': budget, 'workspace': rel,
                     'started': time.time(), 'status': 'running', 'summary': '', 'ended': None, 'limit_pct': limit_pct}
        self.window_start = (self.engine.five_hour or {}).get('pct', 0.0)
        self.lead_dept_id = lead_id
        self.hubs = list(hub_ids)
        self.shared_files = self.library.prompt_section(company.get('id', '')) if self.library else ''
        self.big_files = self._big_files()
        self.pace = self._pace()
        self.record(None, 'mission_resume' if earlier else 'mission_start', mode='office', goal=text, budget=budget,
                    preset=names, **({'agreed': agreed} if agreed else {}))
        # kept from the start, so that a goal cut off by closing the app can be continued
        self.store.update_mission(mission_id, state={**(earlier or {}).get('state', {}), **self.saved_state()})
        self.emit('goal_start', goal=text, dept=lead_id)
        lead = self.dept_of(lead_id)
        if len(hub_ids) == 1:
            self.split = {}
            self.deliver('Owner', lead['manager']['id'], text, framed=(  # type: ignore[index]
                f'[from Owner] {"Continuing a goal" if earlier else "New goal"} for the {lead["name"]} hub:\n{text}{agreed_text}\n\nYou lead this goal. '  # type: ignore[index]
                'Plan it: call mcp__office__submit_plan with task cards for your mini agents.'))
        else:
            # Several hubs: the lead splits the work first, so no two hubs plan the same job. The others start
            # only when they receive their part (see split_work).
            self.split = None
            others = '\n'.join(f'  - {d["name"]} (manager {d["manager"]["name"]})' + (f': {d["purpose"]}' if d.get('purpose') else '')
                               for d in (self.dept_of(h) for h in hub_ids))  # type: ignore[union-attr]
            self.deliver('Owner', lead['manager']['id'], text, framed=(  # type: ignore[index]
                f'[from Owner] {"Continuing a goal" if earlier else "New goal"}, shared by several hubs; you lead it:\n{text}{agreed_text}\n\nHubs on this goal:\n{others}\n\n'
                'Step 1: call mcp__office__split_work. Give each hub (yours included) one part that fits its purpose, '
                'with the files it will deliver, so that no two parts overlap (e.g. only one hub reads a long source '
                'document and shares a digest). Leave out a hub that is not needed. The other managers start only when '
                'they receive their part.\nStep 2: plan your own part with mcp__office__submit_plan.'))
        self._watcher = asyncio.create_task(self._watch())

    def split_work(self, m: Member, args: dict[str, Any]) -> str:
        """The lead manager divides a multi-hub goal: each hub gets one part and its deliverables (no overlaps).
        Each other manager then receives the goal with their part and everyone else's."""
        if not self.active:
            return 'The goal is over.'
        if m.dept['id'] != self.lead_dept_id:
            return 'ERROR: only the lead manager splits the work.'
        if self.split is not None:
            return 'The work is already split. Plan your own part with mcp__office__submit_plan.'
        names = {self.dept_of(h)['name'].lower(): h for h in self.hubs}  # type: ignore[index]
        parts: dict[str, dict[str, Any]] = {}
        for p in args.get('parts') or []:
            hub = names.get(str((p or {}).get('hub', '')).strip().lower()) if isinstance(p, dict) else None
            if hub is None:
                return f'ERROR: unknown hub {p!r}. Hubs on this goal: {", ".join(self.dept_of(h)["name"] for h in self.hubs)}.'  # type: ignore[index]
            parts[hub] = {'part': clip(str(p.get('part', '')), 600),
                          'deliverables': [clip(str(x), 160) for x in (p.get('deliverables') or [])][:8],
                          'after': [names[a.strip().lower()] for a in (p.get('after') or [])
                                    if isinstance(a, str) and a.strip().lower() in names and names[a.strip().lower()] != hub]}
        if self.lead_dept_id not in parts:
            return 'ERROR: include a part for your own hub too.'
        for hub, v in parts.items():  # a hub can only wait for hubs that have a part
            v['after'] = [a for a in v['after'] if a in parts]
        self.split = parts
        overview = '\n'.join(f'  - {self.dept_of(h)["name"]}: {v["part"]}'  # type: ignore[index]
                             + (f' (delivers: {", ".join(v["deliverables"])})' if v['deliverables'] else '')
                             + (f' [starts after {", ".join(self.dept_of(a)["name"] for a in v["after"])}]' if v['after'] else '')  # type: ignore[index]
                             for h, v in parts.items())
        self.record(m, 'split', parts={self.dept_of(h)['name']: v for h, v in parts.items()})  # type: ignore[index]
        self.emit('report', frm=m.id, to='owner', text='Work split between hubs')
        for hub in [h for h in self.hubs if h not in parts]:  # not needed: free for other goals
            self.hubs.remove(hub)
        for hub, v in parts.items():
            if hub == self.lead_dept_id:
                continue
            dept = self.dept_of(hub)
            self.deliver(m.name, dept['manager']['id'], v['part'], framed=(  # type: ignore[index]
                f'[from {m.name}, {m.dept["name"]} manager, who leads this goal] '
                f'{"Continuing a goal" if self.earlier_brief else "New goal"} from the owner:\n'
                f'{self.goal["text"]}'  # type: ignore[index]
                + (f'\n\n{requirements.brief(self.agreed)}' if self.agreed else '')
                + (f'\n\n{self.earlier_brief}' if self.earlier_brief else '')
                + f'\n\nYour hub\'s part: {v["part"]}'
                + (f'\nDeliver: {", ".join(v["deliverables"])}' if v['deliverables'] else '')
                + f'\n\nThe whole split (plan ONLY your part; never repeat another hub\'s job):\n{overview}\n\n'
                + ('Your cards start automatically once the hubs you wait for have passed theirs, and they receive '
                   'those results; plan as if their files exist. ' if v['after'] else '')
                + 'Plan your part: call mcp__office__submit_plan with task cards for your mini agents. When all your '
                'cards have passed, the lead manager is told automatically.'))
        return ('Work split and sent to the other managers. Now plan your own part with mcp__office__submit_plan, '
                'then end your turn.')

    def spend(self) -> float:
        return sum(m.cost for m in self.members.values()) + self.explain_cost

    async def explain(self, m: Member, command: str, tool: str, description: str, data: dict[str, Any]) -> None:
        """Fill in a waiting command's plain-language explanation (shown in the Inbox while it waits)."""
        card = next((c for c in self.cards.values() if c['intern'] == m.id and c['status'] in ('assigned', 'rework')), None)
        try:
            explanation, cost = await explain_command(
                command, tool=tool, description=description, who=f'{m.name} ({m.role}, {m.dept["name"]} hub)',
                task=f'{card["title"]}: {card["goal"]}' if card else '', goal=self.goal['text'],  # type: ignore[index]
                folder=str(self.workspace))
        except Exception as e:  # noqa: BLE001  (an explanation is optional: the command is still shown)
            explanation, cost = None, 0.0
            self.record(m, 'error', where='explain', error=f'{type(e).__name__}: {clip(str(e), 200)}')
        data['explaining'] = False
        data['explain'] = explanation
        if cost:
            self.explain_cost += cost
            self.on_spend()

    def usage_pct(self) -> float | None:
        """How much of the owner's 5-hour plan window this goal has used (≈, in %). From the measured ratio of
        plan usage to work done when there is one; otherwise from the window's rise since the goal started, shared
        with the other running goals. None when the owner uses an API key (no plan limits)."""
        e = self.engine
        if not e.plan:
            return None
        if e.pct_per_usd:
            return self.spend() * e.pct_per_usd
        rise = max((e.five_hour or {}).get('pct', 0.0) - self.window_start, 0.0)
        return rise / max(sum(r.active for r in e.runs.values()), 1)

    def limit(self) -> tuple[float, float, str]:
        """(used, limit, unit): % of the 5-hour window on a Claude plan, else dollars with an API key."""
        if self.goal.get('limit_pct'):  # type: ignore[union-attr]  # (a goal with a % limit never falls back to dollars)
            return self.usage_pct() or 0.0, self.goal['limit_pct'], '%'  # type: ignore[index]
        return self.spend(), self.goal['budget'], '$'  # type: ignore[index]

    def on_spend(self) -> None:
        if not self.active:
            return
        self.store.update_mission(self.goal['id'], cost=self.total_cost())  # type: ignore[index]
        used, limit, unit = self.limit()
        show = (lambda v: f'{v:.1f}%') if unit == '%' else (lambda v: f'${v:.2f}')
        if not self._budget_warned and used >= 0.8 * limit:
            self._budget_warned = True
            self.emit('notice', text=f'This goal used 80% of its limit ({show(used)} of {show(limit)})')
        if used >= limit and not self.paused:
            self.paused = True
            self._resume.clear()
            self.record(None, 'budget_hold', used=used, limit=limit, unit=unit)
            asyncio.create_task(self._budget_hold(used, limit, unit))

    async def _budget_hold(self, used: float, limit: float, unit: str) -> None:
        show = (lambda v: f'{v:.0f}%') if unit == '%' else (lambda v: f'${v:.2f}')
        suggest = max(round(limit * 0.5, 1 if unit == '%' else 2), 1.0 if unit == '%' else 0.05)
        cards = list(self.cards.values())
        passed = sum(c['status'] == 'passed' for c in cards)
        body = (f'This goal has used about {show(used)} of the 5-hour limit, and its limit was {show(limit)}.' if unit == '%'
                else f'This goal has used {show(used)}, and its limit was {show(limit)}.')
        body += ' The team is paused until a decision is made (replies already under way finish first).'
        if cards:
            body += f' Progress so far: {passed} of {len(cards)} task cards passed.'
        decision = await self.ask_owner('budget', None, 'The goal reached its usage limit', body,
                                        {'suggest': suggest, 'unit': unit, 'used': used, 'limit': limit,
                                         'passed': passed, 'cards': len(cards)})
        if not self.active:
            return
        if isinstance(decision, (int, float)) and not isinstance(decision, bool) and decision > 0:
            key = 'limit_pct' if unit == '%' else 'budget'
            self.goal[key] = round(self.goal[key] + float(decision), 2)  # type: ignore[index]
            if unit == '$':
                self.store.update_mission(self.goal['id'], budget=self.goal['budget'])  # type: ignore[index]
            self._budget_warned = self.limit()[0] >= 0.8 * self.goal[key]  # type: ignore[index]
            self.record(None, 'budget_raise', amount=float(decision), limit=self.goal[key], unit=unit)  # type: ignore[index]
            self.paused = False
            self._wake()
            self.on_spend()
        else:
            self.stop('Stopped at its usage limit')

    async def ask_owner(self, kind: str, m: Member | None, title: str, body: str, data: dict[str, Any]) -> Any:
        item = self.add_item(InboxItem(uuid.uuid4().hex[:10], kind, m.id if m else '', title, body, data,
                                       asyncio.get_running_loop().create_future()))
        self.record(m, 'approval', about=kind, title=title, detail=body)
        if m:
            self.emit('ask', frm=m.id, about=kind)
        try:
            answer = await item.future
        finally:
            self.drop_item(item)
        self.record(m, 'decision', about=kind, decision='approve' if answer is True else 'deny' if answer is False else str(answer))
        return answer

    # ── what agents can do (the office tools) ─────────────────────────────
    def send(self, m: Member, to: str, text: str) -> str:
        if not self.active:
            return 'The goal is over; nothing is delivered.'
        if not text.strip():
            return 'ERROR: empty message.'
        allowed = m.allowed_recipients()
        target = allowed.get(to.strip().lower())
        if target is None:
            names = ', '.join(p['name'] for p in allowed.values()) or 'nobody'
            rule = ('You may message your own mini agents and the other hubs\' managers.' if m.manager else
                    'Mini agents may message only their own manager and teammates; your manager handles other hubs.')
            return f'ERROR: you cannot message "{to}". {rule} Allowed: {names}.'
        other_hub = next((d for d in self.company['departments'] if d['manager'] is target and d['id'] != m.dept['id']), None)
        if other_hub is not None and other_hub['id'] not in self.hubs:
            busy = self.engine.hub_goal(other_hub['id'])
            if busy is not None and busy is not self:
                return (f'ERROR: the {other_hub["name"]} hub is busy with another goal ("{clip(busy.goal["text"], 60)}"). '  # type: ignore[index]
                        'Ask a different hub, or have your own team do it.')
            self.hubs.append(other_hub['id'])  # it joins this goal
        is_own_intern = m.manager and target in m.dept['interns']
        if is_own_intern and m.dept['id'] not in self.approved_depts:
            return 'ERROR: submit your plan with mcp__office__submit_plan and wait for the owner to approve it first.'
        cap = self.engine.setting('performance', 'messages_per_goal')
        if self.messages >= cap:
            return f'ERROR: this goal hit its limit of {cap} messages. Wrap up and report.'
        self.messages += 1
        label = f'{m.name}, {m.dept["name"]} manager' if m.manager else m.name
        self.deliver(m.name, target['id'], text, framed=f'[from {label}] {text}')
        return f'Delivered to {target["name"]}. End your turn if you have nothing else to do; replies arrive as new turns.'

    def submit_plan(self, m: Member, args: dict[str, Any]) -> str:
        if not self.active:
            return 'The goal is over.'
        dept_id = m.dept['id']
        if self.split is None and dept_id == self.lead_dept_id:
            return 'ERROR: first split the work between the hubs with mcp__office__split_work, then plan your part.'
        raw = args.get('tasks') or []
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except json.JSONDecodeError:
                return 'ERROR: tasks must be a list of {intern, task}.'
        team = {i['name'].lower(): i for i in m.dept['interns']}
        tasks = []
        for n, t in enumerate(raw, 1):
            intern = team.get(str(t.get('intern', '')).strip().lower()) if isinstance(t, dict) else None
            card = card_from(t) if isinstance(t, dict) else None
            if intern is None or card is None:
                names = ', '.join(i['name'] for i in m.dept['interns'])
                return (f'ERROR: bad task card {n} ({clip(repr(t), 120)}). Assign only your own team ({names}); each '
                        'card needs a title, a goal, a deliverable and at least one done_when check.')
            if not card['deliverable']:
                return f'ERROR: card {n} has no deliverable. Say exactly what to hand in and where, then submit again.'
            if any(a >= n or a < 1 for a in card['after']):
                allowed = f'1 to {n - 1}' if n > 2 else '1' if n == 2 else 'none: the first card cannot wait'
                return f'ERROR: card {n}: "after" may only list earlier cards of this plan ({allowed}).'
            tasks.append({'intern': intern['id'], 'name': intern['name'], 'role': intern['role'], **card,
                          'hints': card_hints(card)})
        if not tasks:
            return 'ERROR: the plan has no task cards.'
        # free checks against the other hubs' cards for this goal (planned or already approved)
        others = [(self.dept_of(i.data['dept'])['name'], t) for i in self.pending_plans.values()  # type: ignore[index]
                  if i.data['dept'] != dept_id for t in i.data['tasks']]
        others += [(c['hub'], c) for c in self.cards.values() if c['hub_id'] != dept_id]
        for t in tasks:
            for hub, o in others:
                if same_job(t, o):
                    t['hints'] = [f'Looks like the same job as "{clip(o["title"], 50)}" ({hub}, {o["name"]}): drop one.'] + t['hints']
                    break
        hints = plan_hints(tasks)
        if self.library:
            big = [(f['read_as'], f['read_size']) for f in self.library.list(self.company.get('id', '')) if f['read_size'] >= BIG_FILE]
            hints += big_file_hint(tasks, big, others)
        summary = str(args.get('summary', '')).strip()
        lead = dept_id == self.lead_dept_id
        asked_by = '' if lead else m.requested_by
        old = self.pending_plans.pop(dept_id, None)  # a plan still waiting is replaced by the new one
        if old is not None:
            if old.future and not old.future.done():
                old.future.set_result('replaced')
            self.drop_item(old)
            self.record(m, 'plan_replaced')
        title = (f'{m.name} ({m.dept["name"]}) sends {"an updated" if old else "a"} plan'
                 + (f', asked for by {asked_by}' if asked_by else ''))
        item = self.add_item(InboxItem(uuid.uuid4().hex[:10], 'plan', m.id, title, summary,
                                       {'dept': dept_id, 'tasks': tasks, 'lead': lead, 'asked_by': asked_by,
                                        'hints': hints, 'goal_text': self.goal['text'],  # type: ignore[index]
                                        'estimate': self.estimate(tasks)},
                                       asyncio.get_running_loop().create_future()))
        self.pending_plans[dept_id] = item
        self.emit('plan', frm=m.id, to='owner', text=clip(summary, 120))
        self.record(m, 'plan', summary=summary, tasks=[{'worker': t['name'], 'task': card_text(t)} for t in tasks])
        m.activity = 'Plan awaiting approval'
        if self.engine.setting('plans', 'auto_approve'):  # after this reply has its answer
            asyncio.get_running_loop().call_soon(self.auto_approve, item)
        return (('Your earlier plan was replaced by this one. ' if old else '') +
                'Plan sent to the owner. End your turn now; their decision arrives as your next message.')

    def auto_approve(self, item: InboxItem) -> None:
        """Approve a waiting plan without the owner (Settings → Safety: approve plans automatically), and leave
        a note in the Inbox saying what was approved."""
        if not self.active or item.future is None or item.future.done() or item not in self.engine.inbox:
            return
        self._answer_plan(item, 'approve', {})
        self.record(None, 'plan_auto_approved', dept=item.data.get('dept'))
        cards = '\n'.join(f'  - {t.get("name")}: {clip(t.get("title") or "", 70)}' for t in item.data.get('tasks') or [])
        self.add_item(InboxItem(uuid.uuid4().hex[:10], 'update', item.frm, 'Plan approved automatically',
                                f'{item.title}.\n{item.body}\n\nTask cards:\n{cards}'.strip(),
                                {'goal': self.goal['text'] if self.goal else ''}))

    def _answer_plan(self, item: InboxItem, action: str, extra: dict[str, Any]) -> str | None:
        dept = self.dept_of(item.data['dept'])
        manager = dept['manager'] if dept else None
        self.pending_plans.pop(item.data['dept'], None)
        item.future.set_result(action)  # type: ignore[union-attr]
        self.drop_item(item)
        if dept is None or manager is None:
            return None
        if action != 'approve':
            feedback = str(extra.get('feedback') or '').strip() or 'Please rethink the plan.'
            self.record(None, 'plan_returned', feedback=feedback)
            self.emit('plan_returned', frm='owner', to=manager['id'])
            self.deliver('Owner', manager['id'], f'Plan not approved. {feedback} Revise it and call submit_plan again.')
            return None
        edited = extra.get('tasks')
        tasks = [{**t, 'pos': n} for n, t in enumerate(item.data['tasks'], 1)]  # pos: the card's number in the plan
        if isinstance(edited, list) and len(edited) == len(tasks):  # the owner may edit or drop (clear) cards
            merged = []
            for t, e in zip(tasks, edited):
                if isinstance(e, dict):
                    card = card_from(e)
                    if card is not None:
                        merged.append({**t, **card})
                elif isinstance(e, str) and e.strip():  # older clients send plain text
                    merged.append({**t, 'goal': e.strip()})
            tasks = merged
        self.approved_depts.add(dept['id'])
        self.record(None, 'plan_approved', tasks=[{'worker': t['name'], 'task': card_text(t)} for t in tasks])
        self.emit('plan_approved', frm='owner', to=manager['id'])
        ids: dict[int, str] = {}  # plan number → card id (dropped cards have none, so waiting on them is dropped too)
        wait_hubs = list(((self.split or {}).get(dept['id']) or {}).get('after', []))  # the split: hubs to wait for
        for t in tasks:
            self._card_seq += 1
            ids[t['pos']] = card_id = f'T{self._card_seq}'
            waits = [ids[a] for a in t.get('after', []) if a < t['pos'] and a in ids]
            card = {**{k: v for k, v in t.items() if k not in ('pos', 'hints')}, 'id': card_id, 'after_ids': waits,
                    'wait_hubs': wait_hubs, 'hub': dept['name'], 'hub_id': dept['id'], 'manager': manager['id'],
                    'status': 'waiting' if waits or wait_hubs else 'assigned', 'attempts': 1, 'assigned_at': time.time(),
                    'submitted_at': None, 'finished_at': None, 'cost_start': self.member(t['intern']).cost, 'cost': 0.0,
                    'notes': '', 'criteria_met': None, 'summary': '', 'files': []}
            self.cards[card_id] = card
            if card['status'] == 'waiting':
                self.emit('card', id=card_id, status='waiting', frm=manager['id'], to=t['intern'], text=card['title'])
            else:
                self._deliver_card(card)
        self._release()  # the hubs this one waits for may already be done
        mine = [c for c in self.cards.values() if c['hub_id'] == dept['id']]
        assigned = ', '.join(f'{c["id"]} → {c["name"]}' for c in mine if c['status'] == 'assigned') or 'nobody'
        waiting = ', '.join(f'{c["id"]} → {c["name"]} (after '
                            + ', '.join(c['after_ids'] + [f'the {self.dept_of(h)["name"]} hub' for h in c['wait_hubs']]) + ')'  # type: ignore[index]
                            for c in mine if c['status'] == 'waiting')
        self.member(manager['id']).mailbox.put_nowait(('Owner', (
            f'[from Owner] Plan approved. Task cards delivered now: {assigned}.'
            + (f' Waiting for earlier cards (delivered automatically when those pass): {waiting}.' if waiting else '')
            + ' Mini agents hand cards in with submit_work; each arrives as a new turn. Review every handed-in card with '
            'mcp__office__review_work: pass it only if every done-when check is met with real evidence, otherwise send '
            'it back for rework with exact notes.')))
        return None

    def _deliver_card(self, card: dict[str, Any]) -> None:
        """Hand a card to its intern, with the results of the cards it waited for."""
        manager = self.dept_of(card['hub_id'])['manager']  # type: ignore[index]
        handoffs = [self.cards[i] for i in card.get('after_ids', []) if i in self.cards]
        handoffs += [c for c in self.cards.values() if c['hub_id'] in card.get('wait_hubs', []) and c['status'] == 'passed']
        card.update(status='assigned', assigned_at=time.time(), cost_start=self.member(card['intern']).cost)
        self.emit('card', id=card['id'], status='assigned', frm=manager['id'], to=card['intern'], text=card['title'])
        goal = self.goal['text'] if self.goal else ''
        self.deliver(manager['name'], card['intern'], card['title'], framed=(
            f'[Task card {card["id"]} from {manager["name"]}, {card["hub"]} manager, approved by the owner]\n'
            f'Company goal: {goal}\n\n{card_text(card, handoffs)}\n\nTeammates may be working on related cards at the '
            f'same time. If something you need is missing, tell {manager["name"]} and end your turn. When you finish '
            f'(or are blocked), call mcp__office__submit_work with card "{card["id"]}": a short summary, every '
            'done-when check with met true/false and how you checked it, and the files you changed.'))

    def hub_done(self, hub_id: str) -> bool:
        """A hub has approved cards for this goal and all of them have passed."""
        cards = [c for c in self.cards.values() if c['hub_id'] == hub_id]
        return bool(cards) and all(c['status'] == 'passed' for c in cards)

    def _release(self) -> list[str]:
        """Deliver waiting cards whose earlier cards (and the hubs they wait for) have all passed."""
        released = []
        for card in self.cards.values():
            if (card['status'] == 'waiting'
                    and all(self.cards[i]['status'] == 'passed' for i in card['after_ids'] if i in self.cards)
                    and all(self.hub_done(h) for h in card.get('wait_hubs', []))):
                self._deliver_card(card)
                released.append(f'{card["id"]} → {card["name"]}')
        return released

    def _hub_finished(self, hub_id: str) -> None:
        """When a hub's last card passes, tell the lead manager (no extra agent turns needed to coordinate); when
        every hub is done, tell the lead to finish the goal."""
        if not self.hub_done(hub_id) or hub_id in self.done_hubs:
            return
        self.done_hubs.add(hub_id)
        lead = self.dept_of(self.lead_dept_id)
        if lead is None or self._finish is not None:
            return
        hub = self.dept_of(hub_id)
        if hub_id != self.lead_dept_id:
            results = '\n'.join(f'  - {c["id"]} "{c["title"]}" by {c["name"]}: {c.get("summary") or "passed"}'
                                + (f' (files: {", ".join(c["files"])})' if c.get('files') else '')
                                for c in self.cards.values() if c['hub_id'] == hub_id)
            self.deliver(hub['manager']['name'], lead['manager']['id'], f'{hub["name"]} finished its part', framed=(  # type: ignore[index]
                f'[office] The {hub["name"]} hub finished its part: all its cards passed review.\n{results}'))  # type: ignore[index]
        others = [h for h in self.hubs if h != self.lead_dept_id and (not self.split or h in self.split)]
        if all(self.hub_done(h) for h in [self.lead_dept_id, *others]):
            self.member(lead['manager']['id']).mailbox.put_nowait(('Owner', (  # type: ignore[index]
                '[office] Every hub\'s cards for this goal have passed. Check the result against the goal if needed, then '
                'call mcp__office__finish_goal with a summary of the result and where the files are.')))

    # ── task cards: hand in, review ───────────────────────────────────────
    def submit_work(self, m: Member, args: dict[str, Any]) -> str:
        if not self.active:
            return 'The goal is over.'
        card = self.cards.get(str(args.get('card', '')).strip().upper())
        if card is None or card['intern'] != m.id:
            mine = ', '.join(c['id'] for c in self.cards.values() if c['intern'] == m.id) or 'none'
            return f'ERROR: unknown card. Your cards: {mine}.'
        if card['status'] in ('submitted', 'passed'):
            return f'Card {card["id"]} is already {card["status"]}.'
        if card['status'] == 'waiting':
            return f'Card {card["id"]} has not started yet: it waits for {", ".join(card["after_ids"])}.'
        status = 'blocked' if args.get('status') == 'blocked' else 'submitted'
        criteria = [c for c in (args.get('criteria') or []) if isinstance(c, dict)]
        met = sum(1 for c in criteria if c.get('met') is True)
        summary = str(args.get('summary', '')).strip()
        # cost is settled when this reply ends (spend is only known then; see Member.turn)
        card.update(status=status, submitted_at=time.time(), criteria_met=met, criteria_total=max(len(card['done_when']),
                    len(criteria)), cost_pending=True, files=[str(f) for f in (args.get('files') or [])][:20],
                    summary=clip(summary, 600))
        lines = '\n'.join(f'  [{"x" if c.get("met") else " "}] {c.get("criterion") or "check"}'
                          + (f' ({c.get("evidence")})' if c.get('evidence') else '') for c in criteria)
        manager = self.dept_of(card['hub_id'])['manager']  # type: ignore[index]
        self.record(m, 'work_submitted', card=card['id'], status=status, met=met, total=card['criteria_total'],
                    summary=summary)
        self.emit('card', id=card['id'], status=status, frm=m.id, to=manager['id'], text=card['title'])
        asked = '\n'.join(f'  - {c}' for c in card['done_when'])
        self.deliver(m.name, manager['id'], f'{card["id"]} {status}', framed=(
            f'[Card {card["id"]} handed in by {m.name}: {status.upper()}] {card["title"]}\n'
            f'You asked for: {card.get("deliverable") or card["goal"]}\nYour checks:\n{asked}\n\n'
            f'Summary: {summary}\nTheir checks ({met}/{card["criteria_total"]} met):\n{lines}\n'
            f'Files: {", ".join(card["files"]) or "none"}\n\n'
            f'Review it with mcp__office__review_work (card "{card["id"]}", verdict pass or rework).'))
        return f'Card {card["id"]} handed in to {manager["name"]}. End your turn; any rework request arrives as a new turn.'

    def review_work(self, m: Member, args: dict[str, Any]) -> str:
        if not self.active:
            return 'The goal is over.'
        card = self.cards.get(str(args.get('card', '')).strip().upper())
        if card is None or card['hub_id'] != m.dept['id']:
            return 'ERROR: that card is not one of your team\'s.'
        if card['status'] not in ('submitted', 'blocked'):
            return f'ERROR: card {card["id"]} is {card["status"]}; only handed-in cards can be reviewed.'
        notes = str(args.get('notes', '')).strip()
        intern = self.member(card['intern'])
        if args.get('verdict') == 'pass':
            card.update(status='passed', finished_at=time.time(), notes=notes)
            self.record(m, 'work_reviewed', card=card['id'], verdict='pass', attempts=card['attempts'])
            self.emit('card', id=card['id'], status='passed', frm=m.id, to=intern.id, text=card['title'])
            released = self._release()
            self._hub_finished(m.dept['id'])
            return f'Card {card["id"]} passed.' + (f' Now delivered (they were waiting for it): {", ".join(released)}.'
                                                   if released else '')
        card.update(status='rework', attempts=card['attempts'] + 1, notes=notes)
        self.record(m, 'work_reviewed', card=card['id'], verdict='rework', attempts=card['attempts'], notes=notes)
        self.emit('card', id=card['id'], status='rework', frm=m.id, to=intern.id, text=card['title'])
        self.deliver(m.name, intern.id, f'Rework {card["id"]}: {notes}', framed=(
            f'[Card {card["id"]} sent back for rework by {m.name}] {notes or "Not all checks are met."}\n'
            f'Fix it, then hand it in again with mcp__office__submit_work (card "{card["id"]}").'))
        return f'Card {card["id"]} sent back to {intern.name} for rework.'

    def report(self, m: Member, text: str) -> str:
        if not text.strip():
            return 'ERROR: empty report.'
        self.add_item(InboxItem(uuid.uuid4().hex[:10], 'update', m.id, f'Update from {m.name} ({m.dept["name"]})', text))
        self.emit('report', frm=m.id, to='owner', text=clip(text, 120))
        self.record(m, 'report', text=text)
        return 'The owner has your update.'

    def ask_question(self, m: Member, args: dict[str, Any]) -> str:
        """A manager's question to the owner, with options to pick from (or their own answer). Like a plan, the
        answer arrives as the manager's next message, so no agent is held open while the owner thinks."""
        if not self.active:
            return 'The goal is over.'
        question = str(args.get('question') or '').strip()
        options = [{'label': clip(str(o.get('label') or '').strip(), 80), 'description': clip(str(o.get('description') or '').strip(), 240)}
                   for o in (args.get('options') or []) if isinstance(o, dict) and str(o.get('label') or '').strip()][:4]
        if not question or len(options) < 2:
            return 'ERROR: give a question and 2-4 options, each with a label and what happens if chosen.'
        try:
            recommended = int(args.get('recommended') or 0)
        except (TypeError, ValueError):
            recommended = 0
        if any(i.kind == 'question' and i.frm == m.id and i.open for i in self.inbox):
            return 'Your earlier question is still waiting for the owner. End your turn; the answer arrives as a message.'
        data = {'why': clip(str(args.get('why') or '').strip(), 600), 'options': options,
                'recommended': recommended if 1 <= recommended <= len(options) else 0}
        item = self.add_item(InboxItem(uuid.uuid4().hex[:10], 'question', m.id, clip(question, 200), data['why'], data,
                                       asyncio.get_running_loop().create_future()))
        self.record(m, 'approval', about='question', title=question, detail=data['why'], options=options)
        self.emit('ask', frm=m.id, about='question')
        m.activity = 'Waiting for the owner\'s answer'

        def answered(future: asyncio.Future) -> None:
            self.drop_item(item)
            answer = None if future.cancelled() else future.result()
            if not self.active or not isinstance(answer, dict):
                return
            choice, text = answer.get('choice'), str(answer.get('text') or '').strip()
            picked = options[choice - 1]['label'] if isinstance(choice, int) and 1 <= choice <= len(options) else ''
            reply = (f'Answer to your question "{clip(question, 120)}": '
                     + (f'the owner chose "{picked}".' + (f' They added: {text}' if text else '') if picked
                        else f'the owner answered in their own words: {text}'))
            self.record(m, 'decision', about='question', decision=picked or text)
            self.deliver('Owner', m.id, reply)

        item.future.add_done_callback(answered)  # type: ignore[union-attr]
        return 'Question sent to the owner. End your turn now; their answer arrives as your next message.'

    def finish(self, m: Member, summary: str) -> str:
        if m.dept['id'] != self.lead_dept_id:
            return 'ERROR: only the lead hub\'s manager finishes the goal.'
        if m.dept['id'] not in self.approved_depts:
            return 'ERROR: your plan was never approved, so the goal cannot be done yet.'
        waiting = [c['id'] for c in self.cards.values() if c['status'] == 'submitted']
        if waiting:  # KPIs depend on every handed-in card getting a verdict
            return (f'ERROR: cards {", ".join(waiting)} were handed in but not reviewed. Review them (or ask their '
                    'hub manager to) with review_work first.')
        self._finish, self._finished_by = summary.strip() or 'Goal complete.', m
        self.emit('report', frm=m.id, to='owner', text='Goal complete')
        self.record(m, 'finish', summary=self._finish)
        if self.engine.setting('memory', 'enabled'):
            return ('Goal marked complete. If your hub learned something worth keeping for future goals, save one '
                    'short note with mcp__office__remember now; then end your turn.')
        return 'Goal marked complete. End your turn.'

    # ── ending ────────────────────────────────────────────────────────────
    async def _watch(self) -> None:
        """End the goal when the lead manager finishes, or when everyone has gone quiet."""
        quiet = 0.0
        while self.active:
            await asyncio.sleep(0.5)
            if self._finish is not None and self._finished_by is not None and not self._finished_by.busy:
                self._end('complete', self._finish)
                return
            waiting = any(i.open for i in self.inbox)
            idle = all(m.status == 'error' or (not m.busy and m.mailbox.empty() and m.status != 'queued')
                       for m in self.members.values())
            quiet = quiet + 0.5 if idle and not waiting and not self.paused and not self.held else 0.0
            if quiet >= QUIET_END:
                self._end('ended', 'The team went quiet before the goal was declared done.')
                return

    def stop(self, reason: str = 'Stopped manually') -> None:
        if self.active:
            self._end('aborted', reason)

    def _end(self, status: str, summary: str) -> None:
        goal = self.goal
        assert goal is not None
        goal['status'], goal['summary'], goal['ended'] = status, summary, time.time()
        for item in self.inbox:
            if item.open:
                item.future.set_result(False)  # type: ignore[union-attr]
        self.engine.inbox = [i for i in self.engine.inbox  # decisions die with the goal
                             if i.goal != self.id or i.kind in ('update', 'result')]
        for m in self.members.values():
            if m.task and not m.task.done():
                m.task.cancel()
            m.status, m.busy = 'done', False
            m.activity = 'Goal finished' if status == 'complete' else 'Goal ended'
        if self._watcher and self._watcher is not asyncio.current_task():
            self._watcher.cancel()
        duration = self.working_seconds()
        self.paused = self.held = False
        self._resume.set()
        spend = self.total_cost()
        self.save_cards()
        self.record(None, 'mission_end', outcome=status, cost=self.spend(), seconds=duration)
        self.store.update_mission(goal['id'], status=status, ended_at=time.time(), cost=spend, duration_s=duration,
                                  summary=summary, state=self.saved_state())
        title = {'complete': 'Goal complete', 'aborted': 'Goal stopped', 'ended': 'Goal ended without finishing'}[status]
        result = self.add_item(InboxItem(uuid.uuid4().hex[:10], 'result', self._finished_by.id if self._finished_by else '',
                                title, summary, {'goal': goal['text'], 'workspace': goal['workspace'],
                                                     'document': self._document,
                                                     'cost': round(spend, 4), 'status': status, 'mission': goal['id'],
                                                     'rating': '',
                                                     'cards': [{'id': c['id'], 'title': c['title'], 'name': c['name'],
                                                                'status': c['status'], 'attempts': c['attempts']}
                                                               for c in self.cards.values()],
                                                     'team': [{'id': m.id, 'name': m.name, 'model': m.model or '',
                                                               'cost': round(m.cost, 4), 'helper_calls': m.helper_calls,
                                                               'helper_cost': round(m.helper_cost, 4)}
                                                              for m in sorted(self.members.values(), key=lambda m: -m.cost)],
                                                     'check': None, 'checking': self.engine.setting('checks', 'enabled')}))
        self.emit('goal_end', status=status, text=clip(summary, 160))
        if self.engine.output:
            asyncio.get_running_loop().create_task(self._save_copy(result))
        if self.engine.setting('checks', 'enabled'):
            self.engine.queue_check(goal['id'])

    async def _save_copy(self, result: InboxItem) -> None:
        """Copy the goal's files into the owner's output folder, and note where (shown on the result)."""
        goal = self.goal
        assert goal is not None
        try:
            dest = await asyncio.to_thread(copy_result, self.workspace, Path(self.engine.output),
                                           result_folder_name(goal['text'], goal['started']),
                                           Path(self.saved_to) if self.saved_to else None)
        except OSError as e:
            result.data['saved_error'] = f'Could not copy the files to the output folder: {e}'
            return
        if dest is None:
            return
        result.data['saved_to'] = self.saved_to = str(dest)
        row = self.store.mission(goal['id'])
        self.store.update_mission(goal['id'], state={**((row or {}).get('state') or {}), 'saved_to': str(dest)})

    # ── estimated usage of a plan (shown before approving) ─────────────────
    def estimate(self, tasks: list[dict[str, Any]]) -> dict[str, Any]:
        """Expected usage of a plan: per card, what past passed cards of that size used (median, all companies;
        starting guesses until there are 3 of a size), plus the manager's reviews. In % of the 5-hour window once
        the office has measured its usage; the API-equivalent cost is the underlying measure."""
        history: dict[str, list[float]] = {'S': [], 'M': [], 'L': []}
        for r in self.store.tasks('', 0):
            if r['status'] == 'passed' and r['cost'] and r['size'] in history:
                history[r['size']].append(float(r['cost']))
        per_card = {size: (sorted(v)[len(v) // 2] if len(v) >= 3 else CARD_COST_DEFAULT[size]) for size, v in history.items()}
        usd = sum(per_card.get(t.get('size', 'M'), per_card['M']) for t in tasks) * (1 + REVIEW_SHARE)
        return {'usd': round(usd, 4), 'pct': self.engine.as_pct(usd),
                'from_history': any(len(v) >= 3 for v in history.values())}

    # ── progress and estimated finish ─────────────────────────────────────
    def _pace(self) -> dict[str, float]:
        """Expected seconds from assignment to hand-in, per card size: the median of your past passed cards
        (all companies), scaled from the overall median when a size has little history, else defaults."""
        times: dict[str, list[float]] = {'S': [], 'M': [], 'L': []}
        for r in self.store.tasks('', 0):
            if r['status'] == 'passed' and r['seconds'] and r['size'] in times:
                times[r['size']].append(float(r['seconds']))
        median = lambda v: sorted(v)[len(v) // 2]  # noqa: E731
        pace = dict(PACE_DEFAULT)
        everything = [t for v in times.values() for t in v]
        if len(everything) >= 3:
            scale = median(everything) / PACE_DEFAULT['M']
            pace = {k: v * scale for k, v in PACE_DEFAULT.items()}
        for size, v in times.items():
            if len(v) >= 3:
                pace[size] = median(v)
        return pace

    def progress(self) -> dict[str, Any]:
        """Per hub: how far its cards are (weighted by size) and when they should be done. A card's estimate
        is its expected time minus time spent; a waiting card starts when the cards it waits for are done."""
        now = time.time()
        pace = self.pace or PACE_DEFAULT
        weight = {'S': 1.0, 'M': 2.0, 'L': 4.0}
        ends: dict[str, float] = {}

        def end(card: dict[str, Any]) -> float:  # seconds from now until this card is passed (estimate)
            if card['id'] in ends:
                return ends[card['id']]
            expected = pace.get(card['size'], pace['M'])
            status = card['status']
            if status == 'passed':
                value = 0.0
            elif status == 'submitted':
                value = REVIEW_SECONDS
            elif status == 'waiting':
                before = [self.cards[i] for i in card['after_ids'] if i in self.cards]
                before += [c for c in self.cards.values() if c['hub_id'] in card.get('wait_hubs', [])]
                start = max((end(c) for c in before), default=0.0)
                value = start + expected + REVIEW_SECONDS
            else:  # assigned, rework, blocked: in progress
                spent = now - (card.get('submitted_at') if status == 'rework' and card.get('submitted_at') else card['assigned_at'])
                if status == 'rework':
                    expected *= 0.5
                value = max(expected - spent, expected * 0.15) + REVIEW_SECONDS
            ends[card['id']] = value
            return value

        def done_part(card: dict[str, Any]) -> float:
            status = card['status']
            if status == 'passed':
                return 1.0
            if status == 'submitted':
                return 0.9
            if status == 'waiting':
                return 0.0
            expected = pace.get(card['size'], pace['M'])
            spent = now - card['assigned_at']
            return min(0.8, 0.8 * spent / expected) * (0.6 if status == 'rework' else 1.0)

        hubs: dict[str, dict[str, Any]] = {}
        for card in self.cards.values():
            h = hubs.setdefault(card['hub_id'], {'cards': 0, 'passed': 0, 'w': 0.0, 'done': 0.0, 'eta': 0.0})
            w = weight.get(card['size'], 2.0)
            h['cards'] += 1
            h['passed'] += card['status'] == 'passed'
            h['w'] += w
            h['done'] += w * done_part(card)
            h['eta'] = max(h['eta'], end(card))
        out = {}
        for hub_id, h in hubs.items():
            out[hub_id] = {'cards': h['cards'], 'passed': h['passed'], 'pct': round(100 * h['done'] / h['w']),
                           'eta_s': round(h['eta']), 'planning': False}
        for dept_id, item in self.pending_plans.items():  # a plan waiting for you: 0%, no estimate yet
            out.setdefault(dept_id, {'cards': len(item.data['tasks']), 'passed': 0, 'pct': 0, 'eta_s': None, 'planning': True})
        planning = {self.lead_dept_id} | {m.dept['id'] for m in self.members.values() if m.manager}  # asked, no cards yet
        for dept_id in planning:
            out.setdefault(dept_id, {'cards': 0, 'passed': 0, 'pct': 0, 'eta_s': None, 'planning': True})
        return out

    def save_cards(self) -> None:
        """Store this goal's task cards as KPI rows."""
        if not self.goal:
            return
        rows = []
        for c in self.cards.values():
            m = self.members.get(c['intern'])
            cost = c['cost'] if c['submitted_at'] and not c.get('cost_pending') else (m.cost - c['cost_start'] if m else 0.0)
            end = c['finished_at'] or c['submitted_at']
            rows.append({'company': self.company.get('id', ''), 'card': c['id'], 'hub': c['hub'], 'intern': c['name'],
                         'model': (m.model if m else '') or '', 'title': c['title'], 'size': c['size'],
                         'status': c['status'], 'attempts': c['attempts'], 'checks_met': c['criteria_met'],
                         'checks_total': c.get('criteria_total') or len(c['done_when']), 'cost': round(max(cost, 0.0), 5),
                         'seconds': round(end - c['assigned_at'], 1) if end else None, 'created_at': c['assigned_at']})
        self.store.save_tasks(self.goal['id'], self.prior_tasks + rows)

    def saved_state(self) -> dict[str, Any]:
        """What is kept of the goal: its cards (for the goal checker, and for continuing it later), its document,
        hubs and limit, and the agents' sessions."""
        cards = [{k: c.get(k) for k in ('id', 'title', 'name', 'status', 'attempts', 'goal', 'deliverable', 'done_when',
                                        'summary', 'files')} for c in self.cards.values()]
        return {'members': {m.id: {'session_id': m.session_id, 'started': m.started} for m in self.members.values()},
                'cards': self.prior_cards + cards, 'document': self._document, 'hubs': list(self.hubs),
                'lead': self.lead_dept_id, 'limit_pct': self.goal.get('limit_pct') if self.goal else None,
                **({'saved_to': self.saved_to} if self.saved_to else {})}

    def on_shutdown(self) -> None:
        """The app is closing mid-goal: keep what was done, so the goal can be continued later."""
        if self.active:
            self.save_cards()
            self.store.update_mission(self.goal['id'], status='interrupted', cost=self.total_cost(),  # type: ignore[index]
                                      duration_s=self.working_seconds(), state=self.saved_state())

    # ── what the browser sees ─────────────────────────────────────────────
    def summary(self) -> dict[str, Any]:
        goal = {k: self.goal[k] for k in ('id', 'text', 'dept', 'budget', 'workspace', 'status', 'summary')}  # type: ignore[index]
        used = self.usage_pct()
        goal.update(spend=round(self.spend(), 4), paused=self.on_hold, held=self.held, hubs=list(self.hubs),
                    live=sum(1 for m in self.members.values() if m.status in ('working', 'waiting')),
                    usage_pct=None if used is None else round(used, 2), limit_pct=self.goal.get('limit_pct'))  # type: ignore[union-attr]
        return goal

    def people(self) -> dict[str, Any]:
        return {m.id: {'status': m.status, 'activity': m.activity, 'cost': round(m.cost, 4), 'model': m.model or '',
                       'usage_pct': self.engine.as_pct(m.cost),
                       'helper_calls': m.helper_calls, 'helper_cost': round(m.helper_cost, 4), 'goal': self.id}
                for m in self.members.values()}

    def card_rows(self) -> list[dict[str, Any]]:
        return [{'id': c['id'], 'title': c['title'], 'intern': c['intern'], 'name': c['name'], 'hub': c['hub'],
                 'status': c['status'], 'attempts': c['attempts'], 'after': c.get('after_ids', []), 'goal': self.id}
                for c in self.cards.values()]


class OfficeEngine:
    """Runs the goals. Several goals can run at once and a goal can go to several hubs, but each hub works on one
    goal at a time (its people can't be in two places). All goals share the owner's inbox, the stream of events
    the office animates, and the limit on open Claude sessions."""

    def __init__(self, store: Store, model: str | None = None, library: Library | None = None) -> None:
        self.store = store
        self.model = model
        self.library = library
        self.notebooks = Notebooks(store)
        self.settings = app_settings.load(store)
        self.output: str = store.setting('output_folder') or ''  # a copy of each finished goal's files goes here
        self.runs: dict[int, GoalRun] = {}  # by goal (mission) id: running ones, and recently ended ones
        self.goal_user: dict[int, str] = {}  # goal id → the account that gave it (for filtering the view)
        self.inbox: list[InboxItem] = []
        self.events: deque[dict[str, Any]] = deque(maxlen=600)
        self._seq = 0
        self.slots = Slots(self.setting('performance', 'agents_at_once'))
        # ── the owner's Claude plan usage (from the rate-limit info every session reports) ──
        self.plan = False  # always an API key here (api_key.py): work is billed in dollars, with no plan windows
        self.five_hour: dict[str, Any] | None = None  # {'pct': 0-100, 'resets_at': unix time}
        self.seven_day: dict[str, Any] | None = None
        self.plan_status = ''          # allowed | allowed_warning | rejected
        self.usage_at = 0.0            # when the last reading came in
        self.spent_total = 0.0         # API-equivalent cost of all work since start (a measure of work, not a charge)
        self._last = (None, 0.0)       # (5-hour % , spent_total) at the previous reading, for calibration
        cal = store.setting('usage_calibration') or {}
        self.cal_pct, self.cal_usd = float(cal.get('pct', 0.0)), float(cal.get('usd', 0.0))
        self.paused = False            # plan-wide hold (a usage limit was reached)
        self._resume = asyncio.Event()
        self._resume.set()
        self._probing = False
        self.claude_version = ''       # the Claude Code version on this computer (from the usage check)
        # this computer's connection to Claude: checking | plan | api_key | signed_out | missing | unreachable
        self.claude = 'checking'
        # ── goal checks (goal_check.py): how close each finished goal got to what you asked ──
        self.checker = GoalChecker(store, model=model, library=library)
        self.checking: set[int] = set()  # goals being checked right now
        self._check_lock: asyncio.Lock | None = None

    def queue_check(self, mission_id: int) -> bool:
        """Check a goal against what you asked, in the background (one check at a time). False if already queued."""
        if mission_id in self.checking:
            return False
        self.checking.add(mission_id)
        asyncio.get_running_loop().create_task(self._check(mission_id))
        return True

    async def _check(self, mission_id: int) -> None:
        if self._check_lock is None:
            self._check_lock = asyncio.Lock()
        try:
            async with self._check_lock:
                await asyncio.sleep(2)  # let the team's sessions close first
                try:
                    result = await self.checker.check(mission_id)
                except Exception as e:  # offline, a crash…: keep a note so you can try again
                    result = {'score': None, 'verdict': 'unchecked', 'requirements': [], 'missing': [], 'error': True,
                              'summary': f'The check could not run ({type(e).__name__}). Try again.', 'checked_at': time.time()}
                self.spent_total += float(result.get('cost') or 0.0)
                self.store.save_check(mission_id, result)
                for item in self.inbox:  # the result in the inbox shows the verdict
                    if item.kind == 'result' and item.data.get('mission') == mission_id:
                        item.data.update(check=brief(result), checking=False)
                self.emit('goal_checked', gid=mission_id, score=result.get('score'), verdict=result.get('verdict'))
        finally:
            self.checking.discard(mission_id)

    @property
    def active(self) -> bool:
        return any(r.active for r in self.runs.values())

    # ── Claude plan usage ─────────────────────────────────────────────────
    @property
    def pct_per_usd(self) -> float | None:
        """Measured: % of the 5-hour window per dollar of API-equivalent work (needs a few % of data)."""
        return self.cal_pct / self.cal_usd if self.cal_pct >= CALIBRATE_MIN_PCT and self.cal_usd > 0 else None

    def as_pct(self, usd: float) -> float | None:
        ratio = self.pct_per_usd
        return round(usd * ratio, 2) if self.plan and ratio else None

    def on_rate_limit(self, raw: dict[str, Any]) -> None:
        """An API key has no plan windows to read, so these readings are ignored."""

    def check_limits(self) -> None:
        if self.paused or not self.active:
            return
        five, week = (self.five_hour or {}).get('pct', 0), (self.seven_day or {}).get('pct', 0)
        reason = ('Claude reports that the plan limit is reached.' if self.plan_status == 'rejected' else
                  f'5-hour usage reached {five:.0f}% (pause limit: {self.limits["five_hour"]}%).'
                  if five >= self.limits['five_hour'] else
                  f'Weekly usage reached {week:.0f}% (pause limit: {self.limits["seven_day"]}%).'
                  if week >= self.limits['seven_day'] else '')
        if reason:
            self.paused = True
            self._resume.clear()
            asyncio.get_running_loop().create_task(self._usage_hold(reason))
        for run in self.runs.values():
            run.on_spend()  # each goal's own limit, with the new reading

    async def _usage_hold(self, reason: str) -> None:
        resets = (self.five_hour or {}).get('resets_at')
        item = InboxItem(uuid.uuid4().hex[:10], 'usage', '', 'Paused: usage limit reached',
                         f'{reason} All goals are paused (replies already under way finish first).'
                         + (f' The 5-hour window resets at {datetime.fromtimestamp(resets):%H:%M}.' if resets else ''),
                         {'five_hour': self.five_hour, 'seven_day': self.seven_day, 'limits': dict(self.limits)},
                         asyncio.get_running_loop().create_future())
        self.inbox.append(item)
        self.emit('notice', text='Paused: usage limit reached, see Inbox')
        decision = await item.future
        self.inbox = [i for i in self.inbox if i is not item]
        if isinstance(decision, dict):  # continue, with the limits raised
            self.set_limits(decision)
            self.paused = False
            self._resume.set()
        else:
            self.paused = False
            self._resume.set()
            self.stop(reason='Stopped at the plan usage limit')

    @property
    def limits(self) -> dict[str, Any]:
        return {k: self.settings['usage'][k] for k in ('five_hour', 'seven_day')}

    def setting(self, section: str, key: str) -> Any:
        return self.settings[section][key]

    def save_settings(self, changes: dict[str, Any]) -> dict[str, Any]:
        self.settings = app_settings.save(self.store, changes)
        self.slots.resize(self.setting('performance', 'agents_at_once'))
        self.check_limits()
        if self.setting('plans', 'auto_approve'):  # turned on: the plans already waiting are approved too
            for run in list(self.runs.values()):
                for item in list(run.pending_plans.values()):
                    run.auto_approve(item)
        return self.settings

    def set_output(self, folder: str) -> str:
        """Set the output folder ('' turns it off). Raises ValueError for a folder that can't be used."""
        folder = folder.strip().strip('"')
        if folder:
            problem = output_problem(folder)
            if problem:
                raise ValueError(problem)
            folder = str(Path(folder).expanduser().resolve())
        self.output = folder
        self.store.save_setting('output_folder', folder)
        return folder

    def set_limits(self, limits: dict[str, Any]) -> dict[str, Any]:
        self.save_settings({'usage': {k: limits[k] for k in ('five_hour', 'seven_day') if k in limits}})
        return self.usage()

    async def refresh_usage(self, force: bool = False) -> None:
        """Ask Claude for a fresh reading with a tiny Haiku call (no tools), unless one came in recently."""
        if not have_key():  # never fall back to a Claude plan login on this computer
            self.claude = 'signed_out'
            return
        if self._probing or (not force and time.time() - self.usage_at < USAGE_FRESH):
            return
        self._probing = True
        signed_out = failed = False
        try:
            opts = ClaudeAgentOptions(model='claude-haiku-4-5', max_turns=1, tools=[], setting_sources=[],
                                      system_prompt='Reply with one word.', env=NO_TOOL_SEARCH)
            require_key()
            async with ClaudeSDKClient(options=opts) as client:
                await client.query('ok')
                async for msg in client.receive_response():
                    if isinstance(msg, SystemMessage) and msg.subtype == 'init':
                        self.claude_version = str(msg.data.get('claude_code_version') or '')
                        if msg.data.get('apiKeySource') not in (None, 'none'):
                            self.plan = False  # an API key: no plan windows; costs are real dollars
                    elif isinstance(msg, AssistantMessage):  # nobody is signed in to Claude on this computer
                        signed_out |= getattr(msg, 'error', None) == 'authentication_failed'
                    elif isinstance(msg, RateLimitEvent):
                        self.on_rate_limit(msg.rate_limit_info.raw)
                    elif isinstance(msg, ResultMessage):
                        self.spent_total += msg.total_cost_usd or 0.0
                        failed = bool(msg.is_error)
            if signed_out:
                self.claude = 'signed_out'
            elif failed:  # offline, or Claude refused the check: keep the last reading
                self.claude = self.claude if self.claude in ('plan', 'api_key') else 'unreachable'
            elif not self.plan:
                self.plan, self.claude = False, 'api_key'
        except CLINotFoundError:
            self.claude = 'missing'
        except Exception:  # the check could not run: keep the last reading
            self.claude = self.claude if self.claude in ('plan', 'api_key') else 'unreachable'
        finally:
            self._probing = False

    def usage(self) -> dict[str, Any]:
        return {'plan': self.plan, 'claude': self.claude,
                'five_hour': self.five_hour, 'seven_day': self.seven_day, 'status': self.plan_status,
                'updated': self.usage_at, 'limits': dict(self.limits), 'pct_per_usd': self.pct_per_usd,
                'paused': self.paused}

    def emit(self, kind: str, **data: Any) -> None:
        self._seq += 1
        self.events.append({'seq': self._seq, 'kind': kind, 'at': time.time(), **data})

    def hub_goal(self, dept_id: str) -> GoalRun | None:
        """The running goal a hub works on, if any."""
        return next((r for r in self.runs.values() if r.active and dept_id in r.hubs), None)

    def start_goal(self, company: dict[str, Any], text: str, hub_ids: list[str], budget: float, lead: str = '',
                   limit_pct: float | None = None, user: dict[str, Any] | None = None,
                   agreed: dict[str, Any] | None = None, draft_cost: float = 0.0) -> str | None:
        """Give a goal to one or more hubs, with a usage limit: limit_pct (% of the 5-hour plan window) on a Claude
        plan, or budget (dollars) with an API key. Returns an error message, or None."""
        text = text.strip()
        if not text:
            return 'Describe the goal first.'
        problem, hubs = self._can_start(company, hub_ids, user)
        if problem:
            return problem
        run = GoalRun(self)
        run.user_id = (user or {}).get('id', '')
        run.start(company, text, hubs, lead if lead in hubs else hubs[0], max(float(budget or 0), 0.05),
                  min(max(float(limit_pct), 0.5), 100.0) if limit_pct else None,
                  agreed=requirements.clean(agreed), draft_cost=max(float(draft_cost or 0), 0.0))
        self.runs[run.id] = run
        return None

    def _can_start(self, company: dict[str, Any], hub_ids: list[str],
                   user: dict[str, Any] | None) -> tuple[str | None, list[str]]:
        """(why a goal can't start now, or None; the hubs it would go to)."""
        if user is not None and user.get('claude') != 'plan':
            return ('This account is not connected to Claude yet. Goals currently run on the owner\'s API key, '
                    'which only the owner\'s account may use.'), []
        if not have_key():
            return NOT_CONNECTED['signed_out'], []
        if self.claude in NOT_CONNECTED:
            return NOT_CONNECTED[self.claude], []
        most = self.setting('performance', 'goals_at_once')
        if sum(r.active for r in self.runs.values()) >= most:
            return f'{most} goals are already running (Settings → Memory & performance). Wait for one, or stop one.', []
        known = {d['id']: d for d in company['departments']}
        hubs = list(dict.fromkeys(h for h in hub_ids if h in known))
        if not hubs:
            return 'Pick at least one hub.', []
        empty = [known[h]['name'] for h in hubs if not known[h]['interns']]
        if empty:
            return f'{", ".join(empty)} has no mini agents yet. Add some in the Workspace panel first.', []
        busy = [f'{known[h]["name"]} (on "{clip(self.hub_goal(h).goal["text"], 40)}")' for h in hubs if self.hub_goal(h)]
        if busy:
            return f'Busy with another goal: {", ".join(busy)}. Pick other hubs, or wait.', []
        return None, hubs

    def continue_goal(self, company: dict[str, Any], mission_id: int, user: dict[str, Any] | None = None) -> str | None:
        """Pick a stopped, ended or interrupted goal up again: the same goal, folder and hubs, with a brief of what
        was done (cards, files) so the managers plan only what is left. A fresh usage limit applies to this run.
        Returns an error message, or None."""
        goal = self.store.mission(mission_id)
        if not goal:
            return 'No such goal.'
        if goal.get('company') != company.get('id'):
            return 'This goal belongs to another workspace. Switch to that workspace first.'
        if goal['status'] not in CONTINUABLE:
            return 'Only a stopped, ended or interrupted goal can be continued.'
        if mission_id in self.runs and self.runs[mission_id].active:
            return 'That goal is already running.'
        state = goal.get('state') or {}
        known = {d['id'] for d in company['departments']}
        by_name = {d['name']: d['id'] for d in company['departments']}
        hubs = [h for h in state.get('hubs') or [] if h in known] or \
            [by_name[n.strip()] for n in (goal.get('preset') or '').split(',') if n.strip() in by_name]
        if not hubs:
            return 'The hubs that worked on this goal are gone. Start it as a new goal instead.'
        problem, hubs = self._can_start(company, hubs, user)
        if problem:
            return problem
        lead = state.get('lead') if state.get('lead') in hubs else hubs[0]
        workspace = WORKSPACES.parent / goal['workspace']
        start = next((e['data'] for e in self.store.events(mission_id) if e['kind'] == 'mission_start'), {})
        limit_pct = state.get('limit_pct') or (self.setting('usage', 'goal_default') if self.plan else None)
        cards = [c for c in state.get('cards') or [] if isinstance(c, dict)]
        self.inbox = [i for i in self.inbox if not (i.kind == 'result' and i.goal == mission_id)]
        run = GoalRun(self)
        run.user_id = (user or {}).get('id', '')
        run.start(company, goal['goal'], hubs, lead, max(float(goal.get('budget') or 0), 0.05),
                  min(max(float(limit_pct), 0.5), 100.0) if limit_pct else None,
                  agreed=requirements.clean(start.get('agreed')),
                  earlier={'id': mission_id, 'workspace': goal['workspace'], 'state': state, 'cards': cards,
                           'tasks': self.store.mission_tasks(mission_id), 'cost': float(goal.get('cost') or 0),
                           'seconds': float(goal.get('duration_s') or 0), 'saved_to': state.get('saved_to') or '',
                           'document': state.get('document') or '',
                           'brief': continue_brief(goal, cards, workspace)})
        self.runs[run.id] = run
        return None

    def hold(self, goal_id: int, on: bool, user_id: str | None = None) -> str | None:
        """Pause (on) or resume one running goal of this account."""
        run = self.runs.get(goal_id)
        if run is None or user_id not in (None, run.user_id):
            return 'That goal is not running.'
        return run.hold(on)

    def answer(self, item_id: str, action: str, user_id: str | None = None, **extra: Any) -> str | None:
        """The owner's decision on an inbox item (only their own, when user_id is given). An error message, or None."""
        item = next((i for i in self.inbox if i.id == item_id and (user_id is None or i.user in ('', user_id))), None)
        if item is None:
            return 'That item is gone (already answered, or the goal ended).'
        if not item.open:  # an update or result: just dismiss it
            self.inbox.remove(item)
            return None
        if item.kind == 'plan':
            run = self.runs.get(item.goal)
            return run._answer_plan(item, action, extra) if run else 'That goal has ended.'
        if item.kind == 'usage':  # continue with raised limits, or stop every goal
            limits = {k: extra[k] for k in ('five_hour', 'seven_day') if extra.get(k)}
            item.future.set_result(limits if action == 'continue' else False)  # type: ignore[union-attr]
        elif item.kind == 'command':
            item.future.set_result(True if action == 'approve' else (extra.get('note') or False))  # type: ignore[union-attr]
        elif item.kind == 'question':  # a manager's question: an option's number and/or the owner's own words
            choice = extra.get('choice')
            text = str(extra.get('text') or '').strip()[:1000]
            if not (isinstance(choice, int) and choice >= 1) and not text:
                return 'Pick an option or write an answer.'
            item.future.set_result({'choice': choice if isinstance(choice, int) else None, 'text': text})  # type: ignore[union-attr]
        elif item.kind == 'budget':
            amount = float(extra.get('amount') or 0)
            item.future.set_result(amount if action == 'raise' and amount > 0 else False)  # type: ignore[union-attr]
        return None

    def stop(self, goal_id: int | None = None, user_id: str | None = None, reason: str = 'Stopped manually') -> None:
        """Stop one goal, or every goal (of one account, when user_id is given)."""
        for run in list(self.runs.values()):
            if goal_id in (None, run.id) and user_id in (None, run.user_id):
                run.stop(reason)
        if not self.active:  # nothing left to hold: a usage hold ends too
            for item in self.inbox:
                if item.kind == 'usage' and item.open:
                    item.future.set_result(False)  # type: ignore[union-attr]

    def rate(self, mission_id: int, rating: str) -> str | None:
        """The owner's verdict on a finished goal (a KPI)."""
        if rating not in ('success', 'partial', 'failed', ''):
            return 'Unknown rating.'
        self.store.update_mission(mission_id, rating=rating)
        for item in self.inbox:
            if item.kind == 'result' and item.data.get('mission') == mission_id:
                item.data['rating'] = rating
        return None

    def on_shutdown(self) -> None:
        for run in self.runs.values():
            run.on_shutdown()

    def state(self, since: int = 0, user_id: str | None = None) -> dict[str, Any]:
        """What the office view shows: everything, or (user_id given) only that account's goals and inbox."""
        now = time.time()
        for r in self.runs.values():
            self.goal_user[r.id] = r.user_id
        # an ended goal stays on screen for a little while
        self.runs = {gid: r for gid, r in self.runs.items()
                     if r.active or now - (r.goal['ended'] or now) <= SHOW_ENDED}  # type: ignore[index]
        live = [r for r in self.runs.values() if r.active]
        current = [i for i in self.inbox if i.open or i.goal in {r.id for r in live}]
        self.inbox = [i for i in self.inbox if i not in current][-30:] + current  # keep some past updates and results
        mine = lambda uid: user_id is None or not uid or uid == user_id  # noqa: E731
        runs = [r for r in self.runs.values() if mine(r.user_id)]
        live = [r for r in live if mine(r.user_id)]
        return {
            'goals': [r.summary() for r in runs],
            'people': {k: v for r in live for k, v in r.people().items()},
            'inbox': [i.public() for i in self.inbox if mine(i.user)],
            'cards': [c for r in live for c in r.card_rows()],
            'progress': {k: {**v, 'goal': r.id} for r in live for k, v in r.progress().items()},
            'busy': {h: r.id for r in live for h in r.hubs},
            'usage': self.usage(),
            'events': [e for e in self.events if e['seq'] > since and mine(self.goal_user.get(e.get('gid'), ''))],
            'seq': self._seq,
        }
