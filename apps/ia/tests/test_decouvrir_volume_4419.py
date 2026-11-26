"""#4419 — Découvrir par compétence rendait 0 à 1 compte (Java / Vue, Hauts-de-France, 21/10/2026).

Mesure prod du 21/10 (espace de Louis) : Java + HdF ⇒ ``{offersSeen 96, employersFound 1,
unresolvedEmployers 42}`` → 1 compte. Le code expliquait déjà l'essentiel :

- France Travail : 5 départements > 3 ⇒ UN appel national de 100 offres, filtré sur la zone — la région
  était vide par construction (#4419.2) ;
- 25 employeurs au plus résolus au registre, les suivants comptés « non résolus » sans essai (#4419.4) ;
- résolution par NOM seul : une homonymie que le lieu de l'offre tranche restait non tranchée (#4419.3) ;
- une offre sans département dont le siège est hors zone disparaissait sans être comptée (#4419.5) ;
- aucun compteur par étape : impossible de dire OÙ la récolte se perd (#4419.1).

Le jeu ci-dessous est FIGÉ (aucun appel réseau) et rejoue les cinq étapes : sources → offres retenues →
groupes d'employeurs → résolution → zone / intermédiaires.
"""

from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from app.services import discover_skill_offers as skill
from app.services.homonym_disambiguation import HomonymResolution, ScoredCandidate

NOW = datetime.now(UTC)
HDF = "32"  # Hauts-de-France : 02, 59, 60, 62, 80


def _day(days_ago: int) -> str:
    return (NOW - timedelta(days=days_ago)).date().isoformat()


def _offer(employer: str | None, title: str, *, days_ago: int = 3, dept: str | None, source: str, **extra) -> dict:
    return {
        "employer": employer,
        "siren": None,
        "title": title,
        "city": extra.pop("city", None),
        "department": dept,
        "date": _day(days_ago),
        "url": f"https://offres.example/{employer}/{title}/{days_ago}/{dept}",
        "source": source,
        "contractType": None,
        **extra,
    }


def _identity(siren: str, name: str, dept: str, naf: str = "46.69B") -> dict:
    return {"siren": siren, "name": name, "nafCode": naf, "city": "LILLE", "department": dept}


class Frozen:
    """Le jeu figé : offres par source, résolutions par nom (identité OU motif d'échec)."""

    def __init__(self) -> None:
        self.ft: dict[str | None, list[dict]] = {}
        self.adzuna: list[dict] = []
        self.cache: list[dict] = []
        self.ft_calls: list[tuple[str | None, int]] = []
        self.resolutions: dict[str, skill.EmployerResolution] = {}
        self.hints: dict[str, str | None] = {}
        self.resolve_delay = 0.0


@pytest.fixture
def frozen(monkeypatch) -> Frozen:
    state = Frozen()

    async def ft(term: str, department: str | None, profile: dict, *, page: int = 0) -> list[dict]:
        state.ft_calls.append((department, page))
        return list(state.ft.get(department, [])) if page == 0 else []

    async def adzuna(term: str, department: str | None = None) -> list[dict]:
        return list(state.adzuna)

    async def cache(term: str, zone: frozenset[str] = frozenset()) -> list[dict]:
        return list(state.cache)

    async def resolve(name: str, siren: str | None = None, *, department: str | None = None, **_: Any):
        state.hints[name] = department
        if state.resolve_delay:
            await asyncio.sleep(state.resolve_delay)
        return state.resolutions.get(name, skill.EmployerResolution(None, "registry_silent"))

    monkeypatch.setattr(skill, "france_travail_offers", ft)
    monkeypatch.setattr(skill, "adzuna_offers", adzuna)
    monkeypatch.setattr(skill, "cached_offers", cache)
    monkeypatch.setattr(skill, "resolve_employer", resolve)
    monkeypatch.setattr(skill, "_harvest_cache_get", AsyncMock(return_value=None))
    monkeypatch.setattr(skill, "_harvest_cache_put", AsyncMock(return_value=None))
    # #4579 — « java » se décline désormais (java 17, j2ee, jee) : ce fichier compte les appels PAR DÉPARTEMENT, la
    # déclinaison a le sien (``test_declinaison_competence_4579.py``).
    monkeypatch.setattr(skill, "skill_written_forms", lambda _term: [])
    return state


def _hdf_zone() -> list[str]:
    return skill.zone_departments([HDF], [], None)


def _seed_hdf(state: Frozen) -> None:
    """Java en Hauts-de-France : un client final par département, un cabinet, une ESN, et chaque rejet."""
    found = skill.EmployerResolution
    state.ft = {
        "59": [
            _offer("DECATHLON", "Développeur Java H/F", dept="59", source="france_travail", termChecked=True),
            _offer("DECATHLON", "Lead dev Java", days_ago=10, dept="59", source="france_travail", termChecked=True),
            _offer("SIGNE PLUS", "Consultant Java", dept="59", source="france_travail", termChecked=True),
            _offer("SOPRA STERIA GROUP", "Ingénieur Java", dept="59", source="france_travail", termChecked=True),
            _offer("BOULANGERIE DUPONT", "Développeur Java", dept="59", source="france_travail", termChecked=True),
            _offer("MAIRIE DE LILLE", "Développeur Java", dept="59", source="france_travail", termChecked=True),
            # Hors délai (et anonyme) : rejetés à la moisson, comptés.
            _offer("VIEUX SA", "Développeur Java", days_ago=120, dept="59", source="france_travail", termChecked=True),
            _offer(None, "Développeur Java anonyme", dept="59", source="france_travail", termChecked=True),
            _offer("STAGIAIRE CORP", "Stage développeur Java", dept="59", source="france_travail", termChecked=True),
        ],
        "62": [_offer("ARC FRANCE", "Développeur Java", dept="62", source="france_travail", termChecked=True)],
        "80": [_offer("AMIENS LOGISTIQUE", "Java dev", dept="80", source="france_travail", termChecked=True)],
        "60": [],
        "02": [],
    }
    state.adzuna = [
        # #4419.5 — sans département : la localisation de l'agrégateur dit Nord → retenue.
        _offer(
            "LEROY MERLIN FRANCE",
            "Développeur Java",
            dept=None,
            source="adzuna",
            city="Lille, Nord",
            area=["France", "Hauts-de-France", "Nord", "Lille"],
        ),
        # La localisation dit Paris → hors zone, COMPTÉE.
        _offer(
            "PARIS SOFT",
            "Développeur Java",
            dept=None,
            source="adzuna",
            city="Paris",
            area=["France", "Ile-de-France", "Paris"],
        ),
        # Aucune localisation : le siège décide, après résolution.
        _offer("LYON SA", "Développeur Java", dept=None, source="adzuna"),
        # La compétence n'est pas citée : rejetée, comptée.
        _offer("PHP CORP", "Développeur PHP", dept=None, source="adzuna", area=["France", "Hauts-de-France", "Nord"]),
    ]
    state.resolutions = {
        "DECATHLON": found(_identity("306138900", "DECATHLON", "59", "47.64Z")),
        "SIGNE PLUS": found(_identity("512345678", "SIGNE +", "75", "78.10Z")),
        "SOPRA STERIA GROUP": found(_identity("326820065", "SOPRA STERIA GROUP", "75", "62.02A")),
        "BOULANGERIE DUPONT": found(None, "homonym"),
        "MAIRIE DE LILLE": found(None, "public_administration"),
        "ARC FRANCE": found(_identity("395032839", "ARC FRANCE", "62", "23.13Z")),
        "AMIENS LOGISTIQUE": found(None, "deadline"),
        "LEROY MERLIN FRANCE": found(_identity("384560942", "LEROY MERLIN FRANCE", "59", "47.52B")),
        "LYON SA": found(_identity("333333334", "LYON SA", "69")),
    }


def test_hauts_de_france_reads_france_travail_department_by_department(frozen) -> None:
    """#4419.2 — 5 départements ⇒ 5 appels départementaux par compétence, plus une lecture nationale filtrée."""
    _seed_hdf(frozen)

    harvest = asyncio.run(skill.harvest_skill_offers(["Java"], _hdf_zone(), {}, deadline=None))

    assert sorted(d for d, _p in frozen.ft_calls) == ["02", "59", "60", "62", "80"]
    assert harvest.calls["france_travail"] == 5
    assert skill.SKILL_FT_MAX_DEPARTMENTS >= 13


def test_whole_france_is_read_nationally_and_paginated(frozen) -> None:
    """Au-delà de 13 départements (ou sans zone) : la lecture nationale, paginée, s'arrête à une page incomplète."""
    full = [
        _offer(f"E{i}", "Développeur Java", dept="59", source="france_travail", termChecked=True) for i in range(100)
    ]
    calls: list[int] = []

    async def ft(term: str, department: str | None, profile: dict, *, page: int = 0) -> list[dict]:
        calls.append(page)
        assert department is None
        return [{**o, "url": f"{o['url']}/{page}"} for o in full] if page < 2 else full[:5]

    with patch.object(skill, "france_travail_offers", ft):
        harvest = asyncio.run(skill.harvest_skill_offers(["Java"], [], {}, deadline=None))

    assert calls == [0, 1, 2]
    assert len(calls) <= skill.SKILL_FT_NATIONAL_PAGES
    assert harvest.calls["france_travail"] == 3


def test_frozen_hauts_de_france_counts_every_stage(frozen) -> None:
    """#4419.1 — chaque étape dit combien entre et combien sort, rejets PAR MOTIF."""
    _seed_hdf(frozen)

    found = asyncio.run(skill.find_skill_accounts(["Java"], _hdf_zone(), {}, deadline=None))
    info = found.info

    # Étape 1 — les sources.
    assert info["offersBySource"] == {"france_travail": 11, "adzuna": 4, "cache": 0}
    # Étape 2 — les offres retenues, et chaque rejet par motif.
    assert info["offersRejected"] == {
        "anonymous": 1,
        "tooOld": 1,
        "internship": 1,
        "skillAbsent": 1,
        "outsideTrade": 0,
        "outsideZone": 1,
    }
    assert info["offersSeen"] == 10
    # #5009 — « N offres lues » = les offres REÇUES des sources (11 + 4). Le TOTAL « trouvées » n'est renvoyé par
    # aucune source (ni France Travail ni Adzuna ne le portent dans ce flux) : il est ABSENT, jamais inventé.
    assert info["offersRead"] == 15
    assert "offersTotal" not in info
    # Étape 3 — les groupes d'employeurs.
    assert info["employerGroups"] == 9
    assert info["beyondCap"] == 0
    # Étape 4 — la résolution, par motif ; le délai n'est jamais « introuvable ».
    assert info["resolutionFailures"] == {
        "homonym": 1,
        "registrySilent": 0,
        "publicAdministration": 1,
        "unavailable": 0,
    }
    assert info["notAttempted"] == 1
    assert info["unresolvedEmployers"] == 2
    # Étape 5 — zone (siège hors zone, offre sans lieu), intermédiaires, comptes.
    assert info["outsideZone"] == 1
    assert info["intermediaries"] == 2
    assert info["accountsFound"] == 3
    assert {a["siren"] for a in found.accounts} == {"306138900", "395032839", "384560942"}
    assert info["deadlineCut"] is True


def test_offer_place_is_passed_to_the_resolution(frozen) -> None:
    """#4419.3 — la résolution reçoit le département de l'offre pour trancher une homonymie."""
    _seed_hdf(frozen)

    asyncio.run(skill.find_skill_accounts(["Java"], _hdf_zone(), {}, deadline=None))

    assert frozen.hints["DECATHLON"] == "59"
    assert frozen.hints["ARC FRANCE"] == "62"
    assert frozen.hints["LEROY MERLIN FRANCE"] == "59"  # déduit de la localisation de l'agrégateur
    assert frozen.hints["LYON SA"] is None


def test_up_to_150_employers_are_tried_and_the_rest_is_counted(frozen) -> None:
    """#4419.4 — 160 employeurs : 150 tentés, 10 « au-delà du plafond », jamais confondus avec « introuvables »."""
    frozen.ft = {
        "59": [
            _offer(
                f"CLIENT {i:03d}",
                "Développeur Java",
                days_ago=1 + i % 60,
                dept="59",
                source="france_travail",
                termChecked=True,
            )
            for i in range(160)
        ]
    }
    frozen.resolutions = {
        f"CLIENT {i:03d}": skill.EmployerResolution(_identity(f"{100000000 + i:09d}", f"CLIENT {i:03d}", "59"))
        for i in range(160)
    }

    found = asyncio.run(skill.find_skill_accounts(["Java"], _hdf_zone(), {}, deadline=None))

    assert skill.SKILL_MAX_EMPLOYERS == 150
    assert found.info["beyondCap"] == 10
    assert found.info["accountsFound"] == 150
    assert found.info["unresolvedEmployers"] == 0
    # Trié : les offres les plus récentes d'abord.
    dates = [a["skillEvidence"]["latestOffer"]["date"] for a in found.accounts]
    assert dates == sorted(dates, reverse=True)


def test_resolution_is_bounded_by_the_deadline_and_says_so(frozen) -> None:
    """#4419.4 — résolveur simulé lent : la recherche rend dans son budget, les non-tentés sont comptés « délai »."""
    frozen.ft = {
        "59": [
            _offer(f"CLIENT {i:03d}", "Développeur Java", dept="59", source="france_travail", termChecked=True)
            for i in range(150)
        ]
    }
    frozen.resolutions = {
        f"CLIENT {i:03d}": skill.EmployerResolution(_identity(f"{100000000 + i:09d}", f"CLIENT {i:03d}", "59"))
        for i in range(150)
    }
    frozen.resolve_delay = 0.05

    started = time.monotonic()
    found = asyncio.run(skill.find_skill_accounts(["Java"], _hdf_zone(), {}, deadline=started + 0.4))
    elapsed = time.monotonic() - started

    assert elapsed < 1.0
    assert 0 < found.info["accountsFound"] < 150
    assert found.info["notAttempted"] + found.info["accountsFound"] == 150
    assert found.info["unresolvedEmployers"] == 0
    assert found.info["deadlineCut"] is True


def test_harvest_cache_key_is_versioned() -> None:
    """#4419.5 — la moisson a changé : une récolte bridée d'avant ne se ressert pas."""
    key = skill._harvest_key(["Java"], ["59"], {})
    assert key.startswith(skill.HARVEST_KEY_VERSION + "|")
    assert skill.HARVEST_KEY_VERSION != "k1"


def test_department_is_read_from_the_aggregator_location() -> None:
    assert skill.offer_department({"area": ["France", "Hauts-de-France", "Nord", "Lille"]}) == "59"
    assert skill.offer_department({"city": "Amiens, Somme"}) == "80"
    assert skill.offer_department({"city": "Lille"}) == "59"
    assert skill.offer_department({"department": "62", "area": ["France", "Nord"]}) == "62"
    # La garde sait dire NON : un lieu inconnu ne devine aucun département.
    assert skill.offer_department({"area": ["France"]}) is None
    assert skill.offer_department({"city": "Quelque part"}) is None


# ── #4419.3 — l'homonymie tranchée par le lieu de l'offre ────────────────────────────────────────


def _scored(siren: str, name: str, dept: str) -> ScoredCandidate:
    return ScoredCandidate(siren=siren, name=name, department=dept, city="X", nameScore=1.0, score=0.7, isActive=True)


def _ambiguous(*candidates: ScoredCandidate) -> HomonymResolution:
    return HomonymResolution(status="ambiguous", candidateCount=len(candidates), candidates=list(candidates))


def _resolve(resolution: HomonymResolution, department: str | None) -> skill.EmployerResolution:
    with patch("app.services.research.homonym.resolve_company_identity", AsyncMock(return_value=resolution)):
        return asyncio.run(skill.resolve_employer("DUPONT", None, department=department))


def test_homonym_in_the_offer_department_wins() -> None:
    resolution = _ambiguous(_scored("111111118", "DUPONT", "13"), _scored("222222226", "DUPONT", "59"))

    picked = _resolve(resolution, "59")

    assert picked.identity is not None and picked.identity["siren"] == "222222226"
    assert picked.failure is None


def test_homonym_tie_or_no_place_stays_unresolved() -> None:
    both_in_59 = _ambiguous(_scored("111111118", "DUPONT", "59"), _scored("222222226", "DUPONT", "59"))
    elsewhere = _ambiguous(_scored("111111118", "DUPONT", "13"), _scored("222222226", "DUPONT", "69"))

    for resolution, department in ((both_in_59, "59"), (elsewhere, "59"), (elsewhere, None)):
        out = _resolve(resolution, department)
        assert (out.identity, out.failure) == (None, "homonym")  # jamais un SIREN deviné
        # #4419.8 — l'homonymie non tranchée porte ses candidats : le commercial choisit.
        assert {c["siren"] for c in out.candidates} == {"111111118", "222222226"}


def test_registry_silence_and_outage_are_named_apart() -> None:
    from app.services.data_sources.signal_errors import SignalSourceUnavailable
    from app.services.distributed_rate_limiter import RateLimitTimeout

    silent = HomonymResolution(status="none")
    assert _resolve(silent, "59") == skill.EmployerResolution(None, "registry_silent")

    def _raising(exc: BaseException):
        return AsyncMock(side_effect=exc)

    timeout = SignalSourceUnavailable("recherche_entreprises", "time_budget")
    timeout.__cause__ = RateLimitTimeout("recherche_entreprises", 0.0)
    with patch("app.services.research.homonym.resolve_company_identity", _raising(timeout)):
        assert asyncio.run(skill.resolve_employer("DUPONT", None)) == skill.EmployerResolution(None, "deadline")
    with patch(
        "app.services.research.homonym.resolve_company_identity",
        _raising(SignalSourceUnavailable("recherche_entreprises", "network_error")),
    ):
        assert asyncio.run(skill.resolve_employer("DUPONT", None)) == skill.EmployerResolution(None, "unavailable")


def test_adzuna_skill_offers_carry_the_published_location(monkeypatch) -> None:
    """#4419.5 — la localisation publiée par l'agrégateur voyage avec l'offre (aucun paramètre neuf envoyé)."""
    from app.services.data_sources import job_aggregators

    monkeypatch.setenv("ADZUNA_APP_ID", "abc123")
    monkeypatch.setenv("ADZUNA_APP_KEY", "k" * 32)
    monkeypatch.setattr(job_aggregators.adzuna_budget, "record_network_call", AsyncMock())

    async def fake_request(provider, company, client, send, gate):
        return {
            "results": [
                {
                    "title": "Développeur Java",
                    "company": {"display_name": "LEROY MERLIN FRANCE"},
                    "created": _day(3),
                    "location": {"display_name": "Lille, Nord", "area": ["France", "Hauts-de-France", "Nord", "Lille"]},
                }
            ]
        }

    monkeypatch.setattr(job_aggregators, "_request", fake_request)
    rows = asyncio.run(job_aggregators.adzuna_skill_offers("Java", max_pages=1, max_age_days=90))

    assert rows[0]["area"] == ["France", "Hauts-de-France", "Nord", "Lille"]
    assert skill.offer_department(rows[0]) == "59"


def test_limiter_refusal_no_longer_stops_the_remaining_resolutions(frozen) -> None:
    """#4674 (renverse #4447.1) — un refus du limiteur ne coupe plus la file tant que le budget n'est pas tombé :
    chaque employeur est tenté, et ceux que le registre n'a pas résolus sortent quand même (identité « en cours »)."""
    frozen.ft = {
        "59": [
            _offer(f"CLIENT {i:03d}", "Développeur Java", dept="59", source="france_travail", termChecked=True)
            for i in range(40)
        ]
    }
    frozen.resolutions = {f"CLIENT {i:03d}": skill.EmployerResolution(None, "deadline") for i in range(40)}
    frozen.resolve_delay = 0.01

    found = asyncio.run(skill.find_skill_accounts(["Java"], _hdf_zone(), {}, deadline=None))

    assert len(frozen.hints) == 40
    assert found.info["notAttempted"] == 40  # « délai » reste dit à part de « introuvable »
    assert found.info["unresolvedEmployers"] == 0
    assert found.info["unresolvedRendered"] == 40
