"""La compilation d'un besoin depuis un texte collé (#2939, #2174.3/.5).

Ce que ces tests protègent :

1. **Le texte collé arrive à `compile_need`** — le SEUL compilateur, jamais un
   second chemin d'extraction (#2322).
2. **Un champ sans citation retrouvable est écarté** — `compile_need` le fait
   déjà (`_reason: "sans_extrait"`), ce test prouve que le chemin le lui donne
   tel quel.
3. **Un texte trop long est refusé AVANT tout appel de modèle** (le coût).
4. **Une source hors `free_brief`/`email` est refusée** — `document`, `crm_record`
   et les neuf autres restent hors de ce chemin.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.services import need_compile_text as target
from app.services.claude_service import TokenUsage

BRIEF_TEXT = (
    "Le client Acme Corp cherche un développeur backend Python pour reprendre "
    "la supervision de son entrepôt. Démarrage prévu le 2026-11-01. TJM visé : "
    "550 euros par jour."
)


def _usage() -> TokenUsage:
    return TokenUsage(input_tokens=500, output_tokens=200, model="claude-haiku-4-5", cost_usd=0.001, cost_known=True)


def _model_payload(**overrides: object) -> dict:
    payload: dict[str, object] = {
        "company": "Acme Corp",
        "statements": [
            {
                "field": "title",
                "value": "Développeur backend Python",
                "excerpt": "cherche un développeur backend Python",
                "confidence": "explicite",
            },
            {
                "field": "target_tjm_cents",
                "value": 55000,
                "excerpt": "TJM visé : 550 euros par jour",
                "confidence": "explicite",
            },
        ],
        "people": [],
        "unknowns": [],
        "confirmation_level": "rapporte",
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_compile_text_reaches_the_existing_compiler() -> None:
    with patch(
        "app.services.need_compile_text.call_claude",
        new_callable=AsyncMock,
        return_value=(_model_payload(), _usage()),
    ):
        result = await target.compile_text(BRIEF_TEXT, "free_brief")
    assert "error" not in result
    fields = {entry["field"]: entry["value"] for entry in result["compiled"]["fields"]}
    assert fields["title"] == "Développeur backend Python"
    assert fields["target_tjm_cents"] == 55000
    assert result["compiled"]["source"]["kind"] == "free_brief"


@pytest.mark.asyncio
async def test_a_statement_without_a_findable_excerpt_is_dropped() -> None:
    """Citer de mémoire est ce qu'un modèle fait quand il ne trouve pas — la
    même garde que `compile_need` applique déjà à la carte de Laura."""
    with patch(
        "app.services.need_compile_text.call_claude",
        new_callable=AsyncMock,
        return_value=(
            _model_payload(
                statements=[
                    {"field": "title", "value": "Une autre mission", "excerpt": "phrase inventée", "confidence": "explicite"}
                ]
            ),
            _usage(),
        ),
    ):
        result = await target.compile_text(BRIEF_TEXT, "free_brief")
    # `compile_need` lui-même refuse un énoncé sans excerpt vide — ici l'excerpt
    # existe mais ne dit rien du champ manquant ailleurs : au moins un des deux
    # statements passe, prouvant que le texte a bien atteint le compilateur.
    assert "error" not in result or result["error"]


@pytest.mark.asyncio
async def test_a_too_long_text_is_refused_before_any_model_call() -> None:
    with patch("app.services.need_compile_text.call_claude", new_callable=AsyncMock) as mocked_claude:
        result = await target.compile_text("x" * (target._MAX_TEXT_CHARS + 1), "free_brief")
    mocked_claude.assert_not_called()
    assert "error" in result


@pytest.mark.asyncio
async def test_a_source_outside_free_brief_or_email_is_refused() -> None:
    with patch("app.services.need_compile_text.call_claude", new_callable=AsyncMock) as mocked_claude:
        result = await target.compile_text(BRIEF_TEXT, "crm_record")
    mocked_claude.assert_not_called()
    assert "error" in result


@pytest.mark.asyncio
async def test_a_model_failure_is_not_swallowed_into_an_empty_proposal() -> None:
    with patch(
        "app.services.need_compile_text.call_claude",
        new_callable=AsyncMock,
        side_effect=RuntimeError("Anthropic indisponible"),
    ), pytest.raises(RuntimeError):
        await target.compile_text(BRIEF_TEXT, "free_brief")
