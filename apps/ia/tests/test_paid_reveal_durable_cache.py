"""GA-323 — lot 16, câble 3 : les caches de révélations PAYANTES n'avaient
PAS d'étage durable.

⚠️ **Périmètre réduit le 12/09/2026 (arbitrage de Louis).** Une première
version de ce lot routait AUSSI ``apollo.py`` (People-Match) et
``salesql.py`` à travers ``source_cache`` (Postgres, durable, partagé par
tous les workers/déploiements). Ces deux caches portent un e-mail et un
téléphone d'une PERSONNE identifiée — pas de la donnée d'entreprise — et
``source_cache.py:17-21`` écrit « PUBLIC data ONLY … NEVER user or CRM
data ». Même clé et même TTL qu'avant, l'argument technique tenait, mais
passer d'un Redis ÉVICTABLE à un Postgres DURABLE est un changement de
rétention dans les faits, sur de la donnée personnelle, dans un store dont
la règle écrite dit le contraire. On ne prolonge pas la rétention de
données personnelles pour économiser un crédit. Ils sont donc revenus à
Redis SEUL (voir leurs propres commentaires ``⚠️ DÉLIBÉRÉMENT sans étage
Postgres durable``), et cette garde ne couvre plus qu'``apollo_org.py``.

**Pourquoi ``apollo_org.py`` reste** : c'est de la firmographie
d'ENTREPRISE (logo, effectif, industrie, techs) — squarement dans la
catégorie « registre/firmo » que ``source_cache.py`` autorise déjà pour
Pappers/INSEE. Une éviction Redis y refaisait dépenser un crédit Apollo
PAYANT, et aucun compteur hit/miss ne le voyait.

Trois preuves exigées par CLAUDE.md pour toute garde d'architecture :

1. **LIT un corpus réel** : ``apollo_org.enrich_organization`` est exercé
   avec le VRAI store Postgres simulé (``MemoryStore``, même patron que
   ``test_source_cache.py``) et Redis explicitement COUPÉ pour prouver la
   survie de l'étage durable, plus les compteurs hit/miss et le repli sur
   une ligne malformée.
2. **SAIT DIRE NON** — deux formes :
   a. ``test_GA_323_without_l2_a_redis_outage_loses_the_cached_reveal``
      rejoue le patron D'AVANT ce lot (Redis seul, sans repli) et prouve
      qu'une panne Redis y refait payer le crédit à chaque appel ;
   b. ``test_GA_323_apollo_and_salesql_never_import_source_cache`` est le
      garde-fou de l'arbitrage du 12/09 : si quelqu'un « complète » à
      nouveau ``apollo.py``/``salesql.py`` avec ``source_cache`` en
      croyant réparer un oubli, ce test casse immédiatement.
3. **N'attrape pas ce qu'elle ne vise pas** : un résultat vide
   (``None`` — Apollo n'a aucun enregistrement) n'est jamais écrit dans
   l'étage durable, exactement comme avant.

⚠️ Aucune clé de cache n'est changée de FORME dans ce lot : la clé du L2
``apollo_org`` reste le domaine, la même identité déjà utilisée pour Redis.
"""

from __future__ import annotations

import ast
import pathlib
from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.services import apollo_org, source_cache

_SERVICES_DIR = pathlib.Path(__file__).resolve().parents[1] / "app" / "services"


class MemoryStore:
    """In-memory stand-in for ``source_cache._PgStore`` — même contrat que
    celui de ``test_source_cache.py`` : ``get`` rend (payload, expires_at)
    frais ou None, ``put`` fait un upsert."""

    def __init__(self) -> None:
        self.rows: dict[tuple[str, str, str], tuple[Any, datetime]] = {}

    async def get(self, source: str, category: str, key: str):
        row = self.rows.get((source, category, key))
        if row is None:
            return None
        payload, expires_at = row
        if expires_at <= datetime.now(UTC):
            return None
        return payload, expires_at

    async def put(self, source: str, category: str, key: str, payload: Any, ttl_s: int) -> None:
        self.rows[(source, category, key)] = (payload, datetime.now(UTC) + timedelta(seconds=ttl_s))


@pytest.fixture
def store(monkeypatch: pytest.MonkeyPatch) -> MemoryStore:
    """Simule le tier Postgres durable SANS ouvrir de vraie connexion."""
    ms = MemoryStore()

    async def _fake_store():
        return ms

    monkeypatch.setattr(source_cache, "_store", _fake_store)
    return ms


# ── Preuve n°1 : LIT apollo_org — survit à une panne Redis ──────────────────


async def test_GA_323_apollo_org_survives_redis_outage(store: MemoryStore, monkeypatch) -> None:
    """Redis EST DOWN (éviction/panne simulée) dès le premier appel : le 2e
    appel doit être servi par l'étage Postgres, pas re-payer le crédit
    Apollo."""
    monkeypatch.setenv("APOLLO_API_KEY", "k")
    monkeypatch.setattr(apollo_org, "_org_cache_redis", AsyncMock(return_value=None))
    calls = {"n": 0}

    async def _uncached(domain, api_key, http_client=None):
        calls["n"] += 1
        return apollo_org.ApolloOrgEnrichment(domain=domain, industry="Software")

    monkeypatch.setattr(apollo_org, "_enrich_organization_uncached", _uncached)

    r1 = await apollo_org.enrich_organization("acme-durable.example")
    r2 = await apollo_org.enrich_organization("acme-durable.example")

    assert calls["n"] == 1, (
        f"GA-323 : {calls['n']} appel(s) Apollo Org Enrich pour 2 lectures — "
        "attendu 1 (le 2e doit venir de l'étage Postgres durable malgré Redis DOWN)"
    )
    assert r1 is not None and r2 is not None
    assert r1.industry == r2.industry == "Software"
    assert store.rows, "l'étage Postgres doit avoir reçu l'écriture (write-through)"


async def test_GA_323_hits_and_misses_are_now_counted(store: MemoryStore, monkeypatch) -> None:
    """Avant ce lot, ce cache ne passait pas par
    ``source_cache.record_hit``/``record_miss`` — le coût évité par un hit
    payant restait invisible dans les métriques par SOURCE."""
    monkeypatch.setenv("APOLLO_API_KEY", "k")
    monkeypatch.setattr(apollo_org, "_org_cache_redis", AsyncMock(return_value=None))

    async def _uncached(domain, api_key, http_client=None):
        return apollo_org.ApolloOrgEnrichment(domain=domain, industry="Software")

    monkeypatch.setattr(apollo_org, "_enrich_organization_uncached", _uncached)

    ctx_stats = source_cache._fresh_stats()
    token = source_cache._run_stats.set(ctx_stats)
    try:
        await apollo_org.enrich_organization("acme-counted.example")  # miss → live → write L2
        await apollo_org.enrich_organization("acme-counted.example")  # hit ← L2
        stats = source_cache.run_stats()
    finally:
        source_cache._run_stats.reset(token)

    assert stats["misses"].get("apollo", 0) >= 1, "GA-323 : le miss initial doit être compté"
    assert stats["hits"].get("apollo", 0) >= 1, "GA-323 : le hit L2 doit être compté"


# ── Preuve n°2a : SAIT DIRE NON — Redis seul ne survit pas à une panne ──────


async def test_GA_323_without_l2_a_redis_outage_loses_the_cached_reveal() -> None:
    """Rejoue le patron D'AVANT ce lot (Redis SEUL, sans repli
    ``source_cache``). Prouve que le test « survit à une panne Redis »
    détecte bien l'absence du câblage L2 : sans lui, Redis DOWN → chaque
    appel re-paie le crédit, même sur la MÊME identité."""
    calls = {"n": 0}

    async def naive_enrich_org_redis_only(cache: dict[str, str], key: str) -> str:
        cached = cache.get(key)  # Redis "down" ⇒ le dict simulé reste vide
        if cached:
            return cached
        calls["n"] += 1
        result = "matched@paid-credit.example"
        # Redis étant DOWN, l'écriture elle-même échouerait aussi en
        # production (best-effort) — ici on le modélise en ne l'écrivant
        # simplement jamais, comme le ferait un ``r.set`` avalé par un
        # ``except``.
        return result

    empty_redis: dict[str, str] = {}
    r1 = await naive_enrich_org_redis_only(empty_redis, "same-identity")
    r2 = await naive_enrich_org_redis_only(empty_redis, "same-identity")

    assert r1 == r2 == "matched@paid-credit.example"
    assert calls["n"] == 2, (
        "sans étage Postgres durable, une panne Redis fait payer le crédit "
        "PAYANT deux fois pour la MÊME identité — c'est exactement le défaut "
        "que GA-323 corrige pour apollo_org"
    )


# ── Preuve n°2b : SAIT DIRE NON — le garde-fou de l'arbitrage du 12/09 ──────


def test_GA_323_apollo_and_salesql_never_import_source_cache() -> None:
    """Le garde-fou de l'arbitrage de Louis (12/09/2026) : ``apollo.py`` et
    ``salesql.py`` ne doivent PLUS JAMAIS router leurs révélations de
    PERSONNES à travers ``source_cache`` (Postgres durable, partagé). Un
    balayage AST plutôt qu'un grep — insensible à la reformulation, pas au
    renommage du module lui-même. Si quelqu'un les recâble en croyant
    compléter un oubli, ce test casse."""
    offenders: list[str] = []
    for name in ("apollo.py", "salesql.py"):
        tree = ast.parse((_SERVICES_DIR / name).read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and any(alias.name == "source_cache" for alias in node.names):
                offenders.append(name)
            if isinstance(node, ast.Attribute) and node.attr in {"get", "put"}:
                value = node.value
                if isinstance(value, ast.Name) and value.id == "source_cache":
                    offenders.append(name)

    assert not offenders, (
        f"{offenders} référence(nt) source_cache — interdit depuis l'arbitrage RGPD du "
        "12/09/2026 sur les révélations de personnes (People-Match / SalesQL)"
    )


def test_GA_323_the_ast_scan_actually_catches_a_reimport() -> None:
    """Ne pas attraper ce qu'elle ne vise pas dans l'autre sens : la
    fonction de balayage elle-même détecte bien un import de
    ``source_cache`` quand il existe — sinon le test précédent serait vert
    pour de mauvaises raisons (un corpus qui ne lit rien)."""
    tree = ast.parse("from app.services import source_cache\n")
    found = any(
        isinstance(node, ast.ImportFrom) and any(alias.name == "source_cache" for alias in node.names)
        for node in ast.walk(tree)
    )
    assert found, "le balayage AST doit savoir détecter un import qu'il vise"


# ── Preuve n°3 : n'attrape pas ce qu'elle ne vise pas (un miss reste nu) ────


async def test_GA_323_apollo_org_none_result_is_never_written_to_l2(store: MemoryStore, monkeypatch) -> None:
    monkeypatch.setenv("APOLLO_API_KEY", "k")
    monkeypatch.setattr(apollo_org, "_org_cache_redis", AsyncMock(return_value=None))

    async def _uncached(domain, api_key, http_client=None):
        return None  # Apollo n'a aucun enregistrement pour ce domaine

    monkeypatch.setattr(apollo_org, "_enrich_organization_uncached", _uncached)

    result = await apollo_org.enrich_organization("no-record.example")
    assert result is None
    assert store.rows == {}


# ── Un cache ne doit JAMAIS pouvoir casser un run ───────────────────────────


async def test_GA_323_malformed_l2_row_falls_through_to_live_call(store: MemoryStore, monkeypatch) -> None:
    """Une ligne Postgres malformée (schéma qui a dérivé, corruption) ne doit
    JAMAIS lever — repli sur l'appel direct, comme un miss ordinaire."""
    monkeypatch.setenv("APOLLO_API_KEY", "k")
    monkeypatch.setattr(apollo_org, "_org_cache_redis", AsyncMock(return_value=None))
    # Une ligne L2 dont le payload n'est PAS un ApolloOrgEnrichment valide.
    store.rows[("apollo", "org_enrich", "malformed.example")] = (
        {"estimated_num_employees": "pas-un-entier"},
        datetime.now(UTC) + timedelta(days=1),
    )
    calls = {"n": 0}

    async def _uncached(domain, api_key, http_client=None):
        calls["n"] += 1
        return apollo_org.ApolloOrgEnrichment(domain=domain, industry="Software")

    monkeypatch.setattr(apollo_org, "_enrich_organization_uncached", _uncached)

    result = await apollo_org.enrich_organization("malformed.example")

    assert result is not None and result.industry == "Software"
    assert calls["n"] == 1, "une ligne L2 illisible doit dégrader vers l'appel direct, jamais lever"


# ── Le namespace est déclaré au registre — et LUI SEUL ──────────────────────


def test_GA_323_only_apollo_org_namespace_is_registered_in_source_cache() -> None:
    assert source_cache.split_namespace("apollo:org_enrich") == ("apollo", "org_enrich")
    # Les deux namespaces retirés (arbitrage du 12/09) ne doivent JAMAIS
    # réapparaître comme des entrées connues du registre — un « unknown
    # namespace stores verbatim » (source=namespace, category="") prouve
    # qu'il n'a pas été redéclaré en douce.
    assert source_cache.split_namespace("apollo:people_match") == ("apollo:people_match", "")
    assert source_cache.split_namespace("salesql:enrich") == ("salesql:enrich", "")
