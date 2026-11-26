"""DECOUVRIR-COLLECTE (Louis 13/10, décision n°4) — « Construire le dossier
complet » relit les faits publics que Découvrir (ou un autre espace) a déjà
collectés pour la MÊME entreprise : frais en cache = aucun appel externe.

Avant : l'analyse rangeait ses collectes sous le nom TAPÉ (actualités, offres
cadres) ou nom + SIREN (AO) — jamais sous la clé de Découvrir. Désormais
actualités, AO, annonces légales et offres cadres se lisent par SIREN
(``public_facts``). Les offres France Travail de l'analyse restent sous leur
clé de GROUPE (filiales comprises) : une question plus large que celle de
Découvrir, qui ne doit pas être servie par la réponse plus étroite.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.services import provider_cache, source_cache
from tests.test_phase1_research import (
    MOCK_BUNDLE_WITH_CONTENT,
    MOCK_PROFILE,
    _claude_side_effect,
    _facts,
    _signals,
    _strategy,
)

_SIREN = MOCK_PROFILE.siren


def _seeded_store(monkeypatch) -> dict:
    rows: dict[tuple[str, str, str], tuple[Any, datetime]] = {}

    class MemoryStore:
        async def get(self, source: str, category: str, key: str):
            row = rows.get((source, category, key))
            return row if row and row[1] > datetime.now(UTC) else None

        async def put(self, source: str, category: str, key: str, payload: Any, ttl_s: int) -> None:
            rows[(source, category, key)] = (payload, datetime.now(UTC) + timedelta(seconds=ttl_s))

    async def _store() -> MemoryStore:
        return MemoryStore()

    monkeypatch.setattr(source_cache, "_store", _store)
    monkeypatch.setattr(provider_cache, "_redis", AsyncMock(return_value=None))
    fresh = datetime.now(UTC) + timedelta(days=3)
    collected = datetime.now(UTC).isoformat()

    def seed(category: str, variant: str, facts: list[dict]) -> None:
        rows[("public_facts", category, f"siren:{_SIREN}|{variant}")] = (
            {"collectedAt": collected, "rows": facts},
            fresh,
        )

    seed("news", "", [{"type": "projet", "title": "SNCF migre son SI", "url": "https://m/a", "published_at": collected}])
    seed("tenders", "esn_it", [{"title": "TMA", "publishedDate": "2026-10-01"}])
    seed("legal", "", [{"date": "2026-09-30", "type": "Modification"}])
    # Sans profil exploitable, l'analyse collecte large (`profile_widens_collection`) :
    # la variante dit la QUESTION posée, « toutes fonctions ».
    seed("jobs", "apec:esn_it:all", [{"title": "Architecte", "date": "2026-10-09", "url": "https://y/1"}])
    return rows


def test_the_full_dossier_reads_the_public_facts_discover_already_paid_for(client: TestClient, monkeypatch) -> None:
    _seeded_store(monkeypatch)
    press = AsyncMock(return_value=[])
    tenders = AsyncMock(return_value=[])
    legal = AsyncMock(return_value=[])
    apec = AsyncMock(return_value=[])
    with (
        patch("app.routers.phase1_research.research_brave", new_callable=AsyncMock, return_value=[]),
        patch("app.routers.phase1_research.research_pappers", new_callable=AsyncMock, return_value=MOCK_PROFILE),
        patch(
            "app.routers.phase1_research.research_firecrawl",
            new_callable=AsyncMock,
            return_value=MOCK_BUNDLE_WITH_CONTENT,
        ),
        patch(
            "app.routers.phase1_research.call_claude",
            new_callable=AsyncMock,
            side_effect=_claude_side_effect(_facts(), _signals(), _strategy()),
        ),
        patch("app.routers.phase1_research.press_signals", press),
        patch("app.routers.phase1_research.public_tenders", tenders),
        patch("app.routers.phase1_research.legal_signals", legal),
        patch("app.routers.phase1_research.it_job_signals_apec", apec),
    ):
        res = client.post("/phase/1/research", json={"company_name": "SNCF", "siren": _SIREN})

    assert res.status_code == 200, res.text
    press.assert_not_awaited()
    tenders.assert_not_awaited()
    legal.assert_not_awaited()
    apec.assert_not_awaited()
