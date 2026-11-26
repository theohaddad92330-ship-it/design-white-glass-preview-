"""#4473 — une clé du service sans portée d'espace de travail devient un échec LISIBLE.

Cause hors code (la clé se pose côté fournisseur, geste de Louis) : le lot rend l'échec
nommé, sans citer le fournisseur, distinct dans le journal, et sans aucun repli inventé.
"""

from __future__ import annotations

import json
import logging
import re
from unittest.mock import AsyncMock, patch

import anthropic
import httpx
import pytest
from fastapi.testclient import TestClient

from app.services.model_key_scope import KEY_SCOPE_CODE, KEY_SCOPE_USER_MESSAGE, is_key_scope_error

_SCOPE_TEXT = "API key not scoped to a workspace"


def _bad_request(message: str = _SCOPE_TEXT) -> anthropic.BadRequestError:
    request = httpx.Request("POST", "https://x.invalid/v1/messages")
    response = httpx.Response(
        400, request=request, json={"error": {"type": "invalid_request_error", "message": message}}
    )
    return anthropic.BadRequestError(message, response=response, body=None)


def test_reconnait_la_cause_et_seulement_elle() -> None:
    assert is_key_scope_error(_bad_request())
    assert not is_key_scope_error(_bad_request("max_tokens trop grand"))
    assert not is_key_scope_error(ValueError(_SCOPE_TEXT))
    assert not is_key_scope_error(RuntimeError("boom"))


def test_le_message_dit_la_cause_sans_nommer_le_fournisseur() -> None:
    assert "portée" in KEY_SCOPE_USER_MESSAGE
    assert not re.search(r"claude|anthropic|workspace", KEY_SCOPE_USER_MESSAGE, re.IGNORECASE)


@pytest.mark.parametrize(
    ("route", "patch_target", "payload_module"),
    [
        ("/commercial-brief", "app.routers.commercial_brief.call_claude", "tests.test_commercial_brief"),
        ("/dossier-blocks", "app.routers.dossier_blocks.call_claude", "tests.test_dossier_blocks"),
    ],
)
def test_502_lisible_marque_dans_le_journal_et_sans_repli(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    route: str,
    patch_target: str,
    payload_module: str,
) -> None:
    import importlib

    payload = importlib.import_module(payload_module)._payload()
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    with (
        patch(patch_target, new_callable=AsyncMock, side_effect=_bad_request()) as claude,
        caplog.at_level(logging.ERROR),
    ):
        res = client.post(route, json=payload)

    assert res.status_code == 502
    body = res.json()
    assert body["detail"] == KEY_SCOPE_CODE
    assert body["user_message"] == KEY_SCOPE_USER_MESSAGE
    assert "data" not in body  # aucun contenu fabriqué
    assert claude.await_count == 1  # un 400 de portée ne se rejoue pas
    assert any(KEY_SCOPE_CODE in r.getMessage() for r in caplog.records)  # marquage distinct
    assert _SCOPE_TEXT not in json.dumps(body)  # le texte du fournisseur ne voyage pas


def test_un_autre_echec_garde_son_code_historique(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from tests.test_commercial_brief import _payload

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    with patch("app.routers.commercial_brief.call_claude", new_callable=AsyncMock, side_effect=RuntimeError("x")):
        res = client.post("/commercial-brief", json=_payload())
    assert res.status_code == 502
    assert res.json()["detail"] == "commercial_brief_failed"
