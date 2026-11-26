"""Battle card concurrentielle — prompt (profil résolu + concurrence present-only)
et endpoint (câblé de bout en bout via le proxy NestJS)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.prompts.bellum_battlecard import build_system_prompt, build_user_prompt

_ACCOUNT = {
    "company_name": "BNP Paribas",
    "raw_analysis": {
        "recent_signals": [{"title": "Migration cloud"}],
        "competitors": [
            {"name": "Capgemini", "strengths": "Ancrage historique", "weaknesses": "Cher et lent"},
            {"name": "Sopra Steria", "strengths": "Volume", "weaknesses": "Peu spécialisé data"},
        ],
    },
}


def _fake_sb(contacts: list) -> MagicMock:
    """Supabase double for the single `contacts` query the router runs after the
    profile is resolved from `profile_data` (the profiles branch is then skipped)."""
    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.limit.return_value = chain
    chain.aexecute = AsyncMock(return_value=MagicMock(data=contacts))
    sb = MagicMock()
    sb.table.return_value = chain
    return sb


def _patches(claude_return=None, claude_side_effect=None, contacts=None):
    claude_kwargs = {}
    if claude_side_effect is not None:
        claude_kwargs["side_effect"] = claude_side_effect
    else:
        claude_kwargs["return_value"] = (claude_return, None)
    return (
        patch("app.routers.battlecard.get_supabase", return_value=_fake_sb(contacts or [])),
        patch("app.routers.battlecard.fetch_owned_account", new_callable=AsyncMock, return_value=_ACCOUNT),
        patch("app.routers.battlecard.call_claude", new_callable=AsyncMock, **claude_kwargs),
    )


# ── Prompt ──────────────────────────────────────────────────────────────────


def test_system_prompt_uses_resolved_esn_profile():
    prompt = build_system_prompt({"companyName": "Sales Connect", "offers": ["Data & IA"], "size": "ETI"})
    assert "Sales Connect" in prompt
    assert "Data & IA" in prompt
    assert "votre ESN" not in prompt


def test_system_prompt_falls_back_to_legacy_keys_then_default():
    assert "Acme IT" in build_system_prompt({"esn_name": "Acme IT", "core_offers": ["Cloud"]})
    assert "votre ESN" in build_system_prompt({})


def test_user_prompt_injects_identified_competitors():
    prompt = build_user_prompt(
        raw_analysis=_ACCOUNT["raw_analysis"],
        contacts=[],
        profile={"companyName": "Sales Connect", "offers": ["Data"]},
        company_name="BNP Paribas",
        competitors=_ACCOUNT["raw_analysis"]["competitors"],
    )
    assert "Capgemini" in prompt
    assert "Sopra Steria" in prompt
    assert "vs_competitors" in prompt


def test_user_prompt_present_only_when_no_competitor():
    prompt = build_user_prompt(
        raw_analysis={},
        contacts=[],
        profile={"companyName": "Sales Connect"},
        company_name="ACME",
        competitors=[],
    )
    # Aucun concurrent injecté ni inventé — l'instruction present-only reste.
    assert "Aucun concurrent identifié" in prompt
    assert '"vs_competitors": []' in prompt


# ── Endpoint ────────────────────────────────────────────────────────────────


def test_battlecard_generate_returns_competitive_card(client: TestClient) -> None:
    card = {
        "company_activity": "Banque de détail",
        "vs_competitors": [
            {"competitor": "Capgemini", "our_counter_angle": "Spécialisation data vs généraliste"}
        ],
        "killer_question": "Qui pilote votre migration data ?",
    }
    p1, p2, p3 = _patches(claude_return=card)
    with p1, p2, p3:
        res = client.post(
            "/battlecard/generate",
            json={"account_id": "a1", "user_id": "u1", "profile_data": {"companyName": "Acme", "offers": ["Data"]}},
        )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["vs_competitors"][0]["competitor"] == "Capgemini"


def test_battlecard_generate_502_on_claude_error(client: TestClient) -> None:
    p1, p2, p3 = _patches(claude_side_effect=ValueError("fail"))
    with p1, p2, p3:
        res = client.post(
            "/battlecard/generate",
            json={"account_id": "a1", "user_id": "u1", "profile_data": {"companyName": "Acme"}},
        )
    assert res.status_code == 502


def test_battlecard_generate_requires_account_id(client: TestClient) -> None:
    res = client.post("/battlecard/generate", json={"user_id": "u1"})
    assert res.status_code == 422
