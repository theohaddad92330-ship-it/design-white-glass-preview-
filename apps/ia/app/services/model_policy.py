"""Quel modèle Claude pour quel prompt — une table, une décision par prompt.

Règle : **aucun appel ne part sur un modèle implicite.** Le défaut silencieux de
``call_claude`` est Sonnet ; dix routeurs entiers (activity, battlecard, chat,
compare, cv, icebreaker, message, scorer, summary, weekly) tournaient dessus
sans que ce soit un choix — juste un kwarg jamais écrit. Mesure du 24/07/2026 :
le pipeline d'analyse ne pèse que ~13 % de la facture Claude ; le reste part
dans ces routeurs-là, non mesurés et non facturés à l'utilisateur.

Deux familles :

* ``REASONING`` (Sonnet) — il faut raisonner, arbitrer, rédiger un livrable
  vendable, ou ne surtout pas inventer. Le surcoût est assumé.
* ``EXTRACTION`` (Haiku) — remplir un schéma, résumer, appliquer un gabarit
  déjà écrit. Le repo a déjà tranché ce compromis pour ``bellum_signals``
  (« pure structured extraction — Haiku hits the schema as well as Sonnet at
  ~12× lower cost »), les contacts, l'organigramme et les messages du plan.

Tout est surchargeable sans redéploiement : ``MODEL_<PROMPT_NAME>`` en
majuscules (ex. ``MODEL_BELLUM_ICEBREAKER=claude-sonnet-5``). Les variables
historiques déjà documentées dans CLAUDE.md et posées sur Railway continuent de
faire foi pour leur prompt — on ne casse pas une prod qui s'appuie dessus.
"""

from __future__ import annotations

import logging
import os

from app.services.claude_service import CLAUDE_HAIKU_MODEL, CLAUDE_MODEL

logger = logging.getLogger(__name__)

REASONING = CLAUDE_MODEL
EXTRACTION = CLAUDE_HAIKU_MODEL


# ── la table ──────────────────────────────────────────────────────────────────
#
# Une ligne = une décision. Si un prompt manque ici, la CI le refuse
# (``tests/test_model_policy.py``) : on ne peut pas ajouter un appel Claude sans
# dire ce qu'il coûte.
PROMPT_MODELS: dict[str, str] = {
    # ── Pipeline d'analyse ────────────────────────────────────────────────────
    # Exactitude firmographique : entités, tech, réglementaire. Reste sur Sonnet.
    "bellum_facts": REASONING,
    # Extraction de listes d'événements — déjà Haiku depuis l'origine.
    "bellum_signals": EXTRACTION,
    # Le deck vendable (angles, douleurs, objections, axesEcartes). Haiku perdait
    # des champs d'un run à l'autre sur ce prompt : Sonnet fiabilise.
    "bellum_strategy": REASONING,
    # Remplissage de schéma par contact, N batches en parallèle.
    "bellum_contacts": EXTRACTION,
    "bellum_contacts_fallback": EXTRACTION,
    # Graphe de décision — A/B fait sur SG et Crédit Mutuel : parité qualité.
    "bellum_organigramme": EXTRACTION,
    # Étiquetage de vocabulaire (kind dans une énumération fermée).
    "bellum_vocabulary_builder": EXTRACTION,
    # #4437 — rattacher un intitulé d'offre (type de fait, famille : listes fermées, extrait cité).
    "bellum_offer_attach": EXTRACTION,
    # Plan de bataille : narratif et arbitrages. Les sous-sections « checklist »
    # (quick_wins, if_no_response) passent en Haiku via PLAN_LIGHT_MODEL.
    "bellum_plan": REASONING,
    # Messages prêts à envoyer — gabarit piloté par la KB (personas, 8 règles).
    "bellum_messages": EXTRACTION,
    "bellum_esn_prefill": EXTRACTION,
    # #2060.9 — reformuler une réponse déjà tapée : gabarit appliqué à un texte
    # court, pas un raisonnement. Même famille que bellum_messages.
    "bellum_onboarding_reformulate": EXTRACTION,
    # #4405.1 — la réponse à un fil, rédigée d'après un fil déjà lu : même famille que bellum_messages.
    "bellum_mail_reply": EXTRACTION,
    # Chantier « briefs comptes » (01/10/2026) — le brief commercial de tout
    # compte payant : un livrable vendable qui INTERPRÈTE chaque ligne, où il
    # ne faut surtout pas inventer (siège, prix par canal, ESN). Sonnet.
    "bellum_commercial_brief": REASONING,
    # #4078 — parité démo : les blocs 01/14/15 du dossier complet, UN appel
    # groupé après l'analyse, sur le modèle de l'étape voisine (le brief).
    "bellum_dossier_blocks": REASONING,
    "rag_knowledge_rerank": EXTRACTION,
    # ── Ancrage documentaire (Citations natives Anthropic) ────────────────────
    # Ces deux-là passent par ``call_claude_with_citations``, qui parle
    # directement à Anthropic : les Citations natives sont une capacité du
    # fournisseur, elles n'ont pas d'équivalent à router ailleurs. Conséquence à
    # connaître AVANT de chercher à les déplacer : aucun ``LLM_ROUTE_*`` ne les
    # atteint, seul ``MODEL_GROUNDING_*`` les change — et seulement vers un
    # autre modèle Anthropic.
    #
    # Elles étaient absentes de cette table et tournaient donc sur le défaut
    # implicite de la fonction, c'est-à-dire Sonnet, sans que personne l'ait
    # décidé — précisément le défaut que ce fichier existe pour interdire. La
    # garde ne les voyait pas : son scanner cherchait ``call_claude(`` et
    # ``call_claude_sync(``, deux motifs qu'un nom plus long ne satisfait pas.
    #
    # ⚠️ On les inscrit à leur modèle EFFECTIF D'AUJOURD'HUI (Sonnet), pas au
    # modèle qu'on trouverait souhaitable : inscrire un prompt au registre est
    # un geste de mesure, pas un geste d'optimisation. Le déplacer est une
    # décision distincte, qui demande une mesure — et le banc ne sait pas encore
    # les enregistrer (elles ne passent pas par le gateway qu'il instrumente).
    #
    # Le classement en REASONING est par ailleurs celui que la règle donne :
    # « ne surtout pas inventer ». Ces appels SONT le garde-fou anti-invention.
    "grounding_citations": REASONING,
    "grounding_v2": REASONING,
    # #3586 (W2) — le digest du Drive interne : UNE synthèse par changement du
    # Drive, lue ensuite par ~20 surfaces. « Ne surtout pas inventer » sur un
    # texte que tous les prompts commerciaux relisent : Sonnet.
    "internal_knowledge_digest": REASONING,
    # ── Mesures de fiabilité ──────────────────────────────────────────────────
    "self_consistency_evaluation": REASONING,
    "self_consistency_plays": REASONING,
    "self_consistency_contacts": EXTRACTION,
    # ── Fonctionnalités hors analyse (le gros de la facture) ──────────────────
    # Copilote : raisonnement multi-tours + tool-calling. Reste sur Sonnet.
    "bellum_chat": REASONING,
    # #2899 — le rejeu nocturne des échantillons de chat : le MÊME modèle que le chat qu'il rejoue.
    "chat_samples_replay": REASONING,
    # Comparaison de comptes : arbitrage commercial explicite.
    "bellum_compare": REASONING,
    # Battlecard concurrentielle : argumentaire, pas extraction.
    "bellum_battlecard": REASONING,
    # Réécriture de CV : le prompt est sous garde anti-invention côté API, mais
    # la qualité du livrable est vue par un client final. Reste sur Sonnet.
    "bellum_cv": REASONING,
    # Le PARSING d'un CV remplit un schéma : treize blocs, chacun avec la phrase
    # qui le porte. C'est de l'extraction, pas de l'arbitrage — et le garde-fou
    # qui compte (chaque champ cite le CV) est vérifié CÔTÉ SERVEUR, pas confié
    # au jugement du modèle.
    "bellum_cv_parse": EXTRACTION,
    # #1827.2 — lecture d'un justificatif de note de frais : quatre champs,
    # chacun avec sa citation. Même profil que `bellum_cv_parse` juste
    # au-dessus — extraction, pas arbitrage — et le garde-fou qui compte (une
    # citation retrouvable, une confiance suffisante) est vérifié CÔTÉ SERVEUR
    # (`services/expense_extraction.py`), pas confié au modèle.
    "expense_receipt_extract": EXTRACTION,
    # #2433.4 — localiser, dans l'image, la zone d'un champ DÉJÀ lu : du
    # repérage borné, validé côté serveur (`services/vision_regions.py`).
    "vision_region_locate": EXTRACTION,
    # #2433.12 — les bords du document et la grille d'un tableau : même profil,
    # repérage et recopie bornés, validés côté serveur (`services/vision_objects.py`).
    "vision_object_locate": EXTRACTION,
    # #2560 — lecture d'un contrat, d'une fiche de poste ou d'un e-mail pour
    # PROPOSER une mission : compte, rôle, dates, TJM, jours — chacun avec sa
    # citation. Même profil que `expense_receipt_extract` juste au-dessus —
    # extraction, pas arbitrage — et le garde-fou (citation retrouvable,
    # confiance suffisante) est vérifié CÔTÉ SERVEUR
    # (`services/mission_extraction.py`), pas confié au modèle.
    "mission_extract": EXTRACTION,
    # #2939 (#2174.3/.5) — lecture d'un brief ou d'un e-mail collé À L'ÉTAPE 1
    # de l'assistant de création de besoin : des énoncés cités, chacun vérifié
    # ensuite par `compile_need` (`compilers/need_compiler.py`), pas confié au
    # modèle. Même profil que `mission_extract` juste au-dessus — extraction,
    # pas arbitrage.
    "need_compile_text": EXTRACTION,
    # #3755 — évaluer la grille de qualification de l'ESN contre un dossier :
    # noter des paliers et décider PASS/FAIL sur preuve — un arbitrage, pas
    # une extraction.
    "bellum_qualification": REASONING,
    # Prépare l'attaque d'un besoin : arbitrer un angle, choisir qui viser et ne
    # rien promettre qu'on ne puisse prouver — pas un remplissage de gabarit.
    "bellum_need_play": REASONING,
    # #2171.27 — synthèse en 7 questions d'une opportunité : distinguer fait et
    # hypothèse, nommer ce qui bloque, dire ce qu'il ne faut PAS faire. Un
    # arbitrage sur l'état réel de l'affaire, même profil que `bellum_need_play`
    # juste au-dessus — pas un remplissage de schéma.
    "bellum_project_synthesis": REASONING,
    # Appel d'offres — analyse : lire un cahier des charges, classer des exigences
    # éliminatoires et trancher un bid/no-bid est un arbitrage, pas un remplissage
    # de schéma. Une exigence mal classée « souhaitable » coûte un lot.
    "bellum_rfp_analyse": REASONING,
    # Appel d'offres — rédaction : le texte produit devient un ENGAGEMENT
    # contractuel. C'est le pire endroit du produit pour économiser un modèle.
    "bellum_rfp_draft": REASONING,
    # Score de compte : la grille /25 pilote la priorisation commerciale.
    # Candidat Haiku, mais le score est porteur — on ne le déplace pas à l'aveugle.
    "bellum_scorer": REASONING,
    # Découverte de comptes — déjà Haiku.
    "bellum_discover": EXTRACTION,
    # Ces quatre-là appliquent un gabarit ou résument un contenu déjà écrit :
    # exactement le profil Haiku, et ils étaient sur Sonnet par pur défaut hérité.
    "bellum_activity": EXTRACTION,
    "bellum_icebreaker": EXTRACTION,
    "bellum_outreach": EXTRACTION,
    "bellum_summary": EXTRACTION,
    "bellum_weekly": EXTRACTION,
    # #1911.1 — le titre d'un fil de Laura : résumer quatre messages en une
    # ligne, le profil exact de `bellum_summary` juste au-dessus. Décision de
    # Louis (12/09/2026) : « rédigé par Laura, sans quota », donc un appel en
    # tâche de fond qui doit rester le moins cher du dépôt. La garde
    # anti-invention (rien qui ne soit dans les messages, aucun éditeur) est
    # vérifiée CÔTÉ SERVEUR (`services/chat_thread_title.py`), pas confiée à la
    # taille du modèle. `MODEL_BELLUM_CHAT_TITLE` le change sans redéploiement.
    "bellum_chat_title": EXTRACTION,
    # #2810 — extraire un nom d'entreprise d'une phrase tapée dans le lanceur
    # de /search : recopier un nom déjà présent dans le texte, exactement le
    # profil `bellum_chat_title` juste au-dessus. La garde anti-invention
    # (ancrage mot pour mot) est vérifiée CÔTÉ SERVEUR
    # (`services/search_entity_extraction.py`), pas confiée à la taille du
    # modèle. `MODEL_BELLUM_SEARCH_ENTITY_EXTRACT` le change sans redéploiement.
    "bellum_search_entity_extract": EXTRACTION,
    # #3223 (décision Louis 11/10/2026) — le juge « recommandation générique »
    # (`app/eval/generic_recommendation_judge.py`) : un JUGEMENT commercial, le
    # modèle le plus récent du dépôt. Le changer change l'empreinte du juge et
    # invalide sa calibration (le taux d'accord se re-mesure).
    "bellum_generic_recommendation_judge": REASONING,
    # Compte rendu de rendez-vous : reformuler des notes déjà écrites en
    # gabarit fixe. Profil Haiku — et la garde anti-invention est dans le
    # prompt, pas dans la taille du modèle.
    "bellum_meeting_notes": EXTRACTION,
    # #1103 — remplir un schéma depuis un texte fourni, sans rien y ajouter.
    # C'est de l'extraction : la garde anti-invention vit côté API, pas dans la
    # taille du modèle.
    "bellum_org_declare": EXTRACTION,
    # Sujets de publication : choisir un angle et l'ancrer dans une mission
    # réelle est un arbitrage éditorial, pas un remplissage de gabarit.
    "bellum_linkedin_posts": REASONING,
    # ── Onboarding ───────────────────────────────────────────────────────────
    # Profiler d'onboarding. Inscrit au REPLI CONSTATÉ, pas à un choix de
    # qualité : le prochain qui passe peut le rediscuter, et devrait.
    #
    # ⚠️ D'où vient ce Haiku, exactement — parce que la réponse évidente est
    # FAUSSE. On pourrait croire que ce prompt tournait sur le repli de
    # ``model_for`` (REASONING/Sonnet, avec son ``logger.warning``). Il n'en est
    # rien : ``agents/profiler.py`` est le SEUL appelant Claude du service qui
    # n'appelle pas ``model_for`` du tout. Il passe
    # ``model=CLAUDE_PROFILER_MODEL`` en dur (profiler.py:197, et le stampe dans
    # son AgentMeta ligne 108), et ``CLAUDE_PROFILER_MODEL`` vaut
    # ``CLAUDE_HAIKU_MODEL`` (claude_service.py:78). Le repli de ``model_for``
    # n'a donc JAMAIS été emprunté pour ce prompt, et son avertissement n'a
    # jamais été émis en production.
    #
    # Conséquence directe : l'inscrire à REASONING « parce que c'est ce que le
    # repli rend » aurait fait mentir la table, et surtout aurait armé une
    # bombe — le jour où quelqu'un nettoie profiler.py pour lui faire appeler
    # ``model_for`` comme les autres, l'onboarding serait passé de Haiku à
    # Sonnet en silence. On inscrit donc le modèle qui TOURNE.
    #
    # Pourquoi la garde ne l'avait pas vu : ``test_every_prompt_is_registered``
    # cherche ``prompt_name="…"`` — un littéral entre guillemets. profiler.py
    # écrit ``prompt_name=PROMPT_NAME``, une CONSTANTE. Le scanner ne lisait que
    # les chaînes, donc ce site d'appel lui était invisible. C'est réparé par le
    # bout du FICHIER, dans tests/test_prompt_registry_coverage.py : la nouvelle
    # garde part du disque (un module = une décision) et ne dépend plus de la
    # forme syntaxique du site d'appel.
    "bellum_profiler": EXTRACTION,
    # ── Pas de clé ici, et c'est voulu : ``bellum_advisor`` ───────────────────
    # Le module app/prompts/bellum_advisor.py porte le prompt SYSTÈME du
    # copilote, mais aucun appel ne s'appelle « bellum_advisor » : routers/
    # chat.py:288 et services/chat_orchestrator.py:121 nomment l'appel
    # « bellum_chat », qui a son entrée ci-dessus. Lui ajouter une clé littérale
    # créerait un second réglage pour un seul appel — et le perdant serait celui
    # qui pose ``MODEL_BELLUM_ADVISOR`` sur Railway et constate que rien ne
    # bouge. L'alias est déclaré, avec sa raison, dans ``_ALIAS_DE_MODELE``
    # (tests/test_prompt_registry_coverage.py) ; ``bellum_rfp`` et
    # ``bellum_self_consistency`` y sont pour le motif inverse — un fichier,
    # plusieurs décisions de modèle.
}


# Variables historiques : elles précèdent cette table et sont posées en prod.
# Elles gardent la priorité pour leur prompt.
_LEGACY_ENV: dict[str, str] = {
    "bellum_strategy": "STRATEGY_MODEL",
    "bellum_organigramme": "ORGANIGRAMME_MODEL",
    "bellum_vocabulary_builder": "VOCABULARY_MODEL",
}


def _env(name: str) -> str:
    return (os.getenv(name) or "").strip()


def model_for(prompt_name: str) -> str:
    """Le modèle à utiliser pour ``prompt_name``.

    Ordre : variable historique → ``MODEL_<PROMPT>`` → table → ``REASONING``.
    Une valeur blanche vaut « non réglée » : router vers ``""`` ferait un 400 sur
    chaque appel, ce qui est pire que le défaut qu'on essayait de corriger.

    Un prompt inconnu ne fait PAS tomber la prod : on prend le modèle le plus
    capable et on le signale. C'est la CI qui refuse le trou, pas l'utilisateur.
    """
    key = _canonical(prompt_name)

    legacy = _LEGACY_ENV.get(key)
    if legacy and (override := _env(legacy)):
        return override

    if override := _env(f"MODEL_{key.upper()}"):
        return override

    model = PROMPT_MODELS.get(key)
    if model is None:
        logger.warning(
            "Prompt %r absent de PROMPT_MODELS — repli sur %s. "
            "Ajouter une entrée explicite dans model_policy.",
            prompt_name,
            REASONING,
        )
        return REASONING
    return model


def _canonical(prompt_name: str) -> str:
    """Ramène les noms indexés à leur prompt.

    Les batches de contacts sont nommés ``bellum_contacts_batch_2_of_5`` pour que
    les logs soient lisibles ; c'est le même prompt, donc le même modèle.
    """
    name = (prompt_name or "").strip()
    if name.startswith("bellum_contacts_batch"):
        return "bellum_contacts"
    if name.startswith("bellum_plan_"):
        return "bellum_plan"
    return name
