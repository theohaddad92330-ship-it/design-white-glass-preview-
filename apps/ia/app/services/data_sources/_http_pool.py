"""#2604.2 — fabrique de client HTTP partagé, UNE fois PAR SOURCE plutôt qu'à
chaque appel (même défaut, même correctif que #2604.1 : `bodacc.py`,
`public_tenders.py`).

Factorisée ICI (GA-26 : un réglage vit à un seul endroit) — passé le
troisième fichier `data_sources/*.py` à avoir besoin du même patron
``client or httpx.AsyncClient(...)`` construit inline (mesuré : 2 à 79 ms de
travail SYNCHRONE avant le premier `await`, cf.
`tests/perf/mesure_2604_2_client_construction.py`), dupliquer les six lignes
``_shared_client`` / ``_get_shared_client()`` par fichier devenait
précisément le réglage-à-plusieurs-endroits que GA-26 interdit.

Un client par CLÉ (généralement le nom du module appelant), jamais refermé :
sa durée de vie est celle du PROCESS, comme documenté par #2604.1 — un
appelant qui fournit son propre ``client=`` garde la main dessus (fermeture
comprise), cette fabrique ne s'applique qu'à défaut.
"""

from __future__ import annotations

import httpx

_clients: dict[str, httpx.AsyncClient] = {}


def get_shared_client(key: str, **kwargs: object) -> httpx.AsyncClient:
    """Client HTTP réutilisé, construit UNE seule fois pour ``key``.

    Ne JAMAIS fermer ce client entre deux appels — sa durée de vie est celle
    du process (#2604.1). ``kwargs`` (``timeout``, ``follow_redirects``…)
    n'est lu qu'à la toute première construction ; les appels suivants pour
    la même ``key`` rendent le client déjà construit, quels que soient les
    ``kwargs`` passés."""
    client = _clients.get(key)
    if client is None:
        client = httpx.AsyncClient(**kwargs)
        _clients[key] = client
    return client
