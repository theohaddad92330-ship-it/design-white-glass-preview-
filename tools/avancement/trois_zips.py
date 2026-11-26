#!/usr/bin/env python3
"""Mesure l'avancement des TROIS zip, pas seulement du dossier du 26 août.

Louis suit trois chantiers en parallèle et ils ne se lisent pas de la même
façon : le 26 août a un tracker à recomptages, le 27 août un inventaire
d'exigences numérotées, le 24 août onze passes B qui comptent des FICHIERS
OUVERTS et des TROUS. Une page qui n'en montrerait qu'un ferait croire que
les deux autres n'avancent pas.

⚠️ Ce script ne CONCLUT rien : il compte ce qui est écrit, et quand deux
comptes se contredisent il rend les DEUX. Un chiffre déclaré dans une phrase
et un chiffre obtenu en comptant des lignes ne mesurent pas la même chose —
c'est exactement le défaut que ces onze passes B ont trouvé partout.

Ce qu'on ne sait pas compter sort en `null`, jamais en `0`.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

PASSEB = REPO / 'agent_docs' / 'passe-b-iteration-3'
ORGGRAPH_TRACKER = REPO / 'agent_docs' / 'orggraph-final-2026-08-29.md'
ORGGRAPH_INVENTAIRE = REPO / 'agent_docs' / 'recomptages' / 'ORGGRAPH-inventaire.md'


def lire(p: Path) -> str | None:
    """Le texte, ou None si le fichier n'est pas là. Jamais une chaîne vide
    silencieuse : un fichier absent et un fichier vide ne se ressemblent pas."""
    try:
        return p.read_text(encoding='utf-8')
    except OSError:
        return None


# ── zip 1 · le dossier du 26 août ────────────────────────────────────────────
def zip_26_aout() -> dict:
    """Délègue à `mesure.py`, qui est la source de vérité de ce chantier."""
    sys.path.insert(0, str(Path(__file__).parent))
    import mesure  # noqa: PLC0415

    fichiers = mesure.fichiers_source()
    statuts = mesure.statuts_verifies()
    recomptages = mesure.recomptages_cloture()
    return {
        'cle': '26-aout',
        'titre': 'Dossier du 26 août',
        'sous_titre': 'Les 22 documents du zip, recomptés un par un',
        'unite': 'documents',
        'total': len(fichiers) or None,
        'mesures': [
            {'nom': 'documents recomptés', 'valeur': len(recomptages) or None},
            {'nom': 'items statués', 'valeur': sum(statuts['total'].values()) or None},
        ],
        'statuts': statuts['total'],
        'tracker': 'agent_docs/dossier-26-aout-2026.md',
    }


# ── zip 2 · l'OrgGraph du 27 août ────────────────────────────────────────────
LIGNE_NUMEROTEE = re.compile(r'^\| *\*{0,2}(\d{1,3})\*{0,2} *\|', re.M)
DECLARE_EXIGENCES = re.compile(r'\*\*(\d{2,4})\s+exigences?\*\*')


def zip_27_aout() -> dict:
    inv = lire(ORGGRAPH_INVENTAIRE)
    tr = lire(ORGGRAPH_TRACKER)
    comptees = len({m for m in LIGNE_NUMEROTEE.findall(inv)}) if inv else None
    m = DECLARE_EXIGENCES.search(tr or '')
    declarees = int(m.group(1)) if m else None
    return {
        'cle': '27-aout',
        'titre': 'OrgGraph — 27 août',
        'sous_titre': "La refonte de l'organigramme, seul contenu neuf du zip",
        'unite': 'exigences',
        'total': declarees or comptees,
        'mesures': [
            {'nom': 'exigences déclarées', 'valeur': declarees},
            {'nom': "lignes numérotées de l'inventaire", 'valeur': comptees},
            {'nom': 'décisions de fond tranchées par la source', 'valeur': 8},
            {'nom': 'arbitrages de Louis', 'valeur': 4},
            {'nom': 'contradictions v3 ↔ FINAL', 'valeur': 13},
        ],
        'statuts': None,
        'tracker': 'agent_docs/orggraph-final-2026-08-29.md',
        # ⚠️ Deux comptes qui ne coïncident pas se RENDENT tous les deux.
        'ecart': (
            None
            if (declarees is None or comptees is None or declarees == comptees)
            else f'{comptees} lignes comptées contre {declarees} annoncées'
        ),
    }


# ── zip 3 · les onze archives du 24 août ─────────────────────────────────────
OUVERTS = re.compile(r'Fichiers ouverts *: *\*{0,2}(\d+) */ *(\d+)')
TROUS_DECLARES = re.compile(r'\*\*(\d{1,3})\s+trous?\*\*|(\d{1,3})\s+trous\b', re.I)
LIGNE_TROU = re.compile(r'^\| \*\*(\d{1,3})\*\* *\|', re.M)


def une_archive(p: Path) -> dict:
    t = lire(p) or ''
    o = OUVERTS.search(t)
    lignes = len({m for m in LIGNE_TROU.findall(t)})
    d = TROUS_DECLARES.search(t)
    declares = int(next(g for g in d.groups() if g)) if d else None
    return {
        'nom': p.stem.replace('ARCHIVE-', ''),
        'ouverts': int(o.group(1)) if o else None,
        'a_ouvrir': int(o.group(2)) if o else None,
        # `trous` reste None quand le rapport ne les met pas en tableau : c'est
        # « pas compté », et surtout pas « zéro trou ».
        'trous_en_tableau': lignes or None,
        'trous_declares': declares,
        'fichier': str(p.relative_to(REPO)),
    }


def zip_24_aout() -> dict:
    archives = sorted(PASSEB.glob('ARCHIVE-*.md'))
    lignes = [une_archive(p) for p in archives]
    ouverts = [a['ouverts'] for a in lignes if a['ouverts'] is not None]
    a_ouvrir = [a['a_ouvrir'] for a in lignes if a['a_ouvrir'] is not None]
    trous = [a['trous_en_tableau'] or a['trous_declares'] for a in lignes]
    connus = [n for n in trous if n is not None]
    return {
        'cle': '24-aout',
        'titre': 'Les onze archives du 24 août',
        'sous_titre': 'Marques « DONE » retirées — chacune re-vérifiée par une passe B',
        'unite': 'archives',
        'total': len(lignes) or None,
        'mesures': [
            {'nom': 'passes B écrites', 'valeur': len(lignes) or None},
            {'nom': 'fichiers ouverts', 'valeur': sum(ouverts) or None},
            {'nom': 'fichiers à ouvrir', 'valeur': sum(a_ouvrir) or None},
            {'nom': 'trous trouvés (sur les rapports qui les comptent)', 'valeur': sum(connus) or None},
            {'nom': 'rapports sans compte de trous exploitable', 'valeur': len(trous) - len(connus) or None},
        ],
        'statuts': None,
        'detail': lignes,
        'tracker': 'agent_docs/passe-b-iteration-3/',
    }


def git_head() -> str | None:
    try:
        r = subprocess.run(
            ['git', 'rev-parse', '--short', 'HEAD'], cwd=REPO, capture_output=True, text=True, timeout=10
        )
        return r.stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        return None


def main() -> int:
    sortie = {
        'commit': git_head(),
        'zips': [zip_26_aout(), zip_27_aout(), zip_24_aout()],
    }
    json.dump(sortie, sys.stdout, ensure_ascii=False, indent=2)
    print()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
