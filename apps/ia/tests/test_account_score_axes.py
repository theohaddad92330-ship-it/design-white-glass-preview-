"""Le score en cinq axes, expliqué et actionnable (recette finale §27-28)."""

from app.services.account_score_axes import AXES, TOTAL_MAX, _signal_axis, compute_axes, score_headline


class TestLaDistinctionQuiCompte:
    def test_un_profil_manquant_PLAFONNE_la_note_au_lieu_de_lannuler(self):
        # Le §27 : un 4/25 parce que le compte est difficile et un 4/25 parce
        # qu'on ne sait rien de l'ESN appellent des décisions opposées. Zéro sur
        # l'adéquation serait une AFFIRMATION sur le compte ; on rend le milieu
        # et on dit que la note est bridée.
        score = compute_axes({"contacts": [{"email": "a@b.c"}]}, {})
        fit = next(a for a in score["axes"] if a["axis"] == "fit")

        assert fit["points"] == 2
        assert "fit" in score["limitedByData"]
        assert "Profil ESN incomplet" in fit["evidence"]

    def test_avec_un_profil_ladequation_se_juge_sur_le_recoupement(self):
        score = compute_axes(
            {"painPoints": ["gouvernance data à structurer", "migration cloud"]},
            {"offers": ["data", "cloud"]},
        )
        fit = next(a for a in score["axes"] if a["axis"] == "fit")
        assert fit["points"] > 2
        assert "fit" not in score["limitedByData"]

    def test_la_capacite_reste_jugeable_meme_sans_donnees_sur_la_cible(self):
        # Elle dépend de l'ESN — taille, références, concurrence — pas de ce
        # qu'on a réussi à collecter. Elle n'est donc jamais « plafonnée ».
        score = compute_axes({}, {"references": ["BNP"]})
        assert "capacity" not in score["limitedByData"]


class TestLeTotalEtSesBornes:
    def test_cinq_axes_sur_cinq_soit_vingt_cinq(self):
        score = compute_axes({}, {})
        assert [a["axis"] for a in score["axes"]] == list(AXES)
        assert score["max"] == TOTAL_MAX == 25

    def test_le_total_est_la_somme_des_axes(self):
        # Un total qui n'est pas la somme de ses parties est invisible à
        # l'écran : il a l'air cohérent avec lui-même.
        score = compute_axes({"recentSignals": [{"freshness": "current"}]}, {"offers": ["data"]})
        assert score["total"] == sum(a["points"] for a in score["axes"])

    def test_aucun_axe_ne_sort_de_ses_bornes(self):
        score = compute_axes(
            {"contacts": [{"email": f"{i}@x.fr"} for i in range(50)], "recentSignals": [{"freshness": "current"}] * 40},
            {"offers": ["data"] * 20},
        )
        assert all(0 <= a["points"] <= 5 for a in score["axes"])
        assert score["total"] <= TOTAL_MAX


class TestUnScoreQuiDitCeQuiLeFeraitMonter:
    def test_chaque_axe_non_maximal_porte_un_levier(self):
        # Un score qui ne dit pas ce qui le ferait monter est un verdict, pas un
        # outil.
        score = compute_axes({}, {})
        for axis in score["axes"]:
            if axis["points"] < 5:
                assert axis["lever"], axis["axis"]

    def test_la_phrase_dit_la_note_le_plafond_et_le_levier(self):
        score = compute_axes({"contacts": []}, {})
        phrase = score_headline(score, "Société Générale", "Skaizen")

        assert "Société Générale" in phrase and "Skaizen" in phrase
        assert f"/{TOTAL_MAX}" in phrase
        assert "PLAFONNÉE" in phrase

    def test_un_dossier_solide_ne_parle_pas_de_plafond(self):
        score = compute_axes(
            {
                "painPoints": ["data"],
                "recentSignals": [{"freshness": "current"}] * 5,
                "contacts": [{"email": "a@b.c"}, {"phone": "0600"}],
                "sources": [1, 2, 3, 4],
                "entitiesExhaustive": [{}],
            },
            {"offers": ["data"], "references": ["BNP"]},
        )
        assert score["limitedByData"] == []
        assert "PLAFONNÉE" not in score_headline(score, "ACME")


class TestLesBords:
    def test_une_analyse_absente_ne_leve_pas(self):
        for empty in (None, {}, {"contacts": None}):
            score = compute_axes(empty, None)
            assert score["total"] >= 0


class TestLaxeSignalNeCompteJamaisUnSignalSansDateCommeVivant:
    """#3928 — l'audit du 08/10 relève que l'axe signal comptait un signal sans
    date (``freshness`` absent/``undated``) comme vivant : le code excluait
    seulement ``archive``, pas ``undated``. Un signal non daté n'est pas un
    signal récent (même doctrine que `signal_freshness.classify_signal_freshness`,
    dont `freshness` est le produit)."""

    def test_un_signal_sans_freshness_ne_compte_pas(self):
        axis = _signal_axis({"recentSignals": [{"signal": "Levée de fonds"}]})
        assert axis["points"] == 0
        assert axis["limitedByData"] is True

    def test_un_signal_undated_ne_compte_pas(self):
        axis = _signal_axis({"recentSignals": [{"freshness": "undated"}]})
        assert axis["points"] == 0
        assert axis["limitedByData"] is True

    def test_un_signal_archive_ne_compte_toujours_pas(self):
        axis = _signal_axis({"recentSignals": [{"freshness": "archive"}]})
        assert axis["points"] == 0

    def test_un_signal_current_compte_toujours(self):
        axis = _signal_axis({"recentSignals": [{"freshness": "current"}]})
        assert axis["points"] >= 1
        assert "1 signal" in axis["evidence"]

    def test_un_melange_ne_compte_que_les_signaux_current(self):
        axis = _signal_axis(
            {
                "recentSignals": [
                    {"freshness": "current"},
                    {"freshness": "undated"},
                    {"freshness": "archive"},
                    {},
                ]
            }
        )
        assert "1 signal" in axis["evidence"]
