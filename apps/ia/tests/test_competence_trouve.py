"""COMPETENCE-TROUVE (Louis 20/10/2026) — une compétence posée TROUVE les comptes qui recrutent dessus.

Constat prod : /discover « SAP » + Île-de-France et Grand Est ⇒ 0 compte, « 10 résultats hors cible
écartés ». La compétence ne faisait que FILTRER la liste du registre (zone × effectif), et un compte sans
pile connue sortait. Décision : dès qu'une compétence est posée, le tirage part des OFFRES (sources
gratuites par mot-clé + zone, cache commun d'offres), l'employeur est résolu au registre, les cabinets
et ESN vont dans une section à part, et les secteurs du profil n'écartent rien sur ce tirage.

Les sources sont simulées : aucun appel réseau.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from app.services import discover_skill_offers as skill

NOW = datetime.now(UTC)


def _day(days_ago: int) -> str:
    return (NOW - timedelta(days=days_ago)).date().isoformat()


def _offer_url(employer: str | None, title: str) -> str:
    """#4567 — l'URL est la clé de dédoublonnage de la récolte : elle doit être STABLE d'un processus à
    l'autre (``hash()`` des chaînes est randomisé par ``PYTHONHASHSEED``) et sans collision (pas de ``% 10_000``)."""
    digest = hashlib.sha1(f"{employer}|{title}".encode()).hexdigest()
    return f"https://offres.example/{digest}"


def test_offer_url_is_stable_across_processes_and_never_collides() -> None:
    assert _offer_url("BIHR", "Consultant SAP MM") == "https://offres.example/" + hashlib.sha1(
        b"BIHR|Consultant SAP MM"
    ).hexdigest()
    assert _offer_url("BIHR", "Consultant SAP MM") != _offer_url("BIHR", "Consultant SAP FICO")
    assert _offer_url(None, "x") != _offer_url("None2", "x")


def _offer(employer: str | None, title: str, *, days_ago: int, city: str, dept: str | None, source: str) -> dict:
    return {
        "employer": employer,
        "siren": None,
        "title": title,
        "city": city,
        "department": dept,
        "date": _day(days_ago),
        "url": _offer_url(employer, title),
        "source": source,
        "contractType": None,
    }


#: Le registre, tel que le résolveur le rendrait (nom d'employeur → identité).
REGISTRY = {
    "BIHR": {
        "siren": "433091839",
        "name": "BIHR",
        "nafCode": "46.69B",
        "sector": "Commerce de gros de fournitures et équipements industriels divers",
        "city": "BARTENHEIM",
        "department": "68",
        "headcountTranche": "32",
        "headcountRange": "250 à 499 salariés",
    },
    "SIGNE PLUS": {
        "siren": "512345678",
        "name": "SIGNE +",
        "nafCode": "78.10Z",
        "sector": "Activités des agences de placement de main-d'œuvre",
        "city": "PARIS",
        "department": "75",
    },
    "SOPRA STERIA GROUP": {
        "siren": "326820065",
        "name": "SOPRA STERIA GROUP",
        "nafCode": "62.02A",
        "sector": "Conseil en systèmes et logiciels informatiques",
        "city": "PARIS",
        "department": "75",
    },
    "MICHAEL PAGE": {
        "siren": "313773624",
        "name": "MICHAEL PAGE INTERNATIONAL FRANCE",
        "nafCode": None,
        "sector": None,
        "city": "PARIS",
        "department": "75",
    },
    "STAGIAIRE CORP": {"siren": "111111118", "name": "STAGIAIRE CORP", "nafCode": "46.69B", "department": "75"},
    "VIEUX SA": {"siren": "222222226", "name": "VIEUX SA", "nafCode": "46.69B", "department": "75"},
    "LYON SAP": {"siren": "333333334", "name": "LYON SAP", "nafCode": "46.69B", "department": "69"},
}

#: Un compte du registre (zone × effectif) SANS aucune offre SAP : il ne doit pas s'afficher.
ACME = {
    "name": "ACME LOGISTIQUE",
    "siren": "552081317",
    "nafCode": "52.29A",
    "sector": "Messagerie, fret express",
    "city": "Mulhouse",
    "department": "68",
    "headcountRange": "250 à 499 salariés",
    "creationDate": "2005-03-14",
}

#: Un profil ESN dont la cible déclarée (banque) écarterait BIHR sur le tirage registre.
PROFILE = {"sectors": ["Banque & Assurance"]}


class Sources:
    def __init__(self) -> None:
        self.ft: list[dict] = []
        self.adzuna: list[dict] = []
        self.cache: list[dict] = []
        self.ft_calls: list[str | None] = []
        self.resolved: list[str] = []


@pytest.fixture
def sources(monkeypatch) -> Sources:
    state = Sources()

    async def ft(term: str, department: str | None, profile: dict, *, page: int = 0, **_: Any) -> list[dict]:  # #4675 — commune, distance
        state.ft_calls.append(department)
        return [o for o in state.ft if department is None or o["department"] == department]

    async def adzuna(term: str, department: str | None = None) -> list[dict]:
        return list(state.adzuna)

    async def cache(term: str, zone: frozenset[str] = frozenset()) -> list[dict]:
        return list(state.cache)

    async def resolve(name: str, siren: str | None = None, **_: Any) -> skill.EmployerResolution:
        state.resolved.append(name)
        identity = REGISTRY.get(name.upper())
        return skill.EmployerResolution(identity, None if identity else "registry_silent")

    monkeypatch.setattr(skill, "france_travail_offers", ft)
    monkeypatch.setattr(skill, "adzuna_offers", adzuna)
    monkeypatch.setattr(skill, "cached_offers", cache)
    monkeypatch.setattr(skill, "resolve_employer", resolve)
    monkeypatch.setattr(skill, "_harvest_cache_get", AsyncMock(return_value=None))
    monkeypatch.setattr(skill, "_harvest_cache_put", AsyncMock(return_value=None))
    return state


@pytest.fixture
def registry(monkeypatch):
    rows: list[dict] = []

    async def _stub(filters, limit, degraded=None):
        return list(rows)

    monkeypatch.setattr("app.routers.discover._registry_search", _stub)
    monkeypatch.setattr("app.routers.discover._fallback_search", _stub)
    return rows


def _post(client, filters: dict[str, Any]):
    with patch("app.routers.discover.call_claude", new_callable=AsyncMock, return_value=({"angles": []}, None)):
        return client.post("/discover/registry", json={"filters": filters, "profile_data": PROFILE})


LOUIS = {
    "regions": ["11", "44"],
    "headcountMin": 250,
    "headcountMax": 999,
    "technologiesObserved": ["SAP"],
    "keywords": ["SAP"],
}


def test_sap_ile_de_france_grand_est_finds_hiring_employers(client, sources, registry) -> None:
    registry.append(ACME)
    sources.ft = [
        _offer(
            "BIHR",
            "Business Analyst SAP SD H/F",
            days_ago=4,
            city="68 - BARTENHEIM",
            dept="68",
            source="france_travail",
        ),
        _offer("BIHR", "Consultant SAP MM", days_ago=21, city="68 - BARTENHEIM", dept="68", source="france_travail"),
        _offer("SIGNE PLUS", "Consultant SAP FICO", days_ago=2, city="75 - PARIS", dept="75", source="france_travail"),
        _offer(
            "STAGIAIRE CORP", "Stage - Assistant SAP", days_ago=3, city="75 - PARIS", dept="75", source="france_travail"
        ),
        _offer(None, "Consultant SAP anonyme", days_ago=1, city="75 - PARIS", dept="75", source="france_travail"),
        _offer("LYON SAP", "Chef de projet SAP", days_ago=1, city="69 - LYON", dept="69", source="france_travail"),
    ]
    sources.adzuna = [
        _offer("Michael Page", "Chef de projet SAP S/4HANA", days_ago=6, city="Paris", dept=None, source="adzuna"),
        _offer("VIEUX SA", "Consultant SAP BW", days_ago=120, city="Paris", dept=None, source="adzuna"),
    ]
    sources.cache = [
        {
            **_offer(
                "SOPRA STERIA GROUP",
                "SAP Excellence Center — Consultant",
                days_ago=9,
                city="Paris",
                dept="75",
                source="merged",
            ),
            "siren": "326820065",
        },
    ]

    res = _post(client, LOUIS)

    assert res.status_code == 200, res.text
    body = res.json()
    sirens = [c["siren"] for c in body["candidates"]]
    # L'employeur final en tête, avec sa preuve : deux offres, la plus récente nommée.
    assert sirens[0] == "433091839", sirens
    bihr = body["candidates"][0]
    assert bihr["skillEvidence"]["offerCount"] == 2
    assert bihr["skillEvidence"]["skill"] == "SAP"
    assert bihr["skillEvidence"]["latestOffer"]["title"] == "Business Analyst SAP SD H/F"
    assert bihr["skillEvidence"]["latestOffer"]["url"].startswith("https://")
    # Le compte du registre sans offre SAP n'est pas affiché (on n'affiche pas ce qu'on n'a pas).
    assert "552081317" not in sirens
    # Un stage, une offre anonyme, une offre de plus de 90 j, un employeur hors zone : aucun compte.
    every = sirens + [i["siren"] for i in body["skillIntermediaries"]]
    for absent in ("111111118", "222222226", "333333334"):
        assert absent not in every
    # Cabinets et ESN : à part, jamais dans la liste principale.
    inter = {i["siren"]: i for i in body["skillIntermediaries"]}
    assert inter["512345678"]["kind"] == "recruiter"
    assert inter["313773624"]["kind"] == "recruiter"
    assert inter["326820065"]["kind"] == "esn"
    assert not set(inter) & set(sirens)
    # Les secteurs du profil n'écartent rien sur ce tirage (BIHR est hors de la cible « banque »).
    assert body.get("targetSectorFilter") is None
    assert body["query"]["skillSearch"]["skills"] == ["SAP"]


def test_registry_account_without_offer_is_not_shown_and_cause_is_named(client, sources, registry) -> None:
    registry.append(ACME)

    body = _post(client, LOUIS).json()

    assert body["candidates"] == []
    assert body["skillIntermediaries"] == []
    assert body["query"]["skillSearch"]["emptyCause"] == "no_offers"


def test_only_intermediaries_says_so(client, sources, registry) -> None:
    sources.ft = [
        _offer("SIGNE PLUS", "Consultant SAP FICO", days_ago=2, city="75 - PARIS", dept="75", source="france_travail"),
    ]

    body = _post(client, LOUIS).json()

    assert body["candidates"] == []
    assert [i["siren"] for i in body["skillIntermediaries"]] == ["512345678"]
    assert body["query"]["skillSearch"]["emptyCause"] == "only_intermediaries"


def test_city_filters_on_the_city_not_the_whole_department(client, sources, registry, monkeypatch) -> None:
    """Recette 21/10 B.3 (Kevin) — Java + « Lille » ne rend pas le CH de Maubeuge (59) : la ville filtre sur la ville."""
    monkeypatch.setitem(
        REGISTRY,
        "CH LILLOIS",
        {"siren": "444444440", "name": "CH LILLOIS", "nafCode": "86.10Z", "city": "LILLE", "department": "59"},
    )
    monkeypatch.setitem(
        REGISTRY,
        "CH MAUBEUGE",
        {"siren": "555555558", "name": "CH MAUBEUGE", "nafCode": "86.10Z", "city": "MAUBEUGE", "department": "59"},
    )
    sources.ft = [
        _offer("CH LILLOIS", "Développeur Java", days_ago=2, city="59 - LILLE", dept="59", source="france_travail"),
        _offer("CH MAUBEUGE", "Développeur Java", days_ago=1, city="59 - MAUBEUGE", dept="59", source="france_travail"),
    ]

    body = _post(client, {"city": "Lille", "keywords": ["Java"]}).json()

    # ⚠️ Règle FINALE (Louis 27/10/2026, lot DÉCOUVRIR-MOTEUR) : Maubeuge n'est jamais présenté comme « Lille » — la
    # ville filtre sur la ville (ou son cercle mesuré) ; un compte du département n'entre que par le palier NOMMÉ.
    exact = [c["name"] for c in body["candidates"] if not c.get("zone")]
    assert exact == ["CH LILLOIS"]
    assert all(c["zone"]["tier"] != "city" for c in body["candidates"] if c.get("zone"))
    assert body["query"]["skillSearch"]["city"] == "Lille"
    assert body["query"]["skillSearch"]["outsideCity"] == 1


def test_offer_in_city_is_exact_and_says_no() -> None:
    assert skill.offer_in_city("59 - LILLE", "Lille")
    assert skill.offer_in_city("Lille 3e", "lille")
    assert not skill.offer_in_city("59 - MAUBEUGE", "Lille")
    assert not skill.offer_in_city(None, "Lille")
    assert not skill.offer_in_city("Villeneuve-d'Ascq", "Lille")


def test_without_skill_the_registry_path_is_unchanged(client, sources, registry) -> None:
    """La garde sait dire NON : sans compétence, aucune source d'offres n'est interrogée par mot-clé."""
    registry.append(ACME)

    body = _post(client, {"departments": ["68"]}).json()

    assert sources.ft_calls == []
    assert "skillIntermediaries" not in body or body["skillIntermediaries"] == []
    assert "skillSearch" not in body["query"]


def test_france_travail_calls_are_bounded_for_a_wide_zone(sources) -> None:
    """Deux régions = 18 départements (> 13, #4419.2) : jamais 18 appels — la lecture nationale paginée, filtrée
    sur la zone (une page incomplète arrête la pagination)."""
    import asyncio

    sources.ft = [
        _offer(
            "BIHR",
            "Business Analyst SAP SD H/F",
            days_ago=4,
            city="68 - BARTENHEIM",
            dept="68",
            source="france_travail",
        ),
        _offer("LYON SAP", "Chef de projet SAP", days_ago=1, city="69 - LYON", dept="69", source="france_travail"),
    ]
    zone = sorted(skill.zone_departments(["11", "44"], [], None))
    harvest = asyncio.run(skill.harvest_skill_offers(["SAP"], zone, {}, deadline=None))

    assert len(sources.ft_calls) <= skill.SKILL_FT_NATIONAL_PAGES
    assert set(sources.ft_calls) == {None}
    assert {o["employer"] for o in harvest.offers} == {"BIHR"}


def test_skill_terms_read_keywords_and_technologies() -> None:
    assert skill.skill_terms(["SAP", " sap "], ["SAP"]) == ["SAP"]
    assert skill.skill_terms(None, None) == []


# ── Les sources, une par une ─────────────────────────────────────────────────────────────────────


def test_adzuna_skill_search_is_a_strict_noop_without_keys(monkeypatch) -> None:
    import asyncio

    from app.services.data_sources import job_aggregators

    monkeypatch.delenv("ADZUNA_APP_ID", raising=False)
    monkeypatch.delenv("ADZUNA_APP_KEY", raising=False)
    sent = AsyncMock()
    monkeypatch.setattr(job_aggregators, "_request", sent)

    assert asyncio.run(job_aggregators.adzuna_skill_offers("SAP", max_pages=2, max_age_days=90)) == []
    sent.assert_not_called()


def test_adzuna_skill_search_sends_only_documented_params_and_drops_internships(monkeypatch) -> None:
    import asyncio

    from app.services.data_sources import job_aggregators

    monkeypatch.setenv("ADZUNA_APP_ID", "abc123")
    monkeypatch.setenv("ADZUNA_APP_KEY", "k" * 32)
    monkeypatch.setattr(job_aggregators.adzuna_budget, "record_network_call", AsyncMock())
    seen: list[dict] = []

    class _Http:
        async def get(self, url, params):
            seen.append(dict(params))
            return None

    async def fake_request(provider, company, client, send, gate):
        await send(_Http())
        return {
            "results": [
                {"title": "Consultant SAP FICO", "company": {"display_name": "BDO France"}, "created": _day(3)},
                {"title": "Stage SAP", "company": {"display_name": "BDO France"}, "created": _day(3)},
                {"title": "Consultant SAP anonyme", "company": {}, "created": _day(3)},
            ]
        }

    monkeypatch.setattr(job_aggregators, "_request", fake_request)
    rows = asyncio.run(job_aggregators.adzuna_skill_offers("SAP", max_pages=2, max_age_days=90))

    assert [r["title"] for r in rows] == ["Consultant SAP FICO"]
    assert len(seen) == 1  # page incomplète : pas de seconde page
    assert set(seen[0]) == {"app_id", "app_key", "what", "results_per_page", "max_days_old", "content-type"}
    assert seen[0]["what"] == "SAP" and seen[0]["max_days_old"] == 90


def test_shared_cache_search_escapes_and_is_empty_without_store(monkeypatch) -> None:
    import asyncio

    from app.services import source_cache

    monkeypatch.setattr(source_cache, "_store", AsyncMock(return_value=None))
    assert asyncio.run(source_cache.search_job_offers("SAP", max_age_s=86_400, limit=10)) == []

    asked: list[tuple] = []

    class _Store:
        async def search_jobs(self, needle, max_age_s, limit):
            asked.append((needle, max_age_s, limit))
            return [("siren:433091839|merged", {"rows": []})]

    monkeypatch.setattr(source_cache, "_store", AsyncMock(return_value=_Store()))
    assert asyncio.run(source_cache.search_job_offers("100%_sap", max_age_s=60, limit=5)) == [
        ("siren:433091839|merged", {"rows": []})
    ]
    assert asked == [("100\\%\\_sap", 60, 5)]


def test_kevin_k4_java_seul_sans_zone_ni_effectif_trouve_par_les_offres(client, sources, registry) -> None:
    # KEVIN-FIX K.4 — « Java » posé SEUL (aucun autre filtre) : la compétence TROUVE, elle ne filtre pas un registre vide.
    sources.ft = [
        _offer("BIHR", "Développeur Java H/F", days_ago=3, city="68 - BARTENHEIM", dept="68", source="france_travail"),
    ]
    res = _post(client, {"keywords": ["Java"]})
    assert res.status_code == 200, res.text
    body = res.json()
    assert [c["siren"] for c in body["candidates"]] == ["433091839"]
    assert body["candidates"][0]["skillEvidence"]["skill"] == "Java"
    # #4433 — un seul compte exact : les paliers (Spring, Kotlin…) lisent aussi les offres, toujours en national.
    assert sources.ft_calls and set(sources.ft_calls) == {None}, "zone vide = une lecture nationale"
