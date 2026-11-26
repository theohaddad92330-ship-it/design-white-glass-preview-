"""Couverture méthode ↔ situations commerciales (#3670.1, #3670.5).

« Document non retrouvé = couverture à vérifier, jamais intégré par déduction. »
Ce registre ne fabrique aucune règle : il dit, pour chacune des sept situations
nommées par #3670, quel pack (`method_packs.METHOD_PACK_RULES`) ou quel service
la commande, ou — faute de preuve — qu'elle reste « à vérifier ». Le statut
`a_verifier` est un état honnête, pas une dette cachée : un test refuse de le
promouvoir sans `rule_id` retrouvé dans les packs.

Il dit aussi QUI consomme la méthode (`METHOD_CONSUMERS`) : le chat de Laura,
et — depuis #3670.5 — l'analyse de compte, l'approche, la séquence et l'appel,
tous par `method_consumers.method_block_for`. Un module non câblé resterait listé
`False` avec sa raison plutôt que passé sous silence.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

CoverageStatus = Literal["pack", "service", "a_verifier"]
OutputFormat = Literal["diagnostic_prochaine_action", "angle_message", "discours_objections"]


@dataclass(frozen=True)
class SituationCoverage:
    situation: str
    label: str
    status: CoverageStatus
    rule_ids: tuple[str, ...] = ()
    service: str | None = None
    missing: str | None = None


SITUATION_COVERAGE: tuple[SituationCoverage, ...] = (
    SituationCoverage("ouvrir_un_compte", "ouvrir un compte", "pack", ("pack_ouvrir_un_compte", "pack_compte_grand_groupe_ferme")),
    SituationCoverage(
        "relais_terrain",
        "relais terrain",
        "service",
        service="apps/ia/app/knowledge/buying_committee.py (QUADRANT_FIELD_RELAY)",
        missing="aucun pack nommé : le service porte le quadrant, pas un document de méthode validé",
    ),
    SituationCoverage(
        "demande_orientation",
        "demande d'orientation (aiguillage)",
        "a_verifier",
        missing="aucun pack ni service ne nomme l'aiguillage ; document source à désigner par Louis",
    ),
    SituationCoverage("reprise_relation", "reprise de relation", "pack", ("pack_reactivation",)),
    SituationCoverage(
        "faire_connaitre_expertise",
        "faire connaître une expertise",
        "a_verifier",
        missing="aucun pack ni service ; document source à désigner par Louis",
    ),
    SituationCoverage("presenter_profil", "présenter un profil", "pack", ("pack_consultant_disponible",)),
    SituationCoverage(
        "preparer_appel",
        "préparer un appel",
        "a_verifier",
        missing="`reunion_de_decouverte` reste absent de METHOD_PACK_RULES (aucun énoncé source)",
    ),
)

# Format stable par intention (#3670) : la méthode structure, ne se récite pas.
OUTPUT_FORMAT_BY_INTENT: dict[str, OutputFormat] = {
    "compte": "diagnostic_prochaine_action",
    "approche": "angle_message",
    "appel": "discours_objections",
}

# (module, câblé, appelant `fichier` ou raison). Tous passent par UNE porte,
# `app/services/method_consumers.py::method_block_for` (#3670.5) : une règle
# remplacée ne peut donc pas réapparaître dans un module (#3670.6).
METHOD_CONSUMERS: tuple[tuple[str, bool, str], ...] = (
    ("chat_laura", True, "apps/ia/app/routers/chat.py"),
    ("approches", True, "apps/ia/app/routers/message.py"),
    # une séquence génère chacun de ses pas par /message/generate (ia.client.ts) : même route
    ("sequences", True, "apps/ia/app/routers/message.py"),
    ("appels", True, "apps/ia/app/routers/battlecard.py"),
    ("analyse_compte", True, "apps/ia/app/routers/phase4_plan.py"),
)


def uncovered_situations() -> tuple[str, ...]:
    """Situations dont la couverture reste à vérifier — jamais « intégrées » par déduction."""
    return tuple(c.situation for c in SITUATION_COVERAGE if c.status == "a_verifier")
