"""#4419 (Louis 25/10/2026) — la recherche par compétence PAIE des sources d'offres pour être pertinente.

Mesuré en prod : ``received={'france_travail': 59, 'adzuna': 0}`` — une seule source nourrissait le chemin
compétence. Décision : TheirStack, Mantiks et Fantastic.jobs y entrent (geste utilisateur explicite ; la veille
reste sans achat), chacune derrière son adaptateur, no-op STRICT sans clé, cache 30 j, plafond d'appels payés.

Déterministe, SANS réseau : la couche HTTP (``job_aggregators._request``) est une doublure.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.services import discover_skill_offers as skill
from app.services import provider_cache
from app.services.data_sources import job_aggregators

_REAL_ADZUNA = skill.adzuna_offers
TODAY = datetime.now(UTC).date()
RECENT = (TODAY - timedelta(days=5)).isoformat()
PAID = ("theirstack", "mantiks", "fantastic_jobs")
KEYS = {"theirstack": "THEIRSTACK_API_KEY", "mantiks": "MANTIKS_API_KEY", "fantastic_jobs": "FANTASTIC_JOBS_API_KEY"}


def _payload(provider: str, employer: str, title: str = "Développeur Vue.js", city: str = "Lille") -> Any:
    if provider == "theirstack":
        return {"data": [{"job_title": title, "company": employer, "location": city, "date_posted": RECENT, "url": "https://x/1"}]}
    if provider == "fantastic_jobs":
        return [{"organization": employer, "title": title, "date_posted": RECENT, "locations_derived": [city], "url": "https://x/2"}]
    return {
        "data": [
            {
                "company": {"id": "9", "name": employer, "website": "https://acme.example"},
                "job": {"job_title": title, "published_date": RECENT, "job_url": "https://x/3", "location": {"city": city}},
                "matching_jobs": 1,
            }
        ]
    }


class Net:
    """La couche HTTP simulée : une réponse figée par fournisseur, tous les appels notés."""

    def __init__(self) -> None:
        self.calls: list[str] = []
        self.answers: dict[str, Any] = {}


@pytest.fixture
def net(monkeypatch) -> Net:
    state = Net()
    for env in KEYS.values():
        monkeypatch.delenv(env, raising=False)
    monkeypatch.delenv("ADZUNA_APP_ID", raising=False)
    monkeypatch.delenv("ADZUNA_APP_KEY", raising=False)

    class _Probe:
        async def post(self, url: str, json: Any = None, **_: Any) -> None:
            self.body = json

    async def request(provider, company, client, send, gate, *, headers_out=None):
        if provider == "theirstack":
            probe = _Probe()
            await send(probe)
            if (probe.body or {}).get("include_total_results"):
                return {}  # #4725 — compte illisible : la pagination d'avant reste, l'appel n'est pas une page payée
        state.calls.append(provider)
        return state.answers.get(provider)

    monkeypatch.setattr(job_aggregators, "_request", request)

    store: dict[tuple[str, str], Any] = {}

    async def get_json(namespace: str, key: str) -> Any:
        return store.get((namespace, key))

    async def set_json(namespace: str, key: str, value: Any, ttl: int | None = None) -> None:
        store[(namespace, key)] = value

    monkeypatch.setattr(provider_cache, "get_json", get_json)
    monkeypatch.setattr(provider_cache, "set_json", set_json)

    async def none(*_a: Any, **_k: Any) -> None:
        return None

    async def no_offers(*_a: Any, **_k: Any) -> list[dict]:
        return []

    monkeypatch.setattr(skill, "france_travail_offers", no_offers)
    monkeypatch.setattr(skill, "adzuna_offers", none)
    monkeypatch.setattr(skill, "cached_offers", no_offers)
    monkeypatch.setattr(skill, "_harvest_cache_get", none)
    monkeypatch.setattr(skill, "_harvest_cache_put", none)
    return state


def _harvest(term: str = "Vue.js", zone: tuple[str, ...] = ("59",)) -> skill.SkillHarvest:
    return asyncio.run(skill.harvest_skill_offers([term], list(zone), {}, deadline=None))


def test_sans_cle_zero_appel_et_aucune_source_tentee(net: Net) -> None:
    harvest = _harvest()
    assert net.calls == []
    for source in PAID:
        stats = harvest.by_source[source]
        assert stats["received"] == 0 and stats["paid"] == 0 and stats["cached"] == 0 and stats["notAttempted"] == 0


@pytest.mark.parametrize("provider", PAID)
def test_reponse_figee_les_offres_entrent_dans_la_moisson(net: Net, monkeypatch, provider: str) -> None:
    monkeypatch.setenv(KEYS[provider], "cle-de-test")
    net.answers[provider] = _payload(provider, "ACME WEB")
    harvest = _harvest()
    assert net.calls and set(net.calls) == {provider}
    assert [o["employer"] for o in harvest.offers] == ["ACME WEB"]
    stats = harvest.by_source[provider]
    assert stats["received"] == 1 and stats["kept"] == 1 and stats["paid"] == 1
    assert harvest.received[provider] == 1
    # les autres sources payantes, sans clé, ne sont pas comptées
    assert all(harvest.by_source[p]["paid"] == 0 for p in PAID if p != provider)


def test_cache_30_jours_un_seul_appel_paye(net: Net, monkeypatch) -> None:
    monkeypatch.setenv(KEYS["theirstack"], "cle-de-test")
    net.answers["theirstack"] = _payload("theirstack", "ACME WEB")
    first = _harvest(zone=("59",))
    paid_calls = len(net.calls)
    second = _harvest(zone=("59", "62"))  # autre zone ⇒ la moisson n'est pas resservie, le paiement l'est
    assert paid_calls >= 1 and len(net.calls) == paid_calls
    assert first.by_source["theirstack"]["paid"] >= 1 and first.by_source["theirstack"]["cached"] == 0
    assert second.by_source["theirstack"]["paid"] == 0 and second.by_source["theirstack"]["cached"] >= 1
    assert [o["employer"] for o in second.offers] == ["ACME WEB"]


def test_plafond_les_non_tentes_sont_comptes(net: Net, monkeypatch) -> None:
    for env in KEYS.values():
        monkeypatch.setenv(env, "cle-de-test")
    monkeypatch.setattr(skill, "SKILL_PAID_CALLS_MAX", 2)
    for provider in PAID:
        net.answers[provider] = _payload(provider, f"EMPLOYEUR {provider}")
    harvest = _harvest()
    assert len(net.calls) == 2
    assert sum(s["paid"] for s in harvest.by_source.values() if "paid" in s) == 2
    assert sum(harvest.by_source[p]["notAttempted"] for p in PAID) == 1


def test_dedoublonnage_meme_employeur_deux_sources_un_seul_compte(net: Net, monkeypatch) -> None:
    monkeypatch.setenv(KEYS["theirstack"], "cle-de-test")
    monkeypatch.setenv(KEYS["fantastic_jobs"], "cle-de-test")
    net.answers["theirstack"] = _payload("theirstack", "ACME Web SAS")
    net.answers["fantastic_jobs"] = _payload("fantastic_jobs", "Acme Web")

    async def resolve(name: str, siren: str | None = None, **_: Any) -> skill.EmployerResolution:
        return skill.EmployerResolution({"siren": "552081317", "name": "ACME WEB", "nafCode": "46.69B", "department": "59"})

    monkeypatch.setattr(skill, "resolve_employer", resolve)
    result = asyncio.run(skill.find_skill_accounts(["Vue.js"], ["59"], {}, deadline=None))
    assert len(result.accounts) + len(result.intermediaries) == 1
    # la provenance reste dans la donnée, jamais dans la preuve montrée à l'écran
    assert "theirstack" not in str(result.accounts[0]["skillEvidence"]["offers"])
    assert result.info["sources"]["theirstack"]["kept"] >= 1 and result.info["sources"]["fantastic_jobs"]["kept"] >= 1


@pytest.mark.parametrize(
    "text",
    [
        "Boulanger — en vue de l'ouverture de notre nouveau magasin",
        "Vendeur : vue d'ensemble des produits, belle vue sur la place",
        "Développeur front en vue de la refonte du site",
    ],
)
def test_le_mot_vue_francais_n_est_pas_la_competence(text: str) -> None:
    assert skill._mentions("Vue.js", skill._fold(text)) is False
    assert skill._mentions("vue", skill._fold(text)) is False


@pytest.mark.parametrize(
    "text", ["Développeur Vue.js", "Dev front VueJS", "Ingénieur front Vue 3 / Pinia", "Dev web, vue, typescript"]
)
def test_la_forme_technique_ou_le_contexte_it_est_la_competence(text: str) -> None:
    assert skill._mentions("Vue.js", skill._fold(text)) is True


def test_boulangerie_en_vue_de_rejetee_a_la_moisson() -> None:
    offer = {
        "employer": "BOULANGERIE DU COIN",
        "title": "Vendeur boulangerie",
        "description": "en vue de l'ouverture du magasin",
        "date": RECENT,
        "department": "59",
        "source": "france_travail",
    }
    cutoff = TODAY - timedelta(days=90)
    assert skill._reject_reason(offer, "Vue.js", frozenset({"59"}), cutoff, None, True, False) == "skillAbsent"


def test_adzuna_configuree_qui_rend_zero_dit_pourquoi(net: Net, monkeypatch) -> None:
    """Adzuna a ses clés en prod et rend 0 : le compteur distingue panne, quota et vrai vide (jamais « pas de clé »)."""
    monkeypatch.setenv("ADZUNA_APP_ID", "id-de-test")
    monkeypatch.setenv("ADZUNA_APP_KEY", "cle-de-test")
    from app.services import adzuna_budget

    async def allowed() -> bool:
        return True

    async def count() -> None:
        return None

    monkeypatch.setattr(adzuna_budget, "discover_allowed", allowed)
    monkeypatch.setattr(adzuna_budget, "record_network_call", count)
    monkeypatch.setattr(skill, "adzuna_offers", _REAL_ADZUNA)  # la vraie fonction : seul l'appel HTTP est simulé
    net.answers["adzuna"] = None  # réponse absente : HTTP refusé, clé refusée en série ou réseau
    harvest = _harvest()
    assert net.calls.count("adzuna") >= 1
    assert harvest.by_source["adzuna"].get("pagesFailed", 0) >= 1
    assert harvest.by_source["adzuna"].get("pagesOk", 0) == 0
    net.answers["adzuna"] = {"results": []}
    net.calls.clear()
    harvest = _harvest(zone=("59", "62"))
    assert harvest.by_source["adzuna"].get("pagesOk", 0) >= 1 and harvest.by_source["adzuna"].get("pagesFailed", 0) == 0
    assert harvest.by_source["adzuna"]["received"] == 0
