"""#2162.24 / #2891 — la demande du TOUR prime sur les preferences historiques
du profil.

Defaut mesure : "si l'utilisateur demande industrie et banque, ne pas
reinjecter l'assurance comme cible prioritaire uniquement parce qu'elle existe
dans son questionnaire" (#2162, criteres de recette). `sectors` dans le prompt
systeme (`build_system_prompt`) est `AnalysisProfileData.sectors`, lui-meme
mappe depuis `target_sectors` du questionnaire (`esnAnswersToProfileData`,
`packages/contracts/src/schemas/analysis.ts`) — les secteurs CIBLES DECLARES,
pas un simple libelle. Le prompt systeme les listait comme un FAIT du profil,
sans jamais dire que la demande explicite de CE tour (portee dans
`===== SOURCES =====` du prompt UTILISATEUR, `user_context`) doit primer.

Ce test pin la CONSIGNE, pas un comportement du modele (aucune recette live
possible cette nuit) — meme discipline que
`test_strategy_revenue_model.py::TestStrategyPromptCarriesTheRevenueModel` :
la preuve que le texte ATTEINT le prompt systeme, a l'endroit qui gouverne deja
comment le profil pilote la strategie ("PILOTAGE PAR TON PROFIL ESN").
"""

from __future__ import annotations

from app.prompts.bellum_strategy import build_system_prompt, run_context_precedence_directive

_PROFILE_WITH_SECTORS = {
    "companyName": "ExempleConseil",
    "sectors": ["Assurance & Mutuelles"],
}


def test_la_directive_nomme_le_risque_sans_inventer_de_secteur():
    """Le texte decrit le DEFAUT (reinjecter un secteur du profil absent de la
    demande de ce tour), jamais un secteur fictif — doctrine "jamais de donnee
    fictive" appliquee au PROMPT lui-meme."""
    directive = run_context_precedence_directive().lower()
    assert "prime" in directive
    assert "secteur" in directive
    assert "assurance" not in directive, "aucun secteur fictif ne doit apparaitre dans une consigne generique"


def test_le_prompt_systeme_porte_la_directive_dans_la_section_pilotage():
    """La preuve d'APPELANT : la regle ne vaut que si elle ATTEINT le prompt,
    et a l'endroit qui gouverne deja comment le profil pilote la strategie —
    jamais une regle isolee que rien ne relie a "Secteurs"."""
    prompt = build_system_prompt(_PROFILE_WITH_SECTORS)
    directive = run_context_precedence_directive()
    assert directive in prompt

    pilotage_start = prompt.lower().index("pilotage par ton profil esn")
    grounding_start = prompt.lower().index("grounding")
    pilotage_section = prompt[pilotage_start:grounding_start]
    assert directive in pilotage_section, "la regle de priorite n'est pas dans la section PILOTAGE"


def test_la_directive_est_presente_meme_sans_secteur_declare():
    """GA-18/GA-19 — la regle de priorite ne depend pas d'un secteur present :
    elle protege justement le cas ou le profil N'A RIEN de pertinent a dire ce
    tour-ci."""
    assert run_context_precedence_directive() in build_system_prompt({})
