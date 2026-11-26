"""Audit mécanique des sources de méthode contre la doctrine (#3274.1, tranche).

Les quatre sources (``business_rules``, ``objection_library``, ``sector_playbooks``,
``competitor_intel``) ne doivent contenir, dans AUCUNE de leurs feuilles texte, ce
que la doctrine interdit d'afficher : une probabilité de closing, un fournisseur
de données nommé, un envoi ou une fusion automatique. Le test lit les fichiers
réels (il prouve qu'il lit : compteur de feuilles minimal) et sait dire NON
(cas négatif sur un texte fautif). Ce n'est PAS l'audit règle par règle
KEEP/MERGE/SUPERSEDED — c'est son filtre mécanique, exhaustif sur les 4 sources.
"""

from __future__ import annotations

import dataclasses
import re

from app.knowledge import _competitors, _sectors, objection_library
from app.knowledge import business_rules

FORBIDDEN = {
    "probabilité de closing": re.compile(
        r"probabilit[ée]|chances? de (closing|signer|gagner)|taux de closing|pipeline pondéré", re.I
    ),
    "fournisseur nommé": re.compile(r"\b(apollo|pappers|firecrawl|brave search|dataforge|lusha|kaspr)\b", re.I),
    "envoi/fusion automatique": re.compile(
        r"envoi automatique|envoie automatiquement|fusionn?e? automatiquement|auto-?send", re.I
    ),
}


def _leaves(node: object):
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for value in node.values():
            yield from _leaves(value)
    elif isinstance(node, (list, tuple)):
        for value in node:
            yield from _leaves(value)
    elif dataclasses.is_dataclass(node) and not isinstance(node, type):
        yield from _leaves(dataclasses.asdict(node))


def _sources() -> dict[str, list[str]]:
    return {
        "business_rules": list(_leaves(list(business_rules.BUSINESS_RULES))),
        "objection_library": list(_leaves(objection_library())),
        "sector_playbooks": list(_leaves(_sectors())),
        "competitor_intel": list(_leaves(_competitors())),
    }


def _violations(leaves: list[str]) -> list[tuple[str, str]]:
    return [(label, leaf[:80]) for leaf in leaves for label, rx in FORBIDDEN.items() if rx.search(leaf)]


def test_audit_reads_real_content() -> None:
    sources = _sources()
    for name, minimum in (("objection_library", 100), ("sector_playbooks", 300), ("competitor_intel", 150)):
        assert len(sources[name]) >= minimum, f"{name}: l'audit ne lit rien"


def test_sources_hold_no_doctrine_violation() -> None:
    for name, leaves in _sources().items():
        assert _violations(leaves) == [], name


def test_audit_can_say_no() -> None:
    assert _violations(["Chance de closing : 60 % grâce à Apollo"])
    assert _violations(["On fusionne automatiquement les doublons"])
    assert _violations(["Un texte neutre sur le cloud"]) == []
