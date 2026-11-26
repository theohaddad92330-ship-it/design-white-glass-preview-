"""LA COMPILATION D'UN BESOIN DEPUIS UN TEXTE COLLÉ (#2939, #2174.3/.5).

─────────────────────────────────────────────────────────────────────────────
CE CHANTIER N'AJOUTE PAS DE SECOND COMPILATEUR
─────────────────────────────────────────────────────────────────────────────
`compile_need` (`compilers/need_compiler.py`) existe depuis #2322 et sert déjà
la carte de Laura côté chat : il VÉRIFIE des énoncés déjà extraits (un champ,
sa valeur, sa citation) et les compile en proposition. Ce module ne le
réécrit pas — il lui fournit la même matière que le modèle de `/chat`
produit d'habitude, mais pour un texte collé À L'ÉTAPE 1 du wizard, où
aucune conversation n'a encore eu lieu.

Le chemin est CELUI de `mission_extraction.py` / `rfp.py` : un texte, un
appel de modèle, un plafond de caractères avant tout appel payant.
"""

from __future__ import annotations

import logging
from typing import Any

from app.prompts import bellum_need_compile_text as prompt
from app.services.claude_service import call_claude
from app.services.compilers.need_compiler import SOURCE_KINDS, compile_need
from app.services.model_policy import model_for

logger = logging.getLogger(__name__)

#: Nommé explicitement — la clé enregistrée dans `PROMPT_MODELS`
#: (`model_policy.py`) et lue par `test_every_prompt_is_registered`.
PROMPT_NAME = "need_compile_text"

#: Un brief ou un e-mail collé tient sur quelques paragraphes ; au-delà, on
#: REFUSE l'appel plutôt que de payer un prompt qui ne rendrait rien
#: d'exploitable — même garde que `mission_extraction._MAX_TEXT_CHARS`.
_MAX_TEXT_CHARS = 20_000

#: #2174.3/.5 — seuls ces deux modes d'entrée passent par CE chemin. `email`
#: et `free_brief` existent déjà dans `SOURCE_KINDS` (#2322.2/.3) ; ce module
#: n'en ouvre aucun troisième.
ALLOWED_SOURCE_KINDS: tuple[str, ...] = ("free_brief", "email")


async def compile_text(text: str, source_kind: str) -> dict[str, Any]:
    """Lit un texte collé et rend ce que `compile_need` en tire — ou pourquoi
    elle ne peut pas.

    Ne lève JAMAIS pour un motif métier : `{"error": "..."}` couvre tout ce
    qui n'est pas une panne de transport, exactement comme `compile_need`
    lui-même. Seule une panne du modèle (réseau, 5xx) remonte une exception —
    à l'appelant (le routeur) de la traduire en 502.
    """
    trimmed = (text or "").strip()
    if not trimmed:
        return {"error": "Aucun texte à compiler."}
    if source_kind not in ALLOWED_SOURCE_KINDS:
        return {"error": f"Source non prise en charge ici : {source_kind!r}."}
    if len(trimmed) > _MAX_TEXT_CHARS:
        logger.warning(
            "Compilation de besoin refusée : %d caractères, au-delà de la borne de %d",
            len(trimmed),
            _MAX_TEXT_CHARS,
        )
        return {"error": "Ce texte est trop long pour être compilé — colle un extrait plus court."}

    result, _usage = await call_claude(
        prompt.build_system_prompt(),
        prompt.build_user_prompt(trimmed, source_kind),
        response_model=dict,
        max_tokens=3000,
        prompt_name=PROMPT_NAME,
        model=model_for(PROMPT_NAME),
        domain_knowledge=True,
    )
    payload = result if isinstance(result, dict) else {}

    assert source_kind in SOURCE_KINDS  # #2322.2/.3 — garde de cohérence, jamais un troisième kind deviné ici.
    tool_input: dict[str, Any] = {
        "source": {"kind": source_kind},
        "company": payload.get("company"),
        "statements": payload.get("statements"),
        "people": payload.get("people"),
        "unknowns": payload.get("unknowns"),
        "confirmation_level": payload.get("confirmation_level"),
    }
    return compile_need(tool_input)
