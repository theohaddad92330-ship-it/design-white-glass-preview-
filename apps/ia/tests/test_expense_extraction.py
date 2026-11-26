"""La lecture automatique d'un justificatif de note de frais (#1827.2).

Ce que ces tests protègent, dans l'ordre des règles du lot :

1. **Sans `OCR_API_KEY`, zéro appel réseau part** — ni OCR, ni modèle — et le
   statut rendu dit « non branché », jamais « en panne » (interrupteur, pas
   incident). `test_no_op_without_ocr_key_when_ocr_is_needed`.
2. **Un champ à faible confiance reste VIDE**, jamais affiché comme lu.
   `test_low_confidence_field_is_dropped`.
3. **Les trois chemins d'échec nommés par le lot** : scan illisible, document
   qui n'est pas une facture, et (le quatrième, défensif) un texte trop long
   pour qu'on paie l'appel.
4. **Le parsing ne fait jamais confiance à une citation introuvable** — une
   valeur affirmée sans preuve retrouvable dans le texte est écartée, comme
   pour `bellum_cv_parse`.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.services import expense_extraction as target
from app.services.claude_service import TokenUsage

RECEIPT_TEXT = (
    "HOTEL IBIS PARIS GARE DE LYON\n"
    "Facture n. 2026-4471\n"
    "Date : 12/03/2026\n"
    "1 nuit chambre standard\n"
    "Total TTC : 89,00 EUR\n"
    "dont TVA 10% : 8,09 EUR\n"
)


def _usage(cost_usd: float = 0.0017, cost_known: bool = True) -> TokenUsage:
    return TokenUsage(
        input_tokens=850,
        output_tokens=140,
        model="claude-haiku-4-5",
        cost_usd=cost_usd,
        cost_known=cost_known,
    )


def _model_payload(**overrides: object) -> dict:
    payload = {
        "is_receipt": True,
        "amount_cents": {"value": 8900, "confidence": 0.95, "source_excerpt": "Total TTC : 89,00 EUR"},
        "spent_on": {"value": "2026-03-12", "confidence": 0.9, "source_excerpt": "Date : 12/03/2026"},
        "category": {"value": "hotel", "confidence": 0.92, "source_excerpt": "HOTEL IBIS PARIS GARE DE LYON"},
        "vat_rate_bps": {"value": 1000, "confidence": 0.8, "source_excerpt": "dont TVA 10% : 8,09 EUR"},
    }
    payload.update(overrides)
    return payload


@pytest.mark.asyncio
async def test_direct_text_extraction_never_calls_ocr_or_the_model_for_a_text_layer() -> None:
    """Un PDF avec un vrai calque de texte n'a besoin ni d'OCR ni... si, du
    modèle structurant (c'est lui qui transforme le texte en quatre champs) —
    mais jamais d'OCR, et `ocrUsed` le dit."""
    with (
        patch("app.services.expense_extraction.ocr.extract_text", new_callable=AsyncMock) as mocked_ocr,
        patch(
            "app.services.expense_extraction.call_claude",
            new_callable=AsyncMock,
            return_value=(_model_payload(), _usage()),
        ),
    ):
        result = await target.extract(RECEIPT_TEXT.encode("utf-8"), "note.txt")
    mocked_ocr.assert_not_called()
    assert result.status == target.STATUS_OK
    assert result.ocr_used is False


@pytest.mark.asyncio
async def test_no_op_without_ocr_key_when_ocr_is_needed(monkeypatch: pytest.MonkeyPatch) -> None:
    """LA RÈGLE LA PLUS DURE DU LOT : sans clé, zéro appel réseau, jamais une
    panne affichée. Un JPEG n'a pas de calque de texte : `extract_document_text`
    échoue, et c'est alors — et alors seulement — que l'interrupteur OCR est
    lu."""
    monkeypatch.delenv("OCR_API_KEY", raising=False)
    # En-tête JPEG suivi d'octets non-UTF-8 — un NUL décoderait comme un
    # caractère valide et ne franchirait pas le seuil de charabia de
    # `document_text.extract_document_text` ; `\xff` répété, si.
    scan_bytes = b"\xff\xd8\xff\xe0" + b"\xff" * 200
    with (
        patch("app.services.expense_extraction.ocr.extract_text", new_callable=AsyncMock) as mocked_ocr,
        patch("app.services.expense_extraction.call_claude", new_callable=AsyncMock) as mocked_claude,
    ):
        result = await target.extract(scan_bytes, "ticket.jpg")
    mocked_ocr.assert_not_called()
    mocked_claude.assert_not_called()
    assert result.status == target.STATUS_NOT_CONFIGURED
    assert result.cost_usd is None
    assert result.fields["amount_cents"].value is None


@pytest.mark.asyncio
async def test_unreadable_scan_with_ocr_configured_but_mute(monkeypatch: pytest.MonkeyPatch) -> None:
    """L'interrupteur est sur ON, mais le fournisseur ne rend rien — c'est une
    PANNE (ou un vrai scan illisible), distincte de « non branché »."""
    monkeypatch.setenv("OCR_API_KEY", "test-key")
    scan_bytes = b"\xff\xd8\xff\xe0" + b"\xff" * 200
    with (
        patch("app.services.expense_extraction.ocr.extract_text", new_callable=AsyncMock, return_value=None),
        patch("app.services.expense_extraction.call_claude", new_callable=AsyncMock) as mocked_claude,
    ):
        result = await target.extract(scan_bytes, "ticket.jpg")
    mocked_claude.assert_not_called()
    assert result.status == target.STATUS_UNREADABLE
    assert result.cost_usd is None


@pytest.mark.asyncio
async def test_empty_file_is_unreadable_without_any_call() -> None:
    with (
        patch("app.services.expense_extraction.ocr.extract_text", new_callable=AsyncMock) as mocked_ocr,
        patch("app.services.expense_extraction.call_claude", new_callable=AsyncMock) as mocked_claude,
    ):
        result = await target.extract(b"", "ticket.jpg")
    mocked_ocr.assert_not_called()
    mocked_claude.assert_not_called()
    assert result.status == target.STATUS_UNREADABLE


@pytest.mark.asyncio
async def test_not_a_receipt_still_costs_a_real_call_but_nulls_every_field() -> None:
    with patch(
        "app.services.expense_extraction.call_claude",
        new_callable=AsyncMock,
        return_value=(_model_payload(is_receipt=False), _usage()),
    ):
        result = await target.extract(RECEIPT_TEXT.encode("utf-8"), "photo.txt")
    assert result.status == target.STATUS_NOT_A_RECEIPT
    assert result.cost_usd == pytest.approx(0.0017)
    assert all(field.value is None for field in result.fields.values())


@pytest.mark.asyncio
async def test_low_confidence_field_is_dropped() -> None:
    """Un montant lu à 40 % de confiance n'est pas un montant — le champ reste
    VIDE, la ligne peut encore l'être pour d'autres champs."""
    payload = _model_payload(amount_cents={"value": 8900, "confidence": 0.4, "source_excerpt": "Total TTC : 89,00 EUR"})
    with patch(
        "app.services.expense_extraction.call_claude", new_callable=AsyncMock, return_value=(payload, _usage())
    ):
        result = await target.extract(RECEIPT_TEXT.encode("utf-8"), "note.txt")
    assert result.status == target.STATUS_OK
    assert result.fields["amount_cents"].value is None
    # Les autres champs, eux, passaient le seuil — un champ faible n'efface pas
    # les autres.
    assert result.fields["spent_on"].value == "2026-03-12"


@pytest.mark.asyncio
async def test_field_without_a_findable_citation_is_dropped() -> None:
    """Une valeur affirmée dont la citation ne se retrouve pas dans le texte
    source est écartée — citer de mémoire est ce qu'un modèle fait quand il ne
    trouve pas, exactement la garde de `bellum_cv_parse`."""
    payload = _model_payload(
        amount_cents={"value": 8900, "confidence": 0.95, "source_excerpt": "Ceci n'est écrit nulle part"}
    )
    with patch(
        "app.services.expense_extraction.call_claude", new_callable=AsyncMock, return_value=(payload, _usage())
    ):
        result = await target.extract(RECEIPT_TEXT.encode("utf-8"), "note.txt")
    assert result.fields["amount_cents"].value is None


@pytest.mark.asyncio
async def test_category_outside_the_closed_enum_is_dropped() -> None:
    payload = _model_payload(
        category={"value": "spaceship", "confidence": 0.9, "source_excerpt": "HOTEL IBIS PARIS GARE DE LYON"}
    )
    with patch(
        "app.services.expense_extraction.call_claude", new_callable=AsyncMock, return_value=(payload, _usage())
    ):
        result = await target.extract(RECEIPT_TEXT.encode("utf-8"), "note.txt")
    assert result.fields["category"].value is None


@pytest.mark.asyncio
async def test_unparseable_date_is_dropped() -> None:
    payload = _model_payload(spent_on={"value": "2026-13-40", "confidence": 0.9, "source_excerpt": "Date : 12/03/2026"})
    with patch(
        "app.services.expense_extraction.call_claude", new_callable=AsyncMock, return_value=(payload, _usage())
    ):
        result = await target.extract(RECEIPT_TEXT.encode("utf-8"), "note.txt")
    assert result.fields["spent_on"].value is None


@pytest.mark.asyncio
async def test_text_over_the_budget_ceiling_is_refused_before_any_model_call() -> None:
    """Le PLAFOND du lot : un texte trop long coûterait sans rien rendre
    d'exploitable — le lot est refusé plutôt que de saturer la file."""
    huge_text = "Ligne de ticket.\n" * 2000  # très au-delà de `_MAX_TEXT_CHARS`
    with patch("app.services.expense_extraction.call_claude", new_callable=AsyncMock) as mocked_claude:
        result = await target.extract(huge_text.encode("utf-8"), "note.txt")
    mocked_claude.assert_not_called()
    assert result.status == target.STATUS_TOO_LARGE
    assert result.cost_usd is None


@pytest.mark.asyncio
async def test_unpriced_model_reports_cost_as_unknown_not_zero() -> None:
    """Un tarif inconnu ne se lit jamais « gratuit » (même discipline que
    `claude_service._log_usage`)."""
    with patch(
        "app.services.expense_extraction.call_claude",
        new_callable=AsyncMock,
        return_value=(_model_payload(), _usage(cost_usd=0.0, cost_known=False)),
    ):
        result = await target.extract(RECEIPT_TEXT.encode("utf-8"), "note.txt")
    assert result.cost_usd is None


def test_prompt_is_registered_with_a_model() -> None:
    from app.services.model_policy import PROMPT_MODELS

    assert target.PROMPT_NAME in PROMPT_MODELS


async def test_sideways_photo_is_upright_before_ocr_and_location(monkeypatch: pytest.MonkeyPatch) -> None:
    """#2433.12 — l'OCR et la localisation reçoivent la photo À L'ENDROIT."""
    import io

    from PIL import Image

    from app.services import image_orientation

    image = Image.new("RGB", (40, 20), (200, 30, 30))
    exif = Image.Exif()
    exif[0x0112] = 6
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", exif=exif)

    seen: list[bytes] = []

    async def fake_ocr(data: bytes, filename: str | None = None) -> str:
        seen.append(data)
        return ""

    monkeypatch.setattr(target.ocr, "is_configured", lambda: True)
    monkeypatch.setattr(target.ocr, "extract_text", fake_ocr)

    await target.extract(buffer.getvalue(), "ticket.jpg")

    assert Image.open(io.BytesIO(seen[0])).size == (20, 40)
    assert image_orientation.upright(seen[0])[1] is False
