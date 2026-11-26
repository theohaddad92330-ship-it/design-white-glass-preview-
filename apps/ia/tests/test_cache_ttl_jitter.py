"""CORRECTIF A — aucun TTL de cache n'est bruité : les expirations se
synchronisent.

Huit constantes de durée de vie (``provider_cache.py`` : ``TTL_FIRMO`` /
``SIGNALS`` / ``TECH`` / ``NEWS`` / ``JOBS`` / ``SEARCH`` / ``REGISTRY_SEARCH``,
``scrape_cache.py`` : ``_TTL_SECONDS``) sont toutes des durées FIXES. Quand un
lot écrit N entrées dans la même fenêtre — le dépôt documente lui-même ce
scénario (``rate_limiter.py`` : « ``/discover/signals`` resolves up to 120
names ») — ces N entrées expirent GROUPÉES, provoquant un pic de re-collecte
aligné sur le TTL plutôt que sur le trafic réel.

Le correctif : un bruit appliqué à l'ÉCRITURE (``source_cache.jittered_ttl``),
jamais à la lecture (qui doit rester déterministe pour le compte hit/miss).

Ces tests prouvent la PROPRIÉTÉ, jamais une valeur tirée :
1. la fenêtre bornée autour du nominal tient pour N'IMPORTE QUEL tirage réel
   (``test_ttl_jitter_stays_within_the_nominal_window``) — ce n'est pas une
   histoire de chance, c'est une garantie de construction (``uniform(0.9,
   1.1)`` ne PEUT PAS sortir de la fenêtre) ;
2. deux tirages successifs ne produisent pas la même durée — prouvé avec une
   source aléatoire ENTIÈREMENT contrôlée (mock de ``random.uniform``), donc
   sans dépendre du hasard pour PASSER
   (``test_ttl_jitter_uses_a_bounded_uniform_spread_deterministic``) ;
3. l'intégration réelle : des écritures successives dans ``provider_cache`` /
   ``scrape_cache`` ne posent pas toutes le même ``ex=`` sur Redis (le
   symptôme concret de l'expiration groupée).

``test_cache_ttl_doc_matches_code.py`` doit rester verte après ce lot : le
bruit s'applique à l'ÉCRITURE réelle, jamais aux constantes ``TTL_*`` /
``os.getenv(...)`` nominales que ce test-là compare à
``agent_docs/source-cache.md`` — la doc décrit la durée NOMINALE, pas la durée
bruitée effectivement écrite.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.services import provider_cache, scrape_cache, source_cache

# ── Propriété 1 : fenêtre bornée, vraie pour n'importe quel tirage ───────────


def test_ttl_jitter_stays_within_the_nominal_window() -> None:
    """Quel que soit le tirage RÉEL de ``random.uniform(0.9, 1.1)`` (pas de
    mock ici), le résultat reste dans la fenêtre bornée autour du nominal —
    c'est une garantie de construction (``uniform`` ne peut pas déborder de ses
    bornes), donc ce test ne dépend pas d'un coup de chance pour passer."""
    nominal = 30 * 24 * 3600  # TTL_FIRMO
    lo, hi = round(nominal * 0.9), round(nominal * 1.1)
    seen: set[int] = set()
    for _ in range(500):
        ttl = source_cache.jittered_ttl(nominal)
        assert lo <= ttl <= hi, f"TTL bruité {ttl} hors fenêtre [{lo}, {hi}]"
        seen.add(ttl)
    # Un bruit qui renvoie toujours la même valeur n'est pas un bruit — sur 500
    # tirages continus dans une fenêtre de ~518 400 entiers, en voir plus d'un
    # seul est garanti pour toute implémentation qui bruite réellement.
    assert len(seen) > 1, "jittered_ttl semble renvoyer une constante déguisée"


def test_ttl_jitter_never_reaches_zero_or_negative_for_a_small_ttl() -> None:
    """Un TTL nominal minuscule ne doit jamais produire un TTL bruité <= 0 —
    un TTL nul/négatif désactiverait silencieusement l'expiration."""
    for _ in range(200):
        assert source_cache.jittered_ttl(1) >= 1


def test_ttl_jitter_of_zero_or_negative_ttl_is_left_untouched() -> None:
    """Un TTL nul ou déjà invalide (chemin d'erreur amont) ne doit pas être
    « bruité » vers une valeur positive fantaisiste."""
    assert source_cache.jittered_ttl(0) == 0
    assert source_cache.jittered_ttl(-5) == -5


# ── Propriété 2 : deux tirages successifs diffèrent — preuve déterministe ────


def test_ttl_jitter_uses_a_bounded_uniform_spread_deterministic(monkeypatch: pytest.MonkeyPatch) -> None:
    """Preuve qui ne dépend PAS du hasard pour passer : on contrôle
    entièrement la source aléatoire (trois facteurs distincts) et on vérifie
    que ``jittered_ttl`` les applique bien — trois écritures successives avec
    des facteurs différents ne produisent PAS la même durée de vie."""
    factors = iter([0.9, 1.1, 1.0])
    monkeypatch.setattr(source_cache.random, "uniform", lambda _lo, _hi: next(factors))

    nominal = 1000
    first = source_cache.jittered_ttl(nominal)
    second = source_cache.jittered_ttl(nominal)
    third = source_cache.jittered_ttl(nominal)

    assert (first, second, third) == (900, 1100, 1000)
    assert len({first, second, third}) == 3, "des facteurs différents doivent produire des durées différentes"


def test_ttl_jitter_calls_uniform_with_the_bounded_spread(monkeypatch: pytest.MonkeyPatch) -> None:
    """La fenêtre passée à ``random.uniform`` est bien ``[0.9, 1.1]`` (±10 %) —
    pas une fenêtre plus large qui romprait la marge avec le cache résultat
    (``test_cache_freshness_guarantee.py`` : marge de 7 j entre TTL_FIRMO et
    CACHE_MAX_AGE_DAYS, 30 j nominal / 37 j — un bruit à ±10 % culmine à 33 j,
    toujours sous la marge)."""
    seen_bounds: list[tuple[float, float]] = []
    real_uniform = source_cache.random.uniform

    def _spy(lo: float, hi: float) -> float:
        seen_bounds.append((lo, hi))
        return real_uniform(lo, hi)

    monkeypatch.setattr(source_cache.random, "uniform", _spy)
    source_cache.jittered_ttl(1000)
    assert seen_bounds == [(0.9, 1.1)]


# ── Intégration : écritures successives sur provider_cache / scrape_cache ───


class _CountingFakeRedis:
    def __init__(self) -> None:
        self.exs: list[int] = []

    async def get(self, key: str):
        return None

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        self.exs.append(ex or 0)


async def test_provider_cache_writes_are_not_all_the_same_ttl(monkeypatch: pytest.MonkeyPatch) -> None:
    """Le symptôme concret de l'expiration groupée : 20 écritures successives
    (namespace, clé) distinctes, même TTL nominal, ne doivent PAS toutes poser
    le même ``ex=`` sur Redis."""
    fake = _CountingFakeRedis()
    monkeypatch.setattr(provider_cache, "_redis", AsyncMock(return_value=fake))
    monkeypatch.setattr(source_cache, "put", AsyncMock())  # isole Redis du tier Postgres

    for i in range(20):
        await provider_cache.set_json("ns", f"k{i}", {"v": i}, ttl=1000)

    assert len(fake.exs) == 20
    assert len(set(fake.exs)) > 1, "toutes les écritures ont le même ex= — aucun bruit appliqué"
    assert all(900 <= ex <= 1100 for ex in fake.exs)


async def test_scrape_cache_writes_are_not_all_the_same_ttl(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = _CountingFakeRedis()
    monkeypatch.setattr(scrape_cache, "_redis", AsyncMock(return_value=fake))
    monkeypatch.setattr(source_cache, "put", AsyncMock())

    for i in range(20):
        await scrape_cache.set_markdown(f"https://x.fr/{i}", f"# contenu {i}")

    assert len(fake.exs) == 20
    assert len(set(fake.exs)) > 1, "toutes les écritures ont le même ex= — aucun bruit appliqué"
    nominal = scrape_cache._TTL_SECONDS
    lo, hi = round(nominal * 0.9), round(nominal * 1.1)
    assert all(lo <= ex <= hi for ex in fake.exs)
