"""#4735.1 — l'APPELANT de la source de levées : le SITE d'un compte → ses tours datés dans `recentSignals`.

Le connecteur (`crunchbase.py`) était testé et verdi, mais personne ne l'appelait. Les contrôles négatifs sont ÉCRITS ICI :
sans clé, rien ne part ; un tour garde sa date PARTIELLE ; la source ne se nomme jamais dans ce que l'écran lit.
"""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from app.services import company_domains, dated_signals
from app.services.data_sources import crunchbase as cb

ORG_URL = "https://api.crunchbase.com/v4/data/searches/organizations"
ROUNDS_URL = "https://api.crunchbase.com/v4/data/searches/funding_rounds"
SIREN = "123456789"


@pytest.fixture(autouse=True)
def _isolate(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CRUNCHBASE_API_KEY", raising=False)
    monkeypatch.setenv("SOURCE_CACHE_DISABLED", "1")
    monkeypatch.delenv("FRENCH_TECH_DIRECTORY_URLS", raising=False)

    async def known_site(_siren: object) -> str:
        return "acme.fr"

    monkeypatch.setattr(company_domains, "lookup", known_site)


def _client(calls: list[str], *, rounds: list[dict] | None = None) -> httpx.AsyncClient:
    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        if str(request.url) == ORG_URL:
            return httpx.Response(
                200,
                json={"entities": [{"properties": {"identifier": {"permalink": "acme-803a"}, "website_url": "https://www.acme.fr"}}]},
            )
        entities = [{"properties": p} for p in (rounds or [])]
        return httpx.Response(200, json={"entities": entities})

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


ROUND = {
    "announced_on": "2026-09-15",
    "investment_stage": "series_b",
    "money_raised": {"currency": "EUR", "value": 12_000_000, "value_usd": 13_000_000},
}


async def test_without_a_key_the_caller_calls_nothing_and_returns_the_list_untouched(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reads: list[object] = []

    async def spy(siren: object) -> str:
        reads.append(siren)
        return "acme.fr"

    monkeypatch.setattr(company_domains, "lookup", spy)
    calls: list[str] = []
    existing = [{"signal": "x", "type": "projet", "date": "2026-05-01"}]
    async with _client(calls) as client:
        assert await dated_signals.ecosystem_signals_merged(existing, SIREN, client=client) == existing
    assert calls == []
    assert reads == []  # sans clé, le site n'est même pas lu (zéro cache, zéro réseau)


async def test_with_a_key_the_siren_site_leads_to_a_dated_linked_round(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CRUNCHBASE_API_KEY", "cle-de-test")
    calls: list[str] = []
    async with _client(calls, rounds=[ROUND]) as client:
        merged = await dated_signals.ecosystem_signals_merged([{"signal": "a", "type": "projet"}], SIREN, client=client)
    assert merged[0] == {"signal": "a", "type": "projet"}
    line = merged[1]
    assert line["type"] == "levee_fonds"
    assert line["date"] == "2026-09-15"
    assert "12 M EUR" in line["signal"]  # le montant TEL QUE PUBLIÉ, jamais converti en USD
    assert line["url"] == "https://www.crunchbase.com/organization/acme-803a"
    assert calls == [ORG_URL, ROUNDS_URL]
    # La source ne se nomme jamais à l'écran (doctrine « on nomme ce que l'espace a branché »).
    assert "crunchbase" not in " ".join(str(line.get(k, "")) for k in ("signal", "source", "detail")).lower()


async def test_two_rounds_sharing_the_same_organisation_link_are_both_kept(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CRUNCHBASE_API_KEY", "cle-de-test")
    older = {**ROUND, "announced_on": "2024-03-02", "investment_stage": "series_a"}
    async with _client([], rounds=[ROUND, older]) as client:
        merged = await dated_signals.ecosystem_signals_merged([], SIREN, client=client)
    assert [s["date"] for s in merged] == ["2026-09-15", "2024-03-02"]


async def test_a_partial_date_is_dropped_never_completed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CRUNCHBASE_API_KEY", "cle-de-test")
    async with _client([], rounds=[{**ROUND, "announced_on": "2026"}]) as client:
        assert await dated_signals.ecosystem_signals_merged([], SIREN, client=client) == []


async def test_an_unknown_amount_is_not_written_as_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CRUNCHBASE_API_KEY", "cle-de-test")
    async with _client([], rounds=[{"announced_on": "2026-09-15"}]) as client:
        merged = await dated_signals.ecosystem_signals_merged([], SIREN, client=client)
    assert merged[0]["signal"] == "Levée de fonds"
    assert "0" not in merged[0]["signal"]


async def test_an_unknown_site_means_no_search_at_all(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CRUNCHBASE_API_KEY", "cle-de-test")

    async def no_site(_siren: object) -> None:
        return None

    monkeypatch.setattr(company_domains, "lookup", no_site)
    calls: list[str] = []
    async with _client(calls, rounds=[ROUND]) as client:
        assert await dated_signals.ecosystem_signals_merged([], SIREN, client=client) == []
    assert calls == []


async def test_an_outage_never_breaks_the_dossier(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CRUNCHBASE_API_KEY", "cle-de-test")

    async def boom(*_a: object, **_k: object) -> list:
        raise RuntimeError("panne")

    monkeypatch.setattr(cb, "funding_rounds_for_domain", boom)
    existing = [{"signal": "x", "type": "projet", "date": "2026-05-01"}]
    assert await dated_signals.ecosystem_signals_merged(existing, SIREN) == existing


def test_the_provider_is_in_the_vocabulary_guard() -> None:
    from app.services.output_hygiene import _INTERNAL_PROVIDERS

    assert "crunchbase" in _INTERNAL_PROVIDERS


def test_phase1_research_still_reaches_it_through_the_one_caller() -> None:
    """#4735.1 — pas de second appelant : `ecosystem_signals_merged` (phase1_research) appelle la source de levées."""
    root = Path(__file__).parent.parent / "app"
    assert "ecosystem_signals_merged(" in (root / "routers" / "phase1_research.py").read_text(encoding="utf-8")
    assert "funding_rounds_for_domain(" in (root / "services" / "dated_signals.py").read_text(encoding="utf-8")
