"""#4045.4 (14/10) — doctrine Louis 12/10 : « la donnée accumulée est un
intrant du traitement PARTOUT ». Constat prod (429335a9c8) : France Travail
en 429 fait perdre la carte de recrutement ENTIÈRE, alors que le cache
partagé (``public_facts``, famille ``jobs``) tient déjà des offres collectées
pour ce même SIREN par une recherche précédente — ``source_cache`` les
ARCHIVE au lieu de les supprimer (``_PURGE_SQL`` exempte ``public_facts``),
seule la lecture normale (``get()``) les filtre à l'expiration.

``cached_fact(..., stale_fallback_s=...)`` lit cette ligne PÉRIMÉE, dans une
fenêtre de repli plus large que la fraîcheur normale, SEULEMENT quand la
source s'est déclarée en erreur (jamais pour un « rien trouvé » confirmé, qui
reste un fait) — et jamais rien d'inventé quand aucune ligne n'existe dans
cette fenêtre."""

from __future__ import annotations

import pytest

from app.services import provider_cache, public_facts, source_cache, source_health

_DAY = 24 * 3600
STALE_ROWS = [{"title": "Développeur backend", "date": "2026-09-20", "contractType": "CDI"}]


async def _failing_fetch() -> list[dict]:
    """Une source qui s'est déclarée en ERREUR (429) pendant la collecte."""
    source_health.note_fetch_error("Client error '429 Too Many Requests'")
    return []


async def _confirmed_empty_fetch() -> list[dict]:
    """Une source qui a RÉELLEMENT répondu « rien » — pas d'erreur notée."""
    return []


@pytest.mark.asyncio
async def test_stale_jobs_are_served_when_the_live_source_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _no_fresh_cache(namespace: str, key: str):
        return None

    async def _fake_single_flight(namespace: str, key: str, fetch):
        return await fetch(), True

    async def _fake_stale(namespace: str, key: str, max_age_s: int):
        assert namespace == "facts:jobs"
        assert max_age_s == 30 * _DAY
        return {"collectedAt": "2026-09-20T08:00:00+00:00", "rows": STALE_ROWS}

    monkeypatch.setattr(provider_cache, "get_json", _no_fresh_cache)
    monkeypatch.setattr(source_cache, "single_flight", _fake_single_flight)
    monkeypatch.setattr(provider_cache, "get_json_stale", _fake_stale)
    set_calls: list[tuple] = []

    async def _fake_set_json(*a: object, **k: object) -> None:
        set_calls.append((a, k))

    monkeypatch.setattr(provider_cache, "set_json", _fake_set_json)

    rows = await public_facts.cached_fact(
        "jobs", "siren:552100554", "ft:esn_it:it", _failing_fetch, stale_fallback_s=30 * _DAY
    )

    assert rows == STALE_ROWS
    # Une ligne PÉRIMÉE servie en repli ne doit jamais être re-rangée comme fraîche.
    assert set_calls == []


@pytest.mark.asyncio
async def test_no_stale_fallback_without_a_window_stays_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    """Sans ``stale_fallback_s`` (tous les autres appelants de ``cached_fact``,
    inchangés), une erreur reste un vide NON rangé — jamais de repli surprise."""

    async def _no_fresh_cache(namespace: str, key: str):
        return None

    async def _fake_single_flight(namespace: str, key: str, fetch):
        return await fetch(), True

    async def _unexpected_stale_call(*_a: object, **_kw: object):
        raise AssertionError("get_json_stale ne doit JAMAIS être appelé sans stale_fallback_s")

    monkeypatch.setattr(provider_cache, "get_json", _no_fresh_cache)
    monkeypatch.setattr(source_cache, "single_flight", _fake_single_flight)
    monkeypatch.setattr(provider_cache, "get_json_stale", _unexpected_stale_call)

    rows = await public_facts.cached_fact("jobs", "siren:552100554", "ft:esn_it:it", _failing_fetch)

    assert rows == []


@pytest.mark.asyncio
async def test_no_accumulated_data_in_window_stays_empty_not_invented(monkeypatch: pytest.MonkeyPatch) -> None:
    """Aucune base accumulée pour ce SIREN dans la fenêtre : le vide d'avant,
    jamais une ligne inventée."""

    async def _no_fresh_cache(namespace: str, key: str):
        return None

    async def _fake_single_flight(namespace: str, key: str, fetch):
        return await fetch(), True

    async def _nothing_stale(namespace: str, key: str, max_age_s: int):
        return None

    monkeypatch.setattr(provider_cache, "get_json", _no_fresh_cache)
    monkeypatch.setattr(source_cache, "single_flight", _fake_single_flight)
    monkeypatch.setattr(provider_cache, "get_json_stale", _nothing_stale)

    rows = await public_facts.cached_fact(
        "jobs", "siren:552100554", "ft:esn_it:it", _failing_fetch, stale_fallback_s=30 * _DAY
    )

    assert rows == []


@pytest.mark.asyncio
async def test_confirmed_empty_result_never_triggers_the_stale_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    """« Cette entreprise ne recrute pas » (confirmé, sans erreur) reste un
    fait — jamais remplacé par une vieille offre périmée."""

    async def _no_fresh_cache(namespace: str, key: str):
        return None

    async def _fake_single_flight(namespace: str, key: str, fetch):
        return await fetch(), True

    async def _unexpected_stale_call(*_a: object, **_kw: object):
        raise AssertionError("un résultat vide CONFIRMÉ ne doit jamais lire le repli périmé")

    set_calls: list[tuple] = []

    async def _fake_set_json(*a: object, **k: object) -> None:
        set_calls.append((a, k))

    monkeypatch.setattr(provider_cache, "get_json", _no_fresh_cache)
    monkeypatch.setattr(source_cache, "single_flight", _fake_single_flight)
    monkeypatch.setattr(provider_cache, "get_json_stale", _unexpected_stale_call)
    monkeypatch.setattr(provider_cache, "set_json", _fake_set_json)

    rows = await public_facts.cached_fact(
        "jobs", "siren:552100554", "ft:esn_it:it", _confirmed_empty_fetch, stale_fallback_s=30 * _DAY
    )

    assert rows == []
    assert len(set_calls) == 1  # le vide confirmé se range normalement (TTL_EMPTY_JOBS)
