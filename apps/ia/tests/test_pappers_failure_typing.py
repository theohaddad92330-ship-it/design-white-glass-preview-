"""Pappers ne doit pas répondre « erreur » à quatre questions différentes.

Avant : ``search_company`` levait un ``ValueError`` nu pour un 401, un 402, un
5xx ET pour « cette entreprise n'est pas au registre ». Le pipeline les attrapait
tous dans le même ``except Exception`` et les enregistrait comme UNE dégradation
de source, avec ``str(exc)`` pour toute cause.

Deux conséquences, toutes deux vécues en production :

1. « Pappers ne connaît pas cette société » faisait passer Pappers pour HS. Un
   écran d'état des sources construit là-dessus aurait crié au feu à chaque PME
   absente du registre.
2. « quota épuisé » et « jeton invalide » arrivaient sous la même chaîne opaque
   ``Pappers API returned status 401``. Les deux se réparent pourtant à l'opposé :
   recharger le forfait, ou tourner la clé.

Ces tests épinglent la distinction. C'est le cas de test réel du chantier : la
clé Pappers est à 401 pour quota épuisé.
"""

from __future__ import annotations

import httpx
import pytest

from app.services.company_filters import DegradeReason
from app.services.pappers.models import (
    PappersNoResultError,
    PappersUnavailableError,
    classify_pappers_failure,
)
from app.services.pappers.search import search_company


# ── Classification d'une réponse en échec ────────────────────────────────────


def test_quota_exhausted_401_is_named_as_a_quota() -> None:
    """Pappers répond 401 quand le quota est épuisé, pas seulement quand le jeton
    est faux. Le corps le dit — on le lit plutôt que de deviner sur le statut."""
    assert (
        classify_pappers_failure(401, '{"error":"Vous avez atteint votre quota de jetons"}')
        == DegradeReason.QUOTA_EXCEEDED
    )


def test_bad_token_401_stays_unauthorized() -> None:
    assert (
        classify_pappers_failure(401, '{"error":"Jeton d\'API invalide"}')
        == DegradeReason.UNAUTHORIZED
    )


def test_401_without_a_readable_body_reports_only_what_the_status_supports() -> None:
    """On n'invente pas : sans indice dans le corps, un 401 est un refus
    d'authentification. Le corps brut reste attaché pour l'opérateur."""
    assert classify_pappers_failure(401, "") == DegradeReason.UNAUTHORIZED


def test_402_is_a_quota() -> None:
    assert classify_pappers_failure(402, "") == DegradeReason.QUOTA_EXCEEDED


def test_429_is_a_rate_limit() -> None:
    assert classify_pappers_failure(429, "") == DegradeReason.RATE_LIMITED


def test_5xx_is_an_upstream_error() -> None:
    assert classify_pappers_failure(503, "") == DegradeReason.UPSTREAM_ERROR


def test_unknown_status_falls_back_to_upstream_error() -> None:
    assert classify_pappers_failure(418, "") == DegradeReason.UPSTREAM_ERROR


# ── search_company lève des erreurs distinctes ───────────────────────────────


def _client(status: int, body: str = "", json_body: dict | None = None) -> httpx.AsyncClient:
    def handler(_request: httpx.Request) -> httpx.Response:
        if json_body is not None:
            return httpx.Response(status, json=json_body)
        return httpx.Response(status, text=body)

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.mark.asyncio
async def test_quota_exhausted_raises_a_typed_unavailable(monkeypatch) -> None:
    monkeypatch.setenv("PAPPERS_API_KEY", "k")
    async with _client(401, '{"error":"quota de jetons atteint"}') as client:
        with pytest.raises(PappersUnavailableError) as excinfo:
            await search_company("Doctolib", http_client=client)

    exc = excinfo.value
    assert exc.status == 401
    assert exc.reason == DegradeReason.QUOTA_EXCEEDED
    # La cause reste lisible telle quelle par un humain.
    assert "quota" in str(exc).lower()


@pytest.mark.asyncio
async def test_absent_company_is_not_a_source_failure(monkeypatch) -> None:
    """LE point du chantier : « pas au registre » n'est pas « Pappers est HS »."""
    monkeypatch.setenv("PAPPERS_API_KEY", "k")
    async with _client(200, json_body={"resultats": []}) as client:
        with pytest.raises(PappersNoResultError):
            await search_company("Société Qui N'Existe Pas", http_client=client)


@pytest.mark.asyncio
async def test_no_result_is_not_an_unavailable(monkeypatch) -> None:
    """Une absence de résultat ne doit jamais être attrapée par un handler qui
    guette une panne de source."""
    monkeypatch.setenv("PAPPERS_API_KEY", "k")
    async with _client(200, json_body={"resultats": []}) as client:
        with pytest.raises(PappersNoResultError) as excinfo:
            await search_company("Absente", http_client=client)

    assert not isinstance(excinfo.value, PappersUnavailableError)


@pytest.mark.asyncio
async def test_upstream_5xx_raises_unavailable_with_the_status(monkeypatch) -> None:
    monkeypatch.setenv("PAPPERS_API_KEY", "k")
    async with _client(503, "Service Unavailable") as client:
        with pytest.raises(PappersUnavailableError) as excinfo:
            await search_company("Doctolib", http_client=client)

    assert excinfo.value.status == 503
    assert excinfo.value.reason == DegradeReason.UPSTREAM_ERROR
