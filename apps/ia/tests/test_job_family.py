"""#3204.2 (épopée #3238) — la famille métier, seulement quand le titre la nomme."""

from __future__ import annotations

from app.services.job_family import derive_job_family


def test_titre_developpeur_est_classe_developpement() -> None:
    assert derive_job_family("Développeur Java confirmé") == "developpement"


def test_data_engineer_l_emporte_sur_developpement_generique() -> None:
    # "Lead Data Engineer" contient un marqueur data_ia (plus spécifique) —
    # il doit primer sur un marqueur développement générique s'il y en avait un.
    assert derive_job_family("Lead Data Engineer") == "data_ia"


def test_devops_est_classe_infrastructure_cloud() -> None:
    assert derive_job_family("Ingénieur DevOps") == "infrastructure_cloud"


def test_product_owner_est_classe_produit_design() -> None:
    assert derive_job_family("Product Owner e-commerce") == "produit_design"


def test_titre_muet_rend_none() -> None:
    assert derive_job_family("Rejoignez notre aventure") is None
    assert derive_job_family(None) is None
    assert derive_job_family("") is None
