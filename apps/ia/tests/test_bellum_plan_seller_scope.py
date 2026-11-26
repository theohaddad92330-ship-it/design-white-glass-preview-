"""#2118.9 / #2118.16 — la BU du commercial et la stratégie validée à l'audit
atteignent le VERDICT de la Synthèse.

Décisions Louis 15/09 : « changer la BU / la stratégie validée change le texte
du verdict/raisons en Synthèse ». Le verdict (`bellum_read.verdict_line` /
`why`) est écrit par la section `evaluation` de la phase 4 : c'est donc CETTE
section qui doit recevoir les deux faits, avec la consigne de les citer.

Trois choses à défendre :

1. sans BU ni stratégie, le prompt est byte-identique à avant (aucun bloc) ;
2. avec, le bloc NOMME la BU (nom, échelle, territoire, spécialités) et la
   stratégie (dans les mots de l'audit), et demande qu'une raison les cite ;
3. une stratégie hors catalogue ou une BU sans nom ne produit rien — jamais un
   fait deviné.
"""

from __future__ import annotations

from app.prompts.bellum_plan import build_subsection_user_prompt, seller_scope_directive_block

_PROFILE = {
    "companyName": "Acme ESN",
    "entryStrategy": "topDown",
    "businessUnits": [
        {"name": "Agence Lyon", "kind": "agency", "territory": "Auvergne-Rhône-Alpes", "specialties": ["Data", "Cloud"]},
    ],
}


def test_sans_bu_ni_strategie_le_bloc_est_vide() -> None:
    assert seller_scope_directive_block(None) == ""
    assert seller_scope_directive_block({}) == ""
    assert seller_scope_directive_block({"companyName": "Acme ESN"}) == ""


def test_sans_bu_ni_strategie_la_section_evaluation_reste_byte_identique() -> None:
    bare = build_subsection_user_prompt(company_name="Thales", section="evaluation", profile_data={"companyName": "Acme"})
    none = build_subsection_user_prompt(company_name="Thales", section="evaluation", profile_data=None)
    assert bare == none
    assert "TON PÉRIMÈTRE" not in bare


def test_la_strategie_validee_est_nommee_dans_les_mots_de_l_audit() -> None:
    block = seller_scope_directive_block({"entryStrategy": "topDown"})
    assert "entrée par le haut" in block
    assert "validée à l'audit" in block


def test_la_bu_est_nommee_avec_ce_qu_elle_declare() -> None:
    block = seller_scope_directive_block(_PROFILE)
    assert "Agence Lyon" in block
    assert "agence" in block
    assert "Auvergne-Rhône-Alpes" in block
    assert "Data, Cloud" in block


def test_la_consigne_demande_que_le_verdict_les_cite() -> None:
    block = seller_scope_directive_block(_PROFILE)
    assert "bellum_read.why" in block
    assert "CITE" in block


def test_la_section_evaluation_porte_le_bloc_les_autres_non() -> None:
    evaluation = build_subsection_user_prompt(company_name="Thales", section="evaluation", profile_data=_PROFILE)
    offers = build_subsection_user_prompt(company_name="Thales", section="offers", profile_data=_PROFILE)
    assert "Agence Lyon" in evaluation
    assert "entrée par le haut" in evaluation
    assert "Agence Lyon" not in offers


def test_sait_dire_non_une_valeur_hors_catalogue_ne_produit_rien() -> None:
    assert seller_scope_directive_block({"entryStrategy": "sideways"}) == ""
    assert seller_scope_directive_block({"businessUnits": [{"name": "  ", "kind": "agency"}]}) == ""
    assert seller_scope_directive_block({"businessUnits": "Agence Lyon"}) == ""
