"""#2265.2 / #2265.11 — un compte DÉJÀ dans le MÊME espace peut aider une
résolution que le registre seul ne tranche pas.

Deux rapprochements, jamais une fusion (#2284.28 : « le nom seul ne fusionne
jamais définitivement deux entités ») :

- le SIREN partagé — la même entité légale, déjà connue de l'espace ;
- nom normalisé + domaine partagés (#2265.11) — le cas Brave/Apollo, qui ne
  portent aujourd'hui ni SIREN ni nom légal par élément récupéré : deux faits
  vérifiables d'accord ensemble suffisent à NOMMER un rapprochement, jamais à
  l'ancrer (``resolve_account_entity`` ne change ni ``state`` ni
  ``canonical_id`` sur ce seul rapprochement).

Deux responsabilités distinctes, volontairement séparées : la comparaison
(pure, testée sans réseau) et la lecture Supabase (un SELECT scope-workspace,
jamais cross-espace — GA-43, le coût d'accès et l'identité ne s'agrègent
jamais entre espaces concurrents)."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from pydantic import BaseModel

from app.services.assets import website_domain
from app.services.text_norm import normalize_name


class WorkspaceAccountMatch(BaseModel):
    account_id: str
    name: str
    matched_by: str  # "siren" | "name_domain"


def _siren_digits(value: object) -> str | None:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    return digits if len(digits) == 9 else None


def match_workspace_account(
    *,
    candidates: list[Mapping[str, object]],
    siren: str | None,
    domain: str | None,
    target_name: str,
    exclude_account_id: str | None = None,
) -> WorkspaceAccountMatch | None:
    """Le premier compte de l'espace qui rapproche cette résolution.

    Le SIREN partagé gagne toujours en premier (preuve légale) ; à défaut, un
    nom normalisé ET un domaine partagés ensemble (ni l'un ni l'autre seul —
    #2265.11) le suivant. Une correspondance partielle (nom seul, ou domaine
    seul) ne rapproche RIEN : ``None``, jamais un rapprochement deviné."""
    rows = [row for row in candidates if str(row.get("id") or "") and str(row.get("id")) != (exclude_account_id or "")]

    if siren:
        for row in rows:
            if _siren_digits(row.get("siren")) == siren:
                return WorkspaceAccountMatch(
                    account_id=str(row["id"]), name=str(row.get("company_name") or ""), matched_by="siren"
                )

    normalized_target = normalize_name(target_name)
    if domain and normalized_target:
        for row in rows:
            row_domain = website_domain(row.get("website")) if row.get("website") else None
            if row_domain == domain and normalize_name(row.get("company_name")) == normalized_target:
                return WorkspaceAccountMatch(
                    account_id=str(row["id"]), name=str(row.get("company_name") or ""), matched_by="name_domain"
                )

    return None


async def fetch_workspace_account_candidates(client: Any, workspace_id: str | None) -> list[dict]:
    """Les comptes de CE MÊME espace — jamais un autre. ``[]`` sans espace
    résolu (fail-soft, comme ``workspace_scope.py`` : une portée non résolue
    ne devine jamais un espace)."""
    if not workspace_id:
        return []
    res = await (
        client.table("accounts").select("id, company_name, siren, website").eq("workspace_id", workspace_id).aexecute()
    )
    rows = getattr(res, "data", None) or []
    return [r for r in rows if isinstance(r, dict)]
