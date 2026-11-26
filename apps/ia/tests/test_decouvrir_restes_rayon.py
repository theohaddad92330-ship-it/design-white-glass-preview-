"""#4515 (Louis 24/10) — le rayon de 25 km d'une ville est RÉELLEMENT appliqué, et « Non appliqué » ne se dit que de la
source qui a RÉPONDU. Le web envoie ``radiusKm: 25`` ; ces tests prouvent ce que le routeur en fait."""

from __future__ import annotations

import asyncio

from app.routers import discover as router

COMMUNE = {"name": "Lille", "code": "59350", "department": "59", "region": "32", "latitude": 50.63, "longitude": 3.06}
ROW = {"siren": "123456789", "name": "ACME", "city": "LILLE", "department": "59"}


def _collect(filters, monkeypatch, *, pappers=None, gouv=None, commune=COMMUNE):
    calls: list[tuple[str, object]] = []

    async def _pappers(source_filters, limit, degraded=None):
        calls.append(("pappers", source_filters))
        return list(pappers or [])

    async def _gouv(source_filters, limit, degraded=None):
        calls.append(("recherche-entreprises", source_filters))
        return list(gouv or [])

    monkeypatch.setattr(router, "_registry_search", _pappers)
    monkeypatch.setattr(router, "_fallback_search", _gouv)
    monkeypatch.setattr(router, "_registry_row", lambda row: dict(row))
    degraded: list[dict] = []
    rows = asyncio.run(router._collect_registry(filters, 10, degraded, commune=commune))
    return rows, degraded, calls


def test_le_rayon_de_25_km_part_a_la_source_avec_le_centre_de_la_ville(monkeypatch) -> None:
    filters = router.DiscoverFilters(city="Lille", radiusKm=25)

    _rows, _degraded, calls = _collect(filters, monkeypatch, gouv=[ROW])

    sent = dict(calls)["recherche-entreprises"]
    assert sent.radius_km == 25
    assert (sent.latitude, sent.longitude) == (50.63, 3.06)
    # Le cercle REMPLACE le code commune : une ville seule ne revient jamais à « la commune stricte ».
    assert sent.commune_code is None


def test_non_applique_ne_se_dit_pas_quand_la_source_qui_repond_applique_la_ville(monkeypatch) -> None:
    filters = router.DiscoverFilters(city="Lille", radiusKm=25)

    rows, degraded, calls = _collect(filters, monkeypatch, gouv=[ROW])

    assert rows
    assert [name for name, _ in calls] == ["recherche-entreprises"]
    assert not [d for d in degraded if "city" in (d.get("fields") or [])]


def test_la_ville_resolue_est_reprise_sur_les_lignes_de_la_source_qui_ne_la_lit_pas(monkeypatch) -> None:
    """RENVERSEMENT daté — lot DÉCOUVRIR-ZONE (#4641 #4420, 27/10/2026), sur mesure de PRODUCTION : `?city=Lille`
    rendait 24 comptes dont Saint-Jean-de-Luz, Montpellier, Nevers, Arcachon, Calvi, et la modale avouait
    « Non appliqué ». Depuis, une ville RÉSOLUE est reprise sur les lignes de la source qui l'ignore (Pappers) :
    le filtre EST appliqué, donc l'écran ne dit plus « non appliqué » — l'affirmer serait faux. L'ancienne garde
    (#4515, 24/10) attendait la note ici ; elle attendait une vérité qui n'en est plus une.

    Le NON de cette garde a changé de place, il n'a pas disparu : une ligne HORS de la ville demandée est
    écartée, et une ville NON résolue dit toujours « non appliqué » (test voisin)."""
    filters = router.DiscoverFilters(city="Lille", radiusKm=25)
    ailleurs = {"siren": "987654321", "name": "AILLEURS", "city": "MONTPELLIER", "department": "34"}

    rows, degraded, calls = _collect(filters, monkeypatch, pappers=[ROW, ailleurs], gouv=[])

    assert [name for name, _ in calls] == ["recherche-entreprises", "pappers"]
    assert [row["city"] for row in rows] == ["LILLE"]
    assert not [d for d in degraded if d.get("source") == "pappers" and "city" in (d.get("fields") or [])]


def test_une_ville_non_resolue_dit_que_le_rayon_n_est_pas_applique(monkeypatch) -> None:
    # Sans centre, le rayon ne s'applique pas (il ne se rabat pas sur un département) : le champ VILLE le DIT,
    # sous la clé `city` (l'écran n'a pas de champ « rayon » à part), et nomme la source qui a répondu.
    filters = router.DiscoverFilters(city="Lilleville", radiusKm=25)

    _rows, degraded, _calls = _collect(filters, monkeypatch, gouv=[ROW], commune=None)

    assert [d for d in degraded if d.get("source") == "recherche-entreprises" and "city" in (d.get("fields") or [])]


def test_une_ville_resolue_ne_dit_rien_du_rayon(monkeypatch) -> None:
    filters = router.DiscoverFilters(city="Lille", radiusKm=25)

    _rows, degraded, _calls = _collect(filters, monkeypatch, gouv=[ROW])

    assert degraded == []
