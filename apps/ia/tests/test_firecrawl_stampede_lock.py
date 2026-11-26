"""GA-321 — lot 16, câble 1 : firecrawl.py appelait ``scrape_cache.get_markdown``
/ ``set_markdown`` SÉPARÉMENT, jamais le combinateur ``cached_markdown`` (verrou
anti-ruée single-flight, GA-301) que ``scrape_cache.py`` expose pourtant déjà.
Sans le verrou, N scrapes concurrents sur la même URL FROIDE partaient TOUS
chez Firecrawl — et chaque page scrapée est FACTURÉE (~0,01 €/page).

Trois preuves exigées par CLAUDE.md pour toute garde d'architecture :

1. **LIT un corpus réel** : les tests ci-dessous exercent ``_scrape_one`` — le
   vrai chemin de production de ``firecrawl.py`` — pas ``cached_markdown``
   isolé (déjà gardé par GA-301 dans ``test_cache_stampede_lock.py``). C'est
   le CÂBLAGE qui manquait, pas le verrou lui-même.
2. **SAIT DIRE NON** : ``test_GA_321_without_the_lock_the_naive_pattern_fans_out``
   rejoue le patron D'AVANT ce lot (get_markdown → appel direct → set_markdown,
   sans passer par le combinateur) et prouve qu'il fan-out bien vers un appel
   par demande concurrente — la preuve que le test « N → 1 » détecte
   réellement l'absence du câblage, pas un artefact du mock.
3. **N'attrape pas ce qu'elle ne vise pas** : deux URLs différentes ne
   partagent jamais le verrou, un appel seul n'est jamais pénalisé, le
   classement scrape_status/error_code reste EXACT pour l'appelant qui a
   réellement fait l'appel réseau, et le verrou se RELÂCHE sur exception ET
   sur annulation (sinon une panne Firecrawl transitoire ou un appelant
   annulé gèlerait la clé pour toujours — une lenteur ne doit jamais devenir
   un blocage).
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from firecrawl.v2.utils.error_handler import PaymentRequiredError

from app.services import firecrawl, scrape_cache
from app.services.research.sources import SourceCategory


def _hit(url: str, *, category: SourceCategory = SourceCategory.OTHER) -> dict:
    return {"url": url, "title": "T", "category": category, "description": "d"}


def _make_client(side_effect):
    client = AsyncMock()
    client.scrape.side_effect = side_effect
    return client


@pytest.fixture(autouse=True)
def _no_redis(monkeypatch: pytest.MonkeyPatch):
    """Tier Redis hors-ligne : ces tests portent sur le COMPTE d'appels au
    fournisseur Firecrawl, pas sur la persistance des tiers. Le tier Postgres
    est déjà nul par défaut en test (conftest.py retire DATABASE_URL /
    SOURCE_CACHE_PG_URL)."""
    monkeypatch.setattr(scrape_cache, "_redis", AsyncMock(return_value=None))


# ── Preuve n°1 : LIT le vrai chemin de production (_scrape_one) ─────────────


async def test_GA_321_concurrent_cold_url_collapses_to_one_firecrawl_call() -> None:
    """10 appels concurrents de ``_scrape_one`` sur la MÊME URL froide (deux
    entreprises qui partagent un portail sectoriel, ou deux workers de la même
    analyse) doivent produire UN SEUL appel Firecrawl — pas 10."""

    async def slow_scrape(*args, **kwargs):
        await asyncio.sleep(0.02)
        return SimpleNamespace(markdown="# contenu")

    client = _make_client(slow_scrape)
    hit = _hit("https://x.fr/cold")

    results = await asyncio.gather(*[firecrawl._scrape_one(hit, client) for _ in range(10)])

    assert client.scrape.call_count == 1, (
        f"GA-321 : {client.scrape.call_count} appels Firecrawl pour 10 scrapes "
        "concurrents sur la même URL froide — attendu 1"
    )
    assert all(r["scrape_status"] == "ok" and r["markdown"] == "# contenu" for r in results)


async def test_GA_321_different_urls_each_scrape_independently() -> None:
    """Ne pas attraper ce qu'elle ne vise pas : deux URLs DIFFÉRENTES ne
    partagent jamais le verrou."""

    async def fast_scrape(*args, **kwargs):
        return SimpleNamespace(markdown=f"# {kwargs['url']}")

    client = _make_client(fast_scrape)
    a, b = await asyncio.gather(
        firecrawl._scrape_one(_hit("https://x.fr/a"), client),
        firecrawl._scrape_one(_hit("https://x.fr/b"), client),
    )
    assert client.scrape.call_count == 2
    assert a["markdown"] == "# https://x.fr/a"
    assert b["markdown"] == "# https://x.fr/b"


async def test_GA_321_a_solo_call_is_not_penalised() -> None:
    """Ne pas attraper ce qu'elle ne vise pas : un appel SEUL (pas de
    concurrence) ne déclenche jamais plus d'un fetch."""

    async def fast_scrape(*args, **kwargs):
        return SimpleNamespace(markdown="# ok")

    client = _make_client(fast_scrape)
    result = await firecrawl._scrape_one(_hit("https://x.fr/solo"), client)
    assert result["scrape_status"] == "ok"
    assert client.scrape.call_count == 1


# ── Preuve n°2 : SAIT DIRE NON — l'ancien patron fan-out vraiment ────────────


async def test_GA_321_without_the_lock_the_naive_pattern_fans_out() -> None:
    """Rejoue le patron D'AVANT ce lot : ``get_markdown()`` → appel direct →
    ``set_markdown()``, sans passer par le combinateur ``cached_markdown``
    (donc sans ``single_flight``). Prouve que le test « N concurrentes → 1
    appel » détecte bien l'absence du câblage, pas un artefact du mock : sans
    lui, 10 demandes concurrentes sur une URL froide produisent bien 10
    appels."""
    calls: list[int] = []

    async def naive_scrape_one(url: str) -> str:
        cached = await scrape_cache.get_markdown(url)
        if cached:
            return cached
        calls.append(1)
        await asyncio.sleep(0.01)
        markdown = "# contenu"
        await scrape_cache.set_markdown(url, markdown)
        return markdown

    await asyncio.gather(*[naive_scrape_one("https://x.fr/naive-cold") for _ in range(10)])
    assert len(calls) == 10, "le patron naïf devrait fan-out vers un appel par demande concurrente"


# ── Preuve n°3 : classement exact + le verrou se RELÂCHE ─────────────────────


async def test_GA_321_terminal_error_still_raises_FirecrawlScrapeError() -> None:
    """Un échec TERMINAL (crédits épuisés) doit toujours lever
    ``FirecrawlScrapeError`` — même routé à travers le combinateur single-flight,
    exactement comme le fetch séparé d'avant ce lot."""
    client = _make_client(PaymentRequiredError("no credits"))
    with pytest.raises(firecrawl.FirecrawlScrapeError) as excinfo:
        await firecrawl._scrape_one(_hit("https://x.fr/terminal"), client)
    assert excinfo.value.code == firecrawl.ERROR_CODE_INSUFFICIENT_CREDITS


async def test_GA_321_per_url_failure_status_is_preserved() -> None:
    """Un échec PER-URL (pas terminal) garde son classement exact
    (scrape_status="error", error_code du provider) — le combinateur ne doit
    pas dégrader la précision du diagnostic pour l'appelant qui a réellement
    fait l'appel réseau."""
    from firecrawl.v2.utils.error_handler import WebsiteNotSupportedError

    client = _make_client(WebsiteNotSupportedError("blocked"))
    result = await firecrawl._scrape_one(_hit("https://x.fr/blocked"), client)
    assert result["scrape_status"] == "error"
    assert result["error_code"] == firecrawl.ERROR_CODE_WEBSITE_BLOCKED


async def test_GA_321_empty_markdown_is_reported_as_empty() -> None:
    async def empty_scrape(*args, **kwargs):
        return SimpleNamespace(markdown="")

    client = _make_client(empty_scrape)
    result = await firecrawl._scrape_one(_hit("https://x.fr/empty"), client)
    assert result["scrape_status"] == "empty"


async def test_GA_321_lock_releases_on_fetch_exception() -> None:
    """Une erreur PER-URL (timeout) ne doit jamais bloquer un appel ultérieur
    sur la MÊME url — sinon une panne transitoire gèlerait la clé pour
    toujours."""
    attempts: list[int] = []

    async def flaky(*args, **kwargs):
        attempts.append(1)
        if len(attempts) == 1:
            raise TimeoutError()
        return SimpleNamespace(markdown="# ok")

    client = _make_client(flaky)
    hit = _hit("https://x.fr/flaky")

    first = await firecrawl._scrape_one(hit, client)
    assert first["scrape_status"] == "timeout"
    assert first["error_code"] == "TIMEOUT"

    second = await firecrawl._scrape_one(hit, client)
    assert second["scrape_status"] == "ok"
    assert len(attempts) == 2, "le verrou doit s'être relâché pour permettre un second essai"


async def test_GA_321_lock_releases_on_cancellation() -> None:
    """Annuler UN demandeur ne casse ni les autres demandeurs concurrents, ni
    un appel FUTUR sur la même URL — « une lenteur reste une lenteur, jamais
    un blocage »."""
    calls: list[int] = []
    started = asyncio.Event()

    async def slow(*args, **kwargs):
        calls.append(1)
        started.set()
        await asyncio.sleep(0.05)
        return SimpleNamespace(markdown="# ok")

    client = _make_client(slow)
    hit = _hit("https://x.fr/cancel-me")

    cancel_me = asyncio.create_task(firecrawl._scrape_one(hit, client))
    keep_me = asyncio.create_task(firecrawl._scrape_one(hit, client))

    await started.wait()
    cancel_me.cancel()
    with pytest.raises(asyncio.CancelledError):
        await cancel_me

    kept = await keep_me
    assert kept["scrape_status"] == "ok"
    assert len(calls) == 1, "un seul scrape réel malgré l'annulation d'un waiter"

    # Appel ULTÉRIEUR sur la même URL : pas de verrou fantôme laissé par
    # l'annulation.
    later = await firecrawl._scrape_one(hit, client)
    assert later["scrape_status"] == "ok"
    assert len(calls) == 2
