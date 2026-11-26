"""GA-300 — recul exponentiel SANS bruit aléatoire (``retry.py``).

``retry_with_backoff`` calculait ``delay = min(base_delay * 2**attempt,
max_delay)`` — zéro terme aléatoire. Seul appelant de production :
``brave_search.py`` (3 tentatives, délais nominaux 1 s / 2 s déterministes
entre elles). Or la phase 1 tire jusqu'à 29 requêtes Brave (21 statiques + 8
pilotées par le profil, ``brave_search.py:200-204``) : en cas de 429 groupés,
les 29 retentent toutes AUX MÊMES INSTANTS, sans étalement — un pic qui
retombe exactement quand le fournisseur demande de respirer.

Preuve exigée par le lot : le test ne doit PAS dépendre du hasard pour passer.
On prouve la PROPRIÉTÉ — deux séquences de délais indépendantes ne sont pas
identiques, et chaque délai individuel reste dans une fenêtre BORNÉE autour de
sa valeur nominale — jamais une valeur tirée précise.
"""

from __future__ import annotations

import asyncio

import pytest
from unittest.mock import AsyncMock

from app.services.retry import jittered_delay, retry_with_backoff


# ── La primitive de bruit, isolée : bornée dans les deux sens ────────────────


def test_jitter_stays_within_a_bounded_window_around_nominal() -> None:
    nominal = 4.0
    for _ in range(1000):
        delay = jittered_delay(nominal, jitter_ratio=0.25, max_delay=30.0)
        assert 3.0 <= delay <= 5.0, f"delay {delay} hors de la fenêtre [3.0, 5.0]"


def test_jitter_is_actually_random_not_a_constant() -> None:
    """Sans ça, une fenêtre 'bornée' qui rend toujours le même point ne
    prouverait rien : la garde doit voir au moins deux valeurs distinctes."""
    values = {round(jittered_delay(4.0, jitter_ratio=0.25, max_delay=30.0), 6) for _ in range(200)}
    assert len(values) > 1, "200 tirages ne rendent qu'une seule valeur — pas de bruit"


def test_jitter_never_exceeds_max_delay() -> None:
    # nominal déjà au plafond : l'étalement +25% doit être ÉCRÊTÉ, pas produire
    # un délai supérieur à max_delay.
    for _ in range(500):
        delay = jittered_delay(30.0, jitter_ratio=0.25, max_delay=30.0)
        assert delay <= 30.0


def test_jitter_never_goes_negative() -> None:
    for _ in range(500):
        delay = jittered_delay(0.1, jitter_ratio=0.25, max_delay=30.0)
        assert delay >= 0.0


def test_zero_jitter_ratio_is_deterministic() -> None:
    """Le témoin : demander explicitement AUCUN bruit doit rendre exactement
    le nominal — la garde ne doit pas imposer du bruit à un appelant qui n'en
    veut pas."""
    for _ in range(20):
        assert jittered_delay(4.0, jitter_ratio=0.0, max_delay=30.0) == 4.0


# ── La propriété observable depuis retry_with_backoff, sans dépendre du hasard
# pour PASSER : deux séquences indépendantes diffèrent, chaque délai reste
# proche de son nominal. ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_two_independent_retry_runs_do_not_sleep_identical_sequences(monkeypatch) -> None:
    recorded: list[list[float]] = []

    for _ in range(2):
        delays: list[float] = []

        async def fake_sleep(d: float) -> None:
            delays.append(d)

        monkeypatch.setattr(asyncio, "sleep", fake_sleep)
        fn = AsyncMock(side_effect=[Exception("boom"), Exception("boom"), Exception("boom")])
        with pytest.raises(Exception, match="boom"):
            await retry_with_backoff(fn, max_retries=3, base_delay=1.0)
        recorded.append(delays)

    assert recorded[0] != recorded[1], (
        "deux séquences de délais IDENTIQUES : le recul est resté déterministe — "
        "N appelants concurrents (jusqu'à 29 sur Brave, phase 1) retentent tous "
        "au même instant, exactement le pic mesuré/documenté sur le fournisseur"
    )
    # max_retries=3 ⇒ deux tentatives ratées suivies d'un délai (attempt 0 et 1),
    # la troisième lève. Chaque délai reste dans sa fenêtre bornée autour du
    # nominal (1.0 puis 2.0) — jamais une valeur exacte imposée.
    for delays in recorded:
        assert len(delays) == 2
        assert 0.75 <= delays[0] <= 1.25, delays
        assert 1.5 <= delays[1] <= 2.5, delays


@pytest.mark.asyncio
async def test_retry_still_succeeds_and_stops_sleeping_once_the_call_works(monkeypatch) -> None:
    """Le bruit ne doit rien changer au CONTRAT existant : succès au 3e essai,
    exactement 2 attentes, valeur de retour inchangée."""
    delays: list[float] = []

    async def fake_sleep(d: float) -> None:
        delays.append(d)

    monkeypatch.setattr(asyncio, "sleep", fake_sleep)
    fn = AsyncMock(side_effect=[Exception("fail"), Exception("fail"), "ok"])
    result = await retry_with_backoff(fn, max_retries=3, base_delay=0.01)
    assert result == "ok"
    assert fn.call_count == 3
    assert len(delays) == 2
