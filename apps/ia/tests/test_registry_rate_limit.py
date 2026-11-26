"""Un « 429 Too Many Requests » n'est pas un verdict sur une société.

Mesuré en production le 23/08/2026. Le remplissage du référentiel ESN recevait
des 429 en rafale du registre. Chaque 429 devenait `[]`, donc « aucune entité du
registre français ne correspond à ce nom », donc une ligne marquée
DÉFINITIVEMENT non résolue — et jamais retentée. Une limite de débit s'inscrivait
comme un fait sur une société qui existe, et la couverture annoncée du
référentiel mentait.
"""

from __future__ import annotations

import time

import pytest

from app.services import rate_limiter
from app.services.data_sources import recherche_entreprises as re_src
from app.services.data_sources.signal_errors import SignalSourceUnavailable


class _Resp:
    def __init__(self, status: int, headers: dict | None = None):
        self.status_code = status
        self.headers = headers or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return {"results": []}


class _Client:
    def __init__(self, resp: _Resp):
        self._resp = resp
        self.calls = 0

    async def get(self, _url, params=None):
        self.calls += 1
        return self._resp


@pytest.fixture(autouse=True)
def _clean_throttles():
    rate_limiter._reset_cache_for_tests()
    yield
    rate_limiter._reset_cache_for_tests()


@pytest.mark.asyncio
async def test_a_rate_limit_is_not_an_answer_in_strict_mode():
    # L'appelant qui va ÉCRIRE un verdict doit voir l'échec.
    with pytest.raises(SignalSourceUnavailable):
        await re_src.search_companies("SOPRA", client=_Client(_Resp(429)), strict=True)


@pytest.mark.asyncio
async def test_the_analysis_path_still_never_breaks():
    # Le défaut reste souple : une source gratuite ne fait jamais tomber une
    # recherche. C'est le contrat historique, et il ne bouge pas.
    out = await re_src.search_companies("SOPRA", client=_Client(_Resp(429)))
    assert out == []


@pytest.mark.asyncio
async def test_a_429_silences_the_shared_bucket():
    # Sans refroidissement, le reste du lot part quand même et récolte le même
    # refus — c'est exactement ce qu'on a mesuré, des 429 groupés à la seconde.
    await re_src.search_companies("SOPRA", client=_Client(_Resp(429)))
    throttle = rate_limiter.get_throttle("recherche_entreprises")
    assert throttle._cooldown_until > time.monotonic()


@pytest.mark.asyncio
async def test_it_obeys_retry_after_when_the_registry_gives_one():
    await re_src.search_companies("SOPRA", client=_Client(_Resp(429, {"retry-after": "120"})))
    throttle = rate_limiter.get_throttle("recherche_entreprises")
    assert throttle._cooldown_until - time.monotonic() > 100


@pytest.mark.asyncio
async def test_a_retry_after_date_falls_back_instead_of_waiting_absurdly():
    # `Retry-After` peut porter une DATE. Mal la lire produirait une attente
    # absurde ; le défaut est correct. #2521 — ce défaut suit la fenêtre
    # PUBLIÉE de l'API (7 requêtes par seconde par IP), plus 30 s.
    await re_src.search_companies("SOPRA", client=_Client(_Resp(429, {"retry-after": "Wed, 21 Oct 2026 07:28:00 GMT"})))
    throttle = rate_limiter.get_throttle("recherche_entreprises")
    remaining = throttle._cooldown_until - time.monotonic()
    # #4617 — plus un jitter borné (≤ 25 %) : deux répliques ne repartent pas ensemble.
    assert 0 < remaining <= re_src._DEFAULT_BACKOFF_S * 1.25 + 0.05
    assert re_src._DEFAULT_BACKOFF_S < 20  # jamais plus long que le budget d'une recherche interactive


@pytest.mark.asyncio
async def test_a_normal_empty_answer_stays_an_answer():
    # Le registre a répondu « rien » : c'est un VERDICT, et il doit le rester,
    # y compris en mode strict. Sinon plus aucun nom ne se résout jamais.
    out = await re_src.search_companies("N EXISTE PAS", client=_Client(_Resp(200)), strict=True)
    assert out == []
    assert rate_limiter.get_throttle("recherche_entreprises")._cooldown_until <= time.monotonic()


@pytest.mark.asyncio
async def test_the_longest_cooldown_wins():
    throttle = rate_limiter.get_throttle("recherche_entreprises")
    throttle.back_off(60)
    first = throttle._cooldown_until
    throttle.back_off(1)
    # Deux 429 rapprochés ne raccourcissent pas l'attente.
    assert throttle._cooldown_until == first
