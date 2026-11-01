"""
Documents the owner reads: a team's Markdown turned into a finished page and a PDF.

Interns write reports and papers in Markdown (tables as Markdown tables, figures as image files, citations as [n]
with a numbered reference list at the end). make_document turns that into:
  - <name>.html: one self-contained page (every picture embedded, styled for reading and printing, Japanese fonts),
  - <name>.pdf: the same page printed by the computer's own browser (Edge or Chrome, run without a window).
Without such a browser (e.g. a Mac without Chrome) only the HTML is made; it opens in any browser.

The reference list is checked against the web pages the agents actually opened during the goal (the office logs
every WebFetch in the goal's _sources.json). A web reference nobody opened is marked in the document, so the owner
can see which sources were checked and which were not.
"""
from __future__ import annotations

import asyncio
import base64
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import markdown2

SOURCES_FILE = '_sources.json'  # in the goal's folder: the web pages and searches of the goal
PRINT_SECONDS = 120
REFERENCES = re.compile(r'^(#{1,6})\s*(\d+[.)]?\s*)?(references|bibliography|sources|works cited|参考文献|引用文献|出典)\b',
                        re.I | re.M)
URL = re.compile(r'https?://[^\s<>()\[\]"\'`]+')
IMAGE = re.compile(r'!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)')
CITATION = re.compile(r'\[\d+(?:[,–-]\s*\d+)*\]')
MIME = {'.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
        '.webp': 'image/webp'}

STYLE = '''
@page { size: A4; margin: 18mm 17mm 20mm; }
:root { color-scheme: light; }
body { font: 10.5pt/1.65 "Segoe UI", "Yu Gothic UI", "Yu Gothic", YuGothic, Meiryo, "Hiragino Sans", "Noto Sans JP",
       system-ui, sans-serif; color: #1f2329; background: #fff; max-width: 820px; margin: 32px auto; padding: 0 24px; }
@media print { body { margin: 0; padding: 0; max-width: none; } }
h1 { font-size: 21pt; line-height: 1.25; margin: 0 0 6px; }
h2 { font-size: 14.5pt; margin: 26px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #dfe2e6; }
h3 { font-size: 12pt; margin: 20px 0 6px; }
h4, h5, h6 { font-size: 10.5pt; margin: 16px 0 4px; }
h1, h2, h3, h4 { break-after: avoid; }
p, li { orphans: 3; widows: 3; }
a { color: #2f5d8c; text-decoration: none; overflow-wrap: anywhere; }
table { border-collapse: collapse; width: 100%; margin: 12px 0 16px; font-size: 9.5pt; break-inside: avoid; }
th, td { border: 1px solid #cfd4da; padding: 5px 8px; text-align: left; vertical-align: top; }
th { background: #f1f3f5; font-weight: 600; }
tr:nth-child(even) td { background: #fafbfc; }
figure { margin: 16px 0; text-align: center; break-inside: avoid; }
figure img, p img { max-width: 100%; max-height: 165mm; }
figcaption { font-size: 9pt; color: #555c66; margin-top: 6px; }
pre { background: #f6f8fa; border: 1px solid #e3e6ea; border-radius: 6px; padding: 10px 12px; font-size: 8.8pt;
      white-space: pre-wrap; break-inside: avoid; }
code { font-family: Consolas, "Cascadia Mono", Menlo, monospace; font-size: 0.92em; }
blockquote { margin: 12px 0; padding: 2px 14px; border-left: 3px solid #cfd4da; color: #4a515b; }
hr { border: 0; border-top: 1px solid #dfe2e6; margin: 22px 0; }
.references li, .references p { font-size: 9.5pt; }
.unverified { color: #a8541d; font-size: 8.5pt; white-space: nowrap; }
.missing { color: #a8541d; border: 1px dashed #d9a37f; padding: 18px; font-size: 9pt; }
'''


def japanese(text: str) -> bool:
    return bool(re.search(r'[぀-ヿ一-鿿]', text))


# ── the sources a goal used ────────────────────────────────────────────────
def norm_url(url: str) -> str:
    """A URL compared loosely: no scheme, no "www.", no fragment, no trailing slash or punctuation."""
    url = url.strip().rstrip('.,;:')
    parts = urlsplit(url)
    host = parts.netloc.lower().removeprefix('www.')
    return (host + parts.path.rstrip('/') + (f'?{parts.query}' if parts.query else '')).lower()


def load_sources(workspace: Path) -> dict[str, Any]:
    try:
        data = json.loads((workspace / SOURCES_FILE).read_text(encoding='utf-8'))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def opened(url: str, pages: set[str]) -> bool:
    """Whether a cited URL is one of the pages opened during the goal (or the same page without its query)."""
    key = norm_url(url)
    return key in pages or key.split('?')[0] in {p.split('?')[0] for p in pages}


def references_span(text: str) -> tuple[int, int] | None:
    """Where the reference list is (start, end) in the Markdown, or None."""
    m = None
    for m in REFERENCES.finditer(text):
        pass  # the last such heading: an earlier one may be an outline that mentions "Sources"
    if not m:
        return None
    level = len(m.group(1))
    nxt = re.compile(rf'^#{{1,{level}}}\s', re.M).search(text, m.end())
    return m.start(), nxt.start() if nxt else len(text)


def check_references(text: str, pages: set[str], ja: bool) -> tuple[str, dict[str, Any]]:
    """(the Markdown with unopened web references marked, a summary of the check)."""
    span = references_span(text)
    summary: dict[str, Any] = {'has_references': bool(span), 'cites': len(CITATION.findall(text)), 'web': 0,
                               'unopened': []}
    if not span:
        return text, summary
    start, end = span
    mark = ('<span class="unverified">⚠ この目標の作業中に開かれていないページ</span>' if ja
            else '<span class="unverified">⚠ not opened during this goal</span>')
    lines = []
    for line in text[start:end].split('\n'):
        urls = URL.findall(line)
        summary['web'] += len(urls)
        missing = [u.rstrip('.,;:') for u in urls if not opened(u, pages)]
        summary['unopened'] += missing
        lines.append(f'{line} {mark}' if missing else line)
    return text[:start] + '\n'.join(lines) + text[end:], summary


# ── Markdown to HTML ───────────────────────────────────────────────────────
def inside(path: Path, roots: list[Path]) -> bool:
    path = path.resolve()
    return any(path.is_relative_to(r.resolve()) for r in roots)


def embed_images(text: str, base: Path, roots: list[Path], ja: bool) -> tuple[str, list[str]]:
    """Every picture becomes part of the page (a data: URL), so the HTML and PDF stand alone. Pictures may come
    only from the goal's folder or the shared files. Returns (the Markdown, the pictures that could not be found)."""
    missing: list[str] = []

    def one(m: re.Match[str]) -> str:
        alt, src = m.group(1), m.group(2)
        if re.match(r'(https?:|data:)', src):
            return m.group(0)
        path = Path(src) if Path(src).is_absolute() else base / src
        kind = MIME.get(path.suffix.lower())
        if not kind or not path.is_file() or not inside(path, roots):
            missing.append(src)
            note = f'図が見つかりません: {src}' if ja else f'Figure not found: {src}'
            return f'<div class="missing">{html.escape(note)}</div>'
        data = base64.b64encode(path.read_bytes()).decode('ascii')
        return f'![{alt}](data:{kind};base64,{data})'

    return IMAGE.sub(one, text), missing


def figures(body: str) -> str:
    """A picture alone in its paragraph becomes a figure with its caption (the image's alt text)."""
    def one(m: re.Match[str]) -> str:
        img = m.group(1)
        alt = re.search(r'alt="([^"]*)"', img)
        caption = f'<figcaption>{alt.group(1)}</figcaption>' if alt and alt.group(1).strip() else ''
        return f'<figure>{img}{caption}</figure>'
    return re.sub(r'<p>\s*(<img [^>]+>)\s*</p>', one, body)


def to_html(text: str, title: str, ja: bool) -> str:
    # bare URLs become links (not ones already inside a Markdown link or an HTML attribute)
    text = re.sub(r'(?<![(<"=\w])(https?://[^\s<>()\[\]"\'`]+?)([.,;:]?)(?=\s|$)', r'<\1>\2', text, flags=re.M)
    body = markdown2.markdown(text, extras=['tables', 'fenced-code-blocks', 'header-ids', 'footnotes', 'strike',
                                            'cuddled-lists', 'code-friendly'])
    body = figures(body)
    span = re.search(r'(<h[1-6][^>]*>\s*(\d+[.)]?\s*)?(references|bibliography|sources|works cited|参考文献|引用文献|出典)\b)',
                     body, re.I)
    if span:  # the reference list gets its own (smaller) style
        body = body[:span.start()] + '<section class="references">' + body[span.start():] + '</section>'
    return (f'<!doctype html>\n<html lang="{"ja" if ja else "en"}"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width, initial-scale=1">'
            f'<title>{html.escape(title)}</title><style>{STYLE}</style></head>\n<body>\n{body}\n</body></html>\n')


# ── HTML to PDF, with the computer's own browser ──────────────────────────
def browser_program() -> str:
    """The path of a Chromium browser that can print a page to PDF without a window ('' if none)."""
    for cmd in ('msedge', 'google-chrome', 'chromium', 'chromium-browser', 'chrome'):
        found = shutil.which(cmd)
        if found:
            return found
    if os.name == 'nt':
        for root in (os.environ.get('ProgramFiles(x86)'), os.environ.get('ProgramFiles'), os.environ.get('LOCALAPPDATA')):
            for rel in ('Microsoft/Edge/Application/msedge.exe', 'Google/Chrome/Application/chrome.exe'):
                if root and Path(root, rel).is_file():
                    return str(Path(root, rel))
    if sys.platform == 'darwin':
        for program in ('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
                        '/Applications/Chromium.app/Contents/MacOS/Chromium'):
            if Path(program).is_file():
                return program
    return ''


def print_pdf(page: Path, pdf: Path) -> str:
    """Print the page to a PDF. Returns '' on success, else what went wrong. Runs in its own, empty browser profile,
    so it never touches (or waits for) a browser the owner has open."""
    program = browser_program()
    if not program:
        return 'no Edge or Chrome on this computer, so only the HTML page was made'
    pdf.unlink(missing_ok=True)
    with tempfile.TemporaryDirectory(prefix='interncoprint-') as profile:
        command = [program, '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
                   '--disable-extensions', f'--user-data-dir={profile}', '--no-pdf-header-footer',
                   '--print-to-pdf-no-header', f'--print-to-pdf={pdf}', page.resolve().as_uri()]
        try:
            subprocess.run(command, timeout=PRINT_SECONDS, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        except subprocess.TimeoutExpired:
            return 'the browser took too long to print the PDF'
        except OSError as e:
            return f'the browser could not be started ({e})'
    return '' if pdf.is_file() and pdf.stat().st_size > 0 else 'the browser did not produce a PDF'


# ── the whole job ──────────────────────────────────────────────────────────
def make(source: Path, workspace: Path, roots: list[Path]) -> dict[str, Any]:
    """Turn a Markdown file into <name>.html and <name>.pdf next to it. Returns what was made and checked."""
    text = source.read_text(encoding='utf-8', errors='replace')
    ja = japanese(text)
    pages = {norm_url(u) for u in load_sources(workspace).get('pages', [])}
    checked, refs = check_references(text, pages, ja)
    checked, missing = embed_images(checked, source.parent, [workspace, *roots], ja)
    title = next((m.group(1).strip() for m in re.finditer(r'^#\s+(.+)$', text, re.M)), source.stem)
    page = source.with_suffix('.html')
    page.write_text(to_html(checked, re.sub(r'[*_`]', '', title), ja), encoding='utf-8')
    pdf = source.with_suffix('.pdf')
    problem = print_pdf(page, pdf)
    return {'html': page, 'pdf': None if problem else pdf, 'pdf_problem': problem, 'missing_images': missing,
            'images': len(IMAGE.findall(text)), 'tables': len(re.findall(r'^\s*\|?\s*:?-{3,}', text, re.M)), **refs}


async def make_async(source: Path, workspace: Path, roots: list[Path]) -> dict[str, Any]:
    """make() without holding up the office (the browser prints in a thread)."""
    return await asyncio.to_thread(make, source, workspace, roots)


def report(result: dict[str, Any], short_path: Any = str) -> str:
    """What the agent who asked for the document is told."""
    lines = [f'Made {short_path(result["html"])}' + (f' and {short_path(result["pdf"])}.' if result['pdf'] else
                                                     f'. No PDF: {result["pdf_problem"]}.'),
             f'It has {result["tables"]} table(s) and {result["images"]} picture(s).']
    if result['missing_images']:
        lines.append('Pictures not found (fix the paths; pictures must be inside the goal folder or the shared '
                     'files): ' + ', '.join(result['missing_images']))
    if not result['has_references']:
        lines.append('No reference list found (a heading such as "References" or "参考文献"). '
                     + ('The text has citations like [1] but nothing they point to.' if result['cites'] else
                        'If the document uses facts from sources, cite them [n] and list them at the end.'))
    elif result['unopened']:
        lines.append(f'{len(result["unopened"])} of {result["web"]} web reference(s) were never opened during this '
                     'goal, and are marked so in the document: ' + ', '.join(result['unopened'][:8]) +
                     '. Open each with WebFetch to confirm it says what you cite, or remove it, then make the '
                     'document again.')
    elif result['web']:
        lines.append(f'All {result["web"]} web reference(s) were opened during this goal.')
    if result['pdf']:
        lines.append('Check the PDF with Read (pages="1-3", and later pages as needed) before handing it in.')
    return '\n'.join(lines)
