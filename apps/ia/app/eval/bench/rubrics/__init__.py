"""Les barèmes par prompt du banc — un critère par primitive DÉJÀ expédiée.

Avant ce paquet, la colonne « qualité » du banc ne savait noter qu'un seul
prompt (``bellum_strategy``) et rendait honnêtement « non mesuré » pour tous les
autres. Sur ``bellum_organigramme``, ``bellum_contacts``, ``bellum_signals`` et
``bellum_facts`` — l'essentiel du chemin payant — « le modèle X gagne » ne
pouvait donc vouloir dire que « il rend un JSON valide, moins cher, plus vite ».
Jamais « il rend un meilleur organigramme ».

**Aucun critère n'a été inventé ici.** Le dépôt portait déjà ses critères de
qualité : ils étaient appliqués à un *dossier assemblé* (``app/eval/metrics.py``),
pas à la *sortie d'un prompt*. Chaque axe de chaque barème cite, dans son champ
``origin``, la primitive ``fichier:ligne`` dont il descend — et un test refuse un
axe dont l'``origin`` est vide.

Quand un critère n'avait pas de primitive, il n'est PAS noté et l'axe le DIT
(``reason``) — c'est la même règle que côté produit : « non mesuré » n'est jamais
« 0 », et il sort du dénominateur.

Les cinq prompts de LIVRABLE (29/08/2026)
-----------------------------------------
``bellum_plan``, ``bellum_compare``, ``bellum_battlecard``, ``bellum_cv`` et
``bellum_need_play`` produisent un LIVRABLE — un plan, une priorisation, une
battle card, un CV réécrit — et non de la donnée d'analyse. « Ce livrable est-il
bon ? » est une opinion, et le dépôt refuse de mettre un nombre sur une opinion.
Ce qui est notable chez eux, et qui l'est complètement, tient en trois familles :

* **le sourçage** — quatre de ces prompts imposent une matière fermée (le CV
  source, le profil ESN, la liste des concurrents identifiés, la liste des
  comptes fournis) et INTERDISENT d'en sortir. Deux gardes d'API rejouent déjà
  ce contrôle en production (``cv-rewrite-guard.ts``, ``need-play-guard.ts``) :
  les axes les rebranchent sur la sortie d'un prompt ;
* **la structure** — les champs, les énumérations fermées et les minima que les
  schémas ÉNONCENT ;
* **l'arithmétique** — ``bellum_compare`` porte la seule règle chiffrée du
  catalogue (« Le total doit faire 100% »).

Rien d'autre n'est noté, et chaque barème l'écrit dans son ``caveat``.

Les quatre prompts RESTÉS sur Sonnet (29/08/2026)
--------------------------------------------------
``bellum_rfp_analyse``, ``bellum_rfp_draft``, ``bellum_scorer`` et
``bellum_linkedin_posts`` n'avaient JAMAIS été mesurés. Ils sont notables pour
les mêmes trois raisons que les livrables — le sourçage (le cahier des charges,
le catalogue de sources approuvées et le contexte de publication sont trois
matières FERMÉES, injectées dans le prompt utilisateur), la structure (les trois
``z.enum`` de ``packages/contracts/src/schemas/rfp.ts``, ``ScoringOutput``,
``PostIdea``) et une règle ÉCRITE qui tranche (« un “oui si” n'est pas un
“oui” » ; « le verdict est une RÈGLE, pas l'humeur du modèle »).

Deux d'entre eux ajoutent une raison que les livrables n'avaient pas : les deux
routes RFP partent en ``response_model=dict`` (``app/routers/rfp.py:104,137``),
donc **rien ne valide la forme de leur sortie** — ni Pydantic, ni Zod. Les axes
de vocabulaire de ``rfp_analyse`` et ``rfp_draft`` sont le seul endroit du dépôt
qui la regarde.

Ce qui n'a PAS de barème, et pourquoi
--------------------------------------
``NOT_RUBRICABLE`` porte le refus **en code**, avec sa raison — parce qu'un refus
qui ne vit que dans un compte rendu se re-propose trois semaines plus tard.

Résolution du barème
--------------------
Le nom du prompt est un PRÉFIXE, parce que les batches de contacts s'appellent
``bellum_contacts_batch_2_of_5`` et les sections du plan
``bellum_plan_offers`` (``app/services/model_policy.py:165-176`` fait la même
chose, pour la même raison). Le plus long préfixe gagne.

⚠️ Un préfixe capte plus large qu'il n'y paraît : ``bellum_cv`` capte
``bellum_cv_parse``, qui est un AUTRE prompt (une extraction, pas une
réécriture). ``NOT_RUBRICABLE`` est consulté AVANT la résolution par préfixe,
exactement pour ça — et ``test_bench_rubrics_livrables.py`` refuse tout prompt
de ``PROMPT_MODELS`` capté par la grille d'un autre.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any

from . import (
    battlecard,
    compare,
    contacts,
    cv,
    facts,
    linkedin_posts,
    need_play,
    organigramme,
    plan,
    rfp_analyse,
    rfp_draft,
    scorer,
    signals,
    strategy,
)
from .axes import MAX_SCORE, MIN_MEASURED_AXES, Axis, RubricResult

ScoreFn = Callable[..., RubricResult]

#: préfixe de ``prompt_name`` → barème. Ordre sans importance : c'est le préfixe
#: le plus LONG qui gagne.
RUBRICS: dict[str, ScoreFn] = {
    facts.PROMPT: facts.score,
    signals.PROMPT: signals.score,
    strategy.PROMPT: strategy.score,
    contacts.PROMPT: contacts.score,
    organigramme.PROMPT: organigramme.score,
    plan.PROMPT: plan.score,
    compare.PROMPT: compare.score,
    battlecard.PROMPT: battlecard.score,
    cv.PROMPT: cv.score,
    need_play.PROMPT: need_play.score,
    # ── Les quatre prompts RESTÉS sur Sonnet, mesurables depuis le 29/08/2026 ──
    rfp_analyse.PROMPT: rfp_analyse.score,
    rfp_draft.PROMPT: rfp_draft.score,
    scorer.PROMPT: scorer.score,
    linkedin_posts.PROMPT: linkedin_posts.score,
}

#: ``prompt_name`` EXACT → pourquoi il n'a pas de barème déterministe, et n'en
#: aura pas. Consulté AVANT la résolution par préfixe : c'est ce qui empêche un
#: préfixe existant de capter un prompt voisin.
#:
#: Un refus écrit ici vaut mieux qu'un barème complaisant : « aucune grille
#: déterministe » est une réponse honnête que le banc sait rendre
#: (``quality.score_call``), et la colonne « conformité de schéma » reste mesurée
#: pour ces prompts comme pour les autres.
NOT_RUBRICABLE: dict[str, str] = {
    "bellum_chat": (
        "Le copilote rend du TEXTE LIBRE, sans response_model (app/routers/chat.py:196), au bout "
        "d'une boucle d'outils multi-tours. Il n'y a donc ni schéma à compter, ni matière fermée à "
        "confronter : ce qui resterait à noter — « la réponse est-elle bonne ? » — est un goût, et "
        "un goût avec un nombre dessus reste un goût. S'y ajoute un fait de transport : le chemin "
        "de production (chat_orchestrator) appelle le client du fournisseur EN DIRECT "
        "(app/services/chat_orchestrator.py:353,453) et ne passe pas par llm_gateway.complete, "
        "que l'enregistreur du banc enveloppe — un tour de copilote outillé n'est donc même pas "
        "capturable en corpus aujourd'hui. Ce qui compte vraiment sur ce prompt est déjà gardé "
        "ailleurs, et binairement : test_copilote_prompt_blocks.py (aucun nom d'éditeur), "
        "test_chat_mailbox_tools.py (le corps des messages ne sort pas) et redact_secrets."
    ),
    "bellum_cv_parse": (
        "Extraction, pas réécriture : la sortie est une liste de treize blocs `fields[]`, chacun "
        "avec sa citation, et son nom commence par « bellum_cv » — donc la grille de la RÉÉCRITURE "
        "le capterait par préfixe et le noterait sur des champs qu'il n'a jamais eu à produire. "
        "Le contrôle qui compte pour lui est par ailleurs déjà appliqué CÔTÉ SERVEUR, à chaque "
        "appel et pas seulement au banc : app/routers/cv.py:170 (_validate_fields) RETIRE tout "
        "bloc dont la citation ne se retrouve pas dans le CV source."
    ),
}


def rubric_for(prompt_name: str) -> ScoreFn | None:
    """Le barème d'un ``prompt_name``, ou ``None``. Jamais un barème par défaut :
    noter un prompt inconnu avec la grille d'un autre est pire que ne pas noter."""
    name = prompt_name or ""
    if name in NOT_RUBRICABLE:
        return None
    hits = [p for p in RUBRICS if name.startswith(p)]
    return RUBRICS[max(hits, key=len)] if hits else None


def score_output(prompt_name: str, output: Mapping[str, Any], *, user_prompt: str = "") -> RubricResult | None:
    """Note la sortie d'un prompt, ou ``None`` quand aucun barème ne la couvre."""
    fn = rubric_for(prompt_name)
    return None if fn is None else fn(output, user_prompt=user_prompt)


__all__ = [
    "MAX_SCORE",
    "MIN_MEASURED_AXES",
    "NOT_RUBRICABLE",
    "RUBRICS",
    "Axis",
    "RubricResult",
    "rubric_for",
    "score_output",
]
