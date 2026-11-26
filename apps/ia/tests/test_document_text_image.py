"""Lecture des images (`.png`/`.jpg`/`.jpeg`/`.webp`) par le MODÈLE (#2667.2).

Décision de Louis (QCM du 21/09) : « pptx ET OCR des images ». Aucun binaire
OCR dans ce dépôt (ni tesseract ni pytesseract — un ajout toucherait l'image
de déploiement Railway, hors périmètre) : le seul chemin qui lit une image ici
est le modèle, via `claude_service.call_claude_image_text` — simulé dans
TOUS ces tests, jamais appelé pour de vrai (aucune clé, aucun réseau).

Une LECTURE, pas une interprétation : une image sans texte lisible rend
« aucun texte lisible dans cette image », jamais une description devinée.
"""

from __future__ import annotations

import pytest

from app.services import document_text
from app.services.claude_service import IMAGE_NO_TEXT_SENTINEL
from app.services.document_text import (
    DocumentTextError,
    extract_image_text,
    extract_images_text,
)

_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
_JPEG_MAGIC = b"\xff\xd8\xff"


def _png(size: int = 64) -> bytes:
    return _PNG_MAGIC + b"\x00" * size


def _jpeg(size: int = 64) -> bytes:
    return _JPEG_MAGIC + b"\x00" * size


def _webp(size: int = 64) -> bytes:
    body = b"\x00" * size
    return b"RIFF" + len(body).to_bytes(4, "little") + b"WEBP" + body


class _FakeModel:
    """Simule `call_claude_image_text` : rend un texte fixe (ou une file de
    textes, un par appel) et compte les appels — pour prouver qu'un plafond
    refuse AVANT tout appel, pas après."""

    def __init__(self, text: str | list[str] = "texte lu") -> None:
        self._text = text
        self.calls: list[tuple[bytes, str]] = []

    async def __call__(self, image_bytes: bytes, media_type: str, **kwargs):
        self.calls.append((image_bytes, media_type))
        if isinstance(self._text, list):
            text = self._text[len(self.calls) - 1]
        else:
            text = self._text
        from app.services.claude_service import TokenUsage

        return text, TokenUsage(input_tokens=100, output_tokens=10, model="claude-sonnet-5", cost_usd=0.001)


# ── extract_image_text (singulier) ──────────────────────────────────────────


async def test_extract_image_text_reads_text_via_the_model(monkeypatch):
    fake = _FakeModel("Jean Dupont — Directeur technique")
    monkeypatch.setattr(document_text, "call_claude_image_text", fake)

    result = await extract_image_text(_png(), "organigramme.png")

    assert result.text == "Jean Dupont — Directeur technique"
    assert result.partial is False
    assert fake.calls[0][1] == "image/png"


async def test_extract_image_text_detects_jpeg_by_magic_bytes(monkeypatch):
    fake = _FakeModel("texte")
    monkeypatch.setattr(document_text, "call_claude_image_text", fake)

    # Extension mensongère : la signature JPEG doit trancher, pas `.png`.
    await extract_image_text(_jpeg(), "capture.png")

    assert fake.calls[0][1] == "image/jpeg"


async def test_extract_image_text_detects_webp_by_magic_bytes(monkeypatch):
    fake = _FakeModel("texte")
    monkeypatch.setattr(document_text, "call_claude_image_text", fake)

    await extract_image_text(_webp(), "capture.webp")

    assert fake.calls[0][1] == "image/webp"


async def test_extract_image_text_rejects_an_unrecognized_format_before_any_call(monkeypatch):
    fake = _FakeModel("texte")
    monkeypatch.setattr(document_text, "call_claude_image_text", fake)

    with pytest.raises(DocumentTextError, match="PNG|JPEG|WEBP"):
        await extract_image_text(b"pas une image du tout", "mystere.bin")

    assert fake.calls == []  # jamais payé un appel sur un format refusé


async def test_extract_image_text_rejects_an_oversized_image_before_any_call(monkeypatch):
    fake = _FakeModel("texte")
    monkeypatch.setattr(document_text, "call_claude_image_text", fake)

    too_big = _PNG_MAGIC + b"\x00" * (document_text._MAX_IMAGE_BYTES + 1)
    with pytest.raises(DocumentTextError, match="lourde|Mo"):
        await extract_image_text(too_big, "grande.png")

    assert fake.calls == []  # jamais payé un appel sur une image refusée


async def test_extract_image_text_rejects_empty_bytes(monkeypatch):
    fake = _FakeModel("texte")
    monkeypatch.setattr(document_text, "call_claude_image_text", fake)

    with pytest.raises(DocumentTextError, match="vide"):
        await extract_image_text(b"", "vide.png")

    assert fake.calls == []


async def test_extract_image_text_raises_when_the_model_finds_no_text(monkeypatch):
    # Jamais une donnée inventée : « aucun texte lisible » est une ERREUR
    # (comme un PDF scan sans calque texte), pas un contenu ingéré.
    fake = _FakeModel(IMAGE_NO_TEXT_SENTINEL)
    monkeypatch.setattr(document_text, "call_claude_image_text", fake)

    with pytest.raises(DocumentTextError, match="Aucun texte lisible"):
        await extract_image_text(_png(), "vierge.png")


async def test_extract_image_text_raises_on_a_blank_model_reply(monkeypatch):
    fake = _FakeModel("   ")
    monkeypatch.setattr(document_text, "call_claude_image_text", fake)

    with pytest.raises(DocumentTextError):
        await extract_image_text(_png(), "vierge.png")


# ── extract_images_text (pluriel) — le plafond « par lot » ──────────────────


async def test_extract_images_text_refuses_a_batch_over_the_cap_before_any_call(monkeypatch):
    fake = _FakeModel("texte")
    monkeypatch.setattr(document_text, "call_claude_image_text", fake)

    over_the_cap = document_text._MAX_IMAGES_PER_BATCH + 1
    images = [(_png(), f"image{i}.png") for i in range(over_the_cap)]

    with pytest.raises(DocumentTextError, match=str(document_text._MAX_IMAGES_PER_BATCH)):
        await extract_images_text(images)

    # Refus EN BLOC : aucune des images du lot n'a déclenché d'appel facturé.
    assert fake.calls == []


async def test_extract_images_text_processes_up_to_the_cap_in_order(monkeypatch):
    cap = document_text._MAX_IMAGES_PER_BATCH
    fake = _FakeModel([f"texte {i}" for i in range(cap)])
    monkeypatch.setattr(document_text, "call_claude_image_text", fake)

    images = [(_png(), f"image{i}.png") for i in range(cap)]
    results = await extract_images_text(images)

    assert [r.text for r in results] == [f"texte {i}" for i in range(cap)]


async def test_extract_images_text_refuses_the_whole_batch_on_one_oversized_entry(monkeypatch):
    fake = _FakeModel("texte")
    monkeypatch.setattr(document_text, "call_claude_image_text", fake)

    too_big = _PNG_MAGIC + b"\x00" * (document_text._MAX_IMAGE_BYTES + 1)
    images = [(_png(), "bonne.png"), (too_big, "trop-lourde.png")]

    with pytest.raises(DocumentTextError):
        await extract_images_text(images)

    # Le refus est vérifié AVANT le premier appel : la bonne image n'a pas non
    # plus été payée pendant qu'on découvrait la mauvaise plus loin dans le lot.
    assert fake.calls == []


# ── #2433.12 — une photo de côté est remise droite AVANT la lecture ─────────


async def test_sideways_photo_is_read_upright(monkeypatch):
    import io

    from PIL import Image

    image = Image.new("RGB", (40, 20), (200, 30, 30))
    exif = Image.Exif()
    exif[0x0112] = 6
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", exif=exif)

    fake = _FakeModel("Total 12,50 €")
    monkeypatch.setattr(document_text, "call_claude_image_text", fake)

    await extract_image_text(buffer.getvalue(), "ticket.jpg")

    sent, media_type = fake.calls[0]
    assert media_type == "image/jpeg"
    assert Image.open(io.BytesIO(sent)).size == (20, 40)
