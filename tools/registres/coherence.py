"""La cohérence des registres de points — ce qu'une relecture ne voit plus.

Un registre porte une ligne par demande d'un retour, avec son ÉTAT et sa PREUVE.
Les deux se contredisent en silence, et personne ne le voit : à 4 300 lignes, un
registre ne se relit pas, il se compte.

MESURÉ LE 16/09/2026 — ce qui a rendu cette garde nécessaire :

  * **24 points étaient marqués `recetté` alors que leur propre preuve disait
    « NON MESURÉ ».** L'état affirmait exactement l'inverse de la colonne d'à
    côté. Sur 1 051 points `recetté`, 184 (17 %) ne pouvaient pas soutenir leur
    état ; ces 24-là étaient le sous-ensemble sans aucune ambiguïté, puisque le
    texte le dit lui-même.
  * **9 lignes portaient un état SUFFIXÉ** (« livré 16/09 », « déjà là
    (reconcilié 16/09) », « livré 16/09 (mécanisme) »). Un état suffixé n'est
    plus comptable : un `Counter` en fait un état distinct, et la mesure du
    reliquat se met à mentir. La date appartient à la preuve.
  * **1 ligne portait un état INVENTÉ** (« constat faux »). Il n'était dans
    aucun des sept mots du vocabulaire, donc dans aucun décompte.
  * **4 lignes cassaient leur propre table** avec un `|` non échappé à
    l'intérieur d'un code-span (`stage: 'preparee'|...`). Markdown y voit une
    colonne de plus : la ligne se décale d'un cran et son état est lu ailleurs.

Le principe : `recetté` ne s'écrit pas au code, il se gagne en production. Rien
n'empêchait de l'écrire sur une ligne qui dit le contraire — c'est ce trou-là
que cette garde ferme, et rien d'autre.

⚠️ CE QU'ELLE NE PRÉTEND PAS FAIRE. 106 points `recetté` disent « livré/mergé »
sans citer de SHA, et 31 citent une branche de worktree éphémère. Ils sont
douteux aussi, mais douteux n'est pas faux : les traiter demande de chercher, un
par un, si le contenu a atterri. Une garde qui crierait sur eux dès aujourd'hui
rendrait 137 lignes rouges sans dire laquelle corriger — et une garde qui crie
sur ce qu'on ne sait pas encore trancher finit désactivée. Elle vérifie donc ce
qui est MÉCANIQUEMENT décidable, et le reste se compte à la main.
"""

from __future__ import annotations

import glob
import os
import re
import sys
from dataclasses import dataclass

# Les sept états du vocabulaire, et eux seuls. L'ordre est celui du cycle de vie.
ETATS = (
    "à trancher",
    "retenu",
    "reformulé",
    "déjà là",
    "livré",
    "recetté",
    "écarté",
)

# Un `|` NON échappé, et lui seul, sépare deux cellules. Le premier compteur
# écrit ce jour-là découpait aussi sur les `\|` qu'on venait d'échapper, et
# rendait 6 anomalies là où il y en avait 4.
SEPARATEUR = re.compile(r"(?<!\\)\|")

# `#2117.46` ou `2117.46` : le numéro de point, seul contenu légitime de la
# première cellule. Il tranche une ligne de POINT d'une ligne d'en-tête, d'un
# séparateur `| --- |` ou d'un tableau annexe.
# Le suffixe est admis parce que les registres l'écrivent : un point qui se
# subdivise en cours de route prend une lettre (`2543.3b`), et une demande
# traitée en plusieurs morceaux prend un qualificatif entre parenthèses
# (`#2502.1 (partiel)`, `2552.2 (direction)`). Le motif strict ne les voyait
# pas : 18 points sortaient du compte EN SILENCE, dont un `livré` qui rendait
# #2502 faussement close-able. Ce qui reste refusé : de la prose (une ligne
# d'un tableau annexe de recette commence par « #1901.12 — les fils rangés… »),
# un séparateur, un en-tête.
NUMERO = re.compile(r"^#?\d+\.\d+[a-z]?(?: *\([^)]{1,40}\))?$")

# « NON MESURÉ », « non mesurée », « NON MESURE » — l'accent et le genre varient
# d'un registre à l'autre, la contradiction est la même.
NON_MESURE = re.compile(r"NON\s+MESUR", re.IGNORECASE)

# ⚠️ CE QUI SAUVE UNE PREUVE QUI DIT « NON MESURÉ ».
#
# Mesuré le 16/09/2026, en recettant les points que cette garde venait de faire
# rétrograder : **une preuve de production CITE couramment un écran qui affiche
# « Non mesuré »** — « Le problème traité : Non mesuré », « non mesuré — date de
# la dernière synchronisation avec ton CRM ». C'est même le comportement qu'on
# recette : la doctrine EXIGE que l'écran écrive « non mesuré » plutôt qu'un 0.
#
# La règle n'a donc jamais porté sur le MOT, elle porte sur l'ABSENCE DE MESURE.
# Un `recetté` doit porter une observation de production ; la porte-t-il, la
# citation redevient de la donnée. Ne la porte-t-il pas, « NON MESURÉ » est un
# aveu, et l'état est faux.
#
# Ce qui compte comme observation : **un COMMIT**, sept caractères hexadécimaux
# au moins. Les mots ne suffisent pas — « demande une mesure en production » en
# contient et dit exactement le contraire d'une mesure.
#
# ⚠️ Et une branche de worktree n'est pas un commit. `worktree-agent-ad02d5d445f3547db`
# porte dix-sept caractères hexadécimaux : une reconnaissance naïve y voit un SHA
# servi. Mesuré le 16/09/2026 — trois points de #1917 seraient passés pour
# prouvés, et l'issue se serait fermée sur du travail jamais déployé. On retire
# donc ces noms AVANT de chercher un commit.
BRANCHE_DE_WORKTREE = re.compile(r"worktree-agent-[0-9a-f]+", re.IGNORECASE)
COMMIT = re.compile(r"\b[0-9a-f]{7,40}\b", re.IGNORECASE)


def _cite_un_commit(preuve: str) -> bool:
    return bool(COMMIT.search(BRANCHE_DE_WORKTREE.sub("", preuve)))


@dataclass(frozen=True)
class Point:
    fichier: str
    ligne: int
    numero: str
    etat: str
    preuve: str


@dataclass(frozen=True)
class Anomalie:
    code: str
    fichier: str
    ligne: int
    numero: str
    message: str

    def __str__(self) -> str:
        return f"{self.fichier}:{self.ligne} [{self.code}] {self.numero} — {self.message}"


def _cellules(ligne: str) -> list[str]:
    return [c.strip() for c in SEPARATEUR.split(ligne)]


def lire_points(chemins: list[str]) -> list[Point]:
    """Les lignes de point de chaque registre, découpées en cellules.

    L'état est cherché PAR SA POSITION relative — la cellule qui porte un des
    sept mots — et non par un index fixe : les registres n'ont pas tous le même
    nombre de colonnes (6 à 8 selon l'écran), et un index fixe lirait la preuve
    d'un registre comme l'état d'un autre.
    """
    points: list[Point] = []
    for chemin in chemins:
        with open(chemin, encoding="utf-8") as f:
            for numero_ligne, ligne in enumerate(f, 1):
                if not ligne.lstrip().startswith("|"):
                    continue
                cellules = _cellules(ligne)
                if len(cellules) < 4 or not NUMERO.match(cellules[1]):
                    continue
                index = _index_etat(cellules)
                etat = cellules[index] if index is not None else ""
                preuve = " ".join(cellules[index + 1 :]) if index is not None else ""
                points.append(
                    Point(
                        fichier=chemin,
                        ligne=numero_ligne,
                        numero=cellules[1],
                        etat=etat,
                        preuve=preuve.strip(" |"),
                    )
                )
    return points


def _index_etat(cellules: list[str]) -> int | None:
    """La cellule d'état : celle qui est EXACTEMENT un des sept mots.

    On cherche depuis la droite en sautant la dernière (la preuve finale), parce
    qu'une preuve cite couramment un état (« ← livré, réconcilié 15/09 ») et
    qu'une recherche depuis la gauche attraperait le mot dans le libellé de la
    demande (« Retenu par le filtre »). L'état, lui, est seul dans sa cellule.
    """
    for i in range(len(cellules) - 1, 1, -1):
        if cellules[i] in ETATS:
            return i
    return None


def _etat_suffixe(cellules: list[str]) -> str | None:
    """Une cellule qui COMMENCE par un état mais ne s'y réduit pas.

    « livré 16/09 » n'est pas « livré » : il ne tombe dans aucun décompte, donc
    le reliquat mesuré est faux de ce point-là.
    """
    for i in range(len(cellules) - 1, 1, -1):
        cellule = cellules[i]
        if cellule in ETATS:
            return None
        for etat in ETATS:
            if cellule.startswith(etat + " ") and len(cellule) < len(etat) + 60:
                return cellule
    return None


def anomalies(chemins: list[str]) -> list[Anomalie]:
    trouvees: list[Anomalie] = []
    for chemin in chemins:
        with open(chemin, encoding="utf-8") as f:
            for numero_ligne, ligne in enumerate(f, 1):
                if not ligne.lstrip().startswith("|"):
                    continue
                cellules = _cellules(ligne)
                if len(cellules) < 4 or not NUMERO.match(cellules[1]):
                    # ⚠️ Une ligne de point qu'on SAUTE en silence est pire qu'une
                    # ligne fausse : elle sort du compte sans rien dire. Mesuré le
                    # 16/09/2026 — sept lignes ouvraient sur DEUX barres (`||`),
                    # artefact d'une fusion d'intégration. `cellules[1]` valait la
                    # chaîne vide, donc `NUMERO` ne matchait pas, donc les sept
                    # points étaient invisibles : le compteur rendait 8 222 au lieu
                    # de 8 229. Le fichier avait l'air juste à l'œil et la garde
                    # était verte. Si un numéro de point apparaît AILLEURS dans la
                    # ligne, la ligne est une ligne de point mal formée — on le dit.
                    if any(NUMERO.match(c) for c in cellules[2:]):
                        egare = next(c for c in cellules[2:] if NUMERO.match(c))
                        trouvees.append(
                            Anomalie(
                                "LIGNE-MAL-FORMEE",
                                chemin,
                                numero_ligne,
                                egare,
                                "le numéro n'est pas dans la première cellule — "
                                "la ligne ouvre sur une barre en trop et sort du compte",
                            )
                        )
                    continue
                numero = cellules[1]
                index = _index_etat(cellules)
                if index is None:
                    suffixe = _etat_suffixe(cellules)
                    if suffixe is not None:
                        trouvees.append(
                            Anomalie(
                                "ETAT-SUFFIXE",
                                chemin,
                                numero_ligne,
                                numero,
                                f"l'état est « {suffixe} » — il s'écrit nu, la date va dans la preuve",
                            )
                        )
                    else:
                        trouvees.append(
                            Anomalie(
                                "ETAT-INCONNU",
                                chemin,
                                numero_ligne,
                                numero,
                                "aucune cellule ne porte un des sept états du vocabulaire "
                                f"({', '.join(ETATS)})",
                            )
                        )
                    continue
                preuve = " ".join(cellules[index + 1 :])
                if (
                    cellules[index] == "recetté"
                    and NON_MESURE.search(preuve)
                    and not _cite_un_commit(preuve)
                ):
                    trouvees.append(
                        Anomalie(
                            "RECETTE-NON-MESURE",
                            chemin,
                            numero_ligne,
                            numero,
                            "marqué `recetté`, sa preuve dit « NON MESURÉ » et ne cite AUCUN "
                            "commit (une branche de worktree n'en est pas un) — un point ne se "
                            "recette qu'après avoir été VU tourner en production ; "
                            "l'état juste est `livré`",
                        )
                    )
    return trouvees


def registres(racine: str) -> list[str]:
    return sorted(glob.glob(os.path.join(racine, ".claude", "notes", "registre-*.md")))


def racine_du_depot() -> str:
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main() -> int:
    chemins = sys.argv[1:] or registres(racine_du_depot())
    if not chemins:
        print("aucun registre trouvé — la garde refuse de rendre un vert sur du vide")
        return 1
    points = lire_points(chemins)
    trouvees = anomalies(chemins)
    print(f"{len(points)} points lus dans {len(chemins)} registres")
    for anomalie in trouvees:
        print(f"  {anomalie}")
    if trouvees:
        print(f"\n{len(trouvees)} anomalie(s) — voir tools/registres/coherence.py pour la raison de chacune")
        return 1
    print("cohérence des registres : OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
