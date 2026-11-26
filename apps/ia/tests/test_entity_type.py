"""Le type d'entité et la règle d'affichage (recette finale §23-24)."""

from app.services.entity_type import (
    ENTITY_TYPE_BUSINESS_UNIT,
    ENTITY_TYPE_DORMANT,
    ENTITY_TYPE_OPERATING,
    ENTITY_TYPE_OUT_OF_SCOPE,
    ENTITY_TYPE_PARENT,
    ENTITY_TYPE_PARTNER,
    ENTITY_TYPE_PERSON,
    ENTITY_TYPE_VEHICLE,
    annotate_entity_type,
    classify_entity_type,
    partition_by_display,
)


class TestLaListeQueLeRapportMontre:
    """Les entités exactes de la capture Société Générale (§23)."""

    def test_les_sci_et_vehicules_sortent_de_la_vue_par_defaut(self):
        # C'est le reproche : quinze SCI étiquetées « Filiale » noyaient
        # Boursorama et SGSS. Elles restent consultables, elles ne sont plus la
        # première chose qu'on lit.
        for nom in (
            "SCI DU SURMELIN",
            "SCI CRYSTAL DOUBLE IMMO",
            "RISING LEASE FIVE",
            "SCI DES COMBEAUX DE TIGERY",
        ):
            kind, _ = classify_entity_type(nom)
            assert kind == ENTITY_TYPE_VEHICLE, nom

    def test_les_entites_strategiques_remontent(self):
        assert classify_entity_type("SG SOCIETE GENERALE — Retail Banking France")[0] == ENTITY_TYPE_BUSINESS_UNIT
        assert classify_entity_type("Banque de Grande Clientèle et Solutions Investisseurs")[0] == (
            ENTITY_TYPE_BUSINESS_UNIT
        )
        assert classify_entity_type("SG SECURITIES SERVICES")[0] == ENTITY_TYPE_BUSINESS_UNIT

    def test_une_entite_it_est_une_bu_prioritaire_pour_une_esn(self):
        # « Oui, prioritaire » dans le tableau du §24 : c'est la cible n°1.
        assert classify_entity_type("SG Digital Factory")[0] == ENTITY_TYPE_BUSINESS_UNIT
        assert classify_entity_type("GENINFO", naf="6202A")[0] == ENTITY_TYPE_BUSINESS_UNIT


class TestLOrdreDesRegles:
    """L'ordre des tests EST la logique métier — chaque inversion ment."""

    def test_une_entite_cedee_qui_est_une_sci_est_dabord_cedee(self):
        # La ranger en véhicule ferait croire qu'elle est seulement
        # inintéressante, alors qu'elle a QUITTÉ le groupe : deux conclusions
        # commerciales différentes.
        kind, reason = classify_entity_type("SCI LES TILLEULS (cédée)")
        assert kind == ENTITY_TYPE_DORMANT
        assert "cédée" in reason

    def test_une_sci_passe_avant_toute_lecture_de_business_unit(self):
        # Sans cet ordre, « SCI Pôle Santé » remonterait en tête des cibles.
        assert classify_entity_type("SCI Pôle Santé")[0] == ENTITY_TYPE_VEHICLE

    def test_une_holding_sans_effectif_est_un_vehicule_avec_effectif_un_reperE(self):
        # Une holding pure n'a personne à qui vendre ; une holding
        # opérationnelle est un point d'entrée réel. L'effectif départage ce que
        # le nom ne peut pas dire.
        assert classify_entity_type("SOCIETE GENERALE HOLDING DE PARTICIPATIONS")[0] == ENTITY_TYPE_VEHICLE
        assert classify_entity_type("ACME HOLDING", headcount=250)[0] == ENTITY_TYPE_PARENT

    def test_la_maison_mere_vient_du_registre_pas_du_nom(self):
        # « Société Générale » ne s'auto-désigne pas maison-mère : c'est la
        # position dans le graphe légal qui le dit.
        assert classify_entity_type("Société Générale")[0] != ENTITY_TYPE_PARENT
        assert classify_entity_type("Société Générale", is_root=True)[0] == ENTITY_TYPE_PARENT

    def test_hors_perimetre_geographique(self):
        assert classify_entity_type("SG China", in_scope=False)[0] == ENTITY_TYPE_OUT_OF_SCOPE

    def test_un_partenaire_ne_se_melange_pas_a_la_hierarchie(self):
        kind, reason = classify_entity_type("Coentreprise Amundi-SG")
        assert kind == ENTITY_TYPE_PARTNER
        assert "hors hiérarchie" in reason


class TestCeQuOnMontreEtCeQuOnGarde:
    def test_rien_nest_supprime_seulement_range(self):
        # Un produit qui PERD des entités est pire qu'un produit qui en montre
        # trop : le registre est vérifiable, et l'utilisateur doit pouvoir
        # rouvrir ce qu'on a écarté.
        entities = [
            annotate_entity_type({"name": "Boursorama Banque"}),
            annotate_entity_type({"name": "SCI DU SURMELIN"}),
            annotate_entity_type({"name": "Coentreprise Amundi-SG"}),
            annotate_entity_type({"name": "Société Générale"}, is_root=True),
        ]
        buckets = partition_by_display(entities)

        assert len(buckets["shown"]) + len(buckets["hidden"]) + len(buckets["partners"]) == len(entities)
        assert [e["name"] for e in buckets["hidden"]] == ["SCI DU SURMELIN"]
        assert [e["name"] for e in buckets["partners"]] == ["Coentreprise Amundi-SG"]

    def test_lannotation_najoute_rien_quelle_ne_remplace(self):
        # Non destructif : la pertinence commerciale répond à une AUTRE
        # question, et les deux doivent cohabiter sur la même entité.
        annotated = annotate_entity_type({"name": "Boursorama", "relevance": "operating", "siren": "351058151"})
        assert annotated["relevance"] == "operating"
        assert annotated["siren"] == "351058151"
        assert annotated["entityType"] == ENTITY_TYPE_OPERATING
        assert annotated["displayByDefault"] is True

    def test_chaque_type_porte_sa_raison(self):
        # Une entité écartée sans motif se lit comme un bug. Le motif est ce qui
        # permet à l'utilisateur de contredire la machine.
        for nom in ("SCI DU SURMELIN", "ACME (en liquidation)", "SG China"):
            _, reason = classify_entity_type(nom, in_scope=nom != "SG China")
            assert reason, nom


class TestUnePersonneNestPasUneEntite:
    """Recette live du 29/08/2026, compte ROCHE, onglet « Couverture ».

    L'écran affichait « Entités couvertes **26/27** · À ouvrir : **Wafaa
    Mamilli — Chief Digital Technology Officer** », et la même chaîne en fin de
    liste des familles avec « (aucun contact) ». Un nom de personne avait été
    ingéré comme entité métier, et il gonflait le DÉNOMINATEUR : le compte
    paraissait moins couvert qu'il ne l'est, à cause d'une entité qui n'existe
    pas.

    Ce module dit qu'il répond à « quelle SORTE d'objet est-ce ? ». Une
    personne est une sorte d'objet, et c'est la seule que la taxonomie du §24
    avait oubliée — il y avait un test pour la SCI, un pour la coentreprise, un
    pour l'entité cédée, aucun pour l'être humain.
    """

    def test_la_chaine_exacte_vue_en_recette(self):
        kind, reason = classify_entity_type("Wafaa Mamilli — Chief Digital Technology Officer")
        assert kind == ENTITY_TYPE_PERSON
        # La raison NOMME la personne et sa fonction : « on archive, on ne
        # supprime pas » — l'entrée reste consultable avec son motif, et c'est
        # ce motif qui permet à un humain de contredire la machine.
        assert "Wafaa Mamilli" in reason
        assert "Chief Digital Technology Officer" in reason

    def test_les_autres_ecritures_de_la_meme_chose(self):
        for nom in (
            "Wafaa Mamilli - Chief Digital Technology Officer",
            "Wafaa Mamilli, Chief Digital Technology Officer",
            "Directeur des Systèmes d'Information : Paul Durand",
            "Claire Moreau — Directrice Générale",
        ):
            assert classify_entity_type(nom)[0] == ENTITY_TYPE_PERSON, nom

    def test_elle_ne_disparait_pas_elle_sort_de_la_vue_par_defaut(self):
        # Elle n'est pas SUPPRIMÉE : elle rejoint le paquet consultable, avec
        # son motif écrit — exactement comme les SCI du §23.
        annotated = annotate_entity_type({"name": "Wafaa Mamilli — Chief Digital Technology Officer"})
        assert annotated["displayByDefault"] is False
        assert annotated["entityTypeReason"]
        buckets = partition_by_display([annotated])
        assert len(buckets["hidden"]) == 1
        assert buckets["shown"] == []

    def test_elle_ne_confond_pas_une_VRAIE_entite_avec_une_personne(self):
        # Le faux positif coûte plus cher que le faux négatif : écarter une
        # filiale réelle ferait disparaître une cible commerciale. Le détecteur
        # exige donc un patronyme ET une fonction, ADJACENTS — un patronyme nu
        # ne suffit pas, parce qu'une raison sociale peut en être un.
        for nom in (
            "Roche Diagnostics France",
            "SCI Jean Martin",
            "Michel Bras",
            "Direction des Systèmes d'Information",
            "Genentech",
            "SG SOCIETE GENERALE — Retail Banking France",
        ):
            assert classify_entity_type(nom)[0] != ENTITY_TYPE_PERSON, nom
