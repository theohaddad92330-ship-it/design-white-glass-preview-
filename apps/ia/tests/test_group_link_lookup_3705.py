"""#3705.5 (lot RBC, 11/10) — le rattachement de groupe d'une entreprise est vérifié PAR LIGNE de
Découvrir ET de la recherche de Laura, par UNE seule fonction partagée. Décision Louis 11/10 : OUI
(0,022 $/appel, `provider_pricing`), plafond par recherche, cache par SIREN, coût inscrit par appel, sans clé = no-op."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.routers import discover as discover_router
from app.services import group_link_lookup
from app.services import run_metrics


def _rows(n: int) -> list[dict[str, Any]]:
    return [{"siren": f"{300000000 + i}", "name": f"SOCIETE {i}"} for i in range(n)]


def _parents(*names: str) -> Any:
    return SimpleNamespace(parent_companies=[SimpleNamespace(name=n) for n in names])


@pytest.mark.asyncio
class TestSharedLookup:
    async def test_sans_cle_zero_appel(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("PAPPERS_API_KEY", raising=False)
        spy = AsyncMock(return_value=_parents("G"))
        monkeypatch.setattr("app.services.pappers.get_company", spy)
        rows = _rows(3)
        await group_link_lookup.attach_group_links(rows)
        spy.assert_not_called()
        assert all("group_link" not in r for r in rows)

    async def test_plafond_par_recherche(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PAPPERS_API_KEY", "x")
        monkeypatch.setattr(group_link_lookup, "GROUP_LOOKUP_MAX", 3)
        spy = AsyncMock(return_value=_parents("G"))
        monkeypatch.setattr("app.services.pappers.get_company", spy)
        rows = _rows(10)
        await group_link_lookup.attach_group_links(rows)
        assert spy.await_count == 3
        assert sum(1 for r in rows if r.get("group_link")) == 3

    async def test_defaut_raisonnable(self) -> None:
        assert 1 <= group_link_lookup.GROUP_LOOKUP_MAX <= 20

    async def test_un_siren_en_double_n_est_interroge_qu_une_fois(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PAPPERS_API_KEY", "x")
        spy = AsyncMock(return_value=_parents("G"))
        monkeypatch.setattr("app.services.pappers.get_company", spy)
        rows = [{"siren": "300000001", "name": "A"}, {"siren": "300000001", "name": "A bis"}]
        await group_link_lookup.attach_group_links(rows)
        assert spy.await_count == 1
        assert all(r["group_link"]["observed_entities"] == ["G"] for r in rows)

    async def test_lien_capitalistique_deja_source_n_est_pas_redemande(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # Renversement Louis 11/10 : l'indice « mandataire personne morale » est, lui, vérifié
        # (`test_group_link_pm_officer_3705.py`) ; seul un lien déjà SOURCÉ n'est pas redemandé.
        monkeypatch.setenv("PAPPERS_API_KEY", "x")
        spy = AsyncMock(return_value=_parents("G"))
        monkeypatch.setattr("app.services.pappers.get_company", spy)
        rows = [{"siren": "300000001", "name": "A", "group_link": {"observed_entities": ["H"], "kind": "capital_link"}}]
        await group_link_lookup.attach_group_links(rows)
        spy.assert_not_called()

    async def test_echec_ou_absence_rien_d_invente(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PAPPERS_API_KEY", "x")
        monkeypatch.setattr("app.services.pappers.get_company", AsyncMock(side_effect=RuntimeError("500")))
        rows = _rows(2)
        await group_link_lookup.attach_group_links(rows)
        assert all("group_link" not in r for r in rows)

    async def test_le_cout_des_appels_vivants_est_inscrit(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Un appel vivant (entreprise + cartographie = 2 appels facturés) est chiffré au run ;
        un SIREN en cache (aucun appel facturé) ne coûte rien."""
        monkeypatch.setenv("PAPPERS_API_KEY", "x")
        from app.middleware import correlation_id as cid_mod
        from app.services.pappers import budget

        budget.reset()
        monkeypatch.setattr(cid_mod, "get_correlation_id", lambda: "cid-rbc")
        monkeypatch.setattr(group_link_lookup, "get_correlation_id", lambda: "cid-rbc")

        async def _live(siren: str, **_: Any) -> Any:
            if siren.endswith("0"):  # cache : aucun appel
                budget.record_cache_hit()
                return _parents("G")
            budget.record(budget.ENDPOINT_COMPANY, correlation_id="cid-rbc")
            budget.record(budget.ENDPOINT_CARTOGRAPHIE, correlation_id="cid-rbc")
            return _parents("G")

        monkeypatch.setattr("app.services.pappers.get_company", _live)
        rows = [{"siren": "300000000", "name": "A"}, {"siren": "300000001", "name": "B"}]
        await group_link_lookup.attach_group_links(rows)
        bucket = run_metrics.get_metrics("cid-rbc").get("pappers", {})
        assert bucket.get("cost_usd", 0) == pytest.approx(0.044)  # 2 appels × 0,022 (provider_pricing)


FILIALE = {
    "name": "PETITE ESN SAS",
    "siren": "444444444",
    "nafCode": "62.01Z",
    "sector": "Programmation",
    "city": "LYON",
    "department": "69",
    "headcountRange": "10 à 19 salariés",
    "headcountTranche": "12",
    "legalCategory": "5710",
}


def test_decouvrir_nomme_la_filiale_sur_la_ligne(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PAPPERS_API_KEY", "x")
    monkeypatch.setattr(discover_router, "_registry_search", AsyncMock(side_effect=AssertionError("pappers")))
    monkeypatch.setattr(discover_router, "_fallback_search", AsyncMock(return_value=[dict(FILIALE)]))
    monkeypatch.setattr(discover_router, "call_claude", AsyncMock(return_value=({"angles": []}, None)))
    monkeypatch.setattr("app.services.pappers.get_company", AsyncMock(return_value=_parents("GROUPE X")))
    body = client.post("/discover/registry", json={"filters": {"nafCode": "62.01Z"}, "limit": 5}).json()
    link = body["candidates"][0]["groupLink"]
    assert link == {"kind": "capital_link", "entities": ["GROUPE X"]}


def test_decouvrir_sans_cle_aucun_groupe(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("PAPPERS_API_KEY", raising=False)
    spy = AsyncMock(return_value=_parents("GROUPE X"))
    monkeypatch.setattr(discover_router, "_registry_search", AsyncMock(side_effect=AssertionError("pappers")))
    monkeypatch.setattr(discover_router, "_fallback_search", AsyncMock(return_value=[dict(FILIALE)]))
    monkeypatch.setattr(discover_router, "call_claude", AsyncMock(return_value=({"angles": []}, None)))
    monkeypatch.setattr("app.services.pappers.get_company", spy)
    body = client.post("/discover/registry", json={"filters": {"nafCode": "62.01Z"}, "limit": 5}).json()
    spy.assert_not_called()
    assert "groupLink" not in body["candidates"][0]
