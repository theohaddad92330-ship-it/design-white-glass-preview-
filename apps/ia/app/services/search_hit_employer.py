"""#4928.1 — l'employeur d'un résultat de RECHERCHE doit être celui du compte (ou de son groupe).

``q_organization_name`` est flou : « Boulanger » attrape « Boulangerie Ange ». Un résultat est gardé si l'UNE de ces
conditions est vraie : (a) l'id d'organisation est celui du compte ; (b) le domaine de son organisation l'est ;
(c) le nom normalisé est ÉGAL à un nom du compte/groupe, ou le commence suivi d'une frontière de mot et d'un suffixe
juridique ou géographique connu ; (d) une expérience EN COURS satisfait (a), (b) ou (c).
Sinon : écarté avec sa raison (``employer_mismatch``), jamais supprimé en silence. Employeur INCONNU = gardé (on ne
rejette jamais sur une absence). Pur, sans I/O."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from app.models.contacts import ApolloSearchHit
from app.services.contact_employer import account_domains_from, employer_matches
from app.services.current_position import is_ongoing

EMPLOYER_MISMATCH = "employer_mismatch"

# Suffixes juridiques ou géographiques qui ne changent pas l'entité (« Boulanger SA », « Boulanger France »).
_SUFFIXES = frozenset(
    {
        "sa", "sas", "sasu", "sarl", "eurl", "snc", "se", "spa", "gmbh", "ltd", "inc", "plc", "llc", "bv", "nv", "ag",
        "group", "groupe", "holding", "france", "europe", "international", "monde", "worldwide", "global",
        "paris", "idf", "belgique", "belgium", "suisse", "switzerland", "luxembourg", "espagne", "spain", "italie",
        "italy", "allemagne", "germany", "uk", "usa", "maroc", "tunisie", "afrique", "africa",
    }
)


# Mots de tête qui qualifient la forme sans changer l'entité (« MUTUELLE UNEO » = « Unéo », « Groupe Boulanger »).
_LEADING = frozenset({"mutuelle", "groupe", "group", "societe", "compagnie", "caisse", "association", "the", "la", "le", "les"})


def _words(value: object) -> list[str]:
    text = unicodedata.normalize("NFD", str(value or "")).encode("ascii", "ignore").decode().lower()
    words = [w for w in re.sub(r"[^a-z0-9]+", " ", text).split() if w]
    while len(words) > 1 and words[0] in _LEADING:
        words = words[1:]
    return words


def name_matches_account(org_name: object, account_names: list[str]) -> bool:
    """Règle (c). Comparaison par MOTS entiers : « boulangerie » n'est pas « boulanger » + un reste."""
    org = _words(org_name)
    if not org:
        return False
    for name in account_names:
        target = _words(name)
        if not target:
            continue
        if org == target:
            return True
        if org[: len(target)] == target and all(w in _SUFFIXES for w in org[len(target) :]):
            return True
    return False


@dataclass(frozen=True)
class AccountIdentity:
    names: list[str] = field(default_factory=list)
    org_ids: list[str] = field(default_factory=list)
    domains: list[str] = field(default_factory=list)

    def is_empty(self) -> bool:
        return not (self.names or self.org_ids or self.domains)


def account_identity(
    company_name: str,
    org_ids: list[str],
    domains: list[Any],
    profile_data: dict[str, Any],
    *,
    extra_names: Sequence[str] = (),
) -> AccountIdentity:
    """Le compte + son groupe (entités ``entitiesExhaustive`` / ``entities`` de l'analyse), sans doublon.

    ``extra_names`` (lot 757) : les entités du groupe COCHÉES par le commercial — leurs salariés sont du compte."""
    research = profile_data.get("research") if isinstance(profile_data.get("research"), dict) else {}
    raw = research.get("entitiesExhaustive") or profile_data.get("entitiesExhaustive") or profile_data.get("entities") or []
    names = [company_name, *extra_names]
    group_domains: list[Any] = list(domains)
    for entity in raw if isinstance(raw, list) else []:
        if not isinstance(entity, dict) or entity.get("getsPlay") is False:
            continue
        names.append(str(entity.get("name") or ""))
        group_domains.append(entity.get("domain") or entity.get("website"))
    seen: set[str] = set()
    unique = [n.strip() for n in names if n and n.strip() and not (n.strip().lower() in seen or seen.add(n.strip().lower()))]
    return AccountIdentity(names=unique, org_ids=[i for i in org_ids if i], domains=account_domains_from(None, group_domains))


def _id_or_domain_ok(org_id: object, domain: object, account: AccountIdentity) -> bool:
    if org_id and str(org_id).strip() in account.org_ids:
        return True
    return bool(domain) and employer_matches(str(domain), account.domains) is True


def _own_employer_ok(hit: ApolloSearchHit, account: AccountIdentity) -> bool:
    return _id_or_domain_ok(hit.organization_id, hit.organization_domain, account) or name_matches_account(
        hit.organization_name, account.names
    )


def _account_experience(hit: ApolloSearchHit, account: AccountIdentity) -> dict[str, Any] | None:
    """Règle (d) : l'expérience EN COURS chez le compte, la plus récemment commencée."""
    found = [
        e
        for e in hit.employment_history
        if isinstance(e, dict)
        and is_ongoing(e)
        and (
            _id_or_domain_ok(e.get("organization_id"), e.get("organization_domain"), account)
            or name_matches_account(e.get("organization") or e.get("organization_name"), account.names)
        )
    ]
    found.sort(key=lambda e: str(e.get("start_date") or ""), reverse=True)
    return found[0] if found else None


def guard_search_hits(
    hits: list[ApolloSearchHit], account: AccountIdentity
) -> tuple[list[ApolloSearchHit], list[tuple[ApolloSearchHit, str]]]:
    """Retourne (gardés, [(écarté, raison)]). #4928.2 : gardé par (d) ⇒ entité et fonction = celles de l'expérience."""
    if account.is_empty():
        return hits, []
    kept: list[ApolloSearchHit] = []
    dropped: list[tuple[ApolloSearchHit, str]] = []
    for hit in hits:
        has_history = any(isinstance(e, dict) for e in hit.employment_history)
        if not (hit.organization_name or hit.organization_id or hit.organization_domain or has_history):
            kept.append(hit)  # employeur inconnu : jamais rejeté sur une absence
        elif _own_employer_ok(hit, account):
            kept.append(hit)
        elif (exp := _account_experience(hit, account)) is not None:
            update: dict[str, Any] = {"organization_name": str(exp.get("organization") or exp.get("organization_name") or "")}
            if str(exp.get("title") or "").strip():
                update["title"] = str(exp["title"]).strip()
            kept.append(hit.model_copy(update=update))
        else:
            dropped.append((hit, EMPLOYER_MISMATCH))
    return kept, dropped
