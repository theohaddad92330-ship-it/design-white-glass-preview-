"""LUDOVIC-C LC.5 — le script d'appel suit le pack et les métiers du profil.

Recette prod 19/10 (Stelya, pack industriel) : « Préparer mon appel » ouvrait sur
« l'harmonisation des outils et des données » (angle IT) et le badge « Message peu
personnalisé » restait alors que le signal daté et le métier étaient cités.
"""

from __future__ import annotations

from app.prompts.bellum_outreach import build_system_prompt, seller_pack_block
from app.services.recommendation_specificity import STATUS_SPECIFIC, assess_specificity, registry_from_inputs

STELYA = {
    "companyName": "Stelya",
    "offerDomain": "industrial_engineering",
    "placedRoles": ["Technicien après-vente", "Ingénieur méthodes", "Responsable qualité"],
}
IT_ESN = {"companyName": "Acme IT", "offers": ["Data", "Cloud"]}


def test_pack_industriel_le_prompt_d_appel_parle_des_metiers_jamais_d_outils_it() -> None:
    prompt = build_system_prompt(STELYA, "phone")
    assert "Technicien après-vente" in prompt
    assert "jamais" in seller_pack_block(STELYA).lower()
    assert "outils informatiques" in seller_pack_block(STELYA)


def test_dit_non_espace_it_prompt_byte_identique() -> None:
    assert seller_pack_block(IT_ESN) == ""
    assert seller_pack_block({}) == ""
    assert "PRISME DU PACK" not in build_system_prompt(IT_ESN, "phone")


def test_badge_peu_personnalise_leve_quand_signal_date_et_metier_cites() -> None:
    registry = registry_from_inputs(
        profile=STELYA,
        research={
            "companyName": "STILL",
            "recentSignals": [{"signal": "Recrutements techniciens après-vente", "date": "2026-10-14"}],
        },
        contacts=[{"fullName": "Jean Dupont"}],
    )
    script = (
        "Vous recrutez des techniciens après-vente depuis le 2026-10-14 : "
        "comment tenez-vous la charge de votre équipe de Technicien après-vente ?"
    )
    verdict = assess_specificity([script], registry)
    assert verdict["status"] == STATUS_SPECIFIC
    assert {e["kind"] for e in verdict["elements"]} >= {"dated_signal", "esn_expertise"}
