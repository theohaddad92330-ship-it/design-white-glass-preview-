"""#5009.1 — « N offres lues sur M trouvées » : le total que chaque source PUBLIE déjà dans la réponse reçue est capté.

France Travail : ``Content-Range: offres 0-149/412`` · Adzuna : ``count`` du JSON · TheirStack : compte à 1 crédit (déjà là).
Mantiks, Fantastic.jobs, base commune : aucun total publié ⇒ la source reste sans total, et « toutes sinon rien » tient.
Déterministe, sans réseau."""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from app.services import discover_skill_offers as skill
from app.services.data_sources import france_travail as ft
from app.services.data_sources import job_aggregators


class _Resp:
    def __init__(self, payload: object, status_code: int = 200, headers: dict[str, str] | None = None) -> None:
        self._payload, self.status_code, self.headers = payload, status_code, httpx.Headers(headers or {})
        self.content = b"{}"

    def json(self) -> object:
        return self._payload

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class _Client:
    def __init__(self, search: _Resp) -> None:
        self._search = search

    async def post(self, url: str, **_k: Any) -> _Resp:
        return _Resp({"access_token": "tok", "expires_in": 1500})

    async def get(self, url: str, **_k: Any) -> _Resp:
        return self._search


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "secret")


@pytest.mark.parametrize(
    ("header", "expected"),
    [("offres 0-149/412", 412), ("offres 0-14/49", 49), ("offres */0", 0), ("offres 0-14/*", None), ("", None), (None, None)],
)
def test_content_range_total(header: str | None, expected: int | None) -> None:
    assert ft.content_range_total(header) == expected


@pytest.mark.asyncio
async def test_france_travail_capte_le_total_du_content_range() -> None:
    stats: dict[str, int] = {}
    client = _Client(_Resp({"resultats": []}, 206, {"Content-Range": "offres 0-149/412"}))
    await ft.list_hiring_companies(department="75", client=client, page_stats=stats)
    assert stats["total"] == 412


@pytest.mark.asyncio
async def test_france_travail_sans_en_tete_pas_de_total() -> None:
    stats: dict[str, int] = {}
    await ft.list_hiring_companies(department="75", client=_Client(_Resp({"resultats": []})), page_stats=stats)
    assert "total" not in stats


@pytest.mark.asyncio
async def test_adzuna_capte_le_count_de_la_premiere_reponse(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ADZUNA_APP_ID", "a")
    monkeypatch.setenv("ADZUNA_APP_KEY", "b")

    async def _request(*_a: Any, **_k: Any) -> object:
        return {"count": 412, "results": []}

    monkeypatch.setattr(job_aggregators, "_request", _request)
    meta: dict[str, int] = {}
    await job_aggregators.adzuna_skill_offers("java", max_pages=1, max_age_days=90, meta=meta)
    assert meta == {"total": 412}

    async def _no_count(*_a: Any, **_k: Any) -> object:
        return {"results": []}

    monkeypatch.setattr(job_aggregators, "_request", _no_count)
    meta = {}
    await job_aggregators.adzuna_skill_offers("java", max_pages=1, max_age_days=90, meta=meta)
    assert meta == {}


# ── la moisson : « toutes les sources lues, sinon rien » ─────────────────────────────────────────────


def _row(i: int) -> dict:
    return {
        "name": f"ACME {i}", "department": "75", "city": "Paris", "contractCode": "CDI",
        "signal": {"label": f"Recrutement — Développeur Java {i}", "date": "2026-11-01", "url": f"https://o/{i}"},
    }


@pytest.fixture
def harvest_net(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    state: dict[str, Any] = {"ft_total": 412, "adzuna_total": 100}
    store: dict[tuple[str, str], Any] = {}

    async def get_json(ns: str, key: str) -> Any:
        return store.get((ns, key))

    async def set_json(ns: str, key: str, value: Any, _ttl: Any) -> None:
        store[(ns, key)] = value

    async def list_hiring(*_a: Any, page_stats: dict | None = None, **_k: Any) -> list[dict]:
        if page_stats is not None and state["ft_total"] is not None:
            page_stats["total"] = state["ft_total"]
        return [_row(i) for i in range(3)]

    async def adzuna_skill_offers(term: str, *, meta: dict | None = None, **_k: Any) -> list[dict]:
        if meta is not None and state["adzuna_total"] is not None:
            meta["total"] = state["adzuna_total"]
        return [
            {"title": f"Dev Java {i}", "company": f"BETA {i}", "city": "Paris", "date": "2026-11-01", "url": f"https://a/{i}",
             "source": "adzuna"}
            for i in range(2)
        ]

    async def no_cache(*_a: Any, **_k: Any) -> list[dict]:
        return []

    monkeypatch.setattr(skill.provider_cache, "get_json", get_json)
    monkeypatch.setattr(skill.provider_cache, "set_json", set_json)
    monkeypatch.setattr(ft, "list_hiring_companies", list_hiring)
    monkeypatch.setattr(job_aggregators, "adzuna_skill_offers", adzuna_skill_offers)
    monkeypatch.setattr(job_aggregators, "adzuna_configured", lambda: True)
    monkeypatch.setattr(skill.adzuna_budget, "discover_allowed", lambda: _true())
    monkeypatch.setattr(skill, "cached_offers", no_cache)
    monkeypatch.setattr(skill, "searched_forms", lambda term: ([term], []))
    monkeypatch.setattr(skill, "harvest_terms", lambda skills: list(skills))
    for env in ("THEIRSTACK_API_KEY", "MANTIKS_API_KEY", "FANTASTIC_JOBS_API_KEY"):
        monkeypatch.delenv(env, raising=False)
    return state


async def _true() -> bool:
    return True


@pytest.mark.asyncio
async def test_total_somme_des_sources_lues_quand_chacune_en_donne_un(harvest_net: dict[str, Any]) -> None:
    harvest = await skill.harvest_skill_offers(["java"], ["75"], {}, deadline=None)
    assert harvest.totals == {"france_travail": 412, "adzuna": 100}
    assert skill.offers_total(harvest) == (512, False)  # complet : chaque source lue a rendu son total


@pytest.mark.asyncio
async def test_une_source_lue_sans_total_ne_donne_aucun_total(harvest_net: dict[str, Any]) -> None:
    harvest_net["adzuna_total"] = None
    harvest = await skill.harvest_skill_offers(["java"], ["75"], {}, deadline=None)
    assert harvest.totals == {"france_travail": 412}
    # DÉCISION LOUIS 03/11 : une source publie un total ⇒ borne basse = 412 + les offres lues d'Adzuna (sans total).
    total, _ = skill.offers_total(harvest) or (None, None)
    assert skill.offers_total(harvest) == (412 + harvest.received["adzuna"], True)
    assert total is not None and total >= sum(harvest.received.values())


@pytest.mark.asyncio
async def test_un_total_incoherent_avec_les_offres_lues_n_est_pas_rendu(harvest_net: dict[str, Any]) -> None:
    harvest_net["ft_total"], harvest_net["adzuna_total"] = 1, 1  # 5 lues > 2 « trouvées »
    harvest = await skill.harvest_skill_offers(["java"], ["75"], {}, deadline=None)
    assert skill.offers_total(harvest) is None  # aucun total cohérent : « N offres lues » seul, jamais « sur 0 »


def test_total_incoherent_d_une_source_compte_comme_sans_total() -> None:
    harvest = skill.SkillHarvest()
    harvest.received = {"france_travail": 5, "adzuna": 3}
    harvest.totals = {"france_travail": 100, "adzuna": 1}  # Adzuna : 3 lues > 1 « trouvée » ⇒ ignoré, ses 3 lues comptent
    assert skill.offers_total(harvest) == (103, True)


def test_aucune_source_lue_avec_total_ne_donne_rien() -> None:
    harvest = skill.SkillHarvest()
    harvest.received = {"mantiks": 4, "cache": 2}
    harvest.no_total = {"mantiks", "cache"}
    assert skill.offers_total(harvest) is None


@pytest.mark.asyncio
async def test_le_total_survit_a_la_moisson_servie_par_le_cache(harvest_net: dict[str, Any]) -> None:
    await skill.harvest_skill_offers(["java"], ["75"], {}, deadline=None)
    again = await skill.harvest_skill_offers(["java"], ["75"], {}, deadline=None)
    assert again.from_cache and skill.offers_total(again) == (512, False)
