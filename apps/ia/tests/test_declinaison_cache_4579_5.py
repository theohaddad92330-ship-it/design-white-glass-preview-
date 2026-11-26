"""#4579.5 — le coût reste tenu : la déclinaison d'une compétence ne coûte AUCUN appel payant, et une requête
identique relue ensuite est servie par le cache (zéro appel, payant ou non).

Mesure du gain (« à MESURER en prod », rapport #4579) : les compteurs ``paid_total`` / ``calls`` d'une récolte sont
la mesure — deuxième passage = 0 appel payant, 0 lecture France Travail.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.services import discover_skill_offers as skill


class _MemoryCache:
    """Un cache en mémoire à la place de Redis : ce que le premier passage range, le second le relit."""

    def __init__(self) -> None:
        self.store: dict[tuple[str, str], Any] = {}

    async def get_json(self, namespace: str, key: str) -> Any | None:
        return self.store.get((namespace, key))

    async def set_json(self, namespace: str, key: str, value: Any, ttl: int | None = None) -> None:
        self.store[(namespace, key)] = value


@pytest.fixture
def memory(monkeypatch: pytest.MonkeyPatch) -> _MemoryCache:
    cache = _MemoryCache()
    monkeypatch.setattr(skill.provider_cache, "get_json", cache.get_json)
    monkeypatch.setattr(skill.provider_cache, "set_json", cache.set_json)
    return cache


async def test_les_declinaisons_ne_coutent_aucun_appel_paye_et_le_second_passage_est_servi_par_le_cache(
    memory: _MemoryCache, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services.data_sources import job_aggregators

    monkeypatch.setenv("THEIRSTACK_API_KEY", "test-key")
    monkeypatch.delenv("MANTIKS_API_KEY", raising=False)
    monkeypatch.delenv("FANTASTIC_JOBS_API_KEY", raising=False)
    paid_calls: list[str] = []

    async def theirstack(term: str, **_: Any) -> list[dict]:
        paid_calls.append(term)
        return [{"company": "ACME", "title": f"Dév {term}", "url": f"https://o/{term}"}]

    monkeypatch.setattr(job_aggregators, "theirstack_skill_offers", theirstack)
    ft_reads: list[str] = []

    async def ft_read(term: str, department: str | None, profile: Any, page: int, **_kw: Any) -> list[dict]:
        ft_reads.append(term)
        return []

    monkeypatch.setattr(skill, "_france_travail_read", ft_read)

    # Premier passage : la saisie « vue » part sous ses quatre écritures (gratuit), UN seul appel PAYÉ — #4676 : les écritures
    # voyagent DANS cet appel (liste de titres), jamais en appels de plus.
    first = skill.SkillHarvest(calls={})
    await skill.paid_skill_offers("theirstack", "vue", first)
    for written in ("vue", "vue.js", "vuejs", "vue 3"):
        await skill.france_travail_offers(written, "59", {})
    assert paid_calls == ["vue"]  # aucune déclinaison n'est payée
    assert first.paid_total == 1
    assert len(ft_reads) == 4

    # Second passage, requête identique : zéro appel payant, zéro lecture France Travail, cache chaud.
    second = skill.SkillHarvest(calls={})
    await skill.paid_skill_offers("theirstack", "vue", second)
    for written in ("vue", "vue.js", "vuejs", "vue 3"):
        await skill.france_travail_offers(written, "59", {})
    assert paid_calls == ["vue"]  # pas un appel de plus
    assert second.paid_total == 0
    assert second.by_source["theirstack"]["cached"] == 1
    assert len(ft_reads) == 4  # les quatre lectures ont été relues du cache


async def test_une_recolte_complete_relue_ne_touche_aucune_source(
    memory: _MemoryCache, monkeypatch: pytest.MonkeyPatch
) -> None:
    """La récolte entière (toutes compétences, toutes écritures) est gardée : le même appel ne relit rien."""
    reads = AsyncMock(return_value=[])
    monkeypatch.setattr(skill, "_france_travail_read", reads)
    monkeypatch.setattr(skill, "adzuna_offers", AsyncMock(return_value=[]))
    monkeypatch.setattr(skill, "cached_offers", AsyncMock(return_value=[]))
    await skill.harvest_skill_offers(["vue", "java"], ["59"], {}, deadline=None)
    after_first = reads.await_count
    assert after_first >= 8  # deux compétences × quatre écritures
    again = await skill.harvest_skill_offers(["vue", "java"], ["59"], {}, deadline=None)
    assert again.from_cache is True
    assert reads.await_count == after_first
    assert again.paid_total == 0
