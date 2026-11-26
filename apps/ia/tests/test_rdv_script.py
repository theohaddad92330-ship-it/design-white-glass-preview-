"""rdvScript bridges + story_frames (#Drive/ORION meeting_script)."""

from __future__ import annotations

from app.models.outputs.research import RdvScript, ResearchStrategy
from app.prompts.bellum_strategy import build_user_prompt


def test_prompt_requests_bridges_and_story_frames():
    prompt = build_user_prompt("Société Générale", "", "", "")
    assert "bridges" in prompt
    assert "storyFrames" in prompt


def test_rdv_script_round_trips_new_fields():
    r = RdvScript.model_validate(
        {"opening": "o", "bridges": ["justement, ça rejoint…"], "storyFrames": ["chez une néobanque comparable…"]},
    )
    assert r.bridges == ["justement, ça rejoint…"]
    assert r.story_frames == ["chez une néobanque comparable…"]
    dumped = r.model_dump(by_alias=True)
    assert dumped["bridges"] == ["justement, ça rejoint…"]
    assert dumped["storyFrames"] == ["chez une néobanque comparable…"]


def test_rdv_script_defaults_empty():
    r = RdvScript()
    assert r.bridges == []
    assert r.story_frames == []


def test_strategy_output_preserves_rdv_extras_through_alias():
    # ⚠️ `angles` est là pour une raison : `rdvScript` ne COMPTE pas comme une
    # section remplie (son défaut est un objet plein de chaînes vides), donc une
    # stratégie qui n'aurait que lui est refusée par le schéma. Ce test mesure le
    # passage des alias, pas le minimum collectif.
    strat = ResearchStrategy.model_validate(
        {
            "angles": [{"title": "Renfort build"}],
            "rdvScript": {"opening": "o", "storyFrames": ["s1"], "bridges": ["b1"]},
        },
    )
    dumped = strat.model_dump(by_alias=True)
    assert dumped["rdvScript"]["storyFrames"] == ["s1"]
    assert dumped["rdvScript"]["bridges"] == ["b1"]
