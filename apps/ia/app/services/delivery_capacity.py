"""#3226 (#3202.6, X13) — LA CAPACITÉ DE DELIVERY, lue par le plan.

Huitième dimension que l'archétype du compte cible influence : ce qu'on peut
réellement staffer. La donnée est MESURÉE côté API (consultants actifs ayant eu
des affectations et n'en ayant aucune en cours — `DeliveryService`), jamais
déduite ici. Absente (pont éteint, lecture en échec) : aucune ligne — un
« zéro » ne s'invente pas. Jamais de probabilité (doctrine).
"""

from __future__ import annotations

from typing import Any


#: Les trois déclarations de capacité de delivery, libellé + clé du profil. UNE
#: liste (GA-26) : le prompt de Laura (`bellum_advisor.py`), le plan
#: (`bellum_plan.py`) et le résultat de `get_capacity` nomment la même chose.
DECLARED_CAPACITY_FIELDS: tuple[tuple[str, str], ...] = (
    ("Consultants en mission", "consultantsOnMission"),
    ("Vivier actif", "consultantsInPipe"),
    ("Intercontrat déclaré", "availableConsultantsBand"),
)


def declared_capacity(profile: Any) -> dict[str, str] | None:
    """#3384 — ce que le commercial a DÉCLARÉ (jamais mesuré), par libellé. Une
    valeur non déclarée ne fait aucune ligne (jamais « 0 ») ; rien de déclaré →
    ``None``, et le résultat d'outil reste byte-identique."""
    if not isinstance(profile, dict):
        return None
    out = {label: str(profile[key]) for label, key in DECLARED_CAPACITY_FIELDS if profile.get(key)}
    return out or None


def undeclared_capacity_labels(profile: Any) -> list[str]:
    """#3384 (recette Y18) — les libellés NON déclarés, seulement quand au moins une
    déclaration existe : l'espace qui ne dit rien ne se voit pas lister trois absences
    (rien de déclaré → ``[]``, résultat d'outil byte-identique). Jamais de valeur."""
    if declared_capacity(profile) is None:
        return []
    return [label for label, key in DECLARED_CAPACITY_FIELDS if not profile.get(key)]


def _measured_count(capacity: Any) -> int | None:
    if not isinstance(capacity, dict):
        return None
    value = capacity.get("intercontractCount")
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        return None
    return value


def delivery_capacity_block(capacity: Any, company_name: str, *, partnership_candidate: bool = False) -> str:
    """Bloc de prompt PLAN ; ``""`` quand la capacité n'est pas mesurée.

    ``partnership_candidate`` (#3226, X50) : le COMPTE CIBLE est, par son archétype, un
    partenaire possible (ESN, cabinet…) — la capacité mesurée a alors un second usage,
    la co-traitance, que le bloc nomme sans jamais la promettre."""
    count = _measured_count(capacity)
    if count is None:
        return ""
    if count == 0:
        fact = "aucun consultant en intercontrat mesuré dans l'espace (aucune affectation en cours ne manque de suite)"
    else:
        plural = "s" if count > 1 else ""
        fact = f"{count} consultant{plural} sans affectation en cours (intercontrat, vivier actif) dans l'espace"
    block = (
        f"\n\n===== CAPACITÉ DE DELIVERY — POUR {company_name} (#3202.6) =====\n"
        f"Mesuré : {fact}.\n"
        "Consigne : appuie tout positionnement de consultants sur cette capacité réelle ; "
        "ne promets aucun démarrage ni staffing que cette mesure ne porte pas, et propose de "
        "vérifier la disponibilité exacte avant de t'engager auprès du compte."
    )
    if partnership_candidate:
        block += "\nCe compte est lui-même un acteur du métier (partenaire possible) : " + (
            "cette capacité peut nourrir une co-traitance, jamais promise avant vérification de la disponibilité."
            if count > 0
            else "aucun renfort à lui proposer tant qu'aucun consultant n'est disponible."
        )
    return block


__all__ = ["DECLARED_CAPACITY_FIELDS", "declared_capacity", "delivery_capacity_block", "undeclared_capacity_labels"]
