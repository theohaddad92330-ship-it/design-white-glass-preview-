"""LUDOVIC-D LC.6 — « trouve-moi des entreprises industrielles en AURA qui recrutent en méthodes/qualité,
avec qui appeler » : Laura sur le MÊME moteur que Découvrir › Comptes (recette prod Stelya 19/10).

Le jeu mélange de l'agroalimentaire SANS signal (Côte Boulange, Lindt, Paul) et des industriels avec une
offre méthodes/qualité DATÉE : les industriels sortent devant, l'agroalimentaire hors profil sort pas.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import chat_tools
from app.services.chat_tools import execute_chat_tool

STELYA = {
    "company_name": "Stelya",
    "sectors": ["Industrie", "Énergie", "Aéronautique", "Défense", "Automobile", "BTP"],
    "placedRoles": ["mécanique", "automatisme", "qualité", "méthodes", "génie civil"],
}


def _row(siren: str, name: str, naf: str, label: str, signals: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "siren": siren,
        "name": name,
        "city": "Lyon",
        "department": "69",
        "nafCode": naf,
        "nafLabel": label,
        "score": 60,
        "scoreMax": 100,
        "signalsSearched": True,
        "signals": signals or [],
    }


ROWS = [
    _row("100000001", "COTE BOULANGE", "10.71C", "Boulangerie et boulangerie-pâtisserie"),
    _row("100000002", "LINDT", "10.82Z", "Fabrication de cacao, chocolat et de produits de confiserie"),
    _row("100000003", "BOULANGERIES PAUL", "10.71A", "Fabrication industrielle de pain et de pâtisserie fraîche"),
    _row(
        "200000001",
        "KSB",
        "28.13Z",
        "Fabrication d'autres pompes, industrie mécanique",
        [{"type": "hiring", "label": "Ingénieur méthodes industrialisation H/F", "date": "2026-10-14"}],
    ),
    _row(
        "200000002",
        "FRAMATOME",
        "25.30Z",
        "Industrie de la construction de générateurs de vapeur",
        [{"type": "hiring", "label": "Technicien qualité fournisseurs", "date": "2026-10-09"}],
    ),
]


class _Response:
    def __init__(self, candidates: list[dict[str, Any]]) -> None:
        self.candidates = candidates
        self.degraded: list[dict[str, Any]] = []
        self.query: dict[str, Any] = {}
        self.recommendedSort = "balanced"


@pytest.fixture
def seen(monkeypatch: pytest.MonkeyPatch) -> list[Any]:
    requests: list[Any] = []

    async def _fake(req: Any) -> Any:
        requests.append(req)
        return _Response([dict(r) for r in ROWS])

    async def _owned(items: Any, user_id: str) -> None:
        for item in items:
            if item.get("siren") == "200000001":
                item["account_id"] = "acc-ksb"

    async def _people(items: Any, user_id: str) -> dict[str, list[dict[str, str]]]:
        return {"acc-ksb": [{"name": "Anne Martin", "title": "Responsable méthodes"}]}

    async def _noop(*_: Any, **__: Any) -> None:
        return None

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
    monkeypatch.setattr(chat_tools, "_attach_owned_account_ids", _owned)
    monkeypatch.setattr(chat_tools, "_known_people_by_account", _people)
    monkeypatch.setattr(chat_tools, "_attach_workspace_partner_relation", _noop)
    monkeypatch.setattr(chat_tools, "_attach_workspace_match_levels", _noop)
    monkeypatch.setattr(chat_tools, "attach_group_links", _noop)
    return requests


async def _run(tool_input: dict[str, Any]) -> dict[str, Any]:
    return await execute_chat_tool("run_account_search", tool_input, user_id="u-1", profile_data=STELYA)


@pytest.mark.asyncio
async def test_les_industriels_avec_offre_datee_sortent_devant_l_agro_hors_profil_sort_pas(seen: list[Any]) -> None:
    out = await _run({"sectors": ["industry"], "region": ["84"], "trades": ["méthodes", "qualité"]})
    names = [item["name"] for item in out["items"]]
    assert names == ["KSB", "FRAMATOME"]
    assert out["out_of_profile_count"] == 3
    # Les métiers de la DEMANDE affinent ceux du profil, transmis au moteur de Découvrir.
    assert len(seen[0].profile_data["placedRoles"]) == 2
    ksb, framatome = out["items"]
    assert ksb["call_signal"] == {"label": "Ingénieur méthodes industrialisation H/F", "date": "2026-10-14"}
    assert ksb["people_to_call"] == [{"name": "Anne Martin", "title": "Responsable méthodes"}]
    assert framatome["people_note"] == "personne connue : à trouver"
    assert framatome["find_who_to_call"]["label"] == "Trouver qui appeler"


@pytest.mark.asyncio
async def test_sait_dire_non_un_secteur_hors_profil_demande_explicitement_reste_servi(seen: list[Any]) -> None:
    out = await _run({"sectors": ["retail"], "region": ["84"]})
    assert "out_of_profile_count" not in out
    assert all("call_signal" not in item for item in out["items"] if not item.get("signals"))


@pytest.mark.asyncio
async def test_la_carte_affiche_le_signal_date_et_les_personnes(seen: list[Any]) -> None:
    from app.services.known_shape_gate import shape_read_from_tool

    out = await _run({"sectors": ["industry"], "region": ["84"], "trades": ["méthodes", "qualité"]})
    card = shape_read_from_tool("run_account_search", out, language="fr")["blocks"]["account_ranking"]
    ksb, framatome = card["items"]
    assert ksb["why"][0] == "Signal daté : Ingénieur méthodes industrialisation H/F (2026-10-14)."
    assert ksb["why"][1] == "À appeler : Anne Martin — Responsable méthodes."
    assert framatome["why"][1] == "Personne connue : à trouver — « Trouver qui appeler »."
