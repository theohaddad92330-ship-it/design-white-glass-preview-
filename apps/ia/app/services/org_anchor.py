"""Ancre d'organisation Apollo d'un compte — UNE dérivation, deux appelants.

C.2 (Cédric 20/10) — le run complet (``graph/nodes.py``) et la phase 2 relancée à
la demande (« Agrandir la recherche », ``routers/phase2_contacts.py``) doivent
ancrer Apollo de la même façon : l'id de l'organisation (le plus fort), puis son
domaine, sinon le domaine du site du compte. Avant, seul le run complet le
faisait : la relance à la demande partait sans ancre et cherchait par libellé.
"""

from __future__ import annotations

from typing import Any, Literal, NamedTuple

from app.services.assets import website_domain

OrgAnchorSource = Literal["enrichment", "website", "none"]


class OrgAnchor(NamedTuple):
    organization_ids: list[str]
    organization_domains: list[str]
    source: OrgAnchorSource


def derive_org_anchor(apollo_enrichment: Any, website: Any = None) -> OrgAnchor:
    """Ancres dérivées de ``apolloEnrichment`` (``organizationId``, ``domain`` /
    ``primary_domain``), à défaut du domaine de ``website``. Rien de trouvé =
    listes vides et ``source="none"`` — jamais une ancre inventée."""
    enrichment = apollo_enrichment if isinstance(apollo_enrichment, dict) else {}
    org_id = str(enrichment.get("organizationId") or "").strip()
    enrichment_domain = (
        str(enrichment.get("domain") or "").strip() or str(enrichment.get("primary_domain") or "").strip()
    )
    site_domain = website_domain(str(website or ""))
    domain = enrichment_domain or site_domain or ""
    source: OrgAnchorSource = "enrichment" if (org_id or enrichment_domain) else ("website" if domain else "none")
    return OrgAnchor([org_id] if org_id else [], [domain] if domain else [], source)
