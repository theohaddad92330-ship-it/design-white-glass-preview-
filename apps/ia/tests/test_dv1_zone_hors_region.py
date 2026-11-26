"""R22-DV1 (#4419.5) — Java + Hauts-de-France rendait des comptes des départements 06 et 07.

Deux trous, une même cause (la zone demandée n'était pas relue sur ce qui entre APRÈS la moisson) :

- l'appoint du pack interne (``_augment_with_dataforge_candidates``) ajoute des comptes de TOUTE la France,
  sans département : le remplissage #4430 les gardait dès qu'une offre citait la compétence ;
- une région donnée par son LIBELLÉ (« Hauts-de-France », pas le code 32) ne donnait aucun département :
  la lecture devenait nationale sans le dire.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.routers import discover as router
from app.routers.discover import DiscoverFilters
from app.services import discover_skill_offers as skill

HDF_DEPARTMENTS = ["02", "59", "60", "62", "80"]


def test_region_label_resolves_like_its_code() -> None:
    assert skill.zone_departments(["Hauts-de-France"], [], None) == HDF_DEPARTMENTS
    assert skill.zone_departments(["32"], [], None) == HDF_DEPARTMENTS


def test_unknown_region_still_guesses_nothing() -> None:
    assert skill.zone_departments(["Narnia"], [], None) == []


def _extra(siren: str, name: str, city: str) -> dict:
    return {"siren": siren, "name": name, "city": city, "department": None}


@pytest.mark.asyncio
async def test_dataforge_appoint_stays_in_the_requested_zone() -> None:
    extra = [
        _extra("111111111", "Sophia Java SA", "Sophia Antipolis"),  # 06 : lieu non reconnu
        _extra("222222222", "Annonay Java SAS", "Annonay"),  # 07
        _extra("333333333", "Lille Java SAS", "Lille"),  # 59 : dans la zone
    ]
    filters = DiscoverFilters(regions=["32"])
    with patch.object(router, "dataforge_candidates", AsyncMock(return_value=extra)):
        rows = await router._augment_with_dataforge_candidates([], filters, 10)
    assert [r["siren"] for r in rows] == ["333333333"]


@pytest.mark.asyncio
async def test_dataforge_appoint_unchanged_without_zone() -> None:
    extra = [_extra("111111111", "Sophia Java SA", "Sophia Antipolis")]
    with patch.object(router, "dataforge_candidates", AsyncMock(return_value=extra)):
        rows = await router._augment_with_dataforge_candidates([], DiscoverFilters(), 10)
    assert [r["siren"] for r in rows] == ["111111111"]
