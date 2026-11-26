"""#2433.4 — la preuve VISUELLE d'un champ lu : la zone de l'image où il a été lu.

Ce que ces tests protègent :

1. **Une zone hors de l'image, vide ou illisible est écartée** — jamais
   « corrigée » en une zone plausible (`parse_region`).
2. **Seul un champ qui porte une valeur reçoit une zone** ; l'absence ne fait
   aucune zone (doctrine : on n'affiche pas ce qu'on n'a pas).
3. **Une panne de la localisation ne fait JAMAIS échouer la lecture** : le champ
   reste lu, sans zone — la preuve texte (`source_excerpt`) demeure.
4. **Un fichier qui n'est pas une image n'appelle jamais le modèle de vision.**
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.services import expense_extraction as extraction
from app.services import vision_regions as target
from app.services.claude_service import TokenUsage

PNG = b"\x89PNG\r\n\x1a\n" + b"\xff" * 200
RECEIPT_TEXT = "HOTEL IBIS\nTotal TTC : 89,00 EUR\nDate : 12/03/2026\n"


def _usage() -> TokenUsage:
    return TokenUsage(input_tokens=900, output_tokens=60, model="claude-haiku-4-5", cost_usd=0.002, cost_known=True)


def test_parse_region_accepts_a_box_inside_the_image() -> None:
    assert target.parse_region({"x": 0.1, "y": 0.2, "w": 0.5, "h": 0.05}) == {"x": 0.1, "y": 0.2, "w": 0.5, "h": 0.05}


@pytest.mark.parametrize(
    "raw",
    [
        None,
        "x",
        {},
        {"x": 0.1, "y": 0.2, "w": 0.5},  # h manquant
        {"x": -0.1, "y": 0.2, "w": 0.5, "h": 0.1},  # hors image à gauche
        {"x": 0.7, "y": 0.2, "w": 0.5, "h": 0.1},  # déborde à droite
        {"x": 0.1, "y": 0.95, "w": 0.2, "h": 0.1},  # déborde en bas
        {"x": 0.1, "y": 0.2, "w": 0.0, "h": 0.1},  # largeur nulle
        {"x": 0.1, "y": 0.2, "w": 0.2, "h": -0.1},
        {"x": True, "y": 0.2, "w": 0.2, "h": 0.1},  # un booléen n'est pas un nombre
        {"x": "0.1", "y": 0.2, "w": 0.2, "h": 0.1},
        {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0},  # l'image entière ne prouve rien
    ],
)
def test_parse_region_drops_anything_not_a_real_box(raw: object) -> None:
    assert target.parse_region(raw) is None


@pytest.mark.asyncio
async def test_locate_returns_a_region_only_for_asked_excerpts() -> None:
    reply = '{"amount_cents": {"x": 0.1, "y": 0.5, "w": 0.4, "h": 0.04}, "spent_on": {"x": 2, "y": 0, "w": 1, "h": 1}, "autre": {"x": 0.1, "y": 0.1, "w": 0.1, "h": 0.1}}'
    with patch("app.services.vision_regions.call_claude_image_text", new_callable=AsyncMock, return_value=(reply, _usage())):
        regions, cost = await target.locate(
            PNG, "image/png", {"amount_cents": "Total TTC : 89,00 EUR", "spent_on": "Date : 12/03/2026"}
        )
    assert regions == {"amount_cents": {"x": 0.1, "y": 0.5, "w": 0.4, "h": 0.04}}
    assert cost == 0.002


@pytest.mark.asyncio
async def test_locate_without_excerpts_makes_no_call() -> None:
    with patch("app.services.vision_regions.call_claude_image_text", new_callable=AsyncMock) as mocked:
        regions, cost = await target.locate(PNG, "image/png", {})
    mocked.assert_not_called()
    assert regions == {} and cost is None


@pytest.mark.asyncio
async def test_locate_survives_garbage_and_outage() -> None:
    with patch("app.services.vision_regions.call_claude_image_text", new_callable=AsyncMock, return_value=("pas du json", _usage())):
        assert (await target.locate(PNG, "image/png", {"amount_cents": "x"}))[0] == {}
    with patch("app.services.vision_regions.call_claude_image_text", new_callable=AsyncMock, side_effect=RuntimeError("503")):
        assert await target.locate(PNG, "image/png", {"amount_cents": "x"}) == ({}, None)


def _payload() -> dict:
    return {
        "is_receipt": True,
        "amount_cents": {"value": 8900, "confidence": 0.95, "source_excerpt": "Total TTC : 89,00 EUR"},
        "spent_on": {"value": "2026-03-12", "confidence": 0.9, "source_excerpt": "Date : 12/03/2026"},
        "category": {"value": None, "confidence": 0.0, "source_excerpt": ""},
        "vat_rate_bps": {"value": None, "confidence": 0.0, "source_excerpt": ""},
    }


@pytest.mark.asyncio
async def test_extraction_of_an_image_attaches_regions_to_read_fields_only(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OCR_API_KEY", "k")
    region = {"x": 0.1, "y": 0.5, "w": 0.4, "h": 0.04}
    with (
        patch("app.services.expense_extraction.ocr.extract_text", new_callable=AsyncMock, return_value=RECEIPT_TEXT),
        patch("app.services.expense_extraction.call_claude", new_callable=AsyncMock, return_value=(_payload(), _usage())),
        patch("app.services.expense_extraction.vision_regions.locate", new_callable=AsyncMock, return_value=({"amount_cents": region}, 0.003)) as loc,
    ):
        result = await extraction.extract(PNG, "ticket.png")
    assert loc.call_args.args[2] == {"amount_cents": "Total TTC : 89,00 EUR", "spent_on": "Date : 12/03/2026"}
    data = result.to_dict()["fields"]
    assert data["amountCents"]["sourceRegion"] == region
    assert data["spentOn"]["sourceRegion"] is None
    assert data["category"]["sourceRegion"] is None
    assert result.cost_usd == pytest.approx(0.005)


@pytest.mark.asyncio
async def test_extraction_of_a_text_file_never_locates() -> None:
    with (
        patch("app.services.expense_extraction.call_claude", new_callable=AsyncMock, return_value=(_payload(), _usage())),
        patch("app.services.expense_extraction.vision_regions.locate", new_callable=AsyncMock) as loc,
    ):
        result = await extraction.extract(RECEIPT_TEXT.encode(), "note.txt")
    loc.assert_not_called()
    assert result.to_dict()["fields"]["amountCents"]["sourceRegion"] is None
