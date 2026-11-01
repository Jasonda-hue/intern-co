"""
Shared files: documents the owner adds to a company (a paper, data, notes) that every hub's agents can read.

Each company has its own folder, library/<company id>/. Agents get read-only access: reading is free for
them, and every edit outside the goal's folder is refused by the office's permission gate, so the
owner's originals are never changed.

To keep prompts small, agents only see a list (name, size, the owner's note) and open the files they need.
Word (.docx) and PowerPoint (.pptx) files, which agents can't read directly, get a plain-text copy next to them;
so do PDFs (with pypdf), because a PDF read whole is large and costly while its text is small.
"""
from __future__ import annotations

import json
import re
import shutil
import struct
import time
import zipfile
import zlib
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

from paths import DATA

LIBRARY = DATA / 'library'
INDEX = '_index.json'
MAX_BYTES = 30 * 1024 * 1024
MAX_FILES = 60
NOTE_LIMIT = 300
TEXT_COPY = {'.docx', '.pptx'}  # unreadable as-is: we save a .txt copy
PICTURES = '.pictures'  # manuscript.pdf → manuscript.pdf.pictures/page11-1.png
MAX_PICTURES = 60
MIN_PICTURE = 48  # smaller ones are icons and logos
UNREADABLE = {'.xlsx', '.xls', '.doc', '.ppt', '.zip', '.7z', '.rar', '.exe', '.dll', '.bin', '.mp3', '.mp4', '.mov'}


def safe_name(name: str) -> str:
    name = Path(str(name).replace('\\', '/')).name.strip()
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', name).strip(' .')
    return name[:120] or 'file'


def pdf_text(path: Path) -> str:
    """The text of a PDF, page by page. Agents read this instead of the PDF: a PDF read whole arrives as page
    images (large and costly); its text is a fraction of the size. Empty for scanned PDFs (no text layer)."""
    try:
        from pypdf import PdfReader
    except ImportError:  # pip install pypdf
        return ''
    try:
        pages = PdfReader(str(path)).pages
        parts = [f'--- Page {i} ---\n{(p.extract_text() or "").strip()}' for i, p in enumerate(pages, 1)]
    except Exception:  # a damaged or encrypted PDF: agents read the original instead
        return ''
    text = '\n\n'.join(parts).strip()
    return text if len(text) > 40 * max(len(pages), 1) else ''  # mostly empty pages: a scan


def png(width: int, height: int, channels: int, pixels: bytes) -> bytes:
    """A PNG from raw 8-bit pixels (1 gray, 3 RGB or 4 RGBA channels), with the standard library only."""
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    row = width * channels
    raw = b''.join(b'\x00' + pixels[y * row:(y + 1) * row] for y in range(height))
    kind = {1: 0, 3: 2, 4: 6}[channels]
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, kind, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 6)) + chunk(b'IEND', b''))


def pdf_pictures(path: Path, out: Path) -> list[str]:
    """Save the pictures inside a PDF (photos and raster figures) as files agents can put in documents, named by
    page: page11-1.png. Pillow is not needed: JPEGs are saved as they are, and plain 8-bit gray or RGB pictures (with
    their transparency) become PNGs. Other kinds are skipped, and so are drawn (vector) figures, which are not
    pictures inside a PDF; an agent can redraw those or cite their page."""
    try:
        from pypdf import PdfReader
        pages = PdfReader(str(path)).pages
    except Exception:
        return []
    saved: list[str] = []
    for number, page in enumerate(pages, 1):
        try:
            xobjects = page['/Resources']['/XObject'].get_object()
        except (KeyError, TypeError, AttributeError):
            continue
        n = 0
        for ref in xobjects.values():
            if len(saved) >= MAX_PICTURES:
                return saved
            try:
                img = ref.get_object()
                if img.get('/Subtype') != '/Image' or min(img['/Width'], img['/Height']) < MIN_PICTURE:
                    continue
                width, height, filters = int(img['/Width']), int(img['/Height']), img.get('/Filter')
                filters = [str(f) for f in (filters if isinstance(filters, list) else [filters] if filters else [])]
                if filters == ['/DCTDecode']:
                    data, ext = img._data, 'jpg'
                else:
                    space = str(img.get('/ColorSpace'))
                    channels = {'/DeviceRGB': 3, '/DeviceGray': 1}.get(space)
                    if not channels or img.get('/BitsPerComponent') != 8 or '/DCTDecode' in filters or '/JPXDecode' in filters:
                        continue
                    pixels = img.get_data()
                    if len(pixels) < width * height * channels:
                        continue
                    pixels = pixels[:width * height * channels]
                    mask = img.get('/SMask')
                    alpha = mask.get_object().get_data() if mask is not None else b''
                    if channels == 3 and len(alpha) >= width * height:
                        rgba = bytearray(width * height * 4)
                        for c in range(3):
                            rgba[c::4] = pixels[c::3]
                        rgba[3::4] = alpha[:width * height]
                        pixels, channels = bytes(rgba), 4
                    data, ext = png(width, height, channels, pixels), 'png'
            except Exception:  # an unusual picture: skip it, keep the rest
                continue
            n += 1
            out.mkdir(parents=True, exist_ok=True)
            (out / f'page{number}-{n}.{ext}').write_bytes(data)
            saved.append(f'page{number}-{n}.{ext}')
    return saved


def office_text(path: Path) -> str:
    """The plain text of a .docx (paragraphs) or .pptx (slides)."""
    w = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
    a = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
    with zipfile.ZipFile(path) as z:
        if path.suffix.lower() == '.docx':
            root = ElementTree.fromstring(z.read('word/document.xml'))
            return '\n'.join(''.join(t.text or '' for t in p.iter(f'{w}t')) for p in root.iter(f'{w}p')).strip()
        slides = sorted((n for n in z.namelist() if re.fullmatch(r'ppt/slides/slide\d+\.xml', n)),
                        key=lambda n: int(re.search(r'\d+', n.rsplit('/', 1)[1]).group()))
        out = []
        for i, n in enumerate(slides, 1):
            root = ElementTree.fromstring(z.read(n))
            lines = [''.join(t.text or '' for t in p.iter(f'{a}t')) for p in root.iter(f'{a}p')]
            out.append(f'--- Slide {i} ---\n' + '\n'.join(l for l in lines if l.strip()))
        return '\n\n'.join(out).strip()


class Library:
    def __init__(self, root: Path = LIBRARY) -> None:
        self.root = root

    def folder(self, company_id: str) -> Path:
        return self.root / safe_name(company_id or 'default')

    def _index(self, company_id: str) -> dict[str, dict[str, Any]]:
        try:
            return json.loads((self.folder(company_id) / INDEX).read_text(encoding='utf-8'))
        except (OSError, ValueError):
            return {}

    def _save_index(self, company_id: str, index: dict[str, dict[str, Any]]) -> None:
        folder = self.folder(company_id)
        folder.mkdir(parents=True, exist_ok=True)
        (folder / INDEX).write_text(json.dumps(index, indent=1), encoding='utf-8')

    def list(self, company_id: str) -> list[dict[str, Any]]:
        self._upgrade(company_id)
        folder, index = self.folder(company_id), self._index(company_id)
        files = []
        for name, meta in index.items():
            path = folder / name
            if not path.is_file():
                continue
            read = folder / (meta.get('read_as') or name)
            files.append({'name': name, 'size': path.stat().st_size, 'added': meta.get('added', 0),
                          'read_size': read.stat().st_size if read.is_file() else path.stat().st_size,
                          'note': meta.get('note', ''), 'read_as': meta.get('read_as') or name,
                          'readable': meta.get('readable', True), 'path': str(path),
                          'pictures': meta.get('pictures', 0)})
        return sorted(files, key=lambda f: f['added'])

    def add(self, company_id: str, name: str, data: bytes, note: str = '') -> dict[str, Any]:
        if not data:
            raise ValueError('The file is empty.')
        if len(data) > MAX_BYTES:
            raise ValueError(f'Files can be up to {MAX_BYTES // (1024 * 1024)} MB.')
        index = self._index(company_id)
        if len(index) >= MAX_FILES:
            raise ValueError(f'A workspace can have up to {MAX_FILES} shared files. Remove one first.')
        folder = self.folder(company_id)
        folder.mkdir(parents=True, exist_ok=True)
        name = safe_name(name)
        if name == INDEX or name.endswith('.txt') and name[:-4] in index:  # never clash with our own files
            name = '_' + name
        stem, suffix = Path(name).stem, Path(name).suffix
        n = 2
        while name in index or (folder / name).exists():
            name, n = f'{stem} ({n}){suffix}', n + 1
        path = folder / name
        path.write_bytes(data)
        ext = suffix.lower()
        meta: dict[str, Any] = {'added': time.time(), 'note': str(note or '').strip()[:NOTE_LIMIT], 'readable': True}
        if ext in TEXT_COPY:
            try:
                text = office_text(path)
                (folder / f'{name}.txt').write_text(text, encoding='utf-8')
                meta['read_as'] = f'{name}.txt'
            except (zipfile.BadZipFile, KeyError, ElementTree.ParseError):
                meta['readable'] = False
        elif ext == '.pdf':
            self._pdf_copy(folder, name, meta)
        elif ext in UNREADABLE:
            meta['readable'] = False
        index[name] = meta
        self._save_index(company_id, index)
        return next(f for f in self.list(company_id) if f['name'] == name)

    @staticmethod
    def _pdf_copy(folder: Path, name: str, meta: dict[str, Any]) -> None:
        meta['pdf_checked'] = True
        text = pdf_text(folder / name)
        if text:
            (folder / f'{name}.txt').write_text(text, encoding='utf-8')
            meta['read_as'] = f'{name}.txt'
        Library._pdf_pictures(folder, name, meta)

    @staticmethod
    def _pdf_pictures(folder: Path, name: str, meta: dict[str, Any]) -> None:
        meta['pictures_checked'] = True
        meta['pictures'] = len(pdf_pictures(folder / name, folder / f'{name}{PICTURES}'))

    def _upgrade(self, company_id: str) -> None:
        """PDFs added before text copies (or picture folders) existed get them now."""
        index = self._index(company_id)
        changed = False
        for name, meta in index.items():
            if not name.lower().endswith('.pdf') or not (self.folder(company_id) / name).is_file():
                continue
            if not meta.get('pdf_checked'):
                self._pdf_copy(self.folder(company_id), name, meta)
                changed = True
            elif not meta.get('pictures_checked'):
                self._pdf_pictures(self.folder(company_id), name, meta)
                changed = True
        if changed:
            self._save_index(company_id, index)

    def set_note(self, company_id: str, name: str, note: str) -> None:
        index = self._index(company_id)
        if name not in index:
            raise ValueError('No such file.')
        index[name]['note'] = str(note or '').strip()[:NOTE_LIMIT]
        self._save_index(company_id, index)

    def remove(self, company_id: str, name: str) -> None:
        index = self._index(company_id)
        meta = index.pop(name, None)
        if meta is None:
            raise ValueError('No such file.')
        folder = self.folder(company_id)
        for victim in {name, meta.get('read_as') or name}:
            (folder / victim).unlink(missing_ok=True)
        shutil.rmtree(folder / f'{name}{PICTURES}', ignore_errors=True)
        self._save_index(company_id, index)

    def remove_company(self, company_id: str) -> None:
        shutil.rmtree(self.folder(company_id), ignore_errors=True)

    def prompt_section(self, company_id: str) -> str:
        """What agents are told about the shared files: a short list, not the contents."""
        files = self.list(company_id)
        if not files:
            return ''
        lines = []
        for f in files:
            n = f['read_size']
            size = f'{max(n / 1024, 1):.0f} KB' if n < 1024 * 1024 else f'{n / 1048576:.1f} MB'
            where = str(self.folder(company_id) / f['read_as'])
            line = f'  - {where} ({size})'
            if f['note']:
                line += f': {f["note"]}'
            if f['read_as'] != f['name'] and f['name'].lower().endswith('.pdf'):
                line += (f' [text of {f["name"]}, page by page; read this, not the PDF. Open the PDF itself '
                         f'({self.folder(company_id) / f["name"]}) only to look at a specific figure, with the pages '
                         'parameter, never whole]')
            if f['pictures']:
                line += (f' [{f["pictures"]} picture(s) from it, named by page (page11-1.png = page 11), ready to put in '
                         f'a document: {self.folder(company_id) / (f["name"] + PICTURES)}]')
            if not f['readable']:
                line += ' [this file type cannot be read]'
            lines.append(line)
        return ('Shared files from the owner (read-only, for every hub; open only the ones relevant to your work, '
                'and read long files in parts):\n' + '\n'.join(lines) + '\n')
