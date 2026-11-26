"""Auto-enrich the top decision-makers with email/phone via Apollo People-Match.

After classification the buying-committee deciders are known, but People-Search
only returned names/titles — no email. This reveals email/phone for the top few
deciders so the dossier ships exploitable contacts (the deck wants top-3 ≥1 IT
decider with a real, sendable message).

Bounded on purpose: 1 Apollo credit per email (cost) AND a tight personal-data
surface — only the handful of B2B deciders, legitimate-interest (see
agent_docs/security.md / RGPD). Best-effort: a miss, a plan limit or a credit
error never fails the analysis.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

from app.middleware.correlation_id import get_correlation_id
from app.services.apollo import ApolloPlanError, bulk_enrich_people, enrich_person
from app.services.contact_employer import employer_matches
from app.services.source_health import record_degradation

logger = logging.getLogger(__name__)

# How many top deciders get an email/phone revealed automatically per run.
# ⚠️ THE Apollo COST LEVER: People-Search (names) is free, but each reveal here is
# 1 Apollo People-Match credit (+ 1 Bellum enrichment credit). 15 (the rest stay
# revealable on demand via the « Enrichir » button); env tunes it (0 = disable
# auto-enrich entirely). It was 5, which left a dossier of 1379 detected contacts
# with 5 addresses — the targeting below spends only where Apollo has already said
# an email exists, so a raise costs credits but never wastes them. RGPD: only
# priority-1/2 B2B deciders, legitimate-interest.
DEFAULT_ENRICH_LIMIT = int(os.getenv("CONTACTS_ENRICH_TOP_N", "15"))


def _is_decider(contact: dict[str, Any]) -> bool:
    return contact.get("priority") in (1, 2) or contact.get("influenceLevel") == "decision-maker"


def _split_name(full_name: str) -> tuple[str | None, str | None]:
    parts = (full_name or "").strip().split()
    if not parts:
        return None, None
    if len(parts) == 1:
        return parts[0], None
    return parts[0], " ".join(parts[1:])


async def enrich_top_deciders(
    contacts: list[dict[str, Any]],
    company_name: str,
    *,
    limit: int = DEFAULT_ENRICH_LIMIT,
    account_domains: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Attach email/phone to the top ``limit`` deciders still missing an email.

    Mutates + returns the same list (the contact dicts are the camelCase wire
    shape: ``fullName``, ``linkedinUrl``, ``priority``, ``influenceLevel``…).
    """
    deciders = [c for c in contacts if _is_decider(c) and not c.get("email")]
    # Credit-smart targeting: Apollo's FREE People-Search flags whether an email
    # exists (``hasEmail``) BEFORE we spend a People-Match credit. Drop deciders
    # Apollo says have NO email (a guaranteed credit-miss); keep those with an
    # email first, then those where the flag is unknown (older seeds / non-Apollo
    # sources) — never burning a credit on a known-empty contact.
    known = [c for c in deciders if c.get("hasEmail") is True]
    unknown = [c for c in deciders if c.get("hasEmail") is None]
    targets = (known + unknown)[:limit]
    if not targets:
        return contacts

    plan_blocked = False

    def _apply(contact: dict[str, Any], result: Any) -> None:
        if not result or not result.matched:
            return
        # The search tier obfuscated the last name ("Julien" only) — backfill the
        # now-revealed full name so the dossier ships a real, addressable contact.
        if result.first_name and result.last_name:
            contact["fullName"] = f"{result.first_name} {result.last_name}".strip()
        if result.linkedin_url and not contact.get("linkedinUrl"):
            contact["linkedinUrl"] = result.linkedin_url
        # LUDB.5 — l'employeur révélé doit être celui du compte : un homonyme
        # (stillfront.com pour STILL) est écarté avec sa raison, jamais rattaché.
        if result.email and account_domains and employer_matches(result.email, account_domains) is False:
            contact["excluded"] = True
            contact["exclusionReason"] = "homonyme : employeur hors du compte et de son groupe"
            return
        if result.email:
            contact["email"] = result.email
            if result.phone:
                contact["phone"] = result.phone
            contact["emailVerified"] = result.email_status == "verified"

    async def _one(contact: dict[str, Any]) -> None:
        nonlocal plan_blocked
        if plan_blocked:
            return
        first, last = _split_name(contact.get("fullName", ""))
        try:
            result = await enrich_person(
                # Apollo id is the reliable key: People-Search obfuscates the last
                # name, so first_name+org matches an empty record. The id unlocks
                # the full contact (name + verified email + LinkedIn).
                apollo_id=(contact.get("apolloId") or None),
                linkedin_url=(contact.get("linkedinUrl") or None),
                first_name=first,
                last_name=last,
                organization_name=company_name,
            )
        except ApolloPlanError:
            # The plan can't People-Match at all — stop burning calls this run.
            plan_blocked = True
            logger.warning("Apollo People-Match unavailable on this plan — skipping auto-enrich")
            # Structural, not transient: a subscription the user must act on. It
            # gets its own source so the message can say that instead of
            # "réessayez". Losing enrichment means contacts with no address,
            # which guts the "messages prêts à envoyer" deliverable.
            record_degradation(
                get_correlation_id(),
                source="apollo_plan",
                reason="People-Match indisponible sur ce plan Apollo",
            )
            return
        except Exception as exc:  # noqa: BLE001 — enrich is best-effort
            logger.warning("Auto-enrich failed for %r: %s", contact.get("fullName"), exc)
            record_degradation(get_correlation_id(), source="apollo_enrich", reason=str(exc))
            return
        _apply(contact, result)

    def _degrade_bulk(exc: Exception) -> None:
        nonlocal plan_blocked
        if isinstance(exc, ApolloPlanError):
            plan_blocked = True
            logger.warning("Apollo People-Match unavailable on this plan — skipping auto-enrich")
            record_degradation(
                get_correlation_id(),
                source="apollo_plan",
                reason="People-Match indisponible sur ce plan Apollo",
            )
            return
        logger.warning("Auto-enrich (bulk) failed: %s", exc)
        record_degradation(get_correlation_id(), source="apollo_enrich", reason=str(exc))

    async def _bulk(batch: list[dict[str, Any]]) -> None:
        if plan_blocked:
            return
        try:
            results = await bulk_enrich_people([str(c["apolloId"]) for c in batch])
        except Exception as exc:  # noqa: BLE001 — enrich is best-effort
            _degrade_bulk(exc)
            return
        for contact in batch:
            _apply(contact, results.get(str(contact["apolloId"])))

    # LOT (15/10) DATA-A point 8 — les contacts qui ont un identifiant Apollo partent par LOTS de 10
    # (`people/bulk_match`, voir `apollo.bulk_enrich_people`) ; les autres (nom + entreprise, ou profil) gardent l'appel individuel.
    with_id = [c for c in targets if c.get("apolloId")]
    without_id = [c for c in targets if not c.get("apolloId")]
    # `bulk_enrich_people` découpe elle-même en lots de 10 (et lit le cache par personne avant).
    await asyncio.gather(*([_bulk(with_id)] if with_id else []), *(_one(c) for c in without_id))
    enriched = sum(1 for c in targets if c.get("email"))
    logger.info(
        "Auto-enriched %d/%d top deciders with email for '%s'", enriched, len(targets), company_name
    )
    return contacts
