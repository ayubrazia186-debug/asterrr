"""Reads the four revision-checklist workbooks and writes src/data/plan.seed.json.
Usage: python3 tools/extract.py <folder-with-xlsx> <out.json>
"""
import sys, json, glob, re, datetime, openpyxl

CODES = {'0580': 'maths', '0452': 'accounting', '0478': 'cs', '0450': 'business', '0500': 'english'}
TICKS = ('☑', '☐')

def iso(v):
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime('%Y-%m-%d')
    return None

def s(v):
    return '' if v is None else str(v).strip()

def parse(path):
    wb = openpyxl.load_workbook(path)
    ws = wb['Checklist']
    title = s(ws['B2'].value)
    code = re.search(r'\((\d{4})\)', title).group(1)
    teacher = s(ws['B3'].value).split('|')[0].strip()
    classes, extras = [], []
    day, section = None, 'plan'
    for r in range(11, ws.max_row + 1):
        b = ws.cell(r, 2).value
        if isinstance(b, str) and b.startswith('Day '):
            day = int(b.split()[1]); continue
        if isinstance(b, str) and b.strip().lower() == 'not taught yet':
            section, day = 'later', None; continue
        if b in TICKS:
            link = ws.cell(r, 9).hyperlink.target if ws.cell(r, 9).hyperlink else None
            classes.append({
                'row': r,
                'day': day if section == 'plan' else None,
                'date': iso(ws.cell(r, 14).value) if section == 'plan' else None,
                'section': section,
                'topic': s(ws.cell(r, 6).value),
                'part': s(ws.cell(r, 7).value),
                'watch': s(ws.cell(r, 8).value),
                'linkText': s(ws.cell(r, 9).value),
                'link': link,
                'passcode': s(ws.cell(r, 10).value),
                'taught': s(ws.cell(r, 11).value),
                'notes': s(ws.cell(r, 13).value),
                'steps': [ws.cell(r, c).value == '☑' for c in range(2, 6)],
            })
        elif ws.cell(r, 6).value and ws.cell(r, 9).hyperlink is None:
            for c in range(6, 10):
                h = ws.cell(r, c).hyperlink
                if h and h.target:
                    extras.append({'title': s(ws.cell(r, 6).value), 'url': h.target}); break
            else:
                # CS playlists keep the link on the F cell itself
                h = ws.cell(r, 6).hyperlink
                if h and h.target: extras.append({'title': s(ws.cell(r, 6).value), 'url': h.target})
        else:
            h = ws.cell(r, 6).hyperlink
            if h and h.target: extras.append({'title': s(ws.cell(r, 6).value), 'url': h.target})
    return CODES[code], {'code': code, 'title': title, 'teacher': teacher, 'classes': classes, 'extras': extras}

if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    result = {}
    for f in sorted(glob.glob(src + '/*.xlsx')):
        sid, data = parse(f)
        result[sid] = data
    json.dump(result, open(out, 'w'), ensure_ascii=False, indent=1)
    for sid, d in result.items():
        plan = [c for c in d['classes'] if c['section'] == 'plan']
        done = sum(all(c['steps']) for c in plan)
        print(sid, d['code'], d['teacher'], 'plan', len(plan), 'later', len(d['classes']) - len(plan), 'done', done, 'extras', len(d['extras']))
