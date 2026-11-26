"""#2797 — LA PREMIÈRE BRIQUE du routeur d'intentions en code, jamais le routeur.

`chantiers-livres.md` documente le routeur d'intentions comme REPORTÉ (dette
PDF 1-6) : classer l'énoncé utilisateur vers les 14 catégories du corpus
(`Décider`/`Analyser`/`Découvrir`/…), avec des evals de précision PAR
CATÉGORIE et un repli sur ambiguïté, est un chantier de plusieurs jours —
confirmé absent le 16/09 et le 25/09 par une recherche dans `apps/ia/app` ET
`apps/api/src` (`git grep` : aucun module de classement).

Ce test-ci ne prouve PAS un routeur. Il prouve la brique qui manquait avant
même de pouvoir en écrire un : le VOCABULAIRE des 14 catégories existe
maintenant en CODE D'APPLICATION (`app.services.copilot_intent`), pas
seulement dans les métadonnées de test (`copilote_scenario_metadata.Categorie`,
`apps/ia/tests/`) — et une RÈGLE, déterministe, sans modèle ni probabilité,
classe un énoncé NON AMBIGU dans l'une d'elles.

Trois propriétés, jamais une simple table d'exemples :

1. les 14 catégories du registre (#1948.29 → .42) existent, avec la MÊME
   valeur que `Categorie` (le numéro du registre) — un futur routeur les lira
   depuis le code d'app, pas depuis un fichier de test ;
2. un énoncé qui porte un mot-clé SÛR d'une catégorie couverte se classe —
   jamais une probabilité, jamais un score : la première règle qui matche ;
3. un énoncé SANS mot-clé sûr — ambigu, vide, ou hors du sous-ensemble couvert
   — rend `None`, jamais une catégorie devinée. La couverture PARTIELLE est
   assumée : classer une minorité de catégories sans se tromper vaut mieux que
   deviner sur les 14.

Le reste (couverture des 14 catégories, evals de précision, câblage dans
`chat_orchestrator`, repli sur ambiguïté au runtime) reste hors de ce lot —
tranché sans Louis, nommé au commentaire de l'épopée #2797.
"""

from __future__ import annotations

import pytest

from app.services.copilot_intent import CopilotIntentCategory, classify_intent_by_keyword

# ── Propriété 1 : le vocabulaire canonique, en code d'application ───────────


def test_the_fourteen_categories_carry_the_registre_number() -> None:
    """Chaque valeur EST le numéro du registre (#1948.29 → .42) — un rapport
    de garde futur se relira contre `registre-2026-09-12.md` sans table de
    correspondance, exactement la même discipline que `Categorie` côté test."""
    assert CopilotIntentCategory.DECIDER == "1948.29"
    assert CopilotIntentCategory.ANALYSER == "1948.30"
    assert CopilotIntentCategory.DECOUVRIR == "1948.31"
    assert CopilotIntentCategory.TROUVER_UN_CONTACT == "1948.32"
    assert CopilotIntentCategory.TROUVER_UN_BESOIN == "1948.33"
    assert CopilotIntentCategory.POSITIONNER_UN_CONSULTANT == "1948.34"
    assert CopilotIntentCategory.PREPARER_UN_RENDEZ_VOUS == "1948.35"
    assert CopilotIntentCategory.GENERER_UN_MESSAGE == "1948.36"
    assert CopilotIntentCategory.CREER_UNE_SEQUENCE == "1948.37"
    assert CopilotIntentCategory.SUIVRE_UNE_MISSION == "1948.38"
    assert CopilotIntentCategory.PILOTER == "1948.39"
    assert CopilotIntentCategory.CORRIGER_UNE_DONNEE == "1948.40"
    assert CopilotIntentCategory.COMPRENDRE_UNE_PAGE == "1948.41"
    assert CopilotIntentCategory.DEMANDER_DE_L_AIDE == "1948.42"
    assert len(list(CopilotIntentCategory)) == 14


# ── Propriété 2 : une règle SÛRE classe, jamais un score ─────────────────────


@pytest.mark.parametrize(
    ("utterance", "expected"),
    [
        ("Analyse cette entreprise", CopilotIntentCategory.ANALYSER),
        ("Lance une analyse sur Capgemini", CopilotIntentCategory.ANALYSER),
        ("Trouve-moi un contact chez Orange", CopilotIntentCategory.TROUVER_UN_CONTACT),
        ("Qui contacter pour la DSI ?", CopilotIntentCategory.TROUVER_UN_CONTACT),
        ("Trouve un besoin ouvert chez Capgemini", CopilotIntentCategory.TROUVER_UN_BESOIN),
        ("Positionne Yanis Berthier sur cette mission", CopilotIntentCategory.POSITIONNER_UN_CONSULTANT),
        ("Rédige un message pour relancer ce contact", CopilotIntentCategory.GENERER_UN_MESSAGE),
        ("Comment ça marche, cet écran ?", CopilotIntentCategory.DEMANDER_DE_L_AIDE),
        # #2797 (lot g27, 26/09) — CREER_UNE_SEQUENCE, sur les formulations de
        # `prepare_campaign` (chat_tools.py), le seul outil de chat qui la vise.
        ("Prépare-moi une campagne sur ces comptes", CopilotIntentCategory.CREER_UNE_SEQUENCE),
        ("Lance une séquence sur ces contacts", CopilotIntentCategory.CREER_UNE_SEQUENCE),
        # Insensible à la casse et aux espaces qui l'entourent — un énoncé
        # réel n'arrive jamais parfaitement formé.
        ("  TROUVE-MOI UN CONTACT chez Orange  ", CopilotIntentCategory.TROUVER_UN_CONTACT),
    ],
)
def test_classifies_on_the_first_matching_safe_keyword(utterance: str, expected: CopilotIntentCategory) -> None:
    assert classify_intent_by_keyword(utterance) is expected


# ── Propriété 3 : sans mot-clé sûr, jamais une catégorie devinée ─────────────


@pytest.mark.parametrize(
    "utterance",
    [
        "",
        "   ",
        "Bonjour",
        # Une catégorie du registre, mais HORS du sous-ensemble couvert par la
        # règle : `None`, jamais une catégorie voisine devinée par approximation.
        "Pilote mon pipe cette semaine",
        "Explique-moi ce chiffre",
    ],
)
def test_falls_back_to_none_rather_than_guessing(utterance: str) -> None:
    assert classify_intent_by_keyword(utterance) is None
