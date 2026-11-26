"""#4420 — la matrice de couverture : POURQUOI chaque recherche par compétence est bridée.

Un compteur par cause (source sans clé, quota, 4xx, 5xx, délai, cache, filtré par le tri métier, hors zone), et le cas
« aucun rejet alors que des offres arrivent » rendu VISIBLE : c'est un filtre qui ne tourne pas (mesuré le 25/10 :
``outsideTrade 0`` sur 59 offres). Sources simulées : aucun réseau.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest

from app.services import coverage_matrix as matrix
from app.services import discover_skill_offers as skill
from app.services.company_filters import DegradeReason
from app.services.data_sources.signal_errors import SignalSourceUnavailable

NOW = datetime.now(UTC)


@pytest.mark.parametrize(
    ("exc", "cause"),
    [
        (SignalSourceUnavailable("france_travail", DegradeReason.MISSING_API_KEY), "noKey"),
        (SignalSourceUnavailable("france_travail", DegradeReason.UNAUTHORIZED), "unauthorized"),
        (SignalSourceUnavailable("france_travail", DegradeReason.QUOTA_EXCEEDED), "quota"),
        (SignalSourceUnavailable("france_travail", DegradeReason.RATE_LIMITED), "quota"),
        (SignalSourceUnavailable("france_travail", DegradeReason.REQUEST_REJECTED), "http4xx"),
        (SignalSourceUnavailable("france_travail", DegradeReason.UPSTREAM_ERROR), "http5xx"),
        (SignalSourceUnavailable("france_travail", DegradeReason.NETWORK_ERROR), "network"),
        (SignalSourceUnavailable("france_travail", DegradeReason.TIME_BUDGET), "timeout"),
        (TimeoutError(), "timeout"),
        (RuntimeError("mantiks: pas de réponse"), "other"),
    ],
)
def test_une_panne_de_source_a_sa_cause(exc: BaseException, cause: str) -> None:
    assert matrix.failure_cause(exc) == cause


def test_filtre_silencieux_sait_dire_non() -> None:
    quiet = {"received": 59, "rejected": dict.fromkeys(skill._OFFER_REJECTS, 0)}
    assert matrix.silent_filters({"france_travail": quiet}) == ["france_travail"]
    # des rejets : le filtre tourne
    noisy = {"received": 59, "rejected": {**dict.fromkeys(skill._OFFER_REJECTS, 0), "outsideTrade": 12}}
    assert matrix.silent_filters({"france_travail": noisy}) == []
    # trop peu d'offres pour conclure : aucun rejet sur 3 offres n'est pas une anomalie
    few = {"received": 3, "rejected": dict.fromkeys(skill._OFFER_REJECTS, 0)}
    assert matrix.silent_filters({"adzuna": few}) == []
    # une source sans offre reçue n'est pas un filtre muet
    assert matrix.silent_filters({"cache": {"received": 0, "rejected": {}}}) == []


def _offer(title: str, i: int, *, dept: str = "59") -> dict:
    return {
        "employer": f"EMP{i}",
        "siren": None,
        "title": title,
        "city": "Lille",
        "department": dept,
        "date": (NOW - timedelta(days=3)).date().isoformat(),
        "url": f"https://x.example/{i}",
        "source": "france_travail",
        "contractType": None,
        "termChecked": True,
    }


def _harvest(monkeypatch, *, ft, adzuna=None, cache=None):
    async def _ft(*_a, **_k):
        if isinstance(ft, BaseException):
            raise ft
        return ft

    async def _az(*_a, **_k):
        return adzuna

    async def _cache(*_a, **_k):
        return cache or []

    monkeypatch.setattr(skill, "france_travail_offers", _ft)
    monkeypatch.setattr(skill, "adzuna_offers", _az)
    monkeypatch.setattr(skill, "cached_offers", _cache)
    monkeypatch.setattr(skill, "_harvest_cache_get", AsyncMock(return_value=None))
    monkeypatch.setattr(skill, "_harvest_cache_put", AsyncMock(return_value=None))
    return asyncio.run(skill.harvest_skill_offers(["Java"], ["59"], {}, deadline=None))


@pytest.mark.parametrize(
    ("ft", "adzuna", "cause_ft", "cause_az"),
    [
        (SignalSourceUnavailable("france_travail", DegradeReason.MISSING_API_KEY), None, "noKey", "noKey"),
        (SignalSourceUnavailable("france_travail", DegradeReason.RATE_LIMITED), [], "quota", None),
        (SignalSourceUnavailable("france_travail", DegradeReason.REQUEST_REJECTED), [], "http4xx", None),
        (SignalSourceUnavailable("france_travail", DegradeReason.UPSTREAM_ERROR), [], "http5xx", None),
        (TimeoutError(), [], "timeout", None),
    ],
)
def test_la_moisson_compte_la_cause_par_source(monkeypatch, ft, adzuna, cause_ft, cause_az) -> None:
    harvest = _harvest(monkeypatch, ft=ft, adzuna=adzuna)
    assert harvest.by_source["france_travail"]["causes"][cause_ft] >= 1
    if cause_az:
        # Vague IX / #4579 — « Java » part aussi sous ses écritures (java 17, j2ee, jee) : la source est appelée
        # une fois par écriture et sa cause est comptée à CHAQUE appel. Le compte dit donc le nombre d'APPELS,
        # pas le nombre de sources. ⚠️ Question posée à Louis, pas tranchée ici : une cause de SOURCE (« pas de
        # clé », qui ne dépend pas de l'écriture demandée) devrait-elle être dédoublonnée, comme on dédoublonne
        # déjà une offre reçue ou rejetée vue sous deux écritures ?
        from app.services.criteria_referential import skill_written_forms

        appels = 1 + len(skill_written_forms("Java"))
        assert harvest.by_source["adzuna"]["causes"][cause_az] == appels
    coverage = matrix.coverage(harvest)
    assert coverage["causes"][cause_ft] >= 1


def test_une_moisson_resservie_du_cache_est_comptee(monkeypatch) -> None:
    cached = {
        "offers": [],
        "tried": 1,
        "calls": {},
        "received": {},
        "rejected": {},
        "bySource": {},
    }
    monkeypatch.setattr(skill, "_harvest_cache_get", AsyncMock(return_value=cached))
    harvest = asyncio.run(skill.harvest_skill_offers(["Java"], ["59"], {}, deadline=None))
    assert matrix.coverage(harvest)["causes"]["cache"] == 1


def test_les_offres_filtrees_sont_comptees_par_cause_metier_et_zone(monkeypatch) -> None:
    offers = [_offer("Développeur Java", i) for i in range(25)]
    offers += [_offer("Développeur Java", 100 + i, dept="13") for i in range(3)]  # hors zone
    harvest = _harvest(monkeypatch, ft=offers)
    coverage = matrix.coverage(harvest)
    assert coverage["filtered"]["outsideZone"] == 3
    assert set(coverage["filtered"]) >= {"outsideTrade", "outsideZone", "skillAbsent", "tooOld"}


def test_aucun_rejet_alors_que_des_offres_arrivent_est_signale(monkeypatch) -> None:
    harvest = _harvest(monkeypatch, ft=[_offer("Développeur Java", i) for i in range(30)])
    assert matrix.coverage(harvest)["silentFilters"] == ["france_travail"]


def test_la_couverture_voyage_dans_la_reponse_et_au_journal(monkeypatch, caplog) -> None:
    harvest = _harvest(monkeypatch, ft=[_offer("Développeur Java", i) for i in range(30)])
    line = matrix.log_line(matrix.coverage(harvest))
    assert "silencieux" in line and "france_travail" in line
