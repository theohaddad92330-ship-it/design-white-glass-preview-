"""DECOUVRIR-COLLECTE (Louis 13/10) — les faits PUBLICS d'une entreprise, partagés
entre espaces, et la frontière PRIVÉE qui ne se traverse jamais.

« Toutes ces recherches on les stocke en cache pour s'en resservir pour d'autres
users, notre base interne, que ce soit pas des crédits foutus en l'air. »

Le cache durable existait déjà (``source_cache``, C5) mais Découvrir et l'analyse
complète n'y écrivaient pas sous la même clé : offres et actualités se rangeaient
sous le NOM tapé, AO sous nom + SIREN. ``public_facts`` range un fait public sous
l'ENTREPRISE (SIREN, sinon domaine) et sa NATURE, avec sa date de collecte ; sa
fraîcheur est celle de la nature, lue au seul endroit qui la règle
(``provider_cache.TTL_*``).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.services import provider_cache, public_facts, source_cache


class MemoryStore:
    def __init__(self) -> None:
        self.rows: dict[tuple[str, str, str], tuple[Any, datetime]] = {}

    async def get(self, source: str, category: str, key: str):
        row = self.rows.get((source, category, key))
        if row is None or row[1] <= datetime.now(UTC):
            return None
        return row

    async def put(self, source: str, category: str, key: str, payload: Any, ttl_s: int) -> None:
        self.rows[(source, category, key)] = (payload, datetime.now(UTC) + timedelta(seconds=ttl_s))


@pytest.fixture
def store(monkeypatch) -> MemoryStore:
    ms = MemoryStore()

    async def _fake_store():
        return ms

    monkeypatch.setattr(source_cache, "_store", _fake_store)
    monkeypatch.setattr(provider_cache, "_redis", AsyncMock(return_value=None))
    return ms


def _offer(title: str = "Développeur Java") -> dict:
    return {"title": title, "date": "2026-10-10", "url": f"https://offres.example/{title}"}


async def test_a_fresh_fact_is_served_without_any_external_call(store: MemoryStore) -> None:
    """Espace A collecte ; espace B (même entreprise, même nature) lit le cache :
    AUCUN appel. Rien dans la clé ne nomme un espace ni un utilisateur."""
    calls = 0

    async def fetch() -> list[dict]:
        nonlocal calls
        calls += 1
        return [_offer()]

    key = public_facts.company_fact_key(siren="552049447")
    first = await public_facts.cached_fact("jobs", key, "esn_it:it", fetch)
    second = await public_facts.cached_fact("jobs", key, "esn_it:it", fetch)

    assert calls == 1
    assert first == second == [_offer()]
    ((source, category, stored_key),) = store.rows.keys()
    assert (source, category) == ("public_facts", "jobs")
    assert stored_key == "siren:552049447|esn_it:it"
    payload, _ = store.rows[(source, category, stored_key)]
    # La date de collecte voyage avec le fait.
    assert datetime.fromisoformat(payload["collectedAt"]).tzinfo is not None


def test_freshness_is_read_from_the_single_place_that_sets_it() -> None:
    """Un réglage à UN endroit (GA-26) : la fraîcheur d'une nature EST le TTL du
    cache de sa famille — offres, actualités et registre ~30 j (Louis 15/10, crédits épuisés)."""
    day = 24 * 3600
    assert public_facts.FRESHNESS_S["jobs"] is provider_cache.TTL_JOBS
    assert public_facts.FRESHNESS_S["news"] is provider_cache.TTL_NEWS
    assert public_facts.FRESHNESS_S["registry"] is provider_cache.TTL_FIRMO
    assert 30 * day == provider_cache.TTL_JOBS
    assert 30 * day == provider_cache.TTL_NEWS
    assert 30 * day == provider_cache.TTL_FIRMO


def test_the_company_key_is_a_siren_or_a_domain_never_anything_else() -> None:
    assert public_facts.company_fact_key(siren="552 049 447") == "siren:552049447"
    assert public_facts.company_fact_key(domain="https://www.SNCF.com/fr") == "domain:sncf.com"
    assert public_facts.company_fact_key(siren="552049447", domain="sncf.com") == "siren:552049447"
    # Un identifiant d'espace ou de compte n'est PAS une entreprise : pas de clé, pas de cache.
    assert public_facts.company_fact_key(siren="0b6c7e1a-4f1e-4b8a-9d2e-1c3f5a7b9d0e") is None
    assert public_facts.company_fact_key(domain="not a domain") is None
    assert public_facts.company_fact_key() is None


@pytest.mark.parametrize("nature", ["crm", "notes", "documents", "drive", "missions", "corrections", "lists"])
async def test_a_private_nature_is_refused_never_shared(store: MemoryStore, nature: str) -> None:
    """FRONTIÈRE (Louis 13/10, non négociable) : ce qui est privé à un espace ne
    va JAMAIS dans le cache partagé. La garde dit NON — elle lève, n'écrit rien,
    et n'appelle même pas la collecte."""
    fetch = AsyncMock(return_value=[{"title": "x"}])

    with pytest.raises(public_facts.PrivateFactRefused):
        await public_facts.cached_fact(nature, "siren:552049447", "", fetch)

    fetch.assert_not_awaited()
    assert store.rows == {}


async def test_a_row_carrying_workspace_data_is_served_but_never_stored(store: MemoryStore) -> None:
    """Une ligne qui porte un marqueur d'espace (espace, utilisateur, compte suivi,
    note, CRM) n'est pas un fait public : rendue à l'appelant qui l'a collectée,
    JAMAIS écrite dans le cache que lit l'espace voisin."""
    leaked = [{**_offer(), "workspace_id": "w-1"}]

    async def fetch() -> list[dict]:
        return leaked

    out = await public_facts.cached_fact("jobs", "siren:552049447", "esn_it:it", fetch)

    assert out == leaked
    assert store.rows == {}


async def test_the_guard_reads_the_rows_and_lets_public_ones_through(store: MemoryStore) -> None:
    """Témoin : la même ligne SANS marqueur privé s'écrit — la garde lit les
    lignes, elle ne refuse pas tout."""

    async def fetch() -> list[dict]:
        return [_offer()]

    await public_facts.cached_fact("jobs", "siren:552049447", "esn_it:it", fetch)
    assert len(store.rows) == 1


async def test_no_company_key_means_a_plain_live_fetch(store: MemoryStore) -> None:
    fetch = AsyncMock(return_value=[_offer()])
    assert await public_facts.cached_fact("jobs", None, "esn_it:it", fetch) == [_offer()]
    assert store.rows == {}


async def test_expired_public_facts_are_archived_not_purged() -> None:
    """« On archive, on ne supprime pas » : la purge opportuniste du cache épargne
    les faits publics — périmés, ils ne sont plus SERVIS (filtre ``expires_at``),
    ils restent en base."""
    assert "public_facts" in source_cache._PURGE_SQL
    assert source_cache.split_namespace("facts:jobs") == ("public_facts", "jobs")


async def test_an_empty_answer_is_a_fact_but_a_failed_source_is_not(store: MemoryStore) -> None:
    """« Cherché, rien trouvé » se range (24 h) ; une source qui s'est déclarée en
    ERREUR pendant la collecte n'a pas dit « rien » — rien n'est rangé."""
    from app.services import source_health

    async def nothing() -> list[dict]:
        return []

    async def broken() -> list[dict]:
        source_health.note_fetch_error("HTTP 503")
        return []

    await public_facts.cached_fact("jobs", "siren:552049447", "ft", nothing)
    await public_facts.cached_fact("jobs", "siren:383474814", "ft", broken)

    assert [key for (_s, _c, key) in store.rows] == ["siren:552049447|ft"]


def _migration_sql() -> str:
    import pathlib

    root = pathlib.Path(__file__).resolve().parents[3]
    (path,) = (root / "apps" / "api" / "src" / "migrations").glob("*-SourceCachePublicFactsBoundary.ts")
    return path.read_text(encoding="utf-8")


def _sql_list(sql: str, prefix: str) -> set[str]:
    import re

    match = re.search(re.escape(prefix) + r"\s*\(([^)]*)\)", sql)
    assert match, f"liste introuvable après « {prefix} »"
    return set(re.findall(r"'([a-z_]+)'", match.group(1)))


def test_the_sql_boundary_says_the_same_as_the_code() -> None:
    """La frontière est tenue DEUX fois (code + SQL) : cette garde LIT la migration
    et exige les mêmes listes — une nature privée oubliée côté SQL, ou une nature
    publique ajoutée sans élargir la contrainte (GA-11/12), la rend rouge."""
    sql = _migration_sql()
    assert _sql_list(sql, "CHECK (source NOT IN") == set(public_facts.PRIVATE_NATURES)
    assert _sql_list(sql, "category IN") == set(public_facts.FRESHNESS_S)
    assert "ENABLE ROW LEVEL SECURITY" in sql


def test_the_sql_guard_can_say_no() -> None:
    """Témoin : la lecture distingue une liste fausse."""
    assert _sql_list("CHECK (source NOT IN ('crm'))", "CHECK (source NOT IN") != set(public_facts.PRIVATE_NATURES)


async def test_a_workspace_marker_nested_deep_in_a_row_is_never_stored(store: MemoryStore) -> None:
    """#3989 — « aucune trace de quel espace a déclenché la collecte » : le marqueur
    d'espace se cherche à TOUTE profondeur (un objet imbriqué, une liste), pas
    seulement à la racine de la ligne. La base le refuse aussi (CHECK
    ``source_cache_public_fact_no_workspace_marker``) : le code s'arrête avant."""
    leaked = [{**_offer(), "meta": {"tags": [{"userId": "u-1"}]}}]

    async def fetch() -> list[dict]:
        return leaked

    out = await public_facts.cached_fact("jobs", "siren:552049447", "esn_it:it", fetch)

    assert out == leaked
    assert store.rows == {}


async def test_a_free_text_variant_is_never_written_into_the_shared_key(store: MemoryStore) -> None:
    """#3989 — le ``variant`` change la QUESTION posée à la source, jamais QUI la
    pose : un jeton fermé (``esn_it``, ``apec:it``). Un texte libre (un domaine
    d'offre saisi par un espace) désignerait l'espace dans une clé que lisent
    tous les autres — la collecte est rendue, rien n'est rangé."""
    fetch = AsyncMock(return_value=[_offer()])

    out = await public_facts.cached_fact("tenders", "siren:552049447", "Cabinet Dupont — cybersécurité", fetch)

    assert out == [_offer()]
    assert store.rows == {}


async def test_a_closed_token_variant_is_still_shared(store: MemoryStore) -> None:
    """Témoin : les jetons réellement employés (Découvrir, analyse) se rangent."""
    for variant in ("", "esn_it", "apec:it", "ft:esn_it:all"):
        await public_facts.cached_fact("tenders", "siren:552049447", variant, AsyncMock(return_value=[_offer()]))
    assert len(store.rows) == 4
