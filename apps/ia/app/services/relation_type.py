"""#3866 — LE TYPE DE RELATION d'un compte candidat (décision Louis 11/10).

Quatre types, rien d'autre : client final · ESN concurrente · partenaire · intermédiaire
(cabinet de recrutement, plateforme, portage). Plus un état NOMMÉ, « non déterminé » : un
type qu'on ne sait pas n'est jamais deviné.

Déduit de la FORME juridique ET de l'activité — jamais du NAF seul. Une entité informatique
interne d'un groupe (DSI mutualisée en GIE) porte un NAF d'ESN sans en être une : elle
sort « non déterminé », pas « ESN concurrente » (#3866).

Ne recalcule rien : la typologie vit dans `actor_typology.classify_actor_type` (GA-26).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from app.services.actor_typology import ActorType, classify_actor_type


class RelationType(StrEnum):
    END_CLIENT = "end_client"
    COMPETING_ESN = "competing_esn"
    PARTNER = "partner"
    INTERMEDIARY = "intermediary"
    UNDETERMINED = "undetermined"


RELATION_LABELS: dict[RelationType, str] = {
    RelationType.END_CLIENT: "client final",
    RelationType.COMPETING_ESN: "ESN concurrente",
    RelationType.PARTNER: "partenaire",
    RelationType.INTERMEDIARY: "intermédiaire",
    RelationType.UNDETERMINED: "type non déterminé",
}

# Catégorie juridique INSEE 6540 = groupement d'intérêt économique : la forme que prend
# l'informatique mutualisée d'un groupe. Avec un NAF d'ESN, elle empêche de conclure.
_GIE_CATEGORIES = frozenset({"6540", "6541", "6542", "6543", "6544", "6545", "6546", "6547", "6548"})

_INTERMEDIARY_TYPES = frozenset(
    {
        ActorType.CABINET_RECRUTEMENT,
        ActorType.PLATEFORME_INTERMEDIATION,
        ActorType.ENTREPRISE_INTERIM,
        ActorType.COURTIER_OU_APPORTEUR_AFFAIRES,
    }
)
_PORTAGE_MARKERS = ("portage salarial", "portage")


@dataclass(frozen=True)
class RelationVerdict:
    type: RelationType
    #: Pourquoi on ne sait pas — seulement quand `type` est `UNDETERMINED`.
    reason: str | None = None

    @property
    def label(self) -> str:
        return RELATION_LABELS[self.type]


def _legal_digits(legal_category: object) -> str:
    return "".join(ch for ch in str(legal_category or "") if ch.isdigit())[:4]


def relation_type_of(
    *,
    naf: object = None,
    name: object = None,
    legal_category: object = None,
    is_known_esn_competitor: bool = False,
    is_declared_partner: bool = False,
) -> RelationVerdict:
    actor = classify_actor_type(
        naf=naf, name=name, is_known_esn_competitor=is_known_esn_competitor, is_declared_partner=is_declared_partner
    )
    if actor is ActorType.PARTENAIRE:
        return RelationVerdict(RelationType.PARTNER)
    if actor in _INTERMEDIARY_TYPES or (
        any(marker in str(name or "").lower() for marker in _PORTAGE_MARKERS)
        and actor is not ActorType.SOURCE_DE_DONNEES
    ):
        return RelationVerdict(RelationType.INTERMEDIARY)
    if actor in (ActorType.ESN, ActorType.ESN_CONCURRENTE):
        if _legal_digits(legal_category) in _GIE_CATEGORIES:
            return RelationVerdict(RelationType.UNDETERMINED, "possible_internal_it")
        return RelationVerdict(RelationType.COMPETING_ESN)
    if actor is ActorType.CLIENT_FINAL:
        return RelationVerdict(RelationType.END_CLIENT)
    if actor is ActorType.AMBIGU_CONSEIL_OU_ESN:
        return RelationVerdict(RelationType.UNDETERMINED, "ambiguous_activity_code")
    return RelationVerdict(RelationType.UNDETERMINED, "no_activity_code" if not naf else "unclassified")


RELATION_REASON_LABELS: dict[str, str] = {
    "possible_internal_it": "forme juridique de groupement : peut être l'informatique interne d'un groupe, pas une ESN",
    "ambiguous_activity_code": "code d'activité partagé entre ESN et cabinets de conseil",
    "no_activity_code": "aucun code d'activité au registre",
    "unclassified": "aucun signal ne permet de le ranger",
}
