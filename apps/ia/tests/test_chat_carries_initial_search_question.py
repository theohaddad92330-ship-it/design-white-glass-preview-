"""#2164.52 — TRANSMETTRE LA QUESTION INITIALE À LAURA.

`accounts.user_context` porte le texte libre que l'utilisateur a tapé au
lancement (ou à la relance) d'une analyse — `AccountLaunchSurface.tsx`,
`useAnalysis.ts:126`. `ChatContextService.build` (apps/api) lit déjà la ligne
`accounts` ENTIÈRE (`accountData = account as unknown as Record<string,
unknown>`, `chat-context.service.ts:748`), donc `user_context` traverse déjà
la frontière NestJS → IA. `build_system_prompt` (`bellum_advisor.py`) construit
le bloc « COMPTE ANALYSÉ » depuis `account_data` mais ne lisait jamais cette
clé : la question qui a lancé l'analyse restait invisible pour Laura sur
« Continuer avec Laura », alors même que la donnée voyageait déjà jusqu'à ses
pieds — le même défaut que #2271.16 (`href`, `test_account_card_context_href.py`)
sur un autre champ du même dict.

Même garde que `account_href_line` (JAMAIS de donnée fictive) : un compte
lancé sans texte libre (le cas le plus courant — le champ est optionnel côté
écran) ne pose aucune ligne inventée.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt


def test_the_initial_question_typed_at_launch_reaches_the_prompt():
    prompt = build_system_prompt(
        {},
        {
            "id": "acc-thales",
            "company_name": "THALES",
            "sector": "Défense",
            "user_context": "On cherche un contact DSI, ils ont un appel d'offres cybersécurité en cours.",
        },
        "",
        "",
    )
    assert "COMPTE ANALYSÉ" in prompt
    assert "On cherche un contact DSI, ils ont un appel d'offres cybersécurité en cours." in prompt


def test_an_account_launched_without_free_text_never_invents_a_question():
    # JAMAIS de donnée fictive : `user_context` absent/vide ⇒ aucune ligne
    # "Question initiale", jamais un "N/A" que le modèle recopierait comme si
    # une question avait réellement été posée.
    prompt = build_system_prompt(
        {},
        {"id": "acc-acme", "company_name": "ACME", "sector": "Industrie"},
        "",
        "",
    )
    assert "COMPTE ANALYSÉ" in prompt
    assert "Question initiale" not in prompt


def test_a_blank_or_whitespace_only_user_context_is_treated_as_absent():
    prompt = build_system_prompt(
        {},
        {"id": "acc-acme", "company_name": "ACME", "user_context": "   "},
        "",
        "",
    )
    assert "Question initiale" not in prompt
