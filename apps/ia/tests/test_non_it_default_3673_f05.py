"""#3673.4/.5/.7 — pas de biais IT par défaut (lot F05)."""

from __future__ import annotations

import pytest

from app.prompts import (
    bellum_battlecard,
    bellum_compare,
    bellum_icebreaker,
    bellum_messages,
    bellum_outreach,
    bellum_scorer,
    bellum_summary,
)
from app.services.context_mode import profile_for_context_mode
from app.services.domain_focus import looks_like_it_esn, resolve_domain_focus

_INDUS_NO_OFFERS = {"companyName": "MecaConseil", "offerDomain": "industrial_engineering"}
def _system(module, profile):
    if module is bellum_outreach:
        return module.build_system_prompt(profile, "linkedin")
    return module.build_system_prompt(profile)


_MODULES = [bellum_battlecard, bellum_compare, bellum_icebreaker, bellum_messages, bellum_outreach, bellum_scorer, bellum_summary]


@pytest.mark.parametrize("module", _MODULES, ids=lambda m: m.__name__.rsplit(".", 1)[-1])
def test_vendeur_non_it_sans_offre_declaree_ne_recoit_pas_conseil_it(module) -> None:
    assert "conseil IT" not in _system(module, _INDUS_NO_OFFERS)


@pytest.mark.parametrize("module", _MODULES, ids=lambda m: m.__name__.rsplit(".", 1)[-1])
def test_profil_absent_garde_le_defaut_historique(module) -> None:
    assert "conseil IT" in _system(module, {})


def test_mode_neutre_pose_la_lentille_generique_sans_offre() -> None:
    profile = profile_for_context_mode({}, "neutral")
    assert not looks_like_it_esn(profile)
    assert resolve_domain_focus(profile)["label"] != "IT"


def test_mode_neutre_ne_touche_pas_un_profil_qui_porte_ses_offres() -> None:
    profile = {"offers": ["Data & IA"]}
    assert profile_for_context_mode(profile, "neutral") == profile


def test_mon_activite_et_absence_de_mode_restent_inchanges() -> None:
    assert profile_for_context_mode({}, None) == {}
    assert profile_for_context_mode({}, "my_activity") == {}
    assert looks_like_it_esn(profile_for_context_mode({}, "my_activity"))


def test_un_secteur_n_est_pas_une_expertise() -> None:
    """« Numérique » en SECTEUR ne fait pas d'une ESN d'ingénierie une ESN IT."""
    profile = {"offers": ["bureau d'études structures"], "sectors": ["numérique", "data centers"]}
    assert not looks_like_it_esn(profile)
