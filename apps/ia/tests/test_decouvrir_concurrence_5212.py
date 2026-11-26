"""Lot 790 (#5212) — deux recherches par compétence se disputent le registre : l'une finissait à 0 candidat.

B : budget épuisé par la moisson → les employeurs DÉJÀ résolus (cache partagé) sont rendus, pas « non tentés ».
C : la passe exacte résout dans l'ordre du rang et s'arrête à `limit` × 2 comptes confirmés ; le reste est DIT.
"""

from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock

from app.services import discover_skill_offers as skill
from tests.test_decouvrir_volume_4419 import _hdf_zone, _identity, _offer, frozen  # noqa: F401




def _seed(state, n: int) -> None:
    state.ft = {
        "59": [
            _offer(f"CLIENT {i:03d}", "Développeur Java", days_ago=1 + i % 60, dept="59", source="france_travail", termChecked=True)
            for i in range(n)
        ]
    }
    state.resolutions = {
        f"CLIENT {i:03d}": skill.EmployerResolution(_identity(f"{100000000 + i:09d}", f"CLIENT {i:03d}", "59"))
        for i in range(n)
    }


def test_employeurs_du_cache_partage_rendus_quand_la_moisson_a_mange_le_budget(frozen, monkeypatch) -> None:  # noqa: F811
    _seed(frozen, 10)
    cached = {
        skill.normalize_employer_name(f"CLIENT {i:03d}"): _identity(f"{100000000 + i:09d}", f"CLIENT {i:03d}", "59")
        for i in range(10)
    }
    monkeypatch.setattr(skill.provider_cache, "get_json", AsyncMock(side_effect=lambda ns, key: cached.get(key)))
    real = skill.harvest_skill_offers

    async def slow(*args, **kwargs):  # la requête sœur tient le registre : la moisson dépasse le budget
        out = await real(*args, **kwargs)
        await asyncio.sleep(0.25)
        return out

    monkeypatch.setattr(skill, "harvest_skill_offers", slow)
    resolved: list[str] = []
    real_resolve = skill.resolve_employer

    async def spy(name, *a, **k):
        resolved.append(name)
        return await real_resolve(name, *a, **k)

    monkeypatch.setattr(skill, "resolve_employer", spy)

    found = asyncio.run(skill.find_skill_accounts(["Java"], _hdf_zone(), {}, deadline=time.monotonic() + 0.1))

    assert found.info["accountsFound"] == 10
    assert found.info["notAttempted"] == 0
    assert resolved == []  # aucun appel registre : tout vient du cache partagé


def test_deux_recherches_concurrentes_rendent_toutes_deux_des_candidats(frozen, monkeypatch) -> None:  # noqa: F811
    _seed(frozen, 12)
    cached: dict[str, dict] = {}

    async def get(ns, key):
        return cached.get(key)

    async def put(ns, key, value, ttl):
        cached[key] = value

    monkeypatch.setattr(skill.provider_cache, "get_json", get)
    monkeypatch.setattr(skill.provider_cache, "set_json", put)
    real = skill.harvest_skill_offers

    async def slow(*args, **kwargs):
        out = await real(*args, **kwargs)
        await asyncio.sleep(0.25)
        return out

    monkeypatch.setattr(skill, "harvest_skill_offers", slow)
    # Une première recherche a déjà résolu ces employeurs dans le cache partagé.
    for i in range(12):
        cached[skill.normalize_employer_name(f"CLIENT {i:03d}")] = _identity(
            f"{100000000 + i:09d}", f"CLIENT {i:03d}", "59"
        )

    async def both():
        deadline = time.monotonic() + 0.1
        return await asyncio.gather(
            *(skill.find_skill_accounts(["Java"], _hdf_zone(), {}, deadline=deadline) for _ in range(2))
        )

    first, second = asyncio.run(both())
    assert first.info["accountsFound"] == 12
    assert second.info["accountsFound"] == 12


def test_passe_exacte_s_arrete_a_deux_fois_la_limite_et_dit_le_reste(frozen) -> None:  # noqa: F811
    _seed(frozen, 200)

    found = asyncio.run(skill.find_skill_accounts(["Java"], _hdf_zone(), {}, deadline=None, limit=25))

    assert found.info["accountsFound"] >= 25
    assert len(frozen.hints) <= 50 + skill._RESOLVE_CONCURRENCY  # au plus ~2×limit appels (+ ceux déjà en vol)
    # Le reste est compté « à vérifier », jamais « introuvable », et jamais présenté comme un délai coupé.
    assert found.info["notAttempted"] == 150 - found.info["accountsFound"]
    assert found.info["unresolvedEmployers"] == 0
    assert found.info["deadlineCut"] is False
    # Le classement ne change pas : les comptes rendus sont les mieux classés (offres les plus récentes d'abord).
    dates = [a["skillEvidence"]["latestOffer"]["date"] for a in found.accounts]
    assert dates == sorted(dates, reverse=True)


def test_sans_limite_le_comportement_reste_celui_d_avant(frozen) -> None:  # noqa: F811
    _seed(frozen, 160)
    found = asyncio.run(skill.find_skill_accounts(["Java"], _hdf_zone(), {}, deadline=None))
    assert found.info["accountsFound"] == 150
