"""#3705.5 ROUVERT — décision Louis 11/10 : une ligne dont le mandataire est une PERSONNE MORALE passe
AUSSI par la vérification du groupe, dans le MÊME plafond par recherche et le même budget.

Sans ça, la règle « holding → filiale » (#3983, `redirect_holdings`) ne joue pas dans le cas courant :
la holding PRÉSIDE la SAS filiale, donc la filiale porte un mandataire personne morale, donc elle
n'était jamais interrogée, donc aucune arête sourcée (holding, filiale) n'existait.

Dans le plafond, passent d'abord les lignes où la vérification peut CHANGER LA CIBLE : une holding
(NAF 64.20Z / 70.10Z) dont le siège est hors zone, ou une ligne à mandataire personne morale.
Sans clé = zéro appel (no-op strict)."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.routers import discover as discover_router
from app.services import group_link_lookup
from app.services.holding_subsidiary import HOLDING_CODE

H_SIREN = "811111111"
F_SIREN = "822222222"


def _geo(basis: str, *, hq_department: str) -> dict[str, Any]:
    return {
        "basis": basis,
        "headquarters": {"city": "PARIS" if hq_department == "75" else "MARSEILLE", "department": hq_department},
        "siteCount": 1 if basis == "establishment" else 0,
        "sites": [],
        "zoneRegion": None,
    }


def _company(siren: str, *, parents: list[tuple[str, str]] = ()) -> Any:
    return SimpleNamespace(
        parent_companies=[SimpleNamespace(name=n, siren=s) for n, s in parents],
        subsidiaries=[],
        group_affiliation=None,
    )


def _pm_link(*names: str) -> dict[str, Any]:
    return {"observed_entities": list(names), "kind": "legal_entity_officer"}


@pytest.mark.asyncio
class TestLeMandatairePersonneMoraleEstVerifie:
    async def test_la_ligne_a_mandataire_pm_est_interrogee_et_devient_un_lien_source(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("PAPPERS_API_KEY", "x")
        spy = AsyncMock(side_effect=lambda siren, **_: _company(siren, parents=[("GROUPE SOLEIL", H_SIREN)]))
        monkeypatch.setattr("app.services.pappers.get_company", spy)
        rows: list[dict[str, Any]] = [{"siren": F_SIREN, "group_link": _pm_link("GROUPE SOLEIL")}]
        edges = await group_link_lookup.attach_group_links(rows)
        assert spy.await_count == 1
        assert edges == {(H_SIREN, F_SIREN)}
        assert rows[0]["group_link"] == {"observed_entities": ["GROUPE SOLEIL"], "kind": "capital_link"}

    async def test_sans_societe_mere_connue_l_indice_du_registre_reste(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PAPPERS_API_KEY", "x")
        monkeypatch.setattr("app.services.pappers.get_company", AsyncMock(return_value=_company(F_SIREN)))
        rows: list[dict[str, Any]] = [{"siren": F_SIREN, "group_link": _pm_link("GROUPE SOLEIL")}]
        assert await group_link_lookup.attach_group_links(rows) == set()
        assert rows[0]["group_link"] == _pm_link("GROUPE SOLEIL")

    async def test_un_lien_capitalistique_deja_source_n_est_pas_redemande(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("PAPPERS_API_KEY", "x")
        spy = AsyncMock(return_value=_company(F_SIREN))
        monkeypatch.setattr("app.services.pappers.get_company", spy)
        rows = [{"siren": F_SIREN, "group_link": {"observed_entities": ["G"], "kind": "capital_link"}}]
        await group_link_lookup.attach_group_links(rows)
        spy.assert_not_called()

    async def test_sans_cle_zero_appel_meme_avec_mandataire_pm(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("PAPPERS_API_KEY", raising=False)
        spy = AsyncMock(return_value=_company(F_SIREN, parents=[("G", H_SIREN)]))
        monkeypatch.setattr("app.services.pappers.get_company", spy)
        rows: list[dict[str, Any]] = [{"siren": F_SIREN, "group_link": _pm_link("G")}]
        assert await group_link_lookup.attach_group_links(rows) == set()
        spy.assert_not_called()
        assert rows[0]["group_link"] == _pm_link("G")


@pytest.mark.asyncio
class TestLePlafondPrioriseCeQuiPeutChangerLaCible:
    async def test_plafond_respecte_et_lignes_decisives_d_abord(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PAPPERS_API_KEY", "x")
        monkeypatch.setattr(group_link_lookup, "GROUP_LOOKUP_MAX", 3)
        asked: list[str] = []

        async def _spy(siren: str, **_: Any) -> Any:
            asked.append(siren)
            return _company(siren)

        monkeypatch.setattr("app.services.pappers.get_company", _spy)
        rows: list[dict[str, Any]] = [{"siren": f"30000000{i}"} for i in range(5)]
        rows.append({"siren": "400000001", "group_link": _pm_link("G")})
        rows.append({"siren": "400000002", "nafCode": "64.20Z", "geography": _geo("establishment", hq_department="75")})
        # Holding dont le siège EST dans la zone : rien à rediriger, pas prioritaire.
        rows.append({"siren": "400000003", "nafCode": "70.10Z", "geography": _geo("headquarters", hq_department="13")})
        await group_link_lookup.attach_group_links(rows)
        assert len(asked) == 3
        assert set(asked[:2]) == {"400000001", "400000002"}
        # Le reste du plafond suit l'ordre AFFICHÉ.
        assert asked[2] == "300000000"


REGISTRY_HOLDING = {
    "name": "GROUPE SOLEIL",
    "siren": H_SIREN,
    "nafCode": "64.20Z",
    "sector": "Activités des sociétés holding",
    "city": "MARSEILLE",
    "department": "13",
    "headcountRange": "50 à 99 salariés",
    "headcountTranche": "21",
    "legalCategory": "5710",
    "geography": _geo("establishment", hq_department="75"),
}
# Le cas courant : la holding PRÉSIDE la SAS filiale — le registre la publie comme mandataire.
REGISTRY_FILIALE_PRESIDEE = {
    "name": "SOLEIL PROVENCE",
    "siren": F_SIREN,
    "nafCode": "62.02A",
    "sector": "Conseil en systèmes et logiciels informatiques",
    "city": "MARSEILLE",
    "department": "13",
    "headcountRange": "250 à 499 salariés",
    "headcountTranche": "32",
    "legalCategory": "5710",
    "corporateOfficers": ["GROUPE SOLEIL"],
    "geography": _geo("headquarters", hq_department="13"),
}


def _discover(client: TestClient, monkeypatch: pytest.MonkeyPatch, get_company: Any) -> dict[str, dict[str, Any]]:
    monkeypatch.setattr(discover_router, "_registry_search", AsyncMock(side_effect=AssertionError("pappers")))
    monkeypatch.setattr(
        discover_router,
        "_fallback_search",
        AsyncMock(return_value=[dict(REGISTRY_HOLDING), dict(REGISTRY_FILIALE_PRESIDEE)]),
    )
    monkeypatch.setattr(discover_router, "call_claude", AsyncMock(return_value=({"angles": []}, None)))
    monkeypatch.setattr("app.services.pappers.get_company", get_company)
    body = client.post("/discover/registry", json={"filters": {"department": "13"}, "limit": 5}).json()
    return {c["siren"]: c for c in body["candidates"]}


async def _parents_of(siren: str, **_: Any) -> Any:
    # La holding n'est PAS orientée « groupe » : seule la filiale, interrogée, rend l'arête.
    return _company(siren, parents=[("GROUPE SOLEIL", H_SIREN)] if siren == F_SIREN else [])


def test_decouvrir_la_filiale_presidee_par_la_holding_hors_zone_la_remplace(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("PAPPERS_API_KEY", "x")
    rows = _discover(client, monkeypatch, _parents_of)
    assert rows[H_SIREN]["qualification"]["verdict"] == "excluded"
    assert rows[H_SIREN]["qualification"]["code"] == HOLDING_CODE
    assert rows[F_SIREN]["qualification"]["verdict"] != "excluded"
    assert rows[F_SIREN]["groupLink"] == {"kind": "capital_link", "entities": ["GROUPE SOLEIL"]}


def test_decouvrir_sans_cle_l_indice_reste_et_rien_ne_bouge(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("PAPPERS_API_KEY", raising=False)
    spy = AsyncMock(side_effect=_parents_of)
    rows = _discover(client, monkeypatch, spy)
    spy.assert_not_called()
    assert rows[H_SIREN]["qualification"]["verdict"] != "excluded"
    assert rows[F_SIREN]["groupLink"] == {"kind": "legal_entity_officer", "entities": ["GROUPE SOLEIL"]}
