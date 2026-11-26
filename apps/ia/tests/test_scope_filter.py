"""Le cadrage restreint le chemin recommandé (recette finale §18, §34)."""

from app.services.scope_filter import (
    detect_level,
    filter_recommended_path,
    matches_geo,
    summarize_exclusions,
)

#: Le chemin exact que le rapport montre au §34, avec ses deux contradictions.
CHEMIN_DU_RAPPORT = [
    {"name": "Tomasz", "title": "CIO / CTO", "entity": "Société Générale"},
    {"name": "Yiming", "title": "Chief Data Officer", "entity": "Société Générale China"},
    {
        "name": "Valentine",
        "title": "Managing Director - Head of Infrastructure Finance & Advisory",
        "entity": "Americas",
    },
    {"name": "Ludovic", "title": "CDCO — directeur informatique", "entity": "Société Générale"},
]


class TestLeCheminDuRapport:
    def test_une_esn_francaise_ne_se_voit_plus_proposer_la_chine_ni_les_ameriques(self):
        # Le commercial a déclaré la France ; la carte lui proposait pourtant un
        # C-level en Chine et une directrice Amériques dans ses quatre premières
        # actions. Deux contradictions avec ce qu'il avait lui-même saisi.
        kept, dropped = filter_recommended_path(CHEMIN_DU_RAPPORT, {"geo_perimeter": "france"})

        assert [p["name"] for p in kept] == ["Tomasz", "Ludovic"]
        assert [p["name"] for p in dropped] == ["Yiming", "Valentine"]

    def test_une_strategie_bottom_up_classe_les_c_levels_apres(self):
        # Cadrage analyse (décision 15/10) — le niveau de contact CLASSE, il ne
        # retire plus : le C-level reste au dossier, après les niveaux choisis.
        kept, dropped = filter_recommended_path(
            CHEMIN_DU_RAPPORT, {"hierarchy_levels": ["n1", "n2", "operational"]}
        )

        names = [p["name"] for p in kept]
        assert dropped == []
        assert names.index("Valentine") < names.index("Tomasz")

    def test_chaque_exclusion_porte_son_motif(self):
        # Un contact retiré sans motif se lit comme une donnée manquante ;
        # retiré AVEC son motif, il devient une décision contestable.
        _, dropped = filter_recommended_path(CHEMIN_DU_RAPPORT, {"geo_perimeter": "france"})
        assert all(p.get("excludedReason") for p in dropped)
        assert summarize_exclusions(dropped) == ["hors du périmètre géographique demandé"]


class TestLesGardesQuiEvitentDeTropEcarter:
    def test_sans_cadrage_rien_nest_retire(self):
        # La règle qui garantit qu'une absence d'option laisse le comportement
        # inchangé — la condition pour livrer ceci sans risque de régression.
        kept, dropped = filter_recommended_path(CHEMIN_DU_RAPPORT, None)
        assert len(kept) == len(CHEMIN_DU_RAPPORT)
        assert dropped == []

    def test_un_titre_non_reconnu_est_GARDE(self):
        # Écarter faute d'avoir reconnu un titre ferait payer à l'utilisateur
        # les trous de notre liste de motifs. Les titres exotiques sont la
        # norme dans les grands groupes, pas l'exception.
        kept, _ = filter_recommended_path(
            [{"name": "X", "title": "Référent transverse Squad Alpha"}], {"hierarchy_levels": ["c_level"]}
        )
        assert [p["name"] for p in kept] == ["X"]

    def test_un_libelle_vide_nest_pas_une_preuve_detre_hors_zone(self):
        assert matches_geo("", "france") is True
        assert matches_geo(None, "france") is True

    def test_un_perimetre_international_ne_restreint_rien(self):
        kept, dropped = filter_recommended_path(CHEMIN_DU_RAPPORT, {"geo_perimeter": "international"})
        assert len(kept) == 4 and dropped == []

    def test_2163_9_un_perimetre_monde_ne_restreint_rien_non_plus(self):
        # #2163.9 — « Monde » est la même absence de restriction
        # qu'« international », nommée pour un commercial qui pense en
        # périmètre planétaire plutôt qu'en « hors zone connue ».
        kept, dropped = filter_recommended_path(CHEMIN_DU_RAPPORT, {"geo_perimeter": "world"})
        assert len(kept) == 4 and dropped == []
        assert matches_geo("Head of Data — Singapore", "world") is True


class TestLaLectureDesTitres:
    def test_le_niveau_se_lit_du_plus_haut_au_plus_bas(self):
        # « Managing Director — Head of Infrastructure » est un N-1, pas un N-2 :
        # lire les motifs dans l'autre sens le rangerait parmi les responsables.
        assert detect_level("Managing Director - Head of Infrastructure") == "n1"
        assert detect_level("Chief Data Officer") == "c_level"
        assert detect_level("Responsable de la gouvernance data") == "n2"
        assert detect_level("Ingénieur DevOps") == "operational"
        assert detect_level("") is None

    def test_l_europe_accepte_les_pays_europeens_mais_pas_l_asie(self):
        assert matches_geo("Head of Data — London", "europe") is True
        assert matches_geo("Head of Data — Singapore", "europe") is False


class TestLaZoneDansLeTitre3742:
    """#3742 — Schneider cadré France (10/10) proposait Pacific, Nordics, CEE."""

    def test_une_zone_etrangere_dans_le_titre_sort_sous_france(self):
        for blob in (
            "VP Nordics",
            "BeNe / Nordics / Baltics",
            "Chief Digital Officer CEE",
            "CFO India",
            "Zone CFO Nordic",
            "VP Pacific",
            "Cairo Hub Lead",
            "Directeur Alcampo",
        ):
            assert matches_geo(blob, "france") is False, blob

    def test_head_of_france_europe_emea_et_sans_lieu_restent(self):
        for blob in ("Head of France", "VP Europe", "Directeur EMEA", "Directeur des achats",
                     "Head of France & Nordics"):
            assert matches_geo(blob, "france") is True, blob

    def test_sous_europe_les_nordics_restent_et_l_inde_sort(self):
        assert matches_geo("VP Nordics", "europe") is True
        assert matches_geo("CFO India", "europe") is False

    def test_le_chemin_ecarte_avec_son_motif_sans_supprimer(self):
        path = [
            {"name": "Emil", "title": "Head of BeNe / Nordics / Baltics"},
            {"name": "Anne", "title": "Head of France"},
            {"name": "Zoe", "title": "Directrice de la stratégie"},
        ]
        kept, dropped = filter_recommended_path(path, {"geo_perimeter": "france"})
        assert [p["name"] for p in kept] == ["Anne", "Zoe"]
        assert [p["name"] for p in dropped] == ["Emil"]
        assert dropped[0]["excludedReason"] == "hors du périmètre géographique demandé"


class TestLeCadrageVille:
    """#2163.12 « Ville / site » — `matches_geo` n'avait que la granularité
    pays/continent. Comme #2163.9/#2163.10/#2163.11 avant elle, la valeur
    n'entre dans l'énum contrat qu'une fois son comportement réel écrit ici.
    """

    def test_un_libelle_qui_nomme_la_ville_demandee_est_garde(self):
        assert matches_geo("Head of Data — Lyon", "city", ["Lyon"]) is True

    def test_un_libelle_qui_nomme_une_autre_ville_est_ecarte(self):
        assert matches_geo("Head of Data — Marseille", "city", ["Lyon"]) is False

    def test_insensible_a_la_casse(self):
        assert matches_geo("Head of Data — LYON", "city", ["lyon"]) is True

    def test_sans_ville_nommee_rien_nest_restreint(self):
        # Même règle que #2163.9/#2163.11 : un cadrage incomplet ne doit
        # jamais faire pire qu'aucun cadrage — un axe « ville » choisi sans
        # ville saisie garde tout, il ne rejette pas tout.
        assert matches_geo("Head of Data — Lyon", "city", None) is True
        assert matches_geo("Head of Data — Lyon", "city", []) is True

    def test_filter_recommended_path_lit_geo_areas_pour_le_cadrage_ville(self):
        kept, dropped = filter_recommended_path(
            CHEMIN_DU_RAPPORT + [{"name": "Camille", "title": "Manager", "entity": "Société Générale", "location": "Lyon"}],
            {"geo_perimeter": "city", "geo_areas": ["Lyon"]},
        )
        assert [p["name"] for p in kept] == ["Camille"]
        # #3820 — un cadrage VILLE se nomme « hors site », avec la ville
        # demandée : jamais le générique « périmètre géographique demandé ».
        assert all(p["excludedReason"] == "hors site (Lyon)" for p in dropped)

    def test_3820_un_siege_paris_hors_zone_n_exclut_pas_une_equipe_lille_verifiee(self):
        # #3820 — recette : périmètre SITE = Lille. Le siège du groupe reste à
        # Paris ; l'équipe locale VÉRIFIÉE (son propre libellé dit Lille) ne
        # doit jamais être présentée comme hors périmètre.
        people = [
            {"name": "Directeur Siège", "title": "Directeur Général", "entity": "Groupe X", "location": "Paris"},
            {"name": "Responsable Site Lille", "title": "Responsable de site", "entity": "Groupe X", "location": "Lille"},
        ]
        kept, dropped = filter_recommended_path(people, {"geo_perimeter": "city", "geo_areas": ["Lille"]})
        assert [p["name"] for p in kept] == ["Responsable Site Lille"]
        assert [p["name"] for p in dropped] == ["Directeur Siège"]
        assert dropped[0]["excludedReason"] == "hors site (Lille)"

    def test_3820_un_libelle_totalement_muet_reste_garde_meme_en_cadrage_site(self):
        # Même garde que #2163.9/#2163.11 : un contact dont RIEN ne décrit le
        # lieu (aucun titre ni localisation) n'est pas la PREUVE qu'il est
        # hors site — seule une mention d'un AUTRE lieu l'écarte.
        kept, _ = filter_recommended_path([{"name": "Sans aucun libellé"}], {"geo_perimeter": "city", "geo_areas": ["Lille"]})
        assert [p["name"] for p in kept] == ["Sans aucun libellé"]
