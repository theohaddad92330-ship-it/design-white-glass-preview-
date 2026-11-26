"""Icebreaker messages must be written from the REAL ESN profile resolved
server-side (AnalysisProfileData: companyName / offers), not the "votre ESN"
fallback (Théo: messages basés sur profil + signal + contact)."""

from __future__ import annotations

from app.prompts.bellum_icebreaker import build_system_prompt, build_user_prompt


def test_system_prompt_uses_resolved_esn_profile():
    profile = {"companyName": "Sales Connect", "offers": ["Architecture SI", "Agilité"]}
    prompt = build_system_prompt(profile)
    assert "Sales Connect" in prompt
    assert "Architecture SI" in prompt
    assert "votre ESN" not in prompt


def test_system_prompt_falls_back_to_legacy_keys_then_default():
    # Legacy flat keys still honoured (older profiles-row callers).
    assert "Acme IT" in build_system_prompt({"esn_name": "Acme IT", "core_offers": ["Cloud"]})
    # Nothing → generic default (never crashes).
    assert "votre ESN" in build_system_prompt({})


def test_user_prompt_reads_offers_from_resolved_profile():
    prompt = build_user_prompt(
        contact={"first_name": "Jean", "last_name": "Dupont", "title": "DSI", "organization_name": "SNCF"},
        raw_analysis={},
        profile={"companyName": "Sales Connect", "offers": ["Data", "MLOps"]},
    )
    assert "Data" in prompt and "MLOps" in prompt
