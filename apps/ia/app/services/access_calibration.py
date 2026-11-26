"""Le jeu de calibration de la barrière d'achat — 28 comptes jugés par un humain.

─────────────────────────────────────────────────────────────────────────────
POURQUOI CE FICHIER EXISTE
─────────────────────────────────────────────────────────────────────────────
Le plan du 26/08/2026 fait de « comptes “ouverts” finalement bloqués < 30 % »
son **indicateur n°1**, celui qui conditionne la sortie de phase. Or cet
indicateur ne se mesure qu'EN PRODUCTION, après que des commerciaux ont perdu
du temps sur des comptes mal classés.

La spécification du 21/08 portait le seul dispositif qui permettait de savoir
AVANT : « les 13 comptes de référence → concordance ≥ 12/13 avec le jugement
humain ». La consolidation du 26/08 l'a perdu — « 13 comptes », « 12/13 » :
zéro occurrence dans les vingt-deux documents.

**Sans lui, le plan n'a aucun moyen de vérifier son propre indicateur n°1 avant
d'avoir échoué.** C'est une boucle de contrôle ouverte, et c'est ce que ce
module referme.

─────────────────────────────────────────────────────────────────────────────
D'OÙ VIENNENT LES JUGEMENTS — ET POURQUOI ILS NE SONT PAS INVENTÉS
─────────────────────────────────────────────────────────────────────────────
**D745 — correction du 30/08.** Une version antérieure de ce docstring
affirmait que « les 13 comptes d'origine ne sont nulle part ». C'était faux :
ils sont dans `agent_docs/sources/tomes-md/T3.md:218-236` — le document
Pariente (gitignoré, mais présent sur disque), avec Sprint / classe / barrière
narrative / accord pour chacun, et la phrase source du seuil : « Concordance
sur 12 cas sur 13 » (`T3.md:236`).

Ils ne sont **pas pour autant embarqués tels quels** : sur 13, la classe
humaine n'est écrite EN CLAIR que pour 11. Pour Fnac Darty, T3.md ne donne que
« modèle plus sévère » (donc plus indulgent que C, probablement B — mais
*probablement* n'est pas *écrit*) ; pour Fortuneo/Arkéa, Pariente écrit
explicitement qu'il ne tranche pas (« à qualifier »). Deviner ces deux lettres
serait réinterpréter un verdict humain — exactement l'erreur que ce module
s'interdit de faire sur les données de Théo, deux paragraphes plus bas. On ne
fait donc pas d'exception pour Pariente : ses 11 comptes non ambigus ne sont
pas ajoutés non plus, pour ne pas fabriquer un jeu à deux régimes de preuve
(certains comptes réinterprétés, d'autres non). Cité pour mémoire, pas embarqué.

**Petite validation croisée, en passant** : `Vinci` est présent dans les deux
jeux. Pariente écrit qu'il vise **VINCI Autoroutes**, pas le siège Nanterre
(« Ne pas attaquer le siège Nanterre », `T3.md:239`) — la barrière du GROUPE
(D chez Pariente) n'est pas celle de l'ENTITÉ qu'il cible réellement. Théo,
indépendamment, classe `Vinci` en **B** avec le verdict « à travailler par
filiale — groupe décentralisé, portes multiples ». Les deux jugements humains,
pris séparément, pointent la même nuance : c'est `BEL-ADR-003` (scorer
l'entité, pas le groupe — encore hors périmètre de ce module).

On prend donc des jugements humains RÉELS, datés et sourcés — les colonnes
`sales_accessibility_level` et `sales_accessibility_score` du fichier CRM de
Théo, où 54 lignes portent une analyse d'accessibilité écrite à la main, et où
CHAQUE ligne retenue porte une lettre explicite — jamais déduite.

Dédoublonnées par groupe, elles donnent **28 sociétés distinctes** — plus que
les treize demandées, et sans la moindre lettre reconstituée.

Le seul calcul appliqué à ces jugements est un changement d'ÉCHELLE :
`barrière = (100 − score) / 10`, puis les bornes de classe d'`access_scoring`.
Le verdict de Théo n'est pas réinterprété ; il est mis sur l'axe du modèle.

─────────────────────────────────────────────────────────────────────────────
CE QUE LE JEU NE MESURE PAS ENCORE, ET POURQUOI ON LE DIT
─────────────────────────────────────────────────────────────────────────────
Le modèle a besoin de firmographie — statut, effectif, cotation, commande
publique, établissements. Le fichier de Théo n'en porte aucune de façon
exploitable : sa colonne de taille est de la prose (« Grand Groupe », « CAC 40 »),
et sur 1 247 lignes **six SIREN seulement sont valides**.

Résoudre 28 grands groupes français par leur NOM est précisément l'ambiguïté que
le résolveur du produit existe pour traiter — le premier « MICHELIN » du registre
public est une coquille à un établissement. Une résolution bâclée mesurerait les
erreurs du résolveur, pas la justesse du modèle de barrière.

Donc : la concordance vaut **`None`**, jamais zéro, et {@link concordance} NOMME
ce qui manque. C'est la même règle que partout ailleurs dans ce produit — « non
mesuré » n'est pas « mesuré à zéro » — appliquée à sa propre calibration.

Ce que le jeu prouve DÉJÀ, lui, est réel : sur 28 comptes réels privés de
firmographie, le modèle doit REFUSER de produire une classe (garde-fou des trois
proxies minimum). Un modèle qui trancherait quand même serait la panne la plus
coûteuse du produit, et c'est celle-là qu'on peut tester aujourd'hui.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

AccessClass = Literal["A", "B", "C", "D"]

#: Le seuil du 21/08 : douze accords sur treize. Exprimé en PROPORTION pour
#: rester vrai quel que soit le nombre de comptes du jeu — le tome dit 12/13,
#: le jeu en porte 28, et ce qui compte est le taux, pas le compte.
CONCORDANCE_TARGET = 12 / 13

#: Sous ce nombre de comptes réellement comparables, on ne publie AUCUN taux.
#: Un taux sur deux comparaisons vaut 0 % ou 100 %, et les deux sont faux —
#: même règle que les indicateurs de `measurability.ts`.
MIN_COMPARABLE = 10

_FIXTURE = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "access_calibration.json"


@dataclass(frozen=True)
class CalibrationEntry:
    """Un compte du jeu : ce qu'un humain en a dit, et ce qu'on sait de lui."""

    company: str
    human_class: AccessClass
    human_barrier: float
    human_verdict: str
    #: La firmographie. Chaque `None` est un proxy que le modèle déclarera
    #: NON MESURABLE — et qu'il nommera plutôt que de le remplacer par zéro.
    statut: str | None
    headcount: Any
    listed: bool | None
    public_procurement: bool | None
    open_establishments: int | None

    @property
    def has_firmography(self) -> bool:
        """Le compte porte-t-il de quoi faire tourner le modèle ?

        Trois proxies au moins — c'est le plancher d'`access_scoring`, et le
        répéter ici serait un second seuil qui divergerait au premier
        ajustement. On compte donc ce qui est RENSEIGNÉ, et le modèle reste
        seul juge de ce qu'il peut estimer.
        """
        known = [self.statut, self.headcount, self.listed, self.public_procurement, self.open_establishments]
        return sum(1 for value in known if value is not None) >= 3


@lru_cache(maxsize=1)
def calibration_set() -> tuple[CalibrationEntry, ...]:
    """Les comptes du jeu, lus depuis le fichier figé.

    Figé et daté : un jeu de calibration qui bouge en même temps que le modèle
    ne calibre plus rien — il enregistre l'accord du modèle avec lui-même.
    """
    raw = json.loads(_FIXTURE.read_text(encoding="utf-8"))
    return tuple(
        CalibrationEntry(
            company=item["company"],
            human_class=item["human_class"],
            human_barrier=item["human_barrier"],
            human_verdict=item["human_verdict"],
            statut=item.get("statut"),
            headcount=item.get("headcount"),
            listed=item.get("listed"),
            public_procurement=item.get("public_procurement"),
            open_establishments=item.get("open_establishments"),
        )
        for item in raw["entries"]
    )


def calibration_metadata() -> dict[str, Any]:
    """La provenance du jeu — la source, la date, la règle d'échelle, les limites."""
    raw = json.loads(_FIXTURE.read_text(encoding="utf-8"))
    return {key: value for key, value in raw.items() if key != "entries"}


#: Deux classes voisines (B vs C) ne sont pas la même erreur que deux classes
#: opposées (A vs D) : la première fait perdre un peu de temps, la seconde
#: envoie un commercial sur un compte verrouillé — ou lui fait manquer un
#: compte ouvert. On les compte donc à part.
_ORDER: dict[str, int] = {"A": 0, "B": 1, "C": 2, "D": 3}


def concordance(model_classes: dict[str, AccessClass | None]) -> dict[str, Any]:
    """Le taux d'accord entre le modèle et le jugement humain.

    `model_classes` associe un nom de société à la classe que le modèle produit,
    ou à `None` quand il REFUSE d'en produire une. Un refus n'est pas un
    désaccord : c'est le comportement attendu sur un compte sous-informé, et le
    compter comme une erreur punirait exactement l'honnêteté qu'on veut.

    Rend toujours les quatre nombres qui expliquent le résultat — et `rate` à
    `None` tant qu'il n'y a pas assez de comparaisons pour qu'un taux veuille
    dire quelque chose.

    Garde **GA-201** (`test_access_calibration.py::test_GA_201_...`) : elle
    prouve que ce module LIT un corpus non vide et qu'il SAIT DIRE NON — casser
    des classifications réelles doit faire chuter le taux sous `CONCORDANCE_TARGET`.
    C'est la garde qui manquait à T-081 : le harnais existait, mais rien ne
    vérifiait que son corpus n'était pas vide, ni que casser une classification
    changeait quoi que ce soit au résultat.

    ⚠️ **Aucun appelant de production au 30/08.** Ce module reste un harnais de
    calibration hors-ligne — `calibration_set()`/`concordance()` ne sont
    consommés que par les tests. Le brancher à un vrai appel du modèle (Claude,
    ou `access_barrier` sur des proxies réels) sur les 28 comptes du jeu est un
    lot séparé, hors périmètre de celui-ci.
    """
    entries = calibration_set()
    agreed: list[str] = []
    near_miss: list[dict[str, Any]] = []
    opposed: list[dict[str, Any]] = []
    declined: list[str] = []
    unknown: list[str] = []

    for entry in entries:
        if entry.company not in model_classes:
            unknown.append(entry.company)
            continue
        produced = model_classes[entry.company]
        if produced is None:
            declined.append(entry.company)
            continue
        if produced == entry.human_class:
            agreed.append(entry.company)
            continue
        gap = abs(_ORDER[produced] - _ORDER[entry.human_class])
        record = {"company": entry.company, "human": entry.human_class, "model": produced, "gap": gap}
        (near_miss if gap == 1 else opposed).append(record)

    comparable = len(agreed) + len(near_miss) + len(opposed)
    measurable = comparable >= MIN_COMPARABLE
    return {
        "measurable": measurable,
        # `None`, JAMAIS 0 : « on n'a pas assez comparé » et « le modèle se
        # trompe toujours » sont deux informations opposées.
        "rate": (len(agreed) / comparable) if measurable and comparable else None,
        "target": CONCORDANCE_TARGET,
        "meets_target": (len(agreed) / comparable >= CONCORDANCE_TARGET) if measurable and comparable else None,
        "agreed": agreed,
        "near_miss": near_miss,
        "opposed": opposed,
        "declined": declined,
        "not_submitted": unknown,
        "missing": (
            []
            if measurable
            else [f"{MIN_COMPARABLE - comparable} comparaison(s) manquante(s) pour qu'un taux soit publiable"]
        ),
    }
