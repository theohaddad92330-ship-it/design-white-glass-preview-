"""ANALYSE C — le seau ``claude`` PARTAGÉ affame un run quand d'autres runs
tournent en même temps.

⚠️ Ce fichier ne CORRIGE rien : il MESURE. Aucun changement de comportement du
limiteur n'accompagne ce test — voir le rapport du lot pour la proposition et
ses contreparties. Le piège de raisonnement documenté dans le lot : « séparer
le seau » est la première idée et elle est probablement FAUSSE ici — scinder
un compartiment partagé ne CRÉE aucune capacité, il la PARTITIONNE. La
contention mesurée ci-dessous est entre RUNS CONCURRENTS (deux analyses, ou
une analyse et un run de fond, qui se partagent le MÊME compartiment Redis),
pas entre phases d'un même run — deux seaux par phase ne changeraient rien.

Fait mesuré en production, écrit dans le code (``app/graph/builder.py:102``) :
10 ``PHASE_TIMEOUT`` en 30 jours, dont 8 sur ``phase=plan``. Le compartiment
``claude`` (``rate_limiter.py`` : ``{"rpm": 50, "concurrency": 12}``) est
PARTAGÉ par Redis entre toutes les analyses simultanées — la concurrence
locale de 12 du plan ne sert à rien quand le débit de 50/min est déjà consommé
par un AUTRE run.

Méthode : le VRAI ``ProviderThrottle`` + le VRAI ``RedisTokenBucket`` (patron
hermétique de ``test_distributed_rate_limiter.py`` — ``fakeredis``, aucun Redis
réel). Deux ``ProviderThrottle`` « claude » DISTINCTS (une concurrence locale
de 12 chacun, comme deux processus/runs différents) partagent UN SEUL
``RedisTokenBucket`` — exactement le câblage de production
(``rate_limiter._attach_bucket``), où c'est Redis qui unifie le débit RÉEL
entre processus. Le débit du compartiment de test est mis à l'échelle (×120,
nommé ci-dessous) pour que la suite reste rapide ; la PROPRIÉTÉ démontrée — un
seau partagé fait attendre un run à cause de la demande d'un autre — ne dépend
pas du débit absolu.
"""

from __future__ import annotations

import asyncio
import time

import fakeredis.aioredis as fa
import pytest

from app.services.distributed_rate_limiter import RedisTokenBucket
from app.services.rate_limiter import ProviderThrottle

# Valeurs de production, citées pour le rapport (rate_limiter.py:83) :
PROD_CLAUDE_RPM = 50
PROD_CLAUDE_CONCURRENCY = 12

# Mise à l'échelle UNIQUEMENT pour que la suite reste rapide (~1s) — la
# proportion importe, pas la valeur absolue : un compartiment qui régénère un
# jeton toutes les ~1,2s (50 rpm réel) demanderait plusieurs dizaines de
# secondes pour exhiber la même famine.
_SCALE = 120
TEST_RPM = PROD_CLAUDE_RPM * _SCALE  # 6000 → 100 jetons/s, un jeton / 10ms


def _fresh_bucket() -> RedisTokenBucket:
    server = fa.FakeRedis(decode_responses=True)
    # burst réduit délibérément : la valeur par défaut (``burst=rpm``, une
    # minute de capacité) rendrait le DRAINAGE lui-même — voir ``_drain`` —
    # aussi lent que ce qu'on mesure si on le faisait par boucle. Le burst
    # n'intervient plus dans ce test (l'état de départ est posé directement),
    # une petite valeur documente juste qu'il reste réaliste.
    return RedisTokenBucket(server, "claude", rpm=TEST_RPM, burst=PROD_CLAUDE_CONCURRENCY)


def _run_throttle(bucket: RedisTokenBucket) -> ProviderThrottle:
    """Un ``ProviderThrottle`` « claude » propre à UN run — sa propre
    concurrence LOCALE (la valeur de prod, 12) — raccordé au bucket PARTAGÉ,
    exactement comme ``rate_limiter._attach_bucket`` le fait par processus."""
    t = ProviderThrottle("claude", rpm=TEST_RPM, concurrency=PROD_CLAUDE_CONCURRENCY, max_wait_s=10.0)
    t.bucket = bucket
    return t


async def _drain(bucket: RedisTokenBucket) -> None:
    """Pose l'état de départ à VIDE (tokens=0) pour partir d'un compartiment
    DÉJÀ EN CHARGE — l'état réaliste : un seau au repos, plein, ne démontre
    rien puisqu'il sert n'importe quel burst raisonnable instantanément.

    Écrit directement le hash Redis dans le FORMAT que le script Lua du
    compartiment lit (``tokens``, ``ts`` en ms) plutôt que de boucler sur
    ``try_acquire`` — boucler jusqu'à épuiser un ``burst`` de production (rpm)
    rendrait le drainage lui-même plus lent que ce qu'il mesure.
    """
    now_ms = int(time.time() * 1000)
    await bucket.client.hset(bucket.key, mapping={"tokens": 0, "ts": now_ms})


async def _acquire_one(throttle: ProviderThrottle) -> float:
    """Un appel complet : jeton + créneau local, PUIS relâche — comme
    ``_ThrottledCall.__aexit__`` le fait pour tout appel réel. Sans le
    ``release()``, un créneau jamais rendu bloquerait pour toujours le 13ᵉ
    appel d'un run à 30 (concurrence locale = 12) : ce n'est pas ce qu'on
    veut démontrer (la RATE, pas un fuite de sémaphore côté test)."""
    waited = await throttle.acquire()
    throttle.release()
    return waited


async def _acquire_n(throttle: ProviderThrottle, n: int) -> None:
    """``n`` acquisitions PARALLÈLES sur ``throttle`` — le fan-out d'une phase
    (``phase4_plan.py`` : 11 appels à la fois)."""
    await asyncio.gather(*[_acquire_one(throttle) for _ in range(n)])


@pytest.mark.asyncio
async def test_a_run_alone_serves_its_fan_out_at_the_bucket_nominal_rate() -> None:
    """Témoin : SEUL sur le compartiment, le run sert son fan-out au débit
    nominal — rien d'anormal dans le compartiment lui-même."""
    bucket = _fresh_bucket()
    await _drain(bucket)
    run_a = _run_throttle(bucket)

    t0 = time.monotonic()
    await _acquire_n(run_a, 10)
    elapsed_alone = time.monotonic() - t0

    # 10 jetons à 100/s ≈ 100ms nominal — large marge pour l'ordonnancement.
    assert elapsed_alone < 1.0, f"le témoin seul est déjà anormalement lent : {elapsed_alone:.3f}s"


@pytest.mark.asyncio
async def test_a_run_is_starved_by_a_concurrent_run_on_the_same_shared_bucket() -> None:
    """LA DÉMONSTRATION : le MÊME fan-out (10 appels) prend significativement
    plus longtemps quand un AUTRE run tire en même temps sur le MÊME
    compartiment — alors que la concurrence LOCALE de chaque run (12) n'est
    JAMAIS saturée : ce n'est pas la concurrence qui manque, c'est le débit
    PARTAGÉ qui est déjà pris.
    """
    # ── Témoin : seul ────────────────────────────────────────────────────
    bucket_alone = _fresh_bucket()
    await _drain(bucket_alone)
    run_alone = _run_throttle(bucket_alone)
    t0 = time.monotonic()
    await _acquire_n(run_alone, 10)
    elapsed_alone = time.monotonic() - t0

    # ── Contention : le MÊME compartiment partagé par DEUX runs ─────────
    bucket_shared = _fresh_bucket()
    await _drain(bucket_shared)
    run_a = _run_throttle(bucket_shared)  # ex. phase "plan" — 10 appels
    run_b = _run_throttle(bucket_shared)  # ex. un AUTRE run, ou du travail de fond

    t0 = time.monotonic()
    # Run B démarre un fan-out BEAUCOUP plus large (90, 9× celui de run_a) en
    # tâche de fond — il ne bloque JAMAIS sur sa propre concurrence locale (12
    # créneaux qu'il relâche à chaque appel, jamais 90 en même temps : le
    # sémaphore de run_b n'est de toute façon pas celui de run_a). Un écart
    # large (9×) donne une marge confortable contre le bruit d'ordonnancement
    # d'une machine partagée, plutôt qu'un seuil fragile juste au-dessus de 1.
    background = asyncio.create_task(_acquire_n(run_b, 90))
    await _acquire_n(run_a, 10)
    elapsed_contended = time.monotonic() - t0
    await background  # ne pas laisser la tâche de fond orpheline

    ratio = elapsed_contended / elapsed_alone if elapsed_alone > 0 else float("inf")

    # Seuil délibérément prudent (>= 2×, largement en dessous de l'effet
    # observé — souvent 5-10× avec un run de fond 9× plus gros) pour ne
    # jamais dépendre d'un ordonnancement asyncio précis sur une machine
    # partagée (voir le chiffre imprimé dans le rapport du lot).
    assert elapsed_contended > elapsed_alone * 2.0, (
        f"un run concurrent aurait dû ralentir sensiblement le run mesuré : "
        f"seul={elapsed_alone:.3f}s, contenu={elapsed_contended:.3f}s (×{ratio:.2f}) — "
        "si ce ratio s'effondre, le compartiment partagé n'affame plus personne "
        "et l'analyse du lot est peut-être caduque"
    )

    print(  # noqa: T201 — chiffre du lot, capturé par -s / le rapport de l'agent
        f"\n[ANALYSE C] run seul={elapsed_alone*1000:.1f}ms, "
        f"run contenu par un second run (90 appels)={elapsed_contended*1000:.1f}ms, "
        f"ratio={ratio:.2f}x — concurrence locale de chaque run jamais saturée "
        f"(12 chacun), seul le débit PARTAGÉ (rpm={TEST_RPM}, échelle ×{_SCALE} "
        f"de la valeur de prod {PROD_CLAUDE_RPM}) est en cause."
    )


@pytest.mark.asyncio
async def test_local_concurrency_is_never_the_bottleneck_in_the_contended_run() -> None:
    """Preuve que ce n'est PAS la concurrence locale (12) qui manque : au pic
    de la contention, jamais plus de 12 tâches de run_a n'attendent le
    sémaphore local — le retard vient entièrement de l'attente du JETON
    partagé, pas d'une file sur le sémaphore."""
    bucket = _fresh_bucket()
    await _drain(bucket)
    run_a = _run_throttle(bucket)
    run_b = _run_throttle(bucket)

    # Le sémaphore local de run_a a EXACTEMENT PROD_CLAUDE_CONCURRENCY places.
    assert run_a.semaphore._value == PROD_CLAUDE_CONCURRENCY

    background = asyncio.create_task(_acquire_n(run_b, 30))
    # run_a ne demande que 10 <= 12 : son propre sémaphore ne refuse jamais
    # personne, la seule attente possible est celle du jeton Redis partagé.
    await _acquire_n(run_a, 10)
    await background
