"""``POST /commercial-brief`` — le brief commercial de tout compte payant.

Chantier « briefs comptes » (01/10/2026). Appelé par l'API NestJS
(``CommercialBriefStep``) APRÈS la fin d'une analyse, hors chemin critique :
le dossier est déjà livré quand cette route tourne. Route stateless — aucune
lecture ni écriture Supabase : elle reçoit ce que le dossier a collecté et les
faits internes que l'API a résolus, et rend un ``CommercialBrief``.

Ce qu'elle garantit :

* **la sortie respecte le contrat** — JSON extrait du premier ``{`` au dernier
  ``}``, validé contre ``commercial-brief.schema.json`` (la pièce que lit aussi
  le TypeScript) puis contre le modèle pydantic ; hors contrat ⇒ 502, jamais un
  brief « à peu près » ;
* **les champs déterministes ne sont pas laissés au modèle** : ``account_name``
  (celui du dossier), ``generated_at`` (l'horloge du serveur), ``scope``
  (``france``) ;
* **hors France retiré** : un site ou une entité d'un autre pays sort du brief
  (le périmètre est une règle, pas une préférence du modèle) ;
* **sans clé de modèle, une erreur claire** (503) — jamais un brief fabriqué ;
* **aucun contenu journalisé** : la classe d'exception, les CHEMINS d'erreur de
  schéma, la taille d'entrée — jamais une valeur du dossier.

Les contrôles MÉTIER (siège contredit, entité sortie non marquée, prix moyenné,
notre propre activité…) tournent côté API, qui seule décide d'écrire.
"""

from __future__ import annotations

import json
import logging
import unicodedata
from dataclasses import dataclass, field
from datetime import UTC, datetime
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from jsonschema import Draft7Validator
from jsonschema.exceptions import ValidationError as ValidationError_
from pydantic import BaseModel, Field, ValidationError

from app.contracts.shared_schemas import VENDORED_DIR
from app.models.commercial_brief import CommercialBrief
from app.prompts.bellum_commercial_brief import build_system_prompt, build_user_prompt
from app.services.claude_service import call_claude
from app.services.commercial_brief_enrichment import enrich_missing
from app.services.llm_gateway import resolve_dispatch
from app.services.model_key_scope import KEY_SCOPE_CODE, is_key_scope_error, key_scope_response
from app.services.model_policy import model_for

logger = logging.getLogger(__name__)
router = APIRouter(tags=["CommercialBrief"])

_PROMPT_NAME = "bellum_commercial_brief"

#: Le brief BPCE fait à la main pèse ~20 000 caractères hors tableau de
#: personnes — ~6 000 tokens. 15/10/2026 : 8 000 était trop bas EN PROD (6 appels
#: sur 6 tronqués puis 502, 0 compte sur 79 avec un brief) ; 16 000 = marge x2.
#: Sous le seuil non-streaming du SDK (~21 000) et très sous le max de Sonnet.
_MAX_TOKENS = 16_000

#: UNE reprise si la sortie est coupée au plafond : plafond doublé, pas de 3e essai.
_RETRY_MAX_TOKENS = _MAX_TOKENS * 2

#: 12/10/2026 — délai de l'appel modèle. Le client texte était à 60 s : une sortie
#: de 8 000 tokens (2-3 min) était coupée pile à 60 s sur TOUTES les analyses de
#: prod (502 ``commercial_brief_failed``). 300 s = ``DEFAULT_TIMEOUT`` des autres
#: appels ; l'API attend plus longtemps (``ia.client.ts``, 360 s).
_MODEL_TIMEOUT_S = 300.0

#: Le libellé que le prompt impose quand le siège n'est établi par aucune
#: source (règle 3) — un brief sans siège ne s'écrit pas.
_UNKNOWN_HQ_CITY = "non etablie"


class CommercialBriefRequest(BaseModel):
    account_name: str = Field(min_length=1, max_length=300)
    #: Le siège résolu côté API (hiérarchie de confiance : correction humaine,
    #: registre, référentiel interne…) — ``{"value", "source"}`` ou absent.
    headquarters: dict[str, Any] | None = None
    #: Ce que les phases 1-4 ont écrit dans ``raw_analysis`` (clés de
    #: télémétrie et de notre propre activité déjà retirées par l'API).
    dossier: dict[str, Any] = Field(default_factory=dict)
    #: Faits internes de l'espace (mémoire marché, référentiel) — sans statut
    #: de prospection : ce qui décrit NOTRE activité n'entre pas.
    internal_facts: dict[str, Any] = Field(default_factory=dict)


@lru_cache(maxsize=1)
def _validator() -> Draft7Validator:
    schema = json.loads((VENDORED_DIR / "commercial-brief.schema.json").read_text(encoding="utf-8"))
    return Draft7Validator(schema)


def _extract_json(raw: object) -> dict[str, Any] | None:
    """Du premier ``{`` au dernier ``}`` (règle du dépôt), sinon ``None``."""
    text = str(raw or "")
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        parsed = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _norm(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    return " ".join("".join(c for c in text if not unicodedata.combining(c)).lower().split())


def _france_only(rows: object) -> list[Any]:
    """Retire ce qui porte un pays autre que la France — l'absence de pays
    reste (un site sans pays connu n'est pas « hors France »)."""
    if not isinstance(rows, list):
        return []
    return [row for row in rows if not (isinstance(row, dict) and row.get("country") not in (None, "FR"))]


#: Synonymes FR/EN évidents -> valeur de l'énumération (clés déjà passées par ``_norm``).
#: Une valeur absente d'ici ET de l'énumération n'est JAMAIS devinée.
_SITE_KIND_ALIASES = {
    "headquarters": "headquarters",
    "headquarter": "headquarters",
    "hq": "headquarters",
    "head office": "headquarters",
    "siege": "headquarters",
    "siege social": "headquarters",
    "secondary": "secondary",
    "secondaire": "secondary",
    "branch": "secondary",
    "agence": "secondary",
    "succursale": "secondary",
    "regional": "secondary",
    "regional office": "secondary",
    "industrial": "industrial",
    "industriel": "industrial",
    "usine": "industrial",
    "factory": "industrial",
    "plant": "industrial",
    "site industriel": "industrial",
    "other": "other",
    "autre": "other",
}
_PERSON_ROLE_ALIASES = {
    "decision maker": "decision_maker",
    "decision_maker": "decision_maker",
    "decisionnaire": "decision_maker",
    "decideur": "decision_maker",
    "decider": "decision_maker",
    "manager": "manager",
    "responsable": "manager",
    "contact": "contact",
    "external": "external",
    "externe": "external",
    "alumni": "alumni",
    "ancien": "alumni",
    "former": "alumni",
    "ex": "alumni",
}


@dataclass
class RepairReport:
    """Chemins seulement — jamais une valeur du dossier."""

    repaired: list[str] = field(default_factory=list)
    removed: list[str] = field(default_factory=list)


def _alias(value: object, aliases: dict[str, str]) -> str | None:
    key = _norm(value).replace("-", " ")
    return aliases.get(key) or aliases.get(key.replace(" ", "_"))


def repair_brief(brief: dict[str, Any]) -> RepairReport:
    """Réparation DÉTERMINISTE avant validation du schéma.

    * ``sites[].kind`` / ``people[].role`` : casse, accents, synonymes évidents
      ramenés à l'énumération ; ``kind`` non rattachable -> ``other`` (la valeur
      neutre du schéma), ``role`` non rattachable -> champ retiré (optionnel) ;
    * propriétés inconnues retirées (contrat fermé) à la racine et dans
      ``sites`` / ``people`` ;
    * un champ REQUIS omis est complété par sa valeur vide (tableau sans
      ``minItems``) ; sinon (objet, ``minItems`` > 0) il n'est PAS réparé : le 502 reste.
    """
    report = RepairReport()
    properties = _validator().schema["properties"]
    for key in [k for k in brief if k not in properties]:
        del brief[key]
        report.removed.append(key)
    for section, enum_key, aliases, neutral in (
        ("sites", "kind", _SITE_KIND_ALIASES, "other"),
        ("people", "role", _PERSON_ROLE_ALIASES, None),
    ):
        rows = brief.get(section)
        if not isinstance(rows, list):
            continue
        allowed = properties[section]["items"]["properties"]
        for i, row in enumerate(rows):
            if not isinstance(row, dict):
                continue
            for key in [k for k in row if k not in allowed]:
                del row[key]
                report.removed.append(f"{section}.{i}.{key}")
            if enum_key not in row or row[enum_key] in allowed[enum_key]["enum"]:
                continue
            fixed = _alias(row[enum_key], aliases) or neutral
            if fixed is None:
                del row[enum_key]
            else:
                row[enum_key] = fixed
            report.repaired.append(f"{section}.{i}.{enum_key}")
    # Une clé obligatoire OMISE se complète par la valeur VIDE du schéma — jamais
    # une valeur inventée. Impossible à vider (``minItems`` > 0, objet) : le 502 reste.
    for key in _validator().schema.get("required", []):
        if key in brief:
            continue
        spec = properties.get(key, {})
        if spec.get("type") == "array" and not spec.get("minItems"):
            brief[key] = []
            report.repaired.append(f"{key}(omise)")
    return report


def _error_detail(error: ValidationError_) -> str:
    """Validateur + message SANS valeur du dossier : seul ``required`` cite un
    message (il ne nomme que la clé) ; les autres disent le validateur et ce que
    le SCHÉMA attend (``type``), jamais l'instance."""
    if error.validator == "required":
        return f"required: {str(error.message)[:200]}"
    if error.validator == "type":
        return f"type: attendu {error.validator_value}"
    return str(error.validator)


def _off_contract(reason: str, paths: list[str]) -> JSONResponse:
    # Les CHEMINS seulement (« headquarters », « prices.2.channel ») — jamais
    # une valeur : elle viendrait du dossier du client.
    logger.warning("Brief commercial hors contrat (%s) : %s", reason, " | ".join(paths[:10]) or "-")
    # #4457 (IA-P) — RENDU, jamais levé : Sentry capture toute HTTPException 5xx levée, et une sortie hors
    # contrat est un cas prévu, déjà dit en warning. Même statut, même corps : l'appelant ne change pas.
    return JSONResponse(status_code=502, content={"detail": "commercial_brief_off_contract"})


@router.post("/commercial-brief", response_model=None)
async def commercial_brief(req: CommercialBriefRequest) -> dict | JSONResponse:
    model = model_for(_PROMPT_NAME)
    provider, _ = resolve_dispatch(_PROMPT_NAME, model)
    if not provider.is_available():
        # Sans clé de modèle : une erreur claire, jamais un brief inventé.
        raise HTTPException(status_code=503, detail="commercial_brief_unavailable")

    # Point 44 — « on enrichit en ligne sur ce qui manque » : une recherche web
    # ciblée, SEULEMENT sur les trous bloquants, sans clé = no-op strict.
    enrichment = await enrich_missing(req.account_name, req.headquarters, req.dossier)
    user_prompt = build_user_prompt(
        req.account_name, req.headquarters, req.dossier, req.internal_facts, web_facts=enrichment.facts
    )
    input_chars = len(user_prompt)
    max_tokens = _MAX_TOKENS
    brief = None
    for attempt in (1, 2):
        try:
            raw, usage = await call_claude(
                build_system_prompt(),
                user_prompt,
                response_model=None,
                max_tokens=max_tokens,
                prompt_name=_PROMPT_NAME,
                model=model,
                domain_knowledge=True,
                timeout=_MODEL_TIMEOUT_S,
            )
        except Exception as exc:  # noqa: BLE001 — jamais str(exc) : il peut citer le dossier
            if is_key_scope_error(exc):
                # #4473 — cause hors code (clé du service sans portée) : marquée à part, dite en français.
                logger.error("Brief commercial : %s — la clé du service n'a pas la portée requise.", KEY_SCOPE_CODE)
                return key_scope_response()
            logger.error("Brief commercial : appel modèle échoué (%s).", type(exc).__name__)
            raise HTTPException(status_code=502, detail="commercial_brief_failed") from None

        brief = _extract_json(raw)
        out_tokens = getattr(usage, "output_tokens", None)
        truncated = getattr(usage, "stop_reason", None) == "max_tokens" or (
            isinstance(out_tokens, int) and out_tokens >= max_tokens
        )
        if brief is not None and not truncated:
            break
        if attempt == 1 and truncated:
            logger.warning("Brief commercial tronqué à %d tokens : reprise unique à %d.", max_tokens, _RETRY_MAX_TOKENS)
            max_tokens = _RETRY_MAX_TOKENS
            continue
        break

    if truncated:
        # Coupé au plafond APRÈS la reprise : un JSON refermé de force n'est pas
        # « hors contrat », c'est une sortie tronquée.
        logger.warning(
            "Brief commercial : sortie TRONQUÉE au plafond de %d tokens après reprise (output_tokens=%s).",
            max_tokens,
            out_tokens,
        )
    if brief is None:
        logger.warning("Brief commercial : sortie sans objet JSON lisible (input_chars=%d).", input_chars)
        raise HTTPException(status_code=502, detail="commercial_brief_unparseable")

    # Champs déterministes : le serveur les connaît mieux que le modèle.
    brief["account_name"] = " ".join(req.account_name.split())
    brief["generated_at"] = datetime.now(UTC).isoformat()
    brief["scope"] = "france"
    brief["sites"] = _france_only(brief.get("sites"))
    brief["entities"] = _france_only(brief.get("entities"))

    report = repair_brief(brief)
    if report.repaired or report.removed:
        logger.warning(
            "Brief commercial réparé avant validation : %d valeur(s) d'énumération (%s), %d propriété(s) retirée(s) (%s).",
            len(report.repaired),
            ", ".join(report.repaired[:20]) or "-",
            len(report.removed),
            ", ".join(report.removed[:20]) or "-",
        )

    errors = sorted(_validator().iter_errors(brief), key=lambda e: list(e.absolute_path))
    if errors:
        return _off_contract(
            "tronque" if truncated else "schema",
            [f"{'.'.join(str(p) for p in e.absolute_path) or '(racine)'} [{_error_detail(e)}]" for e in errors],
        )
    try:
        CommercialBrief.model_validate(brief)
    except ValidationError as exc:
        return _off_contract("model", [".".join(str(p) for p in err["loc"]) for err in exc.errors()])

    if _norm(brief["headquarters"].get("city")) == _UNKNOWN_HQ_CITY:
        logger.warning("Brief commercial non produit : siège non établi (input_chars=%d).", input_chars)
        raise HTTPException(status_code=422, detail="commercial_brief_headquarters_unknown")

    logger.info(
        "Brief commercial produit (input_chars=%d, input_tokens=%s, output_tokens=%s).",
        input_chars,
        getattr(usage, "input_tokens", None),
        getattr(usage, "output_tokens", None),
    )
    return {
        "success": True,
        "data": {
            "brief": brief,
            "input_chars": input_chars,
            "cost_usd": getattr(usage, "cost_usd", None),
            "enrichment": {"gaps": enrichment.gaps, "queries": enrichment.queries, "facts": len(enrichment.facts)},
        },
    }
