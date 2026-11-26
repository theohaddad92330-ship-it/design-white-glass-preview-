"""L'évaluation de la grille de qualification de l'espace contre un dossier (#3755.3).

Appelé en interne par NestJS (`apps/api/src/modules/qualification-grid/
qualification-evaluator.client.ts`) en fin d'analyse ou à la demande. Rend une
évaluation par critère de la grille — `pass` / `fail` / `scored` /
`not_evaluable` — chacune avec sa preuve.

Le service tient la doctrine AVANT et APRÈS le modèle, pas seulement dans le
prompt :
- les critères INTERNES (staffing, appétence, avant-vente, budget validé) sont
  `not_evaluable` d'office et ne sont pas envoyés — miroir de
  `isInternalQualificationCriterion` (`@bellum/contracts`) ;
- une évaluation sans preuve redevient `not_evaluable` (jamais 0) ;
- un statut incompatible avec le type, des points hors bornes, un code hors grille
  sont corrigés ou écartés. L'API re-vérifie tout cela à la réception.
"""

from __future__ import annotations

import logging
import re
from typing import Any

from app.prompts import bellum_qualification as prompt
from app.services.claude_service import call_claude
from app.services.model_policy import model_for

logger = logging.getLogger(__name__)

#: La clé enregistrée dans `PROMPT_MODELS` (`model_policy.py`).
PROMPT_NAME = "bellum_qualification"

#: Miroir de `INTERNAL_PATTERNS` (`packages/contracts/src/schemas/qualification-grid.ts`).
INTERNAL_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"staff", re.I),
    re.compile(r"app[ée]tence", re.I),
    re.compile(r"appetite", re.I),
    re.compile(r"avant[- ]vente", re.I),
    re.compile(r"pre[- ]?sales?", re.I),
    re.compile(r"budget\s+valid", re.I),
    re.compile(r"validated\s+budget", re.I),
)

_STATUSES = {"pass", "fail", "scored", "not_evaluable"}


def is_internal(label: str) -> bool:
    return any(p.search(label or "") for p in INTERNAL_PATTERNS)


def _not_evaluable(code: str) -> dict[str, Any]:
    return {"code": code, "status": "not_evaluable", "points": None, "evidence": None}


def _clean(criterion: dict[str, Any], raw: dict[str, Any] | None) -> dict[str, Any]:
    code = str(criterion.get("code"))
    if not isinstance(raw, dict):
        return _not_evaluable(code)
    status = raw.get("status")
    evidence = raw.get("evidence")
    evidence = evidence.strip() if isinstance(evidence, str) else ""
    if status not in _STATUSES or status == "not_evaluable" or not evidence:
        return _not_evaluable(code)
    kind = criterion.get("kind")
    if kind == "eliminatory":
        if status not in ("pass", "fail"):
            return _not_evaluable(code)
        return {"code": code, "status": status, "points": None, "evidence": evidence}
    weight = float(criterion.get("weight") or 0)
    if status == "pass":
        points: float | None = weight
    elif status == "fail":
        points = 0
    else:
        raw_points = raw.get("points")
        if not isinstance(raw_points, (int, float)) or isinstance(raw_points, bool):
            return _not_evaluable(code)
        points = min(max(float(raw_points), 0.0), weight)
    if points is not None and float(points).is_integer():
        points = int(points)
    return {"code": code, "status": "scored", "points": points, "evidence": evidence}


async def evaluate_grid(
    account_name: str,
    dossier: dict[str, Any],
    criteria: list[dict[str, Any]],
    signals: dict[str, Any],
) -> list[dict[str, Any]]:
    """Une évaluation par critère, dans l'ordre de la grille. Ne lève que pour une
    panne du modèle (réseau, 5xx) — à l'appelant de la traduire en 502."""
    external = [c for c in criteria if not is_internal(str(c.get("label", "")))]
    by_code: dict[str, dict[str, Any]] = {}
    if external:
        result, _usage = await call_claude(
            prompt.build_system_prompt(),
            prompt.build_user_prompt(account_name, dossier, external, signals),
            response_model=dict,
            max_tokens=4000,
            prompt_name=PROMPT_NAME,
            model=model_for(PROMPT_NAME),
        )
        payload = result if isinstance(result, dict) else {}
        items = payload.get("evaluations")
        for item in items if isinstance(items, list) else []:
            if isinstance(item, dict) and isinstance(item.get("code"), str):
                by_code.setdefault(item["code"], item)

    out: list[dict[str, Any]] = []
    for c in criteria:
        code = str(c.get("code"))
        if is_internal(str(c.get("label", ""))):
            out.append(_not_evaluable(code))
        else:
            out.append(_clean(c, by_code.get(code)))
    return out
