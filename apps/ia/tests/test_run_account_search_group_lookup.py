"""#3705.5 — une FILIALE sans mandataire personne morale visible au registre est quand même
nommée, grâce aux liens capitalistiques Pappers. DÉCISION Louis 10/10 : Pappers OK (0,022 $/appel, `provider_pricing`),
borné par `GROUP_LOOKUP_MAX`, sans clé = zéro appel, échec = aucun avertissement inventé."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from app.services import chat_tools, group_link_lookup
from app.services.chat_tools import execute_chat_tool

PME = {
    "siren": "444444444",
    "name": "PETIT COMMERCE",
    "city": "Lyon",
    "department": "69",
    "nafLabel": "Commerce de détail",
    "nafCode": "47.11F",
    "score": 60,
    "scoreMax": 100,
    "sources": [{"name": "registre", "fetchedAt": "2026-10-10T10:00:00+00:00"}],
}


class _Response:
    def __init__(self, candidates: list[dict[str, Any]]) -> None:
        self.candidates = candidates
        self.degraded: list[Any] = []
        self.query: dict[str, Any] = {}
        self.recommendedSort = "balanced"


def _setup(monkeypatch: pytest.MonkeyPatch, rows: list[dict[str, Any]], get_company: Any) -> None:
    async def _fake(req: Any) -> Any:
        return _Response(rows)

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)

    async def _no_portfolio(items: Any, user_id: str) -> None:
        return None

    monkeypatch.setattr(chat_tools, "_attach_owned_account_ids", _no_portfolio)
    monkeypatch.setattr("app.services.pappers.get_company", get_company)


async def _run() -> dict[str, Any]:
    return await execute_chat_tool(
        "run_account_search", {"headcount": "10-49"}, user_id="u-1", profile_data={"company_name": "Cyrah"}
    )


@pytest.mark.asyncio
class TestFilialeSansMandataireVisible:
    async def test_cle_absente_zero_appel(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("PAPPERS_API_KEY", raising=False)
        calls: list[str] = []

        async def _gc(siren: str, **_: Any) -> Any:
            calls.append(siren)
            return SimpleNamespace(parent_companies=[SimpleNamespace(name="GROUPE X")])

        _setup(monkeypatch, [dict(PME)], _gc)
        out = await _run()
        assert calls == []
        assert "group_link" not in out["items"][0]
        assert "subsidiary_warning" not in out

    async def test_filiale_detectee_et_nommee(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PAPPERS_API_KEY", "x")

        async def _gc(siren: str, **_: Any) -> Any:
            return SimpleNamespace(parent_companies=[SimpleNamespace(name="GROUPE X")])

        _setup(monkeypatch, [dict(PME)], _gc)
        out = await _run()
        item = out["items"][0]
        assert item["group_link"]["observed_entities"] == ["GROUPE X"]
        assert item["group_link"]["kind"] == "capital_link"
        assert "PETIT COMMERCE" in out["subsidiary_warning"]  # nommée, jamais exclue
        assert out["group_link_count"] == 1

    async def test_echec_pappers_rien_d_invente(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PAPPERS_API_KEY", "x")

        async def _gc(siren: str, **_: Any) -> Any:
            raise RuntimeError("pappers 500")

        _setup(monkeypatch, [dict(PME)], _gc)
        out = await _run()
        assert [i["name"] for i in out["items"]] == ["PETIT COMMERCE"]
        assert "group_link" not in out["items"][0]
        assert "subsidiary_warning" not in out

    async def test_borne_du_nombre_d_appels(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PAPPERS_API_KEY", "x")
        monkeypatch.setattr(group_link_lookup, "GROUP_LOOKUP_MAX", 2)
        calls: list[str] = []

        async def _gc(siren: str, **_: Any) -> Any:
            calls.append(siren)
            return SimpleNamespace(parent_companies=[])

        rows = [{**PME, "siren": f"55555555{i}", "name": f"ESN {i}"} for i in range(5)]
        _setup(monkeypatch, rows, _gc)
        await _run()
        assert len(calls) == 2

    async def test_mandataire_pm_verifie_l_indice_reste_si_rien_n_est_source(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Renversement Louis 11/10 : la ligne à mandataire personne morale est AUSSI vérifiée
        (avant : jamais redemandée). Sans société mère connue, l'indice du registre reste."""
        monkeypatch.setenv("PAPPERS_API_KEY", "x")
        calls: list[str] = []

        async def _gc(siren: str, **_: Any) -> Any:
            calls.append(siren)
            return SimpleNamespace(parent_companies=[])

        _setup(monkeypatch, [{**PME, "corporateOfficers": ["HOLDING Y"]}], _gc)
        out = await _run()
        assert calls == [PME["siren"]]
        assert out["items"][0]["group_link"]["kind"] == "legal_entity_officer"


@pytest.mark.asyncio
async def test_lien_capitalistique_se_dit_comme_un_fait(monkeypatch: pytest.MonkeyPatch) -> None:
    """#3705.5 (lot RBC) — « Filiale de <groupe> », sourcé ; le fournisseur n'est jamais nommé."""
    monkeypatch.setenv("PAPPERS_API_KEY", "x")

    async def _gc(siren: str, **_: Any) -> Any:
        return SimpleNamespace(parent_companies=[SimpleNamespace(name="GROUPE X")])

    _setup(monkeypatch, [dict(PME)], _gc)
    out = await _run()
    item = out["items"][0]
    assert item["group_label"] == "Filiale de GROUPE X"
    assert "pappers" not in str(out).lower()
