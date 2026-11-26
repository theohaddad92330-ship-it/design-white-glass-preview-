"""Identité registre des entités de cartographie — les TROIS états.

Mesuré en prod (dossier EDF) : ``whiteSpaces`` sortait VIDE avec 6 entités toutes
« non confirmées (pas de SIREN) », donc ``knownEntities: 0``, donc aucune zone
blanche calculable. Le bloc était produit, facturé en tokens, et vide.

Deux causes, deux natures différentes :

1. **Rien ne résolvait jamais un nom d'entité vers un SIREN.** ``enrich_entities_naf``
   n'enrichit QUE les entités qui portent déjà un SIREN (elles viennent du graphe
   Pappers) ; les entités produites par le LLM n'ont qu'un nom. Pappers à court de
   crédits ⇒ plus aucune entité avec SIREN ⇒ tout « non confirmé ». Or Enedis
   (444608442), EDF (552081317) ou Dalkia sont trouvables en UNE requête gratuite.
2. **Une direction interne n'aura JAMAIS de SIREN, par définition.** DSIT, CSIRT,
   « Direction des Systèmes d'Information » ne sont pas des personnes morales. Les
   compter comme un échec de confirmation est trompeur, et les chercher au registre
   est un appel réseau pour rien.

D'où trois états explicites :

  - :data:`SIREN_CONFIRMED`  — personne morale rattachée à un SIREN du registre ;
  - :data:`SIREN_INTERNAL`   — unité interne : pas de personne morale, pas de
    recherche registre, raison honnête (« direction interne — pas de personne
    morale ») plutôt qu'un « non confirmée » trompeur ;
  - :data:`SIREN_UNRESOLVED` — personne morale plausible que le registre n'a pas
    tranchée, avec la raison EXACTE (homonymie non tranchée vs aucune entité).

Sources : ``recherche-entreprises`` (gratuit, SANS clé) via le résolveur
déterministe existant ``resolve_company_identity`` — aucune dépendance à Pappers.
Règle CLAUDE.md : JAMAIS de donnée fictive. Une entité non résolue le reste ; une
entité interne mal rattachée à un homonyme serait PIRE que non résolue.
"""

from __future__ import annotations

import asyncio
import logging
import re
from collections.abc import Awaitable, Callable, Iterable, Mapping

from app.services.homonym_disambiguation import HomonymResolution, normalize_company_name
from app.services.research.homonym import resolve_company_identity

logger = logging.getLogger(__name__)

#: Personne morale rattachée à un SIREN du registre.
SIREN_CONFIRMED = "confirmed"
#: Unité interne (direction / département / équipe) — pas de personne morale.
SIREN_INTERNAL = "internal"
#: Personne morale plausible, non rattachée — la raison exacte accompagne l'état.
SIREN_UNRESOLVED = "unresolved"

#: Plafond d'appels registre par run. Les entités au-delà sont laissées
#: ``unresolved`` avec une raison explicite — jamais silencieusement « inconnues ».
DEFAULT_MAX_LOOKUPS = 25
#: Requêtes registre simultanées. L'API gouv.fr est gratuite mais limitée en débit :
#: un burst de 25 se ferait jeter (429) et rendrait tout « non résolu » à tort.
_MAX_CONCURRENCY = 5

_INTERNAL_REASON = "direction interne — pas de personne morale (aucun SIREN par définition)"

# Marqueurs d'une unité INTERNE (organigramme), pas d'une personne morale. Choisis
# pour être sans ambiguïté : chacun désigne un découpage interne d'entreprise et
# n'apparaît pas dans une raison sociale ordinaire. On ne met PAS ici les sigles
# polysémiques (« SOC », « CERT »…) : une entité mal classée interne cesserait
# d'être cherchée alors que son SIREN est trouvable — un faux négatif coûteux.
_INTERNAL_UNIT_PATTERNS: tuple[str, ...] = (
    r"\bdirections?\b",  # Direction Générale, Direction des SI
    r"\bd[ée]partements?\b",
    r"\bp[oô]les?\b",
    r"\bcellules?\b",
    r"\b[ée]quipes?\b",
    r"\bdivisions?\b",
    r"\bbusiness\s+units?\b",
    r"\bBU\b",
    r"\bDSI\b",
    r"\bDSIT\b",
    r"\bDRH\b",
    r"\bCSIRT\b",
    r"\bsecr[ée]tariat\s+g[ée]n[ée]ral\b",
)
_INTERNAL_UNIT_RE = re.compile("|".join(_INTERNAL_UNIT_PATTERNS), re.IGNORECASE)

#: Labels structurels du LLM qui désignent explicitement une unité interne.
_INTERNAL_STRUCTURAL_TYPES = frozenset({"direction", "bu", "business unit", "departement", "département", "service"})

# Décorations que le LLM colle aux noms d'entités et que le registre ne connaît
# pas : « EDF SA (maison mère) », « EDF Renouvelables / EDF power solutions ».
_PARENTHETICAL_RE = re.compile(r"\s*\([^)]*\)")


def is_internal_unit(name: object, *, structural_type: object = None) -> bool:
    """L'entité est-elle une unité INTERNE (direction, département, équipe) ?

    True ⇒ elle n'aura jamais de SIREN : on ne la cherche pas au registre et on ne
    la compte pas comme un échec de confirmation. Déterministe, aucun appel réseau.
    """
    st = str(structural_type or "").strip().lower()
    if st in _INTERNAL_STRUCTURAL_TYPES:
        return True
    return bool(_INTERNAL_UNIT_RE.search(str(name or "")))


def registry_query_name(name: object) -> str:
    """Nom d'entité → requête registre exploitable.

    Retire les gloses entre parenthèses et ne garde que la première dénomination
    d'une alternative « A / B » — le registre indexe des raisons sociales, pas les
    annotations du LLM. Retombe sur le nom d'origine si le nettoyage le vide (on
    préfère une requête imparfaite à une requête vide).
    """
    raw = str(name or "").strip()
    cleaned = _PARENTHETICAL_RE.sub(" ", raw)
    # « EDF Renouvelables / EDF power solutions » → on interroge la première.
    cleaned = cleaned.split("/")[0]
    cleaned = " ".join(cleaned.split())
    return cleaned or raw


def _digits(value: object) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def _unresolved_reason(resolution: HomonymResolution) -> str:
    """Raison EXACTE d'un non-rattachement — jamais un « non confirmée » fourre-tout."""
    if resolution.status == "ambiguous":
        return (
            f"homonymie non tranchée ({resolution.candidate_count} candidats au registre) "
            "— non rattachée (aucun SIREN deviné)"
        )
    return "aucune entité correspondante au registre — non rattachée"


def _mark(entity: dict, status: str, reason: str) -> None:
    entity["sirenStatus"] = status
    entity["sirenReason"] = reason


async def resolve_entity_sirens(
    entities: Iterable[Mapping] | None,
    *,
    company: object = None,
    company_siren: object = None,
    max_lookups: int = DEFAULT_MAX_LOOKUPS,
    resolver: Callable[..., Awaitable[HomonymResolution]] = resolve_company_identity,
) -> dict:
    """Rattache au registre les entités du groupe qui n'ont pas encore de SIREN.

    Mute les dicts en place (comme ``enrich_entities_naf``) en posant
    ``sirenStatus`` / ``sirenReason``, et ``siren`` / ``sirenSource`` quand le
    rattachement est acquis. Retourne les compteurs des trois états.

    Les recherches tournent CONCURREMMENT (source gratuite, sans clé). Toute
    défaillance dégrade en ``unresolved`` avec sa raison — cette étape ne peut ni
    ralentir ni casser la recherche, et n'invente jamais un SIREN.
    """
    targets = [e for e in (entities or []) if isinstance(e, dict)]
    if not targets:
        return {"confirmed": 0, "internal": 0, "unresolved": 0, "lookups": 0}

    pending: list[dict] = []
    confirmed = internal = 0
    # La tête de groupe (« EDF SA (maison mère) ») EST le compte : son SIREN a déjà
    # été tranché par le Company Resolver en amont. Le rechercher serait un appel
    # pour rien, et le laisser non confirmé vide les zones blanches sans raison.
    # Comparaison sur le nom NORMALISÉ (formes juridiques retirées) — le SIREN du
    # compte ne peut donc pas déborder sur une filiale au nom différent.
    account_siren = _digits(company_siren)
    account_norm = normalize_company_name(registry_query_name(company)) if account_siren else ""

    for entity in targets:
        entity_norm = normalize_company_name(registry_query_name(entity.get("name")))
        if _digits(entity.get("siren")):
            # Déjà rattachée (graphe Pappers / INSEE) — aucun appel réseau.
            _mark(entity, SIREN_CONFIRMED, "personne morale rattachée au registre (SIREN)")
            confirmed += 1
        elif account_norm and entity_norm == account_norm:
            entity["siren"] = account_siren
            entity["sirenSource"] = "résolution du compte"
            _mark(entity, SIREN_CONFIRMED, f"tête de groupe — SIREN du compte ({account_siren})")
            confirmed += 1
        elif is_internal_unit(entity.get("name"), structural_type=entity.get("type")):
            _mark(entity, SIREN_INTERNAL, _INTERNAL_REASON)
            internal += 1
        else:
            pending.append(entity)

    # Budget d'appels : le reste est laissé non résolu AVEC sa raison, jamais
    # confondu avec « le registre ne connaît pas cette entité ».
    lookups, overflow = pending[:max_lookups], pending[max_lookups:]
    for entity in overflow:
        _mark(entity, SIREN_UNRESOLVED, "non recherchée (limite de résolution registre atteinte)")

    gate = asyncio.Semaphore(_MAX_CONCURRENCY)

    async def _resolve(entity: dict) -> HomonymResolution | BaseException:
        try:
            async with gate:
                return await resolver(registry_query_name(entity.get("name")))
        except Exception as exc:  # noqa: BLE001 — une source libre ne casse jamais la recherche
            return exc

    results = await asyncio.gather(*(_resolve(e) for e in lookups)) if lookups else []

    unresolved = len(overflow)
    for entity, result in zip(lookups, results, strict=True):
        if isinstance(result, BaseException):
            logger.warning(
                "Résolution SIREN échouée pour l'entité %r (poursuite): %s", entity.get("name"), result
            )
            _mark(entity, SIREN_UNRESOLVED, "registre indisponible — rattachement impossible")
            unresolved += 1
            continue
        siren = _digits(result.selected_siren)
        if siren and result.status in ("unique", "selected", "locked"):
            entity["siren"] = siren
            entity["sirenSource"] = "recherche-entreprises"
            _mark(entity, SIREN_CONFIRMED, f"rattachée au registre ({result.status}) — SIREN {siren}")
            confirmed += 1
        else:
            _mark(entity, SIREN_UNRESOLVED, _unresolved_reason(result))
            unresolved += 1

    logger.info(
        "Rattachement SIREN des entités : %d confirmées / %d internes / %d non résolues (%d requêtes registre)",
        confirmed,
        internal,
        unresolved,
        len(lookups),
    )
    return {"confirmed": confirmed, "internal": internal, "unresolved": unresolved, "lookups": len(lookups)}
