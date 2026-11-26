"""#3205.1 (épopée #3239) — les SOUS-DOMAINES du compte, via crt.sh.

Décision Louis (02/10/2026, QCM) : **crt.sh (logs Certificate Transparency)** —
gratuit, sans clé, contrat public. On liste les sous-domaines du site officiel
du compte, on résout leur CNAME, et on retient ceux qui pointent vers le
domaine d'un prestataire que le référentiel ESN CONNAÎT. Même liste
`esnPresence` que #3095 et les mentions légales : à étendre, jamais à dupliquer.

Garde-fous (la doctrine « sans clé = no-op strict » s'applique ici à « sans
réseau ») :

- UNE requête crt.sh par compte, au plus ``MAX_HOSTS_RESOLVED`` résolutions
  DNS, et un délai total borné — jamais un budget ouvert ;
- un TIMEOUT (ou une réponse 5xx / illisible de crt.sh) est ``unknown`` : la
  source n'a pas répondu, ce n'est ni un échec du run ni une absence de
  prestataire ;
- réseau injoignable, site officiel inexploitable ou source coupée
  (``PROVIDER_FOOTPRINT_SUBDOMAINS=off``) : ``skipped``, aucune ligne ;
- le rapprochement se fait sur le LIBELLÉ EXACT du domaine cible (``acme.
  capgemini.com`` → ``capgemini``), jamais sur une sous-chaîne : une
  ressemblance n'est pas un prestataire ;
- ``Hébergement`` n'est pas un prestataire IT (même exclusion que
  ``provider_footprint_mentions``) : un CNAME vers un hébergeur ne remonte
  rien, faute de figurer au référentiel ESN.

Certitude ``moyenne`` et non ``forte`` : un CNAME montre qu'un service du
prestataire répond sous le nom du compte, pas qu'il y est prestataire IT.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import socket
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote, urlparse

from app.knowledge import known_esn_names
from app.services.text_norm import normalize_name

logger = logging.getLogger(__name__)

CRT_SH_URL = "https://crt.sh/"
#: Résolutions DNS maximales par compte (plafond de requêtes, décision Louis).
MAX_HOSTS_RESOLVED = 20
#: Délai de la requête crt.sh — au-delà : ``unknown``.
REQUEST_TIMEOUT_S = 8.0
#: Délai d'une résolution, et budget total de la phase DNS.
DNS_TIMEOUT_S = 3.0
DNS_TOTAL_BUDGET_S = 10.0
_DNS_CONCURRENCY = 5

HttpGet = Callable[..., Awaitable[tuple[int, str]]]
ResolveCname = Callable[[str], Awaitable[str | None]]


@dataclass
class SubdomainFootprint:
    #: ``ok`` = crt.sh a répondu ; ``unknown`` = timeout/5xx/illisible ;
    #: ``skipped`` = rien tenté (pas de site, source coupée, réseau injoignable).
    status: str
    partners: list[dict[str, Any]] = field(default_factory=list)


def _enabled() -> bool:
    return os.environ.get("PROVIDER_FOOTPRINT_SUBDOMAINS", "on").strip().lower() not in ("off", "0", "false", "no")


def _base_host(website: str | None) -> str | None:
    try:
        parsed = urlparse((website or "").strip())
    except ValueError:
        return None
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return None
    host = parsed.hostname.lower().rstrip(".")
    if host.startswith("www."):
        host = host[4:]
    return host if "." in host else None


def parse_ct_hostnames(body: str, base_host: str) -> list[str]:
    """Les sous-domaines DISTINCTS de ``base_host`` lus dans une réponse crt.sh.

    Un nom ``*.`` (joker), un nom hors du compte, une adresse e-mail glissée dans
    ``name_value`` et l'apex lui-même ne sont pas des sous-domaines. ``www`` en
    est un : il se résout comme les autres.
    """
    try:
        rows = json.loads(body)
    except (TypeError, ValueError):
        return []
    if not isinstance(rows, list):
        return []
    suffix = f".{base_host}"
    seen: set[str] = set()
    for row in rows:
        value = row.get("name_value") if isinstance(row, dict) else None
        if not isinstance(value, str):
            continue
        for raw in value.split("\n"):
            name = raw.strip().lower().rstrip(".")
            if not name or "*" in name or "@" in name or " " in name:
                continue
            if name.endswith(suffix) and name != base_host:
                seen.add(name)
    return sorted(seen)


async def _default_http_get(url: str, *, timeout: float) -> tuple[int, str]:
    import httpx

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
        response = await client.get(url, headers={"Accept": "application/json"})
        return response.status_code, response.text


async def _default_resolve_cname(host: str) -> str | None:
    """Le nom canonique final de ``host``, ou ``None`` (pas d'alias / NXDOMAIN)."""
    try:
        canonical, _aliases, _ips = await asyncio.wait_for(
            asyncio.to_thread(socket.gethostbyname_ex, host), timeout=DNS_TIMEOUT_S
        )
    except (OSError, TimeoutError):
        return None
    canonical = (canonical or "").lower().rstrip(".")
    return canonical if canonical and canonical != host else None


def _squash(name: str) -> str:
    return "".join(ch for ch in normalize_name(name) if ch.isalnum())


def _domain_label(host: str) -> str | None:
    labels = [label for label in host.lower().rstrip(".").split(".") if label]
    return labels[-2] if len(labels) >= 2 else None


def _same_account(target: str, base_host: str) -> bool:
    return target == base_host or target.endswith(f".{base_host}")


async def collect_subdomain_partners(
    website: str | None,
    *,
    detected_at: str | None,
    http_get: HttpGet | None = None,
    resolve_cname: ResolveCname | None = None,
) -> SubdomainFootprint:
    base = _base_host(website)
    if base is None or not _enabled():
        return SubdomainFootprint("skipped")
    names = known_esn_names()
    if not names:
        return SubdomainFootprint("skipped")

    get = http_get or _default_http_get
    url = f"{CRT_SH_URL}?q={quote('%.' + base, safe='')}&output=json"
    try:
        status, body = await asyncio.wait_for(get(url, timeout=REQUEST_TIMEOUT_S), timeout=REQUEST_TIMEOUT_S + 1)
    except (TimeoutError, asyncio.TimeoutError):
        logger.info("crt.sh timeout for %s: unknown (continuing)", base)
        return SubdomainFootprint("unknown")
    except Exception as exc:  # réseau injoignable : no-op, jamais un échec du run
        logger.info("crt.sh unreachable for %s: skipped (%s)", base, exc.__class__.__name__)
        return SubdomainFootprint("skipped")
    if status != 200:
        return SubdomainFootprint("unknown")

    hosts = parse_ct_hostnames(body, base)[:MAX_HOSTS_RESOLVED]
    if not hosts:
        return SubdomainFootprint("ok")

    resolve = resolve_cname or _default_resolve_cname
    gate = asyncio.Semaphore(_DNS_CONCURRENCY)

    async def one(host: str) -> tuple[str, str | None]:
        async with gate:
            try:
                return host, await resolve(host)
            except Exception:  # une résolution qui casse ne fait pas tomber les autres
                return host, None

    tasks = [asyncio.create_task(one(host)) for host in hosts]
    done, pending = await asyncio.wait(tasks, timeout=DNS_TOTAL_BUDGET_S)
    for task in pending:
        task.cancel()
    status_out = "ok" if not pending else "unknown"

    by_label = {_squash(name): name for name in names if _squash(name)}
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for task in (t for t in tasks if t in done):
        host, target = task.result()
        if not target or _same_account(target, base):
            continue
        label = _domain_label(target)
        known = by_label.get(label or "")
        if not known or known in seen:
            continue
        seen.add(known)
        out.append(
            {
                "name": known,
                "certainty": "moyenne",
                "scope": None,
                "detectedAt": detected_at,
                "evidence": f"Sous-domaine détecté (certificats publics) : {host} pointe vers {target}.",
            }
        )
    return SubdomainFootprint(status_out, out)


__all__ = ["SubdomainFootprint", "collect_subdomain_partners", "parse_ct_hostnames"]
