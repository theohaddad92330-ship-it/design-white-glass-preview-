"""#2433.4 (épopée #2876, lot M10 09/10) — LA CITATION VISUELLE D'UNE IMAGE DU CHAT.

`vision_regions.locate` (construit pour le justificatif photo) n'avait aucun
appelant côté chat : une image jointe à la conversation rendait son TEXTE, sans
dire OÙ chaque ligne avait été lue. `/rag/extract` rend désormais, pour une
image, la zone de chaque ligne lue (`regions` : citation + `bounding_box`
normalisé) — l'API y ajoute l'`image_id` de l'image rangée.

Mêmes règles que le justificatif : une zone invalide est ÉCARTÉE, jamais
corrigée ; une panne de localisation ne fait jamais échouer la lecture ; aucune
zone pour un texte non lu.
"""

from __future__ import annotations

import base64
import io
import json

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.services.document_text import ExtractedDocument


def _png_b64() -> str:
    buffer = io.BytesIO()
    Image.new("RGB", (40, 20), "white").save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode()


@pytest.fixture
def _read_ticket(monkeypatch):
    async def _fake_read(images):
        return [ExtractedDocument(text="TOTAL 42,00 €\nTVA 7,00 €\n\nMerci de votre visite")]

    monkeypatch.setattr("app.services.document_text.extract_images_text", _fake_read)


def _locate_replies(monkeypatch, reply: str | Exception) -> list[str]:
    seen: list[str] = []

    async def _fake_vision(_bytes, _media, **kwargs):
        seen.append(kwargs.get("instruction", ""))
        if isinstance(reply, Exception):
            raise reply
        return reply, None

    monkeypatch.setattr("app.services.vision_regions.call_claude_image_text", _fake_vision)
    return seen


def test_an_image_returns_the_zone_of_each_line_it_read(client: TestClient, monkeypatch, _read_ticket):
    seen = _locate_replies(
        monkeypatch,
        json.dumps(
            {
                "L1": {"x": 0.1, "y": 0.7, "w": 0.5, "h": 0.08},
                # Hors image : ÉCARTÉE, jamais corrigée.
                "L2": {"x": 0.9, "y": 0.8, "w": 0.5, "h": 0.1},
            }
        ),
    )
    resp = client.post("/rag/extract", json={"file_b64": _png_b64(), "filename": "ticket.png"})

    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["text"].startswith("TOTAL 42,00 €")
    assert data["regions"] == [{"quote": "TOTAL 42,00 €", "bounding_box": {"x": 0.1, "y": 0.7, "w": 0.5, "h": 0.08}}]
    # Ce qui a été demandé : les lignes LUES, jamais une ligne vide.
    assert "TOTAL 42,00 €" in seen[0] and "Merci de votre visite" in seen[0]


def test_a_localisation_failure_never_fails_the_reading(client: TestClient, monkeypatch, _read_ticket):
    _locate_replies(monkeypatch, RuntimeError("vision down"))
    resp = client.post("/rag/extract", json={"file_b64": _png_b64(), "filename": "ticket.png"})

    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert data["text"].startswith("TOTAL")
    # Aucune zone : aucune clé — jamais une liste vide qui se lirait « rien trouvé ».
    assert "regions" not in data


def test_a_document_that_is_not_an_image_asks_for_no_zone(client: TestClient, monkeypatch):
    seen = _locate_replies(monkeypatch, "{}")
    text_b64 = base64.b64encode(b"Compte rendu de rendez-vous.").decode()
    resp = client.post("/rag/extract", json={"file_b64": text_b64, "filename": "notes.txt"})

    assert resp.status_code == 200
    assert "regions" not in resp.json()["data"]
    assert seen == []
