"""Reconnaître une ESN dans un nom d'employeur publié par une source d'emploi.

Le défaut (retour du 31/08 : « parfois ça sort juste pas d'ESN ») : la
reconnaissance était une ÉGALITÉ EXACTE de nom normalisé. Or le référentiel
porte des noms COMMERCIAUX (« Capgemini », « Sopra Steria », « SII ») et France
Travail publie des RAISONS SOCIALES (« CAPGEMINI TECHNOLOGY SERVICES »,
« SOPRA STERIA GROUP », « SII SUD OUEST »). Aucune ne se rencontrait, et le bloc
« qui déborde » se lisait alors « pas de concurrence ici ».

La règle retenue est volontairement ÉTROITE — un faux positif range un client
final parmi les concurrents, ce qui est pire qu'un silence :

    le nom du référentiel est un PRÉFIXE de jetons du nom publié,
    ET tous les jetons restants appartiennent à un vocabulaire de suffixes FERMÉ.

Ni sous-chaîne, ni distance d'édition, ni « ça se ressemble ».
"""

import pytest

from app.services.esn_name_match import KNOWN_SUFFIX_TOKENS, build_esn_index, match_esn

# Le référentiel tel qu'il est : des noms COMMERCIAUX, déjà normalisés par
# l'API (`EsnDirectoryService.knownNames`).
DIRECTORY = ["capgemini", "sopra steria", "sii", "open", "alten", "devoteam", "sopra"]


@pytest.fixture
def index():
    return build_esn_index(DIRECTORY)


class TestCeQuiDoitMatcher:
    def test_legalite_exacte_marche_toujours(self, index):
        assert match_esn("Capgemini", index) == "capgemini"

    def test_une_raison_sociale_avec_suffixe_metier(self, index):
        assert match_esn("CAPGEMINI TECHNOLOGY SERVICES", index) == "capgemini"

    def test_un_suffixe_de_groupe(self, index):
        assert match_esn("SOPRA STERIA GROUP", index) == "sopra steria"

    def test_un_suffixe_geographique(self, index):
        assert match_esn("SII SUD OUEST", index) == "sii"

    def test_un_suffixe_de_forme_juridique(self, index):
        assert match_esn("DEVOTEAM SAS", index) == "devoteam"

    def test_plusieurs_suffixes_enchaines(self, index):
        assert match_esn("ALTEN SIR FRANCE SA", index) == "alten"

    def test_le_prefixe_le_plus_LONG_gagne(self, index):
        # « sopra » ET « sopra steria » sont au référentiel. Rendre « sopra »
        # rattacherait les offres de Sopra Steria à la mauvaise entité.
        assert match_esn("SOPRA STERIA GROUP", index) == "sopra steria"

    def test_insensible_aux_accents_et_a_la_ponctuation(self, index):
        assert match_esn("Capgemini-Technology, Services", index) == "capgemini"


class TestCeQuiNeDoitPasMatcher:
    """La moitié qui compte. Une garde qui ne sait pas dire NON ne garde rien."""

    def test_un_suffixe_INCONNU_ne_matche_pas(self, index):
        # « Open Classrooms » n'est pas le groupe Open. C'est exactement le
        # faux positif qu'un `startswith` naïf produirait.
        assert match_esn("OPEN CLASSROOMS", index) is None

    def test_un_mot_qui_COMMENCE_par_le_nom_ne_matche_pas(self, index):
        # Frontière de JETON, pas de caractères : « Altentive » n'est pas Alten.
        assert match_esn("ALTENTIVE", index) is None
        assert match_esn("OPENDATASOFT", index) is None

    def test_le_nom_du_referentiel_au_MILIEU_ne_matche_pas(self, index):
        # Un préfixe, pas une sous-chaîne : « Groupe Alten » ne matche pas.
        # Assumé — mieux vaut un silence qu'un rapprochement hasardeux.
        assert match_esn("STUDIO ALTEN", index) is None

    def test_un_employeur_inconnu_ne_matche_pas(self, index):
        assert match_esn("BOULANGERIE DUPONT", index) is None

    def test_le_vide_ne_matche_pas(self, index):
        for value in (None, "", "   ", "  ,  "):
            assert match_esn(value, index) is None

    def test_un_suffixe_SEUL_ne_matche_pas(self, index):
        # « France » ne doit pas devenir une ESN parce qu'un suffixe est vide.
        assert match_esn("FRANCE", index) is None


class TestIndex:
    def test_ignore_les_entrees_vides_du_referentiel(self):
        idx = build_esn_index(["capgemini", "", "   ", None])
        assert match_esn("CAPGEMINI TECHNOLOGY SERVICES", idx) == "capgemini"

    def test_un_referentiel_vide_ne_matche_rien(self):
        assert match_esn("CAPGEMINI", build_esn_index([])) is None


def test_le_vocabulaire_de_suffixes_est_non_vide_et_normalise():
    """Garde de corpus : vidé par erreur, tout retomberait sur l'égalité exacte
    et TOUS les tests ci-dessus resteraient verts sauf ceux du haut."""
    assert len(KNOWN_SUFFIX_TOKENS) >= 20
    assert all(token == token.lower() and " " not in token for token in KNOWN_SUFFIX_TOKENS)
