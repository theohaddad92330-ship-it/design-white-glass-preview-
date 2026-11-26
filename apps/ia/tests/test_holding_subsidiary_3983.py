"""#3983 (reste) — « holding → filiale ». Décision Louis 11/10 :

    « ça dépend du type de boîte aussi : si c'est une holding et qu'elle est à Paris mais les
    boîtes dans le Sud, c'est les boîtes du Sud qui comptent et où les gens vont recruter »

Quand une HOLDING (NAF 64.20Z / 70.10Z) sort d'une recherche par zone sans que son siège y soit
(base « implantation ») et qu'une de ses FILIALES — entité juridique distincte, lien capitalistique
SOURCÉ par la cartographie déjà interrogée (#3705.5, `group_link_lookup`) — est elle-même dans la
zone parmi les résultats, c'est la filiale qui reste la cible (« Filiale de <holding> ») et la
holding est écartée avec sa raison nommée. Jamais de lien deviné : sans lien sourcé, rien ne change.
Aucun appel réseau en plus : les liens viennent des appels déjà faits (plafond inchangé).
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.routers import discover as discover_router
from app.services import chat_tools, group_link_lookup
from app.services.chat_tools import execute_chat_tool
from app.services.holding_subsidiary import HOLDING_CODE, redirect_holdings

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


def _holding(**overrides: Any) -> dict[str, Any]:
    row: dict[str, Any] = {
        "name": "GROUPE SOLEIL",
        "siren": H_SIREN,
        "nafCode": "64.20Z",
        "geography": _geo("establishment", hq_department="75"),
        "qualification": {
            "verdict": "recommended",
            "code": None,
            "reason": "Entité opérationnelle valide.",
            "otherCodes": [],
        },
    }
    row.update(overrides)
    return row


def _filiale(**overrides: Any) -> dict[str, Any]:
    row: dict[str, Any] = {
        "name": "SOLEIL PROVENCE",
        "siren": F_SIREN,
        "nafCode": "47.11F",
        "geography": _geo("headquarters", hq_department="13"),
        "qualification": {
            "verdict": "recommended",
            "code": None,
            "reason": "Entité opérationnelle valide.",
            "otherCodes": [],
        },
    }
    row.update(overrides)
    return row


EDGE = {(H_SIREN, F_SIREN)}


class TestLaRegle:
    def test_holding_hors_zone_filiale_dans_la_zone_la_filiale_sort(self) -> None:
        holding, filiale = _holding(), _filiale()
        redirect_holdings([holding, filiale], EDGE)
        q = holding["qualification"]
        assert q["verdict"] == "excluded"
        assert q["code"] == HOLDING_CODE
        assert "SOLEIL PROVENCE" in q["reason"]
        assert q["subsidiaries"] == [{"name": "SOLEIL PROVENCE", "siren": F_SIREN}]
        # La filiale reste la cible, et son lien de groupe est NOMMÉ comme un fait.
        assert filiale["qualification"]["verdict"] == "recommended"
        assert filiale["groupLink"] == {"kind": "capital_link", "entities": ["GROUPE SOLEIL"]}

    def test_sans_lien_source_rien_ne_change(self) -> None:
        # Un mandataire personne morale n'est qu'un indice : il ne déplace pas la cible.
        holding = _holding()
        filiale = _filiale(groupLink={"kind": "legal_entity_officer", "entities": ["GROUPE SOLEIL"]})
        redirect_holdings([holding, filiale], set())
        assert holding["qualification"]["verdict"] == "recommended"
        assert filiale["groupLink"]["kind"] == "legal_entity_officer"

    def test_siege_de_la_holding_dans_la_zone_rien_ne_change(self) -> None:
        holding = _holding(geography=_geo("headquarters", hq_department="13"))
        redirect_holdings([holding, _filiale()], EDGE)
        assert holding["qualification"]["verdict"] == "recommended"

    def test_societe_mere_operationnelle_pas_une_holding_rien_ne_change(self) -> None:
        holding = _holding(nafCode="62.01Z")
        redirect_holdings([holding, _filiale()], EDGE)
        assert holding["qualification"]["verdict"] == "recommended"

    def test_sans_zone_rien_ne_change(self) -> None:
        holding = _holding()
        holding.pop("geography")
        redirect_holdings([holding, _filiale()], EDGE)
        assert holding["qualification"]["verdict"] == "recommended"

    def test_filiale_sans_preuve_de_zone_ne_remplace_pas(self) -> None:
        filiale = _filiale()
        filiale.pop("geography")
        holding = _holding()
        redirect_holdings([holding, filiale], EDGE)
        assert holding["qualification"]["verdict"] == "recommended"

    def test_filiale_deja_ecartee_ne_remplace_pas(self) -> None:
        filiale = _filiale(qualification={"verdict": "excluded", "code": "ceased", "reason": "x", "otherCodes": []})
        holding = _holding()
        redirect_holdings([holding, filiale], EDGE)
        assert holding["qualification"]["verdict"] == "recommended"

    def test_lien_capitalistique_existant_garde(self) -> None:
        filiale = _filiale(groupLink={"kind": "capital_link", "entities": ["TETE DE GROUPE"]})
        redirect_holdings([_holding(), filiale], EDGE)
        assert filiale["groupLink"] == {"kind": "capital_link", "entities": ["TETE DE GROUPE"]}

    def test_l_ancien_doute_n_est_pas_perdu(self) -> None:
        holding = _holding(
            qualification={
                "verdict": "to_verify",
                "code": "no_employees",
                "reason": "x",
                "otherCodes": ["micro_structure"],
            }
        )
        redirect_holdings([holding, _filiale()], EDGE)
        assert holding["qualification"]["otherCodes"] == ["no_employees", "micro_structure"]


def _company(
    siren: str,
    *,
    parents: list[tuple[str, str]] = (),
    subsidiaries: list[tuple[str, str]] = (),
    role: str | None = None,
) -> Any:
    return SimpleNamespace(
        parent_companies=[SimpleNamespace(name=n, siren=s) for n, s in parents],
        subsidiaries=[SimpleNamespace(name=n, siren=s) for n, s in subsidiaries],
        group_affiliation=SimpleNamespace(role=role) if role else None,
    )


@pytest.mark.asyncio
class TestLesLiensSourcesSansAppelEnPlus:
    async def test_le_parent_source_par_siren_devient_une_arete(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PAPPERS_API_KEY", "x")
        spy = AsyncMock(side_effect=lambda siren, **_: _company(siren, parents=[("GROUPE SOLEIL", H_SIREN)]))
        monkeypatch.setattr("app.services.pappers.get_company", spy)
        rows: list[dict[str, Any]] = [{"siren": F_SIREN}]
        edges = await group_link_lookup.attach_group_links(rows)
        assert edges == {(H_SIREN, F_SIREN)}
        assert spy.await_count == 1

    async def test_les_filiales_d_une_tete_de_groupe_orientee_deviennent_des_aretes(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("PAPPERS_API_KEY", "x")
        monkeypatch.setattr(
            "app.services.pappers.get_company",
            AsyncMock(return_value=_company(H_SIREN, subsidiaries=[("SOLEIL PROVENCE", F_SIREN)], role="groupe")),
        )
        edges = await group_link_lookup.attach_group_links([{"siren": H_SIREN}])
        assert edges == {(H_SIREN, F_SIREN)}

    async def test_filiales_sans_orientation_prouvee_ne_comptent_pas(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PAPPERS_API_KEY", "x")
        monkeypatch.setattr(
            "app.services.pappers.get_company",
            AsyncMock(return_value=_company(H_SIREN, subsidiaries=[("SOLEIL PROVENCE", F_SIREN)], role=None)),
        )
        assert await group_link_lookup.attach_group_links([{"siren": H_SIREN}]) == set()

    async def test_parent_sans_siren_aucune_arete(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("PAPPERS_API_KEY", "x")
        monkeypatch.setattr(
            "app.services.pappers.get_company",
            AsyncMock(return_value=SimpleNamespace(parent_companies=[SimpleNamespace(name="G")])),
        )
        rows: list[dict[str, Any]] = [{"siren": F_SIREN}]
        assert await group_link_lookup.attach_group_links(rows) == set()
        assert rows[0]["group_link"]["observed_entities"] == ["G"]

    async def test_sans_cle_aucune_arete(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("PAPPERS_API_KEY", raising=False)
        assert await group_link_lookup.attach_group_links([{"siren": F_SIREN}]) == set()


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
REGISTRY_FILIALE = {
    "name": "SOLEIL PROVENCE",
    "siren": F_SIREN,
    "nafCode": "62.02A",
    "sector": "Conseil en systèmes et logiciels informatiques",
    "city": "MARSEILLE",
    "department": "13",
    "headcountRange": "250 à 499 salariés",
    "headcountTranche": "32",
    "legalCategory": "5710",
    "geography": _geo("headquarters", hq_department="13"),
}


def _discover(client: TestClient, monkeypatch: pytest.MonkeyPatch, get_company: Any) -> dict[str, Any]:
    monkeypatch.setattr(discover_router, "_registry_search", AsyncMock(side_effect=AssertionError("pappers")))
    monkeypatch.setattr(
        discover_router, "_fallback_search", AsyncMock(return_value=[dict(REGISTRY_HOLDING), dict(REGISTRY_FILIALE)])
    )
    monkeypatch.setattr(discover_router, "call_claude", AsyncMock(return_value=({"angles": []}, None)))
    monkeypatch.setattr("app.services.pappers.get_company", get_company)
    return client.post("/discover/registry", json={"filters": {"department": "13"}, "limit": 5}).json()


def _by_siren(body: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {c["siren"]: c for c in body["candidates"]}


async def _parents_of(siren: str, **_: Any) -> Any:
    return _company(siren, parents=[("GROUPE SOLEIL", H_SIREN)] if siren == F_SIREN else [])


def test_decouvrir_la_filiale_sort_la_holding_est_ecartee_et_nommee(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("PAPPERS_API_KEY", "x")
    rows = _by_siren(_discover(client, monkeypatch, _parents_of))
    assert rows[H_SIREN]["qualification"]["verdict"] == "excluded"
    assert rows[H_SIREN]["qualification"]["code"] == HOLDING_CODE
    assert rows[F_SIREN]["qualification"]["verdict"] != "excluded"
    assert rows[F_SIREN]["groupLink"] == {"kind": "capital_link", "entities": ["GROUPE SOLEIL"]}
    assert "pappers" not in rows[H_SIREN]["qualification"]["reason"].lower()


def test_decouvrir_sans_cle_rien_ne_change(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("PAPPERS_API_KEY", raising=False)
    spy = AsyncMock(side_effect=_parents_of)
    rows = _by_siren(_discover(client, monkeypatch, spy))
    spy.assert_not_called()
    assert rows[H_SIREN]["qualification"]["verdict"] != "excluded"
    assert "groupLink" not in rows[F_SIREN]


class _Response:
    def __init__(self, candidates: list[dict[str, Any]]) -> None:
        self.candidates = candidates
        self.degraded: list[Any] = []
        self.query: dict[str, Any] = {}
        self.recommendedSort = "balanced"


@pytest.mark.asyncio
async def test_laura_ne_propose_que_la_filiale_et_nomme_la_holding(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("PAPPERS_API_KEY", raising=False)
    holding = _holding(name="GROUPE SOLEIL")
    filiale = _filiale()
    redirect_holdings([holding, filiale], EDGE)

    async def _fake(req: Any) -> Any:
        return _Response([holding, filiale])

    async def _no_portfolio(items: Any, user_id: str) -> None:
        return None

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
    monkeypatch.setattr(chat_tools, "_attach_owned_account_ids", _no_portfolio)
    out = await execute_chat_tool("run_account_search", {"department": "13"}, user_id="u-1", profile_data=None)
    assert [i["name"] for i in out["items"]] == ["SOLEIL PROVENCE"]
    assert out["items"][0]["group_label"] == "Filiale de GROUPE SOLEIL"
    assert out["holdings_redirected"] == [{"holding": "GROUPE SOLEIL", "subsidiaries": ["SOLEIL PROVENCE"]}]
    assert "GROUPE SOLEIL" in out["holdings_redirected_note"]
    assert "pappers" not in str(out).lower()


@pytest.mark.asyncio
async def test_laura_sans_holding_ecartee_aucune_ligne(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake(req: Any) -> Any:
        return _Response([_filiale()])

    async def _no_portfolio(items: Any, user_id: str) -> None:
        return None

    monkeypatch.delenv("PAPPERS_API_KEY", raising=False)
    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
    monkeypatch.setattr(chat_tools, "_attach_owned_account_ids", _no_portfolio)
    out = await execute_chat_tool("run_account_search", {"department": "13"}, user_id="u-1", profile_data=None)
    assert "holdings_redirected" not in out
    assert "group_label" not in out["items"][0]
