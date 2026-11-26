"""#3876.5 — Laura et Découvrir interprètent la géographie de la même façon.

Test CROISÉ : la même table (``packages/contracts/src/fixtures/geo-scope-laura-discover.json``)
est lue ici et par ``apps/web/src/features/chat/view/discover-handoff.geo-scope.test.ts``.
Pour chaque phrase :

* la LECTURE de la demande (``read_request``, partagée par Découvrir en texte libre et
  par le contrat d'intention de Laura) comprend la même maille ;
* ``find_accounts`` (le lien vers Découvrir) et ``run_account_search`` (le tour d'horizon
  dans la bulle) transmettent CETTE maille — jamais une autre.

L'écart que ce test a révélé (lot M13, 09/10) : depuis #3762, une ville passée à Laura
était résolue en DÉPARTEMENT (« Marseille » → 13) — chercher à Marseille devenait,
silencieusement, chercher dans tout le département, alors que le champ « Ville » de
Découvrir borne à la commune (``commune_code``, #2490.11). La ville reste désormais une
ville : résolue par la source officielle (jamais devinée), transmise sous son nom
canonique, et Découvrir la borne à la commune.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.services import chat_tools
from app.services.discover_request_reading import read_request

USER = "77777777-7777-4777-8777-777777777777"

_FIXTURE = (
    Path(__file__).resolve().parents[3]
    / "packages"
    / "contracts"
    / "src"
    / "fixtures"
    / "geo-scope-laura-discover.json"
)
CASES: list[dict[str, Any]] = json.loads(_FIXTURE.read_text(encoding="utf-8"))["cases"]


def _ids(case: dict[str, Any]) -> str:
    return f"{case['kind']}:{case['phrase']}"


@pytest.fixture(autouse=True)
def _stub_sources(monkeypatch: pytest.MonkeyPatch) -> None:
    communes = {c["commune"]["name"]: c["commune"] for c in CASES if c["commune"]}

    async def _resolve(name: str) -> dict[str, Any] | None:
        return communes.get(name)

    async def _count(*_a: object, **_k: object) -> int | None:
        return 5

    monkeypatch.setattr("app.services.data_sources.geo_communes.resolve_commune_by_name", _resolve)
    monkeypatch.setattr(chat_tools, "_find_accounts_count", _count)


def _stub_registry(monkeypatch: pytest.MonkeyPatch) -> list[Any]:
    seen: list[Any] = []

    class _Response:
        candidates: list[Any] = []
        degraded: list[Any] = []
        query: dict[str, Any] = {}
        recommendedSort = "balanced"

    async def _fake(req: Any) -> Any:
        seen.append(req)
        return _Response()

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
    return seen


def test_la_table_est_lue() -> None:
    assert {c["kind"] for c in CASES} == {"city", "department", "region"}


@pytest.mark.parametrize("case", CASES, ids=_ids)
def test_la_lecture_de_la_demande_comprend_la_maille(case: dict[str, Any]) -> None:
    reading = read_request(case["phrase"])
    assert list(reading.place_candidates) == case["reading"]["place_candidates"]
    assert reading.department == case["reading"]["department"]
    assert reading.region == case["reading"]["region"]


@pytest.mark.asyncio
@pytest.mark.parametrize("case", CASES, ids=_ids)
async def test_find_accounts_propose_le_meme_perimetre_que_decouvrir(case: dict[str, Any]) -> None:
    out = await chat_tools.execute_chat_tool(
        "find_accounts", {**case["laura"], "sectors": ["finance"]}, user_id=USER, profile_data=None
    )
    assert out.get("error") is None, out
    proposal = out["proposal"]
    scope = case["scope"]
    assert proposal.get("city", "") == scope["city"]
    assert proposal.get("department", "") == scope["department"]
    assert proposal.get("region", []) == scope["region"]


@pytest.mark.asyncio
@pytest.mark.parametrize("case", CASES, ids=_ids)
async def test_run_account_search_interroge_le_meme_perimetre_que_decouvrir(
    monkeypatch: pytest.MonkeyPatch, case: dict[str, Any]
) -> None:
    seen = _stub_registry(monkeypatch)
    out = await chat_tools.execute_chat_tool(
        "run_account_search", {**case["laura"], "sectors": ["finance"]}, user_id=USER, profile_data=None
    )
    assert out.get("error") is None, out
    assert seen, "le registre doit être interrogé"
    # #4408.1 — la PREMIÈRE lecture porte le périmètre demandé ; le palier régional
    # qui la suit (quand elle ne rend rien) est une seconde lecture, gardée ailleurs.
    filters = seen[0].filters
    scope = case["scope"]
    assert (filters.city or "") == scope["city"]
    assert (filters.department or "") == scope["department"]
    assert list(filters.regions or []) == scope["region"]


@pytest.mark.asyncio
async def test_sait_dire_non_marseille_nest_jamais_les_bouches_du_rhone(monkeypatch: pytest.MonkeyPatch) -> None:
    """Le défaut d'avant, nommé : la ville ne se rabat JAMAIS sur son département."""
    seen = _stub_registry(monkeypatch)
    proposal = (
        await chat_tools.execute_chat_tool("find_accounts", {"city": "Marseille"}, user_id=USER, profile_data=None)
    )["proposal"]
    await chat_tools.execute_chat_tool("run_account_search", {"city": "Marseille"}, user_id=USER, profile_data=None)
    assert "department" not in proposal
    assert seen[0].filters.department in (None, "")
    assert seen[0].filters.city == "Marseille"


@pytest.mark.asyncio
async def test_une_ville_tapee_autrement_part_sous_son_nom_canonique(monkeypatch: pytest.MonkeyPatch) -> None:
    """« marseille » est résolue par la source officielle : c'est le nom INSEE qui voyage,
    celui que Découvrir résout à son tour en commune exacte."""

    async def _resolve(name: str) -> dict[str, Any] | None:
        return CASES[0]["commune"] if name.lower() == "marseille" else None

    monkeypatch.setattr("app.services.data_sources.geo_communes.resolve_commune_by_name", _resolve)
    out = await chat_tools.execute_chat_tool("find_accounts", {"city": "marseille"}, user_id=USER, profile_data=None)
    assert out["proposal"]["city"] == "Marseille"
