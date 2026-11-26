"""#4421.11 / #4421.12 — une fiche SANS aucune compétence est le seul cas (avec introuvable et homonymes) où Laura
demande : UNE question, pas plus, et elle dit quoi fournir (les compétences, ou le CV) pour lancer la recherche.
`find_accounts_for_talent` rend `status: unavailable` et Laura dit `message` tel quel : la question est ce message."""

from __future__ import annotations

import re

from app.prompts.laura_acts import asks_to_widen_or_continue
from app.services.compilers.talent_accounts import compile_talent_accounts


def _no_skill() -> dict:
    market = {"unavailableReason": "skills_missing", "zones": ["Lille"], "skillTerms": []}
    return compile_talent_accounts(market, consultant_id="c-1", consultant_name="Hugo Houyez")


def test_4421_12_une_fiche_sans_competence_pose_une_seule_question() -> None:
    out = _no_skill()
    assert out["status"] == "unavailable"
    assert out["message"].count("?") == 1
    # La question dit quoi fournir pour lancer la recherche : les compétences, ou son CV.
    assert re.search(r"compétences", out["message"]) and "CV" in out["message"]
    # Ce n'est jamais une question d'élargissement (la porte qualité c77 la refuserait).
    assert not asks_to_widen_or_continue(out["message"])


def test_4421_12_une_fiche_sans_zone_pose_une_seule_question_a_choix() -> None:
    # REVIENT SUR #4421.12 (« une fiche sans zone ne pose aucune question », renvoi vers la fiche) : arbitrage de
    # Louis du 31/10/2026 — un critère bloquant manque (le lieu) → UNE question à choix, puis Laura agit.
    market = {"unavailableReason": "zones_missing", "zones": [], "skillTerms": ["Java"]}
    out = compile_talent_accounts(market, consultant_id="c-1", consultant_name="Hugo Houyez")
    assert out["message"].count("?") == 1
    assert "sa fiche" not in out["message"]  # ne renvoie plus vers la fiche
    assert not asks_to_widen_or_continue(out["message"])
    clar = out["clarification"]
    assert clar["via"] == "ask_clarification" and clar["criterion"] == "zones" and clar["then_pass_in"] == "zones"


def test_4421_12_la_question_competence_est_aussi_a_choix() -> None:
    clar = _no_skill()["clarification"]
    assert clar["via"] == "ask_clarification" and clar["criterion"] == "skills" and clar["then_pass_in"] == "skills"
    # Aucune option inventée : le serveur n'en écrit pas, il dit d'où elles viennent.
    assert "options" not in clar
    assert "jamais inventées" in clar["options_rule"]


def test_4421_12_les_autres_raisons_ne_posent_aucune_question() -> None:
    market = {"unavailableReason": "no_snapshot", "zones": ["Lille"], "skillTerms": ["Java"]}
    out = compile_talent_accounts(market, consultant_id="c-1", consultant_name="Hugo Houyez")
    assert "?" not in out["message"] and "clarification" not in out
