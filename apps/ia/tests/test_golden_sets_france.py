"""Les golden sets France (recette finale §58, P1-09).

Le rapport nomme sept cas : « SG, TF1, SNCF, Crédit Agricole, PME, public, deux
profils ESN ». Ce ne sont pas des cas de test choisis au hasard — ce sont les
sept formes de compte que le produit rencontre en France, et chacune casse une
règle différente :

- un grand groupe bancaire noie les entités utiles sous les véhicules juridiques ;
- un groupe média mélange marques et filiales ;
- un opérateur public passe par des marchés, pas par un décideur ;
- une PME n'a ni comité d'achat ni filiales, et l'organigramme s'y résume à
  trois personnes ;
- et le MÊME compte, lu par deux ESN différentes, doit produire deux
  recommandations différentes — c'est la promesse centrale du produit.

Ces tests vérifient les RÈGLES DÉTERMINISTES sur ces sept formes. Ils ne
remplacent pas un run réel (qui appelle des modèles et des fournisseurs), mais
ils garantissent que la couche de décision se comporte comme annoncé sur chaque
forme, et qu'une régression sur l'une d'elles échoue en CI plutôt qu'en réunion.
"""

from app.services.account_score_axes import compute_axes
from app.services.entity_type import annotate_entity_type, partition_by_display
from app.services.scope_filter import filter_recommended_path
from app.services.signal_freshness import stamp_signals_freshness
from app.services.signal_layers import layer_signals

#: Les deux profils ESN du §59 : la même cible ne se joue pas pareil.
ESN_PETITE_DATA = {"offers": ["data", "gouvernance data"], "consultantSize": "10-50", "references": []}
ESN_GRANDE_INFRA = {"offers": ["infrastructure", "cloud"], "consultantSize": "500+", "references": ["BNP", "AXA"]}


class TestGrandGroupeBancaire:
    """Société Générale — le cas du rapport, celui des quinze SCI."""

    ENTITES = [
        {"name": "SG SOCIETE GENERALE (maison-mère)"},
        {"name": "Boursorama Banque"},
        {"name": "Banque de Grande Clientèle et Solutions Investisseurs"},
        {"name": "SCI DU SURMELIN"},
        {"name": "RISING LEASE FIVE"},
        {"name": "SOCIETE GENERALE HOLDING DE PARTICIPATIONS"},
        {"name": "SG China"},
    ]

    def test_les_entites_utiles_remontent_les_vehicules_descendent(self):
        annotated = [
            annotate_entity_type(e, is_root=e["name"].endswith("(maison-mère)"), in_scope="China" not in e["name"])
            for e in self.ENTITES
        ]
        buckets = partition_by_display(annotated)
        shown = [e["name"] for e in buckets["shown"]]

        assert "Boursorama Banque" in shown
        assert "Banque de Grande Clientèle et Solutions Investisseurs" in shown
        assert "SCI DU SURMELIN" not in shown
        assert "RISING LEASE FIVE" not in shown
        # Rien n'est perdu : tout ce qui sort de la vue reste consultable.
        assert len(buckets["shown"]) + len(buckets["hidden"]) + len(buckets["partners"]) == len(self.ENTITES)

    def test_une_esn_francaise_ne_se_voit_pas_proposer_la_chine(self):
        chemin = [
            {"name": "Tomasz", "title": "CIO", "entity": "Société Générale"},
            {"name": "Yiming", "title": "Chief Data Officer", "entity": "Société Générale China"},
        ]
        kept, dropped = filter_recommended_path(chemin, {"geo_perimeter": "france"})
        assert [p["name"] for p in kept] == ["Tomasz"]
        assert dropped[0]["excludedReason"]


class TestGroupeMedia:
    """TF1 — marques et filiales se mélangent."""

    def test_une_marque_est_une_bu_pas_une_filiale_anonyme(self):
        annotated = annotate_entity_type({"name": "TF1 — Direction du Digital"})
        assert annotated["entityType"] == "business_unit"
        assert annotated["displayByDefault"] is True


class TestOperateurPublic:
    """SNCF — l'accès passe par un marché, pas par un décideur."""

    def test_un_signal_de_marche_public_porte_son_implication(self):
        stamped = stamp_signals_freshness(
            [{"signal": "Appel d'offres ouvert pour la refonte du SI voyageurs", "date": "2026-07-20"}]
        )
        implication = layer_signals(stamped)["visible"][0]["implication"]
        assert implication["category"] == "achat"
        # L'échéance ferme est l'information qui compte sur un marché public.
        assert "échéance" in implication["impact"]


class TestPME:
    """Une PME n'a ni comité d'achat ni filiales."""

    def test_un_compte_sans_entite_ni_contact_ne_pretend_pas_savoir(self):
        score = compute_axes({}, ESN_PETITE_DATA)
        accessibilite = next(a for a in score["axes"] if a["axis"] == "accessibility")

        assert accessibilite["points"] == 0
        assert "accessibility" in score["limitedByData"]
        # Le levier dit quoi faire, il ne se contente pas de constater.
        assert accessibilite["lever"]


class TestDeuxProfilsESN:
    """La promesse centrale : le même compte, deux ESN, deux lectures."""

    ANALYSE = {
        "painPoints": ["gouvernance data à structurer", "migration cloud du socle"],
        "recentSignals": [{"signal": "Budget data confirmé", "date": "2026-07-25", "freshness": "current"}],
        "contacts": [{"email": "cdo@acme.fr"}],
        "sources": [1, 2, 3],
        "entitiesExhaustive": [{}],
    }

    def test_deux_profils_ne_donnent_pas_la_meme_adequation(self):
        data = compute_axes(self.ANALYSE, ESN_PETITE_DATA)
        infra = compute_axes(self.ANALYSE, ESN_GRANDE_INFRA)

        fit_data = next(a for a in data["axes"] if a["axis"] == "fit")["points"]
        fit_infra = next(a for a in infra["axes"] if a["axis"] == "fit")["points"]
        assert fit_data != fit_infra

    def test_une_esn_avec_references_entre_plus_facilement(self):
        sans = compute_axes(self.ANALYSE, ESN_PETITE_DATA)
        avec = compute_axes(self.ANALYSE, ESN_GRANDE_INFRA)

        cap_sans = next(a for a in sans["axes"] if a["axis"] == "capacity")["points"]
        cap_avec = next(a for a in avec["axes"] if a["axis"] == "capacity")["points"]
        assert cap_avec > cap_sans

    def test_le_meme_profil_donne_toujours_le_meme_score(self):
        # Sans cette stabilité, deux commerciaux de la même ESN liraient deux
        # notes différentes sur le même compte — et aucune ne serait discutable.
        assert compute_axes(self.ANALYSE, ESN_PETITE_DATA) == compute_axes(self.ANALYSE, ESN_PETITE_DATA)
