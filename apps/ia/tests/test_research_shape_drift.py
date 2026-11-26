"""La sortie du modèle dérive de FORME, et un dossier complet en mourait.

TROIS incidents sur cinq analyses réelles lancées le 10/08/2026 (Société
Générale, leboncoin, Thales, RATP, BlaBlaCar) — soit 60 % de perte, sur des
sociétés dont la collecte s'était pourtant bien passée :

- **Thales** : ``technologyStack`` rendu en CHAÎNE JSON (``'[{"name": …}]'``)
  au lieu d'un tableau → ``502`` en phase de recherche, dossier perdu ;
- **leboncoin** : ``rdvScript.exploration`` rendu en LISTE de questions au lieu
  d'un paragraphe → même issue ;
- **RATP** : l'enveloppe ``data`` rendue en CHAÎNE au lieu d'un objet, en phase
  de plan — après trois phases abouties.

Dans les trois cas le CONTENU était juste ; seule sa mise en forme variait. Le
dépôt applique déjà cette règle côté API (« parsing JSON Claude robuste ») : on
ne fait pas confiance à la forme rendue, on la répare quand elle est réparable.

Ce que ces tests verrouillent, c'est la limite de cette tolérance : on répare ce
qui est réparable sans deviner, et on laisse Pydantic refuser le reste — une
coercition trop large transformerait une vraie erreur de contrat en donnée
silencieusement fausse.
"""

import pytest
from pydantic import ValidationError

from app.models.outputs.research import RdvScript, ResearchFacts


class TestListeRendueEnChaineJson:
    def test_technology_stack_serialise_est_reparé(self):
        """La forme EXACTE qui a tué le run Thales."""
        facts = ResearchFacts.model_validate(
            {"technologyStack": '[{"name": "Intelligence artificielle", "detail": "usage spécialisé"}]'}
        )
        assert [item.name for item in facts.technology_stack] == ["Intelligence artificielle"]

    def test_toutes_les_listes_de_la_sortie_sont_couvertes(self):
        """Rien ne distingue `technologyStack` de ses voisines : les couvrir
        toutes évite de rejouer le même incident sur `sitesFrance`."""
        facts = ResearchFacts.model_validate({"programNames": '["Programme A", "Programme B"]'})
        # #3677.7 — `programNames` porte désormais des objets (nom, objectif,
        # périmètre, horizon) ; une chaîne nue reste coercée vers le nom seul.
        assert [p.name for p in facts.program_names] == ["Programme A", "Programme B"]

    def test_une_vraie_liste_traverse_intacte(self):
        facts = ResearchFacts.model_validate({"technologyStack": [{"name": "Java"}]})
        assert [item.name for item in facts.technology_stack] == ["Java"]

    def test_une_chaine_qui_n_est_pas_une_liste_reste_refusee(self):
        """La tolérance s'arrête là où commencerait la devinette : sans ce
        refus, un champ mal rempli deviendrait une donnée silencieusement fausse.
        """
        with pytest.raises(ValidationError):
            ResearchFacts.model_validate({"regulations": "pas une liste"})

    def test_une_chaine_json_illisible_reste_refusee(self):
        with pytest.raises(ValidationError):
            ResearchFacts.model_validate({"programNames": '["ouverte mais jamais fermée'})


class TestTexteRenduEnListe:
    def test_exploration_en_liste_est_recollee(self):
        """La forme EXACTE qui a tué le run leboncoin."""
        script = RdvScript.model_validate(
            {"exploration": ["Comment priorisez-vous vos chantiers ?", "Qui arbitre le budget ?"]}
        )
        assert script.exploration == "Comment priorisez-vous vos chantiers ?\nQui arbitre le budget ?"

    def test_les_cinq_sections_du_script_sont_couvertes(self):
        script = RdvScript.model_validate(
            {
                "opening": ["Bonjour"],
                "positioning": ["Nous accompagnons"],
                "proposal": ["Une première mission"],
                "closing": ["Un point la semaine prochaine ?"],
            }
        )
        assert script.opening == "Bonjour"
        assert script.positioning == "Nous accompagnons"
        assert script.proposal == "Une première mission"
        assert script.closing == "Un point la semaine prochaine ?"

    def test_une_vraie_chaine_traverse_intacte(self):
        assert RdvScript.model_validate({"opening": "Bonjour"}).opening == "Bonjour"

    def test_une_liste_vide_donne_le_defaut_et_non_une_erreur(self):
        assert RdvScript.model_validate({"closing": []}).closing == ""

    def test_les_elements_vides_sont_ecartes_du_recollage(self):
        script = RdvScript.model_validate({"exploration": ["Première question", "", None, "  "]})
        assert script.exploration == "Première question"


class TestEnveloppeSerialisee:
    """Le troisième incident du 10/08, et le plus instructif.

    Sur RATP, les trois premières phases avaient abouti ; la phase de plan est
    morte parce que l'enveloppe `data` est arrivée en CHAÎNE au lieu d'un objet.
    Réparer au niveau de l'enveloppe couvre toutes les phases d'un coup —
    corriger champ par champ dans chaque modèle de sortie reviendrait à attendre
    que chacun casse en production, l'un après l'autre.
    """

    def test_enveloppe_serialisee_est_reparée(self):
        from app.services.claude_service import coerce_serialized_object

        assert coerce_serialized_object('{"strategy": "Stratégie de conquête"}') == {
            "strategy": "Stratégie de conquête"
        }

    def test_un_objet_normal_traverse_intact(self):
        from app.services.claude_service import coerce_serialized_object

        payload = {"strategy": "x", "phases": [1, 2]}
        assert coerce_serialized_object(payload) is payload

    def test_ce_qui_n_est_pas_un_objet_json_reste_refuse(self):
        from app.services.claude_service import coerce_serialized_object

        # Rendus tels quels : Pydantic tranche ensuite, avec son message lisible.
        assert coerce_serialized_object("pas du json") == "pas du json"
        assert coerce_serialized_object("[1, 2]") == "[1, 2]"
        assert coerce_serialized_object('{"ouvert": ') == '{"ouvert": '
