"""R22 VU.5 (recette prod 23/10) — la carte de résultat de Laura affichait « HEXANET (NOZICAA;OLM;OCEANET;…) » :
le ``nom_complet`` du registre colle les sigles / enseignes au nom. Seul le NOM s'affiche."""

from app.services.chat_tools import _search_item
from app.services.company_display_name import display_company_name


def test_les_entites_concatenees_ne_sont_pas_affichees() -> None:
    assert display_company_name("HEXANET (NOZICAA;OLM;OCEANET;ALTITUDE TELECOM)") == "HEXANET"
    # tronqué par le registre, parenthèse jamais refermée
    assert display_company_name("HEXANET (NOZICAA;OLM;OCEANET;…") == "HEXANET"


def test_un_nom_avec_un_seul_sigle_reste_entier() -> None:
    # Un sigle seul n'est pas une liste d'entités : rien n'est retiré (jamais un nom amputé).
    assert display_company_name("SOCIETE GENERALE (SG)") == "SOCIETE GENERALE (SG)"
    assert display_company_name("Capgemini") == "Capgemini"


def test_la_carte_de_laura_porte_le_nom_seul() -> None:
    item = _search_item({"name": "HEXANET (NOZICAA;OLM;OCEANET;…)", "siren": "123456789"})
    assert item is not None
    assert item["name"] == "HEXANET"
