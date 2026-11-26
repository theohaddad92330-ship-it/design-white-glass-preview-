"""Le jeu de référence MÉMOIRE MARCHÉ de Laura — la part que #1819 rattache à
#1628 (fermée), et le chemin pour que le catalogue de 60 questions le rejoigne.

─────────────────────────────────────────────────────────────────────────────
CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS
─────────────────────────────────────────────────────────────────────────────
#1628 (« LAURA — MARKET MEMORY », fermée) demandait UNE primitive structurée
plutôt que 60 outils — `search_market_memory` existe (`chat_tools.py`) — et
disait : « Les 60 questions du catalogue deviennent un golden set de tests,
pas des boutons. » Le catalogue lui-même n'a jamais été copié dans le dépôt
(mesuré : aucune occurrence des 60 questions, seulement les CINQ exemples
donnés verbatim dans le corps de l'issue). #1819 (« un système de test ultra
complet sur tout le scope de Laura ») rattache ce manque : il lui faut un
propriétaire.

Ce fichier N'INVENTE AUCUNE question — ce serait de la donnée fictive pour
mesurer une chose que personne n'a demandée (règle du dépôt, CLAUDE.md). Il
reprend les CINQ questions écrites par Louis dans #1628, verbatim, et
n'exécute PAS le modèle dessus (trop cher, non déterministe, et ça ne dirait
rien d'un déploiement futur — même choix que `test_copilote_security_eval.py`,
`test_copilote_truth_levels_eval.py`, `test_copilote_ask_before_answering_eval.py`,
les trois fichiers qui couvrent déjà une partie de ce que #1819 demande).
Chaque scénario vérifie qu'une RÈGLE ÉCRITE existe pour la question — jamais
qu'une réponse précise sortirait.

─────────────────────────────────────────────────────────────────────────────
LA FORME D'UNE ENTRÉE, POUR LA PERSONNE QUI VERSERA LES 55 RESTANTES
─────────────────────────────────────────────────────────────────────────────
Un tuple ``(nom, question_verbatim, fragments_attendus)`` — EXACTEMENT la forme
que portent déjà les trois fichiers cités : `nom` identifie le scénario dans un
rapport de test, `question_verbatim` est la question TELLE QU'UN COMMERCIAL LA
POSE (jamais reformulée — c'est le texte contre lequel le fragment a été
écrit), `fragments_attendus` sont des morceaux de texte que la RÈGLE ÉCRITE
(description d'outil ou bloc de prompt) doit contenir pour que Laura traite
cette question correctement.

Où verser une question : dans ce fichier, un tuple de plus dans
`MARKET_MEMORY_SCENARIOS` — ou dans un fichier voisin `test_copilote_<sujet>_eval.py`
si la question ne parle pas de mémoire marché (une question sur le pipe, sur
les crédits, sur l'agenda… suit le même patron). Le portail ne fait qu'UNE
chose de cette entrée : la faire tourner comme n'importe quel test pytest —
zéro appel modèle, zéro coût, zéro latence, et donc zéro raison de ne pas en
avoir des centaines.

─────────────────────────────────────────────────────────────────────────────
LE COMPTE, AUJOURD'HUI (mesuré, pas estimé)
─────────────────────────────────────────────────────────────────────────────
Trois familles existaient déjà avant ce lot, sous le même patron :
- `test_copilote_security_eval.py` — 14 scénarios (exfiltration, multi-tenant,
  injection, envoi de masse, crédits, fausse confirmation) ;
- `test_copilote_ask_before_answering_eval.py` — 7 scénarios ;
- `test_copilote_truth_levels_eval.py` — 5 niveaux (FAIT/OBSERVATION/
  INFÉRENCE/HYPOTHÈSE/SPÉCULATION).
Zéro ne couvrait la mémoire marché spécifiquement. Ce fichier en ajoute
CINQ TENTATIVES honnêtes — trois vérifiées et vertes, DEUX documentées comme
une CAPACITÉ ABSENTE plutôt que forcées au vert (voir
`test_no_tool_answers_the_lookalike_accounts_question` et le commentaire sur
la question du portefeuille) : au total, 26 scénarios existants + 3 nouveaux
scénarios verts + 2 constats d'absence honnêtes dans cette seule famille.
Un humain qui verse les 55 questions restantes du catalogue original suit
CE gabarit.

⚠️ MISE À JOUR DU 11/09/2026 (#1819) — les 55 questions ont été versées, et
elles NE SONT PAS celles du catalogue original : il vit hors dépôt et n'est
pas récupérable (note de bas de page cassée). `test_copilote_scope_eval.py`
les DÉRIVE du scope réellement exploitable — les 52 outils déclarés et les
blocs du prompt — sous ce gabarit exactement : 60 scénarios verts et SEPT
constats d'absence de plus. Les deux absences ci-dessous n'y sont pas
reprises ; elles restent la propriété de ce fichier.
"""

from __future__ import annotations

from typing import NamedTuple

from app.prompts.bellum_advisor import build_system_prompt
from app.services import chat_tools
from app.services.market_memory_wording import market_memory_forbidden_hits
from tests.copilote_scenario_metadata import (
    Action,
    Categorie,
    JamaisInventer,
    Meta,
    Moment,
    Nature,
    Objet,
    Recette1945,
)

PROMPT = build_system_prompt({}, {}, "", "")


def _tool(name: str) -> dict:
    return next(item for item in chat_tools.CHAT_TOOLS if item["name"] == name)


class Scenario(NamedTuple):
    name: str
    #: La question VERBATIM, telle qu'écrite dans #1628 — jamais reformulée.
    question: str
    fragments: tuple[str, ...]
    # #1948.20 — l'outil qui porte la règle. Il était implicite (le test
    # aiguillait par NOM de scénario) ; la vue canonique a besoin de le lire.
    tool: str
    # #1948.11 — les métadonnées du scénario, au schéma unique.
    meta: Meta


#: Les trois premiers exemples de #1628, vérifiés contre le texte RÉEL du
#: dépôt (description d'outil `search_market_memory` ou `get_esn_on_account`).
MARKET_MEMORY_SCENARIOS: tuple[Scenario, ...] = (
    Scenario(
        "consultant-disponible-vers-comptes",
        "J'ai un Java disponible, chez qui ?",
        # `search_market_memory` doit pouvoir filtrer par technologie ET dire
        # que le résultat est une observation, jamais un besoin ouvert.
        ("technology", "observ"),
        tool="search_market_memory",
        meta=Meta(
            moment=Moment.STAFFING,
            intention=Categorie.POSITIONNER_UN_CONSULTANT,
            secondaires=(Categorie.DECOUVRIR,),
            objets=(Objet.CONSULTANT, Objet.OBSERVATION_MARCHE),
            page="/consultants/$id/reverse-market",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            situations=(Recette1945.CONSULTANT_DISPONIBLE,),
        ),
    ),
    Scenario(
        "environnements-observes-par-zone",
        "Quels environnements Data sont observés autour de Lille ?",
        # Filtre localisation ET famille de rôle — les deux critères de la
        # question doivent exister dans le schéma de l'outil.
        ("location", "role_family"),
        tool="search_market_memory",
        meta=Meta(
            moment=Moment.PROSPECTION,
            intention=Categorie.DECOUVRIR,
            objets=(Objet.OBSERVATION_MARCHE, Objet.TERRITOIRE),
            page="/accounts/marches",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
        ),
    ),
    Scenario(
        "esn-gravitant-autour-dun-compte",
        "Quelles ESN gravitent autour de Thales ?",
        ("gravitent", "OBSERVÉE"),
        tool="get_esn_on_account",
        meta=Meta(
            moment=Moment.QUALIFICATION,
            intention=Categorie.ANALYSER,
            objets=(Objet.COMPTE, Objet.PARTENAIRE),
            page="/accounts/$id",
            jamais_inventer=(JamaisInventer.ETAT_ACTUEL,),
            action=Action.AUCUNE,
            nature=Nature.POSITIF,
            situations=(Recette1945.OBSERVATION_HISTORIQUE,),
        ),
    ),
)


def test_each_scenario_documents_a_real_written_rule() -> None:
    """(a) — chaque fragment attendu existe RÉELLEMENT dans le texte visé, pas
    seulement dans l'intention de ce fichier."""
    search_tool_description = str(_tool("search_market_memory")["description"])
    search_tool_properties = set(_tool("search_market_memory")["input_schema"]["properties"])
    esn_tool_description = str(_tool("get_esn_on_account")["description"])

    for scenario in MARKET_MEMORY_SCENARIOS:
        # #1948.20 — l'outil déclaré existe, et c'est bien celui que le test lit.
        assert _tool(scenario.tool), scenario.name
        if scenario.name == "esn-gravitant-autour-dun-compte":
            for fragment in scenario.fragments:
                assert fragment in esn_tool_description, scenario.name
        elif scenario.name == "consultant-disponible-vers-comptes":
            assert "technology" in search_tool_properties, scenario.name
            assert "observ" in search_tool_description.lower(), scenario.name
        elif scenario.name == "environnements-observes-par-zone":
            assert {"location", "role_family"} <= search_tool_properties, scenario.name


def test_none_of_the_scenario_questions_would_be_answered_with_forbidden_wording() -> None:
    """(c) — la garde transverse de #1629.2, appliquée à CE jeu de référence :
    les textes qui répondraient à ces questions n'affirment aucun fait actuel
    à partir d'une observation."""
    search_tool_description = str(_tool("search_market_memory")["description"])
    esn_tool_description = str(_tool("get_esn_on_account")["description"])
    assert market_memory_forbidden_hits(search_tool_description) == []
    # `get_esn_on_account` cite volontairement les mots interdits dans SA
    # clause DÉCLARÉE (le détail et la preuve complète vivent dans
    # `test_market_memory_vocabulary_guard.py`) — ce test-ci vérifie que le
    # reste du texte, hors cette clause, en est exempt : la question de #1628
    # porte sur ce qui GRAVITE (observé/inféré), jamais sur une déclaration.
    start = esn_tool_description.index("elle SEULE autorise")
    end = esn_tool_description.index(")", start) + 1
    remainder = esn_tool_description[:start] + esn_tool_description[end:]
    assert market_memory_forbidden_hits(remainder) == []


def test_a_present_tense_hiring_question_requires_crossing_with_a_current_signal() -> None:
    """La RÈGLE écrite dans #1628 elle-même, reprise ici : une question qui
    contient un marqueur de présent (« aujourd'hui », « recrute », « cherche »,
    « ouvert », « en cours », « maintenant ») ne se répond JAMAIS avec la seule
    mémoire marché — elle exige une vérification par une source actuelle. La
    RÈGLE TEMPORELLE du prompt copilote porte déjà cette exigence."""
    assert "RÈGLE TEMPORELLE" in PROMPT
    for marker in ("aujourd'hui", "maintenant", "recrute", "cherche", "ouvert", "en cours"):
        assert marker in PROMPT
    assert "une observation seule ne suffit pas" in PROMPT
    # #1961.31 — « proposer de vérifier » ne suffisait pas : la RÈGLE nomme
    # désormais le geste concret (une analyse de compte, PAYANTE — #1961.26
    # rend déjà la LECTURE de la mémoire marché gratuite, ce n'est pas la même
    # chose qu'on propose ici).
    assert "vérification fraîche et payante" in PROMPT
    assert "analyse de compte" in PROMPT


def test_no_tool_answers_the_lookalike_accounts_question() -> None:
    """CONSTAT D'ABSENCE, pas un test forcé au vert — quatrième exemple de
    #1628 : « Quels comptes ressemblent à Decathlon ? ». La fonctionnalité
    EXISTE côté web (Découvrir → `apps/web/src/features/discover/view/
    SimilarPanel.tsx`, « comptes proches de tes références »), mais AUCUN
    outil de `chat_tools.py` ne l'expose à Laura (mesuré : zéro occurrence de
    « ressemble »/« similar » dans ce fichier). Ce test documente le manque
    au lieu de le taire — c'est un candidat pour la prochaine capacité
    ajoutée au registre, pas pour ce lot."""
    assert not any("ressemble" in str(tool.get("description", "")).lower() for tool in chat_tools.CHAT_TOOLS)


# ── Ce qui reste HONNÊTEMENT hors de ce lot ─────────────────────────────────
#
# Le cinquième exemple de #1628 — « Quels comptes de mon portefeuille ont un
# recours externe observé ? » — demande un filtre PORTEFEUILLE (mes comptes
# à moi) sur la mémoire marché, alors que `search_market_memory` interroge le
# corpus PARTAGÉ entier, sans notion de portefeuille (GA-16 : les tables sont
# partagées entre espaces, `search_market_memory` n'a pas d'`accountId`). Une
# vraie réponse demanderait de croiser la liste de comptes du portefeuille
# (API) avec `coverageFor` par compte — c'est exactement `market_paths_observed`
# côté `accounts.controller.ts:330`, DÉJÀ exposé à l'écran Comptes, mais AUCUN
# outil de `chat_tools.py` ne le lit pour répondre à cette question précise
# depuis la conversation. Ni prouvé faux ni corrigé ici — mesurer le lien
# exact entre les deux mériterait son propre lot plutôt qu'un test qui
# devinerait la réponse.
