"""Comparaison de prospects — prompt (profil résolu) et endpoint (câblé de bout
en bout via le proxy NestJS). La requête est scopée au caller (user_id)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from app.prompts.bellum_compare import build_system_prompt, build_user_prompt

_ACCOUNTS = [
    {"id": "a1", "company_name": "EDF", "priority_score": 8, "status": "completed", "raw_analysis": {}},
    {"id": "a2", "company_name": "SNCF", "priority_score": 6, "status": "completed", "raw_analysis": {}},
]


def _fake_sb(accounts: list) -> MagicMock:
    """Supabase double for the single scoped `accounts` query (`.in_().eq()`); the
    profiles branch is skipped because tests pass `profile_data`."""
    chain = MagicMock()
    chain.select.return_value = chain
    chain.in_.return_value = chain
    chain.eq.return_value = chain
    chain.aexecute = AsyncMock(return_value=MagicMock(data=accounts))
    sb = MagicMock()
    sb.table.return_value = chain
    return sb


def _patches(claude_return=None, claude_side_effect=None, accounts=None):
    claude_kwargs = {}
    if claude_side_effect is not None:
        claude_kwargs["side_effect"] = claude_side_effect
    else:
        claude_kwargs["return_value"] = (claude_return, None)
    return (
        patch("app.routers.compare.get_supabase", return_value=_fake_sb(_ACCOUNTS if accounts is None else accounts)),
        patch("app.routers.compare.call_claude", new_callable=AsyncMock, **claude_kwargs),
    )


# ── Prompt ──────────────────────────────────────────────────────────────────


def test_system_prompt_uses_resolved_esn_profile():
    prompt = build_system_prompt({"companyName": "Sales Connect", "offers": ["Data & IA"]})
    assert "Sales Connect" in prompt
    assert "Data & IA" in prompt
    assert "votre ESN" not in prompt


def test_system_prompt_falls_back_to_legacy_then_default():
    assert "Acme IT" in build_system_prompt({"esn_name": "Acme IT"})
    assert "votre ESN" in build_system_prompt({})


def test_user_prompt_lists_companies_and_offers():
    prompt = build_user_prompt(
        analyses=[{"company_name": "EDF"}, {"company_name": "SNCF"}],
        profile={"companyName": "Sales Connect", "offers": ["Data", "Cloud"]},
    )
    assert "EDF" in prompt and "SNCF" in prompt
    assert "Data" in prompt


# ── #2303.24-.27 (épopée #2790) — verdict nommé, périmètre par périmètre ────


def test_user_prompt_asks_for_the_named_verdict():
    """Le modèle doit produire un choix principal, un repli, un écart pour
    l'instant (nommé, jamais silencieux) et l'information qui ferait bouger le
    classement — les quatre sorties de LAU-FINAL-044, #2303.24/.25/.26/.27."""
    prompt = build_user_prompt(
        analyses=[{"company_name": "Thales groupe"}, {"company_name": "Land & Air Systems"}],
        profile={"companyName": "Sales Connect", "offers": ["Data"]},
    )
    for key in ("main_choice", "fallback_choice", "avoid_for_now", "would_change_ranking"):
        assert f'"{key}"' in prompt


def test_system_prompt_names_the_four_verdict_outputs_never_a_probability():
    prompt = build_system_prompt({"companyName": "Sales Connect"})
    assert "choix principal" in prompt
    assert "choix de remplacement" in prompt
    assert "à éviter pour le moment" in prompt
    assert "changer le classement" in prompt
    # Une raison textuelle, jamais un chiffre de chance (doctrine : aucune probabilité).
    assert "% de chance" not in prompt.lower()
    assert "chances de" not in prompt.lower()


# ── Endpoint ────────────────────────────────────────────────────────────────


def test_compare_returns_prioritisation(client: TestClient) -> None:
    result = {
        "comparison": [{"company": "EDF", "recommendation": "GO"}, {"company": "SNCF", "recommendation": "PRUDENT"}],
        "priority_order": ["EDF", "SNCF"],
        "quick_win": "EDF",
    }
    p1, p2 = _patches(claude_return=result)
    with p1, p2:
        res = client.post(
            "/compare/",
            json={"account_ids": ["a1", "a2"], "user_id": "u1", "profile_data": {"companyName": "Acme"}},
        )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["priority_order"] == ["EDF", "SNCF"]


def test_compare_rejects_empty_account_ids(client: TestClient) -> None:
    p1, p2 = _patches(claude_return={})
    with p1, p2:
        res = client.post("/compare/", json={"account_ids": [], "user_id": "u1", "profile_data": {}})
    assert res.status_code == 400


def test_compare_502_on_claude_error(client: TestClient) -> None:
    p1, p2 = _patches(claude_side_effect=ValueError("fail"))
    with p1, p2:
        res = client.post(
            "/compare/",
            json={"account_ids": ["a1", "a2"], "user_id": "u1", "profile_data": {"companyName": "Acme"}},
        )
    assert res.status_code == 502


# ── #2293.8 / .9 / .10 — normalisation déterministe ─────────────────────────


def test_compare_joins_the_normalization_and_names_excluded_accounts(client: TestClient) -> None:
    accounts = [*_ACCOUNTS, {"id": "a3", "company_name": "RATP", "status": "analyzing", "raw_analysis": {}}]
    p1, p2 = _patches(claude_return={"priority_order": ["EDF", "SNCF"]}, accounts=accounts)
    with p1, p2 as claude:
        res = client.post(
            "/compare/",
            json={"account_ids": ["a1", "a2", "a3"], "user_id": "u1", "profile_data": {"companyName": "Acme"}},
        )
    data = res.json()["data"]
    assert [row["company"] for row in data["normalization"]] == ["EDF", "SNCF"]
    assert data["excluded"] == [{"account_id": "a3", "company": "RATP", "reason": "analyse non terminée"}]
    assert "comparable_on_equal_footing" in data
    # Le compte écarté n'atteint pas le modèle ; la normalisation, si.
    user_prompt = claude.call_args.args[1]
    assert "RATP" not in user_prompt
    assert "NORMALISATION" in user_prompt


def test_compare_without_any_comparable_account_never_calls_the_model(client: TestClient) -> None:
    accounts = [{"id": "a1", "company_name": "EDF", "status": "analyzing", "raw_analysis": {}}]
    p1, p2 = _patches(claude_return={}, accounts=accounts)
    with p1, p2 as claude:
        res = client.post(
            "/compare/", json={"account_ids": ["a1", "a9"], "user_id": "u1", "profile_data": {"companyName": "Acme"}}
        )
    assert res.status_code == 200
    data = res.json()["data"]
    assert len(data["excluded"]) == 2
    assert data["normalization"] == []
    claude.assert_not_called()
