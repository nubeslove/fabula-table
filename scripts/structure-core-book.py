"""Add text structure from the local core PDF's geometry; never package the PDF.

Keeps the previous raw text for comparison. Paragraphs, headings and table cells
are web text; ordering is derived from their source positions, not rewritten.
"""
from pathlib import Path
import json, re, hashlib, gzip
import pymupdf

ROOT = Path(__file__).resolve().parents[1]

def clean(text):
    return text.replace('\x00', '').replace('\uf077', '•').replace('çç', 'SL ').strip()

def join_text(parts):
    text = ''
    for part in parts:
        part = clean(part)
        if not part:
            continue
        if text and re.search(r'[A-Za-z0-9]$', text) and re.match(r'[A-Za-z0-9]', part):
            text += ' '
        text += part
    return text

def structure(page):
    lines = []
    for bi, block in enumerate(page.get_text('dict')['blocks']):
        for line in block.get('lines', []):
            text = clean(''.join('◆' if s['font'] == 'FnT_BasicShapes1' and s['text'].strip() == 'E' else s['text'] for s in line['spans']))
            x0, y0, x1, y1 = line['bbox']
            # The core book's outside margin holds rotated running titles and folios.
            if not text or x0 < 42 or x0 > 378 or re.fullmatch(r'(?:W|O|CHAPT(?:ER)?|GAME RULES|PRESS START)', text):
                continue
            lines.append(dict(text=text, box=(x0, y0, x1, y1), size=max(s['size'] for s in line['spans']), block=bi))
    lines.sort(key=lambda l: (round(l['box'][1], 1), l['box'][0]))
    table_items = []
    tables = page.find_tables().tables
    # Reconstruct columns from header positions. The PDF often uses merged body
    # cells, so plain table.extract() merges unrelated equipment values together.
    if tables:
        x0 = min(t.bbox[0] for t in tables); y0 = min(t.bbox[1] for t in tables)
        x1 = max(t.bbox[2] for t in tables); y1 = max(t.bbox[3] for t in tables)
        header = [l for l in lines if y0 <= l['box'][1] < y0 + 15 and x0 - 2 <= l['box'][0] <= x1]
        if len(header) >= 3:
            header.sort(key=lambda l: l['box'][0])
            centers = [(l['box'][0] + l['box'][2]) / 2 for l in header]
            inside = [l for l in lines if y0 <= l['box'][1] and l['box'][3] <= y1 + 3 and x0 - 2 <= l['box'][0] <= x1]
            rows = []
            for line in inside:
                mid = (line['box'][1] + line['box'][3]) / 2
                row = next((r for r in rows if abs(r['y'] - mid) < 5), None)
                if row is None:
                    row = dict(y=mid, lines=[]); rows.append(row)
                row['lines'].append(line)
            cells = []
            for row in sorted(rows, key=lambda r: r['y']):
                entries = sorted(row['lines'], key=lambda l: l['box'][0])
                if len(entries) == 1:
                    cells.append([entries[0]['text']])
                else:
                    values = [''] * len(centers)
                    for entry in entries:
                        center = (entry['box'][0] + entry['box'][2]) / 2
                        col = min(range(len(centers)), key=lambda i: abs(centers[i] - center))
                        values[col] = join_text([values[col], entry['text']])
                    cells.append(values)
            if cells:
                table_items.append((y0, {'kind': 'table', 'rows': cells}))
                excluded = {id(l) for l in inside}
                lines = [l for l in lines if id(l) not in excluded]
    items = []
    pending = None
    for line in lines:
        text = line['text']; y = line['box'][1]
        kind = 'h' if line['size'] >= 11.5 and not re.fullmatch(r'\d+', text) else 'p'
        bullet = text.startswith('•')
        if bullet: kind = 'li'; text = text.lstrip('• ')
        # Wrapped lines within the same paragraph have ~12 pt line spacing.
        ordinal = pending and re.fullmatch(r'\d{1,2}', pending['text']) and kind == 'p' and y - pending['_top'] < 14 and line['box'][0] > pending['_left'] + 10
        continuation = pending and kind == 'p' and pending['kind'] in ('p', 'li') and (line['block'] == pending['_block'] or y - pending['_bottom'] < 6) and y >= pending['_bottom'] - 3
        if ordinal:
            pending['text'] += '. ' + text; pending['_bottom'] = line['box'][3]; pending['_block'] = line['block']
        elif continuation:
            pending['text'] = join_text([pending['text'], text]); pending['_bottom'] = line['box'][3]; pending['_block'] = line['block']
        else:
            pending = {'kind': kind, 'text': text, '_block': line['block'], '_bottom': line['box'][3], '_top': y, '_left': line['box'][0]}
            if kind == 'h': pending['level'] = 2 if line['size'] >= 18 else 3
            items.append((y, pending))
    items.extend(table_items)
    return [{k: v for k, v in item.items() if not k.startswith('_')} for _, item in sorted(items, key=lambda p: p[0])]

def main():
    manifest_path = ROOT / 'public/official/manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    entry = next(d for d in manifest['documents'] if d['id'] == 'core')
    previous = ROOT / 'public' / entry['file']
    book = json.loads(previous.read_text(encoding='utf-8'))
    source = Path('E:/TRPG/FU') / book['source']
    pdf = pymupdf.open(source)
    for i, page in enumerate(book['pages']):
        page['blocks'] = structure(pdf[i])
    book['textLayout'] = 'core-geometry-v1'
    payload = json.dumps(book, ensure_ascii=False, separators=(',', ':')).encode()
    digest = hashlib.sha256(payload).hexdigest()
    target = previous.parent / ('core.' + digest[:12] + '.json')
    target.write_bytes(payload)
    entry.update(file=target.relative_to(ROOT / 'public').as_posix(), hash=digest, size=len(payload), gzipSize=len(gzip.compress(payload)))
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    if previous != target and previous.resolve().is_relative_to((ROOT / 'public/official').resolve()):
        previous.unlink()
    print(json.dumps({'pages': len(book['pages']), 'textBytes': len(payload), 'gzipBytes': entry['gzipSize'], 'tables': sum(b['kind'] == 'table' for p in book['pages'] for b in p['blocks'])}))

if __name__ == '__main__':
    main()
