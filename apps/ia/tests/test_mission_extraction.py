"""La lecture automatique d'un document de mission (#2560).

Ce que ces tests protègent, dans l'ordre des règles du lot :

1. **Un champ à faible confiance reste VIDE**, jamais affiché comme lu.
2. **Le parsing ne fait jamais confiance à une citation introuvable** — une
   valeur affirmée sans preuve retrouvable dans le texte est écartée, comme
   pour `bellum_cv_parse` et `expense_extraction`.
3. **Un texte trop long est refusé AVANT tout appel de modèle** (le coût).
4. **Un texte illisible (aucun texte, fichier vide) ne fait aucun appel.**
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.services import mission_extraction as target
from app.services.claude_service import TokenUsage

DOCUMENT_TEXT = (
    "Fiche de mission — Acme Corp\n"
    "Poste : Développeur backend Python\n"
    "Début : 2026-10-01\n"
    "Fin prévue : 2027-03-31\n"
    "TJM : 550 euros\n"
    "Volume : 120 jours\n"
)


def _usage(cost_usd: float = 0.0013, cost_known: bool = True) -> TokenUsage:
    return TokenUsage(
        input_tokens=600,
        output_tokens=110,
        model="claude-haiku-4-5",
        cost_usd=cost_usd,
        cost_known=cost_known,
    )


def _model_payload(**overrides: object) -> dict:
    payload = {
        "account_name": {"value": "Acme Corp", "confidence": 0.95, "source_excerpt": "Fiche de mission — Acme Corp"},
        "role_title": {
            "value": "Développeur backend Python",
            "confidence": 0.92,
            "source_excerpt": "Poste : Développeur backend Python",
        },
        "started_on": {"value": "2026-10-01", "confidence": 0.9, "source_excerpt": "Début : 2026-10-01"},
        "ends_on": {"value": "2027-03-31", "confidence": 0.9, "source_excerpt": "Fin prévue : 2027-03-31"},
        "daily_rate": {"value": 550, "confidence": 0.88, "source_excerpt": "TJM : 550 euros"},
        "days": {"value": 120, "confidence": 0.85, "source_excerpt": "Volume : 120 jours"},
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_extract_returns_a_proposal_for_a_readable_document() -> None:
    with patch(
        "app.services.mission_extraction.call_claude",
        new_callable=AsyncMock,
        return_value=(_model_payload(), _usage()),
    ):
        result = await target.extract(DOCUMENT_TEXT)
    assert result.status == target.STATUS_OK
    assert result.fields["account_name"].value == "Acme Corp"
    assert result.fields["daily_rate"].value == 550
    assert result.fields["days"].value == 120
    assert result.cost_usd == 0.0013


@pytest.mark.asyncio
async def test_low_confidence_field_is_dropped() -> None:
    """« Un TJM lu à 90 % de confiance n'est PAS un TJM » — sous le seuil, le
    champ reste `null`, jamais affiché comme lu."""
    with patch(
        "app.services.mission_extraction.call_claude",
        new_callable=AsyncMock,
        return_value=(_model_payload(daily_rate={"value": 550, "confidence": 0.2, "source_excerpt": "TJM : 550 euros"}), _usage()),
    ):
        result = await target.extract(DOCUMENT_TEXT)
    assert result.status == target.STATUS_OK
    assert result.fields["daily_rate"].value is None


@pytest.mark.asyncio
async def test_a_citation_not_found_in_the_text_is_rejected() -> None:
    """Citer de mémoire est ce qu'un modèle fait quand il ne trouve pas — la
    même garde que `bellum_cv_parse` et `expense_extraction`."""
    with patch(
        "app.services.mission_extraction.call_claude",
        new_callable=AsyncMock,
        return_value=(
            _model_payload(
                account_name={"value": "Une autre entreprise", "confidence": 0.9, "source_excerpt": "phrase inventée"}
            ),
            _usage(),
        ),
    ):
        result = await target.extract(DOCUMENT_TEXT)
    assert result.fields["account_name"].value is None


@pytest.mark.asyncio
async def test_a_vague_date_never_becomes_a_number_of_days() -> None:
    """Sans nombre de jours ÉCRIT, `days` reste `null` — jamais calculé sur une
    durée en mois."""
    with patch(
        "app.services.mission_extraction.call_claude",
        new_callable=AsyncMock,
        return_value=(_model_payload(days={"value": None, "confidence": 0.0, "source_excerpt": ""}), _usage()),
    ):
        result = await target.extract("Mission de 6 mois chez Acme Corp, TJM 550 euros.")
    assert result.fields["days"].value is None


@pytest.mark.asyncio
async def test_unreadable_document_makes_zero_network_calls() -> None:
    with patch("app.services.mission_extraction.call_claude", new_callable=AsyncMock) as mocked_claude:
        result = await target.extract(None, b"", "vide.txt")
    mocked_claude.assert_not_called()
    assert result.status == target.STATUS_UNREADABLE
    assert result.cost_usd is None


@pytest.mark.asyncio
async def test_a_too_long_text_is_refused_before_any_model_call() -> None:
    with patch("app.services.mission_extraction.call_claude", new_callable=AsyncMock) as mocked_claude:
        result = await target.extract("x" * (target._MAX_TEXT_CHARS + 1))
    mocked_claude.assert_not_called()
    assert result.status == target.STATUS_TOO_LARGE


@pytest.mark.asyncio
async def test_a_model_failure_is_not_swallowed_into_an_empty_proposal() -> None:
    """Une panne du modèle structurant remonte une exception — à l'appelant
    (le routeur) de la traduire en 502, jamais un statut métier inventé."""
    with patch(
        "app.services.mission_extraction.call_claude",
        new_callable=AsyncMock,
        side_effect=RuntimeError("Anthropic indisponible"),
    ), pytest.raises(RuntimeError):
        await target.extract(DOCUMENT_TEXT)


SUPERVISED_TEXT = (
    "Fiche de mission — Acme Corp\n"
    "Forfait : nous cadrons et supervisons le projet, réalisé par les équipes internes du client, sans consultants.\n"
)


@pytest.mark.asyncio
async def test_supervised_forfait_is_proposed_only_with_a_citation() -> None:
    """X66 / #3547 — un document qui dit que le forfait est réalisé par les salariés du
    client PROPOSE le forfait encadré, avec sa citation ; jamais sans."""
    payload = _model_payload(
        supervised_forfait={
            "value": "supervised",
            "confidence": 0.9,
            "source_excerpt": "nous cadrons et supervisons le projet, réalisé par les équipes internes du client",
        }
    )
    with patch(
        "app.services.mission_extraction.call_claude", new_callable=AsyncMock, return_value=(payload, _usage())
    ):
        result = await target.extract(SUPERVISED_TEXT)
    assert result.fields["supervised_forfait"].value == "supervised"
    assert result.to_dict()["fields"]["supervisedForfait"]["value"] == "supervised"


@pytest.mark.asyncio
async def test_supervised_forfait_without_a_found_citation_stays_empty() -> None:
    payload = _model_payload(
        supervised_forfait={"value": "supervised", "confidence": 0.95, "source_excerpt": "citation inventée"}
    )
    with patch(
        "app.services.mission_extraction.call_claude", new_callable=AsyncMock, return_value=(payload, _usage())
    ):
        result = await target.extract(SUPERVISED_TEXT)
    assert result.fields["supervised_forfait"].value is None
    assert result.to_dict()["fields"]["supervisedForfait"]["value"] is None


@pytest.mark.asyncio
async def test_supervised_forfait_only_accepts_the_known_value() -> None:
    payload = _model_payload(
        supervised_forfait={"value": "oui", "confidence": 0.95, "source_excerpt": "Forfait : nous cadrons"}
    )
    with patch(
        "app.services.mission_extraction.call_claude", new_callable=AsyncMock, return_value=(payload, _usage())
    ):
        result = await target.extract(SUPERVISED_TEXT)
    assert result.fields["supervised_forfait"].value is None
