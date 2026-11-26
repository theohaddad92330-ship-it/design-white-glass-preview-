"""GA-302 — CORRECTIF C : le waterfall ``DataGateway`` n'avait AUCUN cache,
contrairement à son jumeau.

``data_gateway.py`` (``brave_search_single`` et le waterfall
Serper→Tavily→Brave) ne portait ZÉRO occurrence de ``cached_json`` /
``provider_cache`` / ``source_cache`` — alors que ``brave_search.py`` documente
explicitement avoir corrigé exactement ce trou pour son propre chemin
(« Brave was the last uncached provider »). Le waterfall est appelé depuis
``phase1_research.py`` (``get_data_gateway().search(company)``) et
``org_verify.py`` (``gateway.search(query, ...)``), donc à CHAQUE analyse.

Le correctif pose le cache au niveau de ``DataGateway.search`` (un seul point
pour tout le waterfall, quel que soit le provider qui gagne) via le même
combinateur ``provider_cache.cached_json`` que ``brave_search.py`` — même
patron, même dégradation « erreur de cache → appel live », jamais de résultat
vide caché.

Cette garde prouve les TROIS choses qu'exige CLAUDE.md :

1. **Elle LIT** un corpus réel et non vide : le registre
   ``source_cache._NAMESPACES`` (18 entrées à ce lot) et le VRAI fichier
   ``data_gateway.py`` sur disque.
2. **Elle SAIT DIRE NON** :
   ``test_GA_302_the_parity_check_says_no_on_the_pre_fix_source`` rejoue le
   texte D'AVANT ce lot (zéro occurrence de ``cached_json``) et le détecteur
   statique doit le signaler comme NON câblé ;
   ``test_GA_302_an_unregistered_namespace_falls_into_the_generic_bucket``
   montre ce qui arriverait si le namespace n'était pas déclaré au registre
   (retombée dans le seau générique, invisible dans les métriques par
   SOURCE).
3. **Elle n'attrape pas ce qu'elle ne vise pas** : un résultat vide (tous les
   providers ont échoué/rien trouvé) reste NON caché — la garde ne force pas
   la mise en cache de ce qui doit rester re-tentable
   (``test_an_empty_waterfall_result_is_not_cached``).
"""

from __future__ import annotations

import pathlib
from unittest.mock import AsyncMock

import pytest

from app.services import data_gateway as dg
from app.services import source_cache
from app.services.data_gateway import DataGateway

_DATA_GATEWAY_FILE = pathlib.Path(__file__).resolve().parents[1] / "app" / "services" / "data_gateway.py"

# Le namespace attendu — déclaré dans source_cache._NAMESPACES pour que les
# compteurs de hit/miss du run le voient sous la source "data_gateway", pas
# sous une clé brute non mappée.
_SEARCH_NAMESPACE = "search:gateway"


# ── Le COMPTE : deux recherches identiques consécutives, 2 appels → 1 ───────


class _FakeCache:
    """Minimal stand-in for provider_cache.cached_json: get-or-fetch,
    truthy-only — le même patron que test_brave_search_cache.py."""

    def __init__(self) -> None:
        self.store: dict[tuple[str, str], object] = {}
        self.fetches = 0

    async def cached_json(self, namespace, key, fetch, ttl=None):
        hit = self.store.get((namespace, key))
        if hit is not None:
            return hit
        self.fetches += 1
        value = await fetch()
        if value:
            self.store[(namespace, key)] = value
        return value


@pytest.fixture(autouse=True)
def _no_redis(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("app.services.provider_cache.redis_url", lambda: None, raising=False)
    yield


async def test_identical_gateway_searches_hit_the_cache_the_second_time(monkeypatch: pytest.MonkeyPatch) -> None:
    cache = _FakeCache()
    monkeypatch.setattr(dg, "cached_json", cache.cached_json)
    gw = DataGateway()
    calls = 0

    async def fake_uncached(cleaned: str, *, limit: int):
        nonlocal calls
        calls += 1
        return [{"title": "t", "url": "https://x.fr", "description": "d", "source": "serper"}]

    monkeypatch.setattr(gw, "_search_uncached", fake_uncached)

    first = await gw.search("ACME DSI")
    second = await gw.search("ACME DSI")

    assert first == second
    assert calls == 1, f"GA-302 : {calls} appels sortants pour deux recherches identiques — attendu 1"


async def test_different_queries_are_cached_separately(monkeypatch: pytest.MonkeyPatch) -> None:
    cache = _FakeCache()
    monkeypatch.setattr(dg, "cached_json", cache.cached_json)
    gw = DataGateway()
    calls = 0

    async def fake_uncached(cleaned: str, *, limit: int):
        nonlocal calls
        calls += 1
        return [{"title": "t", "url": f"https://{cleaned}.fr", "description": "d", "source": "serper"}]

    monkeypatch.setattr(gw, "_search_uncached", fake_uncached)
    await gw.search("acme presse")
    await gw.search("acme emploi")
    assert calls == 2


async def test_an_empty_waterfall_result_is_not_cached(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ne pas attraper ce qu'elle ne vise pas : un résultat vide (tous les
    providers ont échoué/rien trouvé) doit rester re-tentable, jamais
    empoisonner la fenêtre de cache."""
    cache = _FakeCache()
    monkeypatch.setattr(dg, "cached_json", cache.cached_json)
    gw = DataGateway()
    calls = 0

    async def fake_uncached(cleaned: str, *, limit: int):
        nonlocal calls
        calls += 1
        return []

    monkeypatch.setattr(gw, "_search_uncached", fake_uncached)
    await gw.search("ACME rien")
    await gw.search("ACME rien")
    assert calls == 2


async def test_the_cache_never_breaks_the_search(monkeypatch: pytest.MonkeyPatch) -> None:
    """Un cache indisponible dégrade en appel live, jamais en échec de la
    recherche — même garantie que brave_search.py."""

    async def _boom(*_a, **_k):
        raise RuntimeError("cache down")

    monkeypatch.setattr(dg, "cached_json", _boom)
    gw = DataGateway()
    hits = [{"title": "t", "url": "https://x.fr", "description": "d", "source": "serper"}]
    monkeypatch.setattr(gw, "_search_uncached", AsyncMock(return_value=hits))

    assert await gw.search("ACME") == hits


# ── Preuve n°1 (LIT) + n°2 (SAIT DIRE NON) : parité statique avec Brave ─────


def _search_is_wired_to_the_shared_cache(source_text: str) -> bool:
    """Vrai quand le point d'entrée public du waterfall route par le cache
    partagé — la parité avec le correctif déjà livré pour brave_search.py."""
    return "cached_json(" in source_text and "provider_cache" in source_text


def test_GA_302_the_parity_check_says_no_on_the_pre_fix_source() -> None:
    """Sait dire NON : le texte source D'AVANT ce lot (zéro occurrence de
    cached_json / provider_cache, décrit par le lot comme le défaut à
    corriger) doit être détecté comme NON câblé — sinon la garde serait verte
    qu'il y ait un cache ou pas."""
    pre_fix_source = (
        "async def search(self, query, *, limit=10):\n"
        "    for name, env in _WATERFALL:\n"
        "        hits = await callables[name](query, limit=limit)\n"
        "        if hits:\n"
        "            return hits\n"
        "    return []\n"
    )
    assert _search_is_wired_to_the_shared_cache(pre_fix_source) is False


def test_GA_302_data_gateway_search_is_wired_to_the_shared_cache() -> None:
    """LIT le vrai fichier sur disque : data_gateway.py doit désormais
    appeler le même cache que son jumeau brave_search.py."""
    assert _DATA_GATEWAY_FILE.is_file(), _DATA_GATEWAY_FILE
    text = _DATA_GATEWAY_FILE.read_text(encoding="utf-8")
    assert _search_is_wired_to_the_shared_cache(text) is True, (
        "GA-302 : data_gateway.py n'appelle toujours pas provider_cache.cached_json — "
        "le waterfall reste le jumeau non caché de brave_search.py"
    )


# ── Le registre des namespaces (hit/miss visibles) ───────────────────────────


def test_GA_302_namespace_registry_corpus_is_not_empty() -> None:
    """Preuve que la garde LIT un vrai corpus, pas un dict vide qui la
    rendrait verte pour toujours."""
    assert len(source_cache._NAMESPACES) >= 15, (
        f"registre des namespaces anormalement maigre ({len(source_cache._NAMESPACES)}) — "
        "la garde ne lirait presque rien"
    )


def test_GA_302_search_gateway_namespace_is_registered() -> None:
    """Le nouveau namespace doit être déclaré dans _NAMESPACES, sinon les
    compteurs de hit/miss du run ne le voient JAMAIS (le cache existe mais
    n'est mesurable par personne)."""
    assert _SEARCH_NAMESPACE in source_cache._NAMESPACES, (
        f"'{_SEARCH_NAMESPACE}' absent de source_cache._NAMESPACES — un cache posé mais qu'on ne peut pas mesurer"
    )
    source, category = source_cache.split_namespace(_SEARCH_NAMESPACE)
    assert source == "data_gateway"
    assert category  # jamais une catégorie vide pour un namespace déclaré


def test_GA_302_an_unregistered_namespace_falls_into_the_generic_bucket() -> None:
    """Sait dire NON : montre ce qui arrive à un namespace NON déclaré —
    retombée verbatim dans le seau générique (source=namespace, category
    vide), invisible dans les métriques regroupées par source. C'est
    précisément ce que l'enregistrement de ``_SEARCH_NAMESPACE`` évite."""
    assert source_cache.split_namespace("search:gateway:unregistered-demo") == (
        "search:gateway:unregistered-demo",
        "",
    )
