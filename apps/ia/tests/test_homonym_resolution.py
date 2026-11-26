"""Homonym resolution wiring: recherche-entreprises candidate fetch +
``resolve_company_identity`` orchestration (scope lock, mapping, soft-fail)."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services.data_sources import recherche_entreprises as re_src
from app.services.homonym_disambiguation import HomonymResolution
from app.services.research import homonym


class _FakeResponse:
    def __init__(self, payload: dict, status_code: int = 200, headers: dict | None = None):
        self._payload = payload
        # Un vrai `httpx.Response` en porte toujours un. Sans lui, le code qui
        # regarde un 429 levait un `AttributeError` que le garde-fou « une
        # source gratuite ne casse jamais la recherche » repliait en `[]` — un
        # doublon vide au lieu d'un résultat.
        self.status_code = status_code
        self.headers = headers or {}

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(f"HTTP {self.status_code}", request=None, response=None)  # type: ignore[arg-type]

    def json(self) -> dict:
        return self._payload


class _FakeClient:
    """Minimal async httpx stand-in: records the query, returns a canned payload."""

    def __init__(self, payload: dict, status_code: int = 200, headers: dict | None = None):
        self._payload = payload
        self.calls: list[dict] = []
        self.status_code = status_code
        self.headers = headers or {}

    def __init_status__(self) -> None:  # pragma: no cover - compat
        pass

    async def get(self, url: str, params: dict | None = None):
        self.calls.append({"url": url, "params": params or {}})
        return _FakeResponse(self._payload, self.status_code, self.headers)


# ── search_companies: multi-candidate fetch (free, no key) ──────────────────
@pytest.mark.asyncio
async def test_search_companies_normalizes_multiple_candidates():
    payload = {
        "results": [
            {
                "siren": "111",
                "nom_complet": "THALES",
                "activite_principale": "7010Z",
                "categorie_entreprise": "GE",
                "tranche_effectif_salarie": "53",
                "nombre_etablissements": 40,
                "siege": {"libelle_commune": "Meudon", "departement": "92", "etat_administratif": "A"},
            },
            {
                "siren": "222",
                "nom_raison_sociale": "THALES",
                "activite_principale": "5040Z",
                "tranche_effectif_salarie": "01",
                "siege": {"libelle_commune": "Saint-Étienne", "etat_administratif": "A"},
            },
            {"nom_complet": "no siren dropped"},  # no SIREN → dropped
        ]
    }
    client = _FakeClient(payload)
    out = await re_src.search_companies("THALES", limit=8, client=client)

    assert [c["siren"] for c in out] == ["111", "222"]
    assert out[0]["sizeClass"] == "GE"
    assert out[0]["headcountTranche"] == "53"
    assert out[0]["city"] == "Meudon"
    assert out[0]["isActive"] is True
    assert client.calls[0]["params"]["per_page"] == "8"


@pytest.mark.asyncio
async def test_search_companies_marks_ceased_head_office_inactive():
    payload = {"results": [{"siren": "999", "nom_complet": "X", "siege": {"etat_administratif": "C"}}]}
    out = await re_src.search_companies("X", client=_FakeClient(payload))
    assert out[0]["isActive"] is False


@pytest.mark.asyncio
async def test_search_companies_soft_fails_to_empty_on_error():
    class _Boom:
        async def get(self, *a, **k):
            raise RuntimeError("network down")

    assert await re_src.search_companies("Whatever", client=_Boom()) == []


@pytest.mark.asyncio
async def test_search_companies_empty_name_is_noop():
    assert await re_src.search_companies("   ") == []


# ── resolve_company_identity: scope lock short-circuits (no network) ─────────
@pytest.mark.asyncio
async def test_resolve_with_siren_lock_short_circuits_without_fetch():
    with patch.object(homonym, "search_companies", new=AsyncMock()) as fetch:
        res = await homonym.resolve_company_identity("Société Générale", siren="552120222")

    assert isinstance(res, HomonymResolution)
    assert res.status == "locked"
    assert res.selected_siren == "552120222"
    fetch.assert_not_awaited()  # lock bypasses the candidate scan entirely


# ── resolve_company_identity: maps candidates + disambiguates ───────────────
@pytest.mark.asyncio
async def test_resolve_selects_dominant_homonym():
    fetched = [
        {"siren": "111", "name": "THALES", "nafCode": "7010Z", "sizeClass": "GE",
         "headcountTranche": "53", "establishmentCount": 40, "isActive": True},
        {"siren": "222", "name": "THALES", "nafCode": "5040Z",
         "headcountTranche": "01", "isActive": True},
    ]
    with patch.object(homonym, "search_companies", new=AsyncMock(return_value=fetched)):
        res = await homonym.resolve_company_identity("THALES")

    assert res.status == "selected"
    assert res.selected_siren == "111"
    # transparency: both homonyms exposed with scores
    assert res.candidate_count == 2


@pytest.mark.asyncio
async def test_resolve_exposes_ambiguity_without_guessing():
    fetched = [
        {"siren": "111", "name": "Groupe Martin", "nafCode": "4321A", "isActive": True},
        {"siren": "222", "name": "Groupe Martin", "nafCode": "1071C", "isActive": True},
    ]
    with patch.object(homonym, "search_companies", new=AsyncMock(return_value=fetched)):
        res = await homonym.resolve_company_identity("Groupe Martin")

    assert res.status == "ambiguous"
    assert res.selected_siren is None
    assert len(res.candidates) == 2


@pytest.mark.asyncio
async def test_resolve_maps_tranche_to_employee_bound():
    fetched = [{"siren": "111", "name": "Acme", "headcountTranche": "51", "isActive": True}]
    with patch.object(homonym, "search_companies", new=AsyncMock(return_value=fetched)):
        res = await homonym.resolve_company_identity("Acme")
    # tranche "51" → 2000+ employees surfaced on the scored candidate
    assert res.candidates[0].headcount == 2000


@pytest.mark.asyncio
async def test_resolve_soft_fails_to_none_when_fetch_raises():
    with patch.object(homonym, "search_companies", new=AsyncMock(side_effect=RuntimeError("boom"))):
        res = await homonym.resolve_company_identity("Acme")
    assert res.status == "none"
    assert res.selected_siren is None


# ── Débit : le résolveur ne doit pas se faire jeter par sa propre source ────
#
# Mesuré sur un run réel de `/discover/signals` (dept 69, 90 j) : la résolution
# part en vagues de 6 sur ~120 noms, `search_companies` n'était PAS passée par le
# limiteur partagé, et recherche-entreprises répondait 429 en rafale. Chaque 429
# devient un candidat écarté — l'écran expliquait alors la disette par une
# « homonymie non tranchée » qui n'existait pas. Le même échantillon de noms
# résolus un par un passait à ~55 % de succès contre ~21 % en rafale.
#
# `list_companies` (voisine, même hôte) passe déjà par `throttle`. C'est le
# mécanisme existant : on le réutilise plutôt que d'en inventer un.


@pytest.mark.asyncio
async def test_search_companies_goes_through_the_shared_rate_limiter():
    """Le bucket `recherche_entreprises` (rpm + concurrence) existe déjà et est
    utilisé par `list_companies` : `search_companies` doit l'emprunter aussi."""
    seen: list[str] = []
    real_throttle = re_src.throttle

    def _spy(provider: str):
        seen.append(provider)
        return real_throttle(provider)

    client = _FakeClient({"results": []})
    with patch.object(re_src, "throttle", _spy):
        await re_src.search_companies("ACME", client=client)

    assert "recherche_entreprises" in seen, "la recherche de candidats doit être limitée comme la liste"
    assert client.calls, "la requête doit tout de même partir"
