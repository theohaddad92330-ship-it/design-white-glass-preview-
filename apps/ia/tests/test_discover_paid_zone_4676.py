"""#4676 (L4) — les sources payantes reçoivent la zone et les écritures déclinées, et paginent.

Décision Louis 25/10/2026 : la pertinence passe avant le coût ; on borne par le cache 30 j et un plafond NOMMÉ.
Déterministe, SANS réseau : ``job_aggregators._request`` est une doublure qui rejoue l'appel HTTP sur un faux client
pour lire l'URL / les paramètres / le corps réellement envoyés.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.services import adzuna_budget, provider_cache
from app.services import discover_skill_offers as skill
from app.services.data_sources import job_aggregators

RECENT = (datetime.now(UTC).date() - timedelta(days=5)).isoformat()
KEYS = {"theirstack": "THEIRSTACK_API_KEY", "mantiks": "MANTIKS_API_KEY", "fantastic_jobs": "FANTASTIC_JOBS_API_KEY"}
PAID = tuple(KEYS)


class _Http:
    def __init__(self, sink: dict) -> None:
        self.sink = sink

    async def post(self, url: str, json: Any = None, headers: Any = None, **_: Any) -> None:
        self.sink.update(url=url, body=json)

    async def get(self, url: str, params: Any = None, headers: Any = None, **_: Any) -> None:
        self.sink.update(url=url, params=params)


class Net:
    def __init__(self) -> None:
        self.sent: list[tuple[str, dict]] = []
        self.answers: dict[str, list[Any]] = {}

    def answer(self, provider: str) -> Any:
        queue = self.answers.get(provider) or [None]
        return queue.pop(0) if len(queue) > 1 else queue[0]

    def of(self, provider: str) -> list[dict]:
        return [seen for name, seen in self.sent if name == provider]


def _theirstack(n: int, employer: str = "ACME WEB") -> dict:
    return {
        "data": [
            {"job_title": "Dev Vue.js", "company": f"{employer} {i}", "location": "Lille", "date_posted": RECENT, "url": f"https://x/{i}"}
            for i in range(n)
        ]
    }


@pytest.fixture
def net(monkeypatch) -> Net:
    state = Net()
    for env in [*KEYS.values(), "ADZUNA_APP_ID", "ADZUNA_APP_KEY"]:
        monkeypatch.delenv(env, raising=False)

    async def request(provider, company, client, send, gate, *, headers_out=None):
        seen: dict = {}
        await send(_Http(seen))
        if (seen.get("body") or {}).get("include_total_results"):
            return {}  # #4725 — ces tests lisent la pagination d'avant : un compte illisible la laisse intacte
        state.sent.append((provider, seen))
        return state.answer(provider)

    monkeypatch.setattr(job_aggregators, "_request", request)
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


def _harvest(term: str = "Vue.js", zone: tuple[str, ...] = ("59",)) -> skill.SkillHarvest:
    return asyncio.run(skill.harvest_skill_offers([term], list(zone), {}, deadline=None))


# ── 1. le lieu voyage dans la requête ──────────────────────────────────────────────────────────────────────


def test_theirstack_zone_posee_le_lieu_part(net: Net, monkeypatch) -> None:
    monkeypatch.setenv(KEYS["theirstack"], "cle-de-test")
    net.answers["theirstack"] = [_theirstack(1)]
    asyncio.run(job_aggregators.theirstack_skill_offers("Vue.js", zone=["59"]))
    body = net.of("theirstack")[0]["body"]
    assert body["job_location_pattern_or"] == ["Hauts-de-France"]


def test_theirstack_sans_zone_aucun_lieu(net: Net, monkeypatch) -> None:
    monkeypatch.setenv(KEYS["theirstack"], "cle-de-test")
    net.answers["theirstack"] = [_theirstack(1)]
    asyncio.run(job_aggregators.theirstack_skill_offers("Vue.js"))
    assert "job_location_pattern_or" not in net.of("theirstack")[0]["body"]


def test_theirstack_departement_inconnu_ne_devine_rien(net: Net, monkeypatch) -> None:
    monkeypatch.setenv(KEYS["theirstack"], "cle-de-test")
    net.answers["theirstack"] = [_theirstack(1)]
    asyncio.run(job_aggregators.theirstack_skill_offers("Vue.js", zone=["59", "ZZ"]))
    assert "job_location_pattern_or" not in net.of("theirstack")[0]["body"]


def test_adzuna_zone_posee_where_part_sans_zone_non(net: Net, monkeypatch) -> None:
    monkeypatch.setenv("ADZUNA_APP_ID", "id-de-test")
    monkeypatch.setenv("ADZUNA_APP_KEY", "cle-de-test")
    net.answers["adzuna"] = [{"results": []}]
    asyncio.run(job_aggregators.adzuna_skill_offers("Vue.js", max_pages=1, max_age_days=90, where="Nord"))
    asyncio.run(job_aggregators.adzuna_skill_offers("Vue.js", max_pages=1, max_age_days=90))
    with_zone, without = net.of("adzuna")
    assert with_zone["params"]["where"] == "Nord"
    assert "where" not in without["params"]


def test_adzuna_la_moisson_envoie_un_departement_par_appel(net: Net, monkeypatch) -> None:
    monkeypatch.setenv("ADZUNA_APP_ID", "id-de-test")
    monkeypatch.setenv("ADZUNA_APP_KEY", "cle-de-test")
    net.answers["adzuna"] = [{"results": []}]
    _harvest(zone=("59", "62"))
    assert {seen["params"].get("where") for seen in net.of("adzuna")} == {"Nord", "Pas-de-Calais"}


def test_adzuna_zone_trop_large_recherche_nationale(net: Net, monkeypatch) -> None:
    monkeypatch.setenv("ADZUNA_APP_ID", "id-de-test")
    monkeypatch.setenv("ADZUNA_APP_KEY", "cle-de-test")
    net.answers["adzuna"] = [{"results": []}]
    wide = tuple(f"{n:02d}" for n in range(1, skill.SKILL_ADZUNA_MAX_DEPARTMENTS + 2))
    _harvest(zone=wide)
    assert net.of("adzuna") and all("where" not in seen["params"] for seen in net.of("adzuna"))


# ── 2. les écritures déclinées partent aux payantes, lues dans ``searched_forms`` ───────────────────────────


def test_ecritures_declinees_partent_a_theirstack_et_mantiks(net: Net, monkeypatch) -> None:
    for provider in ("theirstack", "mantiks"):
        monkeypatch.setenv(KEYS[provider], "cle-de-test")
    net.answers["theirstack"] = [_theirstack(1)]
    net.answers["mantiks"] = [{"data": []}]
    _harvest()
    _typed, written = skill.searched_forms("Vue.js")
    assert written, "le référentiel doit décliner « Vue.js » (sinon ce test ne prouve rien)"
    titles = net.of("theirstack")[0]["body"]["job_title_or"]
    assert titles[0] == "Vue.js" and set(written) <= set(titles)
    include = net.of("mantiks")[0]["body"]["job"]["job_title_include"]
    assert include[0] == "Vue.js" and set(written) <= set(include)


def test_une_seule_liste_de_formes(monkeypatch, net: Net) -> None:
    """Une forme que ``searched_forms`` n'a pas calculée ne part pas : pas de seconde liste de synonymes (GA-26)."""
    monkeypatch.setenv(KEYS["theirstack"], "cle-de-test")
    net.answers["theirstack"] = [_theirstack(1)]
    monkeypatch.setattr(skill, "searched_forms", lambda term: ([term], ["forme-unique-4676"]))
    _harvest()
    assert net.of("theirstack")[0]["body"]["job_title_or"] == ["Vue.js", "forme-unique-4676"]


# ── 3. page de 100, pagination bornée par le plafond ────────────────────────────────────────────────────────


def test_theirstack_page_de_100_et_numero_de_page(net: Net, monkeypatch) -> None:
    monkeypatch.setenv(KEYS["theirstack"], "cle-de-test")
    net.answers["theirstack"] = [_theirstack(1)]
    asyncio.run(job_aggregators.theirstack_skill_offers("Vue.js", page=1))
    body = net.of("theirstack")[0]["body"]
    assert body["limit"] == 100 and body["page"] == 1


def test_page_pleine_appelle_la_suivante_page_incomplete_s_arrete(net: Net, monkeypatch) -> None:
    monkeypatch.setenv(KEYS["theirstack"], "cle-de-test")
    net.answers["theirstack"] = [_theirstack(100, "PLEINE"), _theirstack(3, "FIN")]
    harvest = _harvest()
    assert [s["body"]["page"] for s in net.of("theirstack")] == [0, 1]
    assert harvest.by_source["theirstack"]["paid"] == 2 and harvest.calls["theirstack"] == 2
    net.sent.clear()
    net.answers["theirstack"] = [_theirstack(3)]
    net.store.clear()  # type: ignore[attr-defined]
    _harvest()
    assert [s["body"]["page"] for s in net.of("theirstack")] == [0]


def test_plafond_nomme_dix_huit_et_cite_la_decision() -> None:
    assert skill.SKILL_PAID_CALLS_MAX == 18
    source = open(skill.__file__, encoding="utf-8").read()
    assert "#4676" in source and "25/10" in source


def test_plafond_atteint_en_pagination_page_suivante_non_tentee(net: Net, monkeypatch) -> None:
    monkeypatch.setenv(KEYS["theirstack"], "cle-de-test")
    monkeypatch.setattr(skill, "SKILL_PAID_CALLS_MAX", 1)
    net.answers["theirstack"] = [_theirstack(100)]
    harvest = _harvest()
    assert [s["body"]["page"] for s in net.of("theirstack")] == [0]
    assert harvest.by_source["theirstack"]["paid"] == 1 and harvest.by_source["theirstack"]["notAttempted"] == 1
    assert not net.store, "une lecture tronquée par le plafond ne se range pas 30 jours"  # type: ignore[attr-defined]


def test_cache_30_jours_ne_consomme_pas_le_plafond(net: Net, monkeypatch) -> None:
    monkeypatch.setenv(KEYS["theirstack"], "cle-de-test")
    net.answers["theirstack"] = [_theirstack(2)]
    _harvest()
    monkeypatch.setattr(skill, "SKILL_PAID_CALLS_MAX", 1)
    second = _harvest()
    assert len(net.of("theirstack")) == 1
    assert second.by_source["theirstack"]["cached"] == 1 and second.by_source["theirstack"]["notAttempted"] == 0


# ── 6. la clé de cache porte le lieu ────────────────────────────────────────────────────────────────────────


def test_cle_de_cache_change_avec_le_lieu(net: Net, monkeypatch) -> None:
    monkeypatch.setenv(KEYS["theirstack"], "cle-de-test")
    net.answers["theirstack"] = [_theirstack(2)]
    _harvest(zone=("59",))
    _harvest(zone=("13",))  # Provence-Alpes-Côte d'Azur : une autre région ne ressert PAS la réponse de Lille
    assert [s["body"]["job_location_pattern_or"] for s in net.of("theirstack")] == [["Hauts-de-France"], ["Provence-Alpes-Côte d'Azur"]]
    keys = {key for (_ns, key) in net.store}  # type: ignore[attr-defined]
    assert len(keys) == 2


def test_meme_region_meme_cle(net: Net, monkeypatch) -> None:
    monkeypatch.setenv(KEYS["theirstack"], "cle-de-test")
    net.answers["theirstack"] = [_theirstack(2)]
    _harvest(zone=("59",))
    _harvest(zone=("59", "62"))
    assert len(net.of("theirstack")) == 1


# ── sans clé : no-op strict ─────────────────────────────────────────────────────────────────────────────────


def test_sans_cle_zero_appel_reseau(net: Net) -> None:
    _harvest(zone=("59", "62"))
    assert net.sent == []
    assert asyncio.run(job_aggregators.theirstack_skill_offers("Vue.js", zone=["59"], forms=["vuejs"])) == []
    assert asyncio.run(job_aggregators.mantiks_skill_offers("Vue.js", forms=["vuejs"])) == []
    assert asyncio.run(job_aggregators.adzuna_skill_offers("Vue.js", max_pages=1, max_age_days=90, where="Nord")) == []
    assert net.sent == []
