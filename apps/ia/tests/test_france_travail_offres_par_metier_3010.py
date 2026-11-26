"""Louis 30/10 — France Travail répond à la recherche « par métier » de la fiche compte quand Adzuna est à quota.

Ce que ces tests tiennent (sans réseau) : nom + métier en ``motsCles`` ; l'employeur se PROUVE (un homonyme
« Mairie de Still » n'entre pas) ; ni stage ni fournisseur ignoré ; ``None`` sans identifiants ou en panne —
jamais une liste vide qui se lirait « aucune offre ».
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.services.data_sources import france_travail as ft


def _raw(title: str, employer: str, created: str = "2026-10-20T10:00:00Z") -> dict:
    return {
        "intitule": title,
        "entreprise": {"nom": employer},
        "lieuTravail": {"libelle": "67 - Strasbourg", "commune": "67482"},
        "dateCreation": created,
        "typeContratLibelle": "CDI",
        "origineOffre": {"urlOrigine": f"https://ft/{title}"},
    }


@pytest.fixture
def _creds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ft, "_creds", lambda: ("id", "secret"))


async def test_searches_name_and_term_and_proves_the_employer(monkeypatch: pytest.MonkeyPatch, _creds) -> None:
    search = AsyncMock(
        return_value=[
            _raw("Responsable qualité", "STILL"),
            _raw("Agent qualité", "MAIRIE DE STILL"),
            _raw("Stage qualité", "STILL"),
            _raw("Technicien qualité", "STILL", created="2026-10-25T10:00:00Z"),
        ]
    )
    monkeypatch.setattr(ft, "_search_authed", search)
    out = await ft.account_term_offers("STILL", "  qualité ")
    assert search.await_args.args[1]["motsCles"] == "STILL qualité"
    assert [o["title"] for o in out] == ["Technicien qualité", "Responsable qualité"]
    assert out[0]["url"] == "https://ft/Technicien qualité"
    assert out[0]["company"] == "STILL"


async def test_without_credentials_it_says_not_searched(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ft, "_creds", lambda: ("", ""))
    search = AsyncMock()
    monkeypatch.setattr(ft, "_search_authed", search)
    assert await ft.account_term_offers("STILL", "qualité") is None
    assert search.await_count == 0


async def test_a_failure_is_not_an_empty_answer(monkeypatch: pytest.MonkeyPatch, _creds) -> None:
    monkeypatch.setattr(ft, "_search_authed", AsyncMock(side_effect=RuntimeError("jeton indisponible")))
    assert await ft.account_term_offers("STILL", "qualité") is None


async def test_respects_the_limit(monkeypatch: pytest.MonkeyPatch, _creds) -> None:
    rows = [_raw(f"Ingénieur qualité {i}", "STILL") for i in range(80)]
    monkeypatch.setattr(ft, "_search_authed", AsyncMock(return_value=rows))
    assert len(await ft.account_term_offers("STILL", "qualité", limit=50) or []) == 50
