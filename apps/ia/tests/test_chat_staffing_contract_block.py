"""#3186.10 (recette prod 30/09 — reste : « rejouer ... sur un profil qui déclare
`service_types` ») — `_staffing_model()` est réparé (`test_staffing_model.py`)
mais n'était appelé que par le pipeline d'ANALYSE (`build_sales_context`) : la
conversation ne le lisait jamais. Ce fichier rejoue le tour côté prompt de
/chat : profil déclaré → ligne du prompt système → ce que Laura a sous les yeux
quand on lui demande « Comment présenter notre modèle de staffing ? ».

Même discipline que `test_strategy_rank_position.py` : la VALEUR lue change le
résultat, jamais une capture morte ; non déclaré, le prompt est byte-identique.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt
from app.services.sales_context import contract_model_line

QUESTION = "Comment présenter notre modèle de staffing ?"


def _prompt(profile: dict) -> str:
    return build_system_prompt(profile, {}, "", "")


def test_regie_declaree_est_sous_les_yeux_de_laura() -> None:
    prompt = _prompt({"service_types": ["Régie"]})
    assert "Mode contractuel déclaré : régie" in prompt


def test_forfait_declare_change_la_ligne() -> None:
    assert "Mode contractuel déclaré : forfait" in _prompt({"service_types": ["Forfait"]})
    assert "Mode contractuel déclaré : régie" not in _prompt({"service_types": ["Forfait"]})


def test_regie_et_forfait_ensemble_se_disent_mixtes_jamais_tranches() -> None:
    prompt = _prompt({"service_types": ["Régie", "Forfait"]})
    assert "Mode contractuel déclaré : mixte" in prompt


def test_rien_declare_le_prompt_est_byte_identique() -> None:
    assert _prompt({"service_types": ["Conseil"]}) == _prompt({})
    assert "Mode contractuel déclaré" not in _prompt({})


def test_aucun_mode_declare_laura_nomme_l_absence() -> None:
    # Recette prod 02/10 (#3186) : sans Régie/Forfait au profil, Laura disait
    # « freelances » et « principalement en régie » — une affirmation non sourcée.
    # Le prompt lui DIT que le mode n'est pas déclaré et lui interdit de le deviner.
    prompt = _prompt({"service_types": ["Conseil"]})
    assert "Mode contractuel : NON DÉCLARÉ" in prompt
    assert "n'affirme jamais" in prompt
    assert prompt.index("Mode contractuel : NON DÉCLARÉ") > prompt.index("PROFIL ESN")


def test_mode_declare_pas_de_ligne_d_absence() -> None:
    assert "NON DÉCLARÉ" not in contract_model_line({"service_types": ["Régie"]})


def test_axe_emploi_declare_est_etiquete_emploi_pas_staffing() -> None:
    # « Modèle de staffing : Principalement freelances » se lisait comme le mode
    # contractuel. C'est l'axe EMPLOI : l'étiquette le dit.
    prompt = _prompt({"staffing_model": "Principalement freelances / sous-traitants"})
    assert "Modèle d'emploi (CDI / freelances) : Principalement freelances" in prompt
    assert "Modèle de staffing :" not in prompt
    assert "Mode contractuel : NON DÉCLARÉ" in prompt


def test_tour_rejoue_freelances_declares_sans_mode_la_regie_n_est_pas_affirmable() -> None:
    prompt = _prompt({"staffing_model": "Uniquement freelances (pas de CDI)"})
    assert "Mode contractuel déclaré" not in prompt
    assert "ni que l'ESN est « principalement » en régie" in prompt


def test_la_ligne_ne_confond_pas_le_contrat_et_l_emploi() -> None:
    # Les cinq libellés CDI/freelance (`staffingModel`) restent un AXE DIFFÉRENT :
    # ils ne fabriquent jamais un mode contractuel.
    for profile in ({"staffingModel": "Freelances uniquement"}, {"staffing_model": "Salariés CDI"}):
        line = contract_model_line(profile)
        assert "NON DÉCLARÉ" in line
        assert "Mode contractuel déclaré" not in line


def test_la_ligne_est_dans_le_segment_stable_par_session_pas_l_invariant() -> None:
    prompt = _prompt({"service_types": ["Régie"]})
    # Posée dans le bloc PROFIL (variable par ESN), jamais dans les blocs
    # invariants : la même question ne change pas le prompt d'une autre ESN.
    assert prompt.index("Mode contractuel déclaré") > prompt.index("PROFIL ESN")
    assert QUESTION not in prompt


def test_les_modes_declares_sont_nommes_un_par_un() -> None:
    # Recette prod 02/10 : « mixte » seul ne disait pas QUELS modes — Laura
    # répondait freelance. Chaque mode déclaré est nommé, dans l'ordre déclaré.
    line = contract_model_line({"service_types": ["Régie", "Forfait"]})
    assert "mixte (régie, forfait)" in line
    assert "les nommer tous avant de parler de CDI ou de freelance" in line


def test_tour_rejoue_la_question_voit_les_modes_avant_l_axe_emploi() -> None:
    # Entrée (profil Régie + Forfait + freelances) → ce que reçoit le modèle quand
    # la question est posée : les deux modes sont nommés dans le bloc PROFIL.
    prompt = _prompt({"service_types": ["Régie", "Forfait"]})
    assert "mixte (régie, forfait)" in prompt
    assert prompt.index("Mode contractuel déclaré") > prompt.index("PROFIL ESN")


def test_3186_mode_non_declare_laura_propose_le_geste_de_le_renseigner() -> None:
    # Recette prod 03/10 : Laura disait bien « point non déclaré » mais ne PROPOSAIT
    # pas de le renseigner. Le prompt nomme maintenant le GESTE exact : la carte
    # `propose_guided_action` vers Réglages › Profil, avec ce qu'on y fait.
    prompt = _prompt({"service_types": ["Conseil"]})
    assert "propose_guided_action" in prompt
    assert "/settings/profile" in prompt
    assert "Prestations" in prompt


def test_3186_la_proposition_n_apparait_pas_quand_un_mode_est_declare() -> None:
    line = contract_model_line({"service_types": ["Régie"]})
    assert "propose_guided_action" not in line
    assert "/settings/profile" not in line


def test_3186_la_route_citee_est_un_ecran_de_reglages_connu() -> None:
    # Le geste cité ne doit jamais être refusé par `propose_guided_action` : la route
    # du prompt est dans le catalogue des écrans de réglages.
    from app.services.chat_tools import SETTINGS_SCREENS

    assert "/settings/profile" in {screen["route"] for screen in SETTINGS_SCREENS}


def test_tour_rejoue_sans_mode_la_carte_vers_reglages_profil_est_posee_par_le_serveur_3186() -> None:
    """Recette prod 04/10 : profil sans Régie/Forfait, « Comment présenter notre modèle de
    staffing ? » → « Présente-le en régie… », sans carte. Le serveur pose la carte et
    la consigne du tour interdit de supposer le mode."""
    from app.services.sales_context import contract_mode_turn_block, missing_contract_mode_proposal

    card = missing_contract_mode_proposal({"service_types": ["Conseil"]}, QUESTION)
    assert card is not None
    assert card["route"] == "/settings/profile"
    assert card["action"] == "open_screen"
    assert "mode contractuel" in card["label"]
    block = contract_mode_turn_block({"service_types": ["Conseil"]}, QUESTION)
    assert "n'est pas déclaré" in block and "JAMAIS" in block

    # Mode déclaré, ou autre question : ni carte ni consigne (jamais une carte superflue).
    assert missing_contract_mode_proposal({"service_types": ["Régie"]}, QUESTION) is None
    assert contract_mode_turn_block({"service_types": ["Régie"]}, QUESTION) == ""
    assert missing_contract_mode_proposal({}, "Quelle est ma priorité cette semaine ?") is None


def test_la_route_de_la_carte_est_un_ecran_de_reglages_connu_3186() -> None:
    from app.services.chat_tools import _is_known_app_route
    from app.services.sales_context import MISSING_CONTRACT_MODE_PROPOSAL

    assert _is_known_app_route(MISSING_CONTRACT_MODE_PROPOSAL["route"])
