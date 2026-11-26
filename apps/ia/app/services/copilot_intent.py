"""#2797 — le vocabulaire des intentions de Laura, EN CODE D'APPLICATION.

`chantiers-livres.md` documente le « routeur d'intentions en code » comme
REPORTÉ (dette PDF 1-6) : classer l'énoncé utilisateur vers les 14 catégories
nommées du corpus (`Décider`/`Analyser`/`Découvrir`/…), avec des evals de
précision par catégorie et un repli sur ambiguïté, est un chantier de
plusieurs jours — confirmé absent le 16/09 puis le 25/09 (`git grep` : aucun
module de classement dans `apps/ia/app` ni `apps/api/src`).

Avant ce lot, les 14 catégories (#1948.29 → .42, `Categorie` dans
`apps/ia/tests/copilote_scenario_metadata.py`) n'existaient QUE comme
métadonnées de TEST — aucun code d'application ne les portait. Un futur
classement ne peut pas se construire sur un vocabulaire qui n'existe que dans
les tests : ce module le porte, avec les MÊMES valeurs (le numéro du
registre), pour qu'un futur routeur les lise depuis l'app.

Ce module ne prétend PAS résoudre le chantier : `classify_intent_by_keyword`
ne couvre volontairement qu'un sous-ensemble des 14 catégories, sur des
mots-clés SANS AMBIGUÏTÉ. Le reste — couverture complète, evals de précision
par catégorie, câblage dans `chat_orchestrator`, repli sur ambiguïté au
runtime — reste à construire. Aucune probabilité, aucun score : la première
règle qui matche, ou `None` (jamais une catégorie devinée sur une
ressemblance).
"""

from __future__ import annotations

from enum import StrEnum


class CopilotIntentCategory(StrEnum):
    """Les 14 catégories du registre (#1948.29 → .42) — la valeur EST le
    numéro du registre, même discipline que `Categorie` côté test."""

    DECIDER = "1948.29"
    ANALYSER = "1948.30"
    DECOUVRIR = "1948.31"
    TROUVER_UN_CONTACT = "1948.32"
    TROUVER_UN_BESOIN = "1948.33"
    POSITIONNER_UN_CONSULTANT = "1948.34"
    PREPARER_UN_RENDEZ_VOUS = "1948.35"
    GENERER_UN_MESSAGE = "1948.36"
    CREER_UNE_SEQUENCE = "1948.37"
    SUIVRE_UNE_MISSION = "1948.38"
    PILOTER = "1948.39"
    CORRIGER_UNE_DONNEE = "1948.40"
    COMPRENDRE_UNE_PAGE = "1948.41"
    DEMANDER_DE_L_AIDE = "1948.42"


# Un sous-ensemble VOLONTAIREMENT partiel : seules les catégories qui ont un
# mot-clé français sans ambiguïté raisonnable figurent ici. Ajouter une
# catégorie exige un mot-clé aussi sûr — jamais une approximation pour
# « compléter le tableau ».
_KEYWORD_RULES: tuple[tuple[CopilotIntentCategory, tuple[str, ...]], ...] = (
    (
        # #2320.1 (LOT r3) — le verbe « analyser » vise sans ambiguïté les
        # outils de chat déjà bâtis `plan_account_analysis`/
        # `start_account_analysis` (registre #1948.30, `PARTIEL` — les deux
        # outils existent, seul le câblage dans `chat_orchestrator` manque).
        CopilotIntentCategory.ANALYSER,
        ("analyse cette entreprise", "analyser cette entreprise", "lance une analyse", "analyser ce compte"),
    ),
    (
        CopilotIntentCategory.TROUVER_UN_CONTACT,
        ("trouve-moi un contact", "trouver un contact", "qui contacter", "chercher un contact"),
    ),
    (
        CopilotIntentCategory.TROUVER_UN_BESOIN,
        ("trouve un besoin", "trouver un besoin", "chercher un besoin"),
    ),
    (
        CopilotIntentCategory.POSITIONNER_UN_CONSULTANT,
        ("positionne ", "positionner "),
    ),
    (
        CopilotIntentCategory.GENERER_UN_MESSAGE,
        ("rédige un message", "écris un message", "génère un message", "prépare un message"),
    ),
    (
        CopilotIntentCategory.DEMANDER_DE_L_AIDE,
        ("comment ça marche", "aide-moi", "j'ai besoin d'aide", "comment faire"),
    ),
    # #2797 (lot g27, 26/09) — CREER_UNE_SEQUENCE : les mêmes formulations que
    # celles documentées par l'outil de chat réel qu'elle vise, `prepare_campaign`
    # (`chat_tools.py`, #1903.10/#1935) — « prépare-moi une campagne sur ces
    # comptes », « lance une séquence sur ces contacts », « prépare une prise de
    # contact groupée ». Aucune ambiguïté avec GENERER_UN_MESSAGE : « campagne »/
    # « séquence » ne recoupe jamais « message ».
    (
        CopilotIntentCategory.CREER_UNE_SEQUENCE,
        (
            "prépare une campagne",
            "prépare-moi une campagne",
            "lance une séquence",
            "crée une séquence",
            "créer une séquence",
            "prépare une prise de contact groupée",
        ),
    ),
)


def classify_intent_by_keyword(utterance: str) -> CopilotIntentCategory | None:
    """La première règle qui matche — jamais un score, jamais une probabilité.

    Ne couvre qu'un sous-ensemble des 14 catégories : une règle non SÛRE ne
    devine pas, elle rend `None` (à laisser à la clarification existante,
    bornée à un tour), même principe que `hasIdentitySignal` côté import CV
    — l'absence de matière n'est jamais lue comme une conclusion.
    """
    normalised = utterance.strip().lower()
    if not normalised:
        return None
    for category, keywords in _KEYWORD_RULES:
        if any(keyword in normalised for keyword in keywords):
            return category
    return None
