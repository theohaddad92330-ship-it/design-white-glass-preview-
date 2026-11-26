"""SIG-C (11/10) C4 — l'alerte « source muette ».

Avant : un fournisseur d'offres mort (clé révoquée, quota épuisé, service en
panne) rendait ``[]`` à chaque analyse, sa dégradation restait par run, et rien
ne prévenait personne — une source morte était INVISIBLE.

Ici : un compteur Redis PAR fournisseur des erreurs CONSÉCUTIVES. Au
``SILENT_AFTER``-ième, l'alerte part UNE fois vers le canal back-office
existant (``backoffice_alerts.report_provider_silent`` → e-mail opérateur) ; le
premier succès remet le compteur à zéro et, s'il avait alerté, ferme le sujet
(``resolved``). **Zéro résultat n'est PAS une erreur** : seul l'appelant décide
de ``ok`` — une réponse 2xx vide est un succès.

Best-effort strict : Redis absent ou en panne ⇒ rien, jamais une exception (une
alerte ne casse pas une recherche). L'alerte nomme la CLÉ d'environnement (canal
opérateur, comme ``provider_credits_exhausted``) ; ce qui manque se dit par la
famille publique, jamais par le fournisseur.

ALERTES-402 (30/10/2026) — un ``402 Payment Required`` n'est pas une panne : la
source refuse de servir faute de crédits, et le geste est de recharger, pas
d'« attendre que ça revienne ». Il part donc AUSSI, dès le PREMIER 402, par le
canal ``provider_credits_exhausted`` (débit propre de 6 h) — mesuré : le 402 de
TheirStack du 28/10 17:40 est sorti en « vérifier l'état du service », et la
source est restée à sec sans que personne ne recharge. Et il compte au
disjoncteur : 402, comme 401/403, est déterministe jusqu'au geste d'un humain.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import UTC, datetime

from app.services import backoffice_alerts
from app.services.distributed_rate_limiter import get_client, redis_url
from app.services.source_health import public_source

logger = logging.getLogger(__name__)

#: Erreurs consécutives avant l'alerte (brief SIG-C, Louis 11/10).
SILENT_AFTER = 5
#: Une série d'erreurs non relue depuis une semaine s'oublie (pas de clé éternelle).
_TTL_S = 7 * 24 * 3600
_PREFIX = "source_silence:"

#: ALERTES-402 (30/10/2026) point 2 — le refroidissement après un 429 vit dans Redis, PARTAGÉ.
#: ``ProviderThrottle.back_off`` ne refroidit que son processus : la réplique voisine continuait à
#: cogner (mesuré : trois rafales Mantiks en trois jours, quota pourtant intact). Clé posée avec le
#: ``Retry-After`` du fournisseur quand il en donne un, sinon le défaut du limiteur.
_COOLDOWN_PREFIX = "source_cooldown:"
#: ALERTES-402 point 1 — l'horodatage du dernier appel TENTÉ, par fournisseur. Une source protégée par
#: un cache ne produit NI erreur NI alerte : TheirStack est resté à sec deux jours sans un mot. Le seul
#: témoin possible est l'absence d'appel, donc il faut la mesurer.
_LAST_CALL_PREFIX = "source_last_call:"
#: Une absence d'appel se dit UNE fois par jour et par fournisseur (le canal borne déjà à 6 h).
_UNUSED_SAID_PREFIX = "source_unused_said:"
#: Jours sans un seul appel avant de le dire. Trois jours : au-delà, ce n'est plus un week-end creux.
UNUSED_AFTER_DAYS = 3
#: L'horodatage survit à une longue inactivité — c'est justement ce qu'on cherche à voir.
_LAST_CALL_TTL_S = 60 * 24 * 3600
#: ALERTES-402 point 5 — le fait « on a ALERTÉ » vit à part, 30 j : la série d'erreurs, elle, s'oublie
#: (``_TTL_S`` = 7 j) ou disparaît avec un redémarrage de Redis, et le ``[RÉSOLU]`` était alors perdu
#: — mesuré : trois alertes Mantiks en trois jours, aucun ``[RÉSOLU]`` entre elles.
_ALERTED_PREFIX = "source_silence_alerted:"
_ALERTED_TTL_S = 30 * 24 * 3600

#: Le nom que l'opérateur sait poser : la clé d'environnement du fournisseur.
_ENV_KEY: dict[str, str] = {
    "adzuna": "ADZUNA_APP_KEY",
    "jooble": "JOOBLE_API_KEY",
    "theirstack": "THEIRSTACK_API_KEY",
    "mantiks": "MANTIKS_API_KEY",
    "fantastic_jobs": "FANTASTIC_JOBS_API_KEY",
}

#: Ce qui manque aux utilisateurs, par famille publique — jamais un fournisseur.
_DEGRADED: dict[str, str] = {
    "job_aggregators": (
        "Une partie des offres d'emploi agrégées manque aux dossiers tant que la source ne répond plus."
    ),
}


async def _redis():
    url = redis_url()
    if not url:
        return None
    try:
        return await get_client(url)
    except Exception as exc:  # noqa: BLE001 — best-effort
        logger.debug("Source silence: Redis unavailable (%s)", exc)
        return None


#: Une attente sur NOTRE limiteur n'est pas un échec de la source (16/10) : ni compté, ni remise à zéro.
_OWN_LIMITER_MARKERS = ("ratelimittimeout", "rate limit slot", "[time_budget]", "time_budget")


def _is_own_limiter_wait(reason: str) -> bool:
    low = (reason or "").lower()
    return any(marker in low for marker in _OWN_LIMITER_MARKERS)


def env_key(provider: str) -> str:
    """La clé d'environnement que l'opérateur sait poser — le seul nom que ce canal promet."""
    return _ENV_KEY.get(provider) or f"{provider.upper()}_API_KEY"


def degraded_text(provider: str) -> str:
    """Ce qui manque aux UTILISATEURS, par famille publique — jamais le nom d'un fournisseur."""
    return _DEGRADED.get(public_source(provider), "Une source de données ne répond plus.")


#: SIGNAUX-OPTI (16/10) point 1 — disjoncteur 401/403 : après ``AUTH_REFUSED_AFTER`` refus
#: consécutifs la source est SAUTÉE, hormis une sonde par heure. Compteur Redis partagé.
AUTH_REFUSED_AFTER = 5
#: ALERTES-402 (30/10/2026) — les codes où la source REFUSE de servir tant qu'un humain n'a rien fait :
#: la clé (401/403) ou les crédits (402). Réessayer avant ce geste ne rend jamais autre chose ; une panne
#: (5xx, timeout) ou une cadence (429), elle, passe toute seule et n'ouvre pas le disjoncteur.
_REFUSED_STATUSES = (401, 403, 402)
#: Le 402 ne se confirme pas : il part au canal « crédits épuisés » dès le premier.
PAYMENT_REQUIRED = 402
_PROBE_TTL_S = 3600
_AUTH_PREFIX = "source_auth_refused:"
_PROBE_PREFIX = "source_auth_probe:"


async def skip_auth_refused(provider: str) -> bool:
    """Vrai si la clé du fournisseur est refusée en série : l'appelant n'émet AUCUN appel réseau.

    Une seule sonde par heure passe (``SET NX EX``, atomique entre répliques). Sans Redis
    (ou en panne) : toujours faux, comportement inchangé."""
    try:
        r = await _redis()
        if r is None:
            return False
        if int(await r.get(f"{_AUTH_PREFIX}{provider}") or 0) < AUTH_REFUSED_AFTER:
            return False
        if await r.set(f"{_PROBE_PREFIX}{provider}", "1", nx=True, ex=_PROBE_TTL_S):
            return False
        logger.info("source_skipped source=%s reason=auth_refused", provider)
        return True
    except Exception as exc:  # noqa: BLE001 — best-effort
        logger.debug("Source silence: disjoncteur %s indisponible (%s)", provider, exc)
        return False


async def _track_auth_refusal(r, provider: str, *, ok: bool, status: int | None) -> None:
    if status in _REFUSED_STATUSES and not ok:
        key = f"{_AUTH_PREFIX}{provider}"
        await r.incr(key)
        await r.expire(key, _TTL_S)
    else:
        await r.delete(f"{_AUTH_PREFIX}{provider}", f"{_PROBE_PREFIX}{provider}")


async def record_outcome(provider: str, *, ok: bool, reason: str = "", status: int | None = None) -> None:
    """Compte un appel du fournisseur : ``ok`` = la source a RÉPONDU (même vide).

    Ne lève jamais. Alerte au ``SILENT_AFTER``-ième échec consécutif, une seule
    fois par série ; ferme le sujet au premier succès qui suit l'alerte. Une attente sur notre propre
    limiteur (RateLimitTimeout, « rate limit slot », [time_budget]) est NEUTRE."""
    if not ok and _is_own_limiter_wait(reason):
        return  # neutre : notre limiteur a fait attendre, la source n'a rien dit
    if not ok and status == PAYMENT_REQUIRED:
        # ALERTES-402 — hors de Redis exprès : des crédits à sec se disent même sans compteur partagé.
        await backoffice_alerts.report_provider_credits_exhausted(
            env_key(provider), degraded_text(provider)
        )
    try:
        r = await _redis()
        if r is None:
            return
        await _track_auth_refusal(r, provider, ok=ok, status=status)
        key = f"{_PREFIX}{provider}"
        if ok:
            state = await r.hgetall(key)
            # ALERTES-402 point 5 — la série s'oublie (7 j) ou part avec un redémarrage de Redis ; le fait
            # « on a alerté » vit 30 j à part, sinon le [RÉSOLU] ne sort jamais et l'opérateur croit la
            # panne encore ouverte (mesuré : trois alertes Mantiks, aucun [RÉSOLU] entre elles).
            alerted = await r.hgetall(f"{_ALERTED_PREFIX}{provider}")
            if not state and not alerted:
                return
            if state:
                await r.delete(key)
            if alerted or int(state.get("count") or 0) >= SILENT_AFTER:
                told = alerted or state
                await r.delete(f"{_ALERTED_PREFIX}{provider}")
                await backoffice_alerts.report_provider_silent(
                    env_key(provider),
                    since_iso=str(told.get("since") or datetime.now(UTC).isoformat()),
                    consecutive_errors=int(told.get("count") or 0) or SILENT_AFTER,
                    last_reason=str(told.get("last") or "erreur"),
                    degraded=degraded_text(provider),
                    resolved=True,
                )
            return
        why = (reason or "erreur").strip()[:200] or "erreur"
        count = int(await r.hincrby(key, "count", 1))
        if count == 1:
            await r.hset(key, "since", datetime.now(UTC).isoformat())
        await r.hset(key, "last", why)
        await r.expire(key, _TTL_S)
        if count == SILENT_AFTER:
            since = await r.hget(key, "since")
            marker = f"{_ALERTED_PREFIX}{provider}"
            await r.hset(marker, mapping={"since": str(since or datetime.now(UTC).isoformat()), "count": count, "last": why})
            await r.expire(marker, _ALERTED_TTL_S)
            await backoffice_alerts.report_provider_silent(
                env_key(provider),
                since_iso=str(since or datetime.now(UTC).isoformat()),
                consecutive_errors=count,
                last_reason=why,
                degraded=degraded_text(provider),
            )
    except Exception as exc:  # noqa: BLE001 — une alerte ne casse jamais une recherche
        logger.debug("Source silence: compteur %s indisponible (%s)", provider, exc)


async def start_cooldown(provider: str, seconds: float) -> None:
    """ALERTES-402 point 2 — « trop de requêtes » : on se tait, et les AUTRES répliques aussi.

    ``ProviderThrottle.back_off`` reste posé en plus (il espace les départs du processus courant) ;
    cette clé-ci, elle, est le seul frein que la réplique voisine puisse voir. Ne lève jamais : sans
    Redis le comportement est celui d'avant, un refroidissement par processus."""
    try:
        r = await _redis()
        if r is None:
            return
        await r.set(f"{_COOLDOWN_PREFIX}{provider}", "1", ex=max(1, int(round(seconds))))
    except Exception as exc:  # noqa: BLE001 — best-effort
        logger.debug("Source silence: refroidissement %s non posé (%s)", provider, exc)


async def in_cooldown(provider: str) -> bool:
    """Vrai tant que le refroidissement demandé par le fournisseur court : aucun appel réseau n'est émis."""
    try:
        r = await _redis()
        if r is None:
            return False
        return bool(await r.exists(f"{_COOLDOWN_PREFIX}{provider}"))
    except Exception as exc:  # noqa: BLE001 — best-effort
        logger.debug("Source silence: refroidissement %s illisible (%s)", provider, exc)
        return False


async def note_call(provider: str) -> None:
    """ALERTES-402 point 1 — horodate un appel TENTÉ (réussi ou non) : c'est ce qui permet de voir
    l'absence d'appel. Ne lève jamais."""
    try:
        r = await _redis()
        if r is None:
            return
        await r.set(f"{_LAST_CALL_PREFIX}{provider}", datetime.now(UTC).isoformat(), ex=_LAST_CALL_TTL_S)
    except Exception as exc:  # noqa: BLE001 — best-effort
        logger.debug("Source silence: dernier appel %s non noté (%s)", provider, exc)


async def warn_unused(providers: Sequence[str], *, after_days: int = UNUSED_AFTER_DAYS) -> list[tuple[str, int]]:
    """Dit les sources CONFIGURÉES qu'on n'a pas appelées depuis ``after_days`` jours.

    Le trou que cette fonction ferme (mesuré le 30/10/2026) : une source payante protégée par un cache
    ne produit ni erreur ni alerte quand elle meurt — TheirStack est resté à sec deux jours, et c'est
    un mail au MAUVAIS geste qui l'a appris. Une source muette se compte en erreurs ; celle-ci se
    compte en SILENCE.

    Premier passage sur un fournisseur : on pose l'horodatage et on ne dit rien (sinon tout déploiement
    neuf alerterait pour des sources légitimement au repos). Une fois par jour et par fournisseur au
    plus. Rend ce qui a été dit, pour les tests et le journal. Ne lève jamais."""
    said: list[tuple[str, int]] = []
    try:
        r = await _redis()
        if r is None:
            return said
        now = datetime.now(UTC)
        for provider in providers:
            raw = await r.get(f"{_LAST_CALL_PREFIX}{provider}")
            if not raw:
                await note_call(provider)  # amorce : on ne juge pas un silence qu'on n'a jamais mesuré
                continue
            try:
                last = datetime.fromisoformat(str(raw))
            except ValueError:
                await note_call(provider)
                continue
            days = (now - last).days
            if days < after_days:
                continue
            if not await r.set(f"{_UNUSED_SAID_PREFIX}{provider}", "1", nx=True, ex=24 * 3600):
                continue  # déjà dit aujourd'hui
            logger.info("source_unused source=%s jours=%d", provider, days)
            await backoffice_alerts.report_provider_unused(
                env_key(provider), last_call_iso=last.isoformat(), days=days, degraded=degraded_text(provider)
            )
            said.append((provider, days))
    except Exception as exc:  # noqa: BLE001 — une alerte ne casse jamais une recherche
        logger.debug("Source silence: absence d'appel illisible (%s)", exc)
    return said
