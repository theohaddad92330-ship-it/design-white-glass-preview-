"""Le secteur d'écran ↔ la section NAF — une seule dérivation, deux lecteurs.

Le mapping vivait en privé dans `routers/discover.py`, si bien que le mode
Signaux ne pouvait PAS l'appliquer : `sector` n'y était lu nulle part. L'écran
affichait pourtant les mêmes pastilles de secteur dans les deux modes.
"""

from app.services.naf_sections import (
    SECTOR_TO_NAF_SECTION,
    matches_sectors,
    naf_section_of,
    unknown_sectors,
)


class TestNafSectionOf:
    def test_lit_la_section_dun_code_naf_complet(self):
        # 62.02A « conseil en systèmes et logiciels informatiques » → section J.
        assert naf_section_of("62.02A") == "J"

    def test_accepte_les_formes_sans_point_et_sans_sous_classe(self):
        assert naf_section_of("6202A") == "J"
        assert naf_section_of("62") == "J"

    def test_couvre_les_bornes_de_chaque_section_utilisee_a_lecran(self):
        # Une par section exposée : c'est la table qui décide, pas un préfixe.
        assert naf_section_of("10.11Z") == "C"  # industrie
        assert naf_section_of("35.11Z") == "D"  # énergie
        assert naf_section_of("41.20A") == "F"  # construction
        assert naf_section_of("47.11B") == "G"  # commerce
        assert naf_section_of("49.10Z") == "H"  # transport
        assert naf_section_of("64.19Z") == "K"  # finance
        assert naf_section_of("84.11Z") == "O"  # administration publique
        assert naf_section_of("86.10Z") == "Q"  # santé

    def test_rend_none_plutot_quune_section_devinee(self):
        # Un code illisible n'est PAS « secteur inconnu donc écarté » : c'est
        # « on ne sait pas », et l'appelant doit pouvoir le traiter à part.
        assert naf_section_of(None) is None
        assert naf_section_of("") is None
        assert naf_section_of("ZZ.99Z") is None
        assert naf_section_of("00.00Z") is None
        assert naf_section_of("99.00Z") == "U"


class TestMatchesSectors:
    def test_sans_secteur_demande_tout_passe(self):
        # Une recherche non restreinte ne doit RIEN retirer.
        assert matches_sectors("62.02A", []) is True
        assert matches_sectors(None, []) is True

    def test_retient_une_entreprise_de_la_section_demandee(self):
        assert matches_sectors("62.02A", ["it"]) is True

    def test_ecarte_une_entreprise_dune_autre_section(self):
        assert matches_sectors("10.11Z", ["it"]) is False

    def test_croise_plusieurs_secteurs_en_OU(self):
        assert matches_sectors("10.11Z", ["it", "industry"]) is True

    def test_ignore_all_qui_nest_pas_une_contrainte(self):
        assert matches_sectors("10.11Z", ["all"]) is True
        assert matches_sectors("10.11Z", ["all", "it"]) is False

    def test_tolere_la_casse_et_les_espaces(self):
        assert matches_sectors("62.02A", ["  IT "]) is True

    def test_un_naf_inconnu_est_ECARTE_quand_un_secteur_est_demande(self):
        # Le choix est assumé et il est le seul honnête pour une LISTE : on a
        # demandé « industrie », on ne peut pas affirmer que cette ligne en est.
        # Elle est comptée à part par l'appelant, jamais avalée en silence.
        assert matches_sectors(None, ["industry"]) is False
        assert matches_sectors("ZZ.99Z", ["industry"]) is False

    def test_un_secteur_inconnu_de_la_table_ne_filtre_RIEN(self):
        # Sinon un libellé d'écran ajouté sans son entrée de table viderait la
        # liste en silence — le pire des deux échecs possibles.
        assert matches_sectors("62.02A", ["licorne"]) is True


class TestUnknownSectors:
    def test_nomme_les_secteurs_que_la_table_ne_connait_pas(self):
        assert unknown_sectors(["it", "licorne", "industry"]) == ["licorne"]

    def test_ne_signale_ni_all_ni_le_vide(self):
        assert unknown_sectors(["all", "", "it"]) == []


def test_la_table_est_non_vide_et_ses_sections_sont_des_lettres():
    # Garde de corpus : une table vidée par erreur rendrait `matches_sectors`
    # universellement vrai, et tous les tests ci-dessus resteraient verts.
    assert len(SECTOR_TO_NAF_SECTION) >= 10
    assert all(len(s) == 1 and s.isupper() for s in SECTOR_TO_NAF_SECTION.values())
