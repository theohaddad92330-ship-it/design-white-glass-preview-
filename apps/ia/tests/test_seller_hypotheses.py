"""#3753.3 — le ciblage que l'ESN a fait d'un compte entre en phase 1 comme
HYPOTHÈSES DU VENDEUR : fournies, non vérifiées, jamais présentées comme des
faits collectés. Le tier (A/B/C) n'est jamais lu comme une probabilité (c26).
"""

from __future__ import annotations

from app.services.seller_hypotheses import append_seller_hypotheses, seller_hypotheses_block

_FULL = {
    "tier_label": "A",
    "selection_reason": "Plan de transformation SI",
    "addressable_issues": "Dette applicative",
    "upcoming_it_projects": "Migration ERP 2027",
}


def test_le_bloc_nomme_le_vendeur_et_dit_non_verifie() -> None:
    block = seller_hypotheses_block(_FULL)
    assert "HYPOTHÈSES DU VENDEUR" in block
    assert "NON VÉRIFIÉES" in block
    assert "Tier A" in block
    assert "Plan de transformation SI" in block
    assert "Dette applicative" in block
    assert "Migration ERP 2027" in block


def test_le_bloc_interdit_de_les_citer_comme_des_faits_collectes() -> None:
    block = seller_hypotheses_block(_FULL)
    assert "jamais comme des faits" in block.lower()
    assert "selon votre ciblage" in block.lower()


def test_le_tier_n_est_jamais_une_probabilite() -> None:
    block = seller_hypotheses_block(_FULL).lower()
    assert "%" not in block
    assert "probabilité" in block  # la consigne l'écarte nommément
    assert "pas une probabilité" in block


def test_aucune_donnee_aucun_bloc() -> None:
    assert seller_hypotheses_block(None) == ""
    assert seller_hypotheses_block({}) == ""
    empty = {"tier_label": None, "selection_reason": " ", "addressable_issues": None, "upcoming_it_projects": ""}
    assert seller_hypotheses_block(empty) == ""


def test_un_champ_absent_ne_fait_aucune_ligne() -> None:
    block = seller_hypotheses_block({"tier_label": None, "selection_reason": "Raison seule"})
    assert "Raison seule" in block
    assert "Classement de l'ESN" not in block
    assert "Problématiques" not in block
    assert "Projets IT" not in block


def test_un_tier_inconnu_est_ignore() -> None:
    block = seller_hypotheses_block({"tier_label": "Z", "selection_reason": "x"})
    assert "Tier Z" not in block


def test_append_ne_change_rien_sans_donnee_et_n_ecrase_rien_sinon() -> None:
    assert append_seller_hypotheses("contexte", None) == "contexte"
    out = append_seller_hypotheses("contexte", _FULL)
    assert out.startswith("contexte")
    assert "HYPOTHÈSES DU VENDEUR" in out
    assert append_seller_hypotheses("", _FULL).startswith("=====")


# #3819 (lot RBB, décision Louis 11/10) — un compte venu de Découvrir garde sa
# raison de sélection et ses critères ; le run les reçoit pour son cadrage.
_DISCOVER = {
    "tier_label": None,
    "selection_reason": None,
    "addressable_issues": None,
    "upcoming_it_projects": None,
    "discover_origin_reason": "5 postes data ouverts",
    "discover_origin_criteria": ["secteur : Assurance & mutuelles", "zone : Lille"],
}


def test_l_origine_decouvrir_entre_dans_le_cadrage() -> None:
    block = seller_hypotheses_block(_DISCOVER)
    assert "HYPOTHÈSES DU VENDEUR" in block
    assert "Sélectionné dans Découvrir sur : secteur : Assurance & mutuelles ; zone : Lille" in block
    assert "Raison de la sélection (Découvrir) : 5 postes data ouverts" in block
    assert "cadrage" in block.lower()


def test_l_origine_decouvrir_seule_ou_vide() -> None:
    assert "Sélectionné dans Découvrir" not in seller_hypotheses_block(_FULL)
    only_reason = seller_hypotheses_block({"discover_origin_reason": "Appel d'offres publié"})
    assert "Appel d'offres publié" in only_reason
    assert "Sélectionné dans Découvrir sur" not in only_reason
    assert seller_hypotheses_block({"discover_origin_criteria": [" ", ""], "discover_origin_reason": ""}) == ""


# ── #4642 — la demande de Laura ordonne le dossier, elle ne le restreint pas ──────────────────

_LAURA = {
    "discover_origin_criteria": [
        "demande : issue d'une conversation avec Laura (à traiter en tête et à nommer ; rien n'est écarté)",
        "compétence : Java, Kafka",
        "offres relevées par la recherche : Dev Java Kafka (2026-10-20)",
    ]
}


def test_4642_la_demande_de_laura_passe_en_tete_et_se_nomme() -> None:
    block = seller_hypotheses_block(_LAURA)
    assert "Dev Java Kafka (2026-10-20)" in block
    assert "EN TÊTE" in block and "lié à votre demande" in block


def test_4642_dit_non_le_cadrage_n_ecarte_aucun_signal_contact_ou_offre() -> None:
    block = seller_hypotheses_block(_LAURA)
    assert "AUCUN signal, contact ou offre" in block
    assert "tout le reste est analysé et listé" in block


def test_4642_dit_non_sans_demande_de_laura_le_bloc_est_celui_d_avant() -> None:
    plain = {"discover_origin_criteria": ["zone : Lille", "compétence : Java"]}
    block = seller_hypotheses_block(plain)
    assert "EN TÊTE" not in block and "lié à votre demande" not in block
