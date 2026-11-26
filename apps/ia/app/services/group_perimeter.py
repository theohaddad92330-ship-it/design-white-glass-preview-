"""Lot 757 — CONTACTS 3/6 : le PÉRIMÈTRE groupe/filiales d'une entité, pour le sélecteur de l'analyse.

Arbitrage Louis 31/10/2026 : taper « Decathlon » ouvre un sélecteur groupe + filiales (taille, siège, région) ;
le commercial coche ; les contacts sont cherchés sur le groupe ET les filiales cochées
(``AnalysisScopeSelection.contact_entities``, packages/contracts ``group-perimeter.ts``).

Ce module ne fait que LIRE, sur deux sources déjà branchées :
  - le graphe capitalistique (``get_company(include_graph=True)``, cache GLOBAL par SIREN partagé avec
    l'analyse — un compte déjà analysé ne coûte aucun appel de plus) ;
  - la fiche du registre public (``search_companies`` par SIREN, gratuite, limiteur partagé) pour la taille,
    la commune du siège et l'état.

Règles (#2284) : une entité a un SIREN — un nom seul n'en fait pas une ; la tête de groupe d'une filiale n'est
retenue que CONFIRMÉE au registre (``confirm_group_head``, #3917), sinon l'entité tapée reste seule à la tête de
sa liste ; une absence reste ``None`` (jamais « 0 », GA-18) ; seize entités au plus (décision du 10/10).
Aucune écriture, aucune fusion : cocher une filiale élargit une recherche de contacts, rien d'autre.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from app.services.data_sources.recherche_entreprises import search_companies
from app.services.geo_labels import region_of_department
from app.services.group_head_confirm import confirm_group_head
from app.services.insee_sirene import headcount_band_label, unite_legale_by_siren
from app.services.pappers import get_company
from app.services.pappers.models import CompanyProfile, PappersError

logger = logging.getLogger(__name__)

__all__ = ["GROUP_PERIMETER_MAX_ENTITIES", "build_group_perimeter", "region_of_department"]

#: Décision du 10/10/2026 — même seuil que ``GROUP_PERIMETER_MAX_ENTITIES`` du contrat partagé.
GROUP_PERIMETER_MAX_ENTITIES = 16
#: Le registre est interrogé une fois par entité : au-delà, une ligne reste sans taille ni siège (``None``).
REGISTRY_DEADLINE_S = 8.0

_SIREN = re.compile(r"^\d{9}$")


def _entity(siren: str, name: str, role: str) -> dict[str, Any]:
    return {
        "siren": siren,
        "name": name,
        "role": role,
        "headcountLabel": None,
        "city": None,
        "region": None,
        "isActive": None,
    }


async def _profile(siren: str) -> CompanyProfile | None:
    try:
        return await get_company(siren, include_graph=True)
    except (PappersError, ValueError) as exc:
        logger.warning("group perimeter: profile %s unavailable: %s", siren, exc)
        return None


async def _confirmed_head(profile: CompanyProfile) -> str | None:
    affiliation = profile.group_affiliation
    if affiliation is None:
        return None
    if affiliation.role == "groupe":
        return profile.siren
    try:
        registry = await unite_legale_by_siren(affiliation.head_siren)
    except Exception as exc:  # noqa: BLE001 — la confirmation ne casse jamais la lecture
        logger.warning("group perimeter: head check failed for %s: %s", affiliation.head_siren, exc)
        registry = None
    confirmed = confirm_group_head(affiliation, registry)
    return confirmed.head_siren if confirmed else None


async def _stamp_registry(entity: dict[str, Any]) -> None:
    try:
        rows = await search_companies(entity["siren"], limit=1)
    except Exception as exc:  # noqa: BLE001 — registre muet = champs absents, jamais une erreur
        logger.warning("group perimeter: registry read failed for %s: %s", entity["siren"], exc)
        return
    row = next((r for r in rows or [] if isinstance(r, dict) and r.get("siren") == entity["siren"]), None)
    if row is None:
        return
    entity["headcountLabel"] = headcount_band_label(row.get("headcountTranche")) or None
    entity["city"] = str(row.get("city") or "").strip() or None
    entity["region"] = region_of_department(row.get("department"))
    if isinstance(row.get("isActive"), bool):
        entity["isActive"] = row["isActive"]


async def build_group_perimeter(siren: str) -> dict[str, Any] | None:
    """Le périmètre lisible de ``siren`` : tête de groupe d'abord, puis l'entité tapée, puis les filiales.

    ``None`` quand la fiche de l'entité tapée est illisible (sans clé, SIREN inconnu, source en panne)."""
    root = await _profile(siren)
    if root is None:
        return None
    head_siren = await _confirmed_head(root)
    graph = root
    if head_siren and head_siren != siren:
        graph = await _profile(head_siren) or root
        if graph is root:
            head_siren = None

    ordered: list[dict[str, Any]] = []
    seen: set[str] = set()

    def _add(candidate_siren: object, name: object, role: str) -> None:
        clean = str(candidate_siren or "").strip()
        label = str(name or "").strip()
        if not _SIREN.match(clean) or clean in seen:
            return
        seen.add(clean)
        ordered.append(_entity(clean, label or clean, role))

    if head_siren:
        _add(head_siren, graph.legal_name, "groupe")
    _add(siren, root.legal_name, "filiale" if head_siren and head_siren != siren else "groupe")
    for sub in graph.subsidiaries:
        _add(sub.siren, sub.name, "filiale")

    truncated = len(ordered) > GROUP_PERIMETER_MAX_ENTITIES
    entities = ordered[:GROUP_PERIMETER_MAX_ENTITIES]
    try:
        await asyncio.wait_for(asyncio.gather(*(_stamp_registry(e) for e in entities)), timeout=REGISTRY_DEADLINE_S)
    except TimeoutError:
        logger.info("group perimeter: registry deadline reached for %s", siren)
    return {"rootSiren": siren, "headSiren": head_siren, "entities": entities, "truncated": truncated}
