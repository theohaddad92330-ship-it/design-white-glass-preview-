"""GitHub — signal tech / engineering d'une entreprise.

Free, NO key required (REST API, 60 req/h en anonyme ; ``GITHUB_TOKEN`` optionnel
lève la limite à 5000/h). Une org GitHub active = un signal d'ingénierie fort pour
une ESN : elle révèle la stack réelle (langages des repos), le niveau de maturité
tech et la fraîcheur de l'activité (repos poussés récemment). Conservateur sur le
matching nom→org pour éviter les faux positifs. ``None`` sans correspondance
confiante, sur rate-limit (403) ou sur toute erreur — ne casse jamais la recherche.
"""

from __future__ import annotations

import logging
import os
import re
import time
from collections import Counter
from datetime import UTC, datetime, timedelta

import httpx

from app.middleware.correlation_id import get_correlation_id
from app.services import provider_cache
from app.services.company_filters import DegradeReason
from app.services.data_sources._http_pool import get_shared_client
from app.services.rate_limiter import back_off_provider, throttle
from app.services.source_health import record_degradation

logger = logging.getLogger(__name__)

_API = "https://api.github.com"
_TIMEOUT_S = 8.0
# On ne compte comme "actif" qu'un repo poussé dans les ~24 derniers mois : une org
# figée depuis 5 ans n'est pas un signal d'ingénierie vivant.
_ACTIVE_MAX_AGE_DAYS = 730  # ≈ 24 months
_MIN_TOKEN_LEN = 4  # garde-fou anti-faux-positif sur le matching nom↔login


def _token() -> str:
    return os.environ.get("GITHUB_TOKEN", "").strip()


def anonymous_mode() -> bool:
    """Tourne-t-on sans ``GITHUB_TOKEN`` ? Ce n'est pas un détail de config :
    c'est un facteur **83×** sur le plafond (60/h → 5000/h)."""
    return not _token()


def coverage_note() -> str | None:
    """Ce que le mode anonyme coûte, en clair — ``None`` quand un token est posé.

    Sans token le plafond est de 60 requêtes par HEURE **par IP de sortie**,
    partagé par TOUS les runs de l'instance ; ``org_tech_signals`` en dépense 3-4
    par entreprise, soit ~17 entreprises/heure pour tout le monde.

    C'est une contrainte permanente, pas une panne : la source ne « tombe » pas,
    elle est structurellement hors d'échelle. #638 a posé le bucket qui empêche
    de brûler l'heure en 30 secondes ; il ne peut pas créer du quota. La règle
    CLAUDE.md (« échec API → erreur claire, pas de fallback inventé ») vaut aussi
    pour une limite connue d'avance : on la NOMME plutôt que de ne rien
    contribuer en silence.
    """
    if _token():
        return None
    return (
        "GitHub interrogé en mode anonyme (sans GITHUB_TOKEN) : 60 requêtes/heure "
        "pour toute l'instance, soit ~17 entreprises/heure. Le signal tech peut "
        "manquer sur les analyses suivantes — poser GITHUB_TOKEN porte la limite à 5000/h."
    )


# ── Disjoncteur de quota ───────────────────────────────────────────────────
#
# #638 a vu, en live pendant son propre run : « API rate limit exceeded for
# 79.95.127.174 ». Il a aussi noté que la suite contrat classait ça « UPSTREAM
# OUTAGE — no action needed », ce qui est faux — et la MÊME confusion existait
# dans ce fichier : tout 403 était lu « quota anonyme atteint ».
#
# Deux causes, deux durées de vie, deux actions :
#
#   * quota épuisé → se répare TOUT SEUL à `x-ratelimit-reset`. Continuer à
#     taper ne fait que rallonger la file pour un 403 garanti. On note l'heure de
#     recharge et on s'abstient jusque-là ;
#   * credential morte (401) → ne se répare JAMAIS toute seule. Il faut un
#     humain (token révoqué/expiré). On s'abstient jusqu'à redémarrage plutôt que
#     de marteler un mur définitif.
#
# État de PROCESSUS volontairement : il borne la rafale d'un run et des runs
# voisins sur le même worker, sans introduire de dépendance Redis dans une source
# best-effort. Le pire cas d'un état non partagé est qu'un autre worker
# redécouvre le mur une fois — borné, et il le rapportera correctement.
_quota_blocked_until: float = 0.0
_credential_dead: bool = False


def reset_quota_state() -> None:
    """Remet le disjoncteur à zéro (tests, ou rotation de token à chaud)."""
    global _quota_blocked_until, _credential_dead
    _quota_blocked_until = 0.0
    _credential_dead = False


def _blocked_reason() -> tuple[str, str] | None:
    """``(code, message)`` si l'on doit s'abstenir, sinon ``None``."""
    if _credential_dead:
        return (
            DegradeReason.UNAUTHORIZED,
            "GitHub : credential rejetée (401) — le token GITHUB_TOKEN est invalide, "
            "révoqué ou expiré. Une attente ne répare rien : il faut le renouveler.",
        )
    remaining = _quota_blocked_until - time.time()
    if remaining > 0:
        return (
            DegradeReason.RATE_LIMITED,
            f"GitHub : quota épuisé, recharge dans ~{int(remaining // 60) + 1} min. "
            "Limite qui se répare seule — poser GITHUB_TOKEN la porte de 60/h à 5000/h.",
        )
    return None


def _note_block(code: str, message: str) -> None:
    record_degradation(get_correlation_id(), source="github", reason=message, code=code)


class _GitHubUnavailable(Exception):
    """La source est hors service pour une raison DÉJÀ rapportée."""


def _headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "BellumAI-research",
    }
    token = _token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _is_rate_limit(resp: httpx.Response) -> bool:
    """403/429 dû au quota — la distinction que GitHub documente.

    Le marqueur qui fait foi est ``x-ratelimit-remaining: 0``. Un 403 sans ce
    marqueur est un refus (permission, abuse detection), PAS un quota : les
    appeler pareil, c'est promettre une réparation automatique qui n'arrivera pas.
    """
    if resp.status_code not in (403, 429):
        return False
    remaining = resp.headers.get("x-ratelimit-remaining")
    if remaining is not None and remaining.strip() == "0":
        return True
    body = ""
    try:
        body = str((resp.json() or {}).get("message") or "")
    except Exception:  # noqa: BLE001 — un corps illisible ne décide de rien
        body = ""
    return "rate limit" in body.lower()


def _reset_epoch(resp: httpx.Response) -> float:
    raw = (resp.headers.get("x-ratelimit-reset") or "").strip()
    try:
        return float(raw)
    except ValueError:
        # Pas d'heure de recharge exploitable : on s'abstient une fenêtre courte
        # plutôt que de choisir un « pour toujours » qu'on ne sait pas justifier.
        return time.time() + 300.0


def _norm(value: object) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def _domain_root(website: str | None) -> str:
    """``https://www.doctolib.fr/x`` → ``doctolib`` — the registrable label,
    a strong org-name candidate."""
    m = re.search(r"https?://([^/]+)", str(website or "").strip())
    host = (m.group(1) if m else str(website or "")).lower()
    host = re.sub(r"^www\.", "", host)
    label = host.split(".")[0] if host else ""
    return _norm(label)


def _matches(login: str, targets: set[str]) -> bool:
    """Conservative name match: normalized login must equal, prefix, or be a
    prefix of a target (both sides ≥ 4 chars). Avoids matching e.g. ``sap`` to
    an unrelated ``sapient``."""
    nl = _norm(login)
    if not nl or len(nl) < 3:
        return False
    for t in targets:
        if not t:
            continue
        if nl == t:
            return True
        if len(nl) >= _MIN_TOKEN_LEN and len(t) >= _MIN_TOKEN_LEN and (nl.startswith(t) or t.startswith(nl)):
            return True
    return False


def _parse_dt(value: object) -> datetime | None:
    s = str(value or "").strip().replace("Z", "+00:00")
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt


async def _get(http: httpx.AsyncClient, url: str, *, params: dict | None = None) -> object | None:
    """Une requête GitHub, quota et credential distingués.

    Lève :class:`_GitHubUnavailable` quand la source est murée — la dégradation
    est alors DÉJÀ enregistrée, avec le bon code et la bonne action.
    """
    global _quota_blocked_until, _credential_dead

    # Mur déjà connu : on ne repart pas sur le réseau. `org_tech_signals` dépense
    # 3-4 requêtes par entreprise ; sans ça, chaque entreprise re-cognait 3 fois.
    blocked = _blocked_reason()
    if blocked is not None:
        _note_block(*blocked)
        raise _GitHubUnavailable(blocked[1])

    # GitHub anonyme = 60 requêtes/HEURE, le plafond le plus bas de la stack, et
    # ``org_tech_signals`` en dépense 3-4 par entreprise. Sans bucket, une
    # poignée d'analyses épuisait l'heure entière pour TOUTE l'instance — et
    # chaque 403 qui suivait se lisait « cette société n'a pas de GitHub ».
    async with throttle("github"):
        resp = await http.get(url, params=params, headers=_headers())

    if resp.status_code == 401:
        # Credential rejetée. Ce n'est PAS un quota : aucune attente ne la
        # réparera, il faut un humain. #638 a montré la suite contrat classant
        # ce genre de cas « no action needed » — précisément l'inverse du vrai.
        _credential_dead = True
        code, message = _blocked_reason() or (DegradeReason.UNAUTHORIZED, "GitHub 401")
        logger.error("GitHub credential rejected (401) on %s — GITHUB_TOKEN needs rotating", url)
        _note_block(code, message)
        raise _GitHubUnavailable(message)

    if _is_rate_limit(resp):
        # Quota épuisé : se répare seul. On mémorise l'heure de recharge donnée
        # par GitHub et on s'abstient jusque-là — l'attente est l'action utile.
        _quota_blocked_until = _reset_epoch(resp)
        # Fait taire aussi le compartiment PARTAGÉ (concurrency=1 aujourd'hui,
        # donc redondant avec le mur ci-dessus — mais le mur est un état de
        # PROCESSUS et le compartiment sert tout appelant du même throttle) :
        # additif, jamais un raccourcissement d'une attente déjà posée.
        back_off_provider("github", max(0.0, _quota_blocked_until - time.time()))
        code, message = _blocked_reason() or (DegradeReason.RATE_LIMITED, "GitHub quota")
        logger.warning("GitHub quota exhausted on %s — blocked until %s", url, _quota_blocked_until)
        _note_block(code, message)
        raise _GitHubUnavailable(message)

    if resp.status_code == 403:
        # 403 SANS marqueur de quota = un refus, pas une limite. Le dire « quota »
        # promettrait une réparation automatique qui n'arrivera pas.
        message = f"GitHub : accès refusé (403) sur {url} — ni quota ni credential."
        logger.warning("GitHub forbidden (403, not a rate limit) on %s", url)
        _note_block(DegradeReason.UPSTREAM_ERROR, message)
        raise _GitHubUnavailable(message)

    resp.raise_for_status()
    return resp.json()


@provider_cache.cached_by(
    "tech:github_org",
    # Cache key = company identity (+ website, it drives the org matching) —
    # never the user. Empty company → empty key → straight passthrough.
    lambda company_name, website=None, **_: (
        f"{company_name.strip().lower()}|{(website or '').strip().lower()}"
        if (company_name or "").strip()
        else ""
    ),
    ttl=provider_cache.TTL_TECH,
    # LOT (15/10) DATA-A point 8 — un NÉGATIF (aucune org confiante) se garde aussi : sans lui, chaque analyse d'une
    # société sans GitHub re-dépense 1 des 60 requêtes/heure. Une panne/un quota (dégradation notée) n'est jamais écrit.
    empty_ttl=provider_cache.TTL_EMPTY_TECH,
)
async def org_tech_signals(
    company_name: str, website: str | None = None, *, client: httpx.AsyncClient | None = None
) -> dict | None:
    """Best-effort engineering signal for a company's GitHub org: public repo
    count, top languages, and how many repos are *recently* active. ``None`` when
    no confident org match, on rate-limit, or on any error.

    Cached globally 14 j (``TTL_TECH``, C5) : la stack d'une org bouge lentement
    et l'API anonyme n'offre que 60 req/h — un hit évite 3-4 requêtes GitHub."""
    cleaned = (company_name or "").strip()
    if not cleaned:
        return None

    targets = {_norm(cleaned)}
    domain = _domain_root(website)
    if domain:
        targets.add(domain)
    targets.discard("")

    http = client if client is not None else get_shared_client("github_org", timeout=_TIMEOUT_S)
    try:
        search = await _get(
            http, f"{_API}/search/users", params={"q": f"{cleaned} type:org", "per_page": "5"}
        )
        if search is None:
            return None
        items = search.get("items") if isinstance(search, dict) else None
        login: str | None = None
        for it in items or []:
            candidate = it.get("login") if isinstance(it, dict) else None
            if candidate and _matches(candidate, targets):
                login = str(candidate)
                break
        if not login:
            return None

        org = await _get(http, f"{_API}/orgs/{login}")
        if org is None or not isinstance(org, dict):
            return None
        repos = await _get(
            http, f"{_API}/orgs/{login}/repos", params={"sort": "pushed", "per_page": "10", "type": "sources"}
        )
        repos = repos if isinstance(repos, list) else []
    except _GitHubUnavailable:
        # Déjà rapportée par `_get`, avec le code et l'action justes. La
        # re-rapporter ici l'écraserait par un message générique — exactement la
        # perte d'information que cette PR corrige.
        return None
    except Exception as exc:  # noqa: BLE001 — a source must never break research
        logger.warning("GitHub org signals failed for %r: %s", cleaned, exc)
        # Report the REAL cause: without it the run can only say "aucun
        # résultat", which reads identically to a company that genuinely has
        # nothing here — opposite facts, same message.
        record_degradation(get_correlation_id(), source="github", reason=str(exc))
        return None

    cutoff = datetime.now(UTC) - timedelta(days=_ACTIVE_MAX_AGE_DAYS)
    lang_counts: Counter[str] = Counter()
    active = 0
    last_activity: datetime | None = None
    for r in repos:
        if not isinstance(r, dict):
            continue
        lang = r.get("language")
        if lang:
            lang_counts[str(lang)] += 1
        pushed = _parse_dt(r.get("pushed_at"))
        if pushed is not None:
            if pushed >= cutoff:
                active += 1
            if last_activity is None or pushed > last_activity:
                last_activity = pushed

    return {
        "org": login,
        "url": org.get("html_url") or f"https://github.com/{login}",
        "publicRepos": org.get("public_repos"),
        "topLanguages": [lang for lang, _n in lang_counts.most_common(5)],
        "activeRecentRepos": active,
        "lastActivity": last_activity.date().isoformat() if last_activity else None,
    }
