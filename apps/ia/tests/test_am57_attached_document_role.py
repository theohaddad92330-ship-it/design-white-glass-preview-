"""#AM.57 / #AM.58 (#4059) — un document joint à /chat est lu pour ce qu'il est : un BESOIN entrant (PDF, DOCX…)
comme le texte collé l'est déjà — compilé en proposition (`compile_need`), classé SANS être créé — ou un CV, qui
passe par l'import CV existant (lecture auto, fiche `needs_review`) puis entre dans la comparaison."""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt
from app.services.attached_document_role import attached_documents_note, document_role

NEED = {
    "title": "AO-DSI-2026.pdf",
    "content": "Appel d'offres : mission de 12 mois en régie, démarrage au 1er décembre à Paris. Profil recherché : "
    "architecte Java senior, 8 ans d'expérience. Compétences requises : Java, Kafka. TJM cible à discuter.",
}
CV = {
    "title": "CV_Ana_Roy.docx",
    "content": "Ana Roy — Architecte Java. Expériences professionnelles : 2018-2024 Société Générale. Formation : "
    "Master informatique. Compétences : Java, Kafka. Langues : français, anglais.",
}
OTHER = {"title": "notes.md", "content": "Bonjour, voici des notes sur la réunion de jeudi."}


def test_le_role_d_un_document_se_lit_sur_son_contenu():
    assert document_role(NEED) == "need"
    assert document_role(CV) == "cv"
    assert document_role(OTHER) is None
    assert document_role({"title": "", "content": ""}) is None


def test_un_besoin_joint_est_lu_comme_un_besoin_entrant_sans_etre_cree():
    note = attached_documents_note([NEED])
    assert "AO-DSI-2026.pdf" in note
    assert "compile_need" in note and "draft_need" in note
    assert "jamais un besoin créé" in note


def test_un_cv_joint_est_propose_a_l_import_cv_jamais_presente_comme_deja_importe():
    note = attached_documents_note([CV])
    assert "CV_Ana_Roy.docx" in note
    assert "import" in note.lower() and "needs_review" in note
    assert "PAS encore dans le vivier" in note
    assert "run_matching" in note


def test_am58_la_consigne_dit_que_l_import_se_fait_depuis_le_fil_et_reprend_la_comparaison():
    note = attached_documents_note([CV])
    assert "Ajouter un CV" in note
    assert "sans quitter" in note
    assert "message" in note  # la fin d'import revient dans le fil comme un message de la personne


def test_rien_a_dire_pour_un_document_ordinaire_ou_aucun_document():
    assert attached_documents_note([OTHER]) == ""
    assert attached_documents_note([]) == ""


def test_la_consigne_rejoint_le_prompt_apres_le_bloc_des_documents_jamais_dedans():
    note = attached_documents_note([NEED])
    prompt = build_system_prompt(
        {},
        {},
        "",
        "",
        attached_documents="<attached_documents>### AO\n...</attached_documents>",
        attached_documents_note=note,
    )
    assert "BESOIN ENTRANT JOINT" in prompt
    assert prompt.index("</attached_documents>") < prompt.index("BESOIN ENTRANT JOINT")
    # Sans document, ou sans note : prompt inchangé au byte près.
    assert build_system_prompt({}, {}, "", "") == build_system_prompt({}, {}, "", "", attached_documents_note="")
