"""Génère le tableau de suivi des 62 retours Laura (#1901 → #1962).

Sources, toutes sur disque — rien ne vit dans le contexte d'une session :
  - .claude/notes/registre-2026-09-12.md   les 1 166 points et leur état
  - .claude/notes/suivi-laura/issues.json  titres + ouvert/clos (--refresh le relit sur GitHub)
  - .claude/notes/suivi-laura/lots.json    les PR, leur étape, les décisions en attente (à la main)
  - https://api.bellum-ai.com/version      le commit servi en prod (lu au build, jamais deviné)

Usage : python3 .claude/notes/suivi-laura/build.py [--refresh]
Puis republier .claude/notes/suivi-laura/index.html sur l'URL notée dans lots.json.
"""
import json
import pathlib
import re
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
REG = ROOT / '.claude/notes/registre-2026-09-12.md'
STATES = ['à trancher', 'retenu', 'reformulé', 'livré', 'recetté', 'déjà là', 'écarté']
KEEP_UPPER = {'crm', 'mcp', 'rgpd', 'pj', 'ia', 'api', 'cv', 'sse', 'os', 'naf', 'siren', 'p0', 'esn', 'ui'}


def sentence(title: str) -> str:
    t = re.sub(r'^\[[^\]]+\]\s*', '', title)
    t = re.sub(r'^/chat\s*—\s*LAURA\s*—\s*', '', t, flags=re.I)
    t = re.sub(r'^/chat\s*—\s*', '', t)
    t = re.sub(r'\s*—\s*P\d\s*$', '', t)
    words = t.lower().split(' ')
    out = [w.upper() if re.sub(r'\W', '', w) in KEEP_UPPER else w for w in words]
    s = ' '.join(out)
    return s[:1].upper() + s[1:]


def refresh_issues() -> None:
    raw = subprocess.run(
        ['gh', 'issue', 'list', '--state', 'all', '--limit', '200', '--search', 'created:2026-09-12',
         '--json', 'number,title,state,closedAt'],
        check=True, capture_output=True, text=True, cwd=ROOT).stdout
    data = [x for x in json.loads(raw) if 1901 <= x['number'] <= 1962]
    assert len(data) == 62, len(data)
    (HERE / 'issues.json').write_text(json.dumps(data, ensure_ascii=False, indent=1))


def prod_version() -> dict:
    try:
        with urllib.request.urlopen('https://api.bellum-ai.com/version', timeout=8) as r:
            v = json.loads(r.read())
        return {'api': (v.get('commit') or '')[:9] or None, 'ia': ((v.get('ia') or {}).get('commit') or '')[:9] or None}
    except Exception:  # noqa: BLE001 — une mesure impossible s'affiche « non lu », jamais un SHA supposé
        return {'api': None, 'ia': None}


def parse_registre() -> tuple[dict, dict]:
    text = REG.read_text()
    subject_of_issue, subject_names = {}, {}
    for m in re.finditer(r'^\|\s*([A-G])\s*\|\s*([^|]+?)\s*\|\s*([\d ]+?)\s*\|', text, re.M):
        subject_names[m.group(1)] = m.group(2)
        for n in m.group(3).split():
            subject_of_issue[int(n)] = m.group(1)
    points: dict[int, list] = {}
    for line in text.splitlines():
        m = re.match(r'^\|\s*(19\d\d)\.(\d+)\s*\|', line)
        if not m:
            continue
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if len(cells) < 6:
            continue
        # Une ligne peut porter des colonnes EN PLUS (une note de coût appendue en fin de
        # `1901.12`, par ex.). `!= 6` les jetait EN SILENCE : l'artefact affichait 1 165
        # points pour 1 166 dans le registre — un compteur qui perd une ligne sans le dire
        # est pire qu'un compteur absent, on le croit. On garde le surplus dans la preuve.
        pid, ask, subj, existing, state = cells[:5]
        proof = ' | '.join(cells[5:])
        if state not in STATES:
            state = 'à trancher'
        # « écarté » mêle deux réponses opposées : le code le fait DÉJÀ (rien à coder) et le refus
        # motivé. Les confondre fait lire 368 refus là où il y en a 14 — on les sépare à l'affichage.
        if state == 'écarté' and re.match(r'^\**LIVRÉ', existing) and '→ ÉCARTÉ' not in existing:
            state = 'déjà là'
        delivered = re.search(r'→ (?:LIVRÉ|RECETTÉ|ÉCARTÉ|REFORMULÉ) : ([^→]+)$', existing)
        points.setdefault(int(m.group(1)), []).append({
            'id': pid, 'ask': ask, 'state': state, 'proof': proof,
            'trace': delivered.group(1).strip() if delivered else '',
            'existing': re.sub(r'\*\*', '', existing)[:240],
        })
    return {'subjectOfIssue': subject_of_issue, 'subjectNames': subject_names}, points


def main() -> None:
    if '--refresh' in sys.argv:
        refresh_issues()
    meta, points = parse_registre()
    issues_raw = json.loads((HERE / 'issues.json').read_text())
    lots = json.loads((HERE / 'lots.json').read_text())
    issues = []
    for it in sorted(issues_raw, key=lambda x: x['number']):
        n = it['number']
        pts = points.get(n, [])
        issues.append({
            'n': n, 'title': sentence(it['title']), 'closed': it['state'] == 'CLOSED',
            'subject': meta['subjectOfIssue'].get(n, '?'), 'points': pts,
        })
    counts = {s: 0 for s in STATES}
    for pts in points.values():
        for p in pts:
            counts[p['state']] += 1
    data = {
        'generatedAt': datetime.now(timezone.utc).isoformat(timespec='minutes'),
        'prod': prod_version(),
        'subjects': meta['subjectNames'],
        'counts': counts,
        'total': sum(counts.values()),
        'issues': issues,
        **lots,
    }
    payload = json.dumps(data, ensure_ascii=False).replace('</', '<\\/')
    html = (HERE / 'template.html').read_text().replace('__DATA__', payload)
    (HERE / 'index.html').write_text(html)
    print('points', data['total'], counts)
    print('issues', len(issues), 'closes', sum(i['closed'] for i in issues))
    print('prod', data['prod'])


if __name__ == '__main__':
    main()
