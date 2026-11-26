"""``POST /dossier-blocks`` — #4078, parité démo : les blocs 01 / 14 / 15.

Appelé par l'API NestJS (``DossierBlocksStep``) APRÈS la fin d'une analyse,
hors chemin critique, avant le brief commercial. Route stateless — aucune
lecture ni écriture Supabase : elle reçoit ce que le dossier a collecté et rend
trois listes de notes à la forme ``keyNoteSchema``.

Ce qu'elle garantit :

* **un seul appel modèle** pour les trois blocs, sur le modèle de l'étape voisine ;
* **dossier vide ⇒ trois listes vides, sans appel** (rien à lire, rien à payer) ;
* **forme exacte** : chaque note porte les huit clés du contrat ; une note sans
  libellé est jetée ; ``amount``/``currency``/``period`` imposés à ``null`` —
  un chiffre ne se laisse pas au modèle ;
* **sans clé de modèle, une erreur claire** (503) ; sortie illisible ⇒ 502 ;
* **aucun contenu journalisé** : classe d'exception et tailles seulement.

Le filtre des sources nommées (fournisseurs) et l'écriture « seulement les clés
absentes » vivent côté API, seul endroit qui décide d'écrire.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.prompts.bellum_dossier_blocks import build_system_prompt, build_user_prompt
from app.routers.commercial_brief import _MODEL_TIMEOUT_S
from app.services.claude_service import call_claude
from app.services.llm_gateway import resolve_dispatch
from app.services.model_key_scope import KEY_SCOPE_CODE, is_key_scope_error, key_scope_response
from app.services.model_policy import model_for

logger = logging.getLogger(__name__)
router = APIRouter(tags=["DossierBlocks"])

_PROMPT_NAME = "bellum_dossier_blocks"

#: Trois blocs de 8 notes au plus, ~120 tokens par note : ~3 000 tokens. 16/10/2026 :
#: 4 000 était tronqué EN PROD (502, rien d'écrit) -> 8 000 + UNE reprise doublée.
_MAX_TOKENS = 8_000
_RETRY_MAX_TOKENS = _MAX_TOKENS * 2

#: Les trois clés de ``raw_analysis`` produites ici (les blocs 16 et 17 sont
#: calculés côté API, sans modèle).
BLOCK_KEYS = ("structural_reading_axes", "ecosystem_third_parties", "opportunity_domains")

_MAX_NOTES_PER_BLOCK = 8
_TEXT_FIELDS = ("label", "constat", "interpretation", "implication", "reliability")


class DossierBlocksRequest(BaseModel):
    account_name: str = Field(min_length=1, max_length=300)
    #: Ce que les phases 1-4 ont écrit dans ``raw_analysis`` (liste blanche côté API).
    dossier: dict[str, Any] = Field(default_factory=dict)


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


def _text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = " ".join(value.split())
    return cleaned or None


def _notes(value: object) -> list[dict[str, Any]]:
    """La forme ``keyNoteSchema`` exacte — une note sans libellé ne fait aucune ligne."""
    if not isinstance(value, list):
        return []
    notes: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        note: dict[str, Any] = {field: _text(item.get(field)) for field in _TEXT_FIELDS}
        if note["label"] is None:
            continue
        # #4078 — un chiffre ne se laisse pas au modèle : seul le bloc 16
        # (calculé depuis les comptes publiés, côté API) en porte.
        note.update(amount=None, currency=None, period=None)
        notes.append(note)
    return notes[:_MAX_NOTES_PER_BLOCK]


@router.post("/dossier-blocks", response_model=None)
async def dossier_blocks(req: DossierBlocksRequest) -> dict | JSONResponse:
    model = model_for(_PROMPT_NAME)
    provider, _ = resolve_dispatch(_PROMPT_NAME, model)
    if not provider.is_available():
        raise HTTPException(status_code=503, detail="dossier_blocks_unavailable")

    if not req.dossier:
        # Rien de collecté : rien à lire, rien à payer — trois blocs vides.
        return {
            "success": True,
            "data": {"blocks": {key: [] for key in BLOCK_KEYS}, "input_chars": 0, "cost_usd": None},
        }

    user_prompt = build_user_prompt(req.account_name, req.dossier)
    input_chars = len(user_prompt)
    max_tokens = _MAX_TOKENS
    parsed = None
    for attempt in (1, 2):
        try:
            raw, usage = await call_claude(
                build_system_prompt(),
                user_prompt,
                response_model=None,
                max_tokens=max_tokens,
                prompt_name=_PROMPT_NAME,
                model=model,
                timeout=_MODEL_TIMEOUT_S,
            )
        except Exception as exc:  # noqa: BLE001 — jamais str(exc) : il peut citer le dossier
            if is_key_scope_error(exc):
                # #4473 — cause hors code (clé du service sans portée) : marquée à part, dite en français.
                logger.error("Blocs du dossier : %s — la clé du service n'a pas la portée requise.", KEY_SCOPE_CODE)
                return key_scope_response()
            logger.error("Blocs du dossier : appel modèle échoué (%s).", type(exc).__name__)
            raise HTTPException(status_code=502, detail="dossier_blocks_failed") from None

        parsed = _extract_json(raw)
        out_tokens = getattr(usage, "output_tokens", None)
        truncated = getattr(usage, "stop_reason", None) == "max_tokens" or (
            isinstance(out_tokens, int) and out_tokens >= max_tokens
        )
        if parsed is not None and not truncated:
            break
        if attempt == 1 and truncated:
            logger.warning(
                "Blocs du dossier tronqués à %d tokens : reprise unique à %d.", max_tokens, _RETRY_MAX_TOKENS
            )
            max_tokens = _RETRY_MAX_TOKENS
            continue
        break

    if parsed is None:
        logger.warning("Blocs du dossier : sortie sans objet JSON lisible (input_chars=%d).", input_chars)
        raise HTTPException(status_code=502, detail="dossier_blocks_unparseable")

    blocks = {key: _notes(parsed.get(key)) for key in BLOCK_KEYS}
    logger.info(
        "Blocs du dossier produits (input_chars=%d, notes=%s).",
        input_chars,
        {key: len(notes) for key, notes in blocks.items()},
    )
    return {
        "success": True,
        "data": {"blocks": blocks, "input_chars": input_chars, "cost_usd": getattr(usage, "cost_usd", None)},
    }
