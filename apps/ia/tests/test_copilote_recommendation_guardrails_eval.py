"""#3399 (LOT C06 30/09) — garde de
``laura_recommendation_guardrails.BLOCK_RECOMMENDATION_GUARDRAILS``.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt
from app.prompts.laura_recommendation_guardrails import BLOCK_RECOMMENDATION_GUARDRAILS

BARE = build_system_prompt({}, {}, "", "")
HORS_BLOC = BARE.replace(BLOCK_RECOMMENDATION_GUARDRAILS, "")

#: #3399 — les sept fautes nommées par le retour bêta, chacune sous son propre repère.
_SEVEN_GUARDRAILS: tuple[str, ...] = (
    "TITRE SEUL.",
    "GROUPE VS BU.",
    "DÉCIDEUR NOMMÉ, DÉCISION NOMMÉE.",
    "CHAMPION SANS PREUVE.",
    "DISPONIBILITÉ SEULE.",
    "RENDEZ-VOUS SANS ANGLE.",
    "COMPTE SANS MOUVEMENT.",
)

#: #3399.15 — les six questions qu'une recommandation doit couvrir.
_SIX_QUESTIONS: tuple[str, ...] = (
    "POURQUOI CE COMPTE",
    "LE MOMENT",
    "SUR QUEL PÉRIMÈTRE",
    "AVEC QUELLE PERSONNE",
    "AVEC QUELLE PREUVE",
    "AVEC QUELLE PROCHAINE ACTION",
)


def test_the_corpus_is_not_empty():
    assert BARE
    assert BLOCK_RECOMMENDATION_GUARDRAILS in BARE


def test_the_seven_guardrails_are_all_named():
    for guardrail in _SEVEN_GUARDRAILS:
        assert guardrail in BLOCK_RECOMMENDATION_GUARDRAILS, guardrail


def test_the_six_questions_are_all_named():
    for question in _SIX_QUESTIONS:
        assert question in BLOCK_RECOMMENDATION_GUARDRAILS, question


def test_a_prestigious_title_alone_is_not_enough():
    assert "ne fait pas, à lui seul, la bonne personne à contacter" in BLOCK_RECOMMENDATION_GUARDRAILS


def test_an_ex_esn_employee_is_not_a_champion_without_a_shown_act():
    assert (
        "sans un geste observé qui le prouve" in BLOCK_RECOMMENDATION_GUARDRAILS
    )


def test_availability_alone_never_replaces_fit():
    assert "ne remplace jamais l'adéquation" in BLOCK_RECOMMENDATION_GUARDRAILS


def test_a_recommendation_missing_a_question_says_so_rather_than_staying_generic():
    assert (
        "tu dis ce qui manque plutôt que de la rendre incomplète" in BLOCK_RECOMMENDATION_GUARDRAILS
    )


# #3399 (recette écran prod 26755bbac3, lot G04 30/09) — RESTE : « le format
# à six questions n'a pas été vu tel quel ». `BARE` ci-dessus appelle
# `build_system_prompt({}, {}, "", "")` — un profil, un compte et des
# contacts VIDES, jamais ce qu'un écran réel envoie (Devoteam, cité par la
# recette, a un profil, un compte et des contacts renseignés). Le doute
# légitime : `fit_to_budget` (GA-26, le même budget que `_CONTEXT_TOTAL_MAX`)
# rogne le contexte connaissance/plan/contacts quand il dépasse — est-ce que
# le bloc SURVIT à un tour chargé, ou seulement au tour vide du test existant ?
# Preuve : un contexte délibérément SURDIMENSIONNÉ (largement au-dessus de
# `_CONTEXT_TOTAL_MAX`) rogne bien `plan_summary`/`contacts_summary`, mais le
# bloc GARDE-FOUS reste verbatim — ce n'est PAS un segment budgété (GA-293,
# « segment invariant »), c'est un segment concaténé après coup.
#
# Ce que cette preuve NE peut PAS couvrir, honnêtement (doctrine « jamais de
# donnée fictive ») : que le MODÈLE suit réellement les six questions dans sa
# réponse EN PRODUCTION. Ça exige un appel Claude réel — `apps/ia/evals/`
# (golden_eval.py, run_eval.py, judge.py) est le mécanisme prévu pour ça, hors
# de portée de cette session (pas de réseau/clé API, même limite que les
# autres lots du 30/09). Ce test ferme ce qui est mécaniquement vérifiable :
# l'instruction atteint bien 100% des tours réels, même chargés, jamais
# recadrée par le budget.
def test_the_block_survives_a_realistically_loaded_prompt_not_just_the_bare_call():
    heavy_profile = {"esn_name": "Skaizen", "sellerRole": "Business Manager", "size": "80"}
    heavy_account = {"company_name": "Devoteam"}
    heavy_contacts = "\n".join(f"Contact {i} - Rôle {i} - decideur potentiel" for i in range(400))
    heavy_plan = "Étape " * 2000

    loaded = build_system_prompt(
        heavy_profile,
        heavy_account,
        heavy_contacts,
        heavy_plan,
        knowledge_context="fait pertinent " * 2000,
    )

    assert len(heavy_contacts) > 4000  # prouve que le trim AURAIT quelque chose à rogner
    assert BLOCK_RECOMMENDATION_GUARDRAILS in loaded
    for question in _SIX_QUESTIONS:
        assert question in loaded, question


def test_removing_the_block_drops_every_guardrail_and_every_question():
    for guardrail in _SEVEN_GUARDRAILS:
        assert guardrail not in HORS_BLOC, guardrail
    for question in _SIX_QUESTIONS:
        assert question not in HORS_BLOC, question


def test_3243_1_laura_pousse_toujours_un_consultant_si_l_utilisateur_le_veut() -> None:
    """#3243.1 (décision Louis 11/10) — aucune notion bloquante « consultant non sécurisé » : au
    plus une mention, jamais un refus. Sait dire NON si la phrase disparaît."""
    text = BLOCK_RECOMMENDATION_GUARDRAILS
    assert "jamais un refus" in text
    assert "si l'utilisateur veut" in text.lower()


# #3869.2 — recette prod 11/10 : un « Head of Procurement Morocco/Tunisia/Libya » proposé pour des achats
# IT du groupe. Un titre borné à une zone ou une entité n'est pas la bonne personne pour un périmètre plus large.
def test_a_title_bounded_to_a_zone_is_not_the_group_owner():
    assert "PÉRIMÈTRE DU TITRE." in BLOCK_RECOMMENDATION_GUARDRAILS
    assert "borné à une zone, un pays ou une entité" in BLOCK_RECOMMENDATION_GUARDRAILS
    assert "tu nommes l'écart" in BLOCK_RECOMMENDATION_GUARDRAILS


def test_a_first_name_alone_is_named_as_incomplete_identity():
    assert "IDENTITÉ INCOMPLÈTE." in BLOCK_RECOMMENDATION_GUARDRAILS
    assert "prénom seul" in BLOCK_RECOMMENDATION_GUARDRAILS
