"""#4674 / L2 — le registre n'élimine plus un employeur prouvé par une offre.

Avant : un employeur dont le SIREN ne se résolvait pas était JETÉ (``continue``) — le registre (2 req/s, ~40
résolutions par recherche) était le plus petit tuyau de la chaîne. Maintenant : l'employeur nommé par une offre
réelle SORT, avec sa preuve (nom tel que l'annonce l'écrit, ville, lien, date) et un état d'identité nommé. Il ne
porte AUCUN SIREN (jamais deviné) : sans SIREN, ni analyse, ni contacts, ni enrichissement, ni CRM — par
construction (il vit dans ``pending``, pas dans ``accounts``).
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from app.services import discover_skill_offers as skill
from app.services import provider_cache
from app.services.homonym_disambiguation import HomonymResolution, ScoredCandidate

NOW = datetime.now(UTC)
HDF = "32"


def _day(days_ago: int) -> str:
    return (NOW - timedelta(days=days_ago)).date().isoformat()


def _offer(employer: str, title: str = "Développeur Java", *, city: str | None = "Lille", days_ago: int = 3) -> dict:
    return {
        "employer": employer,
        "siren": None,
        "title": title,
        "city": city,
        "department": "59",
        "date": _day(days_ago),
        "url": f"https://offres.example/{employer}/{title}/{days_ago}",
        "source": "france_travail",
        "contractType": None,
        "termChecked": True,
    }


class Frozen:
    def __init__(self) -> None:
        self.ft: list[dict] = []
        self.resolutions: dict[str, skill.EmployerResolution] = {}
        self.resolved: list[str] = []


@pytest.fixture
def frozen(monkeypatch) -> Frozen:
    state = Frozen()

    async def ft(term: str, department: str | None, profile: dict, *, page: int = 0) -> list[dict]:
        return list(state.ft) if department == "59" and page == 0 else []

    async def none(*_a: Any, **_k: Any) -> list[dict]:
        return []

    async def resolve(name: str, siren: str | None = None, *, department: str | None = None, **_: Any):
        state.resolved.append(name)
        return state.resolutions.get(name, skill.EmployerResolution(None, "registry_silent"))

    monkeypatch.setattr(skill, "france_travail_offers", ft)
    monkeypatch.setattr(skill, "adzuna_offers", none)
    monkeypatch.setattr(skill, "cached_offers", none)
    monkeypatch.setattr(skill, "resolve_employer", resolve)
    monkeypatch.setattr(skill, "_harvest_cache_get", AsyncMock(return_value=None))
    monkeypatch.setattr(skill, "_harvest_cache_put", AsyncMock(return_value=None))
    monkeypatch.setattr(skill, "skill_written_forms", lambda _term: [])
    return state


def _found(frozen_state: Frozen, *, deadline: float | None = None) -> skill.SkillAccounts:
    return asyncio.run(
        skill.find_skill_accounts(["Java"], skill.zone_departments([HDF], [], None), {}, deadline=deadline)
    )


def _identity(siren: str, name: str) -> dict:
    return {"siren": siren, "name": name, "nafCode": "46.69B", "city": "LILLE", "department": "59"}


# ── 1. Un employeur prouvé par une offre n'est plus jeté ────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("failure", "state"),
    [("unavailable", "pending"), ("deadline", "pending"), ("registry_silent", "unmatched"), ("homonym", "ambiguous")],
)
def test_employeur_prouve_par_une_offre_sort_quand_le_registre_echoue(frozen, failure, state) -> None:
    frozen.ft = [_offer("BOULANGERIE DUPONT", days_ago=5)]
    frozen.resolutions = {"BOULANGERIE DUPONT": skill.EmployerResolution(None, failure)}

    found = _found(frozen)

    assert found.accounts == []  # aucun SIREN deviné : il ne rejoint PAS les comptes résolus
    assert len(found.pending) == 1
    row = found.pending[0]
    assert row["name"] == "BOULANGERIE DUPONT"  # le nom tel que l'annonce l'écrit
    assert row["identity"] == state
    assert row["city"] == "Lille"
    assert row["skillEvidence"]["latestOffer"]["url"].startswith("https://offres.example/")
    assert row["skillEvidence"]["latestOffer"]["date"] == _day(5)
    assert "siren" not in row  # jamais un SIREN deviné, jamais une fiche vide


def test_administration_publique_n_est_pas_un_compte_a_rendre(frozen) -> None:
    frozen.ft = [_offer("MAIRIE DE LILLE")]
    frozen.resolutions = {"MAIRIE DE LILLE": skill.EmployerResolution(None, "public_administration")}

    found = _found(frozen)

    assert found.pending == []
    assert found.info["resolutionFailures"]["publicAdministration"] == 1


def test_un_cabinet_non_resolu_ne_devient_pas_un_compte_cible(frozen) -> None:
    frozen.ft = [_offer("SOPRA STERIA GROUP")]  # ESN connue : un concurrent, pas un client

    found = _found(frozen)

    assert found.pending == []
    assert found.info["unresolvedIntermediaries"] == 1


def test_un_employeur_resolu_reste_un_compte_et_ne_double_pas_en_attente(frozen) -> None:
    frozen.ft = [_offer("DECATHLON"), _offer("BOULANGERIE DUPONT")]
    frozen.resolutions = {"DECATHLON": skill.EmployerResolution(_identity("111111118", "DECATHLON"))}

    found = _found(frozen)

    assert [a["siren"] for a in found.accounts] == ["111111118"]
    assert [p["name"] for p in found.pending] == ["BOULANGERIE DUPONT"]


# ── 2. Compteurs : chacun sait monter dans le bon cas ───────────────────────────────────────────────────


def test_unresolved_rendered_monte_sur_un_refus_du_registre(frozen) -> None:
    frozen.ft = [_offer("BOULANGERIE DUPONT")]
    frozen.resolutions = {"BOULANGERIE DUPONT": skill.EmployerResolution(None, "unavailable")}

    info = _found(frozen).info

    assert info["unresolvedRendered"] == 1
    assert info["notAttempted"] == 0
    assert info["resolutionFailures"]["unavailable"] == 1


def test_not_attempted_monte_quand_le_delai_est_tombe_et_l_employeur_sort_quand_meme(frozen) -> None:
    import time

    frozen.ft = [_offer("BOULANGERIE DUPONT")]

    found = _found(frozen, deadline=time.monotonic() - 1)  # le budget est déjà tombé : rien n'est tenté

    assert found.info["notAttempted"] == 1
    assert found.info["unresolvedRendered"] == 1
    assert found.pending[0]["identity"] == "pending"
    assert found.pending[0]["identityReason"] == "not_attempted"
    assert frozen.resolved == []


def test_les_compteurs_restent_a_zero_quand_tout_se_resout(frozen) -> None:
    frozen.ft = [_offer("DECATHLON")]
    frozen.resolutions = {"DECATHLON": skill.EmployerResolution(_identity("111111118", "DECATHLON"))}

    info = _found(frozen).info

    assert info["unresolvedRendered"] == 0
    assert info["notAttempted"] == 0
    assert info["unresolvedIntermediaries"] == 0


def test_un_refus_ne_coupe_plus_la_file_tant_qu_il_reste_du_budget(frozen) -> None:
    """Le plafond « 3 refus consécutifs » est levé : chaque employeur est tenté (le coupe-circuit du registre et
    le délai restent les seuls freins)."""
    frozen.ft = [_offer(f"CLIENT {i:03d}") for i in range(30)]
    frozen.resolutions = {f"CLIENT {i:03d}": skill.EmployerResolution(None, "deadline") for i in range(30)}

    found = _found(frozen)

    assert len(frozen.resolved) == 30
    assert len(found.pending) == 30


# ── 3. Dédoublonnage sur un nom normalisé ───────────────────────────────────────────────────────────────


def test_bihr_et_bihr_sas_n_ont_qu_une_place_de_resolution(frozen) -> None:
    frozen.ft = [_offer("BIHR"), _offer("Bihr SAS", days_ago=9), _offer("B.I.H.R. S.A.S.", days_ago=11)]

    found = _found(frozen)

    assert len(frozen.resolved) == 1
    assert found.info["employerGroups"] == 1
    assert found.pending[0]["skillEvidence"]["offerCount"] == 3


def test_deux_raisons_sociales_distinctes_restent_deux_groupes(frozen) -> None:
    frozen.ft = [_offer("DUPONT TRANSPORTS SAS"), _offer("DUPONT LOGISTIQUE SAS"), _offer("DUPONT")]

    found = _found(frozen)

    assert len(frozen.resolved) == 3
    assert found.info["employerGroups"] == 3


@pytest.mark.parametrize(
    ("left", "right", "same"),
    [
        ("BIHR", "Bihr SAS", True),
        ("Société Générale SA", "SOCIETE GENERALE", True),
        ("Acme S.A.R.L.", "acme sarl", True),
        ("ACME EURL", "ACME", True),
        ("Acme SNC", "ACME SASU", True),
        ("ACME SERVICES", "ACME", False),
        ("ACME FRANCE", "ACME", False),
        ("ACME PARIS", "ACME LYON", False),
    ],
)
def test_nom_normalise(left, right, same) -> None:
    assert (skill.normalize_employer_name(left) == skill.normalize_employer_name(right)) is same


def test_un_nom_reduit_a_une_forme_juridique_ne_fusionne_pas_avec_un_tiers() -> None:
    assert skill.normalize_employer_name("SAS") != skill.normalize_employer_name("ACME")
    assert skill.normalize_employer_name("SAS")  # jamais vide : sinon tous les « SAS » seraient un seul groupe vide


# ── 4. Un homonyme ambigu ne fusionne jamais ────────────────────────────────────────────────────────────


def test_deux_employeurs_ambigus_restent_deux_lignes(frozen) -> None:
    frozen.ft = [_offer("DUPONT TRANSPORTS"), _offer("DUPONT LOGISTIQUE")]
    frozen.resolutions = {
        "DUPONT TRANSPORTS": skill.EmployerResolution(None, "homonym"),
        "DUPONT LOGISTIQUE": skill.EmployerResolution(None, "homonym"),
    }

    found = _found(frozen)

    assert sorted(p["name"] for p in found.pending) == ["DUPONT LOGISTIQUE", "DUPONT TRANSPORTS"]
    assert {p["identity"] for p in found.pending} == {"ambiguous"}
    assert len({p["id"] for p in found.pending}) == 2


# ── 5. Cache d'identité nom → SIREN, 90 jours ───────────────────────────────────────────────────────────


@pytest.fixture
def cache(monkeypatch) -> dict[tuple[str, str], tuple[Any, int | None]]:
    store: dict[tuple[str, str], tuple[Any, int | None]] = {}

    async def get(namespace: str, key: str):
        hit = store.get((namespace, key))
        return hit[0] if hit else None

    async def put(namespace: str, key: str, value: Any, ttl: int | None = None) -> None:
        store[(namespace, key)] = (value, ttl)

    monkeypatch.setattr(provider_cache, "get_json", get)
    monkeypatch.setattr(provider_cache, "set_json", put)
    return store


def _scored(siren: str, name: str, dept: str = "59") -> ScoredCandidate:
    return ScoredCandidate(
        siren=siren, name=name, department=dept, city="LILLE", nameScore=1.0, score=0.9, isActive=True
    )


def _unique(siren: str, name: str) -> HomonymResolution:
    return HomonymResolution(status="unique", selectedSiren=siren, candidateCount=1, candidates=[_scored(siren, name)])


def test_le_ttl_d_identite_est_de_90_jours() -> None:
    assert provider_cache.TTL_EMPLOYER_IDENTITY == 90 * 86400


def test_le_cache_evite_tout_second_appel_au_registre(cache) -> None:
    mock = AsyncMock(return_value=_unique("111111118", "BIHR"))
    with patch("app.services.research.homonym.resolve_company_identity", mock):
        first = asyncio.run(skill.resolve_employer("BIHR", None, department="59"))
        second = asyncio.run(skill.resolve_employer("Bihr SAS", None, department="59"))  # même nom normalisé

    assert first.identity is not None and first.identity["siren"] == "111111118"
    assert second.identity == first.identity
    assert mock.await_count == 1  # le second passage n'a touché ni le registre ni le réseau
    ((_ns, _key), (_value, ttl)) = next(iter(cache.items()))
    assert ttl == provider_cache.TTL_EMPLOYER_IDENTITY


def test_un_echec_n_est_jamais_range_en_cache(cache) -> None:
    mock = AsyncMock(return_value=HomonymResolution(status="none"))
    with patch("app.services.research.homonym.resolve_company_identity", mock):
        asyncio.run(skill.resolve_employer("BIHR", None))
        asyncio.run(skill.resolve_employer("BIHR", None))

    assert cache == {}
    assert mock.await_count == 2


def test_une_identite_tranchee_par_le_lieu_n_est_pas_rangee(cache) -> None:
    """L'homonyme tranché par le département de l'offre dépend du LIEU : le ranger sous le seul nom ferait gagner
    le mauvais DUPONT à une autre recherche."""
    ambiguous = HomonymResolution(
        status="ambiguous",
        candidateCount=2,
        candidates=[_scored("111111118", "DUPONT", "13"), _scored("222222226", "DUPONT", "59")],
    )
    mock = AsyncMock(return_value=ambiguous)
    with patch("app.services.research.homonym.resolve_company_identity", mock):
        out = asyncio.run(skill.resolve_employer("DUPONT", None, department="59"))

    assert out.identity is not None and out.identity["siren"] == "222222226"
    assert cache == {}
