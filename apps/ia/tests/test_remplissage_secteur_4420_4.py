"""#4420.4 — « Java + Fintech » : un secteur coché FILTRE aussi le remplissage par offres fraîches.

Le tirage trouvé par les offres écartait déjà les comptes hors secteur (``outsideSector``) ; le remplissage
(``_fill_skill_search``) relisait la zone SANS ce filtre, et un compte hors secteur y entrait. Sources simulées."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.routers import discover as router


def _run(sector_naf: list[str], outside: set[str]) -> list[str]:
    seen_pool: list[str] = []

    async def fake_fill(skills, pool, **_k):
        seen_pool.extend(str(row["siren"]) for row in pool)
        return [], {}

    zone = [
        {"siren": "100000001", "nafCode": "64.19Z"},  # banque : dans le secteur
        {"siren": "100000002", "nafCode": "41.20A"},  # travaux de construction : hors secteur
        {"siren": "100000003", "nafCode": None},  # NAF non publié : reste (non mesuré n'est pas « hors »)
    ]
    req = SimpleNamespace(spaceKey="sp", profile_data={})
    filters = SimpleNamespace(
        model_copy=lambda update: filters, headcountRanges=None, headcountMin=None, headcountMax=None
    )
    with (
        patch.object(router, "_collect_for_request", AsyncMock(return_value=zone)),
        patch.object(router.fresh_jobs, "fill_skill_accounts", fake_fill),
    ):
        asyncio.run(
            router._fill_skill_search(req, filters, ["java"], [], {}, 20, [], {}, 1e12, 1e12, sector_naf, outside)
        )
    return seen_pool


def test_un_compte_hors_secteur_n_entre_pas_par_le_remplissage_et_il_est_compte() -> None:
    outside: set[str] = set()
    pool = _run(["64"], outside)
    assert "100000002" not in pool
    assert {"100000001", "100000003"} <= set(pool)
    assert outside == {"100000002"}


def test_sait_dire_non_sans_secteur_coche_rien_n_est_ecarte() -> None:
    outside: set[str] = set()
    pool = _run([], outside)
    assert "100000002" in pool
    assert outside == set()
