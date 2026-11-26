"""#1611.4 — le plan lit la mémoire marché, mais SEULEMENT l'angle.

Trois choses à défendre :

1. `market_memory_directive_block` — vide sans corroboration (byte-identique
   avec avant ce lot), et porte l'interdit absolu quand il y a une
   corroboration : verification-only sans preuve actuelle, jamais dans un
   message.
2. `build_plan_shared_context` — le nouveau paramètre est ADDITIF : les appels
   à 3/4 arguments (existants) restent byte-identiques.
3. La section `evaluation` (#1607.1) porte désormais les quatre blocs BELLUM
   READ, avec la règle de `nextAction` qui cite explicitement le signal
   mémoire marché.
"""

from __future__ import annotations

from app.prompts.bellum_plan import (
    build_plan_shared_context,
    build_subsection_user_prompt,
    market_memory_directive_block,
)


def test_sans_corroboration_le_bloc_est_vide() -> None:
    assert market_memory_directive_block([]) == ""


def test_avec_corroboration_le_bloc_nomme_les_expertises_et_linterdit() -> None:
    block = market_memory_directive_block(["Data & Intelligence Artificielle", "Cloud & Infrastructure"])
    assert "Data & Intelligence Artificielle" in block
    assert "Cloud & Infrastructure" in block
    assert "PAS une preuve d'intervention actuelle" in block
    assert "VÉRIFICATION" in block
    assert "JAMAIS une action commerciale" in block
    assert "Ne cite JAMAIS ce signal" in block
    # L'interdit vaut pour un message — le mot-clé apparaît explicitement.
    assert "message destiné à être envoyé" in block


def test_2127_22_le_bloc_nomme_explicitement_le_timing_interdit() -> None:
    """#2127.22 — Market Memory n'influence PAS directement le timing.

    Avant ce point, l'interdit ne nommait qu'« un besoin » : le mot « timing »
    n'apparaissait nulle part dans le bloc, alors que l'axe d'évaluation
    `timing` (bellum_plan.py, scoreBreakdown) est précisément « signaux/
    besoins/budget MAINTENANT ». Un interdit qui ne nomme pas ce qu'il vise ne
    se garde pas — il se devine. Ce test le rend explicite et vérifiable.
    """
    block = market_memory_directive_block(["Data / IA"])
    assert "timing" in block.lower()


def test_le_bloc_ne_recopie_que_les_libelles_recus_rien_dautre() -> None:
    # La fonction ne prend qu'une liste de libellés d'expertise EN ENTRÉE — la
    # vraie protection contre une fuite de nom d'ESN ou de comptage de parcours
    # vit dans `reinforced_expertises` (testée séparément), qui ne les laisse
    # jamais atteindre cette fonction. Ce test fige que la sortie ne contient
    # QUE ce qui a été donné, jamais un fait inventé au passage.
    given = ["Data / IA"]
    block = market_memory_directive_block(given)
    for label in given:
        assert label in block
    # Aucun nom propre d'ESN (fixture volontairement absente de `given`) ne
    # peut apparaître : la fonction ne fait qu'interpoler ce qu'on lui donne.
    assert "Sopra" not in block
    assert "Capgemini" not in block


def test_shared_context_sans_bloc_marche_reste_byte_identique() -> None:
    # Les appels existants (3 ou 4 arguments) ne doivent RIEN changer.
    baseline = build_plan_shared_context("SNCF", "{}", "[]")
    assert market_memory_directive_block([]) == ""
    assert build_plan_shared_context("SNCF", "{}", "[]", market_memory_block="") == baseline


def test_shared_context_porte_le_bloc_marche_quand_il_est_fourni() -> None:
    block = market_memory_directive_block(["Data / IA"])
    ctx = build_plan_shared_context("SNCF", "{}", "[]", market_memory_block=block)
    assert "ENVIRONNEMENT TECHNIQUE OBSERVÉ" in ctx
    assert "Data / IA" in ctx


#: Les noms EXACTS du contrat partagé — `bellumReadSchema` et
#: `evaluationSchema.bellum_read` dans
#: `packages/contracts/src/schemas/analysis/plan.ts`, lus par
#: `useAccountOverviewData.ts` (`analysis.evaluation?.bellum_read`,
#: `bellumRead?.verdict_line`).
#:
#: ⚠️ La première version de ce test demandait `bellumRead` / `verdictLine` /
#: `nextAction` en camelCase, et elle était VERTE : elle vérifiait que le prompt
#: disait ce que le prompt disait, jamais que le CONSOMMATEUR savait le lire. Le
#: modèle répondait donc sous des noms que rien dans le dépôt n'allait chercher —
#: quatre blocs produits, payés, et invisibles à l'écran. Mesuré en production le
#: 11/09/2026 sur une analyse réelle : `bellum_read` absent du dossier livré.
_CONTRACT_KEYS = ('"bellum_read"', '"verdict_line"', '"why"', '"missing"', '"next_action"')


def test_evaluation_section_porte_les_quatre_blocs_bellum_read() -> None:
    prompt = build_subsection_user_prompt(company_name="SNCF", section="evaluation")
    for key in _CONTRACT_KEYS:
        assert key in prompt, key
    # La règle qui rattache next_action au signal mémoire marché.
    assert "VÉRIFICATION" in prompt
    assert "action commerciale" in prompt


def test_le_prompt_nemploie_aucun_nom_en_camelCase_pour_ce_bloc() -> None:
    """SAIT DIRE NON — un retour au camelCase refait exactement le défaut.

    Le bloc doit sortir sous les noms du contrat, pas sous ceux qui se lisent
    bien en JavaScript : c'est `bellum_read` que le dossier porte et que l'écran
    va chercher.
    """
    prompt = build_subsection_user_prompt(company_name="SNCF", section="evaluation")
    for forbidden in ('"bellumRead"', '"verdictLine"', '"nextAction"'):
        assert forbidden not in prompt, forbidden


# ── Le champ doit SURVIVRE au modèle qui relit la réponse ───────────────────
#
# ⚠️⚠️ Défaut mesuré en production le 11/09/2026 : le prompt demandait les quatre
# blocs, le modèle pouvait les rendre, et le dossier livré n'en portait AUCUN.
# `Evaluation` (pydantic) n'avait pas le champ, et pydantic IGNORE les clés
# qu'il ne connaît pas — `ActionPlanOutput.model_validate(merged)` l'effaçait en
# silence. Aucune erreur, aucun test en échec : les tests du prompt vérifiaient
# le prompt, ceux de l'écran montaient le composant avec des données à la main.
#
# La leçon, à tenir pour tout champ futur : **un champ ajouté au prompt s'ajoute
# AUSSI au modèle qui relit la réponse.**


def test_le_bloc_survit_a_la_validation_pydantic() -> None:
    from app.models.outputs.plan import Evaluation

    evaluation = Evaluation.model_validate(
        {
            "verdict": "PRUDENT",
            "score": 15,
            "bellum_read": {
                "verdict_line": "SNCF se travaille par entité, pas au niveau groupe.",
                "why": ["DSI Retail identifiée", "appel d'offres en cours"],
                "missing": "Pas de contact confirmé côté DSI Retail",
                "next_action": "Vérifier si l'équipe Java actuelle travaille avec des externes.",
            },
        }
    )
    assert evaluation.bellum_read is not None
    assert evaluation.bellum_read.verdict_line.startswith("SNCF")
    assert len(evaluation.bellum_read.why) == 2


def test_le_bloc_ressort_en_snake_case_meme_avec_by_alias() -> None:
    """Le dossier est sérialisé par `model_dump(by_alias=True)`.

    Sans alias sur ces champs, ils ressortent sous leur NOM — c'est-à-dire le
    snake_case du contrat partagé, celui que `useAccountOverviewData.ts` va
    chercher. Un alias camelCase ici referait le défaut d'un cran plus loin.
    """
    from app.models.outputs.plan import Evaluation

    dumped = Evaluation.model_validate(
        {"bellum_read": {"verdict_line": "…", "why": [], "missing": None, "next_action": "…"}}
    ).model_dump(by_alias=True)
    assert "bellum_read" in dumped
    assert "bellumRead" not in dumped
    assert set(dumped["bellum_read"]) == {"verdict_line", "why", "missing", "next_action"}


def test_un_dossier_sans_le_bloc_reste_valide() -> None:
    """Lecture tolérante : les dossiers analysés AVANT ce changement n'ont pas le
    champ, et ils doivent continuer à se charger — l'écran retombe alors sur la
    justification d'un seul tenant."""
    from app.models.outputs.plan import Evaluation

    assert Evaluation.model_validate({"verdict": "GO", "score": 20}).bellum_read is None
