"""Lot Q point 4 (#4519) — « Data & IA + Île-de-France » rendait 0 compte + « Résultat non vérifiable ».

Cause tracée par lecture du code (voir la PR) : le client registre retente un délai de 8 s (`_search_page`), puis
le coupe-circuit à 5 échecs ferme les sous-recherches suivantes. Ce qui est gardé ICI : un registre lent sur
UNE sous-recherche ne rend jamais 0 compte quand une autre a déjà résolu des lignes, et la panne est DITE."""

import pytest

from app.routers import discover as router
from app.routers.discover import DiscoverFilters


def _row(siren: str, name: str) -> dict:
    return {"siren": siren, "name": name, "nafCode": "62.01Z"}


@pytest.mark.asyncio
async def test_une_sous_recherche_lente_ne_vide_pas_les_candidats_deja_resolus(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake(sub, limit, sink, **_):  # noqa: ANN001, ANN202
        if sub.sector == "slow":
            sink.append({"source": "recherche-entreprises", "reason": "network_error"})
            return []
        return [_row("111111118", "RESOLUE")]

    monkeypatch.setattr(router, "_collect_registry", fake)
    subs = [DiscoverFilters(sector="ok"), DiscoverFilters(sector="slow")]
    degraded: list[dict] = []
    rows = await router._collect_crossed(subs, 10, degraded)
    assert [r["siren"] for r in rows] == ["111111118"]
    assert {"source": "recherche-entreprises", "reason": "network_error"} in degraded  # la panne se DIT


@pytest.mark.asyncio
async def test_sait_dire_non_toutes_les_sous_recherches_en_panne_rendent_zero_et_le_disent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake(sub, limit, sink, **_):  # noqa: ANN001, ANN202
        sink.append({"source": "recherche-entreprises", "reason": "network_error"})
        return []

    monkeypatch.setattr(router, "_collect_registry", fake)
    degraded: list[dict] = []
    rows = await router._collect_crossed([DiscoverFilters(sector="a"), DiscoverFilters(sector="b")], 10, degraded)
    assert rows == [] and degraded  # jamais un « rien ne correspond » : la panne est nommée
