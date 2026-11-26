"""#4419 / #4518 / #4284.1 / #4284.26 — « dev vue à lille » : trois causes nommées par les journaux du 25/10.

1. le registre répond 400 : c'est NOTRE requête qui est refusée, l'écran ne doit pas accuser la source ;
2. ``received={'france_travail': 59, 'adzuna': 0}`` : sans clé, Adzuna est un no-op voulu — il n'est pas « tenté » ;
3. ``rejected={'outsideTrade': 0}`` sur 59 offres : le tri métier était sauté pour les offres France Travail, et un
   placeur gardait toute ouverture — « vue » (le mot français) validait « Vue.js » dans une boulangerie.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services import discover_skill_offers as skill
from app.services.company_filters import CompanyDiscoveryFilters, DegradeReason
from app.services.data_sources import job_aggregators, recherche_entreprises

NOW = datetime.now(UTC)


def _formes_cherchees(term: str) -> int:
    """#4579 — le nombre de formes sous lesquelles une compétence part : la saisie, sa forme étendue, puis ses
    ÉCRITURES du référentiel. Lu, jamais recopié : ajouter une écriture ne doit pas rendre un test faux."""
    from app.services.criteria_referential import skill_written_forms
    from app.services.flexible_search import upstream_query

    typed = dict.fromkeys([term, upstream_query(term)])
    known = {skill._fold(f) for f in typed}
    return len(typed) + len([f for f in skill_written_forms(term) if skill._fold(f) not in known])


def _offer(employer: str, title: str, *, description: str | None = None, source: str = "france_travail") -> dict:
    return {
        "employer": employer,
        "siren": None,
        "title": title,
        "city": "Lille",
        "department": "59",
        "date": (NOW - timedelta(days=3)).date().isoformat(),
        "url": f"https://offres.example/{employer}/{title}",
        "source": source,
        "contractType": None,
        "description": description,
        "termChecked": source == "france_travail",
    }


# « vue » est un mot français : il figure dans la description de n'importe quelle offre de vente.
_OFFERS = [
    _offer("PAUL BOULANGERIE", "Pochettes Surprise h/f", description="Mise en vue des produits en rayon."),
    _offer("TUYAUX SA", "Chargé d'Affaires Tuyauterie H/F", description="Avec une vue d'ensemble du chantier."),
    _offer("FRONT SARL", "Développeur Vue.js H/F", description="Vue 3, Pinia."),
    # Celle-ci cite la compétence sous sa forme TECHNIQUE : elle passe le contrôle du mot et arrive bien
    # jusqu'au tri MÉTIER, qui est ce que ce test doit prouver. Sans elle, le correctif du mot « vue »
    # écarterait tout en amont et le tri métier ne serait plus gardé par personne.
    _offer("BTP NORD", "Chef de chantier H/F", description="Suivi des lots via notre application Vue.js interne."),
]


@pytest.fixture
def harvest_of(monkeypatch):
    async def run(profile: dict, offers: list[dict]) -> skill.SkillHarvest:
        async def ft(term: str, department: str | None, profile: dict, *, page: int = 0) -> list[dict]:
            return [dict(o) for o in offers]

        monkeypatch.setattr(skill, "france_travail_offers", ft)
        monkeypatch.setattr(skill, "adzuna_offers", AsyncMock(return_value=[]))
        monkeypatch.setattr(skill, "cached_offers", AsyncMock(return_value=[]))
        monkeypatch.setattr(skill, "_harvest_cache_get", AsyncMock(return_value=None))
        monkeypatch.setattr(skill, "_harvest_cache_put", AsyncMock(return_value=None))
        return await skill.harvest_skill_offers(["Vue.js"], ["59"], profile, deadline=None)

    return run


@pytest.mark.parametrize(
    "profile",
    [{}, {"offerDomain": "esn_it"}, {"recruitsForClients": True}],
    ids=["profil-vide", "esn-it", "placeur-tous-metiers"],
)
def test_cause_3_trade_filter_rejects_off_trade_offers_from_france_travail(harvest_of, profile) -> None:
    harvest = asyncio.run(harvest_of(profile, _OFFERS))
    # #4419 (lot des sources payantes, 25/10) — la boulangerie et la tuyauterie ne sont PLUS comptées en
    # « outsideTrade » : le correctif du mot français « vue » les écarte un cran plus tôt, en « skillAbsent ».
    # Le résultat affiché est le même ; la raison est meilleure. L'ancienne attente (outsideTrade == 2) est
    # donc remplacée, pas supprimée : les deux motifs sont vérifiés nommément ci-dessous.
    assert harvest.rejected["skillAbsent"] == 2  # « mise en vue », « vue d'ensemble » : le mot, pas la techno
    assert harvest.rejected["outsideTrade"] == 1  # BTP NORD cite bien Vue.js, mais ce n'est pas notre métier
    assert [o["employer"] for o in harvest.offers] == ["FRONT SARL"]


def test_cause_3_only_it_skills_force_the_it_offer_rule() -> None:
    """Une compétence hors informatique (HSE) ne force pas le tri IT : le métier du vendeur décide seul."""
    assert skill._is_it_skill("Vue.js") is True
    assert skill._is_it_skill("vue") is True
    assert skill._is_it_skill("HSE") is False
    assert skill._is_it_skill("boulangerie") is False


def test_cause_2_adzuna_without_keys_is_not_attempted(monkeypatch) -> None:
    monkeypatch.delenv("ADZUNA_APP_ID", raising=False)
    monkeypatch.delenv("ADZUNA_APP_KEY", raising=False)
    monkeypatch.setattr(skill.adzuna_budget, "discover_allowed", AsyncMock(return_value=True))
    assert job_aggregators.adzuna_configured() is False
    assert asyncio.run(skill.adzuna_offers("vue")) is None  # « pas tentée », pas « zéro offre »


def test_cause_2_unconfigured_source_is_neither_counted_nor_tried(monkeypatch) -> None:
    async def ft(term, department, profile, *, page=0):
        return [dict(_OFFERS[2])]

    monkeypatch.setattr(skill, "france_travail_offers", ft)
    monkeypatch.setattr(skill, "adzuna_offers", AsyncMock(return_value=None))
    monkeypatch.setattr(skill, "cached_offers", AsyncMock(return_value=[]))
    monkeypatch.setattr(skill, "_harvest_cache_get", AsyncMock(return_value=None))
    monkeypatch.setattr(skill, "_harvest_cache_put", AsyncMock(return_value=None))
    harvest = asyncio.run(skill.harvest_skill_offers(["Vue.js"], ["59"], {}, deadline=None))
    # Vague IX / #4579 — une compétence part sous sa saisie ET ses écritures (« Vue.js » ⇒ vue, vuejs, vue 3) :
    # chaque source est donc interrogée une fois PAR ÉCRITURE. Ce que ce test tient ne change pas (une source
    # non branchée n'est ni comptée ni « tentée »), mais les nombres se LISENT du nombre d'écritures, ils ne se
    # recopient pas : un chiffre en dur redeviendrait faux au prochain ajout au référentiel.
    formes = _formes_cherchees("Vue.js")
    assert harvest.calls["adzuna"] == 0
    assert harvest.received["adzuna"] == 0
    assert harvest.tried == 2 * formes  # France Travail + cache, une fois par écriture ; Adzuna non comptée


def test_cause_2_configured_source_with_an_empty_answer_still_counts(monkeypatch) -> None:
    monkeypatch.setattr(skill, "france_travail_offers", AsyncMock(return_value=[]))
    monkeypatch.setattr(skill, "adzuna_offers", AsyncMock(return_value=[]))
    monkeypatch.setattr(skill, "cached_offers", AsyncMock(return_value=[]))
    monkeypatch.setattr(skill, "_harvest_cache_get", AsyncMock(return_value=None))
    monkeypatch.setattr(skill, "_harvest_cache_put", AsyncMock(return_value=None))
    harvest = asyncio.run(skill.harvest_skill_offers(["Vue.js"], ["59"], {}, deadline=None))
    # Vague IX / #4579 — le BUDGET D'APPELS est multiplié par le nombre d'écritures : une compétence déclinée
    # en quatre formes paie quatre appels par source. C'est la contrepartie assumée de #4579 (une annonce écrit
    # « VueJS », presque jamais « Vue »), et `calls` le DIT — ce compteur sert à lire le coût, pas à le cacher.
    formes = _formes_cherchees("Vue.js")
    assert harvest.calls["adzuna"] == formes
    assert harvest.tried == 3 * formes


# ── Cause 1 ──────────────────────────────────────────────────────────────────────────────────────────────────


def _list_with(monkeypatch, status: int) -> tuple[list[dict], list[dict]]:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json={"error": "x"})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    sink: list[dict] = []
    filters = CompanyDiscoveryFilters(q="dev vue", commune_code="59350")
    rows = asyncio.run(recherche_entreprises.list_companies(filters, 25, degraded=sink, client=client))
    return rows, sink


def test_cause_1_a_400_says_our_request_was_refused_not_that_the_source_is_down(monkeypatch) -> None:
    rows, sink = _list_with(monkeypatch, 400)
    assert rows == []
    assert [e["reason"] for e in sink] == [DegradeReason.REQUEST_REJECTED]
    assert DegradeReason.REQUEST_REJECTED != DegradeReason.UPSTREAM_ERROR
    assert DegradeReason.REQUEST_REJECTED != DegradeReason.NETWORK_ERROR


@pytest.mark.parametrize("status", [500, 502, 503])
def test_cause_1_a_5xx_keeps_the_upstream_message(monkeypatch, status) -> None:
    _rows, sink = _list_with(monkeypatch, status)
    assert [e["reason"] for e in sink] == [DegradeReason.UPSTREAM_ERROR]


def test_cause_1_the_failed_url_is_logged_without_secret(monkeypatch, caplog) -> None:
    import logging

    with caplog.at_level(logging.WARNING):
        _list_with(monkeypatch, 400)
    line = next(r.getMessage() for r in caplog.records if "failed (status 400)" in r.getMessage())
    assert "recherche-entreprises.api.gouv.fr/search" in line
    assert "commune" in line.lower()
    assert "token" not in line.lower() and "key" not in line.lower()
