"""`reason_for_exception` — un couperet qu'ON s'impose n'est pas une panne (#2521, suite).

Les sources de LISTE de Découvrir (`decp.py`, `public_tenders.py`,
`france_travail.py`) convertissent toute exception en un ``degraded[].reason``
machine-readable via cette fonction. Avant ce correctif, un ``RateLimitTimeout``
(#2521 — on a CESSÉ D'ATTENDRE un jeton registre à notre propre budget de
temps, `wait_deadline`) retombait dans le cas générique ``network_error`` — « le
registre est injoignable ». C'est exactement l'anti-pattern que cette fonction
existe pour éviter (#631 : « un fait d'infra déguisé en fait de marché ») —
sauf qu'ici, le fait d'infra n'a même pas eu lieu : la source n'a jamais dit
non, c'est NOUS qui avons arrêté d'attendre.
"""

from __future__ import annotations

import httpx

from app.services.company_filters import DegradeReason, reason_for_exception
from app.services.distributed_rate_limiter import RateLimitTimeout


def test_a_self_imposed_timeout_is_reported_as_time_budget_not_network_error() -> None:
    exc = RateLimitTimeout("recherche_entreprises", 0.0)

    assert reason_for_exception(exc) == DegradeReason.TIME_BUDGET


def test_a_genuine_network_failure_still_reports_network_error() -> None:
    """Témoin — la distinction porte VRAIMENT sur le type d'exception, pas sur
    un changement de comportement général de la fonction."""
    exc = RuntimeError("connection reset by peer")

    assert reason_for_exception(exc) == DegradeReason.NETWORK_ERROR


def test_an_http_status_still_wins_over_the_generic_fallback() -> None:
    """Témoin — un statut HTTP explicite reste classé par `reason_for_status`,
    inchangé par l'ajout du cas `RateLimitTimeout`."""
    request = httpx.Request("GET", "https://example.test")
    response = httpx.Response(429, request=request)
    exc = httpx.HTTPStatusError("rate limited", request=request, response=response)

    assert reason_for_exception(exc) == DegradeReason.RATE_LIMITED
