"""``POST /search/extract-entity`` — #2810 : extraire un nom d'entreprise d'une
phrase en langage naturel, pour préremplir `/search`.

Appelé par l'API NestJS en tâche du composer (jamais directement par le
navigateur, comme toutes les routes derrière le secret interne), quand le
commercial arme le lanceur « Analyser une entreprise » et tape une phrase
plutôt qu'un nom seul — avant ce chantier, `launcher-intent.ts` préremplissait
`/search?company=` avec le texte TEL QUEL (#2149.12, #2149.25).

Ce qu'elle garantit :

* **le modèle léger** de la table (`model_for("bellum_search_entity_extract")`,
  Haiku par défaut, surchargeable par `MODEL_BELLUM_SEARCH_ENTITY_EXTRACT`) ;
* **sans clé de modèle, rien ne part** — `company: null`, zéro appel réseau ;
* **un nom qui n'est pas recopié mot pour mot de la phrase tapée vaut `None`**
  (`accept_entity`, ancrage côté serveur) : jamais un nom deviné ou corrigé —
  doctrine « jamais de donnée fictive » ;
* **un échec ne journalise aucun contenu** : la classe de l'exception, rien
  d'autre — le texte d'une erreur de fournisseur peut recopier la phrase tapée.

Ce qu'elle NE fait pas : décider si le texte MÉRITE une extraction (une phrase
déjà composée d'un seul mot n'a besoin de rien) — cette décision, gratuite et
sans appel réseau, vit côté web (`launcher-entity-resolution.ts`), qui reste le
seul repli si cet appel échoue : le texte tapé, inchangé.
"""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.prompts.bellum_search_entity_extract import build_system_prompt, build_user_prompt
from app.services.claude_service import call_claude
from app.services.llm_gateway import resolve_dispatch
from app.services.model_policy import model_for
from app.services.search_entity_extraction import accept_entity, clean_entity

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/search", tags=["Search"])

_PROMPT_NAME = "bellum_search_entity_extract"

#: Un nom d'entreprise tient largement dans quelques mots — la marge couvre un
#: modèle qui ajoute un habillage (guillemets, préfixe) que `clean_entity` retire.
_MAX_TOKENS = 40


class SearchEntityExtractRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2_000)
    locale: Literal["fr", "en"] = "fr"


@router.post("/extract-entity")
async def extract_search_entity(req: SearchEntityExtractRequest) -> dict:
    # #2810 — sans clé de modèle, no-op strict : le texte tapé reste tel quel
    # côté appelant, jamais un nom deviné.
    model = model_for(_PROMPT_NAME)
    provider, _ = resolve_dispatch(_PROMPT_NAME, model)
    if not provider.is_available():
        return {"success": True, "data": {"company": None}}

    try:
        raw, _usage = await call_claude(
            build_system_prompt(),
            build_user_prompt(req.text, req.locale),
            response_model=None,
            max_tokens=_MAX_TOKENS,
            prompt_name=_PROMPT_NAME,
            model=model,
            # Un appel isolé : un cache écrit ici ne serait jamais relu.
            cache_system=False,
            # CACHE-LLM (15/10) — classe A : la sortie ne dépend que du texte tapé
            # et n'est qu'un nom de société ; gardée, commune à tous les espaces.
            response_cache=True,
        )
    except Exception as exc:  # noqa: BLE001 — une extraction manquée ne casse rien
        # ⚠️ Jamais `str(exc)` : le message d'une erreur de fournisseur peut
        # recopier la phrase tapée par le commercial.
        logger.error(
            "Extraction d'entité non réalisée (%s) — le texte tapé reste inchangé côté appelant.",
            type(exc).__name__,
        )
        raise HTTPException(status_code=502, detail="search_entity_extract_failed") from None

    company = accept_entity(clean_entity(str(raw or "")), req.text)
    return {"success": True, "data": {"company": company}}
