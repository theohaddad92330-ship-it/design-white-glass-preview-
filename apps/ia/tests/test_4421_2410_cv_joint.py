"""#4421.2 / #4421.10 (mesure prod du 24/10) — « trouve moi une mission à lille pour ce profil » + CV joint (PDF).

Laura répondait « Le CV n'est pas encore importé dans le vivier, donc aucune mission ne peut être qualifiée » :
la consigne #AM.58 du CV joint ne parlait que de l'import au vivier puis de `run_matching`. Un CV joint se LIT et
s'utilise tout de suite : ses compétences vont à `find_accounts_for_talent`, la zone DITE dans le message prime
sur celles du CV et de la fiche ; l'import reste un geste proposé, jamais un préalable.
"""

from __future__ import annotations

from app.services.attached_document_role import attached_documents_note, document_role

CV = {
    "title": "CV_formateur_IA.pdf",
    "content": (
        "Curriculum vitae. Formateur IA. Expériences professionnelles : animation de formations à l'IA générative "
        "et à Microsoft 365 Copilot (Strasbourg, Paris, distanciel). Formation : master. Compétences clés : "
        "acculturation IA, prompt engineering."
    ),
}


def test_le_cv_du_24_10_est_lu_comme_un_cv() -> None:
    assert document_role(CV) == "cv"


def test_un_cv_joint_part_tout_de_suite_vers_les_comptes_qui_recrutent() -> None:
    note = attached_documents_note([CV])
    assert "find_accounts_for_talent" in note
    # Les compétences du CV sont passées telles qu'une offre les écrit, sans nom de consultant à chercher.
    assert "`skills`" in note and "`consultant`" in note


def test_l_import_au_vivier_n_est_jamais_un_prealable() -> None:
    note = attached_documents_note([CV])
    assert "jamais un préalable" in note
    assert "Ajouter un CV" in note  # l'import reste proposé, depuis le fil


def test_la_zone_dite_dans_le_message_prime_sur_celles_du_cv() -> None:
    note = attached_documents_note([CV])
    assert "la zone DITE dans le message prime" in note
    # Plusieurs villes dans le CV ne sont jamais une contradiction à trancher par une question.
    assert "contradiction" in note
