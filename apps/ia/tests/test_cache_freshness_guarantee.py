"""Garde inter-service (A) : le cache RÉSULTAT (dossier complet, Postgres,
``accounts.service.ts``) doit toujours être plus vieux que le cache PROVIDER
le plus long (``TTL_FIRMO``, ``provider_cache.py``) — sinon une relance forcée
peut resservir une donnée provider aussi vieille que le dossier qu'on vient de
déclarer périmé. Garantie n°2 d'``agent_docs/caching.md`` §6 : « le cache
résultat est toujours plus vieux que les caches provider ».

Avec les deux valeurs ÉGALES (30 j / 30 j), la garantie est fausse au bord :
une entrée pile à 30 j satisfait l'un et viole l'autre. La garde impose une
MARGE EXPLICITE plutôt qu'une simple inégalité stricte à 1 jour, qui se
laisserait recasser par le prochain arrondi de l'un ou l'autre côté sans
qu'aucun test ne le remarque avant le bord suivant.

Les deux constantes vivent dans deux langages qui ne s'importent pas l'un
l'autre (TypeScript ↔ Python) — ce test importe ``TTL_FIRMO`` normalement
(même langage) mais LIT ``accounts.service.ts`` comme un fichier texte et en
extrait ``CACHE_MAX_AGE_DAYS`` par regex, plutôt que de deviner sa valeur.
"""

from __future__ import annotations

import pathlib
import re

from app.services.provider_cache import TTL_FIRMO

# apps/ia/tests/<this file> -> parents[1] == apps/ia -> parents[2] == apps -> parents[3] == racine du dépôt.
_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
ACCOUNTS_SERVICE = (
    _REPO_ROOT / "apps" / "api" / "src" / "modules" / "accounts" / "accounts.service.ts"
)

_CONST_RE = re.compile(r"const\s+CACHE_MAX_AGE_DAYS\s*=\s*(\d+)")

# Marge explicite retenue : au moins un cycle hebdomadaire (le tier de
# volatilité juste en dessous de firmo dans provider_cache.py, TTL_SIGNALS)
# au-dessus du cache provider le plus long. Une relance forcée re-scrape alors
# TOUJOURS une donnée provider dont le cache a expiré depuis au moins une
# semaine — jamais une donnée aussi fraîche (ou aussi vieille) que le dossier
# qu'on vient de déclarer périmé.
MIN_MARGIN_DAYS = 7


def _cache_max_age_days() -> int:
    text = ACCOUNTS_SERVICE.read_text(encoding="utf-8")
    match = _CONST_RE.search(text)
    assert match, (
        "CACHE_MAX_AGE_DAYS introuvable dans accounts.service.ts — "
        "la garde ne LIT rien, elle devinerait"
    )
    return int(match.group(1))


def test_the_guard_actually_reads_both_constants() -> None:
    """Preuve que la garde LIT quelque chose, pas un corpus vide : le fichier
    TypeScript existe, la regex matche une vraie valeur, et TTL_FIRMO n'est
    pas resté à un défaut nul par accident de configuration de test."""
    assert ACCOUNTS_SERVICE.is_file(), ACCOUNTS_SERVICE
    assert _cache_max_age_days() > 0
    assert TTL_FIRMO > 0


def test_result_cache_outlives_the_longest_provider_cache_with_margin() -> None:
    """Le cache résultat (accounts.service.ts) doit dépasser le cache provider
    le plus long (TTL_FIRMO, provider_cache.py) d'au moins ``MIN_MARGIN_DAYS``
    — sinon une relance forcée peut resservir un firmo aussi vieux que le
    dossier qu'on vient de déclarer périmé (agent_docs/caching.md §6.2)."""
    ttl_firmo_days = TTL_FIRMO // 86400
    cache_max_age_days = _cache_max_age_days()
    margin = cache_max_age_days - ttl_firmo_days
    assert margin >= MIN_MARGIN_DAYS, (
        f"CACHE_MAX_AGE_DAYS ({cache_max_age_days} j, accounts.service.ts) doit "
        f"dépasser TTL_FIRMO ({ttl_firmo_days} j, provider_cache.py) d'au moins "
        f"{MIN_MARGIN_DAYS} j — marge actuelle : {margin} j. Sinon la garantie "
        "« le cache résultat est toujours plus vieux que le cache provider » "
        "est fausse au bord."
    )
