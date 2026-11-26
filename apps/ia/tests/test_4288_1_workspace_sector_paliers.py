"""#4288.1 — « Propose-moi 3 comptes dans l'industrie » : l'étape ESPACE de la cascade élargit par PALIERS NOMMÉS.

Recette prod 27/10 : « strictement industrie n'a rien rendu, élargi à l'énergie » puis ENEDIS, COTE BOULANGE,
PATISSERIE E. LADUREE. L'énergie n'est PAS un voisin de l'industrie dans le référentiel : le modèle l'improvisait.
Le palier se décide dans le CODE (référentiel partagé), se NOMME avant la liste, et chaque compte rendu doit
appartenir à un secteur du palier annoncé — lu sur SON secteur, jamais sur la requête qui l'a ramené."""

from __future__ import annotations

from typing import Any

import pytest

from app.prompts.laura_acts import widening_line_from_output
from app.services import bellum_api
from app.services.chat_tools import execute_chat_tool

USER = "00000000-0000-0000-0000-000000000001"

SPACE = [
    {"account_id": "a1", "name": "FORGEVAL", "sector": "Machines spéciales"},
    {"account_id": "a2", "name": "COTE BOULANGE", "sector": "Boulangerie"},
    {"account_id": "a3", "name": "ENEDIS", "sector": "Réseaux électriques"},
    {"account_id": "a4", "name": "AEROFORM", "sector": "Aéronautique"},
]


def _bridge(monkeypatch: pytest.MonkeyPatch, *, loose: bool = False, rows: list[dict[str, Any]] | None = None) -> list[str]:
    """Un pont d'espace : filtre ILIKE sur le secteur ; `loose` rend TOUT le portefeuille à chaque requête de
    palier (un filtre trop large), sauf la requête stricte « industrie » qui reste vide."""
    asked: list[str] = []
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _accounts(_u: str, *, sector: str | None = None, **_k: Any) -> dict[str, Any]:
        asked.append(str(sector))
        pool = SPACE if rows is None else rows
        found = [
            r
            for r in pool
            if (loose and sector != "industrie") or (sector and sector.casefold() in str(r["sector"]).casefold())
        ]
        return {"accounts": found, "total": len(found)}

    monkeypatch.setattr(bellum_api, "workspace_accounts", _accounts)
    return asked


async def _search(sector: str) -> dict[str, Any]:
    return await execute_chat_tool("search_workspace_accounts", {"sector": sector}, user_id=USER, profile_data=None)


@pytest.mark.asyncio
async def test_strict_zero_widens_to_a_named_tier_and_only_its_sectors(monkeypatch: pytest.MonkeyPatch) -> None:
    _bridge(monkeypatch)
    out = await _search("industrie")
    names = [a["name"] for a in out["accounts"]]
    assert names == ["FORGEVAL"]  # palier 1 de l'industrie : machines spéciales
    assert out["accounts"][0]["widened"] == "secteur voisin : machines spéciales"
    assert out["widening"]["tier"] == 1
    assert "Machines spéciales" in out["widening"]["sectors"]
    # ni l'énergie (pas un voisin de l'industrie) ni une boulangerie (aucun secteur du palier)
    assert "ENEDIS" not in str(out) and "COTE BOULANGE" not in str(out)
    # le palier se DIT avant la liste, par la phrase que `ensure_widening_line` impose
    assert "Machines spéciales" in (widening_line_from_output(out) or "")
    assert "sector_widening_line" in out and "Machines spéciales" in out["sector_widening_line"]


@pytest.mark.asyncio
async def test_a_loose_bridge_cannot_smuggle_an_account_outside_the_tier(monkeypatch: pytest.MonkeyPatch) -> None:
    """Contrôle négatif : le pont rend TOUT le portefeuille à chaque requête de palier — seuls les comptes dont SON
    secteur appartient au palier sortent (ni la boulangerie, ni l'énergie, ni l'aéronautique du palier 2)."""
    _bridge(monkeypatch, loose=True)
    out = await _search("industrie")
    assert [a["name"] for a in out["accounts"]] == ["FORGEVAL"]
    assert out["widening"]["tier"] == 1


@pytest.mark.asyncio
async def test_nothing_in_any_tier_says_which_tiers_were_tried(monkeypatch: pytest.MonkeyPatch) -> None:
    _bridge(monkeypatch, rows=[{"account_id": "b1", "name": "COTE BOULANGE", "sector": "Boulangerie"}])
    out = await _search("industrie")
    assert out["accounts"] == []
    assert out["sector_widening_tried"]  # les secteurs voisins tentés se nomment, jamais un zéro sec
    assert "Machines spéciales" in str(out["sector_widening_tried"])
    assert "widening" not in out


@pytest.mark.asyncio
async def test_an_exact_hit_widens_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    asked = _bridge(monkeypatch)
    out = await _search("Machines spéciales")
    assert [a["name"] for a in out["accounts"]] == ["FORGEVAL"]
    assert "widening" not in out and "sector_widening_line" not in out
    assert asked == ["Machines spéciales"]  # un seul appel : l'exact suffit


@pytest.mark.asyncio
async def test_a_sector_the_referential_does_not_know_is_never_widened(monkeypatch: pytest.MonkeyPatch) -> None:
    asked = _bridge(monkeypatch, rows=[])
    out = await _search("boulangerie")
    assert out["accounts"] == []
    assert "widening" not in out and "sector_widening_tried" not in out
    assert asked == ["boulangerie"]  # aucun voisin inventé
