"""W11 (#4016) — coût par requête Firecrawl maîtrisé + crédits tracés.

Mesuré le 10/10 : 28 417 crédits /scrape en un jour, ~20 crédits/requête au lieu
de 1 (PDF facturés par page, proxy `auto` qui bascule en stealth).
"""
from __future__ import annotations

import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.middleware.correlation_id import get_correlation_id
from app.services import firecrawl as fc
from app.services.firecrawl import scrape_hits
from app.services.research.sources import SourceCategory


def _hit(url: str, category: SourceCategory = SourceCategory.OTHER) -> dict:
    return {"url": url, "title": "t", "category": category, "description": "d"}


def _client(credits: int | None = 1) -> AsyncMock:
    client = AsyncMock()
    client.scrape.return_value = SimpleNamespace(
        markdown="# page", metadata=SimpleNamespace(credits_used=credits)
    )
    return client


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("FIRECRAWL_API_KEY", "k")
    monkeypatch.delenv("FIRECRAWL_PROXY", raising=False)
    fc._run_credits.clear()
    monkeypatch.setattr(fc, "cached_markdown", lambda url, fetch: fetch())


async def _opts(url="https://a.fr/x", env=None, monkeypatch=None) -> dict:
    client = _client()
    await scrape_hits([_hit(url)], http_client=client)
    return client.scrape.call_args.kwargs


async def test_proxy_basic_par_defaut():
    assert (await _opts())["proxy"] == "basic"


@pytest.mark.parametrize("raw,expected", [("stealth", "stealth"), ("AUTO", "auto"), ("n'importe", "basic"), ("", "basic")])
async def test_proxy_reglable_valeur_inconnue_donne_basic(monkeypatch, raw, expected):
    monkeypatch.setenv("FIRECRAWL_PROXY", raw)
    assert (await _opts())["proxy"] == expected


async def test_aucun_parseur_firecrawl():
    assert (await _opts())["parsers"] == []


def test_pdf_nest_plus_favorise():
    assert ".pdf" not in fc.HIGH_VALUE_KEYWORDS
    assert fc._url_priority("https://a.fr/rapport.pdf", SourceCategory.OTHER) == fc._url_priority(
        "https://a.fr/rapport", SourceCategory.OTHER
    )


async def test_credits_agreges_par_run_et_ligne_info(caplog):
    client = AsyncMock()
    client.scrape.side_effect = [
        SimpleNamespace(markdown="a", metadata=SimpleNamespace(credits_used=1)),
        SimpleNamespace(markdown="b", metadata=SimpleNamespace(credits_used=5)),
    ]
    with caplog.at_level(logging.INFO, logger=fc.logger.name):
        await scrape_hits([_hit("https://a.fr/1"), _hit("https://a.fr/2")], http_client=client)
    stats = fc.run_credit_metrics(get_correlation_id())
    assert stats == {"firecrawl_credits_used": 6, "firecrawl_requests_live": 2}
    assert any("Firecrawl : 2 pages, 6 crédits" in r.getMessage() for r in caplog.records)


async def test_credit_absent_du_sdk_n_est_pas_invente():
    client = AsyncMock()
    client.scrape.return_value = SimpleNamespace(markdown="a")
    await scrape_hits([_hit("https://a.fr/1")], http_client=client)
    stats = fc.run_credit_metrics(get_correlation_id())
    assert stats["firecrawl_credits_used"] == 0
    assert stats["firecrawl_requests_live"] == 1


async def test_warning_au_dela_de_10_credits_sans_contenu(caplog):
    client = _client(credits=25)
    with caplog.at_level(logging.WARNING, logger=fc.logger.name):
        await scrape_hits([_hit("https://a.fr/gros")], http_client=client)
    msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert any("https://a.fr/gros" in m and "25" in m for m in msgs)
    assert not any("# page" in m for m in msgs)


async def test_pas_de_warning_a_10_credits_ou_moins(caplog):
    client = _client(credits=10)
    with caplog.at_level(logging.WARNING, logger=fc.logger.name):
        await scrape_hits([_hit("https://a.fr/ok")], http_client=client)
    assert not [r for r in caplog.records if r.levelno == logging.WARNING]


async def test_ligne_info_porte_les_compteurs_documents(caplog):
    from app.services import web_documents

    web_documents.reset_run_metrics()
    client = _client()
    with caplog.at_level(logging.INFO, logger=fc.logger.name):
        await scrape_hits([_hit("https://a.fr/page")], http_client=client)
    assert any(
        "Firecrawl : 1 pages, " in r.getMessage() and "web_documents_read=0" in r.getMessage()
        for r in caplog.records
    )
