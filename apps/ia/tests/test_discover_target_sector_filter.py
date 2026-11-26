"""`POST /discover/registry` — la cible déclarée FILTRE toujours (#2489.3, D1).

Décision de Louis 18/09/2026 après-midi (`.claude/notes/decisions-louis-18-09-apresmidi.md`
§D1), née d'une mesure en PRODUCTION : `?freetext=entreprises+dans+le+75` rendait
24 résultats, 0 dans les 5 secteurs cibles déclarés du profil ESN.

Quatre pièces, chacune tenue par un test ici :

1. Les résultats hors des secteurs cibles déclarés sont écartés PAR DÉFAUT.
2. `includeOutOfTarget: true` (le bouton « chercher hors de ma cible ») les ramène.
3. Le compteur n'est pas décoratif — et sait dire NON : un secteur INCONNU n'est
   PAS « hors cible » (GA-18/GA-19), et un espace SANS cible déclarée n'a pas de
   compteur du tout (pas de cible = rien à écarter, `targetSectorFilter` absent).
4. Un secteur LU dans le texte libre (#2489.3, point 3 de la décision Louis
   18/09/2026 soir) PRIME sur la cible déclarée : la cible ne s'applique pas,
   et l'écran ne prétend pas en appliquer une (`targetSectorFilter` absent),
   même si le profil a des secteurs cibles.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

INSURER = {
    "name": "ASSURANCES DU RHONE",
    "siren": "552081317",
    "nafCode": "65.12Z",
    "sector": "Autres assurances",
    "city": "Lyon",
    "department": "69",
    "headcountRange": "100 à 199 salariés",
    "creationDate": "2005-03-14",
}

RESTAURANT_1 = {
    "name": "LE BON REPAS",
    "siren": "444556677",
    "nafCode": "56.10A",
    "sector": "Restauration traditionnelle",
    "city": "Paris",
    "department": "75",
    "headcountRange": "20 à 49 salariés",
    "creationDate": "2019-01-10",
}

RESTAURANT_2 = {
    "name": "SNACK EXPRESS",
    "siren": "333445566",
    "nafCode": "56.10C",
    "sector": "Restauration rapide",
    "city": "Paris",
    "department": "75",
    "headcountRange": "6 à 9 salariés",
    "creationDate": "2020-06-01",
}

UNKNOWN_SECTOR = {
    "name": "MYSTERE SAS",
    "siren": "111222333",
    "nafCode": None,
    "sector": None,
    "city": "Paris",
    "department": "75",
    "headcountRange": "6 à 9 salariés",
    "creationDate": "2021-01-01",
}

HOTEL = {
    "name": "AUBERGE DU PARC",
    "siren": "222334455",
    "nafCode": "55.10Z",
    "sector": "Hôtellerie",
    "city": "Paris",
    "department": "75",
    "headcountRange": "10 à 19 salariés",
    "creationDate": "2015-05-05",
}

TARGET_PROFILE = {"sectors": ["Banque & Assurance"]}


@pytest.fixture
def registry(monkeypatch):
    """Stub du fournisseur registre principal — même patron que
    `test_discover_registry.py`."""

    class _Stub:
        rows: list[dict] = []

        async def __call__(self, filters, limit, degraded=None):
            return list(type(self).rows)

    stub = _Stub()
    _Stub.rows = []
    monkeypatch.setattr("app.routers.discover._registry_search", stub)
    return _Stub


@pytest.fixture
def fallback(monkeypatch):
    class _Stub:
        rows: list[dict] = []

        async def __call__(self, filters, limit, degraded=None):
            return list(type(self).rows)

    stub = _Stub()
    _Stub.rows = []
    monkeypatch.setattr("app.routers.discover._fallback_search", stub)
    return _Stub


def _claude() -> Any:
    return patch(
        "app.routers.discover.call_claude",
        new_callable=AsyncMock,
        return_value=({"angles": []}, None),
    )


def _post(client: TestClient, *, profile_data: dict, **body: Any):
    payload = {"filters": {"freetext": "entreprises dans le 75"}, "profile_data": profile_data, **body}
    with _claude():
        return client.post("/discover/registry", json=payload)


# ── 1. Écarté par défaut ─────────────────────────────────────────────────────


def test_out_of_target_sectors_are_excluded_by_default(client, registry, fallback) -> None:
    registry.rows = [INSURER, RESTAURANT_1, RESTAURANT_2]

    res = _post(client, profile_data=TARGET_PROFILE)

    assert res.status_code == 200, res.text
    body = res.json()
    assert [c["siren"] for c in body["candidates"]] == ["552081317"]


# ── 2. Le bouton « chercher hors de ma cible » les ramène ───────────────────


def test_include_out_of_target_button_brings_excluded_results_back(client, registry, fallback) -> None:
    registry.rows = [INSURER, RESTAURANT_1, RESTAURANT_2]

    res = _post(client, profile_data=TARGET_PROFILE, includeOutOfTarget=True)

    assert res.status_code == 200, res.text
    body = res.json()
    sirens = {c["siren"] for c in body["candidates"]}
    assert sirens == {"552081317", "444556677", "333445566"}
    assert body["targetSectorFilter"]["applied"] is False


# ── 3. Le compteur n'est pas décoratif, et sait dire NON ────────────────────


def test_counter_names_how_many_and_why(client, registry, fallback) -> None:
    registry.rows = [INSURER, RESTAURANT_1, RESTAURANT_2]

    res = _post(client, profile_data=TARGET_PROFILE)

    body = res.json()
    filter_info = body["targetSectorFilter"]
    assert filter_info["applied"] is True
    assert filter_info["excludedCount"] == 2
    assert sorted(filter_info["excludedSectors"]) == ["Restauration rapide", "Restauration traditionnelle"]


def test_zero_excluded_is_not_the_same_as_no_filter(client, registry, fallback) -> None:
    """Tout matche la cible : le filtre a TOURNÉ et n'a rien écarté — ce n'est
    pas la même affirmation que « pas de cible déclarée » (test suivant)."""
    registry.rows = [INSURER]

    res = _post(client, profile_data=TARGET_PROFILE)

    body = res.json()
    assert body["targetSectorFilter"]["applied"] is True
    assert body["targetSectorFilter"]["excludedCount"] == 0


def test_unknown_sector_is_never_excluded_in_silence(client, registry, fallback) -> None:
    """Un candidat sans secteur CONNU n'est pas « hors cible » — c'est une
    affirmation qu'on ne peut pas faire (GA-18/GA-19 : non mesuré ≠ 0). Il
    reste dans la liste, et n'entre ni dans le compte ni dans les secteurs
    nommés."""
    registry.rows = [INSURER, UNKNOWN_SECTOR]

    res = _post(client, profile_data=TARGET_PROFILE)

    body = res.json()
    sirens = {c["siren"] for c in body["candidates"]}
    assert sirens == {"552081317", "111222333"}
    assert body["targetSectorFilter"]["excludedCount"] == 0
    assert body["targetSectorFilter"]["excludedSectors"] == []


def test_no_declared_target_sectors_means_no_counter_at_all(client, registry, fallback) -> None:
    """Un espace qui n'a déclaré AUCUN secteur cible n'a pas une cible VIDE : il
    n'a pas de cible. Rien n'est écarté, et le compteur ne s'affiche PAS — la
    clé est absente, jamais `{"applied": false, "excludedCount": 0}` qui se
    lirait comme un filtre désactivé sur une vraie cible."""
    registry.rows = [INSURER, RESTAURANT_1, RESTAURANT_2]

    res = _post(client, profile_data={})

    body = res.json()
    assert len(body["candidates"]) == 3
    assert body.get("targetSectorFilter") is None


# ── 4. Un secteur LU dans le texte prime sur la cible ───────────────────────


def test_sector_read_from_freetext_overrides_the_declared_target(client, registry, fallback) -> None:
    """« hôtellerie dans le 75 » : la lecture (`discover_request_reading`)
    reconnaît le secteur « Hôtellerie, tourisme & loisirs » dans le texte et le
    traduit en NAF (#2490). Ce secteur tapé PRIME sur la cible déclarée du
    profil (Banque & Assurance ici) : aucun candidat n'est écarté au motif
    « hors cible », et l'écran ne prétend pas appliquer un filtre qu'il n'a pas
    appliqué — `targetSectorFilter` est absent, comme quand aucune cible n'est
    déclarée (test précédent), pas `{"applied": false, ...}`."""
    registry.rows = [INSURER, HOTEL]

    res = _post(client, profile_data=TARGET_PROFILE, filters={"freetext": "hotellerie dans le 75"})

    assert res.status_code == 200, res.text
    body = res.json()
    sirens = {c["siren"] for c in body["candidates"]}
    assert sirens == {"552081317", "222334455"}
    assert body.get("targetSectorFilter") is None
