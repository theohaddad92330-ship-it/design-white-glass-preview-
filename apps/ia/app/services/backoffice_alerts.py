"""#2528.3 — le signal IA → API quand une source rend un 402/429 de quota.

Décision Louis 17/09 (batch, ajout au lot #2528) : une source à court de
crédits devient un e-mail URGENT aux owners côté back-office
(``apps/api/src/modules/backoffice-alerts``), pas une ligne de log qu'un
opérateur découvre trois jours plus tard.

No-op strict sans ``API_INTERNAL_URL``/``INTERNAL_API_SECRET`` — même contrat
que le pont copilote (``bellum_api.py``) : aucune clé posée, aucun trafic
réseau, jamais une exception qui remonte (le rapport d'alerte ne doit JAMAIS
casser une recherche).

Une fois par fenêtre PAR SOURCE, ici, côté IA — le contrôleur interne (voir
``ProviderCreditsExhaustedDto``) et son dispatcheur dédupliquent DÉJÀ l'e-mail
lui-même sur 6 h, mais un run qui envoie cinquante requêtes Brave en 402 ne
doit pas faire cinquante appels internes pour un seul et même fait. En
mémoire de PROCESSUS, jamais persisté : un worker qui redémarre re-signale au
pire une fois de plus, jamais un manque.
"""

from __future__ import annotations

import logging
import os
import time
from datetime import UTC, datetime

import httpx

logger = logging.getLogger(__name__)

_HEADER = "X-Internal-Secret"
_TIMEOUT_S = 5.0

#: Se rapproche de la fenêtre anti-répétition de l'e-mail lui-même (6 h,
#: ``backoffice-alert-dispatch.ts``) — un RAPPROCHEMENT, pas une dépendance :
#: un désaccord entre les deux ne casse rien, il fait seulement appeler
#: l'API un peu plus souvent que strictement nécessaire.
REPORT_WINDOW_S = 6 * 60 * 60

# ``time.monotonic()`` par source, jamais l'horloge murale (ne doit pas
# sauter en arrière sur un ajustement NTP et déclencher un rapport en boucle).
_last_reported_monotonic: dict[str, float] = {}


def _base_url() -> str:
    return (os.environ.get("API_INTERNAL_URL") or "").strip().rstrip("/")


def _secret() -> str:
    return (os.environ.get("INTERNAL_API_SECRET") or "").strip()


def is_configured() -> bool:
    return bool(_base_url() and _secret())


def _should_report(source: str, *, now_monotonic: float | None = None) -> bool:
    now = now_monotonic if now_monotonic is not None else time.monotonic()
    last = _last_reported_monotonic.get(source)
    return last is None or (now - last) >= REPORT_WINDOW_S


def reset_report_window(source: str | None = None) -> None:
    """Seam de test : vide le débit en mémoire (tout, ou une seule source)."""
    if source is None:
        _last_reported_monotonic.clear()
    else:
        _last_reported_monotonic.pop(source, None)


async def report_provider_credits_exhausted(source: str, degraded: str) -> None:
    """Signale qu'une source est à court de crédits — best-effort, ne lève jamais.

    ``source`` DOIT être une clé d'environnement (``BRAVE_API_KEY``) : c'est ce
    que l'e-mail nomme, sur un canal OPÉRATEUR où nommer la source est
    nécessaire pour agir (jamais dans l'app — GA-44, ``no-vendor-names``).
    ``degraded`` dit en clair, pour un humain, ce qui manque aux utilisateurs
    tant que la source ne revient pas — jamais le nom d'un fournisseur.
    """
    if not _should_report(source):
        return
    base = _base_url()
    secret = _secret()
    if not base or not secret:
        return
    # Posé AVANT l'appel réseau : deux requêtes concurrentes qui rendent 402 au
    # même instant ne doivent déclencher qu'UN rapport, jamais une course.
    _last_reported_monotonic[source] = time.monotonic()
    payload = {
        "source": source,
        "sinceIso": datetime.now(UTC).isoformat(),
        "degraded": degraded,
    }
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_S) as client:
            response = await client.post(
                f"{base}/internal/admin/backoffice-alerts/provider-credits-exhausted",
                json=payload,
                headers={_HEADER: secret},
            )
        if response.status_code >= 400:
            logger.warning("Backoffice alert bridge refusé pour %s → HTTP %s", source, response.status_code)
    except Exception as exc:  # noqa: BLE001 — un rapport d'alerte ne casse jamais une recherche
        logger.warning("Backoffice alert bridge indisponible pour %s: %s", source, exc)


async def report_provider_silent(
    source: str,
    *,
    since_iso: str,
    consecutive_errors: int,
    last_reason: str,
    degraded: str,
    resolved: bool = False,
) -> None:
    """SIG-C (11/10) — signale qu'une source est EN ERREUR sur N appels consécutifs
    (ou, ``resolved``, qu'elle répond de nouveau). Best-effort, ne lève jamais.

    Le débit est tenu par l'appelant (``source_silence`` : une fois par série
    d'erreurs, via son compteur Redis) — pas de fenêtre en mémoire ici. Même
    contrat de nommage que ``report_provider_credits_exhausted`` : ``source`` est
    une clé d'environnement, ``degraded`` ne nomme jamais un fournisseur."""
    base = _base_url()
    secret = _secret()
    if not base or not secret:
        return
    payload = {
        "source": source,
        "sinceIso": since_iso,
        "consecutiveErrors": int(consecutive_errors),
        "lastReason": (last_reason or "erreur")[:200],
        "degraded": degraded,
        "resolved": bool(resolved),
    }
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_S) as client:
            response = await client.post(
                f"{base}/internal/admin/backoffice-alerts/provider-silent",
                json=payload,
                headers={_HEADER: secret},
            )
        if response.status_code >= 400:
            logger.warning(
                "Backoffice alert bridge (source muette) refusé pour %s → HTTP %s", source, response.status_code
            )
    except Exception as exc:  # noqa: BLE001 — un rapport d'alerte ne casse jamais une recherche
        logger.warning("Backoffice alert bridge (source muette) indisponible pour %s: %s", source, exc)


async def report_provider_unused(source: str, *, last_call_iso: str, days: int, degraded: str) -> None:
    """ALERTES-402 (30/10/2026) — signale qu'une source CONFIGURÉE n'a pas été APPELÉE depuis ``days`` jours.

    Même canal et même contrat de nommage que ``report_provider_silent`` (``source`` est une clé
    d'environnement, ``degraded`` ne nomme jamais un fournisseur) : c'est la même question posée à
    l'envers. « Muette » se compte en erreurs consécutives et ne voit donc RIEN d'une source que le
    cache rend inutile — TheirStack est resté à sec deux jours sans un mot. Le débit est tenu par
    l'appelant (``source_silence.warn_unused`` : une fois par jour et par fournisseur).
    Best-effort, ne lève jamais."""
    base = _base_url()
    secret = _secret()
    if not base or not secret:
        return
    payload = {
        "source": source,
        "lastCallIso": last_call_iso,
        "days": int(days),
        "degraded": degraded,
    }
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_S) as client:
            response = await client.post(
                f"{base}/internal/admin/backoffice-alerts/provider-unused",
                json=payload,
                headers={_HEADER: secret},
            )
        if response.status_code >= 400:
            logger.warning(
                "Backoffice alert bridge (source jamais appelée) refusé pour %s → HTTP %s", source, response.status_code
            )
    except Exception as exc:  # noqa: BLE001 — un rapport d'alerte ne casse jamais une recherche
        logger.warning("Backoffice alert bridge (source jamais appelée) indisponible pour %s: %s", source, exc)
