"""#3695.3 — un signal ancien n'est jamais présenté comme récent dans le prompt du message."""

from datetime import date

from app.prompts.bellum_outreach import build_user_prompt
from app.services.message_signals import render_message_signals

TODAY = date(2026, 10, 6)
FRESH = {"signal": "Plan stratégique 2029 annoncé", "type": "projet", "date": "2026-07"}
OLD_JOB = {"signal": "Recrutement de 12 architectes cloud", "type": "recrutement", "date": "2024-03"}
UNDATED = {"signal": "Refonte du SI évoquée en interview", "type": "projet", "date": ""}


def test_all_recent_keeps_the_historical_block_byte_for_byte():
    """Témoin : aucun signal ancien ⇒ le rendu est celui d'avant ce lot."""
    out = render_message_signals([FRESH], today=TODAY)
    assert out == f"\nSIGNAUX RÉCENTS (source d'accroche prioritaire) :\n{[FRESH]!s}"


def test_no_signal_renders_nothing():
    assert render_message_signals([], today=TODAY) == ""
    assert render_message_signals(None, today=TODAY) == ""


def test_old_signal_is_never_under_the_recent_heading():
    out = render_message_signals([OLD_JOB, FRESH], today=TODAY)
    recent_part, _, old_part = out.partition("SIGNAUX ANCIENS")
    assert "Plan stratégique 2029" in recent_part
    assert "Recrutement de 12 architectes" not in recent_part
    assert "Recrutement de 12 architectes" in old_part
    assert "2024-03" in old_part
    assert "jamais" in old_part.lower() and "récent" in old_part.lower()


def test_only_old_signals_leave_no_recent_heading_at_all():
    out = render_message_signals([OLD_JOB], today=TODAY)
    assert "SIGNAUX RÉCENTS" not in out
    assert "SIGNAUX ANCIENS" in out


def test_undated_signal_is_named_undated_not_recent():
    out = render_message_signals([UNDATED, FRESH], today=TODAY)
    assert "Refonte du SI" in out.split("SIGNAUX ANCIENS")[1]
    assert "non daté" in out.lower()


def test_window_depends_on_type_so_a_recent_regulation_is_not_flagged():
    regulation = {"signal": "Échéance NIS2", "type": "regulation", "date": "2025-01"}
    assert "SIGNAUX ANCIENS" not in render_message_signals([regulation], today=TODAY)


def test_stored_freshness_is_not_trusted_it_is_recomputed():
    """Un dossier ancien peut porter `freshness: current` : la date seule fait foi aujourd'hui."""
    stale_but_stamped = {**OLD_JOB, "freshness": "current"}
    assert "SIGNAUX ANCIENS" in render_message_signals([stale_but_stamped], today=TODAY)


def test_build_user_prompt_uses_it_and_keeps_the_account_elements():
    prompt = build_user_prompt(
        contact={"fullName": "Claire Martin", "title": "Directrice des achats IT"},
        raw_analysis={"companyName": "Nova"},
        profile={},
        recent_signals=[OLD_JOB, FRESH],
        channel="email",
        context="",
        company_name="Nova",
    )
    assert "Directrice des achats IT" in prompt and "Plan stratégique 2029" in prompt
    assert "SIGNAUX ANCIENS" in prompt
