"""PR-1b — le profil ESN doit PILOTER les recommandations, et les prompts
doivent émettre une ANTI-RECOMMANDATION explicite (qui / quoi NE PAS poursuivre,
et pourquoi, vu le profil).

Garde-fou de régression pour le retour Matteo : « je te conseille X parce que
ton profil est data/cloud… » + « je ne te conseille pas le board parce que ce
n'est pas actionnable pour une ESN en première approche ».
"""
from __future__ import annotations

from app.prompts import bellum_organigramme, bellum_plan, bellum_strategy

# Keys the prompts actually read (companyName/offers/size/…), not the onboarding
# snake_case — this mirrors what the analysis pipeline now feeds them (PR-1a).
PROFILE = {
    "companyName": "Comet",
    "size": "20-100",
    "offers": ["Data", "Cloud"],
    "sectors": ["Banque"],
    "geoZone": "France",
    "references": ["BNP Paribas"],
    "personas": ["DSI"],
    "salesCycle": "3-6 mois",
    "mainChallenge": "accès aux décideurs IT",
}

# The three prompts that recommend an angle / a contact order / an entity.
GROUNDED_PROMPTS = [bellum_strategy, bellum_organigramme, bellum_plan]


class TestRecoGrounding:
    def test_system_prompts_are_piloted_by_the_profile(self):
        for mod in GROUNDED_PROMPTS:
            sp = mod.build_system_prompt(PROFILE)
            assert "PILOTAGE PAR TON PROFIL" in sp, mod.__name__

    def test_system_prompts_carry_an_explicit_anti_recommendation(self):
        for mod in GROUNDED_PROMPTS:
            sp = mod.build_system_prompt(PROFILE)
            assert "ANTI-RECOMMANDATION" in sp, mod.__name__

    def test_grounding_is_concrete_offers_are_interpolated(self):
        # The pilot instruction must reference the REAL offers so the model can
        # say "colle à ton offre Data / Cloud" — not a generic placeholder.
        for mod in GROUNDED_PROMPTS:
            sp = mod.build_system_prompt(PROFILE)
            assert "Data" in sp and "Cloud" in sp, mod.__name__

    def test_profile_neutral_run_still_builds(self):
        # No profile (empty dict) must not raise — a profile-neutral run stays valid.
        for mod in GROUNDED_PROMPTS:
            sp = mod.build_system_prompt({})
            assert isinstance(sp, str) and len(sp) > 200, mod.__name__
