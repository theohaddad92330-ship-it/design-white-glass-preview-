"""#4734 — l'APPELANT de l'annuaire French Tech : un compte dont le SIREN est dans l'annuaire déclaré porte sa ligne.

Le collecteur (`french_tech.py`) était testé et verdi, mais personne ne l'appelait : l'assertion qui manquait est
« le SIREN du compte → la ligne datée, liée, dans `recentSignals` ». Les contrôles négatifs sont ÉCRITS ICI.
"""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from app.services import dated_signals
from app.services.data_sources import french_tech as ft

URL = "https://annuaire.example/frenchtech.csv"
CSV = "Nom;SIREN;Label;Programme;Promotion;Date;Lien\nAcme;123 456 789;Next40;French Tech 120;2025;2026-06-01;https://annuaire.example/acme\nVieux;555666777;Membre;;2019;2019-03-01;https://annuaire.example/vieux\n"


@pytest.fixture(autouse=True)
def _clean(monkeypatch: pytest.MonkeyPatch) -> None:
    ft._memory.clear()
    ft._locks.clear()

    async def no_cache(_ns: str, _key: str, fetch, ttl: int):  # noqa: ANN001
        return await fetch()

    monkeypatch.setattr(ft.provider_cache, "cached_json", no_cache)


def _client(calls: list[str]) -> httpx.AsyncClient:
    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return httpx.Response(200, text=CSV)

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_account_whose_siren_is_in_the_declared_directory_carries_the_line(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FRENCH_TECH_DIRECTORY_URLS", URL)
    calls: list[str] = []
    async with _client(calls) as client:
        merged = await dated_signals.ecosystem_signals_merged(
            [{"signal": "Projet cloud", "type": "projet", "date": "2026-05-01"}], "123456789", client=client
        )
    assert merged[0]["signal"] == "Projet cloud"  # les signaux existants restent en tête, intacts
    line = merged[1]
    assert line["type"] == "ecosystem"
    assert line["signal"] == "Next40 · French Tech 120 · 2025"
    assert line["date"] == "2026-06-01"
    assert line["url"] == "https://annuaire.example/acme"
    assert line["status"] == "known"
    assert calls == [URL]


async def test_label_older_than_24_months_is_shown_as_unknown_not_dropped(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRENCH_TECH_DIRECTORY_URLS", URL)
    async with _client([]) as client:
        merged = await dated_signals.ecosystem_signals_merged(None, "555666777", client=client)
    assert [s["status"] for s in merged] == ["unknown"]
    assert merged[0]["date"] == "2019-03-01"


async def test_company_absent_from_the_directory_carries_no_line(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRENCH_TECH_DIRECTORY_URLS", URL)
    existing = [{"signal": "x", "type": "projet", "date": "2026-05-01"}]
    async with _client([]) as client:
        assert await dated_signals.ecosystem_signals_merged(existing, "999888777", client=client) == existing


async def test_empty_directory_setting_is_a_strict_noop_no_network_no_line(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FRENCH_TECH_DIRECTORY_URLS", raising=False)
    calls: list[str] = []
    existing = [{"signal": "x", "type": "projet", "date": "2026-05-01"}]
    async with _client(calls) as client:
        merged = await dated_signals.ecosystem_signals_merged(existing, "123456789", client=client)
    assert merged == existing
    assert calls == []


async def test_no_siren_means_no_line_and_no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRENCH_TECH_DIRECTORY_URLS", URL)
    calls: list[str] = []
    async with _client(calls) as client:
        assert await dated_signals.ecosystem_signals_merged([], "", client=client) == []
    assert calls == []


def test_the_line_is_not_added_twice() -> None:
    # Fusion du 31/10/2026 (#4808) : un seul `merge_ecosystem_signals`, celui de main — il dédoublonne par LIEN.
    line = {
        "type": "ecosystem",
        "label": "Next40",
        "date": "2026-06-01",
        "detail": "d",
        "status": "known",
        "url": "https://annuaire.example/acme",
    }
    once = dated_signals.merge_ecosystem_signals([], [line])
    assert len(dated_signals.merge_ecosystem_signals(once, [line])) == 1


def test_phase1_research_really_calls_it() -> None:
    """L'appelant existe : `phase1_research` assemble `recentSignals` avec ce chemin (pas un module de plus orphelin)."""
    source = (Path(__file__).parent.parent / "app" / "routers" / "phase1_research.py").read_text(encoding="utf-8")
    assert "ecosystem_signals_merged(" in source
