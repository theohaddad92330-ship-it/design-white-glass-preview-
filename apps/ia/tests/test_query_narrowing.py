"""#1099 — « Je ne comprends pas pourquoi Bedrock Streaming ne peut pas être
analysé ? il s'agit d'une entreprise qui prend des prestas sur Lyon… »

Elle EXISTE : le registre la publie sous « BEDROCK (M6 DIGITAL DISTRIBUTION) »,
SIREN 493869002. « Bedrock Streaming » est la MARQUE. Le registre cherche sur la
raison sociale et rend zéro résultat dès qu'un mot de la marque n'y figure pas —
et l'écran en conclut « Aucune entreprise trouvée », ce qui se lit « cette
entreprise n'existe pas ».

Le repli existait déjà pour la marque d'UN mot (« Kicklox » → LINNAEUS). Il
manquait le cas de la marque de PLUSIEURS mots. On retire le dernier mot, UNE
fois, et jamais si ce qui reste ne désigne plus personne.
"""

from __future__ import annotations

import pytest

from app.routers.companies import narrowed_query


@pytest.mark.parametrize(
    ("saisie", "attendu"),
    [
        ("Bedrock Streaming", "Bedrock"),
        ("Kicklox Technologies", "Kicklox"),
        ("Doctolib France", "Doctolib"),
        # Espaces multiples et bords : la requête est nettoyée avant d'être coupée.
        ("  Bedrock   Streaming  ", "Bedrock"),
    ],
)
def test_retire_le_dernier_mot(saisie: str, attendu: str) -> None:
    assert narrowed_query(saisie) == attendu


@pytest.mark.parametrize("saisie", ["Capgemini", "Thales", "  Airbus "])
def test_un_seul_mot_ne_s_elargit_pas(saisie: str) -> None:
    # Il n'y a rien à retirer, et rendre la même requête ferait un second appel
    # identique au premier — un coût pour zéro chance de plus.
    assert narrowed_query(saisie) is None


@pytest.mark.parametrize(
    "saisie",
    ["Groupe Renault", "Société Générale", "Compagnie des Alpes", "Holding Bertrand"],
)
def test_refuse_de_couper_jusqu_a_un_mot_generique(saisie: str) -> None:
    """Le garde-fou qui rend la règle tenable.

    « Groupe Renault » réduit à « Groupe » ne désigne plus rien : le registre
    rendrait des centaines de sociétés sans rapport, et l'utilisateur croirait
    qu'on lui propose des homonymes de ce qu'il a tapé. Mieux vaut ne rien
    proposer que proposer n'importe qui.
    """
    assert narrowed_query(saisie) is None


def test_garde_plusieurs_mots_quand_il_en_reste_plusieurs() -> None:
    # On ne coupe qu'UNE fois : « Société Générale de Banque » garde trois mots,
    # ce qui désigne encore quelque chose.
    assert narrowed_query("Société Générale de Banque") == "Société Générale de"


def test_ignore_la_casse_et_les_accents_du_mot_generique() -> None:
    assert narrowed_query("GROUPE Renault") is None
    assert narrowed_query("Sociéte Generale") is None


def test_une_saisie_vide_ou_blanche_ne_s_elargit_pas() -> None:
    assert narrowed_query("") is None
    assert narrowed_query("   ") is None
