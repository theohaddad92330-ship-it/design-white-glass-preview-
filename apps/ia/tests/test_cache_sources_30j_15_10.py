"""CACHE-SOURCES (15/10, décision Louis) — TheirStack a épuisé ses 5 200 crédits en 5 jours.

Point 1 : les offres de TOUTES les sources et les autres fournisseurs PAYANTS se gardent
30 jours ; le VIDE reste court (« rien aujourd'hui » se repérime vite)."""

from __future__ import annotations

from app.services import provider_cache, public_facts, scrape_cache

_DAY = 24 * 3600


def test_paid_namespaces_default_to_30_days() -> None:
    assert provider_cache.TTL_JOBS == 30 * _DAY
    assert provider_cache.TTL_SEARCH == 30 * _DAY
    assert provider_cache.TTL_NEWS == 30 * _DAY
    assert provider_cache.TTL_TECH == 30 * _DAY
    assert scrape_cache._TTL_SECONDS == 30 * _DAY


def test_empty_results_stay_short() -> None:
    assert provider_cache.TTL_EMPTY_JOBS <= 7 * _DAY
    assert provider_cache.TTL_EMPTY_JOOBLE <= 7 * _DAY
    assert public_facts.EMPTY_FRESHNESS_S == provider_cache.TTL_EMPTY_JOBS


def test_shared_public_facts_follow_the_same_ttl() -> None:
    assert public_facts.FRESHNESS_S["jobs"] == provider_cache.TTL_JOBS == 30 * _DAY
    assert public_facts.FRESHNESS_S["news"] == provider_cache.TTL_NEWS == 30 * _DAY


def test_free_open_data_and_name_search_keep_their_own_tier() -> None:
    # #3989 (Louis 15/10) : cache 30 j TOUTES sources — les signaux légaux/marchés suivent.
    # La recherche registre par nom garde sa fraîcheur propre.
    assert provider_cache.TTL_SIGNALS == 30 * _DAY
    assert provider_cache.TTL_REGISTRY_SEARCH == 1 * _DAY
