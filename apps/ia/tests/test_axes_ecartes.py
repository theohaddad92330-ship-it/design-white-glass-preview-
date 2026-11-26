"""axesEcartes — the structured "set aside" selection logic (Théo #1 : explique
pourquoi tu écartes SAP/cyber/… pour CE profil, et comment les réactiver)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.outputs.research import AxeEcarte, ResearchOutput, ResearchStrategy
from app.prompts.bellum_strategy import build_user_prompt


def test_prompt_requests_axes_ecartes():
    prompt = build_user_prompt("Société Générale", "", "", "")
    assert "axesEcartes" in prompt
    assert "commentReactiver" in prompt


def test_axe_ecarte_round_trips_through_alias():
    a = AxeEcarte.model_validate(
        {"angle": "SAP S/4HANA", "raison": "hors de ton offre data/cloud", "commentReactiver": "relance sous un profil ESN SAP"},
    )
    assert a.angle == "SAP S/4HANA"
    assert a.comment_reactiver == "relance sous un profil ESN SAP"
    dumped = a.model_dump(by_alias=True)
    assert dumped["commentReactiver"] == "relance sous un profil ESN SAP"


def test_strategy_output_preserves_axes_ecartes():
    strat = ResearchStrategy.model_validate(
        {"axesEcartes": [{"angle": "Cybersécurité / SOC", "raison": "hors practice", "commentReactiver": "si tu ouvres une practice cyber"}]},
    )
    dumped = strat.model_dump(by_alias=True)
    assert dumped["axesEcartes"][0]["angle"] == "Cybersécurité / SOC"
    assert dumped["axesEcartes"][0]["commentReactiver"] == "si tu ouvres une practice cyber"


def test_research_output_carries_axes_ecartes_end_to_end():
    # The merged Phase-1 output must NOT drop axesEcartes (ResearchOutput is
    # extra="ignore" — an undeclared field would vanish, so this guards the
    # passthrough from strategy → merged → ResearchOutput → front payload).
    merged = ResearchStrategy.model_validate(
        {"axesEcartes": [{"angle": "SAP", "raison": "hors offre", "commentReactiver": "profil SAP"}]},
    ).model_dump(by_alias=True)
    out = ResearchOutput(**merged).model_dump(by_alias=True)
    assert out["axesEcartes"][0]["angle"] == "SAP"
    assert out["axesEcartes"][0]["commentReactiver"] == "profil SAP"


def test_research_output_drops_empty_angle_and_caps():
    # Validator: an entry with no named angle is fabrication-adjacent (§8) → drop.
    # And the catalogue is capped so it stays a signal, not a dump.
    items = [{"angle": "", "raison": "vide"}] + [{"angle": f"Axe {i}"} for i in range(10)]
    out = ResearchOutput(axesEcartes=items)
    assert all(a.angle.strip() for a in out.axes_ecartes)
    assert len(out.axes_ecartes) == 6  # _MAX_AXES_ECARTES


def test_research_output_axes_ecartes_defaults_empty():
    assert ResearchOutput().axes_ecartes == []


def test_malformed_axes_ecartes_never_crash_validation():
    # Review fix: a missing/null angle, a bare string, junk items or a non-list
    # must NOT raise ValidationError (would abort the whole strategy phase).
    #
    # ⚠️ Chaque cas porte désormais une AUTRE section remplie (`pains`) : depuis
    # que le schéma refuse une stratégie qui ne dit rien, un payload dont le seul
    # contenu est un `axesEcartes` illisible ne dit… rien. Ce test-ci mesure le
    # nettoyeur d'axes, pas le minimum collectif — le cas « axes cassés et rien
    # d'autre » est vérifié juste en dessous, où il est le SUJET.
    for bad in (
        {"axesEcartes": [{"raison": "x", "commentReactiver": "y"}]},  # missing angle
        {"axesEcartes": [{"angle": None}]},  # null angle
        {"axesEcartes": ["SAP"]},  # bare string
        {"axesEcartes": [None, 42, {"angle": "Cyber"}]},  # junk + valid
        {"axesEcartes": "nonsense"},  # non-list
    ):
        strat = ResearchStrategy.model_validate({**bad, "pains": [{"pain": "Dette technique"}]})
        out = ResearchOutput(**strat.model_dump(by_alias=True))  # must not raise
        for a in out.axes_ecartes:
            assert a.angle.strip()  # only real angles survive


def test_des_axes_illisibles_et_rien_d_autre_ne_font_pas_une_strategie():
    """Un `axesEcartes` que le nettoyeur ramène à `[]`, et aucune autre section :
    la réponse ne dit rien, et le schéma doit le DIRE au lieu de rendre un objet
    vide qui se lira « ce compte n'a pas d'angle »."""
    with pytest.raises(ValidationError):
        ResearchStrategy.model_validate({"axesEcartes": "nonsense"})


def test_bare_string_axe_becomes_an_angle():
    out = ResearchOutput(axesEcartes=["SAP"])
    assert out.axes_ecartes[0].angle == "SAP"
