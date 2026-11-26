"""Lot AB, volet A (Louis 31/10) — la base COMMUNE fabrique des candidats Découvrir.

#4793.1 / #4791.1 — les comptes de la base commune qui correspondent aux critères entrent COMME CANDIDATS, rangés
avec ceux du registre, dédoublonnés par SIREN ; le plafond d'appoint DataForge (5) est levé (borne = le volume
demandé) et ils entrent même quand le registre a rempli la page (le rang tranche).
#4791.2 / #4762.1 — un besoin observé DATÉ voyage sur la carte (`observedNeed`) ; sans date, aucun besoin.
#4791.4 — aucune source nommée. #4791.5 — compteur par origine dans la ligne de journal, jamais affiché.
"""

from __future__ import annotations

import logging
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from app.routers import discover


def _registry_row(i: int) -> dict[str, Any]:
    return {
        "name": f"REGISTRE {i:03d} SAS",
        "siren": f"{300000000 + i}",
        "nafCode": "62.02A",
        "sector": "Conseil en systèmes et logiciels informatiques",
        "city": "LILLE",
        "department": "59",
        "headcountRange": "100 à 199 salariés",
        "creationDate": "2005-03-14",
    }


def _common(i: int, *, date: str | None = "2025-03-12", label: str = "Java") -> dict[str, Any]:
    need = {"label": label, **({"date": date} if date else {})}
    return {"siren": f"{700000000 + i}", "name": f"BASE COMMUNE {i}", "city": "Lille", "observedNeed": need}


@pytest.fixture
def engine(monkeypatch):
    rows: list[dict] = []

    async def registry(filters, limit, degraded=None):  # noqa: ANN001
        return [dict(r) for r in rows]

    monkeypatch.setattr("app.routers.discover._registry_search", registry)
    monkeypatch.setattr("app.routers.discover._fallback_search", AsyncMock(return_value=[]))
    monkeypatch.setattr("app.routers.discover.dataforge_candidates", AsyncMock(return_value=[]))
    return rows


def _post(client, limit: int, common: list[dict], **extra: Any) -> dict:
    with patch("app.routers.discover.call_claude", new_callable=AsyncMock, return_value=({"angles": []}, None)):
        response = client.post(
            "/discover/registry",
            json={
                "filters": {"nafCode": "62.02A"},
                "limit": limit,
                "strictCriteria": True,
                "commonBaseCandidates": common,
                **extra,
            },
        )
    assert response.status_code == 200, response.text
    return response.json()


def test_la_base_commune_fabrique_des_candidats(client, engine) -> None:
    engine.extend(_registry_row(i) for i in range(5))
    body = _post(client, 30, [_common(1), _common(2), _common(3)])
    sirens = {c["siren"] for c in body["candidates"]}
    assert {"700000001", "700000002", "700000003"} <= sirens
    assert len(body["candidates"]) == 8


def test_dedoublonnes_par_siren_le_registre_garde_sa_ligne_et_porte_le_besoin(client, engine) -> None:
    engine.append(_registry_row(1))
    twin = {**_common(9), "siren": "300000001"}
    body = _post(client, 30, [twin])
    assert [c["siren"] for c in body["candidates"]] == ["300000001"]
    only = body["candidates"][0]
    assert only["name"] == "REGISTRE 001 SAS"
    assert only["observedNeed"] == {"label": "Java", "date": "2025-03-12"}


def test_un_besoin_sans_date_ne_s_affiche_pas(client, engine) -> None:
    body = _post(client, 30, [_common(1, date=None)])
    card = next(c for c in body["candidates"] if c["siren"] == "700000001")
    assert "observedNeed" not in card


def test_aucune_source_nommee_et_aucun_marqueur_interne(client, engine) -> None:
    body = _post(client, 30, [_common(1)])
    card = next(c for c in body["candidates"] if c["siren"] == "700000001")
    assert "_source" not in card and "_origin" not in card
    assert set(card["observedNeed"]) == {"label", "date"}


def test_4793_1_un_compte_de_la_base_commune_se_reconnait_a_l_ecran(client, engine) -> None:
    """#4793.1 (recette prod 01/11, PARTIAL : « 0 marqueur base commune à l'écran ») — le candidat qui n'est QUE de la
    base commune porte `fromCommonBase` ; celui du registre (même jumeau dédoublonné) ne le porte pas. Un booléen :
    jamais un nom de source (#4791.4)."""
    engine.append(_registry_row(1))
    twin = {**_common(9), "siren": "300000001"}
    body = _post(client, 30, [_common(1), twin])
    by_siren = {c["siren"]: c for c in body["candidates"]}
    assert by_siren["700000001"]["fromCommonBase"] is True
    assert "fromCommonBase" not in by_siren["300000001"], "la ligne du registre garde son origine"


def test_borne_au_volume_demande(client, engine) -> None:
    body = _post(client, 4, [_common(i) for i in range(10)])
    assert len(body["candidates"]) == 4


def test_un_siren_faux_n_entre_jamais(client, engine) -> None:
    body = _post(client, 30, [{**_common(1), "siren": "12345"}, {**_common(2), "name": ""}])
    assert body["candidates"] == []


def test_la_page_pleine_n_empeche_pas_la_base_commune_le_rang_tranche(client, engine) -> None:
    """Le registre remplit 3 places sur 3 : la ligne commune n'est pas jetée à l'arrivée, elle est RANGÉE —
    et une ligne du registre exclue par la qualification (hors zone) lui cède la place."""
    engine.extend(_registry_row(i) for i in range(2))
    engine.append({**_registry_row(9), "ceased": True})
    body = _post(client, 3, [_common(1)])
    sirens = [c["siren"] for c in body["candidates"]]
    assert "700000001" in sirens


def test_le_compteur_par_origine_est_journalise(client, engine, caplog) -> None:
    engine.extend(_registry_row(i) for i in range(2))
    with caplog.at_level(logging.INFO, logger="app.routers.discover"):
        _post(client, 30, [_common(1), _common(2), _common(3)])
    line = next(r.getMessage() for r in caplog.records if "discover registry_calls=" in r.getMessage())
    assert "registry=2" in line and "offers=0" in line and "common_base=3" in line


def test_le_plafond_d_appoint_dataforge_est_leve() -> None:
    assert not hasattr(discover, "DATAFORGE_CANDIDATE_APPOINT_LIMIT")
