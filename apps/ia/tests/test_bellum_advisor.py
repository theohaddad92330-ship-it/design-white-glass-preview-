"""Regression tests for the copilote system prompt builder.

Guards the crash that made the Copilote IA fail on already-enriched accounts:
`it_challenges` is a list of structured objects ({title, severity, …}), so the
old `", ".join(account_data["it_challenges"][:5])` raised TypeError.
"""
from __future__ import annotations

from app.prompts.bellum_advisor import _join_labels, build_system_prompt


def test_it_challenges_as_objects_do_not_crash_and_render_titles():
    account = {
        "company_name": "BNP Paribas",
        "it_challenges": [
            {"title": "Modernisation legacy", "severity": "high"},
            {"title": "Cybersécurité OT", "severity": "medium"},
        ],
    }
    prompt = build_system_prompt({}, account, "", "")
    assert "Modernisation legacy" in prompt
    assert "Cybersécurité OT" in prompt
    # The dict repr must never leak into the prompt.
    assert "{'title'" not in prompt


def test_it_challenges_none_is_tolerated():
    account = {"company_name": "ACME", "it_challenges": None}
    prompt = build_system_prompt({}, account, "", "")
    assert "Enjeux IT :" in prompt  # renders empty, no crash


def test_it_challenges_as_plain_strings_still_work():
    account = {"it_challenges": ["Dette technique", "Migration cloud"]}
    prompt = build_system_prompt({}, account, "", "")
    assert "Dette technique, Migration cloud" in prompt


def test_it_challenges_capped_at_five():
    account = {"it_challenges": [{"title": f"C{i}"} for i in range(8)]}
    prompt = build_system_prompt({}, account, "", "")
    assert "C4" in prompt
    assert "C5" not in prompt


def test_profile_uses_snake_case_fields_sent_by_the_web():
    profile = {
        "esn_name": "Skaizen",
        "esn_specialties": ["Data & IA", "Cloud"],
        "target_sectors": ["Banque", "Assurance"],
    }
    prompt = build_system_prompt(profile, {}, "", "")
    assert "Skaizen" in prompt
    assert "Data & IA, Cloud" in prompt
    assert "Banque, Assurance" in prompt


def test_join_labels_is_null_safe():
    assert _join_labels(None) == ""
    assert _join_labels([]) == ""
    assert _join_labels([{"description": "no title here"}]) == "no title here"


# ── Self-consistency A1 : transparence côté copilote ─────────────────────────


def test_self_consistency_notes_surface_in_the_prompt():
    account = {
        "company_name": "ACME",
        "selfConsistency": {
            "overallConfidence": "high",
            "notes": ["Score confirmé par double passe (20/25 GO aux deux passes)."],
        },
    }
    prompt = build_system_prompt({}, account, "", "")
    assert "FIABILITÉ DU DOSSIER" in prompt
    assert "Score confirmé par double passe" in prompt


def test_self_consistency_read_from_the_plan_blob_or_snake_case():
    # Payload plus ancien / non hoisté : le bloc vit sous raw_analysis.plan.
    nested = {"plan": {"selfConsistency": {"notes": ["Divergence détectée sur le score : passe 1 GO (20/25) vs passe 2 PRUDENT (16/25) — verdict retenu : passe 1."]}}}
    prompt = build_system_prompt({}, nested, "", "")
    assert "Divergence détectée sur le score" in prompt
    # Variante snake_case (raw_analysis racine est snake-casé côté API).
    snake = {"self_consistency": {"notes": ["Double passe : les plays prioritaires sont confirmés."]}}
    assert "plays prioritaires sont confirmés" in build_system_prompt({}, snake, "", "")


def test_self_consistency_absent_keeps_prompt_byte_identical():
    # Aucun bloc → aucune section FIABILITÉ (le golden advisor reste inchangé).
    without = build_system_prompt({}, {"company_name": "ACME"}, "", "")
    assert "FIABILITÉ DU DOSSIER" not in without
    empty_notes = build_system_prompt({}, {"company_name": "ACME", "selfConsistency": {"notes": []}}, "", "")
    assert without == empty_notes


# ── Tool Registry v2 : outils connectés + coûts dans le prompt ───────────────


def test_tools_summary_renders_the_connected_tools_block_with_costs():
    digest = (
        "- Dropcontact (connecté) : enrich_contact — coût : 1 crédit par enrichissement réussi\n"
        "- Slack (connecté) : send_notification — coût : gratuit (notification webhook)"
    )
    prompt = build_system_prompt({}, {"company_name": "ACME"}, "", "", tools_summary=digest)
    assert "OUTILS CONNECTÉS" in prompt
    assert "1 crédit par enrichissement réussi" in prompt
    assert "Slack" in prompt
    # Le garde-fou anti-outil-fantôme est dans l'en-tête du bloc.
    assert "ne propose JAMAIS un outil absent de cette liste" in prompt


def test_tools_summary_absent_keeps_prompt_byte_identical():
    # "" (défaut) → aucune section OUTILS CONNECTÉS, prompt inchangé au byte près.
    without = build_system_prompt({}, {"company_name": "ACME"}, "", "")
    assert "OUTILS CONNECTÉS" not in without
    blank = build_system_prompt({}, {"company_name": "ACME"}, "", "", tools_summary="   ")
    assert without == blank


# ── #2261.21-32 : capacités INTERNES (comptes, contacts, besoins, vivier,
# missions, mémoire marché, DataForge, routines) dans le même prompt que le
# registre d'outils tiers — ajout ISOLÉ, même contrat (défaut vide = byte
# identique) pour ne pas heurter le lot en cours sur ce fichier (LAU-CORE1).


def test_internal_capabilities_summary_renders_its_own_block():
    digest = "- tes comptes suivis (disponible)\n- les routines (indisponible) : coupées par l'opérateur"
    prompt = build_system_prompt(
        {}, {"company_name": "ACME"}, "", "", internal_capabilities_summary=digest
    )
    assert "CAPACITÉS INTERNES" in prompt
    assert "tes comptes suivis (disponible)" in prompt
    assert "coupées par l'opérateur" in prompt


def test_internal_capabilities_summary_absent_keeps_prompt_byte_identical():
    without = build_system_prompt({}, {"company_name": "ACME"}, "", "")
    assert "CAPACITÉS INTERNES" not in without
    blank = build_system_prompt({}, {"company_name": "ACME"}, "", "", internal_capabilities_summary="   ")
    assert without == blank


# #1952.9 — « NE PAS PRÉTENDRE QUE TOUT EST TERMINÉ » : `start_account_analysis`
# occupe le moteur plusieurs minutes (job async) et rend un statut « en cours »,
# jamais le résultat de l'analyse. Rien avant ce point n'interdisait au modèle
# de décrire ce lancement comme un travail déjà FAIT.
def test_launching_an_analysis_is_never_described_as_finished():
    prompt = build_system_prompt({}, {"company_name": "ACME"}, "", "")
    assert "start_account_analysis" in prompt
    assert "jamais qu'elle est faite" in prompt
    assert "LANCÉE et SUIVIE" in prompt
