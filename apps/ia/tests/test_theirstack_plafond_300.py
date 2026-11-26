"""Louis 01/11/2026 — TheirStack : 301 crédits AU PLUS (1 compte + 3 pages pleines) par recherche Découvrir (revient sur #4725 / #4676).

Une recherche « data » Île-de-France coûtait 901 crédits (1 compte + 9 pages de 100). Le crédit = une offre RENDUE
(+1 par compte). Déterministe, SANS réseau : la doublure de ``_request`` rend ``limit`` offres par page.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.services import discover_skill_offers as skill
from app.services import provider_cache
from app.services.data_sources import job_aggregators as agg

KEY_ENV = "THEIRSTACK_API_KEY"


class _Http:
    def __init__(self, sink: dict) -> None:
        self.sink = sink

    async def post(self, url: str, json: Any = None, headers: Any = None, **_: Any) -> None:
        self.sink.update(body=json)


class Net:
    def __init__(self) -> None:
        self.bodies: list[dict] = []
        self.total = 900

    @property
    def counts(self) -> list[dict]:
        return [b for b in self.bodies if b.get("include_total_results")]

    @property
    def offers(self) -> list[dict]:
        return [b for b in self.bodies if not b.get("include_total_results")]

    @property
    def credits(self) -> int:
        """Ce que TheirStack facture : 1 par compte, 1 par offre rendue."""
        return len(self.counts) + sum(self._rendered[id(b)] for b in self.offers)

    _rendered: dict[int, int]


@pytest.fixture
def net(monkeypatch) -> Net:
    state = Net()
    state._rendered = {}
    monkeypatch.setenv(KEY_ENV, "cle-de-test")

    async def request(provider, company, client, send, gate, *, headers_out=None):
        await asyncio.sleep(0)  # les compétences s'entrelacent comme sous asyncio.gather
        seen: dict = {}
        await send(_Http(seen))
        body = seen["body"]
        state.bodies.append(body)
        if body.get("include_total_results"):
            return {"metadata": {"total_results": state.total}, "data": []}
        first = body["page"] * body["limit"]
        n = max(0, min(body["limit"], state.total - first))
        state._rendered[id(body)] = n
        data = [
            {"id": first + i, "job_title": f"Dev {company} {first + i}", "company": f"ACME {first + i}",
             "location": "Lille", "date_posted": "2026-10-20", "url": f"https://x/{first + i}"}
            for i in range(n)
        ]
        return {"data": data}

    monkeypatch.setattr(agg, "_request", request)
    store: dict[tuple[str, str], Any] = {}

    async def get_json(namespace: str, key: str) -> Any:
        return store.get((namespace, key))

    async def set_json(namespace: str, key: str, value: Any, ttl: int | None = None) -> None:
        store[(namespace, key)] = value

    monkeypatch.setattr(provider_cache, "get_json", get_json)
    monkeypatch.setattr(provider_cache, "set_json", set_json)
    state.store = store  # type: ignore[attr-defined]
    return state


def test_budget_nomme_a_301() -> None:
    assert skill.THEIRSTACK_CREDITS_PER_SEARCH_MAX == 301


def test_total_900_ne_depense_jamais_plus_de_301_credits_et_la_page_de_trop_ne_part_pas(net: Net) -> None:
    harvest = skill.SkillHarvest()
    rows = asyncio.run(skill.paid_skill_offers("theirstack", "data", harvest, ["75"], ()))
    assert rows is not None and rows
    assert net.credits <= 301, net.credits
    assert len(net.offers) == 3  # compte + 3 pages ; la 4e ne part pas
    stats = harvest.by_source["theirstack"]
    assert stats["notAttempted"] >= 1 and stats["causes"].get("creditBudget", 0) >= 1
    assert harvest.theirstack_credits <= 301
    # la lecture tronquée n'est PAS rangée au cache 30 j comme complète
    assert not any(ns == skill._PAID_NAMESPACE for ns, _ in net.store)


def test_trois_competences_en_parallele_somme_sous_301_et_chacune_a_sa_part(net: Net) -> None:
    harvest = skill.SkillHarvest()
    harvest.theirstack_skills = 3

    async def run() -> list[Any]:
        return await asyncio.gather(
            *(skill.paid_skill_offers("theirstack", t, harvest, ["75"], ()) for t in ("data", "java", "react"))
        )

    results = asyncio.run(run())
    assert net.credits <= 301, net.credits
    assert all(r for r in results), "chaque compétence a eu sa part"
    for term in ("data", "java", "react"):
        assert any(b["job_title_or"][0] == term for b in net.offers)


def test_compte_servi_par_le_cache_ne_coute_aucun_credit(net: Net) -> None:
    net.total = 50
    asyncio.run(skill.paid_skill_offers("theirstack", "data", skill.SkillHarvest(), ["75"], ()))
    assert len(net.counts) == 1
    for k in [k for k in net.store if k[0] != skill._COUNT_NAMESPACE]:
        del net.store[k]
    harvest = skill.SkillHarvest()
    asyncio.run(skill.paid_skill_offers("theirstack", "data", harvest, ["75"], ()))
    assert len(net.counts) == 1  # pas de second compte
    # le compte relu au cache n'a rien réservé : seules les offres du rejeu sont comptées
    assert harvest.theirstack_credits <= 50


def test_plusieurs_moissons_d_une_meme_recherche_partagent_le_meme_budget(net: Net) -> None:
    """La cascade des offres de Laura relit en 3 moissons : le budget est celui de la RECHERCHE, pas de chaque moisson."""
    ledger = [0]
    for term in ("data", "java", "react", "python"):
        harvest = skill.SkillHarvest(theirstack_ledger=ledger)
        asyncio.run(skill.paid_skill_offers("theirstack", term, harvest, ["75"], ()))
    assert net.credits <= skill.THEIRSTACK_CREDITS_PER_SEARCH_MAX, net.credits
    assert ledger[0] <= skill.THEIRSTACK_CREDITS_PER_SEARCH_MAX


def test_une_requete_a_trois_vagues_de_cinq_appels_depense_301_credits_au_total(net: Net) -> None:
    """Recette prod 01/11 : 3 vagues × 5 moissons coûtaient ~900 (budget par moisson). UN budget par REQUÊTE."""

    async def run() -> None:
        with skill.request_credit_budget():
            for _wave in range(3):
                for term in ("data", "java", "react", "python", "sql"):
                    # une moisson neuve par appel : l'ancien code repartait à 0 à chacune
                    harvest = skill.SkillHarvest(
                        theirstack_ledger=skill._credits_override.get() or [0], theirstack_skills=5
                    )
                    await skill.paid_skill_offers("theirstack", f"{term}{_wave}", harvest, ["75"], ())

    asyncio.run(run())
    assert net.credits <= 301, net.credits
    assert net.credits > 100, "le budget a bien servi"
