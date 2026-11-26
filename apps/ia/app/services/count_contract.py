"""#213.2 (#3207, #3228) — LE CONTRAT DE COMPTAGE, QUINZE CHAMPS.

« 41 consultants observés » ne dit RIEN tant qu'on ignore ce qui est compté :
41 personnes ? 41 parcours ? 41 CV ? 41 occurrences dans plusieurs sources ?
Ces nombres ne sont pas interchangeables (LAU-FINAL-213, exemple critique de
l'issue). `chat_turn_plan.py::numbers_missing_unit` (#213.1/.3/.7, déjà livré)
vérifie qu'un nombre de la RÉPONSE porte un mot d'unité à proximité — une
heuristique de PROXIMITÉ TEXTUELLE, volontairement pas une classification
sémantique par `object_type`. Ce module est cette classification : le
COMPOSITEUR qui projette ce qu'un outil de chat sait DÉJÀ d'un comptage sur
la forme à quinze champs que l'issue nomme, pour qu'un outil qui rend un
compte le PRODUISE structuré plutôt que de compter sur une phrase qui porte
son unité par hasard.

Comme `entity_resolution.py` (#2284) pour l'identité d'entreprise : ce module
NE RECALCULE RIEN. Il ne va chercher aucune donnée, n'appelle aucun réseau —
il prend ce que l'appelant a déjà mesuré et le nomme dans le contrat.

``OBJECT_TYPES`` est le MIROIR des UNITÉS #213.3 déjà gardées par
``chat_turn_plan.py::_UNIT_WORDS`` (garde jumelle :
``test_count_contract.py::test_object_types_mirror_the_unit_words_guard``) —
GA-26 vaut aussi entre deux fichiers du même service : un mot qui change d'un
côté sans l'autre casse la garde, pas seulement l'intention.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

#: #213.3 — les UNITÉS à distinguer, telles que nommées par le corps
#: LAU-FINAL-213. Miroir de `chat_turn_plan._UNIT_WORDS` (le pluriel/l'accord y
#: est géré par le regex ; ici la forme canonique, singulier, sert de valeur de
#: `object_type`).
OBJECT_TYPES: tuple[str, ...] = (
    "personne",
    "parcours",
    "mission",
    "experience",
    "observation",
    "entreprise",
    "filiale",
    "projet",
    "contact",
    "signal",
    "source",
    "offre",
    "relation",
)

#: #213.7 — « chiffre sans... repère de période OU de statut temporel » :
#: un compte porte forcément l'un des deux, jamais un troisième état deviné.
CURRENT_OR_HISTORICAL: tuple[str, ...] = ("current", "historical")


class CountContract(BaseModel):
    """Miroir pydantic de ce que le contrat expose sur le fil (snake_case,
    comme tout le corps de `/chat/message` — même convention que
    `ThreadPersistentScope`)."""

    metric_name: str
    object_type: str
    unique_key: str
    scope: str
    entity_scope: str
    period: str | None = None
    current_or_historical: str
    source_layers: list[str]
    raw_count: int
    # « Non mesuré » n'est jamais 0 (doctrine) : un comptage qu'aucune couche
    # ne sait dédupliquer/résoudre encore reste `None`, jamais recopié depuis
    # `raw_count` — une égalité DEVINÉE vaudrait moins que l'absence.
    deduplicated_count: int | None = None
    resolved_count: int | None = None
    confidence: int | None = None
    coverage: str | None = None
    suppression_threshold: int | None = None
    caveats: list[str] = []

    def to_wire(self) -> dict[str, Any]:
        return self.model_dump()


def build_count_contract(
    *,
    metric_name: str,
    object_type: str,
    unique_key: str,
    scope: str,
    entity_scope: str,
    current_or_historical: str,
    source_layers: list[str],
    raw_count: int,
    period: str | None = None,
    deduplicated_count: int | None = None,
    resolved_count: int | None = None,
    confidence: int | None = None,
    coverage: str | None = None,
    suppression_threshold: int | None = None,
    caveats: list[str] | None = None,
) -> CountContract:
    """Construit le contrat. Un `object_type` hors `OBJECT_TYPES` ou un
    `current_or_historical` hors `CURRENT_OR_HISTORICAL` est un bug de
    l'appelant (un objet non classé n'est pas censé exister) : levée
    immédiate, jamais une valeur devinée qui masquerait l'erreur jusqu'à
    l'écran."""
    if object_type not in OBJECT_TYPES:
        raise ValueError(
            f"object_type inconnu : {object_type!r} — voir count_contract.OBJECT_TYPES"
        )
    if current_or_historical not in CURRENT_OR_HISTORICAL:
        raise ValueError(
            f"current_or_historical inconnu : {current_or_historical!r} — "
            "voir count_contract.CURRENT_OR_HISTORICAL"
        )
    return CountContract(
        metric_name=metric_name,
        object_type=object_type,
        unique_key=unique_key,
        scope=scope,
        entity_scope=entity_scope,
        period=period,
        current_or_historical=current_or_historical,
        source_layers=list(source_layers),
        raw_count=raw_count,
        deduplicated_count=deduplicated_count,
        resolved_count=resolved_count,
        confidence=confidence,
        coverage=coverage,
        suppression_threshold=suppression_threshold,
        caveats=list(caveats or []),
    )


def is_below_suppression_threshold(
    raw_count: int, suppression_threshold: int | None
) -> bool:
    """#213.6 — PETITS VOLUMES : en dessous du seuil, la RÈGLE dit de ne pas
    afficher un nombre précis et de préférer une formulation agrégée. Cette
    fonction ne DÉCIDE de rien côté affichage (aucun texte, aucune formulation
    agrégée générée ici — ce serait deviner la phrase à la place de l'appelant,
    qui seul sait comment SA métrique se raconte) : elle donne juste le VERDICT
    booléen dont un appelant a besoin pour choisir sa formulation.

    `suppression_threshold=None` = aucun seuil connu pour cette métrique :
    jamais `False` deviné, le verdict est alors `False` par absence de règle,
    pas par mesure sous le seuil — distinction que l'appelant doit pouvoir
    faire en lisant `suppression_threshold` lui-même sur le contrat."""
    return suppression_threshold is not None and raw_count < suppression_threshold
