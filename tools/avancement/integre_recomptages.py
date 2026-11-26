#!/usr/bin/env python3
"""
Intègre les recomptages produits en parallèle dans le tracker, à froid.

Chaque agent de la vague A écrit UN fichier dans `agent_docs/recomptages/`,
à un chemin qui n'appartient qu'à lui — c'est ce qui rend treize agents
simultanés sans un seul conflit. Ce programme fait la couture, une fois,
séquentiellement.

⚠️ Il REMPLACE, il n'ajoute pas. `mesure.py` construit
`{r['document']: r for r in recomptages_cloture()}` : deux sections qui
déclarent le même `Document mesuré` ne lèvent aucune erreur, la DERNIÈRE
gagne. Un recomptage neuf ajouté à côté d'un ancien laisserait donc deux
comptes contradictoires dans le tracker et une mesure qui en choisit un en
silence — le pire des deux maux, un tableau qui affiche encore un chiffre.

    python3 tools/avancement/integre_recomptages.py           # vérifie
    python3 tools/avancement/integre_recomptages.py --ecrire  # applique
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
TRACKER = RACINE / 'agent_docs' / 'dossier-26-aout-2026.md'
RECOMPTAGES = RACINE / 'agent_docs' / 'recomptages'

ANCRE = re.compile(r'\*\*Document mesuré\s*:\s*`([A-Z]+-\d{2})`\*\*')


def sections(texte: str) -> list[tuple[int, int, str]]:
    """Découpe le tracker en sections `##`/`###`, bornes incluses.

    Même découpage que `mesure.py` : c'est l'ANCRE qui désigne un recomptage,
    jamais un numéro de section — un numéro se renumérote, et une mesure qui
    suit un numéro meurt au premier réagencement.
    """
    bornes = [m.start() for m in re.finditer(r'^#{2,3} ', texte, re.M)]
    return [(a, b, texte[a:b]) for a, b in zip(bornes, bornes[1:] + [len(texte)])]


def documents_declares(texte: str) -> dict[str, list[int]]:
    """Quels documents le tracker déclare mesurer, et combien de fois."""
    trouves: dict[str, list[int]] = {}
    for i, (_, _, corps) in enumerate(sections(texte)):
        m = ANCRE.search(corps)
        if m:
            trouves.setdefault(m.group(1), []).append(i)
    return trouves


def titre_de(corps: str) -> str:
    return corps.splitlines()[0] if corps else ''


def integre(texte: str, doc: str, neuf: str) -> tuple[str, str]:
    """Remplace la section du document, ou l'ajoute à la fin. Rend (texte, geste)."""
    neuf = neuf.strip() + '\n\n'
    for debut, fin, corps in sections(texte):
        m = ANCRE.search(corps)
        if m and m.group(1) == doc:
            return texte[:debut] + neuf + texte[fin:], f'remplacé « {titre_de(corps)} »'
    return texte.rstrip() + '\n\n' + neuf, 'ajouté en fin de tracker'


def main() -> int:
    ecrire = '--ecrire' in sys.argv
    texte = TRACKER.read_text(encoding='utf-8')

    fichiers = sorted(RECOMPTAGES.glob('PDF-*.md')) if RECOMPTAGES.is_dir() else []
    if not fichiers:
        # Un corpus vide qui passerait au vert serait une garde borgne : ce
        # programme doit LIRE quelque chose pour avoir le droit de conclure.
        print('✗ aucun recomptage dans agent_docs/recomptages/ — rien à intégrer')
        return 1

    print(f'{len(fichiers)} recomptage(s) à intégrer\n')
    gestes = []
    for f in fichiers:
        contenu = f.read_text(encoding='utf-8')
        m = ANCRE.search(contenu)
        if not m:
            print(f'✗ {f.name} : pas d\'ancre « Document mesuré » — non intégré')
            return 1
        doc = m.group(1)
        if doc != f.stem:
            print(f'✗ {f.name} : déclare `{doc}`, incohérent avec son nom de fichier')
            return 1
        texte, geste = integre(texte, doc, contenu)
        gestes.append((doc, geste))
        print(f'  {doc} — {geste}')

    doublons = {d: n for d, n in documents_declares(texte).items() if len(n) > 1}
    if doublons:
        print(f'\n✗ documents déclarés DEUX FOIS après intégration : {doublons}')
        print('  `mesure.py` prendrait le dernier en silence. Intégration refusée.')
        return 1

    print(f'\n✓ {len(documents_declares(texte))} documents déclarés, aucun en double')
    if ecrire:
        TRACKER.write_text(texte, encoding='utf-8')
        print(f'✓ {TRACKER.relative_to(RACINE)} réécrit')
    else:
        print('  (essai à blanc — relancer avec --ecrire pour appliquer)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
