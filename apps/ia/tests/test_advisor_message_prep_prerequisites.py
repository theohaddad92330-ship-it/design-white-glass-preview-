"""#3248.1/#3248.2 (épopée #3248, recette prod 29/09, RÉFUTÉ) — « Prépare un
message de prospection pour le DSI de La Poste » a fait proposer trois
contacts et un canal sans jamais dire que l'opt-out serait vérifié, ni nommer
les consultants déjà positionnés sur le compte. La règle #7 de
`bellum_advisor.build_system_prompt` (bloc INVARIANT) ferme ce point : elle
n'est templatisée par aucun argument, donc sa seule preuve d'appelant est
qu'elle figure dans TOUT prompt construit, quel que soit le profil.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt


def test_the_prompt_requires_naming_opt_out_and_past_consultants_before_a_message():
    prompt = build_system_prompt({}, {}, "", "")
    assert "get_account_preflight" in prompt
    assert "past_consultants" in prompt
    assert "opt-out" in prompt
    assert "prepare_message_for_contact" in prompt
    assert "prepare_mail_draft" in prompt


def test_the_hypothesis_announcement_never_belongs_to_a_third_party_draft():
    # #3248.3 — la phrase « Je pars sur X. Tu peux corriger. » est réservée à
    # la réponse de Laura, jamais à un corps de message ou d'email préparé.
    prompt = build_system_prompt({}, {}, "", "")
    assert "CETTE PHRASE T'APPARTIENT, JAMAIS AU TIERS" in prompt


def test_the_cold_call_flow_is_standing_behaviour_without_any_library_import():
    # #3443 (recette prod 02/10) — sans import de l'exemple d'appel à froid, la
    # question du lot ne donnait ni la permission de 30 secondes ni la question
    # de visibilité sur les compétences : le déroulé ne vivait QUE dans la
    # bibliothèque. Il vit maintenant dans le prompt, dans TOUT prompt.
    prompt = build_system_prompt({}, {}, "", "")
    assert "APPEL À FROID, LE DÉROULÉ" in prompt
    assert "30 secondes" in prompt
    assert "visibilité sur les compétences" in prompt
    assert "référence comparable" in prompt
