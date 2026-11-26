"""E1 (#3698) — la révélation ASYNCHRONE du mobile chez Apollo.

Apollo ne rend un mobile que si on le lui demande (`reveal_phone_number=true`),
et il le rend PLUS TARD, sur un `webhook_url` (« several minutes »). Le service
IA ne fait que DEMANDER : il ne lit jamais le numéro, c'est l'API qui reçoit le
webhook signé. Ces tests verrouillent ce que la demande envoie, et qu'elle sait
dire NON (pas de clé, pas d'URL de retour).
"""

import os
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from app.services.apollo import request_phone_reveal

HOOK = "https://api.example.test/webhooks/enrichment/phone/tok"


def _resp(status: int, body: dict) -> httpx.Response:
    return httpx.Response(status, json=body, request=httpx.Request("POST", "https://x.io"))


@pytest.mark.asyncio
async def test_asks_apollo_for_the_mobile_with_the_webhook() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(
        return_value=_resp(200, {"person": {"id": "p1", "linkedin_url": "https://www.linkedin.com/in/jd"}})
    )
    with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
        out = await request_phone_reveal(
            webhook_url=HOOK, apollo_id="p1", first_name="Jean", organization_name="Acme", http_client=client
        )
    sent = client.post.call_args.kwargs["json"]
    assert sent["reveal_phone_number"] is True
    assert sent["webhook_url"] == HOOK
    # L'e-mail a déjà été révélé (ou cherché) au premier passage : ne pas le repayer.
    assert sent["reveal_personal_emails"] is False
    assert sent["id"] == "p1"
    assert out.requested is True
    assert out.matched is True
    assert out.linkedin_url == "https://www.linkedin.com/in/jd"


@pytest.mark.asyncio
async def test_without_key_nothing_leaves() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    with patch.dict(os.environ, {}, clear=False):
        os.environ.pop("APOLLO_API_KEY", None)
        out = await request_phone_reveal(
            webhook_url=HOOK, linkedin_url="https://www.linkedin.com/in/x", http_client=client
        )
    client.post.assert_not_called()
    assert out.requested is False
    assert out.reason == "unconfigured"


@pytest.mark.asyncio
async def test_without_webhook_nothing_leaves() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
        out = await request_phone_reveal(
            webhook_url="", linkedin_url="https://www.linkedin.com/in/x", http_client=client
        )
    client.post.assert_not_called()
    assert out.requested is False


@pytest.mark.asyncio
async def test_no_person_is_requested_but_not_matched() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(return_value=_resp(200, {"person": None}))
    with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
        out = await request_phone_reveal(
            webhook_url=HOOK, linkedin_url="https://www.linkedin.com/in/x", http_client=client
        )
    assert out.requested is False
    assert out.matched is False
    assert out.reason == "no_match"


@pytest.mark.asyncio
async def test_upstream_error_is_named_not_raised() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(return_value=_resp(500, {"error": "boom"}))
    with patch.dict(os.environ, {"APOLLO_API_KEY": "test-key"}):
        out = await request_phone_reveal(
            webhook_url=HOOK, linkedin_url="https://www.linkedin.com/in/x", http_client=client
        )
    assert out.requested is False
    assert out.reason == "upstream_error"


def test_route_relays_the_request(client: TestClient) -> None:
    from app.models.contacts import RevealPhoneResponse

    captured: dict = {}

    async def fake(**kwargs):  # noqa: ANN003
        captured.update(kwargs)
        return RevealPhoneResponse(requested=True, matched=True)

    with patch("app.routers.phase2_contacts.request_phone_reveal", side_effect=fake):
        res = client.post("/phase/2/enrich/reveal-phone", json={"apollo_id": "p1", "webhook_url": HOOK})
    assert res.status_code == 200, res.text
    assert res.json()["requested"] is True
    assert captured["webhook_url"] == HOOK
    assert captured["apollo_id"] == "p1"


def test_route_refuses_a_request_without_match_key(client: TestClient) -> None:
    res = client.post("/phase/2/enrich/reveal-phone", json={"webhook_url": HOOK})
    assert res.status_code == 422
