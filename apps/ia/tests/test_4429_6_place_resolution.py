"""#4429.6 — une commune mal orthographiée ou homonyme ne tombe JAMAIS en plein texte en silence.

Décision Louis 21/10/2026 : « Tolouse » est corrigée par proximité sur le référentiel de communes
(celui de la zone), appliquée ET NOMMÉE ; un homonyme prend la plus peuplée, le dit et nomme les
autres candidates (département) ; aucune correspondance se dit, jamais de repli muet.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.services.place_resolution import place_resolution_line, resolve_place

_TOULOUSE = {
    "code": "31555",
    "name": "Toulouse",
    "department": "31",
    "departmentName": "Haute-Garonne",
    "population": 514819,
}
_CHATEAU = {
    "code": "31550",
    "name": "Toulouse-le-Château",
    "department": "39",
    "departmentName": "Jura",
    "population": 204,
}
_SAINT_DENIS_93 = {
    "code": "93066",
    "name": "Saint-Denis",
    "department": "93",
    "departmentName": "Seine-Saint-Denis",
    "population": 113000,
}
_SAINT_DENIS_974 = {
    "code": "97411",
    "name": "Saint-Denis",
    "department": "974",
    "departmentName": "La Réunion",
    "population": 150000,
}
_SAINT_DENIS_11 = {
    "code": "11339",
    "name": "Saint-Denis",
    "department": "11",
    "departmentName": "Aude",
    "population": 200,
}


def test_orthographe_proche_corrigee_et_nommee() -> None:
    commune, note = resolve_place("Tolouse", [_TOULOUSE, _CHATEAU], fuzzy=True)
    assert commune and commune["code"] == "31555"
    assert note == {"kind": "corrected", "typed": "Tolouse", "chosen": "Toulouse", "department": "Haute-Garonne"}
    assert place_resolution_line(note) == "Toulouse (corrigé depuis « Tolouse »)"


def test_nom_exact_ne_dit_rien() -> None:
    commune, note = resolve_place("toulouse", [_TOULOUSE, _CHATEAU], fuzzy=True)
    assert commune and commune["code"] == "31555"
    assert note is None


def test_homonyme_plus_peuplee_et_autres_nommees() -> None:
    commune, note = resolve_place("Saint-Denis", [_SAINT_DENIS_11, _SAINT_DENIS_974, _SAINT_DENIS_93], fuzzy=False)
    assert commune and commune["code"] == "97411"
    assert note and note["kind"] == "homonym" and note["chosen"] == "Saint-Denis"
    assert [a["department"] for a in note["alternatives"]] == ["Seine-Saint-Denis", "Aude"]
    assert place_resolution_line(note) == (
        "Plusieurs communes nommées « Saint-Denis » : la plus peuplée retenue (La Réunion). "
        "Autres : Seine-Saint-Denis, Aude"
    )


def test_dit_non_trop_eloigne_aucune_correction_devinee() -> None:
    # « Toulon » n'est pas « Toulouse » : 750 km. Jamais corrigé.
    assert resolve_place("Toulan", [_TOULOUSE], fuzzy=True) == (None, {"kind": "none", "typed": "Toulan"})
    commune, note = resolve_place("Xyzzy", [], fuzzy=True)
    assert commune is None and note == {"kind": "none", "typed": "Xyzzy"}
    assert place_resolution_line(note) == ("Aucune commune « Xyzzy » trouvée : recherche en texte libre sur l'adresse")


def test_sans_flou_une_phrase_n_est_jamais_corrigee() -> None:
    # Un mot de la phrase (« cybersécurité ») ne devient pas une commune par proximité.
    commune, note = resolve_place("Tolouse", [_TOULOUSE], fuzzy=False)
    assert commune is None and note is None


def test_ligne_en_anglais() -> None:
    note = {"kind": "corrected", "typed": "Tolouse", "chosen": "Toulouse", "department": "Haute-Garonne"}
    assert place_resolution_line(note, "en") == "Toulouse (corrected from “Tolouse”)"


class _Gouv:
    def __init__(self) -> None:
        self.calls: list[Any] = []

    async def __call__(self, filters, limit, degraded=None, *, page: int = 1):
        self.calls.append(filters)
        return []


@pytest.fixture
def stub(monkeypatch):
    def install(communes: list[dict]) -> _Gouv:
        source = _Gouv()

        async def _none(filters, limit, degraded=None):
            return []

        monkeypatch.setattr("app.routers.discover._registry_search", _none)
        monkeypatch.setattr("app.routers.discover._fallback_search", source)
        monkeypatch.setattr("app.routers.discover._fallback_search_page", source)
        monkeypatch.setattr("app.routers.discover.call_claude", AsyncMock(return_value=({"angles": []}, None)))
        full = [{"postalCodes": [], "latitude": 43.6, "longitude": 1.4, "region": "76", **c} for c in communes]
        monkeypatch.setattr("app.routers.discover.search_communes", AsyncMock(return_value=full))
        return source

    return install


def _post(client: TestClient, filters: dict) -> dict:
    response = client.post("/discover/registry", json={"filters": filters, "limit": 30})
    assert response.status_code == 200, response.text
    return response.json()


def test_decouvrir_tolouse_corrigee_nommee_et_cherchee_par_code_commune(client: TestClient, stub) -> None:
    gouv = stub([_TOULOUSE, _CHATEAU])
    body = _post(client, {"city": "Tolouse"})
    assert body["query"]["placeResolution"]["kind"] == "corrected"
    assert body["query"]["placeResolution"]["chosen"] == "Toulouse"
    assert gouv.calls and gouv.calls[0].commune_code == "31555", "la commune corrigée, pas un plein texte"


def test_decouvrir_aucune_commune_se_dit(client: TestClient, stub) -> None:
    stub([])
    body = _post(client, {"city": "Xyzzy"})
    assert body["query"]["placeResolution"] == {"kind": "none", "typed": "Xyzzy"}


def test_decouvrir_ville_exacte_n_ajoute_rien(client: TestClient, stub) -> None:
    stub([_TOULOUSE, _CHATEAU])
    body = _post(client, {"city": "Toulouse"})
    assert "placeResolution" not in body["query"]
