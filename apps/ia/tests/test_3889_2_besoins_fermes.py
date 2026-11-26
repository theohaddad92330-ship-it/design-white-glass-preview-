"""#3889.2 (lot I02) — un ANCIEN besoin fermé reste retrouvable comme HISTORIQUE,
jamais comme un besoin ouvert.

Avant ce lot, `find_needs` n'interrogeait que les besoins ouverts
(`OpenNeedsService` filtre en dur sur les statuts ouverts, sauf `include_closed`
que l'écran passait déjà et que le chat n'a jamais passé). Sans ce paramètre,
« Sanofi a-t-il déjà eu un besoin Data ? » ne pouvait répondre que « aucun besoin ».
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import FIND_NEEDS_TOOL, execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


def test_3889_2_le_schema_expose_include_closed() -> None:
    assert "include_closed" in FIND_NEEDS_TOOL["input_schema"]["properties"]


@pytest.mark.asyncio
async def test_3889_2_include_closed_est_transmis_au_pont(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    async def _find_needs(user_id: str, **kwargs: object) -> dict[str, object]:
        captured.update(kwargs)
        return {"data": [{"id": "n1", "title": "Data engineer", "account_name": "ACME", "status": "lost"}]}

    monkeypatch.setattr(bellum_api, "find_needs", _find_needs)
    out = await execute_chat_tool("find_needs", {"query": "ACME", "include_closed": True}, user_id=USER, profile_data=None)
    assert captured["include_closed"] is True
    # Un besoin fermé est NOMMÉ historique : jamais présenté comme une piste ouverte.
    assert out["needs"][0]["historical"] is True


@pytest.mark.asyncio
async def test_3889_2_sans_include_closed_le_pont_ne_recoit_rien_de_plus(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    async def _find_needs(user_id: str, **kwargs: object) -> dict[str, object]:
        captured.update(kwargs)
        return {"data": [{"id": "n2", "title": "Java", "account_name": "ACME", "status": "to_qualify"}]}

    monkeypatch.setattr(bellum_api, "find_needs", _find_needs)
    out = await execute_chat_tool("find_needs", {"query": "ACME"}, user_id=USER, profile_data=None)
    assert "include_closed" not in captured
    # Le témoin sait dire NON : un besoin ouvert n'est jamais marqué historique.
    assert out["needs"][0]["historical"] is False


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["won", "lost", "cancelled", "staffed"])
async def test_3889_2_les_quatre_statuts_fermes_sont_historiques(monkeypatch: pytest.MonkeyPatch, status: str) -> None:
    async def _find_needs(user_id: str, **kwargs: object) -> dict[str, object]:
        return {"data": [{"id": "n3", "title": "X", "account_name": "ACME", "status": status}]}

    monkeypatch.setattr(bellum_api, "find_needs", _find_needs)
    out = await execute_chat_tool("find_needs", {"include_closed": True}, user_id=USER, profile_data=None)
    assert out["needs"][0]["historical"] is True
