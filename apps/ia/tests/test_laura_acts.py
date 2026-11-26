"""#4438 — Laura AGIT au lieu de demander, élargit seule, parle peu.

Audit des conversations réelles du 21/10 (commentaire sur #4438) : 26 % des
réponses proposaient d'élargir au lieu de le faire, 29 % dépassaient 250 mots.
Ces tests tiennent les CONSIGNES (prompt) et les ASSERTIONS de la porte
qualité IA (promptfoo) qui rejouent les cas de l'audit.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.prompts import bellum_advisor, intent_route
from app.prompts.laura_acts import (
    BLOCK_LAURA_ACTS,
    CHAT_PROSE_MAX_WORDS,
    asks_to_widen_or_continue,
    prose_word_count,
)

_SYSTEM = bellum_advisor.build_system_prompt({}, {}, "", "")


def test_the_block_reaches_the_system_prompt():
    assert BLOCK_LAURA_ACTS in _SYSTEM


def test_the_block_says_widen_yourself_and_name_what_was_widened():
    block = BLOCK_LAURA_ACTS.lower()
    assert "élargis toi-même" in block
    assert "une ligne" in block and "ce que tu as élargi" in block
    for axis in ("zone", "compétence", "secteur", "taille", "signal"):
        assert axis in block


def test_the_block_keeps_the_human_gestures():
    block = BLOCK_LAURA_ACTS.lower()
    for gesture in ("envoi", "crm", "plafond"):
        assert gesture in block
    # Un e-mail se PRÉPARE, jamais envoyé.
    assert "prépar" in block


def test_the_block_bounds_the_prose():
    assert CHAT_PROSE_MAX_WORDS == 120
    assert f"{CHAT_PROSE_MAX_WORDS} mots" in BLOCK_LAURA_ACTS


@pytest.mark.parametrize(
    "removed",
    [
        "tu proposes d'élargir, tu ne l'élargis pas toi-même",
        "tu poses UNE question qui les distingue avant de choisir",
    ],
)
def test_the_old_ask_first_rules_are_gone(removed):
    assert removed not in _SYSTEM


def test_the_contradictory_constraints_rule_renders_before_asking():
    text = intent_route._CONSTRAINT_CONSISTENCY["fr"]
    assert "rends les deux variantes" in text.lower()


def test_the_templates_are_shortened():
    assert "DIX temps" not in _SYSTEM
    assert "toujours ces cinq temps" not in _SYSTEM


def test_the_interrupted_work_reminder_resumes_instead_of_asking():
    from app.prompts.thread_state import INTERRUPTED_WORK_BLOCK

    assert "Reprendre ?" not in INTERRUPTED_WORK_BLOCK
    assert "reprends" in INTERRUPTED_WORK_BLOCK.lower()


# ── les assertions de la porte qualité IA, prouvées sans réseau ─────────────


@pytest.mark.parametrize(
    "text",
    [
        "Aucun compte trouvé. Tu veux que j'élargisse à l'Occitanie ?",
        "Je peux poursuivre avec une recherche élargie si tu veux.",
        "Je peux continuer sur le reste si tu le souhaites.",
        "Veux-tu que j'élargisse la recherche ?",
        "Souhaites-tu que je continue ?",
        "Tu veux ces comptes en France, dans une région précise, ou à distance ?",
        "Quel signal privilégier : recrutement, appel d'offres, marché attribué ?",
    ],
)
def test_a_widening_or_continuing_question_is_caught(text):
    assert asks_to_widen_or_continue(text)


@pytest.mark.parametrize(
    "text",
    [
        "Voici 10 comptes. J'ai élargi Toulouse à l'Occitanie : la ville seule en donnait 4.",
        "Je poursuis sur le reste.",
        "Brouillon prêt : relis-le avant de l'envoyer.",
    ],
)
def test_a_result_with_one_line_is_not_caught(text):
    assert not asks_to_widen_or_continue(text)


def test_lists_and_blocks_do_not_count_as_prose():
    listing = "\n".join(f"- Compte {i} — aéronautique, Toulouse, recrute en ce moment" for i in range(40))
    text = f"Voici 40 comptes.\n\n{listing}\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nJ'ai élargi à l'Occitanie."
    assert prose_word_count(text) < 15


def test_a_wall_of_prose_is_counted():
    assert prose_word_count("mot " * 300) == 300


_CHAT_YAML = Path(__file__).resolve().parents[1] / "evals" / "promptfoo" / "chat.yaml"


def test_the_gate_replays_at_least_eight_audit_cases():
    raw = _CHAT_YAML.read_text(encoding="utf-8")
    assert raw.count("#4438") >= 8
    assert raw.count("asserts.py:laura_acts") >= 8


def test_the_gate_assertion_fails_a_question_and_a_wall_of_text():
    from evals.promptfoo.asserts import laura_acts

    ok = laura_acts(
        json.dumps(
            {"text": "Voici 3 comptes. J'ai élargi à la région.", "tool_calls": [{"name": "run_account_search"}]}
        ),
        {},
    )
    assert ok["pass"] is True
    asks = laura_acts(
        json.dumps(
            {"text": "Aucun résultat. Tu veux que j'élargisse ?", "tool_calls": [{"name": "run_account_search"}]}
        ),
        {},
    )
    assert asks["pass"] is False
    clarifies = laura_acts(json.dumps({"text": "", "tool_calls": [{"name": "ask_clarification"}]}), {})
    assert clarifies["pass"] is False
    wall = laura_acts(json.dumps({"text": "mot " * 200, "tool_calls": [{"name": "run_account_search"}]}), {})
    assert wall["pass"] is False
    nothing = laura_acts(json.dumps({"text": "D'accord.", "tool_calls": []}), {})
    assert nothing["pass"] is False


# ── R22-LG (recette prod /chat 22/10) — la porte rejoue les FAIL de la recette ──


@pytest.mark.parametrize(
    "text",
    [
        "Aucun compte en aéronautique à Toulouse. Restent à faire : la recherche externe.",
        "Voici 3 comptes.\n\nEt derrière ta question, il y a probablement un deuxième sujet : X. "
        "Je peux le qualifier avec toi avant de préparer quoi que ce soit.",
    ],
)
def test_the_gate_fails_a_leftover_or_the_fixed_sentence(text):
    from evals.promptfoo.asserts import laura_acts

    out = laura_acts(json.dumps({"text": text, "tool_calls": [{"name": "run_account_search"}]}), {})
    assert out["pass"] is False


def test_the_gate_replays_the_r22_failures():
    raw = _CHAT_YAML.read_text(encoding="utf-8")
    for case in ("#4438.1 (R22)", "#4408.1 (R22)", "#4435.3 (R22)", "#4421.2 (R22)", "#4438.3 (R22)"):
        assert case in raw, case


def test_the_replay_carries_the_router_turn_block_for_missions():
    # Le fournisseur rejoue le prompt du ROUTEUR : sans la consigne « missions du marché », le cas
    # #4421.2 mesurerait un prompt que la prod n'envoie pas.
    from evals.promptfoo.provider import _system_for

    assert "MISSIONS DU MARCHÉ" in _system_for("Trouve-moi des missions.")
    assert "MISSIONS DU MARCHÉ" not in _system_for("Trouve-moi 10 comptes aéronautique à Toulouse.")
