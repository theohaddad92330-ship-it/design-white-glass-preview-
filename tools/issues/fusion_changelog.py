#!/usr/bin/env python3
"""Résoudre un conflit git sur le catalogue du changelog — et VÉRIFIER la fusion.

Pourquoi ce fichier existe
--------------------------
Chaque PR d'intégration conflicte sur les trois mêmes fichiers, parce que chaque
vague ajoute ses entrées EN TÊTE de la même liste :

    packages/contracts/src/changelog/entries.ts
    packages/contracts/src/changelog/labels.fr.ts
    packages/contracts/src/changelog/labels.en.ts

La règle d'intégration est « on garde LES DEUX côtés » : deux vagues ont livré des
choses différentes, aucune ne doit disparaître. Appliquée telle quelle, elle est
juste sur `entries.ts` — chaque élément y tient sur UNE ligne.

⚠️ Elle CASSE sur `labels.*.ts`, où une entrée est un objet de plusieurs lignes.
Mesuré le 16/09/2026 : la frontière `=======` tombait à l'intérieur de la dernière
entrée du côté HEAD, et son `},` de fermeture vivait dans le TRONC COMMUN, après
`>>>>>>>`. En concaténant les deux côtés, cette fermeture se retrouvait à fermer
l'entrée du côté distant. **Une accolade de moins, exactement une** — invisible à
la lecture du diff, et treize jobs de CI rouges d'un coup sur
« `'}' expected` ».

La leçon, générale : **« garder les deux côtés » est une règle de LISTE, pas de
texte.** Elle ne s'applique telle quelle que lorsqu'un élément tient sur une ligne.
Dès qu'un élément est un BLOC, la fusion se vérifie.

Ce que fait ce script
---------------------
1. garde les deux côtés de chaque conflit, HEAD d'abord ;
2. **répare** une entrée laissée ouverte par une frontière mal placée, en
   réinsérant le `},` manquant — détecté par la PROFONDEUR d'accolades à
   l'ouverture d'une entrée (une entrée s'ouvre à la profondeur 2, dans
   `entries:` ; à 3, la précédente n'a pas été refermée) ;
3. **refuse de rendre la main** si l'équilibre des accolades n'est pas rétabli,
   ou si un identifiant apparaît deux fois.

Il ne remplace pas `tsc` ni la suite de tests : il attrape, en une seconde, la
seule erreur que ces deux-là ne verraient qu'après un `pnpm install` complet —
ce qu'un worktree d'agent n'a pas.

Usage
-----
    python3 tools/issues/fusion_changelog.py [--racine <dépôt>]

Sans argument, il travaille sur le dépôt courant. Il rend 0 si tout est cohérent,
1 sinon, en nommant ce qui ne va pas.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

CATALOGUES = (
    "packages/contracts/src/changelog/entries.ts",
    "packages/contracts/src/changelog/labels.fr.ts",
    "packages/contracts/src/changelog/labels.en.ts",
)

# Les deux fichiers dont un élément est un BLOC, et non une ligne.
MULTI_LIGNES = CATALOGUES[1:]

CONFLIT = re.compile(
    r"<<<<<<< [^\n]*\n(?P<local>.*?)=======\n(?P<distant>.*?)>>>>>>> [^\n]*\n",
    re.S,
)

# Une entrée de catalogue commence par sa date : `'2026-09-16-…': {`
OUVERTURE_ENTREE = re.compile(r"^\s*'\d{4}-\d{2}-\d{2}-[^']*':\s*\{\s*$")

IDENTIFIANT = re.compile(r"id: '([^']+)'")


def garder_les_deux_cotes(texte: str) -> tuple[str, int]:
    """Résout chaque conflit en concaténant local puis distant."""
    return CONFLIT.subn(lambda m: m.group("local") + m.group("distant"), texte)


def reparer_entrees_non_fermees(texte: str) -> tuple[str, int]:
    """Réinsère le `},` d'une entrée qu'une frontière de conflit a laissée ouverte.

    Une entrée vit dans `entries: {`, donc elle s'ouvre à la profondeur 2. Si
    l'ouverture se produit à la profondeur 3, c'est que la précédente n'a pas été
    refermée — et c'est exactement ce que la concaténation naïve produit.
    """
    lignes = texte.split("\n")
    profondeur = 0
    reparees = 0
    i = 0
    while i < len(lignes):
        avant = profondeur
        profondeur += lignes[i].count("{") - lignes[i].count("}")
        if avant == 3 and OUVERTURE_ENTREE.match(lignes[i]):
            lignes.insert(i, "    },")
            # la ligne d'ouverture a glissé d'un cran ; on recalcule depuis elle
            profondeur = (avant - 1) + lignes[i + 1].count("{") - lignes[i + 1].count("}")
            reparees += 1
            i += 2
            continue
        i += 1
    return "\n".join(lignes), reparees


def desequilibre(texte: str) -> int:
    return texte.count("{") - texte.count("}")


def doublons(texte: str) -> list[str]:
    vus = IDENTIFIANT.findall(texte)
    return sorted({i for i in vus if vus.count(i) > 1})


def fusionner(racine: Path) -> int:
    """Résout, répare, vérifie. Rend 0 si tout est cohérent, 1 sinon."""
    problemes: list[str] = []

    for relatif in CATALOGUES:
        chemin = racine / relatif
        if not chemin.exists():
            problemes.append(f"{relatif} : absent du dépôt")
            continue

        texte = chemin.read_text(encoding="utf-8")
        texte, conflits = garder_les_deux_cotes(texte)
        reparees = 0
        if relatif in MULTI_LIGNES:
            texte, reparees = reparer_entrees_non_fermees(texte)
        chemin.write_text(texte, encoding="utf-8")

        ecart = desequilibre(texte)
        print(
            f"{relatif} : {conflits} conflit(s) résolu(s) · "
            f"{reparees} accolade(s) réinsérée(s) · delta {ecart}"
        )
        if ecart != 0:
            problemes.append(
                f"{relatif} : {ecart:+d} accolade(s) — la fusion a cassé la structure, "
                "NE PAS committer"
            )
        if "<<<<<<<" in texte or ">>>>>>>" in texte:
            problemes.append(f"{relatif} : il reste des marqueurs de conflit")

    entrees = racine / CATALOGUES[0]
    if entrees.exists():
        doubles = doublons(entrees.read_text(encoding="utf-8"))
        nombre = len(IDENTIFIANT.findall(entrees.read_text(encoding="utf-8")))
        print(f"{CATALOGUES[0]} : {nombre} identifiants · {doubles or 'aucun doublon'}")
        if doubles:
            problemes.append(
                f"{CATALOGUES[0]} : identifiant(s) en double — {', '.join(doubles)}"
            )

    if problemes:
        print("\n⚠️ La fusion n'est PAS sûre :", file=sys.stderr)
        for p in problemes:
            print(f"  · {p}", file=sys.stderr)
        return 1

    print("\nFusion cohérente. Lancer ensuite `tsc` et les tests du paquet.")
    return 0


def main() -> int:
    parseur = argparse.ArgumentParser(description=__doc__)
    parseur.add_argument(
        "--racine",
        type=Path,
        default=Path.cwd(),
        help="racine du dépôt (défaut : répertoire courant)",
    )
    return fusionner(parseur.parse_args().racine)


if __name__ == "__main__":
    raise SystemExit(main())
