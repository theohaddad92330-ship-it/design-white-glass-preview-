"""#4724 (TS-C, épopée #4721) — TheirStack ne cache rien : un rejeu repaie les mêmes offres.

Le rejeu envoie ``discovered_at_gte`` (date du dernier appel) + ``job_id_not`` (ids déjà payés) ET GARDE
``posted_at_max_age_days`` ; les offres déjà payées sont servies depuis le STOCK (qui survit au cache 30 j) et fusionnées
aux neuves. Règle qui prime : le rejeu rend AUTANT OU PLUS d'offres qu'avant, jamais moins.
Déterministe, SANS réseau : ``_request`` rejoue l'appel sur un faux client pour lire le corps réellement envoyé.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.services import adzuna_budget, provider_cache
from app.services import discover_skill_offers as skill
from app.services.data_sources import job_aggregators as agg

KEY_ENV = "THEIRSTACK_API_KEY"


def _day(days_ago: int) -> str:
    return (datetime.now(UTC).date() - timedelta(days=days_ago)).isoformat()


def _hits(ids: range | list[int], days_ago: int = 5, employer: str = "ACME") -> dict:
    return {
        "data": [
            {
                "id": i,
                "job_title": f"Développeur Vue.js {i}",
                "company": employer,
                "location": "Lille",
                "date_posted": _day(days_ago),
                "url": f"https://x/{i}",
            }
            for i in ids
        ]
    }


class _Http:
    def __init__(self, sink: dict) -> None:
        self.sink = sink

    async def post(self, url: str, json: Any = None, headers: Any = None, **_: Any) -> None:
        self.sink.update(body=json)


class Net:
    def __init__(self) -> None:
        self.bodies: list[dict] = []
        self.answers: list[Any] = [{"data": []}]

    def answer(self) -> Any:
        return self.answers.pop(0) if len(self.answers) > 1 else self.answers[0]


@pytest.fixture
def net(monkeypatch) -> Net:
    state = Net()
    monkeypatch.delenv(KEY_ENV, raising=False)

    async def request(provider, company, client, send, gate, *, headers_out=None):
        seen: dict = {}
        await send(_Http(seen))
        if seen["body"].get("include_total_results"):
            return {}  # #4725 — ces tests lisent la pagination d'avant : un compte illisible la laisse intacte
        state.bodies.append(seen["body"])
        return state.answer()

    monkeypatch.setattr(agg, "_request", request)
    store: dict[tuple[str, str], Any] = {}

    async def get_json(namespace: str, key: str) -> Any:
        return store.get((namespace, key))

    async def set_json(namespace: str, key: str, value: Any, ttl: int | None = None) -> None:
        store[(namespace, key)] = value

    monkeypatch.setattr(provider_cache, "get_json", get_json)
    monkeypatch.setattr(provider_cache, "set_json", set_json)
    state.store = store  # type: ignore[attr-defined]

    async def none(*_a: Any, **_k: Any) -> None:
        return None

    async def no_offers(*_a: Any, **_k: Any) -> list[dict]:
        return []

    async def allowed() -> bool:
        return True

    monkeypatch.setattr(skill, "france_travail_offers", no_offers)
    monkeypatch.setattr(skill, "cached_offers", no_offers)
    monkeypatch.setattr(skill, "_harvest_cache_get", none)
    monkeypatch.setattr(skill, "_harvest_cache_put", none)
    monkeypatch.setattr(adzuna_budget, "discover_allowed", allowed)
    monkeypatch.setattr(adzuna_budget, "record_network_call", none)
    return state


def _search():
    """La recherche fiche SANS son cache 30 j : c'est ce qui arrive APRÈS expiration du TTL."""
    return agg._theirstack_search.__wrapped__("Acme")


def _ids(found: Any) -> list[int]:
    return sorted(o["sourceId"] for o in found["offers"])


# ── Fiche entreprise ───────────────────────────────────────────────────────────────────────────────────────────


def test_fiche_premier_appel_sans_filtre_anti_redite_et_ids_ranges(net: Net, monkeypatch) -> None:
    monkeypatch.setenv(KEY_ENV, "cle-de-test")
    net.answers = [_hits(range(1, 4))]
    found = asyncio.run(_search())
    body = net.bodies[0]
    assert "discovered_at_gte" not in body and "job_id_not" not in body
    assert body["posted_at_max_age_days"] == 90
    assert _ids(found) == [1, 2, 3]


def test_fiche_rejeu_envoie_discovered_at_gte_et_garde_la_fenetre_d_age(net: Net, monkeypatch) -> None:
    monkeypatch.setenv(KEY_ENV, "cle-de-test")
    net.answers = [_hits(range(1, 4)), {"data": []}]
    first = asyncio.run(_search())
    stock = next(v for (ns, _k), v in net.store.items() if "stock" in ns)
    asyncio.run(_search())
    body = net.bodies[-1]
    assert body["discovered_at_gte"] == stock["calledAt"]
    assert body["posted_at_max_age_days"] == 90  # sinon TheirStack refuse la requête
    assert sorted(body["job_id_not"]) == [1, 2, 3]
    assert len(first["offers"]) == 3


def test_fiche_rejeu_rend_autant_ou_plus_a_stock_constant(net: Net, monkeypatch) -> None:
    monkeypatch.setenv(KEY_ENV, "cle-de-test")
    net.answers = [_hits(range(1, 4)), {"data": []}, _hits([9]), {"data": []}]
    first = asyncio.run(_search())
    same = asyncio.run(_search())  # rien de neuf : le stock répond
    more = asyncio.run(_search())  # une offre neuve : stock + neuve
    assert _ids(same) == _ids(first) == [1, 2, 3]
    assert _ids(more) == [1, 2, 3, 9]


def test_fiche_offre_hors_fenetre_ne_ressort_pas_du_stock(net: Net, monkeypatch) -> None:
    monkeypatch.setenv(KEY_ENV, "cle-de-test")
    old = _hits([1], days_ago=89)["data"] + _hits([2], days_ago=3)["data"]
    net.answers = [{"data": old}, {"data": []}]
    asyncio.run(_search())
    # le temps passe : l'offre 1 sort de la fenêtre de 90 j
    for (ns, _k), v in net.store.items():
        if "stock" in ns:
            for o in v["offers"]:
                if o["sourceId"] == 1:
                    o["date"] = _day(95)
    again = asyncio.run(_search())
    assert _ids(again) == [2]
    assert 1 not in net.bodies[-1].get("job_id_not", [])  # elle n'est plus exclue : une redécouverte redevient payable


def test_fiche_sans_cle_no_op_strict(net: Net) -> None:
    assert asyncio.run(_search()) == {}
    assert net.bodies == [] and net.store == {}


def test_fiche_panne_au_rejeu_rend_le_stock_pas_moins(net: Net, monkeypatch) -> None:
    monkeypatch.setenv(KEY_ENV, "cle-de-test")
    net.answers = [_hits(range(1, 4)), None]
    asyncio.run(_search())
    assert _ids(asyncio.run(_search())) == [1, 2, 3]


# ── Découvrir par compétence ───────────────────────────────────────────────────────────────────────────────────


def _expire_cache(net: Net) -> None:
    for k in [k for k in net.store if k[0] == skill._PAID_NAMESPACE]:
        del net.store[k]


def test_decouvrir_rejeu_apres_ttl_envoie_discovered_at_gte_et_garde_la_fenetre(net: Net, monkeypatch) -> None:
    monkeypatch.setenv(KEY_ENV, "cle-de-test")
    net.answers = [_hits(range(1, 6)), {"data": []}]
    first = asyncio.run(skill.paid_skill_offers("theirstack", "Vue.js", _harvest_obj(), ["59"], ()))
    assert "discovered_at_gte" not in net.bodies[0] and "job_id_not" not in net.bodies[0]
    stock = next(v for (ns, _k), v in net.store.items() if "stock" in ns)
    _expire_cache(net)
    second = asyncio.run(skill.paid_skill_offers("theirstack", "Vue.js", _harvest_obj(), ["59"], ()))
    body = net.bodies[-1]
    assert body["discovered_at_gte"] == stock["calledAt"]
    assert body["posted_at_max_age_days"] == 90
    assert sorted(body["job_id_not"]) == [1, 2, 3, 4, 5]
    assert first is not None and second is not None and len(second) >= len(first) == 5


def test_decouvrir_adaptateur_fusionne_stock_et_neuves(net: Net, monkeypatch) -> None:
    monkeypatch.setenv(KEY_ENV, "cle-de-test")
    net.answers = [_hits(range(1, 4)), _hits([7])]
    first = asyncio.run(skill.paid_skill_offers("theirstack", "Vue.js", _harvest_obj(), ["59"], ()))
    _expire_cache(net)
    second = asyncio.run(skill.paid_skill_offers("theirstack", "Vue.js", _harvest_obj(), ["59"], ()))
    assert first is not None and second is not None
    assert len(first) == 3 and len(second) == 4  # stock (3) + neuve (1)
    assert sorted(o["sourceId"] for o in second) == [1, 2, 3, 7]


def test_decouvrir_offre_hors_fenetre_ne_ressort_pas(net: Net, monkeypatch) -> None:
    monkeypatch.setenv(KEY_ENV, "cle-de-test")
    net.answers = [_hits([1], days_ago=89), {"data": []}]
    asyncio.run(skill.paid_skill_offers("theirstack", "Vue.js", _harvest_obj(), ["59"], ()))
    for (ns, _k), v in net.store.items():
        if "stock" in ns:
            v["offers"][0]["date"] = _day(120)
    _expire_cache(net)
    second = asyncio.run(skill.paid_skill_offers("theirstack", "Vue.js", _harvest_obj(), ["59"], ()))
    assert second == []


def test_decouvrir_sans_cle_no_op_strict(net: Net) -> None:
    out = asyncio.run(skill.paid_skill_offers("theirstack", "Vue.js", _harvest_obj(), ["59"], ()))
    assert out is None and net.bodies == [] and net.store == {}


def _harvest_obj() -> skill.SkillHarvest:
    return skill.SkillHarvest()
