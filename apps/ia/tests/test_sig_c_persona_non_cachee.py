"""SIG-C (11/10) C5 — la recherche persona Brave NE SE CACHE PAS.

« Qui occupe ce poste chez <compte> » rend des NOMS de personnes : la cacher
globalement (sans utilisateur dans la clé, partagé entre espaces) serait un
stockage de données personnelles que l'arbitrage RGPD n'a pas tranché (même
règle que le People-Match Apollo, Redis seul, et que la liste de personnes
Apollo, non cachée). Cette garde rougit le jour où quelqu'un la branche sur
``provider_cache`` « pour économiser des requêtes ».
"""

from __future__ import annotations

import ast
import inspect
import textwrap
from unittest.mock import AsyncMock, patch

import httpx

from app.routers import phase2_contacts
from app.services import provider_cache

_CACHE_NAMES = {"provider_cache", "cached_json", "cached_by", "set_json", "get_json", "scrape_cache", "source_cache"}


def _cache_references(fn_source: str) -> set[str]:
    tree = ast.parse(textwrap.dedent(fn_source))
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and node.id in _CACHE_NAMES:
            found.add(node.id)
        elif isinstance(node, ast.Attribute) and node.attr in _CACHE_NAMES:
            found.add(node.attr)
    return found


def test_la_garde_sait_dire_non() -> None:
    cached = """
async def f(client, company, persona):
    return await provider_cache.cached_json("search:persona", company + persona, lambda: g(client))
"""
    assert _cache_references(cached) == {"provider_cache", "cached_json"}
    assert _cache_references("async def f():\n    return []\n") == set()


def test_la_recherche_persona_ne_reference_aucun_cache() -> None:
    fn = phase2_contacts._persona_query
    assert not hasattr(fn, "__wrapped__"), "la recherche persona est décorée (cache ?)"
    assert provider_cache.empty_ttl_of(fn) is None
    assert _cache_references(inspect.getsource(fn)) == set()


async def test_deux_appels_identiques_font_deux_requetes_et_n_ecrivent_rien(monkeypatch) -> None:
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    store: dict[str, str] = {}

    class FakeRedis:
        async def get(self, key: str):
            return store.get(key)

        async def set(self, key: str, value: str, ex: int | None = None):
            store[key] = value

    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(
        return_value=httpx.Response(
            200,
            json={"web": {"results": [{"title": "Jeanne Exemple — DSI", "url": "https://x", "description": ""}]}},
            request=httpx.Request("GET", "https://api.search.brave.com"),
        )
    )
    put = AsyncMock()
    with (
        patch.object(provider_cache, "_redis", AsyncMock(return_value=FakeRedis())),
        patch.object(provider_cache.source_cache, "put", put),
    ):
        await phase2_contacts._persona_query(client, "Sigc SA", "DSI")
        await phase2_contacts._persona_query(client, "Sigc SA", "DSI")
    assert client.get.await_count == 2
    assert store == {}
    put.assert_not_called()
