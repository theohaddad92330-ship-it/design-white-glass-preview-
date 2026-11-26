"""Deterministic first-touch guard: the board is not a cold entry door.

Definition of Done (annexe organigramme p32, annexe méthodo p31): *« board /
administrateur jamais recommandé en 1re approche sans relation/sponsor »*. The
prompts already say it; nothing enforced it. A model that ranks by seniority
happily opened a cold account on its chairman — the single fastest way to burn
the account for a small ESN.

The rule is applied to the emitted ``recommendedPath`` because that is the object
the seller acts on. It is deliberately conservative:

- it never invents, deletes or re-labels a contact — it only **reorders**;
- it fires only on a cold account (no relation, no sponsor, unknown = cold);
- with nothing operational to promote (a board-only path) it leaves the path
  alone: hiding the only contacts found would be a worse answer than showing
  them. That case is a coverage gap, not an ordering problem.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any

# L0 in the OrgGraph ontology = gouvernance (board / président / administrateur /
# conseil). ``hierarchy_level.py`` classifies the title; this module only reads
# the level the graph already carries.
_GOVERNANCE_LEVEL = "L0"

# #2312.22 (épopée #2963) — anti-séniorité étendue : un « VP groupe » / « CTO
# mondial » / « directeur corporate » est classé L1 (c_level,
# hierarchy_level.py) au même titre qu'un CTO local — le niveau seul ne les
# distingue pas. NARROW par construction (même discipline que
# `hierarchy_level._GOVERNANCE_RE`) : seul le CROISEMENT d'un rôle exécutif ET
# d'une portée groupe/mondiale démote — un « CTO France » reste une porte
# valable. Lu sur `title`, jamais deviné depuis le seul niveau.
_SENIOR_ROLE_RE = re.compile(
    r"\b(vp|vice[\s-]?pr[ée]sident[e]?|cto|ceo|coo|cio|cfo|directeur|directrice|dg|pr[ée]sident[e]?|chief)\b",
    re.IGNORECASE,
)
_GROUP_SCOPE_RE = re.compile(
    r"\b(groupe|group|mondial[e]?|monde|corporate|global[e]?|international[e]?)\b",
    re.IGNORECASE,
)


def _is_group_scope_executive(title: str | None) -> bool:
    t = title or ""
    return bool(_SENIOR_ROLE_RE.search(t) and _GROUP_SCOPE_RE.search(t))


#: A relationship state that provides a relation or a sponsor — the exception the
#: DoD carves out. Mirrors ``sales_context.RELATIONSHIP_STATES`` minus ``froid``:
#: every other state means somebody already knows the account (or us).
WARM_RELATIONSHIP_STATES: frozenset[str] = frozenset(
    {
        "connu",
        "linkedin",
        "dormant",
        "refere",
        "ancien_client",
        "rang2",
        "client_actif",
        "besoin_ouvert",
        # #2371.4 — une ESN partenaire avec des placements en cours : relation établie.
        "partenaire_actif",
    }
)


def has_relation_or_sponsor(relationship_state: str | None) -> bool:
    """True when the account carries a relation or a sponsor.

    ``froid``, an empty value, an unknown value and a missing SalesContext all
    read as cold — the safe default IS the rule, so a caller that cannot resolve
    the relationship still gets the guard.
    """
    return str(relationship_state or "").strip().lower() in WARM_RELATIONSHIP_STATES


def demote_governance_first_touch(
    path: Sequence[Mapping[str, Any]],
    people: Sequence[Mapping[str, Any]],
    *,
    relationship_state: str | None = None,
) -> list[dict[str, Any]]:
    """Move L0 governance steps — and a group-scope C-level executive (#2312.22,
    « VP groupe »/« CTO mondial »/« directeur corporate ») — behind the
    operational ones on a cold account.

    Returns a new list (the input is never mutated) with ``step`` renumbered
    contiguously from 1, as the contract requires. Warm account, no governance
    seat in the path, or nothing operational to promote → the path is returned
    unchanged, element for element.
    """
    steps = [dict(s) for s in path]
    if has_relation_or_sponsor(relationship_state):
        return steps

    person_by_id = {str(p.get("id")): p for p in people if p.get("id")}

    def _is_governance(step: Mapping[str, Any]) -> bool:
        # An id absent from ``people`` has no known level: never ASSUME governance.
        person = person_by_id.get(str(step.get("personId")))
        if person is None:
            return False
        if str(person.get("hierarchyLevel") or "") == _GOVERNANCE_LEVEL:
            return True
        return _is_group_scope_executive(person.get("title"))

    governance = [s for s in steps if _is_governance(s)]
    operational = [s for s in steps if not _is_governance(s)]
    # Nothing to demote, or nothing to promote in its place.
    if not governance or not operational:
        return steps

    reordered = operational + governance
    for i, step in enumerate(reordered):
        step["step"] = i + 1
    return reordered
