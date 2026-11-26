"""#2271.16 — le compte déjà EN CONTEXTE porte son `href`, pas seulement le
résultat de `get_account_briefing`.

Mesuré deux fois : le 17/09 le point était déclaré « livré » sur la foi du
RENDU (`ReplyBlockView.tsx:40` existe et compile) ; le 18/09, en recette
production sur `THALES`, « Présente-moi le compte THALES » rendait une simple
liste à puces — aucune carte, aucun lien. `href` a d'abord été ajouté à
`build_account_briefing` (le résultat de l'OUTIL, `chat_tools.py`), mais Laura
répond très souvent SANS appeler cet outil : quand la conversation est déjà
scopée à un compte, `build_system_prompt` injecte directement ses champs sous
« COMPTE ANALYSÉ » (Entreprise, Secteur, CA…) — jamais son `id`. Un modèle qui
répond depuis ce contexte n'a donc AUCUN `href` légitime à poser sur la carte
`account_card` (le contrat l'exige, `reply-blocks.ts`) et retombe sur du
texte — exactement le bug mesuré.

Ce test EXIGE l'ÉMISSION (le prompt système porte le chemin), pas seulement
que le code compile : un test qui ne regarderait que le rendu web resterait
vert pendant que ce chemin-ci reste cassé, comme le 17/09.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt


def test_an_account_already_in_context_carries_its_href():
    prompt = build_system_prompt(
        {},
        {"id": "acc-thales", "company_name": "THALES", "sector": "Défense"},
        "",
        "",
    )
    assert "COMPTE ANALYSÉ" in prompt
    assert "- Fiche : /accounts/acc-thales" in prompt


def test_an_account_without_a_readable_id_never_invents_a_href():
    # JAMAIS de donnée fictive : sans id lisible, pas de ligne "Fiche" — jamais
    # un "/accounts/N/A" que le modèle recopierait tel quel dans une carte.
    prompt = build_system_prompt(
        {},
        {"company_name": "ACME", "sector": "Industrie"},
        "",
        "",
    )
    assert "COMPTE ANALYSÉ" in prompt
    assert "- Fiche :" not in prompt
    assert "/accounts/N/A" not in prompt
