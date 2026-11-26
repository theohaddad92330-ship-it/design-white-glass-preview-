"""La catégorie commerciale d'une offre d'emploi — #3204, LAU-FINAL-210
(retour bêta 28/09/2026, Louis Schlegel).

> « Transformer les offres d'emploi en informations commerciales utiles sans
> les présenter comme des besoins de prestation certains. »

Zéro LLM, zéro appel réseau : reclasse le code natif DÉJÀ vérifié par
`contract_model.job_kind` (voir son docblock — codes France Travail vérifiés
le 19/09/2026) en catégorie commerciale. Règles explicites de la spec :
CDI ≠ besoin freelance, stage ≠ budget prestation — un code non vérifié ne
retombe donc JAMAIS sur `contracting`/`internal_hiring`, seulement sur
`skill_demand_signal` (la catégorie que la spec nomme elle-même pour « une
compétence recherchée, sans conclusion contractuelle »).

Une offre publiée par un intermédiaire (cabinet, plateforme — déjà détecté
par `intermediary_kind`, `discover_signals.py`) ne dit rien du besoin de
l'employeur nommé : `intermediated=True` écrase toute autre classification.
"""

from __future__ import annotations

from typing import Literal

HiringSignalClass = Literal[
    "internal_hiring",
    "contracting",
    "staffing_signal",
    "skill_demand_signal",
    "agency_posting",
]

_CLASS_BY_JOB_KIND: dict[str, HiringSignalClass] = {
    "permanent": "internal_hiring",  # CDI — recrutement salarié explicite
    "fixedTerm": "internal_hiring",  # CDD — recrutement salarié explicite
    "freelance": "contracting",  # LIB (profession libérale) — prestation explicite
    "interim": "staffing_signal",  # MIS/DIN — besoin de capacité, modèle d'achat ESN non prouvé
}


def classify_hiring_signal(job_kind_value: str | None, *, intermediated: bool = False) -> HiringSignalClass:
    """La catégorie commerciale d'une offre, à partir du `job_kind` DÉJÀ
    vérifié (voir `contract_model.job_kind`) et de son éventuelle
    intermédiation. Toujours défini — jamais `None` : un code non vérifié
    (« other », absent) rend `skill_demand_signal`, la catégorie prévue par
    la spec pour ce cas exact plutôt qu'un silence."""
    if intermediated:
        return "agency_posting"
    return _CLASS_BY_JOB_KIND.get(str(job_kind_value or ""), "skill_demand_signal")


__all__ = ["HiringSignalClass", "classify_hiring_signal"]
