#!/usr/bin/env python3
"""Comptage machine de agent_docs/iteration-3-trous-2026-08-30.md.

Il ne relit pas : il COMPTE. Une relecture confirme toujours à tort.

Règle, unique et mécanique : dans le §3, toute ligne de tableau dont la 1re
cellule est un identifiant `T-nnn` est un item ; son statut est le PREMIER des
cinq jetons reconnus qui APPARAÎT EN TÊTE de sa 3e cellule. Une cellule qui
n'en porte aucun, ou qui n'en porte pas en tête, est signalée — jamais devinée.
"""
import collections
import os
import re
import sys

# Le chemin se résout depuis CE fichier, jamais depuis le cwd : un script qui
# dépend du répertoire courant rend un faux zéro dès qu'on l'appelle d'ailleurs,
# et c'est exactement le piège que ce rapport documente au §4.6 bis.
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(R, 'agent_docs', 'iteration-3-trous-2026-08-30.md')

STATUTS = ['NON PROUVÉ', 'LIVRÉ', 'PARTIEL', 'ABSENT', 'PÉRIMÉ']

# Bornes des archives, telles qu'annoncées au §3. Le script VÉRIFIE qu'elles
# tombent juste plutôt que de les recopier.
ARCHIVES = [
    ('00 gouvernance', 1, 12), ('01 archi/UX', 13, 33), ('02 CRM/ATS', 34, 46),
    ('03 IA/Laura', 47, 60), ('04 intégr./sécu', 61, 73), ('05 access./orggraph', 74, 89),
    ('06 DATAFORGE', 90, 110), ('07 business', 111, 130), ('08 code/diff', 131, 142),
    ('09 carte de réf.', 143, 158), ('JUNE recovery', 159, 190),
]


def cells(line):
    return [c.strip() for c in line.strip().strip('|').split('|')]


def statut_of(cell):
    """Le jeton en TÊTE de cellule, gras retiré. Aucune devinette."""
    txt = cell.lstrip('*_ ').replace('**', '')
    for s in STATUTS:
        if txt.startswith(s):
            return s
    return None


def main():
    ids, rows, illisibles = [], [], []
    compte = collections.Counter()

    for raw in open(PATH, encoding='utf-8'):
        if not raw.lstrip().startswith('|'):
            continue
        c = cells(raw)
        if len(c) < 5:
            continue
        m = re.match(r'^\*{0,2}(T-\d{3})\*{0,2}$', c[0])
        if not m:
            continue
        ident, st = m.group(1), statut_of(c[2])
        if st is None:
            illisibles.append((ident, c[2][:70]))
            continue
        ids.append(ident)
        rows.append((int(ident.split('-')[1]), st))
        compte[st] += 1

    nums = [n for n, _ in rows]
    dups = sorted(i for i, n in collections.Counter(ids).items() if n > 1)
    manquants = [n for n in range(1, 191) if n not in set(nums)]
    hors = [n for n in nums if n > 190]

    print('=' * 62)
    print('  COMPTAGE — agent_docs/iteration-3-trous-2026-08-30.md')
    print('=' * 62)
    print('Items lus              : %d' % len(rows))
    print('Identifiants uniques   : %d' % len(set(ids)))
    print('Doublons               : %s' % (', '.join(dups) if dups else 'aucun'))
    print('Numéros manquants      : %s' % (manquants if manquants else 'aucun'))
    print('Numéros hors plage     : %s' % (hors if hors else 'aucun'))
    print('Statuts illisibles     : %d' % len(illisibles))
    print()
    print('Par statut')
    for s in STATUTS:
        print('  %-12s %4d   %5.1f %%' % (s, compte[s], 100.0 * compte[s] / max(len(rows), 1)))
    print('  %-12s %4d' % ('TOTAL', sum(compte.values())))
    print()
    print('Par archive')
    somme = 0
    for label, lo, hi in ARCHIVES:
        sub = [st for n, st in rows if lo <= n <= hi]
        somme += len(sub)
        attendu = hi - lo + 1
        flag = '' if len(sub) == attendu else '  <-- ATTENDU %d' % attendu
        d = collections.Counter(sub)
        print('  %-20s %3d  (L%d P%d A%d X%d N%d)%s' % (
            label, len(sub), d['LIVRÉ'], d['PARTIEL'], d['ABSENT'],
            d['PÉRIMÉ'], d['NON PROUVÉ'], flag))
    print('  %-20s %3d' % ('SOMME', somme))

    if illisibles:
        print()
        print("Lignes dont le statut n'est pas lisible en tête de cellule :")
        for i, s in illisibles:
            print('  %s -> %r' % (i, s))

    ok = (len(rows) == len(set(ids)) == 190
          and not dups and not manquants and not hors and not illisibles
          and sum(compte.values()) == somme == 190)
    print()
    if ok:
        print('LE COMPTE TOMBE JUSTE : 190 items, 190 statués, aucun trou de numérotation.')
    else:
        print('/!\\ LE COMPTE NE TOMBE PAS JUSTE — ne pas arrondir, corriger la source.')
    return 0 if ok else 1


sys.exit(main())
