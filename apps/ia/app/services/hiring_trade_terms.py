"""#4438.1 / #4408.1 (recette prod 23/10) — « qui recrutent <métier> » : le MÉTIER se lit en intitulés d'offres.

« Trouve-moi des comptes data qui recrutent » rendait 6 comptes du registre (SFR, La Voix du Nord…) : le métier
ne faisait que RÉORDONNER la liste (``laura_call_ranking.order_for_call``) et Laura avouait que le filtre
recrutement n'avait pas été appliqué. Le métier dit devient ici une poignée d'intitulés d'offres — ceux que le
moteur de Découvrir cherche (``discover_skill_offers``) — et les comptes sont choisis PAR leurs offres datées.

Un mot qui n'est pas un métier connu ne devient jamais un filtre deviné : ``(None, [])``, le chemin d'avant reste.
"""

from __future__ import annotations

from collections.abc import Iterable

from app.services.domain_job_filters import fold

#: Budget de la recherche par métier : au plus 8 intitulés interrogés (par paires, la borne d'appels de la
#: recherche par compétence ``SKILL_MAX_TERMS``), soit au plus 4 lectures du moteur en parallèle.
HIRING_TRADE_MAX_TERMS = 8

#: Le métier (forme pliée) → (libellé dit, intitulés d'offres cherchés). Un seul endroit (GA-26).
_TRADES: dict[str, tuple[str, tuple[str, ...]]] = {
    "data": ("data", ("data engineer", "data analyst", "data scientist", "ingénieur data")),
    "developpeur": ("développeurs", ("développeur", "développeur web", "full stack", "ingénieur logiciel")),
    "devops": ("cloud et DevOps", ("ingénieur devops", "ingénieur cloud")),
    "cyber": ("cybersécurité", ("cybersécurité", "analyste soc")),
    "chef de projet": ("chefs de projet", ("chef de projet", "scrum master")),
}

#: Les écritures d'un même métier (pliées, sans accent).
_ALIASES: dict[str, str] = {
    "data": "data",
    "donnee": "data",
    "donnees": "data",
    "big data": "data",
    "developpeur": "developpeur",
    "developpeurs": "developpeur",
    "developpeuse": "developpeur",
    "developpeuses": "developpeur",
    "developpement": "developpeur",
    "dev": "developpeur",
    "devs": "developpeur",
    "devops": "devops",
    "cloud": "devops",
    "cyber": "cyber",
    "cybersecurite": "cyber",
    "chef de projet": "chef de projet",
    "chefs de projet": "chef de projet",
}


def trade_offer_terms(words: Iterable[object]) -> tuple[str | None, list[str]]:
    """(libellé du métier, intitulés d'offres) pour le PREMIER métier connu des mots dits ; sinon ``(None, [])``."""
    for word in words:
        key = _ALIASES.get(fold(word).strip())
        if key:
            label, terms = _TRADES[key]
            return label, list(terms)[:HIRING_TRADE_MAX_TERMS]
    return None, []
