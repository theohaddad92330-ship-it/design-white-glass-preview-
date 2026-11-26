"""#2433.12 (épopée #2876, lot P02 09/10) — LE LOCALISEUR D'OBJETS d'une image du chat.

Décision Louis 09/10 : un second appel vision dédié, BORNÉ (un par image jointe,
jamais en boucle), qui rend les BORDS du document et la GRILLE d'un tableau.

Ce que ces tests protègent :

1. **Jamais de recadrage deviné** : des bords invalides (hors image, image
   entière, non numériques) sont ÉCARTÉS — l'image reste entière.
2. **Une cellule vide reste vide** (#2433.5) : jamais « 0 », jamais inventée ;
   une ligne courte est complétée par des cellules VIDES, pas par des valeurs.
3. **Un tableau d'une ligne ou d'une colonne n'est pas un tableau.**
4. **Borné** : un appel, `max_tokens` fixe, grille plafonnée.
5. **Une panne ne fait jamais échouer la lecture** : `None` (rien mesuré),
   distinct de « mesuré, rien trouvé ».
6. **Le coût porte l'outil** (`provider_costs.tool`, lot M10).
"""

from __future__ import annotations

import base64
import io
import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.services import cost_ledger
from app.services import vision_objects as target
from app.services.document_text import ExtractedDocument

PNG = b"\x89PNG\r\n\x1a\n" + b"\xff" * 200


def _reply(payload: dict) -> AsyncMock:
    return AsyncMock(return_value=(json.dumps(payload), None))


@pytest.mark.asyncio
async def test_returns_the_document_bounds_and_the_table_grid() -> None:
    payload = {
        "document": {"x": 0.08, "y": 0.05, "w": 0.84, "h": 0.9},
        "table": {
            "bounding_box": {"x": 0.1, "y": 0.3, "w": 0.8, "h": 0.4},
            "rows": [["Profil", "TJM"], ["Tech lead", "750 €"], ["Développeur", ""]],
        },
    }
    with patch("app.services.vision_objects.call_claude_image_text", _reply(payload)) as call:
        found = await target.locate_objects(PNG, "image/png")

    assert found == {
        "document_bounds": {"x": 0.08, "y": 0.05, "w": 0.84, "h": 0.9},
        "table": {
            "bounding_box": {"x": 0.1, "y": 0.3, "w": 0.8, "h": 0.4},
            # #2433.5 — la cellule vide reste VIDE (`None`), jamais « 0 ».
            "rows": [["Profil", "TJM"], ["Tech lead", "750 €"], ["Développeur", None]],
        },
    }
    assert call.await_count == 1
    assert call.await_args.kwargs["max_tokens"] == target.MAX_TOKENS
    assert call.await_args.kwargs["prompt_name"] == "vision_object_locate"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "document",
    [
        {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0},  # l'image entière : rien à recadrer
        {"x": 0.5, "y": 0.1, "w": 0.7, "h": 0.5},  # déborde : jamais corrigé
        {"x": "0.1", "y": 0.1, "w": 0.5, "h": 0.5},
        None,
    ],
)
async def test_invalid_bounds_are_dropped_never_guessed(document: object) -> None:
    with patch("app.services.vision_objects.call_claude_image_text", _reply({"document": document, "table": None})):
        found = await target.locate_objects(PNG, "image/png")

    # Mesuré, rien trouvé : la clé est là, à `None` — l'image reste entière.
    assert found == {"document_bounds": None, "table": None}


@pytest.mark.asyncio
async def test_a_ragged_grid_is_padded_with_empty_cells_never_values() -> None:
    payload = {"table": {"rows": [["A", "B", "C"], ["1"], [None, 2, True]]}}
    with patch("app.services.vision_objects.call_claude_image_text", _reply(payload)):
        found = await target.locate_objects(PNG, "image/png")

    assert found is not None
    assert found["table"] == {
        "bounding_box": None,
        # Un nombre lu se garde en texte ; un booléen n'est pas une cellule lue.
        "rows": [["A", "B", "C"], ["1", None, None], [None, "2", None]],
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "rows",
    [
        [["seule ligne", "x"]],  # une ligne : pas un tableau
        [["a"], ["b"], ["c"]],  # une colonne : une liste, pas un tableau
        [[None, None], ["", ""]],  # rien de lu
        "pas une grille",
    ],
)
async def test_what_is_not_a_table_is_no_table(rows: object) -> None:
    with patch("app.services.vision_objects.call_claude_image_text", _reply({"table": {"rows": rows}})):
        found = await target.locate_objects(PNG, "image/png")

    assert found == {"document_bounds": None, "table": None}


@pytest.mark.asyncio
async def test_the_grid_is_capped() -> None:
    rows = [[f"r{r}c{c}" for c in range(30)] for r in range(80)]
    with patch("app.services.vision_objects.call_claude_image_text", _reply({"table": {"rows": rows}})):
        found = await target.locate_objects(PNG, "image/png")

    assert found is not None and found["table"] is not None
    grid = found["table"]["rows"]
    assert len(grid) == target.TABLE_MAX_ROWS
    assert all(len(row) == target.TABLE_MAX_COLS for row in grid)


@pytest.mark.asyncio
async def test_a_failure_measures_nothing() -> None:
    with patch("app.services.vision_objects.call_claude_image_text", AsyncMock(side_effect=RuntimeError("503"))):
        assert await target.locate_objects(PNG, "image/png") is None
    with patch("app.services.vision_objects.call_claude_image_text", AsyncMock(return_value=("pas du json", None))):
        assert await target.locate_objects(PNG, "image/png") is None


# ── Le branchement sur `/rag/extract` ─────────────────────────────────────────


def _png_b64() -> str:
    buffer = io.BytesIO()
    Image.new("RGB", (40, 20), "white").save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode()


@pytest.fixture
def _read_capture(monkeypatch):
    async def _fake_read(images):
        return [ExtractedDocument(text="Profil TJM\nTech lead 750 €")]

    monkeypatch.setattr("app.services.document_text.extract_images_text", _fake_read)
    # La citation par ligne (#2433.4) n'est pas l'objet de ces tests.
    monkeypatch.setattr("app.routers.rag.vision_regions.locate_lines", AsyncMock(return_value=[]))


def test_extract_runs_the_locator_once_when_asked(client: TestClient, monkeypatch, _read_capture):
    found = {"document_bounds": {"x": 0.1, "y": 0.1, "w": 0.8, "h": 0.8}, "table": None}
    locator = AsyncMock(return_value=found)
    monkeypatch.setattr("app.routers.rag.vision_objects.locate_objects", locator)

    resp = client.post("/rag/extract", json={"file_b64": _png_b64(), "filename": "capture.png", "locate_objects": True})

    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["objects"] == found
    assert locator.await_count == 1


def test_extract_never_runs_the_locator_unasked(client: TestClient, monkeypatch, _read_capture):
    locator = AsyncMock(return_value={"document_bounds": None, "table": None})
    monkeypatch.setattr("app.routers.rag.vision_objects.locate_objects", locator)

    resp = client.post("/rag/extract", json={"file_b64": _png_b64(), "filename": "capture.png"})

    assert resp.status_code == 200
    assert "objects" not in resp.json()["data"]
    assert locator.await_count == 0


def test_a_locator_failure_leaves_no_key(client: TestClient, monkeypatch, _read_capture):
    monkeypatch.setattr("app.routers.rag.vision_objects.locate_objects", AsyncMock(return_value=None))

    resp = client.post("/rag/extract", json={"file_b64": _png_b64(), "filename": "capture.png", "locate_objects": True})

    assert resp.status_code == 200
    # Rien mesuré ≠ « aucun bord détecté » : aucune clé.
    assert "objects" not in resp.json()["data"]


def test_a_document_that_is_not_an_image_never_runs_the_locator(client: TestClient, monkeypatch):
    locator = AsyncMock()
    monkeypatch.setattr("app.routers.rag.vision_objects.locate_objects", locator)
    text_b64 = base64.b64encode(b"Compte rendu.").decode()

    resp = client.post("/rag/extract", json={"file_b64": text_b64, "filename": "notes.txt", "locate_objects": True})

    assert resp.status_code == 200
    assert "objects" not in resp.json()["data"]
    assert locator.await_count == 0


def test_the_locator_cost_carries_its_tool(client: TestClient, monkeypatch, _read_capture):
    """Lot M10 — `provider_costs.tool` : la ligne de coût du localiseur se lit seule."""

    async def _fake_locate(_bytes, _media):
        cost_ledger.record("anthropic", "vision_object_locate", 1, 0.004)
        return {"document_bounds": None, "table": None}

    monkeypatch.setattr("app.routers.rag.vision_objects.locate_objects", _fake_locate)

    resp = client.post("/rag/extract", json={"file_b64": _png_b64(), "filename": "capture.png", "locate_objects": True})

    rows = json.loads(resp.headers["x-bellum-costs"])
    assert any(row.get("tool") == target.COST_TOOL and row["operation"] == "vision_object_locate" for row in rows)
