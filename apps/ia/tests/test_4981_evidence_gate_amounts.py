"""#4981 — la porte de preuve reconnaît un montant sous une autre forme, et dit toujours NON à un chiffre absent."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.services.evidence_gate import assert_claims_are_grounded

_PACKET = "Cartier — chiffre d'affaires (registre) : 198 300 000 EUR ; effectif 4 200 ; 12 contacts"


def _claim(text: str, proof: str) -> SimpleNamespace:
    return SimpleNamespace(text=text, proof=proof)


@pytest.mark.parametrize("proof", ["198,3 M€", "198,3 M€ de chiffre d'affaires", "198.3 millions d'euros", "198300 k€", "0,1983 Md€"])
def test_montant_redige_autrement_est_reconnu(proof: str) -> None:
    assert_claims_are_grounded([_claim("CA de Cartier", proof)], _PACKET)


@pytest.mark.parametrize("proof", ["250 M€", "198,4 M€", "19,83 M€", "198,3 M€ de bénéfice net"])
def test_montant_absent_reste_refuse(proof: str) -> None:
    with pytest.raises(HTTPException) as exc:
        assert_claims_are_grounded([_claim("CA de Cartier", proof)], _PACKET)
    assert exc.value.status_code == 422
    assert "sans preuve" in str(exc.value.detail)


def test_preuve_verbatim_inchangee() -> None:
    assert_claims_are_grounded([_claim("effectif", "effectif 4 200")], _PACKET)


def _post_with(replies: list[dict]) -> tuple[int, list[str]]:
    from unittest.mock import AsyncMock, MagicMock, patch

    from fastapi.testclient import TestClient

    users: list[str] = []
    queue = list(replies)

    async def _fake(system, user, **_kw):
        users.append(user)
        return queue.pop(0), None

    contact = {"first_name": "Sichen", "last_name": "Zhang", "title": "CTO", "account_id": "a1"}
    account = {"company_name": "Cartier", "raw_analysis": {"recent_signals": [{"signal": "Cession Uptevia", "date": "2026-10-01"}]}}
    body = {"contact_id": "c1", "user_id": "u1", "channel": "linkedin", "profile_data": {"companyName": "Acme", "offers": ["SRE"]}}
    with (
        patch("app.routers.message.get_supabase", return_value=MagicMock()),
        patch("app.routers.message.fetch_owned_contact", new_callable=AsyncMock, return_value=contact),
        patch("app.routers.message.fetch_owned_account", new_callable=AsyncMock, return_value=account),
        patch("app.routers.message.call_claude", new=_fake),
    ):
        from app.main import app

        res = TestClient(app).post("/message/generate", json=body)
    return res.status_code, users


def test_chiffre_invente_puis_retire_a_la_regeneration() -> None:
    bad = {"body": "Bonjour, 198,3 M€ de CA.", "claims": [{"text": "CA 198,3 M€", "proof": "198,3 M€"}]}
    good = {"body": "Bonjour Sichen.", "claims": []}
    status, users = _post_with([bad, good])
    assert status == 200
    assert len(users) == 2 and "198,3 M€" in users[1]


def test_chiffre_invente_deux_fois_reste_refuse() -> None:
    bad = {"body": "Bonjour, 198,3 M€ de CA.", "claims": [{"text": "CA 198,3 M€", "proof": "198,3 M€"}]}
    status, users = _post_with([bad, bad])
    assert status == 422 and len(users) == 2
