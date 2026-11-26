"""#3864.1 (BEL-LAU-1008-013, retour bêta 08/10) — « trouve-moi des besoins »
doit lancer un parcours de recherche complet, pas une explication sur les
limites du produit ni une lecture exclusive des besoins déjà enregistrés.

Mesuré sur `origin/main` avant ce lot : AUCUN marqueur de
`CHAT_INTENT_ROUTING_TABLE["besoin"]` ne reconnaissait une demande de
RECHERCHE (« trouve-moi des besoins ») — tous supposaient un besoin déjà
connu de la personne (« j'ai un besoin »). La demande retombait sur
`non_declaree` (`intention_incomprise`) et Laura expliquait les limites du
produit au lieu d'appeler `find_needs`.

Même remède que #2721 / #2679 / #2434.51 / #3175 / #3176 : un marqueur À
PART, sa propre consigne de prompt (`need_discovery_block`).
"""

from __future__ import annotations

import pytest

from app.prompts.intent_route import need_discovery_block
from app.services.compilers.intent_router import asks_to_discover_needs, route_chat_intent

RECETTE_PHRASES = [
    "Trouve-moi des besoins",
    "Trouve moi des besoins qui correspondent a mon expertise",
    "Cherche-moi des besoins ouverts",
    "Où trouver des besoins pour mes expertises ?",
    "Quels besoins correspondent à mes compétences ?",
    "Find me needs that match my expertise",
    "Where can I find needs for my skills",
    "What open needs match my expertise",
]


@pytest.mark.parametrize("message", RECETTE_PHRASES)
def test_3864_1_une_demande_de_recherche_est_reconnue(message: str) -> None:
    assert asks_to_discover_needs(message)


def test_3864_1_le_temoin_ne_declenche_rien() -> None:
    # Rapporter un besoin déjà connu n'est pas une RECHERCHE : le marqueur ne
    # doit pas le confondre avec la demande de découverte.
    assert asks_to_discover_needs("J'ai un besoin : deux devops pour janvier") is None
    assert asks_to_discover_needs("Bonjour") is None


@pytest.mark.parametrize("message", RECETTE_PHRASES)
def test_3864_1_la_route_appelle_find_needs_sans_attendre_un_humain(message: str) -> None:
    route = route_chat_intent(message=message)
    assert route.intent == "besoin"
    assert route.tools == ("find_needs",)
    assert route.awaits_human is False
    assert route.unrouted_category is None


@pytest.mark.parametrize("language", ["fr", "en"])
def test_3864_1_le_bloc_distingue_les_cinq_categories_et_interdit_linvention(language: str) -> None:
    block = need_discovery_block("Trouve-moi des besoins", language)
    assert block
    if language == "fr":
        for phrase in (
            "find_needs",
            "demande de prestation documentée",
            "recrutement",
            "signal de projet",
            "compatibilité historique",
            "vide",
            "N'invente",
        ):
            assert phrase in block, phrase
        # Doctrine : aucune probabilité affichée.
        assert "%" not in block
        assert "probabilit" not in block.lower()
    else:
        for phrase in (
            "find_needs",
            "documented service request",
            "permanent hire",
            "project signal",
            "historical compatibility",
            "empty",
            "Never invent",
        ):
            assert phrase in block, phrase


def test_3864_1_le_bloc_est_vide_sans_marqueur() -> None:
    assert need_discovery_block("Bonjour", "fr") == ""
    # Rapporter un besoin (plutôt que d'en chercher) ne déclenche pas non plus
    # cette consigne — c'est `intent_route_block` qui porte déjà ce cas.
    assert need_discovery_block("J'ai un besoin : deux devops pour janvier", "fr") == ""
