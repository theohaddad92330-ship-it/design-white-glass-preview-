"""#4975 / #4976 / #4977 — l'ouverture d'appel est GÉNÉRALE (jamais les objections) et cite l'offre d'emploi
déclencheuse quand elle est au contexte, sans en inventer ; les objections du dossier sont plausibles pour CE compte."""

from __future__ import annotations

from app.prompts import bellum_outreach, bellum_strategy
from tests.test_prompts_new import SAMPLE_PROFILE


def _phone() -> str:
    return bellum_outreach.build_system_prompt(SAMPLE_PROFILE, "phone")


def test_louverture_ne_traite_aucune_objection() -> None:
    text = _phone()
    assert "OUVERTURE GÉNÉRALE" in text
    assert "ne réponds à AUCUNE objection" in text


def test_une_seule_consigne_pour_loffre_demploi() -> None:
    # #4977 : la consigne vit dans `message_grounding._phone_offer_block` (topic « job_offer »), pas dans le prompt système.
    assert "Offre d’emploi" not in _phone()


def test_les_autres_canaux_ne_changent_pas() -> None:
    assert "OUVERTURE GÉNÉRALE" not in bellum_outreach.build_system_prompt(SAMPLE_PROFILE, "email")


def test_les_objections_du_dossier_sont_plausibles_pour_ce_compte() -> None:
    text = bellum_strategy.build_user_prompt("Acme", "", "", "")
    assert "OBJECTIONS PLAUSIBLES POUR CE COMPTE" in text
    assert "deja client" in text
