#!/usr/bin/env python3
"""Appliquer les FRAGMENTS `changes/<lot>.yml` aux fichiers chauds (lot `ci/5-process`).

Pourquoi
--------
Chaque intégration conflictait sur les mêmes fichiers, parce que chaque lot y
ajoutait sa ligne au même endroit : le changelog (`entries.ts`, `labels.fr.ts`,
`labels.en.ts`), `demo-coverage.ts`, `agent_docs/demo-mode.md`,
`agent_docs/chantiers-livres.md`. Le hook `pre-push` refuse désormais ces
fichiers sur une branche `claude/lot*` (`tools/ci/hot-files.mjs`) : le lot écrit
un FRAGMENT, l'intégrateur lance ce script, qui l'applique sans conflit possible.
Il généralise `fusion_changelog.py` (qui reste l'outil des conflits git).

Format (`changes/README.md`, sous-ensemble YAML documenté — aucune dépendance) :

    lot: lot-630
    issues: [4886]
    changelog:                       # facultatif
      id: 2026-10-31-lot-630         # AAAA-MM-JJ-slug
      comment: "Lot 630 (#4886) — …" # ligne de commentaire dans entries.ts
      fr: { date, title, items: [...] }   (en blocs indentés)
      en: { date, title, items: [...] }   (parité stricte avec fr)
    inserts:                         # facultatif
      - file: agent_docs/chantiers-livres.md
        after: "## Une ligne du fichier"   # ou before: ; absent = fin du fichier
        text: |
          le bloc, tel quel

Garanties : tout est VALIDÉ avant la première écriture (rien d'écrit sur un
refus) ; rejouer un fragment déjà appliqué ne duplique rien ; les fragments
s'appliquent du plus ancien au plus récent (le changelog reste newest-first) ;
l'équilibre des accolades et l'unicité des identifiants sont revérifiés par les
fonctions de `fusion_changelog.py`.

Usage
-----
    python3 tools/issues/fusion_fragments.py [--racine <dépôt>] [--garder] [fragments…]

Sans fragment nommé : tous les `changes/*.yml`. Un fragment appliqué est retiré
(sauf `--garder`). Rend 0 si tout est appliqué, 1 sinon. Lancer ensuite
`pnpm exec prettier --write <fichiers touchés>` puis les tests du paquet.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
from pathlib import Path

CHANGELOG = "packages/contracts/src/changelog"
ENTRIES = f"{CHANGELOG}/entries.ts"
LABELS = {"fr": f"{CHANGELOG}/labels.fr.ts", "en": f"{CHANGELOG}/labels.en.ts"}

# La ligne SOUS laquelle une nouvelle entrée se pose (newest-first).
ANCRES_CHANGELOG = {
    ENTRIES: "export const CHANGELOG_IDS: ChangelogEntryRef[] = [",
    LABELS["fr"]: "  entries: {",
    LABELS["en"]: "  entries: {",
}

ID_VALIDE = re.compile(r"^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$")


class FragmentInvalide(Exception):
    """Un fragment qui ne s'applique pas proprement — rien n'est écrit."""


# ───────────────────────── lecture du sous-ensemble YAML ─────────────────────────


def _sans_commentaire(brut: str) -> str:
    """Retire un commentaire en fin de ligne (` # …`), comme YAML, hors guillemets."""
    v = brut.strip()
    if v.startswith('"'):
        _, fin = json.JSONDecoder().raw_decode(v)
        return v[:fin]
    if v.startswith("'"):
        m = re.match(r"'(?:[^']|'')*'", v)
        return m.group(0) if m else v
    return re.split(r"\s#", v, maxsplit=1)[0].strip()


def _scalaire(brut: str):
    v = _sans_commentaire(brut)
    if v.startswith('"'):
        return json.loads(v)
    if v.startswith("'") and v.endswith("'") and len(v) >= 2:
        return v[1:-1].replace("''", "'")
    if v.startswith("[") and v.endswith("]"):
        return [_scalaire(x) for x in v[1:-1].split(",") if x.strip()]
    if re.fullmatch(r"-?\d+", v):
        return int(v)
    return v


def _indent(ligne: str) -> int:
    return len(ligne) - len(ligne.lstrip(" "))


def parse_fragment(texte: str):
    """Mappings, listes `- `, scalaires simples / "json" / 'yaml', blocs `|`."""
    if "\t" in texte:
        raise FragmentInvalide("tabulation dans le fragment : indenter avec des espaces")
    lignes = texte.split("\n")
    pos = 0

    def utile(i: int) -> bool:
        s = lignes[i].strip()
        return bool(s) and not s.startswith("#")

    def sauter() -> None:
        nonlocal pos
        while pos < len(lignes) and not utile(pos):
            pos += 1

    def bloc_litteral(parent: int) -> str:
        nonlocal pos
        corps: list[str] = []
        while pos < len(lignes) and (not lignes[pos].strip() or _indent(lignes[pos]) > parent):
            corps.append(lignes[pos])
            pos += 1
        while corps and not corps[-1].strip():
            corps.pop()
        if not corps:
            return ""
        marge = min(_indent(l) for l in corps if l.strip())
        return "\n".join(l[marge:] for l in corps) + "\n"

    def valeur(apres: str, parent: int):
        nonlocal pos
        apres = _sans_commentaire(apres) if apres.strip() and not apres.strip().startswith("#") else ""
        if apres == "|":
            return bloc_litteral(parent)
        if apres:
            return _scalaire(apres)
        sauter()
        if pos < len(lignes) and _indent(lignes[pos]) > parent:
            return noeud(_indent(lignes[pos]))
        return None

    def mapping(indent: int, premiere: str | None = None) -> dict:
        nonlocal pos
        out: dict = {}
        while True:
            if premiere is None:
                sauter()
                if pos >= len(lignes) or _indent(lignes[pos]) != indent:
                    return out
                contenu = lignes[pos].strip()
                if contenu.startswith("- "):
                    return out
                pos += 1
            else:
                contenu, premiere = premiere, None
            cle, sep, apres = contenu.partition(":")
            if not sep or not cle.strip():
                raise FragmentInvalide(f"ligne {pos} : « clé: valeur » attendu, lu « {contenu} »")
            out[cle.strip()] = valeur(apres, indent)

    def liste(indent: int) -> list:
        nonlocal pos
        out: list = []
        while True:
            sauter()
            if pos >= len(lignes) or _indent(lignes[pos]) != indent:
                return out
            contenu = lignes[pos].strip()
            if not contenu.startswith("- "):
                return out
            pos += 1
            reste = contenu[2:]
            if re.match(r"^[A-Za-z_][\w-]*:(\s|$)", reste):
                out.append(mapping(indent + 2, premiere=reste))
            else:
                out.append(_scalaire(reste))

    def noeud(indent: int):
        sauter()
        if pos < len(lignes) and lignes[pos].strip().startswith("- "):
            return liste(indent)
        return mapping(indent)

    racine = noeud(0)
    sauter()
    if pos < len(lignes):
        raise FragmentInvalide(f"ligne {pos + 1} : indentation inattendue « {lignes[pos].strip()} »")
    return racine


# ───────────────────────── application ─────────────────────────


def _ts(texte: str) -> str:
    return "'" + str(texte).replace("\\", "\\\\").replace("'", "\\'") + "'"


def _fusion_changelog():
    spec = importlib.util.spec_from_file_location(
        "fusion_changelog", Path(__file__).with_name("fusion_changelog.py")
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _poser_sous(texte: str, ancre: str, bloc: str, relatif: str, avant: bool = False) -> str:
    lignes = texte.split("\n")
    if lignes.count(ancre) != 1:
        raise FragmentInvalide(f"{relatif} : ancre « {ancre} » introuvable ou ambiguë")
    i = lignes.index(ancre) + (0 if avant else 1)
    ajout = bloc[:-1].split("\n") if bloc.endswith("\n") else bloc.split("\n")
    return "\n".join(lignes[:i] + ajout + lignes[i:])


def _chemin(racine: Path, relatif: str) -> Path:
    chemin = (racine / relatif).resolve()
    if not str(chemin).startswith(str(racine.resolve()) + "/") or not chemin.exists():
        raise FragmentInvalide(f"{relatif} : hors du dépôt ou absent")
    return chemin


def _changelog(racine: Path, cl: dict, fichiers: dict[str, str]) -> None:
    ident = str(cl.get("id", ""))
    if not ID_VALIDE.match(ident):
        raise FragmentInvalide(f"identifiant de changelog mal formé : « {ident} » (AAAA-MM-JJ-slug)")
    langues = {lg: cl.get(lg) or {} for lg in LABELS}
    comptes = {lg: len(v.get("items") or []) for lg, v in langues.items()}
    if len(set(comptes.values())) != 1 or 0 in comptes.values():
        raise FragmentInvalide(f"{ident} : parité FR/EN rompue ou vide — {comptes}")
    for lg, v in langues.items():
        if not v.get("date") or not v.get("title"):
            raise FragmentInvalide(f"{ident} : `{lg}` sans date ni titre")
    for relatif in (ENTRIES, *LABELS.values()):
        fichiers.setdefault(relatif, _chemin(racine, relatif).read_text(encoding="utf-8"))
    presents = [r for r in (ENTRIES, *LABELS.values()) if f"'{ident}'" in fichiers[r]]
    if len(presents) == 3:
        return  # déjà appliqué
    if presents:
        raise FragmentInvalide(f"{ident} : déjà présent dans {presents} seulement — à réparer à la main")
    n = comptes["fr"]
    ligne = f"  {{ id: {_ts(ident)}, itemCount: {n} }},\n"
    if cl.get("comment"):
        ligne = f"  // {cl['comment']}\n" + ligne
    fichiers[ENTRIES] = _poser_sous(fichiers[ENTRIES], ANCRES_CHANGELOG[ENTRIES], ligne, ENTRIES)
    for lg, relatif in LABELS.items():
        v = langues[lg]
        bloc = [f"    {_ts(ident)}: {{", f"      date: {_ts(v['date'])},", f"      title: {_ts(v['title'])},"]
        bloc += [f"      item{i}: {_ts(t)}," for i, t in enumerate(v["items"], start=1)]
        bloc.append("    },")
        fichiers[relatif] = _poser_sous(
            fichiers[relatif], ANCRES_CHANGELOG[relatif], "\n".join(bloc) + "\n", relatif
        )


def _insert(racine: Path, ins: dict, fichiers: dict[str, str]) -> None:
    relatif = str(ins.get("file", ""))
    texte = ins.get("text")
    if not relatif or not isinstance(texte, str) or not texte.strip():
        raise FragmentInvalide(f"insert sans `file` ou sans `text` : {ins}")
    fichiers.setdefault(relatif, _chemin(racine, relatif).read_text(encoding="utf-8"))
    if texte.strip() in fichiers[relatif]:
        return  # déjà appliqué
    if ins.get("after") is not None:
        fichiers[relatif] = _poser_sous(fichiers[relatif], str(ins["after"]), texte, relatif)
    elif ins.get("before") is not None:
        fichiers[relatif] = _poser_sous(fichiers[relatif], str(ins["before"]), texte, relatif, avant=True)
    else:
        base = fichiers[relatif]
        fichiers[relatif] = base + ("" if base.endswith("\n") or not base else "\n") + texte


def appliquer(racine: Path, fragment: dict) -> list[str]:
    """Valide puis écrit. Rend les chemins réellement modifiés ; lève `FragmentInvalide` sans rien écrire."""
    if not isinstance(fragment, dict):
        raise FragmentInvalide("un fragment est un mapping (`lot:`, `changelog:`, `inserts:`)")
    fichiers: dict[str, str] = {}
    if fragment.get("changelog"):
        _changelog(racine, fragment["changelog"], fichiers)
    for ins in fragment.get("inserts") or []:
        _insert(racine, ins, fichiers)
    fc = _fusion_changelog()
    for relatif in (ENTRIES, *LABELS.values()):
        if relatif in fichiers:
            if fc.desequilibre(fichiers[relatif]) != 0:
                raise FragmentInvalide(f"{relatif} : accolades déséquilibrées après application")
    if ENTRIES in fichiers and fc.doublons(fichiers[ENTRIES]):
        raise FragmentInvalide(f"{ENTRIES} : identifiant en double — {fc.doublons(fichiers[ENTRIES])}")
    touches = []
    for relatif, texte in fichiers.items():
        chemin = racine / relatif
        if chemin.read_text(encoding="utf-8") != texte:
            chemin.write_text(texte, encoding="utf-8")
            touches.append(relatif)
    return sorted(touches)


def _cle_de_tri(chemin: Path, fragment: dict) -> tuple[str, str]:
    cl = fragment.get("changelog") or {}
    return (str(cl.get("id", "")), chemin.name)


def main(argv: list[str] | None = None) -> int:
    parseur = argparse.ArgumentParser(description="Applique les fragments changes/<lot>.yml.")
    parseur.add_argument("--racine", type=Path, default=Path.cwd())
    parseur.add_argument("--garder", action="store_true", help="ne pas retirer les fragments appliqués")
    parseur.add_argument("fragments", nargs="*", type=Path)
    args = parseur.parse_args(argv)
    racine: Path = args.racine
    chemins = args.fragments or sorted((racine / "changes").glob("*.yml"))
    lus = []
    for chemin in chemins:
        try:
            lus.append((chemin, parse_fragment(chemin.read_text(encoding="utf-8"))))
        except (FragmentInvalide, ValueError) as err:
            print(f"✗ {chemin} : {err}", file=sys.stderr)
            return 1
    touches: set[str] = set()
    for chemin, fragment in sorted(lus, key=lambda cf: _cle_de_tri(*cf)):
        try:
            faits = appliquer(racine, fragment)
        except FragmentInvalide as err:
            print(f"✗ {chemin.name} : {err}", file=sys.stderr)
            return 1
        print(f"✓ {chemin.name} : {', '.join(faits) or 'déjà appliqué'}")
        touches.update(faits)
        if not args.garder:
            chemin.unlink()
    if touches:
        print(f"\nPuis : pnpm exec prettier --write {' '.join(sorted(touches))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
