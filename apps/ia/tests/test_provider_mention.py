"""#3205.1 (épopée #3239) — prestataire tiers mentionné dans une offre d'emploi."""

from __future__ import annotations

from app.services.provider_mention import derive_third_party_provider_mention


def test_marqueur_fr_en_partenariat_avec() -> None:
    assert derive_third_party_provider_mention("Poste en partenariat avec Sopra Steria sur ce projet") == "sopra steria"


def test_marqueur_fr_aux_cotes_de() -> None:
    assert (
        derive_third_party_provider_mention("Vous interviendrez aux côtés de notre partenaire Capgemini")
        == "capgemini"
    )


def test_marqueur_en_in_partnership_with() -> None:
    assert derive_third_party_provider_mention("Role in partnership with Accenture on this program") == "accenture"


def test_aucun_marqueur_rend_none() -> None:
    assert derive_third_party_provider_mention("Développeur Java confirmé") is None
    assert derive_third_party_provider_mention(None) is None
    assert derive_third_party_provider_mention("") is None


def test_pour_notre_client_ne_nomme_jamais_un_tiers() -> None:
    # RÈGLE : « pour notre client X » nomme l'EMPLOYEUR, pas un prestataire
    # tiers — ce marqueur n'est délibérément PAS dans la liste.
    assert derive_third_party_provider_mention("Mission pour notre client Renault") is None
