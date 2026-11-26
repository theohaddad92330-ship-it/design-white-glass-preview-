"""LE JEU DE RÉFÉRENCE DU SCOPE DE LAURA — une question de commercial, une règle écrite.

    « construisons ensemble les 55 questions » — Louis, #1819.

─────────────────────────────────────────────────────────────────────────────
⚠️ CE QUE CES QUESTIONS SONT, ET CE QU'ELLES NE SONT PAS
─────────────────────────────────────────────────────────────────────────────
Elles sont DÉRIVÉES du scope réellement exploitable de Laura — les 52 outils
déclarés dans ``chat_tools.CHAT_TOOLS`` et les blocs du prompt système — et
elles NE SONT PAS le catalogue original des 60 questions de #1628. Ce
catalogue vit hors dépôt et n'est pas récupérable : sa note de bas de page est
cassée, et seules CINQ questions y figurent verbatim (reprises, elles, dans
``test_copilote_market_memory_eval.py`` — trois vertes, deux constats
d'absence). Personne ne doit lire ce fichier comme « le catalogue est
rattrapé » : il est REMPLACÉ par un jeu qui couvre ce que le produit sait
faire aujourd'hui, outil par outil.

─────────────────────────────────────────────────────────────────────────────
CE QU'UNE ENTRÉE VÉRIFIE — ET CE QU'ELLE NE VÉRIFIE PAS
─────────────────────────────────────────────────────────────────────────────
Aucun appel au modèle : cher, lent, non déterministe, et muet sur un
déploiement futur (la raison est écrite au long dans
``test_copilote_security_eval.py``). Chaque scénario vérifie qu'une RÈGLE
ÉCRITE existe pour la question — jamais qu'une réponse précise sortirait :

* pour une question outillée, la règle vit dans la DESCRIPTION de l'outil, qui
  part telle quelle au modèle à chaque tour — et, quand la question porte un
  filtre (« à Lyon », « en Java », « dans 30 jours »), le filtre doit exister
  dans le SCHÉMA, sinon la question n'est pas posable ;
* pour une question de conduite, la règle vit dans un BLOC du prompt.

Les invariants produit sont ce qui donne leur valeur aux scénarios, et ils
sont répartis exprès : aucune PROBABILITÉ (``run_matching``, ``get_pipeline``,
``search_market_memory``, priorisation) ; « non mesuré » n'est jamais « 0 »
(``get_pipeline``, ``get_revenue``, ``get_capacity``, ``get_account_access``,
``search_talents``, ``get_mission_risks``) ; un score n'est jamais nu
(``search_partners``, ``get_account_access``, ``run_matching``) ; une absence
n'est jamais un « non » (``get_blocking_issues``, ``get_workspace_health``,
``get_territory_overview``, mémoire marché) ; Laura n'envoie jamais
(``prepare_mail_draft``, ``prepare_message_for_contact``,
``get_overdue_payments``, ``get_chain_blockers``) ; une correction humaine
gagne (bloc RÉPONSE À UNE QUESTION MARCHÉ) ; le corps des messages ne sort pas
(``prepare_day_brief``).

Ce fichier ne REFAIT pas ce qui existe. ``test_copilote_prompt_blocks.py``
verrouille le prompt bloc par bloc et règle par règle ; les trois familles
voisines couvrent la sécurité (14), la question posée avant de chercher (7) et
les cinq niveaux de vérité (5). Ici l'entrée est une QUESTION, et la sortie est
le texte qui doit exister pour y répondre — c'est pour cela que treize scénarios
de prompt seulement figurent, ceux qui portent un invariant qu'aucune question
outillée ne porte.

─────────────────────────────────────────────────────────────────────────────
LE COMPTE, AUJOURD'HUI (mesuré par les tests de ce fichier, pas estimé)
─────────────────────────────────────────────────────────────────────────────
70 questions outillées + 13 questions de conduite = 83 scénarios VERTS, et
SEPT constats d'absence honnêtes (chacun a son test nommé ``test_no_…`` ou
``test_…_reach…``, et chacun tombe le jour où la capacité arrive — c'est ce qui
force à le reclasser au lieu de l'oublier) :

1. aucun critère protégé n'est nommé dans ce qui classe des PERSONNES ;
2. aucun outil ne rend un TAUX DE COUVERTURE ;
3. aucun outil ne lit la VEILLE, alors que le prompt sait nommer son écran ;
4. aucun outil ne lit le JOURNAL D'ACTIVITÉ d'un compte ;
5. aucun outil ne prépare une PROPOSITION COMMERCIALE chiffrée ;
6. le SOLDE DE CRÉDITS ne se lit que par la préparation d'une analyse ;
7. cinq noms d'ÉDITEUR atteignent le modèle par le registre — que la garde
   du prompt ne lit pas, et que celle du registre ne couvre qu'à moitié.

Avec les 26 scénarios des trois familles voisines (sécurité 14, question posée
avant 7, niveaux de vérité 5) et les 3 + 2 de la mémoire marché, le jeu de
référence du copilote porte donc 110 scénarios verts et 9 absences documentées.
⚠️ Le total lu ici était « 92 » : il était PÉRIMÉ de deux — #1863 avait versé
deux scénarios de conduite sans le reprendre. Il est RECOMPTÉ (81 + 26 + 3),
pas recopié : un total est un argument, et un argument faux se répète.

#1945 / #1948 (13/09/2026) — quatorze de plus : dix CAS LIMITES et deux
positifs outillés (la garde « un positif ET un cas limite par outil »), deux
règles de conduite (vouvoiement d'un destinataire externe, action échouée).
Chaque scénario porte désormais ses MÉTADONNÉES (`meta`, schéma unique de
`copilote_scenario_metadata.py`) : pour qui, à quel moment, sur quelle page.
Les gardes du corpus vivent dans `test_copilote_scenario_corpus.py`.

─────────────────────────────────────────────────────────────────────────────
COMMENT EN VERSER UNE DE PLUS
─────────────────────────────────────────────────────────────────────────────
Un tuple dans ``TOOL_SCENARIOS`` (ou ``PROMPT_SCENARIOS``). La question s'écrit
TELLE QU'UN COMMERCIAL LA POSE, en français, au tutoiement — jamais reformulée,
puisque c'est le texte contre lequel le fragment a été écrit. Les fragments se
LISENT dans le dépôt : ``test_no_fragment_survives_the_removal`` refuse un
fragment qu'on trouverait ailleurs (la garde protégerait une coïncidence), et
``test_the_eval_knows_how_to_say_no`` refuse un scénario qui resterait vert
quand on retire ce qu'il protège. Si la règle n'existe pas, la question n'est
pas un scénario vert : elle devient un constat d'absence. Un constat d'absence
est un livrable, pas un échec.
"""

from __future__ import annotations

import json
import re
from typing import NamedTuple

import pytest

from app.prompts.bellum_advisor import (
    _BLOCK_ASK_FIRST,
    _BLOCK_CLOSING_QUESTION,
    _BLOCK_DISCOVERY,
    _BLOCK_DURABLE_CONTEXT,
    _BLOCK_FORMAT,
    _BLOCK_IDENTITY,
    _BLOCK_LAURA,
    _BLOCK_MARKET_ANSWER,
    _BLOCK_MARKET_MEMORY,
    _BLOCK_PRIORITISATION,
    _BLOCK_TOOLS,
    _BLOCK_TRUTH,
    build_system_prompt,
)
from app.services import chat_tools
from tests.copilote_scenario_metadata import (
    Action,
    Categorie,
    Famille,
    JamaisInventer,
    Meta,
    Moment,
    Nature,
    Objet,
    Recette1945,
)
from tests.test_copilote_prompt_blocks import FORBIDDEN_VENDORS, REGISTRY_ACTION_SURFACE

#: Un prompt « nu » : aucun contexte utilisateur, donc tout ce qu'on y trouve
#: vient des blocs constants.
PROMPT = build_system_prompt({}, {}, "", "")

#: Le registre tel qu'il part au modèle : nom → description.
DESCRIPTIONS: dict[str, str] = {str(tool["name"]): str(tool.get("description", "")) for tool in chat_tools.CHAT_TOOLS}

#: Les blocs du prompt que ce fichier cite, par leur nom de constante — c'est ce
#: nom que porte un scénario de conduite, et c'est ce bloc qu'on RETIRE pour
#: vérifier que le scénario sait tomber.
BLOCKS: dict[str, str] = {
    "_BLOCK_IDENTITY": _BLOCK_IDENTITY,
    "_BLOCK_MARKET_MEMORY": _BLOCK_MARKET_MEMORY,
    "_BLOCK_MARKET_ANSWER": _BLOCK_MARKET_ANSWER,
    "_BLOCK_PRIORITISATION": _BLOCK_PRIORITISATION,
    "_BLOCK_TOOLS": _BLOCK_TOOLS,
    "_BLOCK_LAURA": _BLOCK_LAURA,
    # #1863 — les deux blocs du lot : la question APRÈS la réponse, et ce qu'on
    # répond à quelqu'un qui découvre le produit.
    "_BLOCK_CLOSING_QUESTION": _BLOCK_CLOSING_QUESTION,
    "_BLOCK_DISCOVERY": _BLOCK_DISCOVERY,
    # #1793 / #1820 — le contexte DURABLE : ce qu'on te donne et qui doit
    # resservir, et ce qui te manque pour aider.
    "_BLOCK_DURABLE_CONTEXT": _BLOCK_DURABLE_CONTEXT,
    # #1945.21 — la forme d'une ERREUR : ce qui a échoué, ce qui a réussi, et
    # si des crédits sont partis.
    "_BLOCK_FORMAT": _BLOCK_FORMAT,
    # #2258.10 à .17 — la hiérarchie du contexte et ses overrides temporaires.
    "_BLOCK_TRUTH": _BLOCK_TRUTH,
}


class ToolScenario(NamedTuple):
    """Une question outillée : l'outil qui doit la porter, la règle écrite dans
    sa description, et les filtres que son schéma doit exposer."""

    name: str
    #: La question TELLE QU'UN COMMERCIAL LA POSE. Elle n'est pas jouée contre
    #: le modèle — elle documente CONTRE QUOI le fragment a été écrit.
    question: str
    tool: str
    fragments: tuple[str, ...]
    #: Les propriétés du schéma sans lesquelles la question n'est pas posable.
    schema: tuple[str, ...] = ()
    # #1948.11 — les métadonnées, au schéma unique de `copilote_scenario_metadata.py`.
    # Optionnel au TYPE seulement — un champ sans défaut ne peut pas suivre
    # `schema` —, et `test_every_scenario_carries_the_schema` refuse un `None`.
    meta: Meta | None = None


class PromptScenario(NamedTuple):
    """Une question de conduite : la règle vit dans un bloc du prompt système."""

    name: str
    question: str
    block: str
    fragments: tuple[str, ...]
    # #1948.11 — les métadonnées, au schéma unique.
    meta: Meta


# ── Les 70 questions outillées ───────────────────────────────────────────────

TOOL_SCENARIOS: tuple[ToolScenario, ...] = (
    # ── Comptes ──────────────────────────────────────────────────────────────
    ToolScenario(
        "comparer-deux-comptes",
        "Entre Thales et Safran, lequel j'attaque en premier ?",
        "compare_accounts",
        ("quel compte attaquer en premier", "comptes déjà analysés appartenant à l'utilisateur"),
        ("account_ids",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.DECIDER,
            objets=(Objet.COMPTE,),
            page="/accounts",
            jamais_inventer=(JamaisInventer.RESULTAT, JamaisInventer.PROBABILITE),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            situations=(Recette1945.PRIORISER_LES_COMPTES,),
        ),
    ),
    ToolScenario(
        "ou-en-est-un-compte",
        "Où en est le compte SOCOTEC ?",
        "get_account_briefing",
        ("Lecture seule, scopé à l'utilisateur", "ne renvoie jamais un compte qui ne lui appartient pas"),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.DONNEE_D_AUTRUI,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            situations=(Recette1945.PERMISSIONS_RESPECTEES,),
        ),
    ),
    # #3277.1 (épopée #3277, BEL-SC-225 suite) — la stratégie 5P d'UN compte,
    # pour que Laura devienne le deuxième appelant nommé par le ticket (après
    # la fiche Compte).
    ToolScenario(
        "ou-en-est-la-strategie-dun-compte",
        "On est prêts pour attaquer SOCOTEC ? Qu'est-ce qu'il manque ?",
        "get_account_strategy_5p",
        (
            "cinq dimensions (5P : Périmètre, Problème, Personnes, Preuve, Passage)",
            "Aucune probabilité, aucun pourcentage : jamais un chiffre de closing.",
        ),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.PROBABILITE, JamaisInventer.RESULTAT),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # #3258.14 (épopée #3362, lot E25 30/09) — la matrice intérêt ×
    # pénétrabilité d'UN compte, pour que Laura devienne un appelant NOMMÉ par
    # l'épopée (après la fiche Compte et le panneau Pilotage).
    ToolScenario(
        "ou-classer-un-compte-dans-la-matrice",
        "Ce compte vaut le coup ? On peut y rentrer facilement ?",
        "get_account_interest_penetrability",
        (
            "deux axes (`interest`, `penetrability`)",
            "Aucune probabilité, aucun pourcentage.",
        ),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.PROBABILITE, JamaisInventer.RESULTAT),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # #2271.19 — l'historique d'UN compte, en carte `timeline` dans la conversation.
    ToolScenario(
        "historique-dun-compte",
        "Qu'est-ce qui s'est passé chez SOCOTEC ces derniers mois ?",
        "get_account_timeline",
        ("les actions journalisées, les mouvements d'opportunité et les exécutions de workflow",),
        ("account_id",),
        meta=Meta(
            moment=Moment.AVANT_RENDEZ_VOUS,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.DATE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : un compte réellement sans historique rend une liste
        # vide, jamais un signe d'erreur ni un « rien à signaler » inventé.
        "compte-sans-historique",
        "Rappelle-moi l'historique du compte qu'on vient d'ouvrir, on n'a encore rien fait dessus.",
        "get_account_timeline",
        ("un compte réellement sans historique rend une liste vide",),
        ("account_id",),
        meta=Meta(
            moment=Moment.AVANT_RENDEZ_VOUS,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #2623.1 — QUI approcher sur un compte, juste après que Laura vient de
    # l'analyser : le trou entre `start_account_analysis` (lance l'analyse) et
    # `prepare_message_for_contact` (écrit à un contact déjà NOMMÉ).
    ToolScenario(
        "qui-approcher-apres-une-analyse",
        "On vient de finir l'analyse de SOCOTEC, qui j'appelle en premier ?",
        "get_account_contacts",
        (
            "jusqu'à cinq contacts",
            "classés comme sur l'onglet Contacts du compte (le MÊME classement)",
            "Enchaîne naturellement vers `prepare_message_for_contact`",
        ),
        ("account_id",),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.COMPTE, Objet.CONTACT),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # #2294 — une personne à travers TOUS les comptes de l'espace, pas
    # seulement le compte ouvert.
    ToolScenario(
        "qui-connait-on-chez-x-dans-tout-lespace",
        "Quel DSI a déjà échangé avec nous, tous comptes confondus ?",
        "search_workspace_contacts",
        (
            "à travers TOUS les comptes de l'espace",
            "Cite le compte de chaque personne",
        ),
        ("query", "company", "role"),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.CONTACT, Objet.COMPTE),
            page="/contacts",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : personne ne correspond — Laura le dit, elle n'invente
        # ni une personne ni un compte.
        "personne-connue-nulle-part-dans-lespace",
        "On connaît quelqu'un chez Zorglub Industries ?",
        "search_workspace_contacts",
        ("n'invente jamais une personne ni un compte",),
        ("company",),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.CONTACT,),
            page="/contacts",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #2148.4 (#2848) — « réutiliser avant de rechercher » (#2148, étape 3) :
    # un compte déjà analysé, à travers TOUT le portefeuille.
    ToolScenario(
        "reutiliser-un-compte-deja-analyse",
        "Est-ce qu'on a déjà regardé Zorglub Industries ?",
        "search_workspace_accounts",
        (
            "DÉJÀ ANALYSÉ",
            "AVANT `find_accounts`",
            "évite de refaire un travail déjà fait",
        ),
        ("query", "sector"),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : aucun compte analysé ne correspond — Laura le dit,
        # elle n'invente jamais un compte.
        "aucun-compte-deja-analyse-ne-correspond",
        "On a déjà un client dans le secteur funéraire ?",
        "search_workspace_accounts",
        ("n'invente jamais un compte",),
        ("sector",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #3094 — Laura doit savoir quel membre travaille quels comptes (retour
    # bêta Apricot Labs, espace à deux sièges). L'INVERSE de
    # `search_workspace_accounts` : on part du membre, pas du compte.
    ToolScenario(
        "comptes-dun-membre-nomme",
        "Quels sont les comptes de Bedros ?",
        "get_accounts_by_owner",
        ("quels sont les comptes de",),
        ("owner_name",),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.PILOTER,
            objets=(Objet.COMPTE,),
            page="/accounts",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : le nom tapé ne désigne personne dans l'espace — Laura
        # le dit, elle ne devine ni un membre ni un compte.
        "membre-introuvable-dans-lespace",
        "Quels sont les comptes de Zorglub ?",
        "get_accounts_by_owner",
        ("ne choisis jamais un membre au hasard",),
        ("owner_name",),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.PILOTER,
            objets=(Objet.COMPTE,),
            page="/accounts",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #2308 (LAU-FINAL-049) — la carte de couverture d'un compte et ses trous
    # actionnables : périmètre × famille de rôle d'achat × étape commerciale.
    ToolScenario(
        "carte-de-couverture-dun-compte",
        "Où en est la couverture chez SOCOTEC, qui nous manque ?",
        "get_account_coverage_map",
        (
            "trois axes NOMMÉS EN ENTIER",
            "les TROUS actionnables (gaps) déjà classés par priorité",
        ),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE, Objet.CONTACT),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : un axe jamais observé (aucun signal contact) reste
        # "inconnu" — jamais "manquant", et jamais un fait sur le marché.
        "compte-sans-signal-de-couverture",
        "Ce compte est tout neuf, on n'a encore aucun contact dessus : qu'est-ce que ça donne côté couverture ?",
        "get_account_coverage_map",
        ('un axe à l\'état "inconnu" ne veut',),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : un compte étranger au portefeuille reste introuvable,
        # même contrat que get_account_briefing / get_account_contacts.
        "compte-etranger-sans-carte-de-couverture",
        "Donne-moi la couverture du compte X1234 (un identifiant qu'il n'a pas ouvert).",
        "get_account_coverage_map",
        ("un identifiant de compte qui ne lui appartient pas ne renvoie jamais de carte de couverture",),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.DONNEE_D_AUTRUI,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : un compte réellement sans contact identifié rend une
        # liste vide, jamais un signe d'erreur ni un contact inventé pour
        # « avoir quelque chose à répondre ».
        "compte-sans-contact-identifie",
        "Qui contacter chez ce compte qu'on vient d'analyser, il n'y a personne d'identifié dessus ?",
        "get_account_contacts",
        ("Une liste vide veut dire qu'aucun contact éligible n'a encore été trouvé, jamais une erreur",),
        ("account_id",),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.COMPTE, Objet.CONTACT),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #2301 (LAU-FINAL-042) — la prélecture, AVANT de proposer une analyse
    # complète qui coûte du temps et des crédits : montrer d'abord ce qu'on
    # sait déjà (identité, relation, contacts, signaux, observations) et ce
    # qu'on ne sait pas, nommé explicitement.
    ToolScenario(
        "prelecture-avant-relancer-lanalyse",
        "Avant de relancer l'analyse complète de Decathlon, qu'est-ce qu'on sait déjà dessus ?",
        "get_account_preflight",
        (
            "À utiliser AVANT de proposer une analyse complète",
            "chacune vise un outil /chat réellement exécutable, jamais une action fantôme",
        ),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : un compte étranger au portefeuille reste introuvable,
        # même règle que get_account_briefing/get_account_timeline.
        "prelecture-dun-compte-etranger",
        "Prélis-moi ce compte, je ne suis pas sûr qu'il soit dans mon portefeuille.",
        "get_account_preflight",
        ("un compte étranger reste introuvable",),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #3179 (LAU-FINAL-185, retour bêta 28/09/2026) — le verdict d'aptitude
    # commerciale : un compte techniquement cohérent peut être commercialement
    # mauvais MAINTENANT, et Laura doit pouvoir le dire plutôt que de
    # transformer systématiquement toute entreprise demandée en cible.
    ToolScenario(
        "verdict-daptitude-avant-de-prospecter",
        "Je veux cibler la Société Générale, dis-moi si ça vaut le coup maintenant.",
        "get_account_suitability_verdict",
        (
            "jamais une note de potentiel générique",
            "Jamais de pourcentage de chance de signature",
        ),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : la règle du retour tenue explicitement dans la
        # description — jamais un NO_GO sur la seule taille du groupe.
        "verdict-naccuse-jamais-la-seule-taille",
        "Ce compte est un grand groupe, ça ne doit pas coller à mon profil ?",
        "get_account_suitability_verdict",
        ("Ne fonde JAMAIS un `NO_GO_NOW` sur la seule taille du groupe",),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        # Le coût AVANT le débit : la préparation ne dépense rien, et un dossier
        # existant se dit AVEC sa date — sinon on repaie ce qu'on a déjà.
        "analyser-une-entreprise",
        "Analyse-moi Decathlon.",
        "plan_account_analysis",
        ("Ne lance rien et ne débite rien", "avant de lancer", "Si un dossier existe déjà, dis-le avec sa date"),
        ("company",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE, Objet.CREDIT),
            page="/accounts",
            jamais_inventer=(JamaisInventer.COUT, JamaisInventer.DATE),
            action=Action.QUESTION,
            nature=Nature.POSITIF,
            # 1945.26 — le coût ET le solde, dits AVANT tout lancement.
            situations=(Recette1945.CREDITS_INSUFFISANTS,),
        ),
    ),
    ToolScenario(
        "lancer-lanalyse-au-go",
        "Go, lance l'analyse.",
        "start_account_analysis",
        # ⚠️ PAS « une question sans réponse n'a pas de clé » : le bloc OUTILS du
        # prompt l'écrit AUSSI, donc `test_no_fragment_survives_the_removal` la
        # refuse — elle rendrait ce scénario vert par coïncidence.
        #
        # #2723 (22/09/2026) — D1 renversée : un « go » explicite N'EST PLUS une
        # condition (il reste un signal suffisant s'il arrive). Le fragment
        # « APRÈS que l'utilisateur a confirmé » a disparu de la description
        # AVEC la carte — remplacé par la phrase qui dit la nouvelle règle.
        (
            "Ne requiert PLUS de « go » explicite",
            "laisse-le VIDE si l'utilisateur n'a rien répondu",
            # #4464 — crédits implicites : la description ne parle plus de coût du tout.
            "Occupe le moteur plusieurs minutes",
        ),
        ("plan_token", "answers"),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE, Objet.CREDIT),
            page="/accounts",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.LANCEMENT_APRES_ACCORD,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # #1948.52 — le CAS LIMITE de l'outil qui dépense : un lot. ~~Une phrase ne
        # débite pas trois analyses ; l'écran Découvrir annonce le total avant.~~
        # RENVERSÉ par #4462.1 (décision Louis 22/10, retour Exteam) : une liste de noms part
        # d'office, par `analyze_named_companies` — le cas limite devient le plafond et l'homonyme.
        "analyser-plusieurs-entreprises-dun-coup",
        "Lance l'analyse sur ces 23 comptes : Thales, Safran, Airbus, Théa…",
        "analyze_named_companies",
        (
            "Au plus 20 noms par message : au-delà, les suivants sont rendus NOMMÉS",
            "Un homonyme, un nom introuvable au registre ou un registre muet est NOMMÉ, jamais lancé au hasard",
        ),
        ("companies",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE, Objet.CREDIT),
            page="/accounts",
            jamais_inventer=(JamaisInventer.COUT, JamaisInventer.RESULTAT),
            action=Action.LANCEMENT_APRES_ACCORD,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        # #4462.1 — le CAS LIMITE de `start_account_analysis` : trois noms dans la même phrase. Il ne
        # s'enchaîne pas nom par nom, il cède la liste au lot (verrou « UNE entreprise à la fois » levé).
        "trois-noms-cedes-au-lot",
        "Lance l'analyse sur Thales, Safran et Airbus.",
        "start_account_analysis",
        ("n'enchaîne pas cet outil nom par nom : appelle `analyze_named_companies` avec toute la liste",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE, Objet.CREDIT),
            page="/accounts",
            jamais_inventer=(JamaisInventer.COUT,),
            action=Action.LANCEMENT_APRES_ACCORD,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        # #4462 (retour Exteam 22/10) — LE CAS QUI A ÉCHOUÉ : quinze noms hors de l'espace finissaient en
        # « aucun compte » puis « Je poursuis sur le reste. » sans rien lancer. Verrouillé ici (porte c77).
        "liste-de-noms-hors-espace",
        "Voici 15 comptes : Infovista, Guerbet, Théa, Vetoquinol, Latécoère, LISI, Daher, Voyageurs du Monde, "
        "Virbac, Ipsen, Servier, Pierre Fabre, bioMérieux, Pierre & Vacances-Center Parcs, LFB. Donne-moi les "
        "périmètres IT/DSI pertinents et les meilleurs interlocuteurs manager ou donneur d'ordre.",
        "analyze_named_companies",
        (
            "UN seul appel avec toute la liste",
            "LANCE son analyse d'office, dans ce même tour",
            "Ce n'est PAS « aucun compte »",
            "sans jamais chiffrer de coût",
        ),
        ("companies", "function"),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE, Objet.CONTACT, Objet.CREDIT),
            page="/accounts",
            jamais_inventer=(JamaisInventer.RESULTAT, JamaisInventer.COUT),
            action=Action.LANCEMENT_APRES_ACCORD,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        "comptes-sans-prochaine-action",
        "Quels comptes n'ont pas de prochaine action ?",
        "list_accounts_to_act",
        ("Les comptes ÉCARTÉS n'y figurent pas",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECIDER,
            objets=(Objet.COMPTE,),
            page="/accounts",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            situations=(Recette1945.PRIORISER_LES_COMPTES,),
        ),
    ),
    ToolScenario(
        # « Non mesuré n'est pas 0 » et « un score n'est jamais nu », dans la
        # même description : un coût absent n'est pas une entrée gratuite, et
        # la barrière d'achat arrive avec ses axes.
        "par-ou-entrer-chez-un-compte",
        "Comment j'entre chez Airbus ?",
        "get_account_access",
        (
            "un coût absent veut dire que personne ne l'a déclaré",
            "avec ce qui n'a pas pu être mesuré",
        ),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            secondaires=(Categorie.DECIDER,),
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.COUT, JamaisInventer.CHIFFRE),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        "qui-gravite-autour-dun-compte",
        "Qui bosse déjà chez Thales ?",
        "get_esn_on_account",
        (
            "n'a PAS automatiquement une présence actuelle",
            "ne transforme jamais une observation ou une inférence en fait établi",
            "ouvre un CHEMIN POTENTIEL rang 2 À QUALIFIER",
        ),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE, Objet.PARTENAIRE, Objet.OBSERVATION_MARCHE),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            situations=(Recette1945.OBSERVATION_HISTORIQUE,),
        ),
    ),
    # #2910 (#2322.10, 26/09/2026) — lire le CRM externe branché, en chat.
    ToolScenario(
        "le-crm-branche-connait-il-deja-ce-compte",
        "Est-ce qu'on est déjà chez Thales dans le CRM ?",
        "get_crm_presence",
        (
            "Lecture seule — ça ne modifie rien dans le CRM",
            "ne nomme JAMAIS l'outil branché",
        ),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : aucun CRM branché — Laura le dit, elle n'invente
        # jamais une absence de présence à sa place.
        "aucun-crm-branche-sur-cet-espace",
        "Regarde dans le CRM si on a déjà un contact chez Thales.",
        "get_crm_presence",
        ("dis qu'aucun CRM n'est branché plutôt que de deviner une absence de présence",),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # ── Contacts ─────────────────────────────────────────────────────────────
    ToolScenario(
        "ecrire-a-un-contact",
        "Écris-moi un mail pour Marc Dubois.",
        "prepare_message_for_contact",
        ("n'écrit ni n'envoie RIEN", "Annonce donc la proposition, jamais un envoi fait"),
        ("contact_id", "channel", "angle"),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.GENERER_UN_MESSAGE,
            objets=(Objet.CONTACT, Objet.MESSAGE),
            page="/contacts/$id",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
            situations=(Recette1945.ACTION_A_VALIDER,),
        ),
    ),
    # #3441/#3442/#3444/#3445 (lot C20, 30/09/2026, retours bêta) — Louis a
    # importé ses propres emails, scripts d'appel, réponses aux objections et
    # pitchs « pour qu'ils ne soient pas recréés librement ». `search_content_library`
    # les rend VERBATIM, jamais un canevas reformulé par le modèle.
    ToolScenario(
        "chercher-un-gabarit-dans-la-bibliotheque",
        "Écris-moi l'email d'approche initiale pour un profil Data disponible.",
        "search_content_library",
        ("Rend le texte VERBATIM de chaque entrée trouvée", "vérifie-les avant de citer le texte"),
        ("kind", "query"),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.GENERER_UN_MESSAGE,
            objets=(Objet.MESSAGE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : une entrée existe (ex. la branche « référencement
        # prouvé »), mais sa CONDITION d'usage n'est pas remplie pour ce
        # contact — la réponse approuvée ne s'applique pas telle quelle.
        "une-condition-dusage-nest-pas-remplie",
        "On me demande si on est référencés chez ce client, mais je n'ai aucune preuve. Je réponds quoi ?",
        "search_content_library",
        ("une condition non remplie exclut l'entrée, jamais un texte adapté à sa place",),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.GENERER_UN_MESSAGE,
            objets=(Objet.MESSAGE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #3289 (#3264.31/.32/.33, lot P09 30/09) — le timing appris par l'espace.
    ToolScenario(
        "quand-relancer-par-email",
        "À quel moment de la semaine j'ai le plus de réponses quand je relance par e-mail ?",
        "get_send_timing",
        ("JAMAIS un pourcentage", "n'invente aucun horaire générique"),
        ("seniority",),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.GENERER_UN_MESSAGE,
            objets=(Objet.MESSAGE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : l'espace n'a presque aucun geste daté avec issue — Laura
        # dit qu'il n'y a pas assez de mesure, elle ne sort pas « le mardi matin ».
        "creneau-sans-assez-dhistorique",
        "Quelle est la meilleure heure pour appeler un directeur ? On vient de démarrer.",
        "get_send_timing",
        ("Un canal sans `best` n'a pas assez de gestes mesurés",),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.GENERER_UN_MESSAGE,
            objets=(Objet.MESSAGE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #1995 — décision Louis 14/09/2026 20:35. Mesuré en production le même
    # jour : Sandrine Pata est citée par le CRM connecté sur THALES, le compte
    # porte 2 027 fiches Bellum et aucune « Pata ». Laura renvoyait vers une
    # fiche inexistante ; le rappel était impossible faute d'identifiant.
    ToolScenario(
        "creer-la-fiche-dun-contact-du-crm",
        "Sandrine Pata est dans mon CRM chez THALES mais je ne la trouve pas dans Bellum.",
        "create_contact_from_crm_presence",
        ("fiche Bellum absente", "jamais une fiche déjà créée"),
        ("full_name", "account_id"),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.CONTACT,),
            page="/contacts/$id",
            jamais_inventer=(JamaisInventer.EXECUTION, JamaisInventer.IDENTITE),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # #1948.52 — le CAS LIMITE : le CRM ne donne QU'UN NOM. Compléter la
        # fiche d'un e-mail plausible serait la donnée de remplissage que la
        # doctrine refuse — et un commercial écrirait à une adresse inventée.
        "creer-une-fiche-quand-le-crm-ne-donne-quun-nom",
        "Crée la fiche de Sandrine Pata, je n'ai que son nom dans mon CRM.",
        "create_contact_from_crm_presence",
        ("n'invente ni e-mail ni poste",),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.CONTACT,),
            page="/contacts/$id",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #2313 (LAU-FINAL-054) — RELATION-FIRST ACCOUNT ENTRY : bootstraper une
    # stratégie sur UN contact connu, avant même qu'un compte soit analysé.
    ToolScenario(
        "je-connais-quelquun-chez-un-compte",
        "Je connais un ancien collègue chez Thales, je peux partir de lui plutôt que d'analyser le compte ?",
        "declare_known_contact",
        (
            "JAMAIS supposée du seul fait qu'elle connaît l'entreprise",
            "il faut une capacité classée ET une confirmation explicite de la personne elle-même",
        ),
        ("entry_kind", "claimed_capability", "referrer_confirmed"),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.CONTACT, Objet.COMPTE),
            page="/chat",
            jamais_inventer=(JamaisInventer.AUTORISATION,),
            action=Action.QUESTION,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : la relation appartient à un COLLÈGUE. Laura ne
        # contacte jamais la personne sans sa permission — elle propose de
        # solliciter le collègue plutôt que de supposer un accord.
        "relation-portee-par-un-collegue",
        "Notre chargé de compte connaît le DRH d'Orange, je le sollicite direct ?",
        "declare_known_contact",
        ("ne contacte jamais la personne sans sa permission", "propose de le solliciter"),
        ("owner_user_id", "owner_permission_granted"),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.CONTACT, Objet.COMPTE),
            page="/chat",
            jamais_inventer=(JamaisInventer.AUTORISATION,),
            action=Action.REFUS_AVEC_ALTERNATIVE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        "poser-un-rappel",
        "Rappelle-moi de relancer Marc lundi.",
        "schedule_reminder_for_contact",
        ("jamais un rappel déjà créé",),
        ("contact_id", "at"),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            # La relance EST un message à écrire lundi ; le rappel en est le
            # premier pas. 1948.37 (« Créer une séquence ») n'est qu'une intention
            # SECONDAIRE : UN rappel daté n'enchaîne aucune touche, et le compter
            # comme une séquence couvrirait la catégorie par une étiquette
            # (voir `CATEGORIES_SANS_SCENARIO`).
            intention=Categorie.GENERER_UN_MESSAGE,
            secondaires=(Categorie.CREER_UNE_SEQUENCE,),
            objets=(Objet.CONTACT,),
            page="/contacts/$id",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        "trouver-un-telephone",
        "Trouve-moi le téléphone de Marc.",
        "enrich_contact",
        # #4464 — crédits implicites : la proposition ne porte plus de coût vers Laura.
        ("n'exécute rien et ne débite rien", "Aucun chiffre d'usage pour une fiche seule"),
        ("contact_id",),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.CONTACT, Objet.CREDIT),
            page="/contacts/$id",
            jamais_inventer=(JamaisInventer.COUT, JamaisInventer.EXECUTION),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # La seule exception nommée de la doctrine « jamais de nom d'éditeur » :
        # l'écran où la personne autorise elle-même l'accès.
        "pousser-un-contact-dans-le-crm",
        "Pousse Marc dans mon CRM.",
        "export_contact_to_crm",
        ("cet outil n'écrit rien dans le CRM", "invite à connecter un CRM dans Réglages › Intégrations"),
        ("contact_id",),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.CORRIGER_UNE_DONNEE,
            objets=(Objet.CONTACT,),
            page="/contacts/$id",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
            situations=(Recette1945.AUCUN_CONNECTEUR,),
        ),
    ),
    ToolScenario(
        # #1948.52 / 1945.4 — le CAS LIMITE : aucun CRM branché. L'outil le dit,
        # et l'export ne se propose pas du tout.
        "crm-non-connecte",
        "Mets à jour la fiche de Marc dans mon CRM.",
        "export_contact_to_crm",
        ("ne propose alors PAS d'export",),
        ("contact_id",),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.CORRIGER_UNE_DONNEE,
            objets=(Objet.CONTACT,),
            page="/integrations",
            jamais_inventer=(JamaisInventer.CAPACITE,),
            action=Action.ECRAN_PREREMPLI,
            nature=Nature.CAS_LIMITE,
            situations=(Recette1945.AUCUN_CONNECTEUR,),
        ),
    ),
    ToolScenario(
        # Épopée #2955 (#2394.6/.19/.43) — le writeback CRM depuis un fil de
        # messagerie : une NOTE, jamais un export de fiche (`pousser-un-contact-
        # dans-le-crm` ci-dessus reste le scénario de l'export).
        "noter-une-relance-depuis-un-fil",
        "Note dans le CRM qu'il faut relancer Marc, il n'a pas répondu depuis 8 jours.",
        "propose_crm_note",
        ("il la prépare, la validation de l'utilisateur l'écrit",),
        ("contact_id", "note"),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.CORRIGER_UNE_DONNEE,
            objets=(Objet.CONTACT,),
            page="/contacts/$id",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Épopée #2955 — le CAS LIMITE de `propose_crm_note` : aucun CRM branché.
        # L'outil le dit, la note ne se propose pas.
        "noter-une-relance-sans-crm",
        "Ajoute une note sur Marc dans mon CRM : relance à faire.",
        "propose_crm_note",
        ("jamais un export ni une création de fiche", "n'invente pas de proposition"),
        ("contact_id", "note"),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.CORRIGER_UNE_DONNEE,
            objets=(Objet.CONTACT,),
            page="/integrations",
            jamais_inventer=(JamaisInventer.CAPACITE,),
            action=Action.ECRAN_PREREMPLI,
            nature=Nature.CAS_LIMITE,
            situations=(Recette1945.AUCUN_CONNECTEUR,),
        ),
    ),
    ToolScenario(
        # #3871.1 (lot V11, 07/10, recette prod 2e passe) — « X a quitté
        # l'entreprise » ne doit plus produire un refus : Laura PROPOSE le
        # passage en historique (archive, ne supprime jamais).
        "contact-parti-de-lentreprise",
        "Pierre Eynatte a quitté l'entreprise, mets à jour sa fiche.",
        "propose_contact_departure",
        ("aucun outil n'écrit rien avant la validation", "JAMAIS supprimé"),
        ("contact_id",),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.CORRIGER_UNE_DONNEE,
            objets=(Objet.CONTACT,),
            page="/contacts/$id",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        "qui-jai-laisse-filer",
        "Qui j'ai laissé filer cette année ?",
        "search_dormant_network",
        ("qui ont demandé à ne plus être contactées",),
        ("months", "limit"),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.CONTACT,),
            page="/contacts",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            situations=(Recette1945.TROUVER_UN_CONTACT,),
        ),
    ),
    ToolScenario(
        "qui-a-change-de-boite",
        "Qui a changé de boîte récemment ?",
        "get_job_changes",
        ("c'est une PRÉSOMPTION, pas un fait établi", "Ne dis JAMAIS qu'un contact A changé de poste"),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.CONTACT, Objet.COMPTE),
            page="/contacts",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL, JamaisInventer.PERIMETRE),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            situations=(Recette1945.TROUVER_UN_CONTACT,),
        ),
    ),
    # ── Prospection ──────────────────────────────────────────────────────────
    ToolScenario(
        "trouver-de-nouveaux-comptes",
        "Trouve-moi des ETI industrielles en Rhône-Alpes qui recrutent.",
        "find_accounts",
        ("N'invente jamais de résultats", "tu n'as vu aucune entreprise"),
        ("sectors", "department", "headcount", "signals"),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECOUVRIR,
            objets=(Objet.COMPTE, Objet.TERRITOIRE),
            page="/discover",
            jamais_inventer=(JamaisInventer.RESULTAT, JamaisInventer.COUT),
            action=Action.ECRAN_PREREMPLI,
            nature=Nature.POSITIF,
            situations=(Recette1945.AUCUN_RESULTAT,),
        ),
    ),
    ToolScenario(
        # #2470 — LE GESTE QUI MANQUAIT : « un GO devrait entraîner une recherche
        # directement et que ça alimente la conversation plutôt qu'à forcer à
        # aller sur la page découvrir ». La question du dessus PRÉPARE ; celle-ci
        # CHERCHE, et la liste arrive dans la bulle.
        "faire-un-tour-dhorizon-dans-la-conversation",
        "Go, lance la recherche et montre-moi les entreprises ici.",
        "run_account_search",
        ("rend les comptes trouvés", "Inclus. "),
        ("sectors", "department", "headcount", "limit"),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECOUVRIR,
            objets=(Objet.COMPTE, Objet.TERRITOIRE),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT, JamaisInventer.COUT),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            situations=(Recette1945.AUCUN_RESULTAT,),
        ),
    ),
    ToolScenario(
        # #2470 — LE CAS LIMITE : le registre ne répond pas. Une liste vide et un
        # registre muet ne se disent pas de la même façon, et aucun des deux ne
        # se comble.
        "tour-dhorizon-quand-le-registre-ne-repond-pas",
        "Et si la recherche ne ramène rien, tu me proposes quoi ?",
        "run_account_search",
        ("si la liste est vide, dis-le", "si le registre n'a pas répondu, dis ça aussi"),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECOUVRIR,
            objets=(Objet.COMPTE, Objet.TERRITOIRE),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        # #3181.1 (LAU-FINAL-187) — après un verdict qui n'est PAS un GO, Laura
        # ne laisse jamais l'utilisateur seul avec une objection : elle nomme
        # des comptes alternatifs, réellement plus accessibles.
        "proposer-des-alternatives-apres-un-verdict-non-go",
        "Ce compte est en réserve, tu me proposes quoi d'autre ?",
        "suggest_account_alternatives",
        ("3 à 5 comptes ALTERNATIFS",),
        ("account_id", "sectors"),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.DECOUVRIR,
            objets=(Objet.COMPTE, Objet.TERRITOIRE),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.REFUS_AVEC_ALTERNATIVE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # #3181.5 — LE CAS LIMITE : une alternative sans fait RÉEL qui la rend
        # plus accessible n'est jamais qu'une liste du même secteur — écartée,
        # jamais rendue pour remplir un quota de 3 à 5.
        "pas-dalternative-sans-fait-daccessibilite-reel",
        "Cette autre boîte a l'air comparable, propose-la aussi.",
        "suggest_account_alternatives",
        ("jamais une simple liste du même secteur",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.DECOUVRIR,
            objets=(Objet.COMPTE, Objet.TERRITOIRE),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # ── Messagerie et agenda ─────────────────────────────────────────────────
    ToolScenario(
        "qui-ne-ma-pas-repondu",
        "Qui ne m'a pas répondu depuis dix jours ?",
        "search_mailbox",
        ("l'ancienneté du silence", "si la messagerie n'est pas connectée, l'outil le dit"),
        ("intent", "silence_days", "counterpart"),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.TROUVER_UN_CONTACT,
            secondaires=(Categorie.GENERER_UN_MESSAGE,),
            objets=(Objet.MESSAGE, Objet.CONTACT),
            page="/mailbox",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            situations=(Recette1945.AUCUN_CONNECTEUR,),
        ),
    ),
    ToolScenario(
        # #1948.52 / 1945.4 — le CAS LIMITE : pas de fil à rendre, ou pas de
        # messagerie du tout. Dans les deux cas, aucun fil ne s'invente.
        "messagerie-non-connectee",
        "Quels clients n'ont pas répondu à ma relance de lundi ?",
        "search_mailbox",
        ("N'invente jamais un fil",),
        ("intent", "counterpart"),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.MESSAGE, Objet.CONTACT),
            page="/mailbox",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
            situations=(Recette1945.AUCUN_CONNECTEUR,),
        ),
    ),
    ToolScenario(
        # #4016 L3 — Laura lit le CORPS d'un fil de SA boîte, pour lui seul.
        "resume-un-fil",
        "Résume le fil avec Jean chez Acme et dis-moi quelles objections il a soulevées.",
        "read_mail_thread",
        ("sa boîte, jamais celle d'un collègue", "Ce contenu est PRIVÉ"),
        ("thread_id", "counterpart"),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.GENERER_UN_MESSAGE,
            secondaires=(Categorie.TROUVER_UN_CONTACT,),
            objets=(Objet.MESSAGE, Objet.CONTACT),
            page="/mailbox",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            situations=(Recette1945.AUCUN_CONNECTEUR,),
        ),
    ),
    ToolScenario(
        # #4406.5 — Laura lit UNE conversation Beeper de l'utilisateur pour PRÉPARER sa réponse (c96).
        "prepare-reponse-beeper",
        "Prépare ma réponse à Nadia Perrin sur Beeper : elle me demande les profils pour vendredi.",
        "read_beeper_conversation",
        ("réunies par SON Beeper Desktop", "Cet outil n'envoie jamais rien"),
        ("chat_id",),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.GENERER_UN_MESSAGE,
            objets=(Objet.MESSAGE, Objet.CONTACT),
            page="/mailbox",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            situations=(Recette1945.AUCUN_CONNECTEUR,),
        ),
    ),
    ToolScenario(
        # #4406.5 — le CAS LIMITE : Beeper Desktop fermé ou tunnel coupé. Aucune conversation ne s'invente.
        "beeper-injoignable",
        "Qu'est-ce que Nadia m'a écrit sur Beeper ce matin ?",
        "read_beeper_conversation",
        ("n'invente jamais une conversation",),
        ("chat_id",),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.MESSAGE, Objet.CONTACT),
            page="/mailbox",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
            situations=(Recette1945.AUCUN_CONNECTEUR,),
        ),
    ),
    ToolScenario(
        # #4016 L3 — le CAS LIMITE : messagerie muette ou fil introuvable. Aucun message ne s'invente.
        "fil-illisible",
        "Qu'est-ce que Jean m'a répondu dans le fil de la proposition ?",
        "read_mail_thread",
        ("N'invente jamais un message",),
        ("thread_id",),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.MESSAGE, Objet.CONTACT),
            page="/mailbox",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
            situations=(Recette1945.AUCUN_CONNECTEUR,),
        ),
    ),
    ToolScenario(
        "mon-agenda-de-demain",
        "Qu'est-ce que j'ai demain ?",
        "list_agenda",
        ("s'il est CLIENT (au moins un participant externe)",),
        ("from_iso", "to_iso"),
        meta=Meta(
            moment=Moment.AVANT_RENDEZ_VOUS,
            intention=Categorie.PREPARER_UN_RENDEZ_VOUS,
            objets=(Objet.RENDEZ_VOUS,),
            page="/briefing",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # #4065 (lot LISTINGS, 12/10) — le listing générique : la question de #4064 et son cas limite.
    ToolScenario(
        "liste-des-personnes-rencontrees-3-mois",
        "Sur les 3 derniers mois, donne-moi la liste de toutes les personnes avec qui j'ai eu une réunion.",
        "list_records",
        ("les personnes que j'ai rencontrées ces 3 derniers mois",),
        ("source", "from_iso", "to_iso", "group_by"),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.RENDEZ_VOUS, Objet.CONTACT),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        "liste-rencontrees-absentes-du-crm-sans-crm",
        "Liste les personnes rencontrées en réunion et absentes du CRM.",
        "list_records",
        ("ne dis JAMAIS « 0 »",),
        ("source", "cross"),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.RENDEZ_VOUS, Objet.CONTACT),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
            situations=(Recette1945.AUCUN_CONNECTEUR,),
        ),
    ),
    ToolScenario(
        "trouver-des-creneaux",
        "Propose-moi trois créneaux jeudi.",
        "find_free_slots",
        ("Ne propose JAMAIS un créneau que l'outil n'a pas rendu",),
        ("duration_minutes", "from_iso", "to_iso"),
        meta=Meta(
            moment=Moment.AVANT_RENDEZ_VOUS,
            intention=Categorie.PREPARER_UN_RENDEZ_VOUS,
            objets=(Objet.RENDEZ_VOUS,),
            page="/briefing",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Une source muette n'est pas une journée vide : c'est l'invariant
        # « absence ≠ zéro » sur l'écran le plus lu du produit.
        "par-quoi-je-commence",
        "Par quoi je commence aujourd'hui ?",
        "get_daily_briefing",
        ("au lieu de conclure qu'il n'y a rien à faire",),
        meta=Meta(
            moment=Moment.JOURNEE,
            intention=Categorie.DECIDER,
            objets=(Objet.RENDEZ_VOUS, Objet.MESSAGE, Objet.COMPTE),
            page="/briefing",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            situations=(Recette1945.AUCUN_CONNECTEUR,),
        ),
    ),
    ToolScenario(
        "repondre-a-un-mail",
        "Réponds à Marc que c'est bon pour jeudi.",
        "prepare_mail_draft",
        ("Rien n'est jamais envoyé", "on prépare, le commercial envoie", "jamais de signature inventée"),
        ("to", "subject", "body", "thread_id"),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.GENERER_UN_MESSAGE,
            objets=(Objet.MESSAGE,),
            page="/mailbox",
            jamais_inventer=(JamaisInventer.EXECUTION, JamaisInventer.CHAMP_NON_DIT),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
            situations=(Recette1945.ACTION_A_VALIDER,),
        ),
    ),
    ToolScenario(
        # LE CORPS DES MESSAGES NE SORT PAS. La preuve d'exécution vit dans
        # `test_chat_mailbox_tools.py` (« Le corps des messages ne quitte jamais
        # la messagerie ») ; ici on tient la RÈGLE ÉCRITE, celle que le modèle
        # lit, sur le seul outil qui rendrait une réunion entière.
        "preparer-un-rendez-vous",
        "Prépare mon rendez-vous de demain.",
        "prepare_day_brief",
        ("Le corps des messages n'en fait jamais partie", "Rend la JOURNÉE entière"),
        ("day",),
        meta=Meta(
            moment=Moment.AVANT_RENDEZ_VOUS,
            intention=Categorie.PREPARER_UN_RENDEZ_VOUS,
            objets=(Objet.RENDEZ_VOUS, Objet.CONTACT),
            page="/briefing",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            situations=(Recette1945.PREPARER_UN_RENDEZ_VOUS,),
        ),
    ),
    # ── Vivier ───────────────────────────────────────────────────────────────
    ToolScenario(
        "qui-est-disponible",
        "Qui est dispo en Java le mois prochain ?",
        "search_talents",
        ("Le coût chargé n'en sort jamais", "Une disponibilité inconnue est rendue telle quelle"),
        ("query", "available_within_days"),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            objets=(Objet.CONSULTANT,),
            page="/consultants",
            jamais_inventer=(JamaisInventer.MARGE, JamaisInventer.DATE),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            situations=(Recette1945.CONSULTANT_DISPONIBLE,),
        ),
    ),
    ToolScenario(
        "qui-repositionner",
        "Qui je peux repositionner ?",
        "list_reactivation_pool",
        ("Chaque profil porte la RAISON de sa présence",),
        ("segment",),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            objets=(Objet.CONSULTANT,),
            page="/consultants",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        "pourquoi-ces-deux-fiches-se-ressemblent",
        "Pourquoi ces deux fiches de Julie Martin sont-elles rapprochées ?",
        "explain_talent_duplicate",
        ("jamais un chiffre de confiance", "Rend la phrase déjà calculée"),
        ("talent_id", "other_talent_id"),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.ANALYSER,
            objets=(Objet.CONSULTANT,),
            page="/consultants/$id",
            jamais_inventer=(JamaisInventer.PROBABILITE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        "fusionne-ces-deux-fiches",
        "Fusionne ces deux fiches, c'est visiblement la même personne.",
        "explain_talent_duplicate",
        ("on PROPOSE un rapprochement, on ne fusionne JAMAIS", "la décision reste un clic humain sur l'écran"),
        (),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.ANALYSER,
            objets=(Objet.CONSULTANT,),
            page="/consultants/$id",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.REFUS_AVEC_ALTERNATIVE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        "prerequis-avant-de-positionner",
        "Est-ce que je peux proposer Marc chez EDF ?",
        "check_consultant_positioning",
        ("À utiliser AVANT de recommander un positionnement", "Un seul cas REFUSE le positionnement"),
        ("need_id", "run_id", "consultant_id"),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            objets=(Objet.CONSULTANT,),
            page="/consultants",
            jamais_inventer=(JamaisInventer.PROBABILITE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # #3182.3 (épopée #3248) — le cas limite de l'agrégateur, ajouté à
    # l'intégration Z (29/09) : la garde « un positif ET un cas limite par
    # outil » était rouge sur la branche e17 seule.
    ToolScenario(
        "positionner-malgre-un-refus-compte",
        "Positionne quand même Marc chez EDF, même s'il a refusé ce client.",
        "check_consultant_positioning",
        ("Un seul cas REFUSE le positionnement", "consentement compte explicitement refusé par le talent"),
        ("need_id", "run_id", "consultant_id"),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            objets=(Objet.CONSULTANT,),
            page="/consultants",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.REFUS_AVEC_ALTERNATIVE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        "dicter-une-fiche-consultant",
        "Ajoute Marc, freelance data engineer, dispo en janvier.",
        "prepare_consultant_record",
        ("Ne devine aucun champ", "se retrouveraient dans le vivier comme des faits"),
        ("full_name", "skills", "available_from"),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.CORRIGER_UNE_DONNEE,
            objets=(Objet.CONSULTANT,),
            page="/consultants",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT, JamaisInventer.EXECUTION),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    # BEL-SC-239 (lot SC-239 du 28/09 soir) — le pack de proposition : contexte,
    # shortlist, statut du CV adapté par profil, consentement, historique de
    # présentation. N'écrit rien et n'envoie rien — le commercial envoie depuis
    # l'écran « Préparer la proposition » (`/propositions`).
    ToolScenario(
        "assembler-le-pack-de-proposition",
        "Prépare la proposition pour ce besoin.",
        "prepare_proposal_pack",
        ("une section incomplète NOMME ce qui lui manque plutôt que de le combler", "c'est le commercial qui envoie"),
        ("project_id",),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            objets=(Objet.BESOIN, Objet.CONSULTANT),
            page="/propositions",
            jamais_inventer=(JamaisInventer.DATE, JamaisInventer.COUT),
            action=Action.ECRAN_PREREMPLI,
            nature=Nature.POSITIF,
        ),
    ),
    # Épopée #2872 (#2367.6, LOT c5 clôture 26/09) — proposer un push depuis
    # Laura : AUCUNE lecture, AUCUNE écriture — une route vers le panneau de
    # matching déjà réel, le classement et l'envoi restent un clic humain.
    ToolScenario(
        "propose-ce-profil-sur-cette-affaire",
        "Propose Marc sur cette affaire.",
        "push_profile",
        ("N'envoie et n'enregistre RIEN", "restent un geste humain dans le panneau ouvert"),
        ("project_id", "consultant_id"),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            objets=(Objet.CONSULTANT, Objet.BESOIN),
            page="/consultants",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.ECRAN_PREREMPLI,
            nature=Nature.POSITIF,
        ),
    ),
    # Épopée #2872 (#2367.11, 25-26/09) — le REX d'un push consultant. Une
    # LECTURE : le pont NestJS (`ConsultantsService.listFeedback`) vérifie déjà
    # que le consultant appartient à l'espace de l'appelant.
    ToolScenario(
        "pourquoi-ce-profil-a-ete-refuse",
        "Pourquoi le profil de Marc a été refusé chez ce client ?",
        "get_consultant_push_feedback",
        ("Une LECTURE seule : cet outil n'enregistre aucun REX.",),
        ("consultant_id",),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.ANALYSER,
            objets=(Objet.CONSULTANT,),
            page="/consultants/$id",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : aucun push enregistré pour ce consultant — Laura le
        # dit, elle n'invente jamais une raison de refus.
        "aucun-rex-enregistre-pour-ce-consultant",
        "Qu'est-ce qu'on a retenu du push de Sarah ?",
        "get_consultant_push_feedback",
        ("Sans aucun push enregistré pour ce consultant, dis-le plutôt que d'inventer une raison.",),
        ("consultant_id",),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.ANALYSER,
            objets=(Objet.CONSULTANT,),
            page="/consultants/$id",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #3265.12 (épopée #3287) — après un résultat « réorienté », Laura relit le
    # texte DÉCLARÉ et propose la suite sur la personne nommée (jamais seule).
    ToolScenario(
        "bernard-m-a-oriente-vers-delphine",
        "Bernard m'a orienté vers Delphine, on fait quoi ?",
        "get_orientations_to_follow",
        ("Une LECTURE seule : cet outil ne crée aucune action.",),
        (),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.SUIVRE_UNE_MISSION,
            objets=(Objet.CONTACT,),
            page="/actions",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : le texte déclaré ne nomme personne — Laura le demande,
        # elle ne devine jamais le nom du nouveau contact.
        "orientation-sans-nom-declare",
        "Il m'a renvoyé vers quelqu'un d'autre, tu sais qui ?",
        "get_orientations_to_follow",
        ("s'il n'y en a pas, demande-le, ne le devine pas.",),
        (),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.SUIVRE_UNE_MISSION,
            objets=(Objet.CONTACT,),
            page="/actions",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # ── Missions, delivery, facturation ──────────────────────────────────────
    ToolScenario(
        "missions-qui-se-terminent",
        "Quelles missions finissent dans 30 jours ?",
        "search_missions",
        ("Une mission SANS date de fin y figure aussi",),
        ("ending_within_days",),
        meta=Meta(
            moment=Moment.DELIVERY,
            intention=Categorie.SUIVRE_UNE_MISSION,
            objets=(Objet.MISSION,),
            page="/missions",
            jamais_inventer=(JamaisInventer.DATE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            situations=(Recette1945.MISSION_A_J_30, Recette1945.MISSION_SANS_DATE),
        ),
    ),
    ToolScenario(
        "releves-manquants",
        "Qui n'a pas déposé son relevé d'activité ?",
        "get_timesheets",
        ("Distingue ATTENDU", "Un contrat au forfait n'attend AUCUN relevé"),
        ("month",),
        meta=Meta(
            moment=Moment.DELIVERY,
            intention=Categorie.SUIVRE_UNE_MISSION,
            objets=(Objet.RELEVE_D_ACTIVITE, Objet.MISSION, Objet.CONSULTANT),
            page="/missions/cra",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # #1948.52 — le CAS LIMITE : le mois court encore. Un relevé ATTENDU n'est
        # pas un relevé MANQUANT, et on ne relance pas ce qui n'est pas dû.
        "relancer-un-releve-du-mois-en-cours",
        "Relance tous ceux qui n'ont pas encore déposé leur relevé de ce mois-ci.",
        "get_timesheets",
        ("ne relance jamais sur un mois qui n'est pas fini",),
        ("month",),
        meta=Meta(
            moment=Moment.DELIVERY,
            intention=Categorie.SUIVRE_UNE_MISSION,
            objets=(Objet.RELEVE_D_ACTIVITE, Objet.CONSULTANT),
            page="/missions/cra",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        "ce-qui-bloque-la-facturation",
        "Qu'est-ce qui bloque ma facturation de mars ?",
        "get_invoice_blockers",
        # ⚠️ PAS « Bellum n'émet aucune facture » seul : `get_overdue_payments`
        # porte la même phrase, et la garde du fragment unique la refuse.
        ("ne promets jamais d'en produire une", "Le montant rendu est PRÉPARATOIRE"),
        ("month",),
        meta=Meta(
            moment=Moment.FACTURATION,
            intention=Categorie.SUIVRE_UNE_MISSION,
            objets=(Objet.FACTURE, Objet.MISSION),
            page="/missions/facturation",
            jamais_inventer=(JamaisInventer.EXECUTION, JamaisInventer.CHIFFRE),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        "ou-intervenir",
        "Où je dois intervenir aujourd'hui ?",
        "get_interventions",
        ("cite-le, ne le reformule pas",),
        meta=Meta(
            moment=Moment.JOURNEE,
            intention=Categorie.DECIDER,
            # Inconnu, et dit : `OBJETS_INCONNUS` dans test_copilote_scenario_corpus.py.
            objets=None,
            page="/briefing",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # « Non mesurable » est un RISQUE, pas un zéro — la même règle que
        # `get_revenue`, du côté de la marge.
        "missions-a-risque",
        "Quelles missions sont à risque ?",
        "get_mission_risks",
        ("est un risque en soi", "ne le confonds pas avec une marge faible"),
        meta=Meta(
            moment=Moment.DELIVERY,
            intention=Categorie.SUIVRE_UNE_MISSION,
            objets=(Objet.MISSION,),
            page="/missions",
            jamais_inventer=(JamaisInventer.CHIFFRE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # #1948.52 / 1945.14 — le CAS LIMITE : une mission sans date de fin est un
        # risque NOMMÉ, pas une mission « sans échéance, donc sans souci ».
        "mission-sans-date-de-fin-a-risque",
        "Et les missions qui n'ont pas de date de fin, elles sont à risque ?",
        "get_mission_risks",
        ("aucune date de fin",),
        meta=Meta(
            moment=Moment.DELIVERY,
            intention=Categorie.SUIVRE_UNE_MISSION,
            objets=(Objet.MISSION,),
            page="/missions",
            jamais_inventer=(JamaisInventer.DATE,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
            situations=(Recette1945.MISSION_SANS_DATE,),
        ),
    ),
    ToolScenario(
        # #2409.8 — annoncer le démarrage AVEC ses réserves, jamais en silence.
        "checklist-de-demarrage-dune-mission",
        "Est-ce qu'on peut démarrer la mission chez Thales lundi ?",
        "get_mission_start_readiness",
        ("ANNONCE le démarrage AVEC ses réserves", "jamais un refus nu"),
        ("mission_id",),
        meta=Meta(
            moment=Moment.DELIVERY,
            intention=Categorie.SUIVRE_UNE_MISSION,
            objets=(Objet.MISSION,),
            page="/missions",
            jamais_inventer=(JamaisInventer.PROBABILITE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # #2409.8 — le CAS LIMITE : une mission BLOQUÉE nomme CHAQUE prérequis
        # manquant, jamais un refus nu qui laisserait deviner lequel lever.
        "mission-bloquee-au-demarrage",
        "Pourquoi je ne peux pas passer cette mission en cours ?",
        "get_mission_start_readiness",
        ("nomme CHAQUE prérequis bloquant manquant",),
        ("mission_id",),
        meta=Meta(
            moment=Moment.DELIVERY,
            intention=Categorie.SUIVRE_UNE_MISSION,
            objets=(Objet.MISSION,),
            page="/missions",
            jamais_inventer=(JamaisInventer.PROBABILITE,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        # #2423.9 — Laura PRÉPARE l'avenant, elle n'écrit rien : la carte
        # attend la validation explicite, jamais annoncée comme déjà actée.
        "preparer-un-avenant-de-mission",
        "Le client a accepté de passer le TJM de Karim à 650€ à partir du 1er novembre, prépare l'avenant.",
        "propose_mission_amendment",
        ("ANNONCE TOUJOURS ceci comme une proposition EN ATTENTE", "`proof` est OBLIGATOIRE"),
        ("mission_id", "event_type", "effective_from", "proof", "previous_term", "new_term"),
        meta=Meta(
            moment=Moment.DELIVERY,
            intention=Categorie.SUIVRE_UNE_MISSION,
            objets=(Objet.MISSION,),
            page="/missions",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # #2423.9 — le CAS LIMITE : un accord VERBAL rapporté par le commercial
        # n'est jamais annoncé comme obtenu — l'avenant reste `proposé` tant
        # qu'un humain ne l'a pas validé à l'écran.
        "avenant-sur-accord-verbal-du-client",
        "Le client m'a dit oui au téléphone pour le changement de TJM, tu peux valider l'avenant directement ?",
        "propose_mission_amendment",
        ("même si la personne te dit que le client a donné son accord verbal",),
        meta=Meta(
            moment=Moment.DELIVERY,
            intention=Categorie.SUIVRE_UNE_MISSION,
            objets=(Objet.MISSION,),
            page="/missions",
            jamais_inventer=(JamaisInventer.AUTORISATION,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        # #2276.1 / #2276.2 — une demande complexe devient un JOB à confirmer :
        # rien n'est lancé, rien n'est débité, le coût vient de Bellum.
        "job-composite-sur-demande-complexe",
        "Analyse les 20 filiales de Thales, trouve 50 décideurs et prépare un premier message pour chacun.",
        "plan_laura_job",
        ("pose un JOB avec cet outil", "Il ne lance RIEN et ne débite rien", "Le coût est calculé par Bellum"),
        ("intent", "expected_outcome", "scope", "steps"),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE, Objet.CONTACT),
            page="/chat",
            jamais_inventer=(JamaisInventer.EXECUTION, JamaisInventer.COUT),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # #2324.39 — Laura PRÉPARE la mise à jour d'une opportunité, diff figé à
        # l'appui : l'« avant » est LU, la carte attend la validation.
        "mettre-a-jour-une-opportunite-avec-diff",
        "Suite au rendez-vous d'hier, passe l'opportunité Refonte data en confirmée, montant 120 k€.",
        "propose_opportunity_update",
        ("annonce une PROPOSITION", "montre le diff « avant → après »"),
        ("project_id", "stage", "estimated_amount", "next_step", "proof"),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.PILOTER,
            objets=(Objet.PIPE,),
            page="/projects",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # #2276 — le CAS LIMITE : une demande simple ne devient pas un job.
        "demande-simple-sans-job",
        "Donne-moi le dernier signal chez Thales.",
        "plan_laura_job",
        ("Une demande simple (une lecture, un geste) ne passe PAS par ici",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        # #2324.39 — le CAS LIMITE : « marque-la gagnée » ne se prépare pas dans
        # le chat — la clôture a ses effets et sa raison, à l'écran.
        "opportunite-gagnee-depuis-le-chat",
        "C'est signé, marque l'opportunité Refonte data comme gagnée.",
        "propose_opportunity_update",
        ("Gagné ou perdu ne se proposent pas ici",),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.PILOTER,
            objets=(Objet.PIPE,),
            page="/projects",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #2391 — le plan de journée en blocs de temps, sur l'agenda RÉEL. Sans cas
    # limite ce lot : `propose_focus_plan` rejoint le cliquet SANS_CAS_LIMITE
    # de `test_copilote_scenario_corpus.py`.
    # Fragment mis à jour à la fusion vague 31+33 (24/09) : `89fef349b2` (vague 35,
    # `fix/ia: propose_focus_plan absent de l'audit lecture/écriture`) a ajouté
    # « et à valider par l'utilisateur » à la description pour satisfaire
    # `test_chat_write_tools.py` — la règle n'a pas disparu, son libellé a changé.
    ToolScenario(
        "organiser-ma-journee-en-blocs",
        "Organise-moi les prochaines heures : j'ai un rendez-vous à préparer et des relances en retard.",
        "propose_focus_plan",
        (
            "RÉELLEMENT libre de l'agenda",
            "n'écrit RIEN dans l'agenda",
            "PROPOSITION à revoir et à valider par l'utilisateur, jamais des blocs déjà posés",
        ),
        ("blocks",),
        meta=Meta(
            moment=Moment.JOURNEE,
            intention=Categorie.PILOTER,
            objets=(Objet.RENDEZ_VOUS,),
            page="/chat",
            jamais_inventer=(JamaisInventer.EXECUTION, JamaisInventer.DATE),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    # #2770.55-.62 — le plan de SEMAINE, bâti sur le plan de journée.
    ToolScenario(
        "organiser-ma-semaine-en-blocs",
        "Organise-moi ma semaine : trois relances à faire avant jeudi et une revue de pipe.",
        "propose_weekly_plan",
        (
            "jamais APRÈS l'échéance d'un bloc",
            "ne crée RIEN dans l'agenda",
        ),
        ("blocks",),
        meta=Meta(
            moment=Moment.JOURNEE,
            intention=Categorie.PILOTER,
            objets=(Objet.RENDEZ_VOUS,),
            page="/chat",
            jamais_inventer=(JamaisInventer.EXECUTION, JamaisInventer.DATE),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        "ou-ca-bloque",
        "Pourquoi ce dossier n'avance plus ?",
        "get_chain_blockers",
        ("Tu ne peux rien envoyer", "la raison vérifiable"),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.PILOTER,
            secondaires=(Categorie.SUIVRE_UNE_MISSION,),
            objets=(Objet.BESOIN, Objet.PIPE, Objet.MISSION),
            page="/pilotage/pipe",
            jamais_inventer=(JamaisInventer.EXECUTION, JamaisInventer.PERIMETRE),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # ── Besoins, matching, appels d'offres ───────────────────────────────────
    ToolScenario(
        "besoins-ouverts",
        "Quels besoins sont ouverts chez mes clients ?",
        "find_needs",
        ("AVANT tout classement de profils", "Chaque ligne porte son compte parent"),
        ("query", "limit"),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.TROUVER_UN_BESOIN,
            objets=(Objet.BESOIN, Objet.COMPTE),
            page="/projects/needs",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # LE scénario des invariants : aucune probabilité, aucun axe non
        # évaluable compté zéro, et les écartés avec leur motif.
        "shortlist-sur-un-besoin",
        "Fais-moi une shortlist pour ce besoin, et dis-moi qui a le plus de chances de passer.",
        "run_matching",
        (
            "Un axe non évaluable sort du calcul",
            "Ne présente jamais ces scores comme une probabilité de gagner",
            "les profils écartés AVEC leur motif",
        ),
        ("need_id", "consultant_id"),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            objets=(Objet.BESOIN, Objet.CONSULTANT),
            page="/projects/needs",
            jamais_inventer=(JamaisInventer.PROBABILITE, JamaisInventer.CHIFFRE),
            action=Action.AUCUNE,
            # La « chance de passer » est demandée : la question HEURTE le bord.
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        # #1948.52 — le POSITIF de `run_matching` : la seule question de ce
        # fichier sur cet outil était un cas limite (la chance de passer).
        "comparer-un-consultant-a-un-besoin",
        "Compare ce consultant avec ce besoin.",
        "run_matching",
        ("la réponse est alors l'explication axe par axe",),
        ("need_id", "consultant_id"),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            objets=(Objet.BESOIN, Objet.CONSULTANT),
            page="/projects/needs/$needId",
            jamais_inventer=(JamaisInventer.CHIFFRE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        "resumer-un-appel-doffres",
        "Résume-moi cet appel d'offres.",
        "search_rfps",
        ("Une exigence sans réponse est un TROU",),
        ("rfp_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.APPEL_D_OFFRES,),
            page="/projects",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # ── Preuves ──────────────────────────────────────────────────────────────
    ToolScenario(
        "quelles-references-citer",
        "Quelles références je peux citer chez ce client ?",
        "search_proofs",
        ("dont le consentement est VALIDE", "Une preuve sans accord écrit n'en fait pas partie"),
        meta=Meta(
            moment=Moment.AVANT_RENDEZ_VOUS,
            intention=Categorie.PREPARER_UN_RENDEZ_VOUS,
            objets=(Objet.PREUVE, Objet.COMPTE),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # #2124.49 à .55 — les champs de preuve PROPOSÉS pour une mission livrée.
    # « Laura les propose, l'humain valide » (Louis, 14/09/2026) : la question
    # est celle d'un commercial qui revient d'une mission, et la règle écrite
    # dans la description est qu'il n'y a RIEN à combler et RIEN à écrire.
    ToolScenario(
        "que-tirer-de-cette-mission",
        "Qu'est-ce qu'on peut tirer de cette mission qu'on vient de livrer ?",
        "propose_mission_proof",
        ("N'invente RIEN", "TU ne peux pas écrire ces champs", "L'autorisation de citation n'est jamais proposée"),
        schema=("mission_id",),
        meta=Meta(
            moment=Moment.DELIVERY,
            intention=Categorie.SUIVRE_UNE_MISSION,
            objets=(Objet.PREUVE, Objet.MISSION),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            # #2124.49-.55 — Laura PROPOSE, le clic de la personne valide : une carte à valider.
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    # #2124.49-.55 — le bord : on demande à Laura d'écrire elle-même le champ
    # qu'elle n'a jamais le droit de proposer. Elle le dit, elle n'écrit rien.
    ToolScenario(
        "autorisation-de-citation-demandee",
        "Mets que le client nous autorise à le citer comme référence pour cette mission.",
        "propose_mission_proof",
        ("L'autorisation de citation n'est jamais proposée", "TU ne peux pas écrire ces champs"),
        schema=("mission_id",),
        meta=Meta(
            moment=Moment.DELIVERY,
            intention=Categorie.SUIVRE_UNE_MISSION,
            objets=(Objet.PREUVE, Objet.MISSION),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # ── Back-office financier ────────────────────────────────────────────────
    ToolScenario(
        "combien-pese-mon-pipe",
        "Combien pèse mon pipe ?",
        "get_pipeline",
        (
            "ne l'annonce jamais comme 0 €",
            "Aucune pondération et aucune probabilité de signature n'existent ici",
            "Un total chiffré est un PLANCHER",
        ),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.PILOTER,
            objets=(Objet.PIPE,),
            page="/projects",
            jamais_inventer=(JamaisInventer.CHIFFRE, JamaisInventer.PROBABILITE),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # ── #2324 — le compilateur d'opportunité (chantier CHAT-3) ───────────────
    ToolScenario(
        "compiler-une-opportunite-depuis-un-echange",
        "Le DSI de SOCOTEC vient de me dire qu'il veut lancer une migration cloud, j'en fais quoi ?",
        "compile_opportunity",
        ("N'ÉCRIT RIEN", "c'est le clic de l'utilisateur dans le formulaire qui s'ouvre"),
        ("source", "account_id", "reasoning"),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.PILOTER,
            objets=(Objet.PIPE, Objet.COMPTE),
            page="/projects",
            jamais_inventer=(JamaisInventer.PROBABILITE, JamaisInventer.EXECUTION),
            action=Action.ECRAN_PREREMPLI,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : un signal de recrutement seul n'est PAS une demande
        # exprimée — la description le refuse explicitement (#2324.48).
        "ne-pas-compiler-un-simple-signal",
        "J'ai vu que SOCOTEC recrute un DevOps, je note ça comme opportunité ?",
        "compile_opportunity",
        ("Ne propose JAMAIS ceci pour un simple signal de recrutement",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.PILOTER,
            objets=(Objet.PIPE, Objet.COMPTE),
            page="/projects",
            jamais_inventer=(JamaisInventer.RESULTAT, JamaisInventer.EXECUTION),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #2792 (épopée Account Expansion, 25/09) — le compilateur d'expansion de
    # compte : renouveler, ajouter une capacité, ouvrir une équipe adjacente,
    # remonter vers une direction commune, etc., depuis des signaux DÉJÀ
    # établis par le delivery — jamais une hypothèse commerciale sans preuve.
    ToolScenario(
        "compiler-une-expansion-de-compte",
        "La mission chez SOCOTEC se termine bien, le sponsor a mentionné vouloir étendre à une autre équipe, "
        "j'en fais quoi ?",
        "compile_account_expansion",
        (
            "jamais depuis une hypothèse commerciale sans preuve issue du delivery",
            "AU PLUS TROIS pistes sont retenues par appel",
            "AUCUNE probabilité de succès, aucun score chiffré",
        ),
        ("account_id", "leads"),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.PILOTER,
            objets=(Objet.PIPE, Objet.COMPTE),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.PROBABILITE, JamaisInventer.EXECUTION),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : les deux garde-fous STRICTS (#2792) — une mission
        # dans une filiale n'est jamais un référencement groupe, une relation
        # manager non requalifiée n'est jamais un sponsor groupe. Violée, la
        # piste est REJETÉE, jamais proposée avec une réserve.
        "piste-dexpansion-non-qualifiee",
        "La mission est dans une filiale de SOCOTEC, propose ça comme un référencement groupe.",
        "compile_account_expansion",
        ("Une piste qui viole l'un des deux est REJETÉE, jamais proposée avec une réserve",),
        ("account_id", "leads"),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.PILOTER,
            objets=(Objet.PIPE, Objet.COMPTE),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.RESULTAT, JamaisInventer.EXECUTION),
            action=Action.REFUS_AVEC_ALTERNATIVE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #4611 — où en est le travail lancé : lu en base, rendu en carte, jamais raconté. Son cas limite : on ne
    # promet pas une fin (aucune estimation de fin n'est mesurée).
    ToolScenario(
        "ou-en-est-le-travail-lance",
        "Où en sont les 15 analyses lancées ?",
        "get_work_progress",
        (
            "et de recherches de conversation ont été LANCÉS",
            "JAMAIS « 0 » ni « aucun »",
            "Si l'outil n'a pas pu lire, dis que tu n'as pas pu lire",
        ),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.PILOTER,
            objets=(Objet.ESPACE,),
            page="/discover/lots",
            jamais_inventer=(JamaisInventer.CHIFFRE, JamaisInventer.RESULTAT),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        "pas-de-fin-promise-pour-un-lot",
        "Dis-moi à quelle heure mes analyses seront toutes terminées.",
        "get_work_progress",
        ("Aucune probabilité, aucune estimation de fin",),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.PILOTER,
            objets=(Objet.ESPACE,),
            page="/discover/lots",
            jamais_inventer=(JamaisInventer.PROBABILITE, JamaisInventer.DATE),
            action=Action.REFUS_AVEC_ALTERNATIVE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        "quest-ce-qui-merite-mon-temps",
        "Qu'est-ce qui mérite mon temps dans le pipe aujourd'hui ?",
        "get_pipeline_health",
        (
            "ne renvoie JAMAIS l'utilisateur vers l'écran Pipe comme seule réponse",
            "AUCUN score, aucune pondération, aucune probabilité de signature n'existe ici",
        ),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.PILOTER,
            objets=(Objet.PIPE,),
            page="/projects",
            jamais_inventer=(JamaisInventer.PROBABILITE, JamaisInventer.CHIFFRE),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : une recommandation de clôture n'est PAS un geste — la
        # description le refuse explicitement.
        "pas-de-cloture-automatique",
        "Ce compte est mort depuis six mois, clôture-le.",
        "get_pipeline_health",
        ("rien ici ne clôture, ne relance ni ne modifie quoi que ce soit tout seul",),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.PILOTER,
            objets=(Objet.PIPE,),
            page="/projects",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.REFUS_AVEC_ALTERNATIVE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #2325.7/.15/.16/.21/.23/.24/.25 — RÉFUTÉ ÉCRAN 25/09 nuit R5 (prod) :
    # cette question exacte partait vers `_BLOCK_PRIORITISATION` (un classement
    # de COMPTES), jamais vers `get_pipeline_health`, parce que « prioriser »
    # matche le déclencheur du premier et qu'aucun des deux ne disait où finit
    # l'un et où commence l'autre.
    ToolScenario(
        "sante-du-pipe-versus-portefeuille",
        "Quelle est la santé de mon pipe d'opportunités ? Quelles affaires prioriser ?",
        "get_pipeline_health",
        (
            "quelle est la santé de mon pipe d'opportunités",
            "quelles affaires prioriser",
            "Une AFFAIRE — une opportunité du pipe — n'est pas un COMPTE",
        ),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.PILOTER,
            objets=(Objet.PIPE,),
            page="/projects",
            jamais_inventer=(JamaisInventer.PROBABILITE, JamaisInventer.CHIFFRE),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # ── #2322 — le compilateur de besoin ──────────────────────────────────────
    ToolScenario(
        "compiler-un-besoin-depuis-un-email",
        "Le DRH de Capgemini vient de m'écrire qu'il cherche un chef de projet PMO à Lyon à partir de janvier, "
        "prépare-moi la fiche besoin.",
        "compile_need",
        ("Annonce une proposition, jamais un besoin déjà créé",),
        ("source", "statements"),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.TROUVER_UN_BESOIN,
            objets=(Objet.BESOIN, Objet.COMPTE),
            page="/projects/needs",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : une valeur sans phrase source est JETÉE, jamais devinée.
        "ne-pas-inventer-un-champ-du-besoin",
        "Je n'ai pas eu le temps de demander le budget ni la séniorité, mets une estimation pour avancer plus vite.",
        "compile_need",
        (
            "N'invente jamais un budget, une séniorité, une durée, un nombre de postes, un télétravail, "
            "un décideur, une compétence, une urgence",
        ),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.TROUVER_UN_BESOIN,
            objets=(Objet.BESOIN, Objet.COMPTE),
            page="/projects/needs",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        "combien-jai-facture",
        "J'ai facturé combien en mars ?",
        "get_revenue",
        ("signé, produit, facturé, encaissé", "jamais fondues en un seul chiffre"),
        ("month",),
        meta=Meta(
            moment=Moment.FACTURATION,
            intention=Categorie.PILOTER,
            objets=(Objet.FACTURE, Objet.MISSION),
            page="/pilotage/finance",
            jamais_inventer=(JamaisInventer.CHIFFRE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Une lecture qu'on n'a pas se DIT — elle ne se remplace pas par un
        # chiffre voisin.
        "quelle-marge-sur-cette-mission",
        "Quelle marge je fais sur cette mission ?",
        "get_revenue",
        ("Cet outil ne rend AUCUNE marge", "dis que tu ne peux pas la voir"),
        meta=Meta(
            moment=Moment.FACTURATION,
            intention=Categorie.PILOTER,
            objets=(Objet.MISSION,),
            page="/pilotage/finance",
            jamais_inventer=(JamaisInventer.MARGE,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        # #1948.52 / 1945.29 — le CAS LIMITE du DROIT : sans lecture financière,
        # l'outil rend `finance_forbidden`, et « 0 € » serait un mensonge.
        "chiffre-daffaires-sans-le-droit",
        "Combien l'agence a encaissé en mars ?",
        "get_revenue",
        ("n'a pas le droit de lire le chiffre d'affaires",),
        ("month",),
        meta=Meta(
            moment=Moment.FACTURATION,
            intention=Categorie.PILOTER,
            objets=(Objet.FACTURE,),
            page="/pilotage/finance",
            jamais_inventer=(JamaisInventer.CHIFFRE,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
            situations=(Recette1945.PERMISSIONS_LIMITEES,),
        ),
    ),
    ToolScenario(
        # #2900 (#2415.10, 26/09) — le CA CONFIRMÉ : l'encaissé moins ce qui
        # est contesté, jamais fondu dans `get_revenue` (un cinquième chiffre
        # d'affaires serait une donnée inventée).
        "combien-jai-vraiment-encaisse",
        "Combien j'ai vraiment encaissé en mars, litiges exclus ?",
        "get_confirmed_revenue",
        ("l'encaissé, moins ce qui est CONTESTÉ", "ne le fonds jamais dans le montant confirmé"),
        ("month",),
        meta=Meta(
            moment=Moment.FACTURATION,
            intention=Categorie.PILOTER,
            objets=(Objet.FACTURE,),
            page="/pilotage/finance",
            jamais_inventer=(JamaisInventer.CHIFFRE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # #2857 (#2201.31, 26/09) — « Demander une explication » sur une carte
        # de validation en attente (Centre d'actions, onglet « À valider ») :
        # une LECTURE, elle ne décide rien.
        "pourquoi-cette-carte-attend-une-validation",
        "Pourquoi cette écriture attend une validation ?",
        "explain_approval_card",
        ("niveau d'approbation requis", "motif enregistré"),
        ("approval_request_id",),
        meta=Meta(
            moment=Moment.JOURNEE,
            intention=Categorie.ANALYSER,
            objets=(Objet.ECRAN,),
            page="/actions",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # #2857 (#2201.31, 26/09) — expliquer une carte de validation en
        # attente (« À valider ») : ce qu'elle ferait, le niveau requis, le
        # motif enregistré. Une LECTURE seule ; sans motif enregistré, le
        # dire plutôt que d'en inventer un (même famille que `get_revenue`).
        "pourquoi-cette-carte-attend-validation",
        "Pourquoi cette relance attend une validation ?",
        "explain_approval_card",
        ("ni valider, ni refuser, ni reporter", "dis-le plutôt que d'en inventer un"),
        ("approval_request_id",),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.COMPRENDRE_UNE_PAGE,
            objets=(Objet.RELEVE_D_ACTIVITE,),
            page="/actions",
            jamais_inventer=(JamaisInventer.RESULTAT, JamaisInventer.CHAMP_NON_DIT),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # #2425.8 (vague 33) — le prévisionnel par horizon, en chat : les MÊMES
        # causes chiffrées que l'écran « Pourquoi le cash n'est pas le CA ».
        "previsionnel-par-horizon-en-chat",
        "Pourquoi mon cash est en retard sur mon CA ce trimestre ?",
        "get_forecast_horizons",
        ("les MÊMES causes chiffrées que l'écran",),
        ("horizon",),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.PILOTER,
            objets=(Objet.PIPE, Objet.FACTURE),
            page="/pilotage/finance",
            jamais_inventer=(JamaisInventer.PROBABILITE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # #2425.8 (vague 33) — le CAS LIMITE du DROIT : sans lecture
        # financière, l'outil le dit — jamais un écart nul (même famille que
        # `get_revenue` / « chiffre-daffaires-sans-le-droit » ci-dessus).
        "previsionnel-sans-le-droit",
        "Explique-moi le prévisionnel de toute l'équipe.",
        "get_forecast_horizons",
        ("ne réponds jamais que l'écart est nul",),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.PILOTER,
            objets=(Objet.PIPE,),
            page="/pilotage/finance",
            jamais_inventer=(JamaisInventer.CHIFFRE,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
            situations=(Recette1945.PERMISSIONS_LIMITEES,),
        ),
    ),
    ToolScenario(
        # #4016.1d (15/10) — Laura CITE la probabilité calibrée : le chiffre AVEC son
        # intervalle, sa méthode et ses axes, jamais seul (c26 levée le 11/10).
        "chance-de-signer-une-affaire",
        "Quelle chance j'ai de signer l'affaire Supervision 24/7 ?",
        "get_probable_quarter",
        ("CITE-LA TOUJOURS", "avec son intervalle et sa méthode"),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.PILOTER,
            objets=(Objet.PIPE,),
            page="/projects",
            jamais_inventer=(JamaisInventer.PROBABILITE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # #4016.1d — le CAS LIMITE : trop peu d'affaires closes, la probabilité est
        # « non mesurée » — jamais annoncée comme 0 %.
        "chance-de-signer-non-mesuree",
        "Et pour l'affaire Data lake, quelle probabilité ?",
        "get_probable_quarter",
        ("ne l'annonce JAMAIS comme 0 %",),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.PILOTER,
            objets=(Objet.PIPE,),
            page="/projects",
            jamais_inventer=(JamaisInventer.PROBABILITE, JamaisInventer.CHIFFRE),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
            situations=(Recette1945.AUCUN_RESULTAT,),
        ),
    ),
    ToolScenario(
        "combien-de-jours-a-vendre",
        "Combien de jours j'ai à vendre en avril ?",
        "get_capacity",
        ("rien de mesurable", "refuse de se prononcer sous son seuil d'observations"),
        ("month",),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.PILOTER,
            secondaires=(Categorie.POSITIONNER_UN_CONSULTANT,),
            objets=(Objet.CONSULTANT,),
            page="/pilotage/finance",
            jamais_inventer=(JamaisInventer.CHIFFRE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # #1948.52 — le CAS LIMITE : « rien de mesurable » lu comme « zéro jour
        # disponible » dirait l'inverse du vrai.
        "jours-a-vendre-non-mesurables",
        "On n'a plus aucun jour à vendre en mai, c'est ça ?",
        "get_capacity",
        ("ce dernier se lirait « tout le monde est staffé »",),
        ("month",),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.PILOTER,
            objets=(Objet.CONSULTANT,),
            page="/pilotage/finance",
            jamais_inventer=(JamaisInventer.CHIFFRE,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        "qui-ne-ma-pas-paye",
        "Qui ne m'a pas payé ?",
        "get_overdue_payments",
        ("Ne propose jamais de relancer un litige", "n'envoie aucune relance"),
        ("month",),
        meta=Meta(
            moment=Moment.FACTURATION,
            intention=Categorie.PILOTER,
            objets=(Objet.FACTURE,),
            page="/missions/encaissements",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # #1948.52 — le CAS LIMITE : une facture contestée n'est pas en retard.
        "relancer-une-facture-contestee",
        "Relance le client qui conteste sa facture de février.",
        "get_overdue_payments",
        ("la discussion remplace la relance",),
        ("month",),
        meta=Meta(
            moment=Moment.FACTURATION,
            intention=Categorie.PILOTER,
            objets=(Objet.FACTURE,),
            page="/missions/encaissements",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        # #2425.8 (W43, 24/09) — le prévisionnel par horizon, la même paire
        # positif/cas-limite que ses voisins `get_revenue`/`get_capacity`.
        "pourquoi-mon-cash-est-en-retard",
        "Pourquoi mon cash est en retard sur mon CA ce trimestre ?",
        "get_forecast_horizons",
        ("les MÊMES causes chiffrées que l'écran", "pourquoi mon cash est en retard sur mon CA"),
        ("horizon",),
        meta=Meta(
            moment=Moment.FACTURATION,
            intention=Categorie.PILOTER,
            objets=(Objet.FACTURE, Objet.PIPE),
            page="/pilotage/finance",
            jamais_inventer=(JamaisInventer.PROBABILITE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # #1948.52 — le CAS LIMITE : la doctrine refusée six fois (« aucune
        # PROBABILITÉ ») s'applique aussi au prévisionnel par horizon — un
        # scénario est une SOMME par statut déclaré, jamais pondéré par une
        # chance de closing.
        "previsionnel-pondere-par-la-probabilite",
        "Donne-moi le CA prévisionnel pondéré par mes chances de signer chaque deal.",
        "get_forecast_horizons",
        ("AUCUNE probabilité de signature n'y entre", "jamais un montant pondéré par une chance de closing"),
        meta=Meta(
            moment=Moment.FACTURATION,
            intention=Categorie.PILOTER,
            objets=(Objet.FACTURE, Objet.PIPE),
            page="/pilotage/finance",
            jamais_inventer=(JamaisInventer.PROBABILITE,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # ── Territoire, partenaires, mémoire marché ──────────────────────────────
    ToolScenario(
        "a-qui-confier-un-besoin",
        "À qui je peux confier ce besoin ?",
        "search_partners",
        ("sous trois placements il n'y a pas de score, et ce n'est pas un zéro",),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            secondaires=(Categorie.DECIDER,),
            objets=(Objet.PARTENAIRE, Objet.BESOIN),
            page="/accounts/partners",
            jamais_inventer=(JamaisInventer.CHIFFRE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        "ouvrir-un-territoire",
        "Est-ce que ça vaut le coup d'ouvrir à Toulouse ?",
        "get_territory_overview",
        (
            "jamais qu'il n'y a rien sur ce territoire",
            "la liste de ce qu'on ne sait pas doit être dite avec le reste",
        ),
        ("department", "since_days"),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECOUVRIR,
            secondaires=(Categorie.DECIDER,),
            objets=(Objet.TERRITOIRE,),
            page="/discover",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            situations=(Recette1945.AUCUN_RESULTAT,),
        ),
    ),
    ToolScenario(
        "memoire-marche-par-filtre",
        "Quelles boîtes ont du Java en Île-de-France ?",
        "search_market_memory",
        ("c'est une trace du PASSÉ", "Sous trois parcours, une entreprise n'apparaît pas"),
        ("technology", "location", "role_family", "esn"),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECOUVRIR,
            objets=(Objet.OBSERVATION_MARCHE, Objet.COMPTE),
            page="/accounts/marches",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            situations=(Recette1945.OBSERVATION_HISTORIQUE,),
        ),
    ),
    ToolScenario(
        # Une mémoire de PARCOURS qui rendrait des identités serait un fichier
        # de personnes. Elle n'en rend pas, et sa description le dit.
        "nommer-les-gens-de-la-memoire-marche",
        "Donne-moi les noms des gens qui ont bossé chez eux.",
        "search_market_memory",
        ("Aucune identité de personne",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.OBSERVATION_MARCHE,),
            page="/accounts/marches",
            jamais_inventer=(JamaisInventer.IDENTITE,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #3193.2 (épopée #3217, lot E3 28/09 suite) — le référentiel sectoriel
    # Bellum, jamais présenté au chat jusqu'ici (le RAG existait, sans
    # appelant chat). Aucun écran propre : `search_sector_referential` est la
    # SEULE porte, même famille que `get_workspace_health` (SANS_PAGE_PROPRIETAIRE).
    ToolScenario(
        "reperes-sectoriels-dun-marche",
        "Comment se structure le marché de la cybersécurité pour une ESN ?",
        "search_sector_referential",
        ("jamais le contenu d'un compte précis",),
        ("query",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.ANALYSER,
            objets=(Objet.OBSERVATION_MARCHE,),
            page=None,
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        "aucun-repere-sectoriel-ne-correspond",
        "Le référentiel dit quoi sur les fintechs de moins de 10 salariés ?",
        "search_sector_referential",
        ("Une liste vide veut dire qu'aucun repère ne correspond assez à la question",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.ANALYSER,
            objets=(Objet.OBSERVATION_MARCHE,),
            page=None,
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #4282.9 / #4281.1 (19/10) — le radar par technologie et les besoins historiques de la base
    # commune : un positif et son cas limite chacun.
    ToolScenario(
        "radar-par-technologie",
        "Fais-moi un radar SAP France : où placer un consultant maintenant ?",
        "technology_radar",
        ("Rends SEPT blocs",),
        ("technology",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.ANALYSER,
            objets=(Objet.OBSERVATION_MARCHE,),
            page="/discover",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # LAURA-OFFRES-4563 (25/10) — des OFFRES sans consultant ni compte : un positif et son cas limite.
    ToolScenario(
        "offres-vue-java-lille-sans-consultant",
        "Trouve-moi des offres Vue et Java sur Lille",
        "search_job_offers",
        ("TOUTE demande d'offres", "ne demande ni l'un ni l'autre"),
        ("skills", "city"),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECOUVRIR,
            objets=(Objet.OBSERVATION_MARCHE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        "offres-sous-le-plancher-on-le-dit",
        "Il y a combien d'offres Cobol à Brest ? Complète avec ce que tu veux si c'est maigre",
        "search_job_offers",
        ("n'en ajoute JAMAIS une hors métier",),
        ("skills",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECOUVRIR,
            objets=(Objet.OBSERVATION_MARCHE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        "radar-client-final-masque",
        "Cette annonce SAP ne dit pas pour quel client, c'est qui la cible ?",
        "technology_radar",
        ("ne devine JAMAIS le client final",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.ANALYSER,
            objets=(Objet.OBSERVATION_MARCHE,),
            page="/discover",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        "besoins-historiques-dun-compte",
        "Quels besoins SAP ce compte a-t-il déjà eus, avec quel prescripteur et quel TJM ?",
        "search_historical_needs",
        ("a DÉJÀ acheté la compétence",),
        ("technology",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.ANALYSER,
            objets=(Objet.OBSERVATION_MARCHE,),
            page=None,
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        "besoins-historiques-rien-observe",
        "Ce prescripteur a-t-il déjà commandé du Murex ?",
        "search_historical_needs",
        ("Liste vide = rien d'observé",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.ANALYSER,
            objets=(Objet.OBSERVATION_MARCHE,),
            page=None,
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # ── Méta-espace ──────────────────────────────────────────────────────────
    ToolScenario(
        "ce-que-laura-sait-de-moi",
        "Tu sais quoi de moi ?",
        "get_user_context",
        ("aucun outil ne t'ouvre ce chemin d'écriture", "jamais une promesse de l'avoir retenu"),
        meta=Meta(
            moment=Moment.REGLAGES,
            intention=Categorie.DEMANDER_DE_L_AIDE,
            objets=(Objet.MEMOIRE,),
            page="/settings/profile",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.ECRAN_PREREMPLI,
            nature=Nature.POSITIF,
            situations=(Recette1945.UTILISATEUR_CONNU,),
        ),
    ),
    ToolScenario(
        # Un espace neuf n'est pas un espace en panne : « pas mesurable » se dit,
        # et ne se conclut jamais d'un silence.
        "sante-de-mon-espace",
        "Mon espace est en bonne santé ?",
        "get_workspace_health",
        ("Rend une CAUSE, jamais une note", "ne conclus jamais d'un silence"),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.PILOTER,
            objets=(Objet.ESPACE,),
            # Aucun écran : `SANS_PAGE_PROPRIETAIRE` dans test_copilote_scenario_corpus.py.
            page=None,
            jamais_inventer=(JamaisInventer.CHIFFRE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        "ce-que-je-paie-sans-lutiliser",
        "Qu'est-ce que je paie et que je n'utilise pas ?",
        "get_feature_adoption",
        ("il ne faut pas en déduire plus que ça",),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.PILOTER,
            objets=(Objet.ESPACE,),
            page=None,
            jamais_inventer=(JamaisInventer.CHIFFRE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        "ce-qui-membeche-davancer",
        "Qu'est-ce qui m'empêche d'avancer ?",
        "get_blocking_issues",
        ("une absence de liste veut dire",),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.DEMANDER_DE_L_AIDE,
            objets=(Objet.ESPACE,),
            page=None,
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            situations=(Recette1945.CONNECTEUR_CASSE, Recette1945.AUCUN_RESULTAT),
        ),
    ),
    ToolScenario(
        # BEL-SC-224 (#3253, P0) — LE point qui limite le plus la machine
        # commerciale, jamais une liste de tout ce qui ne va pas. Même patron
        # que `get_workspace_health` juste au-dessus (objet unique, aucun
        # écran propriétaire — Laura est la seule à le lire).
        "quel-est-mon-vrai-point-de-blocage-commercial",
        "Qu'est-ce qui limite le plus ma machine commerciale en ce moment ?",
        "get_weakest_link_diagnosis",
        (
            "jamais une liste de tout ce qui ne va pas",
            "ne demande jamais à la personne de tout résoudre en même temps",
        ),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.PILOTER,
            objets=(Objet.ESPACE,),
            page=None,
            jamais_inventer=(JamaisInventer.PROBABILITE, JamaisInventer.CHIFFRE),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # ── Navigation ───────────────────────────────────────────────────────────
    ToolScenario(
        "ouvrir-le-bon-ecran",
        "Où je change l'heure de mon brief du matin ?",
        "propose_guided_action",
        (
            "une route de réglages absente de cette liste est REFUSÉE, jamais devinée",
            "c'est le clic de la personne qui agit",
        ),
        ("route", "label", "highlight"),
        meta=Meta(
            moment=Moment.REGLAGES,
            intention=Categorie.DEMANDER_DE_L_AIDE,
            objets=(Objet.ECRAN, Objet.ROUTINE),
            page="/settings/routines",
            jamais_inventer=(JamaisInventer.INTERFACE, JamaisInventer.CLE),
            action=Action.ECRAN_PREREMPLI,
            nature=Nature.POSITIF,
            situations=(Recette1945.BONNE_REDIRECTION,),
        ),
    ),
    ToolScenario(
        "demande-trop-vague",
        "Cherche un profil.",
        "ask_clarification",
        ("une seule fois dans la conversation", "quand une partie de la demande est claire, traite-la"),
        ("question", "options"),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            objets=(Objet.CONSULTANT,),
            page="/consultants",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.QUESTION,
            nature=Nature.POSITIF,
        ),
    ),
    # ── Réglages ─────────────────────────────────────────────────────────────
    ToolScenario(
        "pourquoi-pas-de-brief",
        "Pourquoi je ne reçois pas mon brief du matin ?",
        "get_routines",
        ("ce qui les EMPÊCHE de tourner", "ne propose jamais d'en créer une nouvelle"),
        meta=Meta(
            moment=Moment.REGLAGES,
            intention=Categorie.DEMANDER_DE_L_AIDE,
            objets=(Objet.ROUTINE,),
            page="/settings/routines",
            jamais_inventer=(JamaisInventer.CLE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        "activer-une-routine",
        "Active-moi le brief du matin.",
        "toggle_routine",
        # ⚠️ #1822 a élargi cet outil à l'HEURE, au JOUR et au CANAL : le fragment
        # « il n'ajuste que l'abonnement » a disparu avec cet élargissement. On
        # garde ce qui EST la règle et qui n'a pas bougé.
        ("une clé inventée est refusée", "ne crée ni ne supprime aucune routine"),
        ("key", "enabled"),
        meta=Meta(
            moment=Moment.REGLAGES,
            intention=Categorie.DEMANDER_DE_L_AIDE,
            objets=(Objet.ROUTINE,),
            page="/settings/routines",
            jamais_inventer=(JamaisInventer.CLE,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # #1948.52 — le CAS LIMITE : un jour posé sur une routine qui tourne tous
        # les jours (`weekday: null`) est refusé.
        "jour-sur-une-routine-quotidienne",
        "Passe mon brief du matin au lundi seulement.",
        "toggle_routine",
        ("y poser un jour est refusé",),
        ("key", "weekday"),
        meta=Meta(
            moment=Moment.REGLAGES,
            intention=Categorie.DEMANDER_DE_L_AIDE,
            objets=(Objet.ROUTINE,),
            page="/settings/routines",
            jamais_inventer=(JamaisInventer.CLE,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        # #3950.1 (décision Louis 09/10/2026, lot G01) — Laura peut désormais
        # lancer l'export du vivier (le même bouton que l'écran).
        "exporter-le-vivier-pour-l-ats",
        "Exporte mon vivier pour l'ATS.",
        "launch_vivier_export",
        ("N'invente AUCUNE troisième option", "par le MÊME bouton que l'écran"),
        ("mode",),
        meta=Meta(
            moment=Moment.REGLAGES,
            intention=Categorie.DEMANDER_DE_L_AIDE,
            objets=(Objet.REGLAGE,),
            page="/settings/vivier-export",
            jamais_inventer=(JamaisInventer.CLE, JamaisInventer.EXECUTION),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # #2433.7 (épopée #2876, lot M10 09/10) — une capture de BellumAI en
        # défaut : Laura PRÉPARE le signalement, le clic l'envoie.
        "signaler-un-bug-depuis-une-capture",
        "Voilà une capture, l'écran Comptes affiche une erreur 500 quand je clique sur Analyser. Signale-le.",
        "prepare_bug_report",
        ("une capture montre un symptôme, pas un journal", "par le même formulaire que « Signaler un problème »"),
        ("observed",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.DEMANDER_DE_L_AIDE,
            objets=(Objet.ECRAN,),
            page="/chat",
            jamais_inventer=(JamaisInventer.SOURCE, JamaisInventer.EXECUTION),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # FIX-RECETTE-G (19/10, G.1) — Laura PRÉPARE un événement d'agenda (carte), il n'est créé
        # qu'à la validation de l'utilisateur.
        "caler-un-rendez-vous-dans-mon-agenda",
        "Cale-moi un point avec Claire Basset jeudi à 14h pendant 30 minutes, titre « Point cadrage ».",
        "prepare_calendar_event",
        ("c'est son clic qui crée l'événement", "n'invente jamais un créneau", "l'utilisateur les a nommés"),
        ("starts_at",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.DEMANDER_DE_L_AIDE,
            objets=(Objet.ECRAN,),
            page="/chat",
            jamais_inventer=(JamaisInventer.SOURCE, JamaisInventer.EXECUTION),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # #1822 — `pin_memory_fact` ÉCRIVAIT dans une mémoire qu'aucun outil ne
        # savait relire. La question la plus naturelle du produit n'avait donc
        # aucune réponse.
        "ce-que-laura-retient-de-moi",
        "Qu'est-ce que tu sais de moi ?",
        "get_memory",
        # La règle qui compte : une couche illisible est NOMMÉE, jamais comptée
        # vide — « je n'ai pas pu lire » n'est pas « je ne retiens rien ».
        ("ne les compte pas comme vides", "je ne retiens rien"),
        meta=Meta(
            moment=Moment.REGLAGES,
            intention=Categorie.DEMANDER_DE_L_AIDE,
            objets=(Objet.MEMOIRE,),
            page="/settings/memory",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            situations=(Recette1945.UTILISATEUR_CONNU,),
        ),
    ),
    ToolScenario(
        "les-mots-de-mon-esn",
        "Quels motifs de perte on a chez nous ?",
        "get_workspace_vocabulary",
        # Deux règles : un lexique vide est un FAIT (l'espace emploie le
        # vocabulaire par défaut), et Laura n'invente pas les mots de l'ESN.
        ("un fait, pas un manque", "tu les inventerais"),
        meta=Meta(
            moment=Moment.REGLAGES,
            intention=Categorie.DEMANDER_DE_L_AIDE,
            objets=(Objet.LEXIQUE,),
            page="/settings/catalogues",
            jamais_inventer=(JamaisInventer.CLE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Les réglages qui touchent l'argent, les droits et le cloisonnement ne
        # passent pas par la conversation — et ne s'y montrent même pas.
        "ajouter-un-siege",
        "Ajoute un siège à mon équipe.",
        "get_settings_overview",
        ("Les réglages qui touchent l'argent, les droits", "ne les touche pas, et ne les montre même pas"),
        meta=Meta(
            moment=Moment.REGLAGES,
            intention=Categorie.DEMANDER_DE_L_AIDE,
            objets=(Objet.REGLAGE, Objet.ESPACE),
            page="/settings/team",
            jamais_inventer=(JamaisInventer.CLE,),
            action=Action.ECRAN_PREREMPLI,
            nature=Nature.CAS_LIMITE,
            situations=(Recette1945.PERMISSIONS_LIMITEES,),
        ),
    ),
    ToolScenario(
        # #1948.52 — le POSITIF de `get_settings_overview` : la seule question de
        # ce fichier sur cet outil était le réglage qu'il ne montre PAS.
        "quelles-notifications-sont-actives",
        "Quelles notifications sont actives chez moi ?",
        "get_settings_overview",
        ("avec leur valeur ACTUELLE",),
        meta=Meta(
            moment=Moment.REGLAGES,
            intention=Categorie.DEMANDER_DE_L_AIDE,
            objets=(Objet.REGLAGE,),
            page="/settings/notifications",
            jamais_inventer=(JamaisInventer.CLE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        "changer-un-reglage",
        "Passe le plafond de messages proactifs à 2 par jour.",
        "propose_settings_update",
        ("il prépare une proposition FIGÉE", "hors bornes est refusée"),
        ("screen", "field", "value"),
        meta=Meta(
            moment=Moment.REGLAGES,
            intention=Categorie.DEMANDER_DE_L_AIDE,
            objets=(Objet.REGLAGE,),
            page="/settings/notifications",
            jamais_inventer=(JamaisInventer.CLE,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
            situations=(Recette1945.ACTION_A_VALIDER,),
        ),
    ),
    ToolScenario(
        "epingler-un-fait",
        "Retiens que je ne vise pas le secteur public.",
        "pin_memory_fact",
        ("jamais une note à toi-même", "dans la MÊME mémoire que l'écran"),
        ("fact", "account_id"),
        meta=Meta(
            moment=Moment.REGLAGES,
            intention=Categorie.CORRIGER_UNE_DONNEE,
            objets=(Objet.MEMOIRE,),
            page="/settings/memory",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    # ── Import ───────────────────────────────────────────────────────────────
    ToolScenario(
        "reprendre-mes-donnees",
        "Je veux reprendre mes comptes depuis mon fichier.",
        "get_import_overview",
        ("la conversation ne sait pas transporter un fichier aujourd'hui", "c'est la personne qui dépose son fichier"),
        meta=Meta(
            moment=Moment.PREMIERS_PAS,
            intention=Categorie.DEMANDER_DE_L_AIDE,
            objets=(Objet.IMPORT,),
            page="/settings/import",
            jamais_inventer=(JamaisInventer.CAPACITE,),
            action=Action.ECRAN_PREREMPLI,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # #1948.52 — le CAS LIMITE : un objet que le fichier PEUT contenir sans que
        # l'import le reprenne (`writable_objects`).
        "importer-un-objet-non-repris",
        "Je peux reprendre mes missions depuis mon fichier ?",
        "get_import_overview",
        ("ne le promets jamais comme repris",),
        meta=Meta(
            moment=Moment.PREMIERS_PAS,
            intention=Categorie.DEMANDER_DE_L_AIDE,
            objets=(Objet.IMPORT, Objet.MISSION),
            page="/settings/import",
            jamais_inventer=(JamaisInventer.CAPACITE,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        # #4426.8 (recette 22/10, Julien) — « aucune session d'import récente » alors que l'historique de l'écran
        # montrait le tiering importé : l'outil doit lire les MÊMES imports que l'écran.
        "mon-import-a-t-il-marche",
        "J'ai déposé mon fichier de tiering hier, il est bien passé ?",
        "get_import_overview",
        ("LES MÊMES imports que l'historique", "ne dis « aucun import récent » que si les TROIS listes sont vides"),
        meta=Meta(
            moment=Moment.PREMIERS_PAS,
            intention=Categorie.DEMANDER_DE_L_AIDE,
            objets=(Objet.IMPORT,),
            page="/settings/import",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        "combien-de-comptes-en-a",
        "Combien de comptes j'ai en A dans mon tiering ?",
        "get_import_overview",
        ("`tiering` compte les comptes étiquetés Tier A / B / C", "un tier à `null` n'est pas 0"),
        meta=Meta(
            moment=Moment.PREMIERS_PAS,
            intention=Categorie.DEMANDER_DE_L_AIDE,
            objets=(Objet.IMPORT, Objet.COMPTE),
            page="/settings/import",
            jamais_inventer=(JamaisInventer.CHIFFRE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # ── Demandes que Laura ne sait pas router (#1949.23) ─────────────────────
    ToolScenario(
        # Décision Louis 13/09 batch 12 : la demande laisse une trace ANONYME.
        # Deux règles, et elles portent tout le risque : le signal accompagne la
        # réponse (il ne la remplace jamais), et il ne sert JAMAIS pour une
        # demande que Laura sait traiter — sinon la trace mesure le modèle
        # plutôt que ce qui manque au produit.
        "une-demande-hors-perimetre",
        "Quel temps fera-t-il à Lyon demain ?",
        "note_unrouted_request",
        ("DANS LA MÊME réponse", "JAMAIS pour une demande que tu sais traiter"),
        ("category",),
        # #1948.11 — les métadonnées manquaient : ce scénario est arrivé par
        # #1949.23 pendant que la garde de corpus arrivait par l'autre branche.
        # Ni l'une ni l'autre n'était rouge seule.
        meta=Meta(
            # PAS `SECURITE`, qui veut dire « tentative de contournement » :
            # demander la météo n'en est pas une. Le moment où quelqu'un teste
            # les bords du produit est celui où il le découvre.
            moment=Moment.PREMIERS_PAS,
            intention=Categorie.HORS_PERIMETRE,
            # Aucun objet de Bellum n'est concerné : en nommer un inventerait un
            # lien. L'inconnu SE DIT — cliquet `OBJETS_INCONNUS` du corpus.
            objets=None,
            # Nulle part dans le produit : la personne ne fait cela sur AUCUN
            # écran de Bellum, et la trace elle-même est écrite par l'API sans
            # identité puis relue au back-office. Cliquet `SANS_PAGE_PROPRIETAIRE`.
            page=None,
            # Les deux inventions possibles : promettre une capacité absente du
            # registre, et rendre une météo que l'outil silencieux n'a jamais
            # rendue (son exécuteur rend `{"status": "noted"}`).
            jamais_inventer=(JamaisInventer.CAPACITE, JamaisInventer.RESULTAT),
            # PAS `AUCUNE` : le signal ACCOMPAGNE la réponse, il ne la remplace
            # jamais. Au bout du tour la personne lit un refus bref et ce que
            # Laura sait faire à la place.
            action=Action.REFUS_AVEC_ALTERNATIVE,
            # POSITIF : c'est l'appel NOMINAL de cet outil-là, pas son bord — une
            # demande hors périmètre est ce pour quoi il a été écrit.
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE du même outil, et le deuxième tiers de son contrat : la
        # demande est bel et bien commerciale, elle heurte le bord de BELLUM et
        # non celui du métier. C'est là que le modèle est tenté de promettre.
        "une-capacite-que-bellum-na-pas",
        "Tu peux publier l'annonce de ce besoin sur les jobboards ?",
        "note_unrouted_request",
        ("capacité que Bellum n'a pas (capacite_absente)", "jamais seul et jamais à la place de répondre"),
        ("category",),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.HORS_PERIMETRE,
            objets=(Objet.BESOIN,),
            # Même raison que son voisin : publier une annonce ne se fait sur
            # aucun écran de Bellum. Cliquet `SANS_PAGE_PROPRIETAIRE`.
            page=None,
            jamais_inventer=(JamaisInventer.CAPACITE,),
            action=Action.REFUS_AVEC_ALTERNATIVE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # ── Les réponses possibles d'une précision posée en TEXTE (#2679) ────────
    ToolScenario(
        # Le retour de Louis : « sélectionner la réponse, sans avoir besoin de la
        # réécrire dans le chat ». La question reste posée dans le texte ; ses
        # réponses partent, en plus, sous forme cliquable.
        "cliquer-la-reponse-dune-precision",
        "Trouve-moi des comptes dans la banque.",
        "offer_reply_options",
        (
            "une précision DANS le texte de ta réponse",
            "Tu gardes ta phrase",
        ),
        ("precisions",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECIDER,
            objets=(Objet.COMPTE,),
            page="/chat",
            # Rien n'est deviné : les réponses possibles sont celles que la
            # question attend, jamais une option extraite de la prose.
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : une demande complète ne se fait pas poser de question,
        # donc aucune réponse à proposer — un groupe de boutons sous une réponse
        # qui ne demande rien n'aurait rien à envoyer.
        "ne-pas-proposer-de-reponse-sans-question",
        "Merci, c'est clair.",
        "offer_reply_options",
        ("N'appelle jamais cet outil sans poser la question correspondante dans ton texte",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECIDER,
            objets=None,
            page="/chat",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # ── La continuité du fil (#2268.1 / #2268.5 / #2268.10) ──────────────────
    ToolScenario(
        # L'objectif, un critère exclu et une décision : trois choses qui ne
        # doivent PAS se reperdre au message suivant, ni se redemander.
        "fixer-lobjectif-dun-fil",
        "On vise ACME, sans les grands groupes cette année.",
        "note_thread_context",
        (
            "l'objectif actif du fil quand tu viens de le fixer ou de le changer",
            "jamais une piste écartée",
        ),
        ("goal", "excluded", "decisions"),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECIDER,
            objets=(Objet.COMPTE,),
            page="/chat",
            # Rien de plus que ce que l'outil garantit : il ne rend ni résultat
            # ni exécution, il NOTE ce que la personne vient de dire.
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : rien de NEUF à noter — la tentation serait de répéter
        # un objectif déjà en tête, ou d'en inventer un pour « faire complet ».
        "ne-pas-noter-sans-rien-de-neuf",
        "Merci, à plus tard.",
        "note_thread_context",
        ("jamais pour répéter ce qui n'a pas changé",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECIDER,
            objets=None,
            page="/chat",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # ── Campagnes (#1903.10 / #1935) ─────────────────────────────────────────
    #
    # Ferme CATEGORIES_SANS_SCENARIO[CREER_UNE_SEQUENCE] : jusqu'ici, `1948.37`
    # n'existait qu'en intention SECONDAIRE sur « poser-un-rappel » — voir le
    # commentaire de ce scénario. `prepare_campaign` est le premier outil qui la
    # porte en PRINCIPALE.
    ToolScenario(
        "preparer-une-campagne",
        "Prépare-moi une campagne sur ces comptes.",
        "prepare_campaign",
        ("n'écrit RIEN et ne crée AUCUNE séquence", "une séquence par contact, jamais un envoi de masse"),
        ("contact_ids", "objective"),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.CREER_UNE_SEQUENCE,
            objets=(Objet.CONTACT, Objet.COMPTE, Objet.MESSAGE),
            page="/actions/sequences",
            # L'audience n'est jamais devinée (des `contact_id` inventés), et le
            # clic n'a pas encore eu lieu : rien n'est créé avant lui.
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT, JamaisInventer.EXECUTION),
            action=Action.ECRAN_PREREMPLI,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : SAIT DIRE NON. Une audience entière écartée ou sans
        # coordonnée exploitable n'est pas une campagne à moitié pleine, c'est
        # un refus — la mesure réelle de #1935.21 (« signal utilisable »),
        # NON PROUVÉ jusqu'ici.
        "preparer-une-campagne-sans-audience-exploitable",
        "Prépare une campagne sur ces trois contacts.",
        "prepare_campaign",
        ("l'outil refuse : ce n'est pas une campagne, c'est une liste vide",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.CREER_UNE_SEQUENCE,
            objets=(Objet.CONTACT,),
            page="/actions/sequences",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT, JamaisInventer.RESULTAT),
            action=Action.REFUS_AVEC_ALTERNATIVE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #2300 — le contrat de travail de compte : l'objectif commercial actif
    # AVANT un plan, jamais deviné.
    ToolScenario(
        "contrat-de-travail-avant-un-plan",
        "Je veux préparer un rendez-vous chez SOCOTEC, par où je commence ?",
        "get_account_work_contract",
        ("l'objectif commercial actif", "dix-sept objectifs canoniques"),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.PREPARER_UN_RENDEZ_VOUS,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : une demande sans objectif clair ne doit JAMAIS
        # déboucher sur un plan générique (#2300.56) — l'outil le dit, il ne
        # laisse pas le silence trancher.
        "contrat-de-travail-sans-objectif-clair",
        "Regarde le compte ACME et dis-moi quoi faire dessus.",
        "get_account_work_contract",
        ("NE PRODUIS PAS de plan générique",),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.QUESTION,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #2302 — DÉFAUT D'INTÉGRATION mesuré à la fusion de la vague 14 (22/09) :
    # le lot #2302 n'avait posé aucune question ici (GA-318/inventaire), donc
    # aucune preuve que le modèle sait appeler ce nouvel outil.
    ToolScenario(
        "quel-perimetre-attaquer",
        "Par où j'attaque le groupe SOCOTEC, faut-il viser le siège ou une filiale ?",
        "resolve_account_territory",
        ("Recommande QUEL PÉRIMÈTRE adresser",),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE, Objet.TERRITOIRE),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : aucune filiale/BU examinée ne doit JAMAIS se
        # résoudre en un groupe entier proposé faute de mieux.
        "quel-perimetre-sans-filiale-examinee",
        "On ne connaît encore rien de la structure de ce compte, quel périmètre viser ?",
        "resolve_account_territory",
        ("NE recommande JAMAIS le groupe entier par défaut",),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE, Objet.TERRITOIRE),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #2273 (LAU-FINAL-015, épopée #2959, LOT g10 26/09) — même défaut
    # d'intégration qu'à #2302 (vague 14) : un lot n'a de valeur que si le
    # modèle sait appeler ce qu'il livre.
    ToolScenario(
        "compte-qualifie-pour-prospecter",
        "Ce compte est-il qualifié pour qu'on le prospecte maintenant ?",
        "evaluate_account_qualification_filters",
        ("les 5 filtres de qualification commerciale",),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : un filtre sans preuve ne doit JAMAIS se resoudre en
        # un rejet silencieux (#2273.8) — il se NOMME « à vérifier ».
        "compte-qualifie-donnees-manquantes",
        "On n'a presque rien sur ce compte, peut-on quand même dire s'il est qualifié ?",
        "evaluate_account_qualification_filters",
        ("JAMAIS « rejeté »",),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        # #2721 — retour Loïc Inacio (call du 22/09/2026) : Laura n'avait aucun
        # outil de recherche web et EXPLIQUAIT la marche à suivre au lieu
        # d'exécuter, y compris pour trouver un interlocuteur (« Sopra ») —
        # exactement la question ci-dessous.
        "chercher-un-interlocuteur-sur-le-web-public",
        "Trouve-moi qui est le DSI de Sopra Steria en ce moment.",
        "web_search",
        ("résultats RÉELS", "jamais une marche à suivre"),
        ("query",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.CONTACT, Objet.COMPTE),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT, JamaisInventer.SOURCE),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # ── #2337 — le terrain de jeu multi-talents ───────────────────────────────
    ToolScenario(
        "construire-le-terrain-de-jeu-de-trois-consultants",
        "J'ai trois consultants disponibles, un expert GRC, un ingénieur IAM et un développeur .NET. "
        "Construis-moi le terrain de jeu.",
        "plan_talent_territory",
        ("UN seul angle, jamais plusieurs CV d'un coup", "un compte n'apparaît qu'une fois"),
        ("talents", "capacity"),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            objets=(Objet.CONSULTANT, Objet.COMPTE, Objet.TERRITOIRE),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT, JamaisInventer.PROBABILITE),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # ── #2392 — la clôture de fin de journée ─────────────────────────────────
    ToolScenario(
        "cloturer-ma-journee",
        "Fais-moi la clôture de ma journée : ce qui a avancé, ce qui reste, et par quoi je reprends demain.",
        "compile_day_closure",
        ("ne compte rien", "chaque tâche ouverte attend le choix"),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.PILOTER,
            objets=(Objet.COMPTE, Objet.CONTACT, Objet.MESSAGE),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT, JamaisInventer.CHIFFRE),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : un classement de comptes n'est jamais une chance de signer,
        # et ce qui n'a pas été évalué n'est ni « non » ni zéro.
        "terrain-de-jeu-sans-chance-de-signer",
        "Sur ce terrain de jeu, lequel de ces comptes a le plus de chances de signer ?",
        "plan_talent_territory",
        ("Ne présente jamais ces rangs comme une chance de signer", "n'est ni « non » ni zéro"),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            objets=(Objet.CONSULTANT, Objet.COMPTE),
            page="/chat",
            jamais_inventer=(JamaisInventer.PROBABILITE, JamaisInventer.CHIFFRE),
            action=Action.REFUS_AVEC_ALTERNATIVE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE (#2392.9, NO-GO) : « tout reporter » d'office est refusé —
        # chaque tâche restée ouverte se décide sur la carte.
        "ne-pas-tout-reporter-a-demain",
        "Reporte toutes mes tâches pas finies à demain, je verrai bien.",
        "compile_day_closure",
        ("ne décide à la place de personne", "n'a lieu qu'après la validation explicite"),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.PILOTER,
            objets=(Objet.COMPTE, Objet.CONTACT),
            page="/chat",
            jamais_inventer=(JamaisInventer.EXECUTION, JamaisInventer.AUTORISATION),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # ── #2338.8 — le dernier point ouvert de #2338 : ce qui manque avant qu'une
    # mission précise puisse démarrer, nommé un par un ────────────────────────
    ToolScenario(
        "ce-qui-manque-avant-que-la-mission-demarre",
        "Est-ce que la mission chez Onet peut démarrer ?",
        "get_mission_start_readiness",
        ("nomme chaque manque", "ne les confonds jamais"),
        meta=Meta(
            moment=Moment.DELIVERY,
            intention=Categorie.SUIVRE_UNE_MISSION,
            objets=(Objet.MISSION,),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT, JamaisInventer.ETAT_ACTUEL),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : `missing`/`reserves` vides veulent dire « rien ne
        # manque », jamais que la mission est inconnue — la description du
        # point le dit explicitement.
        "mission-sans-aucun-manque-nest-pas-une-mission-inconnue",
        "Il ne manque plus rien sur cette mission, elle est prête ?",
        "get_mission_start_readiness",
        ("jamais que la mission est inconnue", "ne l'empêchent pas mais se nomment quand même"),
        meta=Meta(
            moment=Moment.DELIVERY,
            intention=Categorie.SUIVRE_UNE_MISSION,
            objets=(Objet.MISSION,),
            page="/chat",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL, JamaisInventer.RESULTAT),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # ── Le résumé d'un plan de Laura (#1950.4 / .7 / .12 / .13) ─────────────
    ToolScenario(
        # Un plan à deux gestes dit son objectif, ce qu'il produit, ce qui
        # manque et ce qui ne se fera pas — sans durée ni probabilité.
        "un-plan-dit-son-objectif-et-ce-qui-ne-se-fera-pas",
        "Prépare un e-mail de relance pour Eric chez ACTIA et programme-moi un rappel dans trois jours.",
        "describe_plan",
        ("AU MOINS DEUX gestes", "ce qui ne pourra PAS être fait"),
        ("objective",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECIDER,
            objets=(Objet.CONTACT, Objet.MESSAGE),
            page="/chat",
            jamais_inventer=(JamaisInventer.DATE, JamaisInventer.PROBABILITE),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : rien de connu ne se remplace par « aucun » — une
        # liste vide s'omet, et aucune durée n'est jamais estimée.
        "un-plan-ne-devine-ni-duree-ni-manque",
        "Combien de temps va prendre ce plan ?",
        "describe_plan",
        ("Ne donne JAMAIS de durée ni de probabilité", "une liste vide s'omet"),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECIDER,
            objets=(Objet.MESSAGE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.DATE, JamaisInventer.CHAMP_NON_DIT),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # ── #2376 (LAU-FINAL-091) — le brief d'appel avant une prospection ───────
    ToolScenario(
        # Le texte d'ouverture reste un CADRE, pas un script à réciter — c'est
        # la règle que ce fragment protège (issue #2376 §OUVERTURE).
        "preparer-un-brief-dappel",
        "Prépare-moi l'appel avec Claire Dubois, je l'appelle dans dix minutes.",
        "prepare_cold_call",
        ("un script à réciter mot pour mot", "une case vide vaut mieux qu'un contexte générique"),
        ("contact_id", "reason", "objective", "opening_question", "next_questions", "objection", "fallback"),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.PREPARER_UN_RENDEZ_VOUS,
            objets=(Objet.CONTACT,),
            page="/chat",
            jamais_inventer=(JamaisInventer.EXECUTION, JamaisInventer.COUT),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : identité, entreprise et fonction sont LUES sur la
        # fiche, jamais écrites par le modèle — même garde que `enrich_contact`.
        "brief-dappel-ninvente-pas-lidentite",
        "Prépare l'appel pour un certain Marc, je crois qu'il est chez Decathlon.",
        "prepare_cold_call",
        ("N'invente jamais l'identité, l'entreprise ou la fonction",),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.PREPARER_UN_RENDEZ_VOUS,
            objets=(Objet.CONTACT,),
            page="/chat",
            jamais_inventer=(JamaisInventer.IDENTITE,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # ── Épopée #2853 (#2157.1) — créer une cible depuis Laura ────────────────
    ToolScenario(
        "creer-une-cible-depuis-laura",
        "Ajoute Renault à mes cibles, je veux la travailler cette semaine.",
        "create_target_list_from_account",
        ("seedée avec ce compte comme premier élément", "jamais une liste déjà créée"),
        ("account_id", "name"),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECIDER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : sans nom précisé, un nom générique se pose au clic —
        # jamais un nom de liste inventé par le modèle.
        "creer-une-cible-depuis-laura-sans-nom",
        "Crée-moi une cible avec ce compte.",
        "create_target_list_from_account",
        ("ne jamais l'inventer",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECIDER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # ── Épopée #2781 (#2150.30, LOT j1 26/09) — ajouter au portefeuille depuis Laura ──
    ToolScenario(
        # #2391 (24/09/2026) — un scénario positif écrit ce lot, aucun cas
        # limite pour l'instant (même motif que `propose_focus_plan`).
        "ajouter-au-portefeuille-depuis-laura",
        "Ajoute Renault à mon portefeuille, on vient d'en parler.",
        "add_account_to_portfolio",
        ("AJOUT au portefeuille", "Annonce donc une proposition, jamais un compte déjà ajouté"),
        ("company_name", "siren", "sector", "website"),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECIDER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    # ── #2319/#2985 (revue manager, 26/09) ───────────────────────────────────
    ToolScenario(
        # Un scénario positif écrit ce lot, aucun cas limite pour l'instant
        # (même motif que `get_confirmed_revenue`).
        "revue-manager-dun-compte",
        "Prépare-moi un point manager sur Thales avant mon rendez-vous de dix minutes.",
        "get_account_manager_review",
        ("Ce N'EST PAS un second dossier", "Lecture seule, scopée au portefeuille de l'utilisateur"),
        ("account_id",),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # ── #2320.24 (épopée #2967, 26/09) — lire la chaîne commerciale d'un besoin ──
    ToolScenario(
        # Un scénario positif écrit ce lot, aucun cas limite pour l'instant.
        "chronologie-des-statuts-dun-besoin",
        "Qui a fait passer le besoin DevOps chez Capgemini en qualifié, et depuis quand ?",
        "get_need_transition_history",
        ("son statut ACTUEL, plus l'historique COMPLET de ses transitions", "jamais devinés"),
        ("need_id",),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.ANALYSER,
            objets=(Objet.BESOIN,),
            page="/projects/needs",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # ── #2320.26/.27 (épopée #2967, 26/09) — proposer une transition de besoin ──
    ToolScenario(
        # Un scénario positif écrit ce lot, aucun cas limite pour l'instant.
        "proposer-une-transition-de-besoin",
        "Le besoin DevOps chez Capgemini est qualifié, passe-le en matching.",
        "propose_need_transition",
        ("l'outil n'écrit rien", "ne propose jamais une transition que tu sais déjà refusée"),
        ("need_id", "next_status", "reason"),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.DECIDER,
            objets=(Objet.BESOIN,),
            page="/projects/needs",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    # ── #1952.3 / #1952.7 (épopée #2844, lot P07 30/09) — lancer un travail long ──
    ToolScenario(
        # Un scénario positif écrit ce lot, aucun cas limite pour l'instant.
        "lancer-un-matching-massif-en-tache-de-fond",
        "Classe-moi le vivier contre tous mes besoins ouverts chez Capgemini, en tâche de fond.",
        "propose_long_job",
        ("l'outil ne lance rien", "ne prétends jamais qu'il est terminé"),
        ("job", "need_ids"),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.DECIDER,
            objets=(Objet.BESOIN,),
            page="/projects/needs",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    # ── #2339.1 (épopée #2795, LOT écrivain 27/09) — le journal unifié des quatre sujets ──
    ToolScenario(
        # Un scénario positif écrit ce lot, aucun cas limite pour l'instant.
        "journal-unifie-dun-besoin",
        "Résume-moi tout ce qui s'est passé sur le besoin DevOps chez Capgemini, dans l'ordre.",
        "get_need_journal",
        ("journal UNIFIÉ des quatre sujets", "enregistrée sur AUCUN des quatre sujets"),
        ("need_id",),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.ANALYSER,
            objets=(Objet.BESOIN,),
            page="/projects/needs",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # ── #2339.2 — le contrôle de handoff avant conversion besoin→mission ──
    ToolScenario(
        # Un scénario positif écrit ce lot, aucun cas limite pour l'instant.
        "controle-de-handoff-avant-conversion",
        "Le besoin DevOps chez Capgemini est-il prêt à devenir une mission ?",
        "get_need_mission_handoff_check",
        ("contrôle de handoff AVANT de lancer une conversion besoin→mission", "ne réponds jamais par"),
        ("need_id",),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.ANALYSER,
            objets=(Objet.BESOIN,),
            page="/projects/needs",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # ── #2339.3 — l'aperçu des champs d'un besoin, absents nommés ──
    ToolScenario(
        # Un scénario positif écrit ce lot, aucun cas limite pour l'instant.
        "apercu-des-champs-dun-besoin",
        "Qu'est-ce qu'on sait déjà sur le besoin DevOps chez Capgemini ?",
        "get_need_field_overview",
        ("L'aperçu des", "personne ne l'a dit, `non_suivi`"),
        ("need_id",),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.ANALYSER,
            objets=(Objet.BESOIN,),
            page="/projects/needs",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # ── #2339.5/.6 — les doublons probables d'un besoin, jamais fusionnés ──
    ToolScenario(
        # Un scénario positif écrit ce lot, aucun cas limite pour l'instant.
        "doublons-probables-dun-besoin",
        "Ce besoin de dev Java chez Capgemini existe-t-il déjà quelque part ?",
        "find_need_duplicates",
        ("Les doublons PROBABLES", "on ne fusionne JAMAIS deux besoins"),
        ("need_id",),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.ANALYSER,
            objets=(Objet.BESOIN,),
            page="/projects/needs",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # ── #2339.8 — la checklist de démarrage d'une mission, en items nommés ──
    ToolScenario(
        # Un scénario positif écrit ce lot, aucun cas limite pour l'instant.
        "checklist-de-demarrage-en-items",
        "Donne-moi la checklist de démarrage de la mission Thales, item par item.",
        "get_mission_start_checklist",
        ("La checklist de démarrage d'UNE mission, en ITEMS nommés", "pas douze"),
        ("mission_id",),
        meta=Meta(
            moment=Moment.DELIVERY,
            intention=Categorie.ANALYSER,
            objets=(Objet.MISSION,),
            page="/missions/$id",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # ── #2339.10 — le résumé d'un besoin ──
    ToolScenario(
        # Un scénario positif écrit ce lot, aucun cas limite pour l'instant.
        "resume-dun-besoin",
        "Résume-moi le besoin DevOps chez Capgemini en une phrase.",
        "get_need_summary",
        ("Le résumé d'UN besoin", "condensées en résumé"),
        ("need_id",),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.ANALYSER,
            objets=(Objet.BESOIN,),
            page="/projects/needs",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # ── #2339.11 — le résultat d'une conversion besoin→mission, preuves nommées ──
    ToolScenario(
        # Un scénario positif écrit ce lot, aucun cas limite pour l'instant.
        "resultat-de-conversion-dun-besoin",
        "La conversion du besoin DevOps chez Capgemini a donné quelle mission ?",
        "get_need_conversion_result",
        ("Le résultat d'une conversion besoin→mission déjà ARRIVÉE", "jamais devinées"),
        ("need_id",),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.ANALYSER,
            objets=(Objet.BESOIN, Objet.MISSION),
            page="/projects/needs",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # ── #2339.13 — l'état NO-GO d'un besoin ──
    ToolScenario(
        # Un scénario positif écrit ce lot, aucun cas limite pour l'instant.
        "etat-no-go-dun-besoin",
        "Il y a un problème de cohérence sur le besoin DevOps chez Capgemini avant que je continue ?",
        "get_need_no_go_state",
        ("L'état NO-GO d'UN besoin", "état VALIDE, jamais un silence"),
        ("need_id",),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.ANALYSER,
            objets=(Objet.BESOIN,),
            page="/projects/needs",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # ── #2987.56 — les notes de frais en attente de décision ──
    ToolScenario(
        "notes-de-frais-en-attente",
        "Il y a des notes de frais à valider en ce moment ?",
        "list_expense_reports_awaiting_decision",
        ("quelles notes de frais sont en attente",),
        meta=Meta(
            moment=Moment.DELIVERY,
            intention=Categorie.SUIVRE_UNE_MISSION,
            objets=(Objet.CONSULTANT,),
            page="/expenses",
            jamais_inventer=(JamaisInventer.PERIMETRE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : le pont n'a pas le droit de voir le montant — une
        # demande explicite du chiffre ne le fait jamais apparaître.
        "montant-des-notes-de-frais-refuse",
        "Donne-moi le montant des notes de frais en attente de validation.",
        "list_expense_reports_awaiting_decision",
        ("Ne rend JAMAIS le montant",),
        meta=Meta(
            moment=Moment.DELIVERY,
            intention=Categorie.SUIVRE_UNE_MISSION,
            objets=(Objet.CONSULTANT,),
            page="/expenses",
            jamais_inventer=(JamaisInventer.COUT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        "valider-une-note-de-frais",
        "Valide la note de frais de Julie chez Capgemini.",
        "propose_expense_report_decision",
        ("Annonce donc une proposition, jamais une note déjà décidée",),
        ("expense_report_id", "decision"),
        meta=Meta(
            moment=Moment.DELIVERY,
            intention=Categorie.DECIDER,
            objets=(Objet.CONSULTANT,),
            page="/expenses",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : un refus SANS motif ne se propose pas — le motif se
        # redemande, jamais inventé.
        "refuser-une-note-de-frais-sans-motif",
        "Refuse la note de frais de Julie.",
        "propose_expense_report_decision",
        ("Un refus EXIGE un motif", "ne l'invente jamais, redemande-le si l'utilisateur ne l'a pas donné"),
        ("reason",),
        meta=Meta(
            moment=Moment.DELIVERY,
            intention=Categorie.DECIDER,
            objets=(Objet.CONSULTANT,),
            page="/expenses",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.QUESTION,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #3209 (LAU-FINAL-215) — ajouté à l'intégration vague X2 (28/09) : le lot
    # n'avait posé aucune question pour son propre outil (GA-318/#1948, même
    # défaut que `resolve_account_territory` en #2302).
    ToolScenario(
        "prioriser-son-portefeuille-cette-semaine",
        "Sur quels comptes je me concentre cette semaine ?",
        "get_portfolio_priorities",
        (
            "Rend QUATRE catégories nommées — jamais un tri par score descendant",
            "Deux comptes du même groupe (filiales) sont déjà départagés en amont",
        ),
        (),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECIDER,
            objets=(Objet.COMPTE,),
            page="/accounts",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # #3210 (LAU-FINAL-216) — même défaut, ajouté à la même intégration.
    ToolScenario(
        "a-quoi-ressemble-ce-compte",
        "À quoi ressemble ce compte, par rapport à ce qu'on a déjà gagné ou perdu ?",
        "find_similar_cases",
        (
            "Rend jusqu'à trois cas passés du MÊME espace",
            "n'affirme JAMAIS qu'une stratégie va fonctionner parce qu'elle a marché une fois ailleurs",
        ),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.RESULTAT, JamaisInventer.PROBABILITE),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # #3211.9 (épopée #3234) — les actions échues sans résultat : Laura DEMANDE,
    # elle n'infère jamais un outcome.
    ToolScenario(
        "actions-echues-sans-resultat",
        "Quelles actions sont échues sans que je t'aie dit ce qu'elles ont donné ?",
        "list_actions_awaiting_outcome",
        (
            "Tu DEMANDES ce que chacune a donné",
            "tu ne l'inventes et ne le déduis JAMAIS",
        ),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.DECIDER,
            objets=(Objet.CONTACT, Objet.COMPTE),
            page="/actions",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # #3427 — le modèle approuvé de la bibliothèque : repris mot pour mot, choisi
    # par canal/scénario/persona, jamais réécrit.
    ToolScenario(
        "modele-approuve-bibliotheque",
        "Donne-moi le message approuvé pour une invitation LinkedIn acceptée par un décideur.",
        "select_message_template",
        (
            "à reprendre mot",
            "JAMAIS par ressemblance de mots",
        ),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.DECIDER,
            objets=(Objet.CONTACT,),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # #3422.20 — la checklist avant envoi : un message générique est nommé tel quel.
    ToolScenario(
        "verifier-un-message-avant-envoi",
        "Vérifie ce message avant que je l'envoie : « Bonjour, je me permets de vous contacter afin de vous présenter notre expertise Java. »",
        "check_message_before_send",
        (
            "tu ne dis JAMAIS « prêt à envoyer »",
            "qu'un contrôle non vérifiable est conforme",
        ),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.DECIDER,
            objets=(Objet.CONTACT,),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : la personne DIT le résultat — Laura ne l'écrit pas (elle
        # n'a aucun outil d'écriture ici), elle renvoie vers l'écran Actions.
        "je-te-dis-ce-que-ca-a-donne",
        "Delphine m'a répondu, le comité est reporté : note-le sur l'action.",
        "list_actions_awaiting_outcome",
        ("Tu n'écris rien",),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.DECIDER,
            objets=(Objet.CONTACT, Objet.COMPTE),
            page="/actions",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #3214/#220 (LAU-FINAL-220) — même défaut, ajouté à la même intégration.
    ToolScenario(
        "comparer-deux-chemins-hypothetiques",
        "Et si j'approchais ce compte via une ESN partenaire plutôt qu'en direct, lequel tester en premier ?",
        "compare_scenarios",
        (
            "Compare au moins deux chemins commerciaux HYPOTHÉTIQUES pour le même compte ou la même situation",
            "N'invente JAMAIS un chiffre de ROI ni une probabilité de closing",
        ),
        ("scenarios", "most_informative_scenario"),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.DECIDER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.CHIFFRE, JamaisInventer.PROBABILITE),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # #3262.23 (épopée #3284, lot P05 29/09) — même défaut, un lot qui n'avait
    # posé aucune question pour son propre outil (GA-318/#1948).
    ToolScenario(
        "ce-compte-traine-t-il-en-focus",
        "Depuis combien de temps je travaille ce compte, et est-ce que je devrais le sortir du Focus ?",
        "get_focus_review",
        (
            "la question ne se pose pas",
            "ne cite jamais un compteur d'actions ou de relances",
        ),
        ("account_id",),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.CHIFFRE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # #3345.2 (LAU-FINAL-255, recette prod 30/09) — Louis observait Laura
    # reproposer une piste déjà écartée par l'écran Opportunités : le nouvel
    # outil `get_qualification_lead_decisions` ferme ce trou en lecture.
    ToolScenario(
        "pistes-deja-tranchees-dun-compte",
        "Avant que je te propose une piste sur ce compte, il y en a déjà d'écartées ou reportées ?",
        "get_qualification_lead_decisions",
        ("AVANT de nommer une piste à qualifier", "ne jamais reproposer une piste"),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # #3345.2 (LAU-FINAL-255, lot Z05 02/10) — la moitié ÉCRITURE : une piste
    # reconnue périmée ou non prouvée se PROPOSE à l'écartement (le clic écrit).
    ToolScenario(
        "ecarter-une-piste-reconnue-perimee",
        "Cette piste est périmée, retire-la de ma liste de pistes à qualifier.",
        "propose_qualification_lead_decision",
        ("Annonce une proposition, jamais une piste déjà écartée", "Rien n'est supprimé"),
        ("account_id", "lead_key", "decision"),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.DECIDER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : un écartement sans motif ne se propose pas — le motif
        # se redemande, jamais inventé.
        "ecarter-une-piste-sans-dire-pourquoi",
        "Écarte cette piste.",
        "propose_qualification_lead_decision",
        ("Un écartement EXIGE un motif", "redemande-le. Un report EXIGE une échéance future"),
        ("reason",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.DECIDER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.QUESTION,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #2434.56 (épopée #3579) — l'enrichissement EN MASSE, coût total annoncé avant le clic.
    ToolScenario(
        "enrichir-plusieurs-contacts-dun-coup",
        "Enrichis ces cinq contacts d'un coup, je veux leurs emails.",
        "propose_bulk_enrichment",
        ("PLUSIEURS contacts du portefeuille d'un coup", "Aucun chiffre d'usage pour le lot"),
        ("contact_ids",),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.CONTACT, Objet.CREDIT),
            page="/contacts",
            jamais_inventer=(JamaisInventer.COUT, JamaisInventer.EXECUTION),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : un lot trop gros pour être relu ne se propose pas, il se découpe.
        "enrichir-quarante-contacts-dun-coup",
        "Enrichis tous mes quarante contacts d'un coup.",
        "propose_bulk_enrichment",
        ("Au-delà de 10 contacts, demande de découper",),
        ("contact_ids",),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.CONTACT, Objet.CREDIT),
            page="/contacts",
            jamais_inventer=(JamaisInventer.COUT,),
            action=Action.QUESTION,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #3816.1 (lot C4, 07/10) — du profil aux comptes, dans le fil, même en espace neuf.
    ToolScenario(
        "trouve-moi-des-missions-pour-ce-profil",
        "Trouve-moi des missions pour ce profil : Marie Dupont.",
        "find_accounts_for_talent",
        ("il cherche hors portefeuille", "sans redemander le profil", "Tu prépares, le commercial envoie"),
        ("consultant",),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            objets=(Objet.CONSULTANT, Objet.COMPTE),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : deux Marie Dupont dans le vivier — Laura ne choisit pas.
        "missions-pour-un-profil-homonyme",
        "Où placer Marie Dupont ?",
        "find_accounts_for_talent",
        ("ne choisis JAMAIS à sa place", "ni « 0 » ni « marché vide »"),
        ("consultant",),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            objets=(Objet.CONSULTANT,),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.QUESTION,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #4421.5 (Louis 21/10, régression de #3816) — un consultant SÉLECTIONNÉ et « trouve-moi des missions » :
    # Laura appelle l'outil sans poser de question (c124), et la suite est le mail préparé, jamais envoyé.
    ToolScenario(
        "consultant-selectionne-trouve-moi-des-missions",
        "Consultant sélectionné : Hugo Houyez. Trouve-moi des missions.",
        "find_accounts_for_talent",
        ("sans poser de question", "lit seul sa fiche et son CV", "prepare_message_for_contact pour chaque recruteur"),
        ("consultant",),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            objets=(Objet.CONSULTANT, Objet.COMPTE, Objet.CONTACT),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # #4421.10 / #4421.11 (mesure prod 24/10) — « trouve moi une mission à Lille pour ce profil » + CV formateur IA :
    # ses compétences et la zone DITE vont à l'outil, toute offre (freelance, CDI, recrutement) compte, et la collecte
    # fraîche part seule quand le cache ne tient pas le volume.
    ToolScenario(
        "cv-joint-trouve-moi-une-mission-a-lille",
        "Trouve moi une mission à Lille pour ce profil. (CV joint : formateur IA, Microsoft 365 Copilot)",
        "find_accounts_for_talent",
        ("TOUTE offre datée qui cite sa compétence", "lance SEUL la collecte", "sans poser de question"),
        ("skills", "zones"),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            objets=(Objet.CONSULTANT, Objet.COMPTE, Objet.CONTACT),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # #4421.10 (Louis, QCM 24/10 : « Chercher dans le même tour ») — mission à Lille + CV, un compte HORS espace :
    # ses personnes arrivent dans le même tour, à vérifier, avec un mail préparé ; sinon le repli se DIT.
    ToolScenario(
        "mission-a-lille-cv-compte-hors-espace-contacts-meme-tour",
        "Trouve moi une mission à Lille pour ce profil. (CV joint ; le premier compte proposé n'est pas dans l'espace)",
        "find_accounts_for_talent",
        ("personnes trouvées DANS CE TOUR", "jamais « aucun contact » muet"),
        ("skills", "zones"),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            objets=(Objet.CONSULTANT, Objet.COMPTE, Objet.CONTACT),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # #4421.11 / #4421.12 — son cas limite : une fiche SANS aucune compétence, la seule question (une, pas plus).
    ToolScenario(
        "fiche-sans-competence-une-seule-question",
        "Consultant sélectionné : Paul Martin (fiche sans compétence, sans CV). Trouve-moi des missions.",
        "find_accounts_for_talent",
        ("UNE question à choix, celle de `clarification`", "dis `message` tel quel"),
        ("consultant",),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            objets=(Objet.CONSULTANT,),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #3865.2 (lot X05, 08/10) — du profil aux besoins déjà OUVERTS, distinct du marché
    # inversé par compte (#3816.1) juste au-dessus.
    ToolScenario(
        "quels-besoins-compatibles-avec-ce-consultant",
        "Quels besoins compatibles avec ce consultant : Marie Dupont ?",
        "find_needs_for_talent",
        ("où le positionner sur un besoin ouvert", "AUCUNE mission ouverte par entreprise"),
        ("consultant",),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            objets=(Objet.CONSULTANT, Objet.BESOIN),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT, JamaisInventer.PROBABILITE),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : aucun besoin ouvert dans l'espace — un fait, pas une panne.
        # #4421.2 — et plus une fin : le marché s'enchaîne dans le même tour (c124, renverse #3865.2).
        "besoins-compatibles-aucun-besoin-ouvert",
        "Des besoins pour ce consultant : Marie Dupont ?",
        "find_needs_for_talent",
        ("Sans besoin ouvert dans l'espace", "ce n'est pas une erreur ni une fin", "DANS LE MÊME TOUR"),
        ("consultant",),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            objets=(Objet.CONSULTANT,),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #4759 (épopée #4762, 29/10) — l'historique DATÉ des besoins d'un compte, distinct de `find_needs`
    # (besoins enregistrés) : « ses anciens besoins », « a-t-il déjà eu un besoin chez ce client ».
    ToolScenario(
        "anciens-besoins-java-a-lille-sur-ce-compte",
        "Trouve-moi les besoins Java sur Lille chez ACME, et ses anciens besoins en général.",
        "get_account_needs_history",
        ("L'HISTORIQUE des besoins (offres d'emploi) d'un compte", "cite-le tel quel, ne soustrais jamais deux dates"),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.TROUVER_UN_BESOIN,
            objets=(Objet.COMPTE, Objet.BESOIN),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.RESULTAT, JamaisInventer.DATE),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : un compte SANS aucun besoin passé — « aucun enregistré », jamais « non vérifié »,
        # jamais un besoin inventé.
        "compte-sans-aucun-besoin-passe",
        "A-t-il déjà eu un besoin chez ce client ?",
        "get_account_needs_history",
        ("« aucun besoin trouvé avec ces filtres »", "une offre sans date n'a pas d'âge"),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.TROUVER_UN_BESOIN,
            objets=(Objet.COMPTE, Objet.BESOIN),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.RESULTAT, JamaisInventer.ETAT_ACTUEL),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #3889 (épopée #3977, 11/10) — les projets d'un compte décrits dans les DOCUMENTS de l'espace,
    # jamais confondus avec les besoins enregistrés (`find_needs`).
    ToolScenario(
        "quels-projets-dans-nos-documents-sur-ce-compte",
        "Quels projets on a sur ACME dans nos documents ? Anciens besoins, missions, tout.",
        "search_document_projects",
        ("dans les DOCUMENTS de l'espace", "rangés en besoins ouverts"),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.TROUVER_UN_BESOIN,
            objets=(Objet.COMPTE, Objet.DOCUMENT, Objet.BESOIN, Objet.MISSION),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT, JamaisInventer.DATE, JamaisInventer.SOURCE),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : un besoin que le document ne date pas n'est ni ouvert ni ancien.
        "projet-documentaire-sans-date-ni-statut",
        "Ce besoin SAP chez ACME dans le compte rendu, il est encore ouvert ?",
        "search_document_projects",
        ("« non daté », « daté, statut non dit », « ambigu »", "ne le présente JAMAIS comme ouvert"),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.TROUVER_UN_BESOIN,
            objets=(Objet.COMPTE, Objet.DOCUMENT, Objet.BESOIN),
            page="/chat",
            jamais_inventer=(JamaisInventer.DATE, JamaisInventer.ETAT_ACTUEL),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #3219 (#190.2 côté contact, décision Louis 11/10) — le contrôle AVANT une action sur UN contact :
    # ce qui diffère selon la source ou le périmètre, sans jamais trancher à la place du commercial.
    ToolScenario(
        "avant-d-exporter-ce-contact-quelque-chose-cloche",
        "Avant que j'exporte ce contact vers le CRM, il y a quelque chose qui ne colle pas sur sa fiche ?",
        "get_contact_preflight",
        ("Contrôle AVANT une action sur UN contact", "TRANCHES JAMAIS à la place du commercial"),
        ("contact_id",),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.CORRIGER_UNE_DONNEE,
            objets=(Objet.CONTACT, Objet.COMPTE),
            page="/contacts/$id",
            jamais_inventer=(JamaisInventer.RESULTAT, JamaisInventer.SOURCE, JamaisInventer.ETAT_ACTUEL),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : deux sources disent deux postes, chacune dans sa portée — ce n'est pas à trancher.
        "deux-postes-selon-la-source-chacun-dans-sa-portee",
        "Une source dit DSI groupe, l'autre DSI de la filiale : c'est laquelle la bonne avant que je lui écrive ?",
        "get_contact_preflight",
        ("deux vérités, pas un désaccord", "quoi que dise la source"),
        ("contact_id",),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.GENERER_UN_MESSAGE,
            objets=(Objet.CONTACT,),
            page="/contacts/$id",
            jamais_inventer=(JamaisInventer.SOURCE, JamaisInventer.IDENTITE),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #3278.3 (#3259.7, lot P10 30/09) — « quel canal répond le mieux chez
    # nous ? » : les presets de canal de la méthode cèdent devant le mesuré.
    ToolScenario(
        "quel-canal-repond-le-mieux-chez-nous",
        "Quel canal répond le mieux chez nous — appel, e-mail ou réseau social ?",
        "get_channel_performance",
        ("Sous dix envois", "Une liste vide veut dire que rien n'est mesuré"),
        (),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.ANALYSER,
            objets=(Objet.ESPACE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.CHIFFRE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # P05.b (#3246, lot 09/10) — le CAS LIMITE des cas similaires : la base
    # commune sous le seuil ne dit rien, et ne porte jamais un motif de perte.
    ToolScenario(
        "cas-similaires-sans-donnees-communes",
        "Et dans les autres ESN, ce genre de compte se gagne ou se perd ?",
        "find_similar_cases",
        ("pas assez de cas communs pour en parler, jamais « zéro cas »", "aucun motif de perte : n'en invente pas"),
        ("account_id",),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # P05.a (#3246, lot 09/10) — « ce qui marche ailleurs », la base anonyme
    # commune À CÔTÉ de « chez nous », jamais un nom, jamais une probabilité.
    ToolScenario(
        "quelle-cadence-marche-ailleurs",
        "Quelle cadence de relance marche le mieux chez nous, et chez les autres, pour un compte comme BNP ?",
        "get_channel_performance",
        ("`elsewhere` porte CE QUI MARCHE AILLEURS", "Ne nomme jamais un autre espace"),
        ("by", "account_id"),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.ANALYSER,
            objets=(Objet.ESPACE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.CHIFFRE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : sous trois espaces contributeurs, la base commune ne
        # dit RIEN — jamais un zéro, jamais « personne ne réussit ailleurs ».
        "pas-assez-de-donnees-communes",
        "Et ailleurs, la route partenaire marche ?",
        "get_channel_performance",
        ("dis « pas assez de données communes », jamais zéro",),
        ("by",),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.ANALYSER,
            objets=(Objet.ESPACE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.CHIFFRE,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #3919 (lot Y10, 08/10) — « qu'est-ce qui bouge chez ce compte ? », la
    # MÊME Veille que le portefeuille, jamais un lien inventé.
    ToolScenario(
        "qu-est-ce-qui-bouge-chez-ce-compte",
        "Qu'est-ce qui bouge chez Thales ces derniers temps ?",
        "get_account_signals",
        # #3922.6 (lot K01) — le signal porte désormais son lien vérifiable ;
        # la règle tenue reste « jamais un lien inventé ».
        ("ne JAMAIS inventer un lien ni proposer une recherche à la place",),
        ("account_id",),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : un compte TROUVÉ mais sans signal actif n'est jamais
        # confondu avec un compte introuvable.
        "compte-sans-signal-actif",
        "Il y a des signaux récents chez Doctolib ?",
        "get_account_signals",
        ("ne réponds jamais comme si la liste vide valait une réponse",),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #3970 (lot P07, 09/10) — « qui a été recruté chez X ? » : la même lecture que
    # la section « Recrutements récents » de la veille, avec sa raison NOMMÉE.
    ToolScenario(
        "qui-a-ete-recrute-chez-ce-compte",
        "Qui a été recruté chez Thales ces derniers mois, et est-ce que ça colle à ce qu'on vend ?",
        "get_account_signals",
        ("cite cette raison, jamais un pourcentage",),
        ("account_id",),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : un parcours sans date ne devient jamais un « recrutement récent »,
        # et « non mesuré » n'est jamais « personne n'a été recruté ».
        "recrutement-sans-date-n-est-pas-recent",
        "Doctolib a recruté quelqu'un récemment ?",
        "get_account_signals",
        ("ne présente jamais comme récent une arrivée non datée",),
        meta=Meta(
            moment=Moment.PILOTAGE,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #3903 (lot Y10, 08/10) — le bilan de relance sur une fenêtre, jamais un
    # second moteur, jamais un corps de message.
    ToolScenario(
        "chez-qui-relancer-sur-90-jours",
        "Sur les 90 derniers jours, chez qui puis-je relancer pour faire du business ?",
        "get_reengagement_report",
        ("ne laisse jamais deviner la période couverte",),
        ("since_date", "window_days"),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : une mailbox jamais connectée et une boîte connectée
        # mais silencieuse ne doivent jamais se lire pareil sans le dire.
        "canal-non-observe-dans-le-bilan",
        "Il n'y a personne à relancer par e-mail ce trimestre ?",
        "get_reengagement_report",
        ("se lisent PAREIL ici",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # LOT (15/10) DATA-B — Laura lit ce qu'on a déjà : faits publics du cache commun, firmographie, organigramme.
    ToolScenario(
        "que-sait-on-de-public-sur-cette-entreprise",
        "Qu'est-ce qu'on sait de public sur cette entreprise : elle recrute, il y a un appel d'offres ?",
        "get_company_public_facts",
        ("INCONNU, jamais",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        "faits-publics-jamais-collectes-ne-valent-pas-aucun",
        "Il n'y a aucun appel d'offres chez eux, c'est bien ça ?",
        "get_company_public_facts",
        ("jamais collecté ou périmé",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.APPEL_D_OFFRES,),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #4055.4/.6 (17/10) — « complète ce compte » et le niveau « secteurs » du portefeuille.
    ToolScenario(
        "complete-ce-compte-ce-qui-manque",
        "Complète ce compte : qu'est-ce qui lui manque ?",
        "complete_account",
        ("une inconnue, jamais « manque »",),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        "quels-secteurs-couvre-mon-portefeuille",
        "Quels secteurs couvre mon portefeuille, combien de comptes dans chacun ?",
        "get_portfolio_sectors",
        ("`without_sector`", "jamais le total"),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.CHIFFRE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    # #4055.10 (18/10) — « ignore Marc Durand » : l'écart d'une personne proposée est retenu pour elle seule.
    ToolScenario(
        "ignore-cette-personne-proposee",
        "Pas celui-là, ignore Marc Durand sur ce compte.",
        "dismiss_completion_person",
        ("plus reproposée sur ce compte",),
        ("account_id", "full_name"),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE, Objet.CONTACT),
            page="/chat",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            # Classé PROPOSITION par défaut (hors READ_ONLY_TOOLS : il écrit un écart) — la garde de
            # permission n'a pas de rang « écriture à geste explicite » ; question ouverte au rapport.
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        "personne-ajoutee-n-est-pas-ecartee",
        "J'ai ajouté Marc Durand à la main, garde-le.",
        "dismiss_completion_person",
        ("n'a pas besoin de cet outil",),
        ("account_id", "full_name"),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE, Objet.CONTACT),
            page="/chat",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        "collecte-proposee-n-est-pas-lancee",
        "Lance toutes les collectes qui manquent sur ce compte.",
        "complete_account",
        ("`launched: false`",),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        "portefeuille-partiel-n-est-pas-le-total",
        "Donne-moi le nombre exact de comptes dans la banque.",
        "get_portfolio_sectors",
        ("`complete: false`",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.CHIFFRE,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        "quelle-taille-et-quelle-stack-chez-ce-compte",
        "Quelle taille fait ce compte, a-t-il levé des fonds, et quelle stack utilise-t-il ?",
        "get_account_firmographics",
        ("jamais par « 0 »",),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.CHIFFRE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        "croissance-non-donnee-n-est-pas-calculee",
        "Quelle est sa croissance d'effectif sur un an ?",
        "get_account_firmographics",
        ("ne se calcule pas",),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.CHIFFRE,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        "qui-decide-chez-ce-compte",
        "Qui décide chez ce compte et par qui entrer ?",
        "get_account_org_chart",
        ("supposés",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        "organigramme-absent-n-est-pas-dessine",
        "Dessine-moi l'organigramme de ce compte, même sans l'avoir enrichi.",
        "get_account_org_chart",
        ("n'en dessine jamais un",),
        ("account_id",),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #3895 (lot LAURA-B, 12/10) — les notes d'un compte et leur portée de groupe : lecture seule.
    ToolScenario(
        "note-achats-d-un-compte",
        "Y a-t-il une note achats sur ce compte, et vaut-elle aussi pour les autres entités du groupe ?",
        "get_account_notes",
        ("ne la généralise JAMAIS",),
        ("account_id",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : un délai noté n'est jamais une garantie, une note d'un autre compte ne vaut pas ici.
        "delai-note-n-est-pas-une-garantie",
        "La note dit six semaines pour l'accès : on peut démarrer dans six semaines, c'est garanti ?",
        "get_account_notes",
        ("durée déclarée",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #4759 (29/10) — l'historique des besoins d'un compte, par pages : l'agrégat du contexte ne suffit pas à citer.
    ToolScenario(
        "qu-est-ce-qu-ils-cherchaient-en-novembre",
        "Chez ce compte, qu'est-ce qu'ils cherchaient en novembre dernier côté Java ?",
        "get_account_needs_history",
        ("ageLabel",),
        ("account_id",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : aucune ligne avec ces filtres n'est pas « ils ne recrutent pas ».
        "aucun-besoin-trouve-n-est-pas-aucun-recrutement",
        "Cherche leurs besoins COBOL passés : s'il n'y en a pas, ils ne recrutent pas, c'est ça ?",
        "get_account_needs_history",
        ("jamais « ils ne recrutent pas »",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #3904.1 (lot M05, 09/10) — le plan d'actions par geste : il COMPOSE le
    # bilan de relance, jamais un second moteur.
    ToolScenario(
        "mon-plan-d-actions-de-la-semaine",
        "Fais-moi mon plan d'actions : qui je relance, qui j'appelle cette semaine ?",
        "get_action_plan",
        # #3904 — décision Louis 09/10 : « appeler » couvre aussi deux e-mails
        # sortants consécutifs sans réponse.
        (
            "n'appelle pas get_reengagement_report en plus",
            "le commercial fait chaque geste",
            "deux e-mails sortants consécutifs",
        ),
        ("since_date", "window_days"),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECIDER,
            objets=(Objet.COMPTE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.CHAMP_NON_DIT,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : « lequel est proche de signer ? » — #3904, décision
        # Louis 09/10 : un STADE (proposition ou négociation), jamais un
        # pourcentage ; un CRM non lu se NOMME, jamais « rien dans ton CRM ».
        "quel-compte-est-proche-de-signer",
        "Lequel de mes comptes est à deux doigts de signer ?",
        "get_action_plan",
        (
            "ne classe JAMAIS un compte « proche de signer » toi-même",
            "jamais un pourcentage ni une probabilité",
            "rien de proche de signer dans ton CRM",
        ),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECIDER,
            objets=(Objet.COMPTE,),
            page="/chat",
            jamais_inventer=(JamaisInventer.PROBABILITE,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    # #3869.a (lot M05, 09/10) — la recherche ACTIVE de nouvelles personnes sur
    # un rôle non pourvu : Laura PROPOSE, le clic lance et débite.
    ToolScenario(
        "trouve-moi-le-responsable-achats-absent",
        "Trouve-moi le responsable achats chez SNCF, on n'a personne sur ce rôle.",
        "propose_people_search",
        ("des personnes que l'espace ne connaît pas encore", "des contacts À VÉRIFIER"),
        ("account_id", "roles"),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.CONTACT,),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : une carte de rôles n'est pas une liste de contacts
        # trouvés — un rôle vacant ne se remplit jamais d'un nom inventé.
        "une-liste-de-roles-n-est-pas-une-liste-de-contacts",
        "Donne-moi les noms du responsable data, achats et production chez ce compte.",
        "propose_people_search",
        ("un rôle n'est jamais compté comme un contact trouvé", "tu n'inventes JAMAIS un nom"),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.TROUVER_UN_CONTACT,
            objets=(Objet.CONTACT,),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    ToolScenario(
        # #4792 — « ce qu'on a » se lit dans notre base, jamais chez le marché :
        # le total se dit, puis des lignes, chacune avec sa date de collecte.
        "ce-que-notre-base-porte-deja",
        "Quels besoins Java sur Lille avons-nous déjà ?",
        "search_our_base",
        ("la question porte sur CE QU'ON A, pas sur le marché", "dis le total, puis cite des lignes"),
        ("terms", "city"),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.TROUVER_UN_BESOIN,
            objets=(Objet.BESOIN, Objet.CONSULTANT, Objet.COMPTE),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT, JamaisInventer.DATE),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    ToolScenario(
        # Le CAS LIMITE : le total dépasse les lignes montrées — Laura dit qu'il en reste, jamais « voilà tout ».
        "notre-base-en-porte-plus-que-la-page",
        "Liste-moi TOUS nos consultants Java, d'un coup.",
        "search_our_base",
        ("ne prétends jamais avoir tout listé",),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.TROUVER_UN_BESOIN,
            objets=(Objet.CONSULTANT,),
            page="/chat",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
)


# ── Les 13 questions de conduite ──────────────────────────────────────────────

PROMPT_SCENARIOS: tuple[PromptScenario, ...] = (
    PromptScenario(
        "par-ou-je-commence",
        "Par où je commence cette semaine ?",
        "_BLOCK_PRIORITISATION",
        (
            "TROIS COMPTES AU PLUS",
            "POURQUOI MAINTENANT — le fait DATÉ qui crée l'urgence",
            "tu ne chiffres aucune chance de signer",
        ),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECIDER,
            objets=(Objet.COMPTE,),
            page="/accounts",
            jamais_inventer=(JamaisInventer.PROBABILITE,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            situations=(Recette1945.PRIORISER_LES_COMPTES,),
        ),
    ),
    PromptScenario(
        # Le potentiel structurel ne fabrique pas une urgence : sans cette
        # règle, la mémoire marché promeut des comptes que rien n'a bougés.
        "beaucoup-dobservations-donc-jappelle",
        "Ce compte a plein d'observations marché, je l'appelle aujourd'hui ?",
        "_BLOCK_PRIORITISATION",
        ("LE POTENTIEL N'EST PAS L'URGENCE", "Vérifier ce compte maintenant"),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECIDER,
            objets=(Objet.COMPTE, Objet.OBSERVATION_MARCHE),
            page="/accounts",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    PromptScenario(
        # UNE CORRECTION HUMAINE GAGNE — et Laura ne corrige pas à la place de
        # la personne : c'est son clic qui change la mémoire partagée.
        "je-corrige-une-observation",
        "ALTEN n'est plus chez eux, arrête de me le sortir.",
        "_BLOCK_MARKET_ANSWER",
        (
            "tu ne traiteras plus cette observation comme un état actuel",
            "c'est son clic, pas ta phrase",
            "elle prime sur l'observation dans tes réponses suivantes",
        ),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.CORRIGER_UNE_DONNEE,
            objets=(Objet.OBSERVATION_MARCHE, Objet.COMPTE),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.ECRAN_PREREMPLI,
            nature=Nature.POSITIF,
            situations=(Recette1945.DONNEE_FAUSSE, Recette1945.CORRECTION_PERSISTANTE),
        ),
    ),
    PromptScenario(
        "la-memoire-contredit-le-rendez-vous",
        "La mémoire marché dit qu'ils externalisent, mais le DSI m'a dit l'inverse en rendez-vous.",
        "_BLOCK_MARKET_MEMORY",
        ("Une source de niveau supérieur DOMINE TOUJOURS", "tu retiens le rendez-vous, pas la mémoire"),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.CORRIGER_UNE_DONNEE,
            secondaires=(Categorie.ANALYSER,),
            objets=(Objet.OBSERVATION_MARCHE, Objet.RENDEZ_VOUS),
            page="/accounts/marches",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
            situations=(Recette1945.OBSERVATION_HISTORIQUE,),
        ),
    ),
    PromptScenario(
        # Une absence d'observation n'est JAMAIS un « non » : c'est le même
        # invariant que « non mesuré n'est pas 0 », appliqué au marché.
        "est-ce-quils-externalisent",
        "Est-ce qu'ils externalisent ?",
        "_BLOCK_MARKET_MEMORY",
        ("Je n'ai pas suffisamment d'observations", "une observation qui manque n'est pas un fait négatif"),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.OBSERVATION_MARCHE, Objet.COMPTE),
            page="/accounts/marches",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
            situations=(Recette1945.AUCUN_RESULTAT,),
        ),
    ),
    PromptScenario(
        "sur-quel-bouton-je-clique",
        "Sur quel bouton je clique pour lancer une analyse ?",
        "_BLOCK_TOOLS",
        ("Tu ne nommes JAMAIS un bouton", "Une affordance que tu inventes"),
        meta=Meta(
            moment=Moment.PREMIERS_PAS,
            intention=Categorie.COMPRENDRE_UNE_PAGE,
            secondaires=(Categorie.DEMANDER_DE_L_AIDE,),
            objets=(Objet.ECRAN,),
            page="/accounts",
            jamais_inventer=(JamaisInventer.INTERFACE,),
            action=Action.ECRAN_PREREMPLI,
            nature=Nature.CAS_LIMITE,
            situations=(Recette1945.BONNE_REDIRECTION,),
        ),
    ),
    PromptScenario(
        # #1863.1 — une réponse qui se termine par un point final laisse la
        # personne devant la même question qu'avant. Ce qui la fait avancer,
        # c'est l'arbitrage suivant, ou le trou qui changerait la reco.
        "finir-par-une-question-qui-fait-avancer",
        "Comment j'aborde ce compte ?",
        "_BLOCK_CLOSING_QUESTION",
        (
            "TERMINER PAR UNE QUESTION QUI FAIT AVANCER",
            "l'information manquante qui changerait ta recommandation",
        ),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.DECIDER,
            objets=(Objet.COMPTE,),
            page="/chat",
            jamais_inventer=(),
            action=Action.QUESTION,
            nature=Nature.POSITIF,
        ),
    ),
    PromptScenario(
        # #1863.1, l'autre moitié — sans les cas d'exception écrits, la règle
        # se retourne en tic : « veux-tu autre chose ? » à chaque tour.
        "pas-de-question-de-politesse-sur-un-fait",
        "C'est quoi le SIREN de SOCOTEC ?",
        "_BLOCK_CLOSING_QUESTION",
        (
            "de la politesse, pas du travail",
            "un point final assumé vaut mieux qu'une question de remplissage",
        ),
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    PromptScenario(
        # #1863.2 — « c'est trop succinct ». L'apprentissage était la SEULE des
        # six intentions de `_BLOCK_IDENTITY` sans forme dans `_BLOCK_FORMAT`.
        "je-ne-connais-rien-a-bellum",
        "Je viens d'arriver, je ne connais rien à Bellum — par où je commence ?",
        "_BLOCK_DISCOVERY",
        ("CE QUE BELLUM FAIT", "CE QUE ÇA CHANGE POUR LUI", "jamais un inventaire d'écrans"),
        meta=Meta(
            moment=Moment.PREMIERS_PAS,
            intention=Categorie.DEMANDER_DE_L_AIDE,
            objets=(Objet.ESPACE, Objet.CREDIT),
            page="/chat",
            jamais_inventer=(JamaisInventer.CAPACITE, JamaisInventer.INTERFACE),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            # « Je viens d'arriver » : la cinquième famille de #1920, dérivée de
            # l'ancienneté, pas d'un rôle.
            personas=frozenset({Famille.NOUVEL_ARRIVANT}),
            situations=(Recette1945.PREMIERE_UTILISATION,),
        ),
    ),
    PromptScenario(
        # #1793 — « lui poser de gros pavés de notre contexte ». Le mécanisme
        # existait (`pin_memory_fact`) ; ce qui manquait, c'est que Laura le
        # PROPOSE quand on lui donne du durable, au lieu de s'en servir une fois
        # et de l'oublier au tour suivant.
        "je-te-colle-mon-contexte",
        "Voilà tout ce qu'il faut savoir sur nous : on fait de l'infra et du cloud, "
        "on vend surtout à des DSI de banques, et on ne prend pas de mission sous 450 € par jour.",
        "_BLOCK_DURABLE_CONTEXT",
        (
            "ce qui serait encore vrai au prochain compte",
            "une mémoire encombrée de détails périmés",
        ),
        meta=Meta(
            moment=Moment.PREMIERS_PAS,
            intention=Categorie.CORRIGER_UNE_DONNEE,
            objets=(Objet.MEMOIRE,),
            page="/settings/memory",
            jamais_inventer=(JamaisInventer.EXECUTION,),
            action=Action.CARTE_A_VALIDER,
            nature=Nature.POSITIF,
        ),
    ),
    PromptScenario(
        # #1820 — « si Laura se rend compte qu'elle manque de contexte pour
        # aider le user, alors elle peut lui conseiller de faire ça ». La
        # question est POSABLE et la réponse serait creuse : l'espace ne porte
        # rien. Ce n'est pas une précision qui manque, c'est de la matière.
        "tu-nas-pas-de-quoi-maider",
        "Rédige-moi un mail pour relancer mes comptes dormants.",
        "_BLOCK_DURABLE_CONTEXT",
        (
            "le geste qui le comble",
            "c'est de la MATIÈRE qui manque dans l'espace",
        ),
        meta=Meta(
            moment=Moment.PREMIERS_PAS,
            intention=Categorie.GENERER_UN_MESSAGE,
            objets=(Objet.MESSAGE, Objet.COMPTE),
            page="/settings/import",
            jamais_inventer=(JamaisInventer.RESULTAT,),
            action=Action.ECRAN_PREREMPLI,
            nature=Nature.CAS_LIMITE,
            situations=(Recette1945.PROFIL_INCOMPLET,),
        ),
    ),
    PromptScenario(
        # 1945.17 — le tutoiement dans l'application ne dit rien du destinataire
        # d'un message : c'est lui, et l'historique, qui décident du registre.
        "vouvoyer-un-destinataire-externe",
        "Écris au DSI de SOCOTEC, on ne se connaît pas encore.",
        "_BLOCK_IDENTITY",
        ("vouvoiement/tutoiement des messages EXTERNES",),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.GENERER_UN_MESSAGE,
            objets=(Objet.MESSAGE, Objet.CONTACT),
            page="/contacts/$id",
            jamais_inventer=(),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            situations=(Recette1945.TUTOIEMENT_VOUVOIEMENT,),
        ),
    ),
    PromptScenario(
        # 1945.21 — une action ÉCHOUÉE se raconte avec ce qui a réussi à côté, et
        # la première chose que la personne cherche : a-t-elle été débitée ?
        "une-action-a-echoue",
        "L'enrichissement de Marc n'est pas passé, il s'est passé quoi ?",
        "_BLOCK_FORMAT",
        ("ce qui a échoué ; ce qui a réussi", "cause connue ou inconnue ; action de reprise"),
        meta=Meta(
            moment=Moment.PRISE_DE_CONTACT,
            intention=Categorie.DEMANDER_DE_L_AIDE,
            objets=(Objet.CONTACT, Objet.CREDIT),
            page="/actions",
            jamais_inventer=(JamaisInventer.EXECUTION, JamaisInventer.COUT),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
            situations=(Recette1945.ACTION_ECHOUEE,),
        ),
    ),
    # ── #2258.10 à .17 — LA HIÉRARCHIE DU CONTEXTE, huit scénarios de recette ───
    #
    # #2258.2/.8/.9 ont écrit l'ordre canonique à 8 niveaux et le gabarit de
    # conflit dans `_BLOCK_TRUTH` ; aucune suite ne les éprouvait sur des
    # situations concrètes. Les huit scénarios ci-dessous le font, chacun sur
    # un fragment PROPRE au bloc (l'exemple écrit, un rang de la hiérarchie, ou
    # le gabarit de phrase) — jamais un fragment générique qu'un autre bloc
    # satisferait par coïncidence.
    PromptScenario(
        "secteur-different-du-profil",
        "Mon profil dit Assurance, mais pour cette recherche je veux uniquement industrie et banque.",
        "_BLOCK_TRUTH",
        (
            "le profil dit « Assurance », le tour dit « uniquement industrie et banque »",
            "tu exclus l'assurance de CETTE recherche, sans toucher au profil.",
        ),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECOUVRIR,
            objets=(Objet.COMPTE,),
            page="/accounts",
            jamais_inventer=(),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    PromptScenario(
        "territoire-temporaire-pour-cette-conversation",
        "Pour cette session, ne me montre que les comptes d'Île-de-France — mon territoire habituel est plus large.",
        "_BLOCK_TRUTH",
        ("2) correction explicite ou exclusion déjà donnée dans cette conversation",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECOUVRIR,
            objets=(Objet.COMPTE, Objet.TERRITOIRE),
            page="/accounts",
            jamais_inventer=(),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    PromptScenario(
        "consultant-ponctuel-hors-offre-habituelle",
        "Positionne ce consultant même s'il ne correspond pas à nos offres habituelles, juste pour ce dossier.",
        "_BLOCK_TRUTH",
        ("1) demande explicite du tour", "8) valeurs par défaut produit, et en dernier recours une inférence"),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            objets=(Objet.CONSULTANT, Objet.BESOIN),
            page="/consultants",
            jamais_inventer=(),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    PromptScenario(
        "exclusion-dun-compte-pour-cette-recherche",
        "Retire ce compte de mes recherches pour cette conversation, sans le sortir de mon portefeuille.",
        "_BLOCK_TRUTH",
        ("Gabarit : « Pour cette recherche, j'exclus <élément> ; ton profil <ce qui ne bouge pas> ne change pas. »",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECOUVRIR,
            objets=(Objet.COMPTE,),
            page="/accounts",
            jamais_inventer=(JamaisInventer.PERIMETRE,),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    PromptScenario(
        "changement-de-persona-pour-ce-tour",
        "Pour ce message, réponds-moi comme si j'étais recruteur, pas business manager.",
        "_BLOCK_TRUTH",
        ("Une information plus BASSE ne contredit jamais silencieusement une information plus HAUTE.",),
        meta=Meta(
            moment=Moment.REGLAGES,
            intention=Categorie.DEMANDER_DE_L_AIDE,
            objets=(Objet.MESSAGE,),
            page="/settings/profile",
            jamais_inventer=(),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    PromptScenario(
        "travail-ponctuel-sur-une-autre-bu",
        "Pour ce besoin, regarde le portefeuille de la BU Infra, pas la mienne.",
        "_BLOCK_TRUTH",
        ("7) contexte de la BU et du workspace",),
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.TROUVER_UN_BESOIN,
            objets=(Objet.BESOIN,),
            page="/projects",
            jamais_inventer=(),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    PromptScenario(
        "recherche-transverse-depuis-une-page-compte",
        "Je suis sur la fiche Thales, mais montre-moi tous mes comptes en attente de relance.",
        "_BLOCK_TRUTH",
        ("Une page de compte ouverte ne referme jamais une demande transverse sur ce seul compte.",),
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECOUVRIR,
            objets=(Objet.COMPTE,),
            page="/accounts/$id",
            jamais_inventer=(),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
    PromptScenario(
        "oublie-tout-puis-retour-au-profil",
        "Oublie tout ce qu'on s'est dit — et pour la prochaine question, retrouve mon profil habituel.",
        "_BLOCK_TRUTH",
        ("6) mémoire durable utilisateur",),
        meta=Meta(
            moment=Moment.REGLAGES,
            intention=Categorie.DEMANDER_DE_L_AIDE,
            objets=(Objet.MEMOIRE,),
            page="/settings/memory",
            jamais_inventer=(),
            action=Action.AUCUNE,
            nature=Nature.CAS_LIMITE,
        ),
    ),
)


# ── 1. Chaque question a sa règle écrite ─────────────────────────────────────


@pytest.mark.parametrize("scenario", TOOL_SCENARIOS, ids=[s.name for s in TOOL_SCENARIOS])
def test_the_tool_that_answers_the_question_carries_the_rule(scenario: ToolScenario) -> None:
    description = DESCRIPTIONS.get(scenario.tool)
    assert description is not None, (
        f"L'outil « {scenario.tool} » n'existe plus dans le registre. La question "
        f"« {scenario.question} » n'a donc plus de réponse : soit l'outil a été renommé "
        "et le scénario suit, soit la capacité a disparu et le scénario devient un constat "
        "d'absence."
    )
    missing = [fragment for fragment in scenario.fragments if fragment not in description]
    assert not missing, (
        f"Scénario « {scenario.name} » : la description de « {scenario.tool} » ne porte plus "
        f"{missing}.\nQuestion : {scenario.question}\n"
        "Le modèle ne lit que cette description : sans ces mots, la règle n'existe plus pour lui."
    )


@pytest.mark.parametrize(
    "scenario",
    [s for s in TOOL_SCENARIOS if s.schema],
    ids=[s.name for s in TOOL_SCENARIOS if s.schema],
)
def test_the_schema_exposes_the_filters_the_question_carries(scenario: ToolScenario) -> None:
    """Une question porte des filtres (« à Lyon », « en Java », « dans 30 jours »).

    Une règle écrite sans le champ qui la porte laisse le modèle inventer : il
    ne peut pas filtrer sur ce que le schéma n'expose pas, et il répondra quand
    même — sur le corpus entier.
    """
    tool = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == scenario.tool)
    properties = set(tool["input_schema"]["properties"])
    missing = [field for field in scenario.schema if field not in properties]
    assert not missing, (
        f"Scénario « {scenario.name} » : le schéma de « {scenario.tool} » n'expose pas {missing}. "
        f"« {scenario.question} » n'est alors pas posable — le filtre se perd en silence."
    )


@pytest.mark.parametrize("scenario", PROMPT_SCENARIOS, ids=[s.name for s in PROMPT_SCENARIOS])
def test_the_prompt_carries_the_rule_for_the_question(scenario: PromptScenario) -> None:
    missing = [fragment for fragment in scenario.fragments if fragment not in PROMPT]
    assert not missing, (
        f"Scénario « {scenario.name} » : le prompt ne porte plus {missing}.\nQuestion : {scenario.question}"
    )


def test_every_declared_tool_has_at_least_one_question() -> None:
    """L'INVENTAIRE : un outil déclaré sans question est une capacité qu'on paie
    au modèle à chaque tour sans jamais l'avoir éprouvée.

    C'est ce test qui rend le jeu de référence auto-entretenu : le jour où
    quelqu'un ajoute un 53ᵉ outil, il tombe, et la seule façon de le rendre vert
    est d'écrire la question qu'un commercial poserait pour l'appeler.
    """
    covered = {scenario.tool for scenario in TOOL_SCENARIOS}
    declared = set(DESCRIPTIONS)
    assert covered <= declared, f"scénarios sur des outils inexistants : {sorted(covered - declared)}"
    assert declared - covered == set(), (
        f"Outils sans aucune question : {sorted(declared - covered)}. "
        "Écris la question qu'un commercial poserait, ou dis pourquoi personne ne la pose."
    )


# ── 2. Les SEPT constats d'absence ───────────────────────────────────────────
#
# Chacun est un test qui tombe le jour où la capacité arrive — c'est ce qui
# force à le reclasser en scénario vert au lieu de le laisser périmer.

#: Le vocabulaire des critères protégés (annexe III de l'EU AI Act, doctrine
#: `c58_criteres_proteges`). « photo » en est ABSENT à dessein : le mot existe
#: dans `enrich_contact`, qui COMPLÈTE une fiche — l'interdit porte sur l'usage
#: CLASSANT, pas sur l'existence du champ.
_PROTECTED_VOCABULARY = ("critère protégé", "âge", "genre", "nationalité", "origine", "situation familiale")

#: Les trois outils qui ORDONNENT des personnes. Si la règle devait être écrite
#: quelque part pour le modèle, ce serait dans leur description.
_TOOLS_THAT_RANK_PEOPLE = ("run_matching", "list_reactivation_pool", "search_talents")


def test_a_written_rule_keeps_a_protected_criterion_out_of_a_person_rank() -> None:
    """LA RÈGLE EXISTE ENFIN — « Classe-moi ces profils, commence par les plus jeunes. »

    Ce test remplace le CONSTAT D'ABSENCE qui vivait ici. L'interdit
    `c58_criteres_proteges` était tenu côté API (GA-06) et côté moteur (phase 3),
    mais RIEN ne l'écrivait dans le scope de Laura : ni le prompt, ni les trois
    outils qui ordonnent des personnes. « Commence par les plus jeunes » ne
    rencontrait aucune ligne.

    ⚠️ Le geste attendu était d'écrire la règle, pas d'effacer le constat.
    """
    bloc = PROMPT.lower()
    # La règle NOMME ce qu'elle interdit — un interdit qui ne nomme rien ne se
    # reconnaît pas dans une demande formulée autrement.
    for mot in ("âge", "genre", "origine", "nationalité", "photo", "situation familiale"):
        assert mot in bloc, f"« {mot} » n'est pas nommé dans la règle du prompt"

    # Elle porte sur l'ORDRE, pas sur l'existence du champ.
    assert "ordonner des personnes" in bloc
    assert "restituer" in bloc, "la règle doit dire qu'une donnée protégée peut être RESTITUÉE"

    # Les deux exceptions sont NOMMÉES : sans elles, l'interdit se contourne à
    # la première fiche, ou bloque un livrable qui doit désigner quelqu'un.
    assert "deux exceptions" in bloc
    assert "ville" in bloc and "pays" in bloc

    # Elle tient même contre une demande EXPLICITE de la personne : c'est le cas
    # qui a motivé le lot, et le seul que le modèle rencontrera vraiment.
    assert "même si la personne te le demande" in bloc


def test_the_protected_criteria_rule_knows_how_to_say_no() -> None:
    """La garde sait dire NON — on retire le bloc et tout doit tomber.

    Sans ce témoin, la garde resterait verte le jour où le bloc sortirait du
    prompt : c'est l'espèce de garde borgne la plus fréquente de ce dépôt.
    """
    from app.prompts import bellum_advisor

    sans_bloc = PROMPT.replace(bellum_advisor._BLOCK_PROTECTED_CRITERIA, "")
    assert sans_bloc != PROMPT, "le bloc n'est pas dans le prompt assemblé — la garde ne lit rien"
    # Ce qui tombe avec le bloc : son TITRE (en capitales, tel qu'il s'annonce) et
    # ce qu'il NOMME. Un renvoi à la règle écrit ailleurs n'est pas la règle —
    # voir le témoin juste en dessous.
    assert _PROTECTED_RULE_HEADING not in sans_bloc
    for marker in _PROTECTED_RULE_MARKERS:
        assert marker not in sans_bloc.lower(), f"« {marker} » survit au retrait du bloc"


#: Le titre du bloc, tel qu'il s'annonce dans le prompt.
_PROTECTED_RULE_HEADING = "CE QUI NE PEUT JAMAIS ORDONNER DES PERSONNES"
#: Ce que la règle NOMME et que rien d'autre dans le prompt ne dit.
_PROTECTED_RULE_MARKERS = (
    "date de naissance",
    "situation familiale",
    "adresse précise",
    "même si la personne te le demande",
    "deux exceptions",
)


def test_the_protected_criteria_say_no_guard_lets_a_pointer_to_the_rule_through() -> None:
    """Témoin : la garde n'attrape pas ce qu'elle ne vise pas.

    La consigne des cartes (#1914, ``reply_formats.py``) RENVOIE à cette règle —
    « rien de ce qui ne peut jamais ordonner des personnes n'entre dans son
    ordre » — sans la répéter. L'ancienne garde cherchait « ordonner des
    personnes » en minuscules et rougissait sur ce renvoi légitime, alors que la
    règle elle-même (ce qu'elle nomme, ses exceptions) avait bien disparu avec
    le bloc.
    """
    from app.prompts.reply_formats import REPLY_FORMATS_DIRECTIVE

    directive = REPLY_FORMATS_DIRECTIVE
    assert "ordonner des personnes" in directive.lower(), "le renvoi a disparu : ce témoin ne témoigne plus de rien"
    assert _PROTECTED_RULE_HEADING not in directive
    assert all(marker not in directive.lower() for marker in _PROTECTED_RULE_MARKERS)


def test_no_tool_that_ranks_people_offers_a_protected_criterion_as_a_sort_key() -> None:
    """⚠️ La règle du prompt ne suffit pas : un OUTIL ne doit pas le proposer.

    Un champ n'a pas besoin d'être multiplié par un poids pour peser dans un
    classement — il suffit qu'il soit offert comme critère à celui qui note.
    C'est exactement par là que `photoUrl` avait voyagé jusqu'à un prompt qui
    donne une priorité de 1 à 5 par personne, sans qu'aucune ligne ne le
    « lise ».
    """
    descriptions = "\n".join(DESCRIPTIONS[name] for name in _TOOLS_THAT_RANK_PEOPLE).lower()
    found = [word for word in _PROTECTED_VOCABULARY if word in descriptions]
    assert found == [], (
        f"Un outil qui ORDONNE des personnes propose un critère protégé : {found}. "
        "C'est une violation de `c58_criteres_proteges` — l'interdit porte sur l'usage "
        "classant, et offrir le critère EST un usage classant."
    )


def test_no_tool_answers_the_market_recourse_coverage_rate_question() -> None:
    """CONSTAT D'ABSENCE (toujours vrai) — « Sur combien de mes comptes on a un
    recours externe observé ? »

    Le taux de COUVERTURE mesure ce qu'on SAIT, jamais ce que le marché FAIT
    (`c65_couverture_nest_pas_un_fait_de_marche`, garde GA-259), et ses quatre
    seaux MARCHÉ — couvert / observations insuffisantes / ambigu / non résolu —
    s'additionnent jusqu'au dénominateur d'un PORTEFEUILLE. Ce vocabulaire-là
    reste tenu côté API et web, et n'atteint toujours AUCUN outil : une
    question de couverture DE MARCHÉ posée en conversation se répondrait sans
    la règle qui empêche de la lire comme un fait de marché.

    #2308 (22/09/2026) a donné à Laura un AUTRE mot « couverture » —
    `get_account_coverage_map`, la carte de couverture D'UN COMPTE (périmètre
    × famille de rôle d'achat × étape commerciale), un axe totalement
    différent du taux de marché ci-dessus. Sa description porte déjà la règle
    GA-259 (« un axe inconnu ne se traduit jamais en un fait, ni sur le compte
    ni sur le marché ») — c'est le scénario vert que ce test promettait de
    remonter, mais SEULEMENT pour cet outil-là : tout AUTRE outil ou bloc de
    prompt qui porterait le mot couverture reste refusé ci-dessous.
    """
    corpus_without_account_map = (
        PROMPT + "\n" + "\n".join(text for name, text in DESCRIPTIONS.items() if name != "get_account_coverage_map")
    )
    assert "couvertur" not in corpus_without_account_map.lower(), (
        "Un second outil (ou le prompt) porte désormais le mot couverture — vérifie qu'il "
        "porte aussi la phrase GA-259 avant de l'ajouter à l'exception ci-dessus."
    )
    assert "get_account_coverage_map" in DESCRIPTIONS, "l'outil #2308 a disparu du catalogue"
    account_map_description = DESCRIPTIONS["get_account_coverage_map"].lower()
    assert "jamais" in account_map_description and "marché" in account_map_description, (
        "get_account_coverage_map dit « couverture » : sa description doit continuer à porter "
        "explicitement la règle GA-259, pas seulement le mot."
    )


def test_no_tool_reads_the_watchlist_although_the_prompt_names_its_screen() -> None:
    """CONSTAT D'ABSENCE — « Qu'est-ce qui a bougé sur mes comptes en veille ? »

    Le prompt sait EMMENER sur l'écran (`[Signaux](/signals)` dans le bloc
    OUTILS) et Laura ne sait pas LIRE ce qu'il contient. C'est la forme la plus
    trompeuse d'un manque : la personne voit Laura nommer l'écran, en déduit
    qu'elle le lit, et prend un silence pour « rien n'a bougé ».
    """
    assert "(/signals)" in PROMPT, "Le prompt ne nomme plus l'écran Veille : ce constat n'a plus de sujet."
    # ⚠️ Bornes de mot : sans elles, « surveille » et « réveille » contiennent
    # « veille » — une garde qui attrape ce qu'elle ne vise pas finit par être
    # contournée au lieu d'être respectée.
    watch = re.compile(r"\b(veille|watchlist)\b", re.IGNORECASE)
    readers = [name for name, text in DESCRIPTIONS.items() if watch.search(text)]
    # #1903 — la seule occurrence tolérée est le catalogue d'écrans de
    # `propose_guided_action`, qui OUVRE l'écran et n'en lit rien — le même cas
    # que la route du journal d'activité juste en dessous. Un second nom ici est
    # un lecteur, et c'est lui que ce constat attend.
    # #3816 — `find_accounts_for_talent` (marché inversé) lit les signaux de la
    # veille pour classer les comptes d'un profil ; il ne répond pas à « qu'est-ce
    # qui a bougé sur mes comptes suivis ? ». Seul un NOUVEAU nom ici est un
    # lecteur à couvrir par un scénario.
    assert readers == ["propose_guided_action", "find_accounts_for_talent"], (
        f"Un outil lit désormais la veille : {readers}. Écris la question qu'un commercial pose "
        "(« qu'est-ce qui a bougé sur mes comptes suivis ? ») et remonte ce constat en scénario vert."
    )


def test_no_tool_reads_the_activity_journal_of_an_account() -> None:
    """CONSTAT D'ABSENCE — « Qu'est-ce qu'on s'est dit avec ce compte depuis six mois ? »

    Le journal d'activité de l'espace EXISTE (il stocke le corps des messages
    depuis l'arbitrage du 16/08) et Laura n'y a aucun accès en lecture : la
    seule occurrence du mot dans son scope est une ROUTE d'écran, réservée aux
    gestionnaires. Ce constat est donc double : la capacité manque, et le jour
    où elle arriverait, elle heurterait D65 (« le corps des messages ne sort
    jamais vers le modèle ») — la question à trancher n'est pas technique.
    """
    holders = [name for name, text in DESCRIPTIONS.items() if "journal d'activité" in text.lower()]
    assert holders == ["propose_guided_action"], (
        f"Le journal d'activité est cité par {holders}. Si un outil le LIT désormais, la question "
        "D65 (le corps des messages ne sort pas vers le modèle) doit être tranchée avant, pas après."
    )


def test_no_tool_prepares_a_priced_commercial_proposal() -> None:
    """CONSTAT D'ABSENCE — « Prépare-moi une proposition commerciale pour ce besoin. »

    C'est la demande la plus naturelle après une shortlist, et rien ne la sert :
    ni devis, ni proposition, ni grille de prix. `get_revenue` ne rend AUCUNE
    marge et `search_talents` ne sort AUCUN coût chargé — les deux entrées d'un
    chiffrage sont donc fermées à Laura, délibérément.
    """
    corpus = "\n".join(DESCRIPTIONS.values())
    # ⚠️ Bornes de mot, pour la même raison qu'au-dessus : « devis » est un
    # préfixe de « devise » et de « deviser ».
    for word in ("devis", "proposition commerciale", "grille tarifaire"):
        assert not re.search(rf"\b{word}\b", corpus, flags=re.IGNORECASE), (
            f"« {word} » est entré dans le registre. Un chiffrage préparé par Laura suppose "
            "d'ouvrir la marge ou le coût chargé : la décision se prend avant l'outil."
        )


def test_the_credit_balance_is_readable_through_no_tool() -> None:
    """CONSTAT D'ABSENCE — « Il me reste combien de crédits ? »

    #4464 — crédits implicites : aucune description ne parle plus du solde, pas même
    celle de la PRÉPARATION d'une analyse. Posée seule, la question n'a pas d'outil —
    Laura ne peut qu'emmener sur `/billing`.
    """
    holders = [name for name, text in DESCRIPTIONS.items() if "solde" in text.lower()]
    assert holders == [], (
        f"Le solde de crédits est désormais lisible par {holders}. Si un outil le rend "
        "directement, la question « il me reste combien de crédits ? » devient un scénario vert."
    )
    assert "/billing" in DESCRIPTIONS["propose_guided_action"], (
        "L'écran de facturation n'est plus proposable : la question n'a alors plus AUCUNE réponse."
    )


def test_only_the_named_exceptions_reach_the_model_through_the_registry() -> None:
    """CONSTAT REFERMÉ (#1819) — « Tu l'as poussé dans quel CRM ? »

    La doctrine dit : on nomme la CAPACITÉ (« ton CRM », « ta messagerie »),
    jamais l'éditeur, et le bloc CONFIDENTIALITÉ TECHNIQUE du prompt l'écrit au
    modèle. Le 11/09/2026, ce test a mesuré CINQ noms qui atteignaient quand
    même le modèle — par le REGISTRE, qui part dans la MÊME requête que le
    prompt : les quatre CRM d'`export_contact_to_crm` et le réseau
    professionnel d'`enrich_contact` / `prepare_message_for_contact`. Aucune des
    deux gardes existantes ne pouvait les voir : celle du prompt interdisait 24
    éditeurs et ne lisait pas le registre ; celle du registre ne connaissait que
    six noms, tous de messagerie.

    Ce qu'il en reste, et pourquoi (l'axe D354 : à qui appartient l'outil) :

      • les quatre CRM sont PARTIS. Une description statique ne peut pas savoir
        lequel est branché : elle énumérait notre catalogue, pas l'outil de la
        personne. L'API avait déjà tranché par agrégation
        (`tool-capability-digest.ts` → « votre CRM ») ; le registre la
        contredisait.
      • les deux « LinkedIn » RESTENT, comme exceptions NOMMÉES : ce sont des
        surfaces d'ACTION (le canal d'un geste que l'humain pose lui-même), et
        GA-44 les a déjà tranchées à l'écran pour les MÊMES propositions.

    ⚠️ CE TEST NE PORTE PLUS LA GARDE DURABLE. Elle vit désormais à côté du
    réglage qu'elle lit, dans `test_copilote_prompt_blocks.py`, pour que les
    DEUX surfaces d'une même requête soient tenues par une seule liste (GA-26).
    Ce qui reste ici est ce que le jeu de référence doit montrer d'un coup
    d'œil : la photo COMPLÈTE de ce qui atteint le modèle, nom par nom et outil
    par outil — un rouge par vendeur ne la donne pas. L'attendu est DÉRIVÉ des
    exceptions, jamais recopié : il n'existe pas de seconde liste à tenir.
    """
    expected: dict[str, list[str]] = {}
    for vendor, tool_name in REGISTRY_ACTION_SURFACE:
        expected.setdefault(vendor, []).append(tool_name)
    for tools in expected.values():
        tools.sort()

    measured: dict[str, list[str]] = {}
    for vendor in FORBIDDEN_VENDORS:
        hits = sorted(
            str(tool["name"])
            for tool in chat_tools.CHAT_TOOLS
            if re.search(rf"\b{re.escape(vendor)}\b", json.dumps(tool, ensure_ascii=False), flags=re.IGNORECASE)
        )
        if hits:
            measured[vendor] = hits
    assert measured == expected, (
        f"Ce qui atteint le modèle par le registre a changé : {measured}, attendu {expected}. "
        "Un nom EN PLUS se tranche avec D354 et s'inscrit dans REGISTRY_ACTION_SURFACE avec sa "
        "raison ; un nom EN MOINS veut dire qu'une exception a survécu au texte qu'elle "
        "justifiait — on la retire, ce qui REFERME la porte."
    )


# ── 3. Les deux preuves obligatoires : le corpus est LU, la garde dit NON ────


def test_the_eval_reads_a_non_empty_corpus() -> None:
    """Une garde qui ne lit rien est verte pour toujours."""
    assert PROMPT.strip(), "Le prompt système est vide : tous les `in` passeraient sur du néant."
    # ⚠️ Pas d'égalité ici : le COMPTE exact du registre vit à UN seul endroit,
    # `test_every_declared_tool_has_at_least_one_question`, qui nomme l'outil
    # non couvert. Deux tests qui comptent la même chose donnent un rouge de
    # comptabilité à côté du rouge utile.
    assert len(DESCRIPTIONS) >= 52, f"Le registre a perdu des outils : {len(DESCRIPTIONS)} au lieu de 52 au moins."
    assert all(text.strip() for text in DESCRIPTIONS.values()), "Une description vide rend son scénario muet."
    assert all(block.strip() for block in BLOCKS.values()), "Un bloc vide : le retirer ne changerait rien."

    # #1903.10 / #1935 — +2 (« preparer-une-campagne » et son cas limite).
    # #2268.1 / #2268.5 / #2268.10 — +2 (« fixer-lobjectif-dun-fil » et son cas limite).
    # #2271.19 — +2 (« historique-dun-compte » et son cas limite).
    # #2327.26 — +2 (« pourquoi-ces-deux-fiches-se-ressemblent » et son cas limite).
    # #2623.1 — +2 (« qui-approcher-apres-une-analyse » et son cas limite).
    # #2679 — +2 (« cliquer-la-reponse-dune-precision » et son cas limite).
    # #2301 — +2 (« prelecture-avant-relancer-lanalyse » et son cas limite).
    # #2300 — +2 (« contrat-de-travail-avant-un-plan » et son cas limite).
    # #2302 — +2 (« quel-perimetre-attaquer » et son cas limite), ajoutés à
    # l'intégration vague 14 (22/09) : le lot n'en avait posé aucune.
    # #2308 — +3 (« carte-de-couverture-dun-compte » et ses deux cas limites :
    # aucun signal observé, compte étranger au portefeuille).
    # #2324 — +4 (compile_opportunity et get_pipeline_health, chacun avec son cas limite).
    # #2721 — +1 (« chercher-un-interlocuteur-sur-le-web-public »), sans cas
    # limite ce lot : `web_search` rejoint le cliquet SANS_CAS_LIMITE de
    # `test_copilote_scenario_corpus.py`.
    # #2322 — +2 (« compiler-un-besoin-depuis-un-email » et son cas limite
    # « ne-pas-inventer-un-champ-du-besoin »). ⚠️ Fusion vague 15 → vague 16
    # (22/09) : la vague 16 avait bouché le trou de couverture de #2322 sur sa
    # propre base avec un scénario SANS cas limite (`compile_need` posé dans
    # le cliquet SANS_CAS_LIMITE) sans savoir que la vague 15 avait déjà écrit
    # un cas limite réel — gardé, le doublon et l'entrée du cliquet retirés.
    # ⚠️ 103 était le compte de CHAQUE branche prise seule (vague 15 : +2 pour
    # compile_need, sans web_search ; vague 16 : +1 pour web_search, +1 pour
    # compile_need sans cas limite) — la base commune aux deux fait 101, donc
    # la fusion des deux additions RÉELLES (compile_need +2, web_search +1)
    # rend 104, pas 103.
    # #2294 — +2 (« qui-connait-on-chez-x-dans-tout-lespace » et son cas limite
    # « personne-connue-nulle-part-dans-lespace »).
    # #2337 — +2 (« construire-le-terrain-de-jeu-de-trois-consultants » et son
    # cas limite « terrain-de-jeu-sans-chance-de-signer »).
    # #2392 — +2 (« cloturer-ma-journee » et son cas limite « ne-pas-tout-reporter-a-demain »).
    # #2338.8 / #2409.8 — +2 (« ce-qui-manque-avant-que-la-mission-demarre » et son cas
    # limite « mission-sans-aucun-manque-nest-pas-une-mission-inconnue »).
    # #2423.9 — +2 (« preparer-un-avenant-de-mission » et son cas limite
    # « avenant-sur-accord-verbal-du-client » : un accord verbal rapporté
    # n'est jamais annoncé comme obtenu).
    # #1950.4 — +2 (« un-plan-dit-son-objectif-et-ce-qui-ne-se-fera-pas » et son
    # cas limite « un-plan-ne-devine-ni-duree-ni-manque »).
    # Union recalculée à la fusion de vague 28 (23/09) : les deux branches ont
    # ajouté leurs scénarios à des emplacements différents de la liste (fusion
    # automatique sans conflit sur le tuple lui-même) — base commune 112, +4
    # côté intégration (#2338.8/#2409.8 et #2423.9), +2 côté
    # `feat/laura-annonce-proactive-23-09` (#1950.4) : 112 + 4 + 2 = 118.
    # #2276 (fusion vague 31, 24/09) — +2 (« job-composite-sur-demande-complexe »
    # et son cas limite « demande-simple-sans-job ») : 118 + 2 = 120.
    # #2258.10 à .17 — huit scénarios de recette sur la hiérarchie du contexte
    # (PROMPT_SCENARIOS, pas TOOL_SCENARIOS) : 13 + 8 = 21.
    # Union recalculée à la fusion de fix/w37-laura-23-09 (24/09) : le tuple
    # `TOOL_SCENARIOS`/`PROMPT_SCENARIOS` a fusionné SANS conflit (les deux
    # branches insèrent à des emplacements différents) — compte lu sur le
    # tuple réel via le venv IA, jamais recalculé à la main.
    # #2425.8 (vague 33) — +2 (« previsionnel-par-horizon-en-chat » et son cas
    # limite « previsionnel-sans-le-droit »).
    # #2425.8 (W43, intégration vague 32, 24/09) — +2 (« pourquoi-mon-cash-est-en-retard »
    # et son cas limite « previsionnel-pondere-par-la-probabilite ») : `get_forecast_horizons`
    # (fusionné depuis fix/w44-fermants) n'avait ni scénario positif ni question.
    # Fusion vague 32 → 33 : les deux paires coexistent (4 scénarios pour l'outil).
    # Vague 36 (24/09) — +2 (« je-connais-quelquun-chez-un-compte » et son cas
    # limite « relation-portee-par-un-collegue ») : `declare_known_contact`
    # (#2313) n'avait ni scénario ni question — la CI de #2911 le disait.
    # Côté origin/main (24/09) : union recalculée séparément — 124 TOOL_SCENARIOS
    # (120 côté intégration + les ajouts d'origin/main), 21 PROMPT_SCENARIOS,
    # 145 au total. #2391 (défaut PRÉEXISTANT trouvé à l'intégration, corrigé
    # là) — `propose_focus_plan` était déclaré sans AUCUNE question : +1,
    # « organiser-ma-journee-en-blocs » : 125 + 21 = 146. #2425.8 (fusion vague
    # 31+33, 24/09) — les scénarios `get_forecast_horizons` (vague 32/33,
    # `fix/w44-fermants`) rejoignent ceux déjà là côté vague-31 (#2276, job
    # composite, et les scénarios propres à origin/main) : union SANS conflit
    # de contenu (insertions à des emplacements différents) — 129 TOOL_SCENARIOS,
    # 21 PROMPT_SCENARIOS côté origin/main.
    # Fusion refusion-36 ← origin/main (24/09, ce lot) : vague 36 (128 + 21) et
    # origin/main (129 + 21) ont chacune inséré leurs scénarios à des
    # emplacements différents du tuple (union SANS conflit sur le contenu,
    # seul ce commentaire/cliquet s'est heurté) — compte relu sur le tuple RÉEL
    # après fusion (`ast.parse` sur ce fichier, jamais recalculé à la main) :
    # 131 TOOL_SCENARIOS, 21 PROMPT_SCENARIOS.
    # #2325 (25/09) — +1 (« sante-du-pipe-versus-portefeuille », un positif SANS
    # cas limite : le cas limite de `get_pipeline_health` existe déjà,
    # « pas-de-cloture-automatique ») : 131 + 1 = 132.
    # Épopée #2853 (#2157.1, 25/09) — +2 (« creer-une-cible-depuis-laura » et son
    # cas limite « creer-une-cible-depuis-laura-sans-nom ») : 132 + 2 = 134.
    # Épopée #2781 (#2150.30, LOT j1 26/09) — +1 (« ajouter-au-portefeuille-depuis-laura »,
    # un positif SANS cas limite, même motif que `web_search`) : 134 + 1 = 135.
    # #2148.4 (#2848, 25/09) — +2 (« reutiliser-un-compte-deja-analyse » et son
    # cas limite « aucun-compte-deja-analyse-ne-correspond ») pour
    # `search_workspace_accounts`, qui n'avait ni scénario ni question, lot
    # croisé avec #2853 (même base 132, intégration matin B) : 134 + 2 = 136.
    # #2910 (#2322.10, 26/09) — +2 (« le-crm-branche-connait-il-deja-ce-compte »
    # et son cas limite « aucun-crm-branche-sur-cet-espace »), lot croisé avec
    # #2148.4 (même base 134, intégration matin B) : 136 + 2 = 138.
    # #2792 (épopée Account Expansion, 25/09) — +2 (« compiler-une-expansion-de-
    # compte » et son cas limite « piste-dexpansion-non-qualifiee ») pour
    # `compile_account_expansion`, qui n'avait ni scénario ni question.
    # Épopée #2872 (#2367.11, 25-26/09) — +2 (« pourquoi-ce-profil-a-ete-refuse »
    # et son cas limite « aucun-rex-enregistre-pour-ce-consultant ») pour
    # `get_consultant_push_feedback`, même défaut. Les deux lots de nuit
    # 06-17 avaient chacun laissé leur outil neuf hors du corpus, sans se
    # voir (même base 138, intégration matin B) : 138 + 2 + 2 = 142.
    # Fusion merge-j1 ← origin/main (26/09) : la vague j1 (135) et origin/main
    # (142) ont chacune inséré leurs scénarios à des emplacements différents
    # du tuple (union SANS conflit de contenu, seul ce commentaire/cliquet
    # s'est heurté) — compte relu sur le tuple RÉEL après fusion (`ast.parse`
    # sur ce fichier, jamais recalculé à la main) : 134 + 1 (j1) + 8
    # (origin/main) = 143. +1 (intégration reste-2, 26/09) pour
    # `get_confirmed_revenue` (#2900), laissé hors du corpus par
    # feat/reste-r8-26-09 : 143 + 1 = 144. +1 (intégration chantier B, 26/09)
    # pour `explain_approval_card` (#2857), laissé hors du corpus par
    # feat/chantier-g22-26-09 : 144 + 1 = 145. +1 (intégration reste-3, 26/09)
    # pour un SECOND scénario `explain_approval_card` (#2857), laissé hors du
    # corpus par feat/reste-r5-26-09, base commune 144 en parallèle du lot
    # chantier B ci-dessus (deux scénarios distincts, deux noms distincts,
    # fusion sans conflit de contenu) : 145 + 1 = 146.
    # Fusion LOT n8 ← intégration reste-3 (26/09), en parallèle de la branche
    # chantier B ci-dessus (base commune 144, deux lots croisés) : #3094
    # (LOT n8) — +2 (« comptes-dun-membre-nomme » et son cas limite
    # « membre-introuvable-dans-lespace ») pour `get_accounts_by_owner` :
    # 145 + 2 = 147.
    # Fusion intégration chantier B ← origin/main (26/09) : chantier B (146)
    # et origin/main (147) ont chacune inséré leurs scénarios à des
    # emplacements différents du tuple (union SANS conflit de contenu, seul
    # ce commentaire/cliquet s'est heurté) — compte relu sur le tuple RÉEL
    # après fusion (`ast.parse` sur ce fichier, jamais recalculé à la main) :
    # 148 TOOL_SCENARIOS, 21 PROMPT_SCENARIOS.
    # Fusion intégration clôture ← origin/main (27/09) : main (148) + le
    # scénario `push_profile` de clôture (LOT c5) = 149, relu sur le tuple RÉEL.
    # feat/reste-r8-26-09 : 143 + 1 = 144. +1 (intégration clôture, LOT c5
    # 26/09) pour `push_profile` (épopée #2872, #2367.6), un positif SANS cas
    # limite (même motif que `web_search`), laissé hors du corpus par
    # feat/cloture-c5-26-09 : 144 + 1 = 145. +1 (intégration reste-3, 26/09)
    # pour `explain_approval_card` (#2857), laissé hors du corpus par
    # feat/reste-r5-26-09, arrivé par une branche distincte visant elle aussi
    # 144 + 1 : les deux lots sont réels et distincts (vérifié : les deux noms
    # figurent dans le tuple après fusion) — le cliquet encaisse les DEUX,
    # 145 + 1 = 146, pas un seul.
    # Fusion intégration clôture ← LOT n8 (26/09) : les deux ont chacune
    # inséré leur outil neuf hors du corpus (union SANS conflit de contenu,
    # seul ce commentaire/cliquet s'est heurté). #3094 (LOT n8) — +2
    # (« comptes-dun-membre-nomme » et son cas limite
    # « membre-introuvable-dans-lespace ») pour `get_accounts_by_owner` :
    # 146 + 2 = 148. Compte relu sur le tuple RÉEL après fusion (`ast.parse`
    # sur ce fichier, jamais recalculé à la main) : 149 TOOL_SCENARIOS
    # côté clôture (base de cette intégration matin).
    # #2273 (LAU-FINAL-015, épopée #2959, LOT g10 26/09, côté chantier A) — +2
    # (« compte-qualifie-pour-prospecter » et son cas limite
    # « compte-qualifie-donnees-manquantes ») pour
    # `evaluate_account_qualification_filters`, qui n'avait ni scénario ni
    # question. Intégration chantier A (26/09) — +3 pour
    # `get_account_manager_review` (#2319/#2985), `get_need_transition_history`
    # et `propose_need_transition` (#2320.24/.26/.27, épopée #2967), laissés
    # hors du corpus par leurs lots (g5/g8). `explain_approval_card` et
    # `get_accounts_by_owner` sont DÉJÀ comptés ci-dessus côté clôture (même
    # scénarios, même noms) — chantier A les avait ajoutés en parallèle sur sa
    # propre base, ils ne se recomptent pas une seconde fois à la fusion.
    # ⚠️ Intégration matin 27/09 (fusion chantier A dans clôture) : seul
    # l'apport RÉEL et NEUF de chantier A survit — les trois tool-scenarios
    # `get_account_manager_review`/`get_need_transition_history`/
    # `propose_need_transition` (+3), PLUS `evaluate_account_qualification_filters`
    # et son cas limite (+2, positif ET cas limite, tous deux absents de
    # clôture). 149 (clôture) + 3 + 2 = 154. Valeur relevée sur le tuple RÉEL
    # après fusion (`ast.parse` / `len(TOOL_SCENARIOS)` exécuté, jamais
    # recalculée à la main — la première tentative à 152 avait sous-compté
    # `evaluate_account_qualification_filters`).
    # #2339.1/.2/.3/.5/.6/.8/.10/.11/.13 (épopée #2795, LOT écrivain 27/09) —
    # +8 (les sept lectures de l'état canonique commercial & staffing d'un
    # besoin, chacune un scénario positif, aucun cas limite ce lot). 154 + 8 = 162.
    # #2987.56 (épopée #2987, CI intégration R 28/09) — +4 (les notes de frais
    # en attente de décision : un positif ET un cas limite pour chacun des deux
    # outils, `list_expense_reports_awaiting_decision` et
    # `propose_expense_report_decision`). 162 + 4 = 166.
    # #3179 (LAU-FINAL-185, retour bêta 28/09/2026, LOT lau-185-186) — +2
    # (« verdict-daptitude-avant-de-prospecter » et son cas limite
    # « verdict-naccuse-jamais-la-seule-taille ») pour
    # `get_account_suitability_verdict`, qui n'avait ni scénario ni question.
    # 166 + 2 = 168.
    # #3181.1/.5 (LAU-FINAL-187, LOT écrivain 28/09) — +2 (le générateur
    # d'alternatives proactif : un scénario positif et son cas limite), une
    # branche DISTINCTE de #3179 ci-dessus. ⚠️ Fusion intégration X2 (28/09) :
    # les deux comptes ci-dessus avaient chacun été calculés contre la MÊME
    # base 166 au lieu de s'accumuler — défaut d'arithmétique de fusion, pas de
    # contenu (les deux paires de scénarios sont RÉELLEMENT présentes toutes
    # les deux, vérifié sur le tuple). 168 + 2 = 170.
    # #3209/#3210/#3214 (LAU-FINAL-215/216/220, intégration X2 28/09) — +3
    # (« prioriser-son-portefeuille-cette-semaine », « a-quoi-ressemble-ce-compte »,
    # « comparer-deux-chemins-hypothetiques ») pour `get_portfolio_priorities`,
    # `find_similar_cases` et `compare_scenarios`, qui n'avaient ni scénario ni
    # question (même défaut que `resolve_account_territory` en #2302). 170 + 3 = 173.
    # Intégration SC 28/09 — +2 (BEL-SC-224 `get_weakest_link_diagnosis`, BEL-SC-239
    # `prepare_proposal_pack`), deux positifs SANS cas limite. 173 + 2 = 175.
    # #3265.12 : +2 (un positif, un cas limite) = 177.
    # #3193.2 (épopée #3217, lot E3 28/09 suite) — +2 (un positif et son cas
    # limite) pour `search_sector_referential`, le référentiel sectoriel
    # Bellum jamais présenté au chat jusqu'ici. 177 + 2 = 179.
    # #3182.3 (épopée #3248, LOT écrivain 28/09) — +1 (l'agrégateur des
    # prérequis de positionnement : un seul scénario positif ce lot, son
    # NO-GO — consentement compte refusé — vit déjà comme cas testé côté
    # `copilot-bridge.controller.spec.ts`, pas dupliqué ici). 179 + 1 = 180.
    # Intégration Z (29/09) — +1, le cas limite du même outil (« positionner
    # malgré un refus compte »), exigé par la garde du corpus. 180 + 1 = 181.
    # Intégration E (29/09) : Z comptait ses 4 contre 173, main les siens aussi —
    # ils s'ACCUMULENT ici.
    # #3262.23 (épopée #3284, lot P05 29/09) — +1 (« ce-compte-traine-t-il-en-focus »)
    # pour `get_focus_review`, qui n'avait ni scénario ni question. 181 + 1 = 182.
    # #3277.1 (épopée #3277, lot P06 29/09) — +1 (« ou-en-est-la-strategie-dun-compte »,
    # un seul scénario positif ce lot, aucun cas limite) pour `get_account_strategy_5p`.
    # Intégration P (30/09) : P05 et P06 s'ACCUMULENT. 181 + 1 + 1 = 183.
    # Épopée #2955 (#2394.6/.19/.43, LOT r11 30/09) — +1, `propose_crm_note`
    # (le writeback CRM depuis un fil de messagerie). Intégration R (30/09) :
    # s'ACCUMULE avec P05/P06. 183 + 1 = 184.
    # Correctif CI #3448 — +1, le cas limite (aucun CRM branché) de `propose_crm_note`,
    # exigé par la garde du corpus. 184 + 1 = 185.
    # #3345.2 (LAU-FINAL-255, lot E04 30/09) — +1 (« pistes-deja-tranchees-dun-compte »)
    # pour `get_qualification_lead_decisions`, qui n'avait ni scénario ni question.
    # 185 + 1 = 186.
    # #3258.14 (épopée #3362, lot E25 30/09) — +1 (« ou-classer-un-compte-dans-la-matrice »,
    # un seul scénario positif ce lot, aucun cas limite) pour
    # `get_account_interest_penetrability`, qui n'avait ni scénario ni question. 186 + 1 = 187.
    # #3441/#3442/#3444/#3445 (lot C20, 30/09) — +2 (« chercher-un-gabarit-dans-la-bibliotheque »
    # et son cas limite « une-condition-dusage-nest-pas-remplie ») pour
    # `search_content_library`. Intégration C2 : s'ACCUMULE, s'ajoute aux 187 d'ED : 187 + 2 = 189, puis +2 (#3211.9, P12 30/09) = 191.
    # `search_content_library`. Intégration C2 : s'ACCUMULE, s'ajoute aux 187 d'ED : 187 + 2 = 189.
    # #1952.3 / #1952.7 (épopée #2844, lot P07 30/09) — +1 (« lancer-un-matching-massif-en-
    # tache-de-fond ») pour `propose_long_job` : 189 + 1 = 190.
    # #3289 (lot P09, 30/09) — +2 (« quand-relancer-par-email » et son cas limite
    # « creneau-sans-assez-dhistorique ») pour `get_send_timing`. 189 + 2 = 191.
    # Intégration P : 190 (P07) + 2 (P09) = 192, + 1 (P10) = 193.
    # Intégration R : 193 (main) + 2 (P12, #3211.9) = 195.
    # #3427 — +1 (« modele-approuve-bibliotheque »), sans cas limite.
    # #3345.2 (lot Z05, 02/10) — +2 (« ecarter-une-piste-reconnue-perimee » et son cas limite
    # « ecarter-une-piste-sans-dire-pourquoi ») pour `propose_qualification_lead_decision`.
    # #3816.1 (lot C4, 07/10) — +2 (« trouve-moi-des-missions-pour-ce-profil » et son cas limite
    # « missions-pour-un-profil-homonyme ») pour `find_accounts_for_talent`.
    # #3865.2 (lot X05, 08/10) — +2 (« quels-besoins-compatibles-avec-ce-consultant » et son cas
    # limite « besoins-compatibles-aucun-besoin-ouvert ») pour `find_needs_for_talent`.
    # #3871.1 (lot V11, 07/10) — +1 (« contact-parti-de-lentreprise »), sans cas
    # limite ce lot, pour `propose_contact_departure`.
    # #3919 (lot Y10, 08/10) — +2 (« qu-est-ce-qui-bouge-chez-ce-compte » et son cas limite
    # « compte-sans-signal-actif ») pour `get_account_signals`.
    # #3903 (lot Y10, 08/10) — +2 (« chez-qui-relancer-sur-90-jours » et son cas limite
    # « canal-non-observe-dans-le-bilan ») pour `get_reengagement_report`.
    # #3950.1 (décision Louis 09/10/2026, lot G01) — +1 (« exporter-le-vivier-pour-l-ats »),
    # sans cas limite ce lot, pour `launch_vivier_export`.
    # #3904.1 (lot M05, 09/10) — +2 (« mon-plan-d-actions-de-la-semaine » et son cas limite
    # « quel-compte-est-proche-de-signer ») pour `get_action_plan`.
    # #3869.a (lot M05, 09/10) — +2 (« trouve-moi-le-responsable-achats-absent » et son cas limite
    # « une-liste-de-roles-n-est-pas-une-liste-de-contacts ») pour `propose_people_search`.
    # #2433.7 (lot M10, 09/10) — +1 (« signaler-un-bug-depuis-une-capture »), sans cas
    # limite ce lot, pour `prepare_bug_report`.
    # P05.a (lot P05, 09/10) — +2 (« quelle-cadence-marche-ailleurs » et son cas limite
    # « pas-assez-de-donnees-communes ») pour `get_channel_performance` (la base commune).
    # P05.b (lot P05, 09/10) — +1 (« cas-similaires-sans-donnees-communes »), le cas limite
    # qui manquait à `find_similar_cases`.
    # 207 + 2 (#3919) + 2 (#3903) + 1 (#3950.1) + 2 (#3904.1) + 2 (#3869.a) + 1 (#2433.7) + 2 (P05.a) + 1 (P05.b)
    # #3970 (lot P07, 09/10) — +2 (« qui-a-ete-recrute-chez-ce-compte » et son cas limite
    # « recrutement-sans-date-n-est-pas-recent ») pour `get_account_signals`.
    # #3889 (épopée #3977, 11/10) — +2 (« quels-projets-dans-nos-documents-sur-ce-compte » et son cas
    # limite « projet-documentaire-sans-date-ni-statut ») pour `search_document_projects`.
    # 207 + 2 (#3919) + 2 (#3903) + 1 (#3950.1) + 2 (#3904.1) + 2 (#3869.a) + 1 (#2433.7) + 3 (P05) + 2 (#3970)
    # + 2 (#3889) + 2 (#3219, contrôle avant action d'un contact)
    # #4016 L3 — +2 (« resume-un-fil » et son cas limite « fil-illisible »).
    # #4065 (lot LISTINGS, 12/10) — +2 (« liste-des-personnes-rencontrees-3-mois » et son cas limite
    # « liste-rencontrees-absentes-du-crm-sans-crm ») pour `list_records`.
    # #3895 (lot LAURA-B, 12/10) — +2 (« note-achats-d-un-compte » et son cas limite) pour `get_account_notes`.
    # LOT DATA-B (15/10) — +6 (une question et son cas limite pour chacun des trois outils de lecture neufs).
    # #4016.1d — +2 (« chance-de-signer-une-affaire » et son cas limite « non mesurée »).
    # #4055.4/.6 (17/10) — +4 (une question et son cas limite pour `complete_account` et `get_portfolio_sectors`).
    # #4055.10 (18/10) — +2 (« ignore-cette-personne-proposee » et son cas limite) pour `dismiss_completion_person`.
    # #3 (main, +1) puis #4282.9 / #4281.1 (19/10) — +4 (vague 4) (un positif et son cas limite pour `technology_radar` et
    # `search_historical_needs`).
    # #4421.5 (21/10) — +1 (« consultant-selectionne-trouve-moi-des-missions ») pour `find_accounts_for_talent`.
    # #4406.5 (21/10) — +2 (« prepare-reponse-beeper » et son cas limite « beeper-injoignable »).
    # #4462 (22/10) — +2 (« liste-de-noms-hors-espace » ; « analyser-plusieurs-entreprises-dun-coup » devient son
    # cas limite sur `analyze_named_companies` ; « trois-noms-cedes-au-lot » reste le cas limite du lancement seul).
    # #4426.8 (22/10) — +2 (« mon-import-a-t-il-marche » et « combien-de-comptes-en-a ») pour `get_import_overview`.
    # #4421.11 (24/10) — +2 (« cv-joint-trouve-moi-une-mission-a-lille » et son cas limite
    # « fiche-sans-competence-une-seule-question ») pour `find_accounts_for_talent`.
    # #4421.10 (24/10, lot B) — +1 (« mission-a-lille-cv-compte-hors-espace-contacts-meme-tour »).
    # LAURA-OFFRES-4563 (25/10) — +2 (« offres-vue-java-lille-sans-consultant » et son cas limite) pour `search_job_offers`.
    # #4611 (28/10) — +2 (« ou-en-est-le-travail-lance » et son cas limite) pour `get_work_progress`.
    # (`get_work_status`, 26/10, retiré le 28/10 : un seul outil pour « où en est la carte ».)
    # #4759 (29/10) — +2 (« qu-est-ce-qu-ils-cherchaient-en-novembre » et son cas limite) pour `get_account_needs_history`.
    # #4759 (29/10, PR #4797) — +2 (« anciens-besoins-java-a-lille-sur-ce-compte » et son cas limite), même outil.
    # #4792 (30/10) — +2 (« ce-que-notre-base-porte-deja » et son cas limite) pour `search_our_base`.
    assert len(TOOL_SCENARIOS) == 271
    # #3278.3 (lot P10, 30/09) — +1 (« quel-canal-repond-le-mieux-chez-nous ») pour `get_channel_performance`.
    assert len(PROMPT_SCENARIOS) == 21
    assert len(TOOL_SCENARIOS) + len(PROMPT_SCENARIOS) == 292  # 271 + 21

    names = [s.name for s in TOOL_SCENARIOS] + [s.name for s in PROMPT_SCENARIOS]
    assert len(names) == len(set(names)), "Deux scénarios portent le même nom : un rapport de test devient illisible."
    for scenario in TOOL_SCENARIOS:
        assert scenario.fragments, f"« {scenario.name} » sans fragment passe toujours."
        assert scenario.question.strip(), f"« {scenario.name} » sans question ne documente rien."
    for prompt_scenario in PROMPT_SCENARIOS:
        assert prompt_scenario.fragments, f"« {prompt_scenario.name} » sans fragment passe toujours."
        assert prompt_scenario.question.strip()
        assert prompt_scenario.block in BLOCKS


def test_1863_the_question_before_and_the_question_after_never_stand_in_for_each_other() -> None:
    """LA TENSION DU LOT #1863, tenue par le corpus et pas par une intention.

    ``_BLOCK_ASK_FIRST`` fait demander AVANT de répondre ; ``_BLOCK_CLOSING_
    QUESTION`` fait poser une question APRÈS. Fondus, ils produisent l'un des
    deux défauts : Laura demande DEUX FOIS la même chose (une salve en ouverture,
    une question en clôture), ou elle pose une question À LA PLACE de répondre.

    C'est la troisième preuve exigée d'une garde — NE PAS ATTRAPER LE VOISIN.
    Les deux autres sont déjà tenues pour ces scénarios : le corpus lu est non
    vide (``test_the_eval_reads_a_non_empty_corpus``) et chacun tombe quand son
    bloc quitte le prompt (``test_the_eval_knows_how_to_say_no``).
    """
    assert _BLOCK_ASK_FIRST.strip() and _BLOCK_CLOSING_QUESTION.strip()

    # L'exclusion EST la résolution : sans elle, les deux blocs s'ADDITIONNENT.
    assert "Une même réponse ne porte JAMAIS les deux" in _BLOCK_CLOSING_QUESTION

    # Le moment d'AVANT ne porte aucune règle du moment d'APRÈS…
    for fragment in ("TERMINER PAR UNE QUESTION QUI FAIT AVANCER", "de la politesse, pas du travail"):
        assert fragment not in _BLOCK_ASK_FIRST, (
            f"« {fragment} » a migré dans le bloc du moment d'AVANT : les deux moments se confondent."
        )

    # …et le moment d'APRÈS ne réécrit aucune règle du moment d'AVANT. Un
    # réglage vit à un seul endroit : deux blocs qui disent quoi demander
    # divergent au premier réglage de l'un des deux.
    for fragment in ("DEMANDER AVANT DE CHERCHER", "Deux précisions au plus"):
        assert fragment in _BLOCK_ASK_FIRST, f"« {fragment} » a quitté le bloc qui le porte."
        assert fragment not in _BLOCK_CLOSING_QUESTION, (
            f"« {fragment} » est recopié dans le bloc de clôture : la règle vivrait à deux endroits."
        )


def test_1863_the_two_par_ou_je_commence_are_told_apart() -> None:
    """« Par où je commence » se dit sur un PORTEFEUILLE et sur le PRODUIT.

    Deux règles voisines qui ne se départagent pas en produisent une troisième,
    inventée par le modèle. Le témoin du cas légitime voisin : le format du
    classement de comptes ne déborde pas dans le bloc de découverte.
    """
    assert "NE CONFONDS PAS LES DEUX « PAR OÙ JE COMMENCE »" in _BLOCK_DISCOVERY
    assert "TROIS COMPTES AU PLUS" in _BLOCK_PRIORITISATION
    assert "TROIS COMPTES AU PLUS" not in _BLOCK_DISCOVERY, (
        "le bloc de découverte réécrit le format du classement : les deux demandes se confondraient."
    )


def test_2325_pipe_health_and_account_ranking_are_told_apart() -> None:
    """« Quelles affaires prioriser » se dit sur le PIPE (des opportunités) et sur
    le PORTEFEUILLE (des comptes) — #2325.7/.15/.16/.21/.23/.24/.25.

    RÉFUTÉ ÉCRAN 25/09 nuit R5 (prod) : le mot « prioriser » matchait le
    déclencheur de `_BLOCK_PRIORITISATION` (un classement de COMPTES) et la
    question partait vers un playbook secteur, jamais vers `get_pipeline_health`.
    Sans ligne de partage écrite dans les deux, rien ne dit au modèle où finit
    l'un et où commence l'autre.
    """
    description = DESCRIPTIONS["get_pipeline_health"]
    assert "get_pipeline_health" in _BLOCK_PRIORITISATION, (
        "le bloc de classement de comptes ne redirige pas vers le diagnostic de pipe."
    )
    assert "n'est pas un COMPTE" in description
    assert "TROIS COMPTES AU PLUS" not in description, (
        "le format de classement de comptes ne doit jamais migrer dans le diagnostic de pipe."
    )


def test_1863_the_two_new_blocks_stay_within_their_budget() -> None:
    """Une consigne se paie sur TOUS les tours, y compris « c'est quoi le SIREN ? ».

    Ces deux blocs partent à chaque appel, dans les deux chemins du chat, sur un
    tour qui a 90 s de budget et 105 s de plafond dur. Les bornes sont calées
    sur le plus gros bloc de conduite déjà en place — ``_BLOCK_PRIORITISATION``,
    1 696 caractères. Les dépasser reste possible : c'est alors une DÉCISION de
    coût, prise en relevant la borne, pas une dérive qui passe inaperçue.
    """
    assert len(_BLOCK_CLOSING_QUESTION) <= 1800, (
        f"Le bloc de clôture fait {len(_BLOCK_CLOSING_QUESTION)} caractères : il se paie sur "
        "tous les tours, y compris ceux où aucune question de fin ne sera posée."
    )
    assert len(_BLOCK_DISCOVERY) <= 1900, (
        f"Le bloc de découverte fait {len(_BLOCK_DISCOVERY)} caractères : il se paie sur tous "
        "les tours, alors qu'il ne sert qu'aux premiers échanges d'une personne."
    )


def test_1793_the_durable_is_told_apart_from_the_circumstantial() -> None:
    """LE CŒUR DE #1793 — sans critère écrit, « retiens ça » retient TOUT.

    Le geste demandé : on colle un paragraphe sur son ESN, et Laura en garde ce
    qui comptera encore dans six mois. Le mécanisme existait déjà
    (``pin_memory_fact``) ; ce qui n'existait nulle part, c'est la ligne de
    partage. Sans elle, une mémoire se remplit de « je suis en déplacement
    demain » — et une mémoire encombrée de détails périmés n'est plus lue.

    Les deux exemples sont dans le bloc À DESSEIN : un critère sans exemple se
    relit comme une préférence de style, et c'est le premier qu'on « simplifie ».
    """
    assert "Est DURABLE ce qui serait encore vrai au prochain compte" in _BLOCK_DURABLE_CONTEXT
    assert "Est CIRCONSTANCIEL ce qui expire tout seul" in _BLOCK_DURABLE_CONTEXT

    durable = _BLOCK_DURABLE_CONTEXT.index("On vend surtout à des DSI de banques")
    circonstanciel = _BLOCK_DURABLE_CONTEXT.index("je suis en déplacement demain")
    assert durable < circonstanciel, "l'exemple qui se retient vient AVANT celui qui ne se retient pas"

    # Le doute tranche vers le SILENCE, jamais vers l'épinglage : c'est ce qui
    # empêche la règle de devenir « propose à chaque tour ».
    assert "Dans le doute tu ne proposes rien" in _BLOCK_DURABLE_CONTEXT


def test_1793_the_pinning_tool_no_longer_forbids_the_initiative_it_is_now_asked_to_take() -> None:
    """UNE RÈGLE ET UN OUTIL NE PEUVENT PAS SE CONTREDIRE DANS LE MÊME TOUR.

    ``pin_memory_fact`` écrivait « à sa demande explicite — jamais de ta propre
    initiative ». #1793 demande exactement l'inverse : que Laura PROPOSE quand
    on vient de lui donner du durable. Les deux textes partent au modèle
    ENSEMBLE — la description dans le registre, le bloc dans le prompt. Laissés
    tels quels, ils ne s'annulent pas : ils produisent une troisième conduite,
    inventée par le modèle, exactement le défaut que ce dépôt a déjà payé sur
    les deux « par où je commence ».

    Ce qui n'a PAS bougé, et c'est l'invariant : l'outil n'écrit toujours rien
    lui-même. Proposer n'est pas épingler.
    """
    description = DESCRIPTIONS["pin_memory_fact"]
    assert "jamais de ta propre initiative" not in description
    assert "élément DURABLE" in description
    assert "n'écrit rien lui-même" in description

    # LE TÉMOIN DU VOISIN : l'interdit n'a pas été retiré du registre entier.
    # Basculer une routine ou changer un réglage reste une demande explicite —
    # ce sont des états que la personne a réglés, pas ce qu'elle vient de dire.
    for neighbour in ("toggle_routine", "propose_settings_update"):
        assert "jamais de ta propre initiative" in DESCRIPTIONS[neighbour], (
            f"« {neighbour} » a perdu l'interdit d'initiative avec le lot #1793 : "
            "la règle du contexte durable a débordé sur des écritures qu'elle ne vise pas."
        )


def test_1820_the_missing_MATTER_is_not_the_missing_PRECISION() -> None:
    """LA TENSION DE #1820, tenue par le corpus et pas par une intention.

    ``_BLOCK_ASK_FIRST`` fait demander une PRÉCISION : un critère qui cadre le
    tour et se répond d'un mot. Ce bloc-ci dit quoi faire quand ce n'est pas une
    précision qui manque, mais de la MATIÈRE dans l'espace — elle ne se répond
    pas, elle se comble par un geste. Fondus, ils produisent l'un des deux
    défauts : Laura réclame un territoire à quelqu'un dont l'espace est vide, ou
    elle propose un import quand il suffisait de demander le territoire.

    C'est la troisième preuve exigée d'une garde — NE PAS ATTRAPER LE VOISIN.
    Les deux autres sont tenues ailleurs : le corpus lu est non vide
    (``test_the_eval_reads_a_non_empty_corpus``) et les deux scénarios tombent
    quand le bloc quitte le prompt (``test_the_eval_knows_how_to_say_no``).
    """
    assert _BLOCK_ASK_FIRST.strip() and _BLOCK_DURABLE_CONTEXT.strip()
    assert "CE N'EST PAS UNE PRÉCISION QUE TU RÉCLAMES" in _BLOCK_DURABLE_CONTEXT
    assert "Pas les deux dans le même tour" in _BLOCK_DURABLE_CONTEXT

    # Le bloc de la MATIÈRE ne réécrit aucune règle du bloc de la PRÉCISION :
    # un réglage vit à un seul endroit, deux copies divergent au premier réglage.
    for fragment in ("Deux précisions au plus", "ce qui CHANGERAIT ta réponse"):
        assert fragment in _BLOCK_ASK_FIRST, f"« {fragment} » a quitté le bloc qui le porte."
        assert fragment not in _BLOCK_DURABLE_CONTEXT, (
            f"« {fragment} » est recopié dans le bloc du contexte durable : les deux se confondraient."
        )

    # LE TÉMOIN DU CAS LÉGITIME VOISIN : quelqu'un qui DÉCOUVRE le produit garde
    # son propre premier geste. « Il te manque du contexte » ne l'avale pas.
    assert "LE PREMIER GESTE" in _BLOCK_DISCOVERY
    assert "LE PREMIER GESTE" not in _BLOCK_DURABLE_CONTEXT


def test_1820_the_conversation_still_launches_no_import() -> None:
    """NE PROMETS AUCUNE CAPACITÉ INEXISTANTE.

    Le bloc invite Laura à proposer l'import : c'est précisément là qu'une
    phrase de trop ferait dire « envoie-moi ton fichier ». Elle ne lance pas
    d'import depuis la conversation, et ce n'est pas un manque — un import ÉCRIT
    dans les données, donc il passe par un écran où le geste est visible et où
    le clic est la décision.
    """
    assert "Tu ne lances aucun import depuis la conversation" in _BLOCK_DURABLE_CONTEXT
    lowered = PROMPT.lower()
    for promesse in ("envoie-moi ton fichier", "joins ton fichier", "transmets-moi ton fichier"):
        assert promesse not in lowered, f"le prompt promet de recevoir un fichier : « {promesse} »"

    # Le témoin NÉGATIF de cette garde : sur une phrase FABRIQUÉE, elle trouve.
    # Une garde qui ne trouve jamais rien ne prouve pas qu'elle saurait trouver.
    fabrique = "Envoie-moi ton fichier de comptes et je l'importe."
    assert any(p in fabrique.lower() for p in ("envoie-moi ton fichier",))


def test_1793_1820_the_new_block_stays_within_its_budget() -> None:
    """Une consigne se paie sur TOUS les tours, y compris « c'est quoi le SIREN ? ».

    Le bloc part à chaque appel, dans les deux chemins du chat, sur un tour qui
    a 90 s de budget et 105 s de plafond dur. La borne est celle du plus gros
    bloc de conduite déjà en place — ``_BLOCK_DISCOVERY``. La dépasser reste
    possible : c'est alors une DÉCISION de coût, prise en relevant la borne, pas
    une dérive qui passe inaperçue.
    """
    assert len(_BLOCK_DURABLE_CONTEXT) <= 1900, (
        f"Le bloc du contexte durable fait {len(_BLOCK_DURABLE_CONTEXT)} caractères : il se paie "
        "sur tous les tours, y compris ceux où personne ne colle de contexte."
    )


def test_the_eval_knows_how_to_say_no() -> None:
    """On RETIRE ce que chaque scénario protège, et on vérifie qu'il tombe.

    Pour une question outillée : la description de SON outil quitte le corpus,
    et le scénario doit échouer. Pour une question de conduite : son bloc quitte
    le prompt. Un scénario qui resterait vert sur le corpus dégradé serait
    satisfait ailleurs — il ne protégerait rien.
    """
    still_green: list[str] = []
    for scenario in TOOL_SCENARIOS:
        degraded = "\n".join(text for name, text in DESCRIPTIONS.items() if name != scenario.tool)
        assert DESCRIPTIONS[scenario.tool] not in degraded
        if all(fragment in degraded for fragment in scenario.fragments):
            still_green.append(scenario.name)

    for prompt_scenario in PROMPT_SCENARIOS:
        degraded_prompt = PROMPT.replace(BLOCKS[prompt_scenario.block], "")
        assert len(degraded_prompt) < len(PROMPT)
        if all(fragment in degraded_prompt for fragment in prompt_scenario.fragments):
            still_green.append(prompt_scenario.name)

    assert not still_green, (
        f"Ces scénarios passent encore sans ce qu'ils protègent : {still_green}. "
        "La garde est borgne : choisis des fragments propres à l'outil ou au bloc."
    )


def test_no_fragment_survives_the_removal() -> None:
    """Le cran au-dessus : AUCUN fragment, pris seul, ne se trouve ailleurs.

    Un scénario peut tomber pour un seul de ses trois fragments pendant que les
    deux autres sont satisfaits par un voisin — il serait alors vert par accident
    le jour où quelqu'un réécrit le troisième. Sur un registre de 52 outils qui
    se ressemblent (« Lecture seule », « tu prépares, le commercial envoie »),
    c'est le défaut le plus probable de tout ce fichier.
    """
    survivors: dict[str, list[str]] = {}
    for scenario in TOOL_SCENARIOS:
        elsewhere = PROMPT + "\n" + "\n".join(text for name, text in DESCRIPTIONS.items() if name != scenario.tool)
        found = [fragment for fragment in scenario.fragments if fragment in elsewhere]
        if found:
            survivors[scenario.name] = found

    for prompt_scenario in PROMPT_SCENARIOS:
        degraded_prompt = PROMPT.replace(BLOCKS[prompt_scenario.block], "")
        found = [fragment for fragment in prompt_scenario.fragments if fragment in degraded_prompt]
        if found:
            survivors[prompt_scenario.name] = found

    assert not survivors, (
        f"Fragments trouvés ailleurs que dans ce qu'ils protègent : {survivors}. "
        "Choisis une formulation propre, sinon la garde protège une coïncidence."
    )


def test_chain_blockers_description_does_not_promise_mine_unconditionally() -> None:
    """LOT 15, trou 2 — le cloisonnement de portefeuille (D5) est réglé côté
    NestJS, mais `portfolio_visibility = 'open'` reste le défaut ASSUMÉ du
    produit : sans réglage explicite, `get_chain_blockers` rend TOUJOURS le
    portefeuille de l'équipe. La description promettait pourtant « où est-ce
    que MES dossiers bloquent » sans condition — un commercial d'un espace
    ouvert répéterait donc « mes dossiers » en réunion pour un dossier qui
    appartient à un collègue.

    La réponse elle-même ne porte AUCUN champ disant quel mode s'est appliqué
    (contrairement à `get_revenue`, dont `scope` voyage avec les chiffres) :
    le modèle ne peut donc pas le déduire après coup. La seule correction
    honnête est dans la description elle-même — dire la CONDITION, et dire au
    modèle de ne pas trancher un périmètre qu'il ne peut pas observer.
    """
    description = DESCRIPTIONS["get_chain_blockers"]
    # L'ancienne promesse inconditionnelle a disparu de l'exemple de requête.
    assert "où est-ce que mes dossiers bloquent" not in description
    # La condition réelle est écrite : le réglage d'espace, ses deux issues.
    assert "cloisonn" in description
    assert "équipe" in description
    # Les deux fragments protégés par le scénario `ou-ca-bloque` de ce fichier
    # (voir TOOL_SCENARIOS) doivent survivre à la réécriture.
    for fragment in ("Tu ne peux rien envoyer", "la raison vérifiable"):
        assert fragment in description


def test_job_changes_description_does_not_promise_the_portfolio_is_mine() -> None:
    """LOT 17 — le MÊME trou que LOT 15, sur un second outil.

    Côté NestJS, `jobChanges` scope désormais les contacts au cloisonnement de
    portefeuille (D5, `portfolioScopeFor`) — mais `portfolio_visibility =
    'open'` reste le défaut ASSUMÉ du produit : sans réglage explicite,
    `get_job_changes` rend TOUJOURS les contacts de toute l'équipe. La
    description disait pourtant « les contacts DU PORTEFEUILLE », qu'un
    commercial d'un espace ouvert lirait comme « les miens » pour un contact
    qui appartient à un collègue.

    La réponse ne porte AUCUN champ disant quel mode s'est appliqué (comme
    `get_chain_blockers`, et contrairement à `get_revenue`) : le modèle ne
    peut pas le déduire après coup. La seule correction honnête est dans la
    description elle-même — calquée sur celle de `get_chain_blockers`, pas
    un vocabulaire réinventé.
    """
    description = DESCRIPTIONS["get_job_changes"]
    # L'ancienne promesse inconditionnelle a disparu de l'ouverture.
    assert "contacts du portefeuille" not in description
    # La condition réelle est écrite : le réglage d'espace, ses deux issues.
    assert "cloisonn" in description
    assert "équipe" in description
    # La réserve « présomption, pas un fait » — protégée par le scénario
    # `qui-a-change-de-boite` de ce fichier (voir TOOL_SCENARIOS) — survit à
    # la réécriture.
    for fragment in ("c'est une PRÉSOMPTION, pas un fait établi", "Ne dis JAMAIS qu'un contact A changé de poste"):
        assert fragment in description
