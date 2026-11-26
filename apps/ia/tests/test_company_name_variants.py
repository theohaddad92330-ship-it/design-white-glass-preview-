"""#3817.1 — variantes de nom pour l'appariement offres (grand groupe à suffixe)."""

from app.services.company_name_variants import company_name_variants


def test_nom_a_suffixe_pays_et_forme_juridique():
    assert company_name_variants("JCDecaux France") == ["JCDecaux France", "JCDecaux"]


def test_nom_avec_forme_juridique_seule():
    assert company_name_variants("Capgemini SE") == ["Capgemini SE", "Capgemini"]


def test_siren_connu_ajoute_en_derniere_variante():
    assert company_name_variants("JCDecaux France", siren="306972387") == [
        "JCDecaux France",
        "JCDecaux",
        "306972387",
    ]


def test_sans_suffixe_une_seule_variante():
    assert company_name_variants("Qonto") == ["Qonto"]


def test_nom_vide_aucune_variante():
    assert company_name_variants("") == []
    assert company_name_variants(None) == []


def test_siren_absent_jamais_ajoute():
    assert company_name_variants("Qonto", siren=None) == ["Qonto"]
    assert company_name_variants("Qonto", siren="") == ["Qonto"]
