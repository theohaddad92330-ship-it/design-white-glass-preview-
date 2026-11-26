"""#3917 / #3925 — presse française par flux RSS : signaux typés, datés, rattachés.

Sans réseau : les flux sont des fixtures injectées via ``fetch_feed``.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta
from email.utils import format_datetime

import pytest

from app.services.data_sources import press_rss
from app.services.data_sources.press_rss import PRESS_FEEDS, press_signals


def _rfc(days_ago: float) -> str:
    return format_datetime(datetime.now(UTC) - timedelta(days=days_ago))


def _item(title: str, *, desc: str = "", days_ago: float | None = 2, link: str = "https://media.example/a1") -> str:
    date = f"<pubDate>{_rfc(days_ago)}</pubDate>" if days_ago is not None else ""
    return f"<item><title>{title}</title><link>{link}</link><description>{desc}</description>{date}</item>"


def _feed(*items: str) -> str:
    return f'<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>t</title>{"".join(items)}</channel></rss>'


@pytest.fixture(autouse=True)
def _no_cache(monkeypatch):
    async def passthrough(namespace, key, fetch, ttl=None):
        return await fetch()

    monkeypatch.setattr(press_rss.provider_cache, "cached_json", passthrough)
    monkeypatch.setattr(press_rss, "_enabled", lambda: os.environ.get("PRESS_RSS_ENABLED", "true") != "false")


def _use(monkeypatch, feeds: dict[str, str | Exception]):
    async def fake(url, **_):
        v = feeds[url]
        if isinstance(v, Exception):
            raise v
        return v

    monkeypatch.setattr(press_rss, "PRESS_FEEDS", tuple(feeds))
    monkeypatch.setattr(press_rss, "fetch_feed", fake)


def test_feed_list_is_https_and_has_at_least_three_verified():
    assert len(PRESS_FEEDS) >= 3
    assert all(f.startswith("https://") for f in PRESS_FEEDS)


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("Acme Logiciels lève 12 millions d'euros", "levee"),
        ("Acme Logiciels annonce une levée de fonds", "levee"),
        ("Acme Logiciels nomme un nouveau DSI", "nomination"),
        ("Jean Dupont rejoint Acme Logiciels", "nomination"),
        ("Acme Logiciels rachète une start-up", "rachat"),
        ("Acquisition de Beta par Acme Logiciels", "rachat"),
        ("Acme Logiciels lance la refonte de son SI", "projet"),
        ("Acme Logiciels dévoile son plan stratégique", "projet"),
        ("Acme Logiciels ouvre un bureau", "autre"),
    ],
)
async def test_each_type(monkeypatch, title, expected):
    _use(monkeypatch, {"https://f1": _feed(_item(title))})
    out = await press_signals("Acme Logiciels", None, None)
    assert [s["type"] for s in out] == [expected]
    s = out[0]
    assert s["url"] == "https://media.example/a1"
    assert s["title"] == title
    assert s["published_at"]
    assert s["matched_on"] == "name"
    assert s["source"]


async def test_match_on_summary_and_domain_and_siren(monkeypatch):
    _use(
        monkeypatch,
        {
            "https://f1": _feed(
                _item("Un acteur lève des fonds", desc="Il s'agit d'Acme Logiciels, basé à Lyon", link="https://m/1"),
                _item("Visite sur acme-logiciels.fr", link="https://m/2"),
                _item("Immatriculée sous le SIREN 123456789, la société rachète", link="https://m/3"),
            )
        },
    )
    out = await press_signals("Acme Logiciels", "123 456 789", "acme-logiciels.fr")
    by_url = {s["url"]: s["matched_on"] for s in out}
    assert by_url == {"https://m/1": "name", "https://m/2": "domain", "https://m/3": "siren"}


async def test_word_boundaries(monkeypatch):
    _use(monkeypatch, {"https://f1": _feed(_item("Acme Logiciels Group lève 5 M€ ; Acme Logicielsx aussi"))})
    out = await press_signals("Acme Logiciels", None, None)
    assert len(out) == 1  # « Acme Logiciels Group » contient bien le nom à frontière de mot
    _use(monkeypatch, {"https://f1": _feed(_item("Superacme Logicielsx lève 5 M€"))})
    assert await press_signals("Acme Logiciels", None, None) == []


async def test_homonym_commune_rejected(monkeypatch):
    _use(
        monkeypatch,
        {
            "https://f1": _feed(
                _item("La mairie de Still lance un projet de refonte", link="https://m/1"),
                _item("Still : la commune rachète un terrain", link="https://m/2"),
            )
        },
    )
    out = await press_signals("Still Machines", "123456789", "still.fr")
    # nom complet « Still Machines » absent ; domaine/SIREN absents → rien
    assert out == []
    out = await press_signals("Still", "123456789", "still.fr")
    assert out == []  # nom nu : la collectivité (mairie / commune) écarte l'article


async def test_commune_wording_rejected_even_with_full_name(monkeypatch):
    _use(
        monkeypatch,
        {
            "https://f1": _feed(
                _item("Acme Logiciels : la mairie de Lyon lance une refonte", link="https://m/1"),
                _item("Acme Logiciels lève 3 M€", link="https://m/2"),
            )
        },
    )
    out = await press_signals("Acme Logiciels", None, None)
    assert [s["url"] for s in out] == ["https://m/2"]


async def test_short_single_word_name_needs_confirmation(monkeypatch):
    feed = _feed(_item("Zeta lève 10 M€", link="https://m/1"), _item("Zeta rachète Beta, siren 987654321", link="https://m/2"))
    _use(monkeypatch, {"https://f1": feed})
    assert [s["url"] for s in await press_signals("Zeta", None, None)] == []
    out = await press_signals("Zeta", "987654321", None)
    assert [s["url"] for s in out] == ["https://m/2"]
    assert out[0]["matched_on"] == "siren"


async def test_undated_and_expired_dropped(monkeypatch):
    _use(
        monkeypatch,
        {
            "https://f1": _feed(
                _item("Acme Logiciels lève 1 M€", days_ago=None, link="https://m/1"),
                _item("Acme Logiciels lève 2 M€", days_ago=200, link="https://m/2"),
                _item("Acme Logiciels lève 3 M€", days_ago=10, link="https://m/3"),
            )
        },
    )
    out = await press_signals("Acme Logiciels", None, None)
    # Lot 762 : l'article de 200 j est STOCKÉ estampillé ``historical`` ; le non daté reste écarté.
    assert sorted(s["url"] for s in out) == ["https://m/2", "https://m/3"]
    by_url = {s["url"]: s for s in out}
    assert by_url["https://m/2"].get("historical") is True
    assert not by_url["https://m/3"].get("historical")
    out = await press_signals("Acme Logiciels", None, None, max_age_days=300)
    assert not any(s.get("historical") for s in out)


async def test_failing_feed_ignored_and_degradation_noted(monkeypatch):
    noted: list[str] = []
    monkeypatch.setattr(press_rss, "record_degradation", lambda *a, **k: noted.append(k.get("source", "")))
    _use(
        monkeypatch,
        {
            "https://bad": RuntimeError("boom"),
            "https://junk": "<html>pas du xml",
            "https://ok": _feed(_item("Acme Logiciels lève 4 M€")),
        },
    )
    out = await press_signals("Acme Logiciels", None, None)
    assert len(out) == 1
    assert noted == ["press_rss"]


async def test_duplicate_across_feeds_deduplicated(monkeypatch):
    it = _item("Acme Logiciels lève 4 M€", link="https://m/same")
    _use(monkeypatch, {"https://f1": _feed(it), "https://f2": _feed(it)})
    assert len(await press_signals("Acme Logiciels", None, None)) == 1


async def test_dtd_payload_refused(monkeypatch):
    bomb = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><rss><channel><item><title>&a;</title></item></channel></rss>'
    _use(monkeypatch, {"https://f1": bomb})
    assert await press_signals("Acme Logiciels", None, None) == []


async def test_blank_company_is_noop(monkeypatch):
    _use(monkeypatch, {"https://f1": _feed(_item("x"))})
    assert await press_signals("  ", None, None) == []


async def test_disabled_flag_is_noop(monkeypatch):
    monkeypatch.setenv("PRESS_RSS_ENABLED", "false")
    _use(monkeypatch, {"https://f1": _feed(_item("Acme Logiciels lève 4 M€"))})
    assert await press_signals("Acme Logiciels", None, None) == []


async def test_short_name_threshold_is_six(monkeypatch):
    # #3915.c — un nom d'un seul mot de 5 caractères ne suffit plus seul ; 6 suffit.
    feed = _feed(_item("Sanef lève 10 M€", link="https://m/1"), _item("Safran lève 10 M€", link="https://m/2"))
    _use(monkeypatch, {"https://f1": feed})
    assert await press_signals("Sanef", None, None) == []
    assert [s["url"] for s in await press_signals("Safran", None, None)] == ["https://m/2"]


async def test_longer_homonym_rejected_through_same_employer(monkeypatch):
    # #3915.a/b — « Renault » ne rattache pas un article sur « Renault Trucks ».
    feed = _feed(
        _item("Renault Trucks recrute 300 personnes", link="https://m/1"),
        _item("Groupe Renault : un nouveau DSI", link="https://m/2"),
    )
    _use(monkeypatch, {"https://f1": feed})
    assert [s["url"] for s in await press_signals("Renault", None, None)] == ["https://m/2"]


async def test_feeds_loaded_once_are_shared_by_every_company_of_a_page(monkeypatch):
    """DECOUVRIR-COLLECTE (13/10) — une page Découvrir interroge 24 entreprises :
    les flux se lisent UNE fois (``load_feeds``) et se partagent, jamais 24 × 7
    lectures (sans Redis, chaque appel relisait chaque flux)."""
    calls: list[str] = []

    async def fake(url, **_):
        calls.append(url)
        return _feed(_item("Acme Logiciels lève 4 M€"), _item("Beta Systemes nomme un DSI", link="https://m/b"))

    monkeypatch.setattr(press_rss, "PRESS_FEEDS", ("https://one", "https://two"))
    monkeypatch.setattr(press_rss, "fetch_feed", fake)

    feeds = await press_rss.load_feeds()
    acme = await press_signals("Acme Logiciels", None, None, feeds=feeds)
    beta = await press_signals("Beta Systemes", None, None, feeds=feeds)

    assert calls == ["https://one", "https://two"]
    assert len(acme) == 1 and len(beta) == 1
