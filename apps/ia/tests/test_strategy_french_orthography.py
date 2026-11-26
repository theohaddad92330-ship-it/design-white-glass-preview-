"""Le prompt STRATEGIE doit exiger un francais ECRIT AVEC SES ACCENTS.

Regression constatee en prod sur l'ecran /needs : sur un meme ecran, certains
besoins s'affichaient accentues ("Decommissionnement", "Pression budgetaire") et
d'autres non ("Charge operationnelle concentree sur un role restreint",
"Exposition cyber sur les donnees de paiement").

Diagnostic : ce n'est NI le rendu, NI l'encodage, NI une normalisation de notre
code (aucun `unidecode` / `normalize('NFD')` n'est applique a un champ persiste
-- tous les sites de desaccentuation du repo servent a des cles de matching
transitoires). C'est le prompt lui-meme : `bellum_strategy.py` produit les deux
familles de champs que /needs consomme (`itChallenges` et `pains`), il est
redige sans accents et ne demandait nulle part une sortie accentuee. Le modele
imite l'orthographe de son prompt, de facon stochastique -- d'ou la coexistence
des deux formes.

Corollaire : les sources publiques (DECP, BOAMP, BODACC, Sirene) stockent en
majuscules non accentuees et sont injectees dans le bloc SOURCES. Recopier leur
libelle verbatim dans un besoin produit le meme symptome, en plus d'un libelle
administratif illisible. Le prompt doit donc AUSSI exiger une reformulation.

Ce que ce test ne fait PAS : re-accentuer des donnees deja stockees. Deviner les
accents d'un texte francais existant reviendrait a inventer de la donnee.
"""

from __future__ import annotations

from app.prompts import bellum_strategy
from tests.test_prompts_new import SAMPLE_PROFILE


def _system_prompt() -> str:
    return bellum_strategy.build_system_prompt(SAMPLE_PROFILE)


def test_system_prompt_demande_un_francais_accentue():
    """Une consigne explicite d'orthographe, sinon le modele imite le prompt."""
    prompt = _system_prompt().lower()
    assert "accent" in prompt, (
        "Le prompt STRATEGIE ne demande nulle part une sortie en francais "
        "accentue -- c'est la cause des besoins non accentues sur /needs."
    )


def test_system_prompt_interdit_la_recopie_verbatim_des_registres():
    """Un objet de marche public recopie tel quel = libelle ALL-CAPS non accentue."""
    prompt = _system_prompt().lower()
    assert "reformul" in prompt, (
        "Le prompt doit exiger une REFORMULATION des libelles de sources "
        "publiques (DECP/BOAMP/BODACC), pas une recopie verbatim."
    )


def test_la_consigne_est_elle_meme_ecrite_avec_ses_accents():
    """Le prompt enseigne par l'exemple : une consigne non accentuee s'auto-sabote."""
    prompt = _system_prompt()
    consigne = [ligne for ligne in prompt.splitlines() if "accent" in ligne.lower()]
    assert consigne, "consigne d'orthographe introuvable"
    assert any(c in "".join(consigne) for c in "éèêàçùôî"), (
        "La consigne demandant des accents doit elle-meme en porter, "
        "sinon elle contredit ce qu'elle exige."
    )


def test_aucune_desaccentuation_du_cote_de_notre_code():
    """Garde-fou : les besoins ne doivent jamais transiter par un strip d'accents.

    Si quelqu'un ajoute un jour un `unidecode` sur un champ persiste, la bonne
    reaction est de le retirer -- pas de re-accentuer apres coup.
    """
    import unicodedata

    besoin = "Pression sur l'efficacité opérationnelle"
    # Ce que notre pipeline NE doit PAS faire au libellé d'un besoin.
    desaccentue = "".join(
        c for c in unicodedata.normalize("NFD", besoin) if unicodedata.category(c) != "Mn"
    )
    assert desaccentue != besoin
    # Le libellé produit par le prompt doit rester tel quel de bout en bout.
    assert besoin == "Pression sur l'efficacité opérationnelle"
