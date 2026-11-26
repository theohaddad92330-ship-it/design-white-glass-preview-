"""Ce que la phase 1 enregistre — ou pas — quand Pappers ne rend pas de profil.

`record_degradation` alimente l'état des sources. Y écrire « pappers » parce
qu'une PME n'est pas au registre rendrait l'écran inutilisable : Pappers
paraîtrait HS plusieurs fois par jour, en pleine santé. Ces tests fixent la
frontière entre les deux faits.
"""

from __future__ import annotations

import pytest

from app.services import source_health
from app.services.company_filters import DegradeReason
from app.services.pappers.models import (
    PappersAmbiguousMatchError,
    PappersNoResultError,
    PappersUnavailableError,
)
from app.services.research import pappers as research_pappers

CID = "cid-research-pappers"


@pytest.fixture(autouse=True)
def _correlation(monkeypatch):
    monkeypatch.setattr(research_pappers, "get_correlation_id", lambda: CID)
    source_health.clear_degradations(CID)
    yield
    source_health.clear_degradations(CID)


def _raise(exc: Exception):
    async def _fn(*_args, **_kwargs):
        raise exc

    return _fn


# ── « Pappers a répondu, il ne connaît pas » → PAS une dégradation ───────────


@pytest.mark.asyncio
async def test_absent_company_records_no_degradation(monkeypatch) -> None:
    monkeypatch.setattr(
        research_pappers, "search_company", _raise(PappersNoResultError("PME Inconnue"))
    )

    assert await research_pappers.research_pappers("PME Inconnue") is None
    assert source_health.get_degradations(CID) == []


@pytest.mark.asyncio
async def test_ambiguous_match_records_no_degradation(monkeypatch) -> None:
    """Un homonyme écarté est une décision de qualité, pas une panne."""
    monkeypatch.setattr(
        research_pappers,
        "search_company",
        _raise(PappersAmbiguousMatchError("Orange", "ORANGE BLEUE SARL", 0.31)),
    )

    assert await research_pappers.research_pappers("Orange") is None
    assert source_health.get_degradations(CID) == []


# ── « Pappers n'a pas pu répondre » → dégradation typée ──────────────────────


@pytest.mark.asyncio
async def test_quota_exhausted_is_recorded_with_its_typed_cause(monkeypatch) -> None:
    """Le cas réel du chantier : clé Pappers à 401 pour quota épuisé.

    L'écran d'état doit pouvoir écrire « quota épuisé », pas « erreur inconnue ».
    """
    monkeypatch.setattr(
        research_pappers,
        "search_company",
        _raise(
            PappersUnavailableError(
                401, DegradeReason.QUOTA_EXCEEDED, '{"error":"quota de jetons atteint"}'
            )
        ),
    )

    assert await research_pappers.research_pappers("Doctolib") is None

    entries = source_health.get_degradations(CID)
    assert len(entries) == 1
    assert entries[0]["source"] == "pappers"
    assert entries[0]["code"] == DegradeReason.QUOTA_EXCEEDED
    # La phrase brute reste lisible pour l'opérateur.
    assert "quota" in entries[0]["reason"].lower()


@pytest.mark.asyncio
async def test_bad_token_is_recorded_as_unauthorized_not_quota(monkeypatch) -> None:
    """Deux réparations opposées : recharger le forfait ≠ tourner la clé."""
    monkeypatch.setattr(
        research_pappers,
        "search_company",
        _raise(PappersUnavailableError(401, DegradeReason.UNAUTHORIZED, "Jeton invalide")),
    )

    await research_pappers.research_pappers("Doctolib")

    assert source_health.get_degradations(CID)[0]["code"] == DegradeReason.UNAUTHORIZED


@pytest.mark.asyncio
async def test_untyped_failure_is_recorded_as_upstream_error(monkeypatch) -> None:
    """On sait que l'appel a échoué, pas pourquoi — on ne prétend pas savoir."""
    monkeypatch.setattr(research_pappers, "search_company", _raise(RuntimeError("boom")))

    await research_pappers.research_pappers("Doctolib")

    entries = source_health.get_degradations(CID)
    assert entries[0]["code"] == DegradeReason.UPSTREAM_ERROR
    assert "boom" in entries[0]["reason"]
