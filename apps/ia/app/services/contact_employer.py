"""LUDB.5 — l'employeur d'un contact enrichi doit être CELUI du compte.

Un homonyme (« Still » le fabricant de chariots, « Stillfront » l'éditeur de
jeux, « still.sk ») passe le garde de nom flou d'Apollo. Le domaine de l'e-mail
révélé est le fait qui tranche : il doit être celui du compte ou d'un domaine
de son groupe, sinon le contact est écarté AVEC sa raison (jamais supprimé).

Pur, sans I/O. Inconnu (pas d'e-mail, pas de domaine de compte) = ``None`` :
on ne rejette jamais sur une absence.
"""

from __future__ import annotations

from urllib.parse import urlparse


def _host(value: str) -> str:
    raw = (value or "").strip().lower()
    if not raw:
        return ""
    if "@" in raw:
        raw = raw.rsplit("@", 1)[1]
    if "//" in raw:
        raw = urlparse(raw).hostname or ""
    raw = raw.split("/", 1)[0].split(":", 1)[0]
    return raw.removeprefix("www.").strip(".")


def account_domains_from(website: object, group_domains: object = None) -> list[str]:
    """Domaine du site du compte puis domaines du groupe, normalisés, sans doublon."""
    domains: list[str] = []
    candidates: list[object] = [website]
    if isinstance(group_domains, (list, tuple)):
        candidates.extend(group_domains)
    for candidate in candidates:
        host = _host(str(candidate or ""))
        if host and host not in domains:
            domains.append(host)
    return domains


def employer_matches(email_or_domain: str, account_domains: list[str]) -> bool | None:
    """True/False si le domaine employeur correspond ; None si on ne peut pas savoir."""
    known = [d for d in (_host(d) for d in account_domains) if d]
    candidate = _host(email_or_domain)
    if not known or not candidate:
        return None
    return any(candidate == d or candidate.endswith("." + d) for d in known)
