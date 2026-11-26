"""Enveloppe canonique du RÉSULTAT D'UN OUTIL de chat — #2852.6-53 (épopée
#2852, points routés HORS LOT depuis #2282 « TOOL RESULT ENVELOPE » le
24-25/09/2026, jamais triés jusqu'à ce lot).

Distincte de l'enveloppe de RÉPONSE (``packages/contracts/src/schemas/
chat-reply-envelope.ts``, #2429.2, déjà livrée) : celle-ci nomme ce qu'un
OUTIL a trouvé (statut, portée, sources), pas ce que Laura ÉCRIT au bout.

Aujourd'hui un outil de ``chat_tools.py`` qui ne peut pas répondre rend
``{"error": "texte en français"}`` — un texte non structuré comme SEUL
signal, exactement ce que #2282 nomme « AUCUN TEXTE NON STRUCTURÉ COMME SEULE
SORTIE ». Deux causes très différentes (une recherche qui a vraiment cherché
et n'a rien trouvé, un pont interne éteint) se lisaient alors pareil. Cette
enveloppe reste ADDITIVE : elle NOMME ce que l'appelant sait déjà (jamais une
seconde lecture, jamais une donnée devinée), au même titre que
``chatReplyEnvelopeSchema``.

Volontairement PLUS ÉTROIT que les ~24 champs demandés par #2282 : `evidence`,
`freshness` et `confidence` scoreraient une lecture DÉTERMINISTE d'une seule
source (notre base), et un score sans second axe pour le distinguer serait nu
— exactement ce que la doctrine interdit (« un score n'est jamais nu »).
Réservés aux outils multi-sources qui ont réellement de quoi les nourrir (le
compilateur de `run_account_search`, à faire — voir le bilan #2852). Pas de
`cost_reserved`/`cost_charged`/`refunded` ici non plus : une lecture base n'a
aucun coût crédité, l'inventer serait une donnée fictive.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class ToolResultStatus(str, Enum):
    """Les dix statuts de #2282 « STATUTS ». Le NO-GO qu'ils encodent :
    `empty` (une recherche COUVERTE et réussie n'a rien trouvé) ne se confond
    JAMAIS avec `not_covered` (la source ne permet pas de conclure) — Laura ne
    doit jamais transformer l'un en l'autre en « aucune entreprise ne
    correspond »."""

    SUCCESS = "success"
    PARTIAL = "partial"
    EMPTY = "empty"
    NOT_COVERED = "not_covered"
    PERMISSION_DENIED = "permission_denied"
    AMBIGUOUS = "ambiguous"
    TIMEOUT = "timeout"
    PROVIDER_ERROR = "provider_error"
    INVALID_INPUT = "invalid_input"
    CANCELLED = "cancelled"


class ToolResultEnvelope(BaseModel):
    status: ToolResultStatus
    # Le type de carte/résultat que l'outil rend (ex. `contact_list`) — jamais
    # devine côté modèle, toujours déclaré par l'appelant.
    result_type: str = Field(min_length=1)
    total_found: int | None = Field(default=None, ge=0)
    returned_count: int | None = Field(default=None, ge=0)
    # Les sources RÉELLEMENT interrogées, réussies, en échec — jamais une liste
    # inventée. Un outil à une seule source (notre base) porte un seul nom.
    sources_consulted: list[str] = Field(default_factory=list)
    sources_succeeded: list[str] = Field(default_factory=list)
    sources_failed: list[str] = Field(default_factory=list)
    # La PORTÉE effectivement appliquée (les critères retenus) — jamais un
    # résumé, les valeurs telles que l'outil les a comprises.
    scope: dict | None = None
    caveats: list[str] = Field(default_factory=list)
    unknowns: list[str] = Field(default_factory=list)
    partial_reason: str | None = None
    error_code: str | None = Field(default=None, pattern=r"^[a-z][a-z0-9_]+$")
    suggested_next_step: str | None = None
    # #2852.11 — la couverture UNIFIÉE d'un outil MULTI-sources : combien de
    # sources (anonymes — voir `coverage_from_degraded`) ont buté sur une
    # limite de capacité, combien ont cherché sans rien trouver, combien sont
    # RÉELLEMENT en échec. Jamais un total ni un ratio : aucune source du
    # catalogue ne sait dire combien de fournisseurs existent — un
    # dénominateur inventé serait une donnée fictive.
    coverage: dict[str, int] | None = None
    # #2852.24 — le temps RÉELLEMENT mesuré de l'appel, en millisecondes.
    # Absent tant que l'appelant ne chronomètre pas — jamais une estimation.
    duration_ms: int | None = Field(default=None, ge=0)
    # #2852.25/.26 — le curseur de la PAGE SUIVANTE : posé seulement quand une
    # page suivante existe réellement (jamais « null » affiché comme un fait),
    # relu tel quel par le paramètre `cursor` de l'outil.
    next_cursor: str | None = None

    def to_wire(self) -> dict:
        """Ce que le tour de chat relaie réellement à Claude : les champs
        connus seulement — un axe non mesuré est ABSENT, jamais une valeur
        inventée (`0`, `[]` vide affiché comme un fait)."""
        data = self.model_dump(exclude_none=True)
        for key in ("sources_consulted", "sources_succeeded", "sources_failed", "caveats", "unknowns"):
            if not data.get(key):
                data.pop(key, None)
        return data


def error_envelope(
    *, status: ToolResultStatus, result_type: str, error_code: str, suggested_next_step: str
) -> ToolResultEnvelope:
    """Un statut d'échec NOMMÉ, avec un code stable et le prochain geste —
    jamais un texte d'erreur comme seul signal."""
    return ToolResultEnvelope(
        status=status,
        result_type=result_type,
        error_code=error_code,
        suggested_next_step=suggested_next_step,
    )


def db_read_envelope(
    *,
    result_type: str,
    items_count: int,
    total_found: int | None,
    truncated: bool,
    source: str,
    scope: dict | None = None,
) -> ToolResultEnvelope:
    """L'enveloppe d'une lecture à SOURCE UNIQUE (notre propre base) qui a
    réellement répondu — jamais appelée sur un pont éteint ou en échec, ces
    cas-là passent par {@link error_envelope}.

    `empty` (mesuré : la base a répondu, zéro ligne) ne se confond jamais avec
    `not_covered` — la distinction que #2282 nomme explicitement.

    `scope` — #2852.12 — la portée EFFECTIVEMENT appliquée (les critères que
    l'outil a retenus), jamais un résumé ni les critères tels que demandés :
    absent tant que l'appelant n'en a pas de version résolue à donner.
    """
    if items_count == 0:
        status = ToolResultStatus.EMPTY
    elif truncated:
        status = ToolResultStatus.PARTIAL
    else:
        status = ToolResultStatus.SUCCESS
    return ToolResultEnvelope(
        status=status,
        result_type=result_type,
        total_found=total_found,
        returned_count=items_count,
        sources_consulted=[source],
        sources_succeeded=[source],
        scope=scope,
        partial_reason=(
            "Résultat tronqué : plus de correspondances existent que la limite demandée." if truncated else None
        ),
    )


def coverage_from_degraded(degraded: list[dict]) -> dict[str, int] | None:
    """#2852.11 — la couverture UNIFIÉE d'une recherche MULTI-sources, à
    partir de la même liste `degraded` que le registre rend déjà (`source`,
    `reason`, `kind` optionnel — voir `company_filters.degrade_kind`).

    Trois compteurs, jamais un total :
      * `capability_gap` — la source a répondu, elle ne sait pas EXPRIMER ce
        critère (`kind == "capability"`) ;
      * `no_match` — la source a répondu, cherché, rien trouvé
        (`kind == "no-match"`) ;
      * `failed` — aucun `kind` : un ÉCHEC RÉEL (panne, clé absente).

    Jamais le NOM d'une source : appeler cette fonction sur une liste déjà
    filtrée par `_degraded_without_vendors` (ou équivalente) est la
    responsabilité de l'appelant — ce module ne fait que COMPTER par nature,
    il ne lit jamais `entry["source"]`. `None` quand rien n'a dégradé : une
    recherche pleinement couverte n'a rien à dire ici, pas un `{}` muet.
    """
    if not degraded:
        return None
    counts = {"capability_gap": 0, "no_match": 0, "failed": 0}
    kind_to_bucket = {"capability": "capability_gap", "no-match": "no_match"}
    for entry in degraded:
        if not isinstance(entry, dict):
            continue
        bucket = kind_to_bucket.get(entry.get("kind"), "failed")
        counts[bucket] += 1
    return {bucket: count for bucket, count in counts.items() if count > 0} or None
