"""#3769.7 (recette R47) — la ville du siège a UNE casse, posée à un seul endroit."""

from app.services.city_case import format_city, normalize_cities

# #3769.7
def test_format_city_met_en_casse_de_titre_les_villes_en_majuscules() -> None:
    assert format_city("COURBEVOIE") == "Courbevoie"
    assert format_city("COLMAR") == "Colmar"
    assert format_city("paris") == "Paris"


def test_format_city_garde_les_tirets_et_les_particules() -> None:
    assert format_city("SAINT-DENIS") == "Saint-Denis"
    assert format_city("BOULOGNE-BILLANCOURT") == "Boulogne-Billancourt"
    assert format_city("AIX-EN-PROVENCE") == "Aix-en-Provence"
    assert format_city("L'HAŸ-LES-ROSES") == "L'Haÿ-les-Roses"
    assert format_city("LA DÉFENSE") == "La Défense"
    assert format_city("NEUILLY-SUR-SEINE") == "Neuilly-sur-Seine"


def test_format_city_ne_touche_pas_une_casse_deja_choisie() -> None:
    assert format_city("Paris") == "Paris"
    assert format_city("Saint-Denis") == "Saint-Denis"
    assert format_city("Fontenay-sous-Bois") == "Fontenay-sous-Bois"


def test_format_city_rend_une_valeur_absente_telle_quelle() -> None:
    assert format_city("") == ""
    assert format_city(None) is None


def test_normalize_cities_traite_ville_et_siege_avec_code_postal() -> None:
    row = {
        "name": "SOCIETE GENERALE",
        "headquarters": "29 Boulevard Haussmann, 75009 PARIS",
        "city": "COURBEVOIE",
        "nested": [{"headquarters": "92400 COURBEVOIE"}],
    }
    out = normalize_cities(row)
    assert out["headquarters"] == "29 Boulevard Haussmann, 75009 Paris"
    assert out["city"] == "Courbevoie"
    assert out["nested"][0]["headquarters"] == "92400 Courbevoie"
    assert out["name"] == "SOCIETE GENERALE"  # jamais un autre champ


def test_execute_chat_tool_normalise_les_villes_du_resultat() -> None:
    """Le point d'appel : sans lui, le module est du code juste que personne n'appelle."""
    import inspect

    from app.services import chat_tools

    assert "normalize_cities(cleaned)" in inspect.getsource(chat_tools.execute_chat_tool)
