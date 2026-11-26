"""#2947/#2204.10 — la voie d'accès probable (Q6 du dossier), transmise en
entrée NOMMÉE à la rédaction d'un message.

`evaluation.dossier_read.access_path` était calculée à l'analyse (#2304.7)
mais jamais lue par le composer (#2947, commentaire du 26/09) : `raw_analysis`
n'y arrivait qu'en texte brut tronqué à 3000 caractères
(``str(raw_analysis)[:3000]``), sans garantie qu'un dossier long y conserve
encore ce champ. Voir aussi ``test_message.py`` pour le fil bout-à-bout
(compte → routeur → prompt) ; ici, la fonction PURE, isolée.
"""

from __future__ import annotations

from app.prompts.bellum_outreach import access_path_block


def test_access_path_block_is_empty_without_a_value() -> None:
    assert access_path_block(None) == ""
    assert access_path_block("   ") == ""


def test_access_path_block_names_the_probable_route() -> None:
    block = access_path_block("Recommandation par un ancien collègue chez le client.")
    assert "VOIE D'ACCÈS PROBABLE" in block
    assert "Recommandation par un ancien collègue chez le client." in block
