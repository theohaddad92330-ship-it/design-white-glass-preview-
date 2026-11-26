"""#2299 — mélange de sources et dédoublonnage (universal result blending).

Mesuré le 22/09/2026 (`git grep -ln -E 'def compile[A-Za-z_]*\\(' -- apps
packages` → rien) : aucun compilateur n'assemblait les résultats bruts d'une
recherche chat multi-source en un flux dédupliqué. `text_norm.dedup_by_name`
existe déjà (`phase1_research.py`, `esn_presence.py`) mais ne convient pas ici
— il DROP silencieusement le doublon sur un simple nom normalisé, sans fusion
de preuves ni signalement d'ambiguïté ; exactement ce que la doctrine interdit
pour un résultat de recherche.

Trois règles, dans l'ordre où elles comptent :

1. Deux résultats qui partagent un IDENTIFIANT CANONIQUE (SIREN, ou
   ``registryId``/``registry_id`` — le pivot cross-border de
   ``account.entity.ts``) sont BLENDÉS en un seul objet. Aucune preuve n'est
   perdue (2299.6) : une valeur divergente entre les membres survit dans
   ``blended_conflicts``. Le choix entre deux valeurs ne dépend JAMAIS de
   l'ORDRE d'arrivée (2299.7) — une correction humaine gagne toujours, sinon
   le connecteur le plus fiable, jamais « la dernière source arrivée ».

2. Deux résultats seulement PROCHES par le nom, sans identifiant canonique
   commun, restent SÉPARÉS (2299.3) et portent une hypothèse de doublon
   NOMMÉE, avec son raisonnement consultable — jamais un chiffre de
   confiance (2299.4 ; arbitrage Louis 18/09 sur #2299.33 : une hypothèse
   s'affiche COMME une hypothèse, jamais comme une relation établie).

3. Une identité incertaine n'est JAMAIS fusionnée automatiquement (2299.5 —
   « on PROPOSE une fusion de doublons, on ne fusionne JAMAIS », la doctrine
   la plus dure du lot). Seul un identifiant canonique EXACT déclenche une
   fusion ; la proximité de nom ne fait jamais que signaler.

Aucun CRITÈRE PROTÉGÉ (âge, genre, origine, photo, adresse) ne pèse dans le
rapprochement — ``_PROTECTED_FIELDS`` est retiré avant toute comparaison.

La provenance de chaque preuve nomme un CONNECTEUR (registry/linkedin/crm/
press/llm/other), jamais un de nos fournisseurs (Pappers/Apollo/Brave...) —
même table que ``org_graph_assembler._kind_for_source`` (GA-26 : un réglage
vit à un seul endroit, pas une seconde copie de la correspondance
fournisseur → connecteur).

Câblé dans ``chat_tools._run_account_search`` (#2470) : les candidats du
registre reçus de ``discover_registry`` passent par ``blend_accounts`` avant
de devenir des lignes de la carte ``account_ranking``. ``blend_contacts``
n'existe pas encore : aucun appelant réel (recherche de personnes
multi-source, ÉPHÉMÈRE, côté chat) n'a été trouvé au 22/09/2026 — un
dédoublonneur que personne n'appelle ne compte pas ; ``_blend`` reste
paramétré sur une fonction de clé canonique pour ne pas dupliquer cette
logique le jour où cet appelant existera (2299.2 reste `retenu`, voir le
registre).
"""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping, Sequence
from difflib import SequenceMatcher
from typing import Any

from app.services.org_graph_assembler import _kind_for_source
from app.services.text_norm import normalize_name

# Champs qui ne pèsent JAMAIS dans un rapprochement (doctrine — aucun critère
# protégé ne pèse dans le rang, ni dans un score de rapprochement). Retirés
# avant toute comparaison ou fusion.
_PROTECTED_FIELDS: frozenset[str] = frozenset(
    {
        "age",
        "gender",
        "genre",
        "origin",
        "origine",
        "photo",
        "photoUrl",
        "photo_url",
        "address",
        "adresse",
    }
)

# Confiance déterministe d'un connecteur, pour trancher un conflit SANS
# dépendre de l'ordre d'arrivée. Le registre légal prime sur une mention web ;
# une hypothèse LLM ne l'emporte jamais sur une source observée.
_CONNECTOR_TRUST: dict[str, int] = {
    "registry": 3,
    "crm": 2,
    "linkedin": 1,
    "press": 1,
    "llm": 0,
    "other": 0,
}

# Similarité de nom (ratio déterministe, sans LLM — même philosophie que
# `identity_resolution.py`) au-delà de laquelle deux résultats méritent une
# hypothèse de doublon. Une typo ou un suffixe juridique (« SAS », « SA »)
# passe ce seuil ; deux entreprises distinctes du même secteur, non.
_NAME_SIMILARITY_THRESHOLD = 0.90

_SKIP_MERGE_FIELDS = _PROTECTED_FIELDS | {"sources"}


def _clean_fields(candidate: Mapping[str, Any]) -> dict[str, Any]:
    """Copie du candidat SANS les champs protégés."""
    return {k: v for k, v in candidate.items() if k not in _PROTECTED_FIELDS}


def _account_canonical_key(candidate: Mapping[str, Any]) -> str:
    """SIREN, ou le pivot cross-border `registryId` (`account.entity.ts`).
    Vide ⇒ le candidat n'est groupé avec personne — une identité incertaine
    n'est jamais fusionnée (2299.5)."""
    registry_id = str(candidate.get("registryId") or candidate.get("registry_id") or "").strip()
    if registry_id:
        return f"registry:{registry_id.lower()}"
    siren = str(candidate.get("siren") or "").strip()
    return f"siren:{siren}" if siren else ""


def _display_name(candidate: Mapping[str, Any]) -> str:
    return str(candidate.get("name") or candidate.get("fullName") or candidate.get("full_name") or "").strip()


def _similarity_key(name: str) -> str:
    """Clé de RAPPROCHEMENT — accents/casse neutralisés (`normalize_name`),
    puis séparateurs (espace, tiret, ponctuation) effacés : « Bellum IT »,
    « Bellum-IT » et « Bellum, IT » comparent identiquement. N'affecte QUE le
    calcul de similarité — jamais l'identifiant canonique (SIREN), ni le nom
    affiché dans le raisonnement de l'hypothèse."""
    return re.sub(r"[^a-z0-9]+", "", normalize_name(name))


def _connector_of(candidate: Mapping[str, Any], value_sources: list[Any] | None = None) -> str:
    sources = value_sources if value_sources is not None else candidate.get("sources")
    provider = ""
    if isinstance(sources, list) and sources and isinstance(sources[0], Mapping):
        provider = str(sources[0].get("name") or "")
    elif isinstance(candidate.get("source"), str):
        provider = str(candidate["source"])
    return _kind_for_source(provider)


def _is_correction(candidate: Mapping[str, Any], field: str) -> bool:
    corrections = candidate.get("humanCorrections")
    return isinstance(corrections, Mapping) and field in corrections


def _merge_evidence(members: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Concatène les preuves des membres, jamais n'en écrase une — la
    provenance nomme un CONNECTEUR, jamais l'un de nos fournisseurs."""
    evidence: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for member in members:
        raw_sources = member.get("sources")
        if not isinstance(raw_sources, list):
            continue
        for entry in raw_sources:
            if not isinstance(entry, Mapping):
                continue
            kind = _kind_for_source(str(entry.get("name") or ""))
            fetched_at = str(entry.get("fetchedAt") or "")
            token = (kind, fetched_at)
            if token in seen:
                continue
            seen.add(token)
            record: dict[str, Any] = {"connector": kind}
            if fetched_at:
                record["fetchedAt"] = fetched_at
            evidence.append(record)
    return evidence


def _merge_group(members: list[dict[str, Any]], canonical_key: str) -> dict[str, Any]:
    """Fusionne un groupe qui partage un identifiant canonique. Un champ où
    tous les membres s'accordent est posé tel quel ; un champ où ils
    divergent choisit une valeur DÉTERMINISTE (correction humaine, sinon le
    connecteur le plus fiable, jamais l'ordre d'arrivée) et garde TOUTES les
    valeurs dans `blended_conflicts` — rien n'est jeté (2299.6/2299.7)."""
    merged: dict[str, Any] = {}
    conflicts: dict[str, list[dict[str, Any]]] = {}

    fields = sorted({key for member in members for key in member if key not in _SKIP_MERGE_FIELDS})
    for field in fields:
        candidates_for_field: list[tuple[Any, str, bool]] = []
        for member in members:
            value = member.get(field)
            if value in (None, "", [], {}):
                continue
            candidates_for_field.append((value, _connector_of(member), _is_correction(member, field)))
        if not candidates_for_field:
            continue

        distinct: dict[str, tuple[Any, str, bool]] = {}
        for value, connector, corrected in candidates_for_field:
            dedup_key = repr(value)
            existing = distinct.get(dedup_key)
            if existing is None or (corrected and not existing[2]):
                distinct[dedup_key] = (value, connector, corrected)

        if len(distinct) == 1:
            merged[field] = next(iter(distinct.values()))[0]
            continue

        # Conflit réel — tri déterministe : correction humaine d'abord, puis
        # le connecteur le plus fiable, puis son nom (jamais l'ordre
        # d'arrivée dans la liste d'entrée).
        ordered = sorted(distinct.values(), key=lambda t: (not t[2], -_CONNECTOR_TRUST.get(t[1], 0), t[1]))
        merged[field] = ordered[0][0]
        conflicts[field] = [{"value": value, "connector": connector} for value, connector, _ in ordered]

    merged["blend_id"] = canonical_key
    merged["blended_from"] = len(members)
    if conflicts:
        merged["blended_conflicts"] = conflicts
    evidence = _merge_evidence(members)
    if evidence:
        merged["sources"] = evidence
    return merged


def _attach_hypothesis(item: dict[str, Any], other_name: str, other_ref: str) -> None:
    hypotheses = item.setdefault("duplicate_hypothesis", [])
    if any(h.get("candidate_ref") == other_ref for h in hypotheses):
        return
    hypotheses.append(
        {
            "candidate_ref": other_ref,
            # Un raisonnement CONSULTABLE, jamais un chiffre de confiance
            # (arbitrage Louis 18/09) : ce qui est supposé se nomme supposé.
            "reasoning": (
                f"Nom proche de « {other_name} » sans identifiant canonique commun confirmé — "
                "à vérifier avant tout rapprochement, jamais fusionné automatiquement."
            ),
        }
    )
    item["ambiguous"] = True


def _flag_ambiguous_pairs(items: list[dict[str, Any]]) -> None:
    """Deux résultats séparés dont le nom se ressemble fort reçoivent une
    hypothèse de doublon MUTUELLE — ils restent deux entrées distinctes
    (2299.3), jamais fusionnées sur ce seul indice (2299.5)."""
    names = [_display_name(item) for item in items]
    keys = [_similarity_key(name) for name in names]
    refs = [str(item.get("blend_id") or names[index] or index) for index, item in enumerate(items)]
    for i in range(len(items)):
        if not keys[i]:
            continue
        for j in range(i + 1, len(items)):
            if not keys[j]:
                continue
            ratio = SequenceMatcher(None, keys[i], keys[j]).ratio()
            if ratio >= _NAME_SIMILARITY_THRESHOLD:
                _attach_hypothesis(items[i], names[j], refs[j])
                _attach_hypothesis(items[j], names[i], refs[i])


def _blend(
    raw: Sequence[Mapping[str, Any]],
    *,
    canonical_key: Callable[[Mapping[str, Any]], str],
) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    cleaned_by_index: list[dict[str, Any] | None] = []
    for raw_candidate in raw:
        if not isinstance(raw_candidate, Mapping):
            cleaned_by_index.append(None)
            continue
        cleaned = _clean_fields(raw_candidate)
        cleaned_by_index.append(cleaned)
        key = canonical_key(cleaned)
        if key:
            groups.setdefault(key, []).append(cleaned)

    merged_by_key: dict[str, dict[str, Any]] = {}
    for key, members in groups.items():
        merged_by_key[key] = _merge_group(members, key) if len(members) > 1 else dict(members[0])

    # L'ordre d'ENTRÉE (déjà classé par score en amont) survit : une fusion
    # occupe la place de sa PREMIÈRE apparition, jamais celle de la dernière.
    output: list[dict[str, Any]] = []
    emitted: set[str] = set()
    for cleaned in cleaned_by_index:
        if cleaned is None:
            continue
        key = canonical_key(cleaned)
        if key:
            if key in emitted:
                continue
            emitted.add(key)
            output.append(merged_by_key[key])
        else:
            output.append(cleaned)

    _flag_ambiguous_pairs(output)
    return output


def blend_accounts(candidates: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Mélange de sources et dédoublonnage pour des candidats COMPTE.

    Appelé par ``chat_tools._run_account_search`` juste après
    ``discover_registry`` (#2470) — les candidats atterrissent ici avant de
    devenir des lignes de la carte ``account_ranking``.
    """
    return _blend(candidates, canonical_key=_account_canonical_key)
