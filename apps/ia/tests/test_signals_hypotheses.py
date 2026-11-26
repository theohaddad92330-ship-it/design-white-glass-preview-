"""Signals → qualified hypotheses (#275) — the prompt asks for them, the model
carries them, and the golden eval scores them.

Semantic quality (is the hypothesis actually supported by the signals?) is left
to the golden-set eval / --judge against a live run."""

from __future__ import annotations

from app.models.outputs.research import QualifiedHypothesis, RecentSignal, ResearchSignals
from app.prompts.bellum_signals import build_user_prompt
from evals.golden_eval import evaluate


def test_prompt_requests_qualified_hypotheses():
    prompt = build_user_prompt("Société Générale", "", "", "")
    assert "qualifiedHypotheses" in prompt
    assert "convergence" in prompt.lower()


def test_prompt_requests_signal_impact_distinct_from_sales_implication():
    # #2107.31 — l'ampleur business du signal, distincte de #2107.33
    # (`salesImplication`, déjà livrée). Les deux doivent être demandées.
    prompt = build_user_prompt("Société Générale", "", "", "")
    assert '"impact"' in prompt
    assert '"salesImplication"' in prompt


def test_recent_signal_carries_impact_round_trip():
    s = RecentSignal.model_validate(
        {"signal": "3 300 recrutements annoncés", "salesImplication": "Renfort recrutement/formation.",
         "impact": "Transformation à l'échelle du groupe."},
    )
    assert s.impact == "Transformation à l'échelle du groupe."
    assert s.impact != s.sales_implication


def test_recent_signal_impact_defaults_empty_never_guessed():
    s = RecentSignal.model_validate({"signal": "Nomination DSI"})
    assert s.impact == ""


def test_hypothesis_model_round_trips():
    h = QualifiedHypothesis.model_validate(
        {"hypothesis": "industrialise ses modèles ML", "basedOnSignals": ["recrut. data", "plateforme"],
         "confidence": "probable", "esnAngle": "renfort MLOps"},
    )
    assert h.based_on_signals == ["recrut. data", "plateforme"]
    assert h.confidence == "probable"
    dumped = h.model_dump(by_alias=True)
    assert dumped["basedOnSignals"] == ["recrut. data", "plateforme"]
    assert dumped["esnAngle"] == "renfort MLOps"


def test_hypothesis_confidence_defaults_a_verifier():
    h = QualifiedHypothesis.model_validate({"hypothesis": "migre vers le cloud"})
    assert h.confidence == "a_verifier"
    assert h.esn_angle == ""


def test_signals_output_preserves_hypotheses_through_alias():
    # "confirmée" est légitime ici : 3 signaux convergents la soutiennent (règle
    # de convergence — voir test_relevance_guards pour le plafonnement).
    sig = ResearchSignals.model_validate(
        {
            "qualifiedHypotheses": [
                {
                    "hypothesis": "anti-fraude temps réel",
                    "confidence": "confirmee",
                    "basedOnSignals": ["recrutement", "RFP", "presse"],
                }
            ]
        },
    )
    dumped = sig.model_dump(by_alias=True)
    assert dumped["qualifiedHypotheses"][0]["hypothesis"] == "anti-fraude temps réel"
    assert dumped["qualifiedHypotheses"][0]["confidence"] == "confirmee"


def test_golden_scores_hypotheses_group():
    golden = {
        "company": "SG",
        "expect": {"hypotheses": {"min_count": 2, "mention_any": ["mlops", "fraude"]}},
    }
    good = {"qualifiedHypotheses": [
        {"hypothesis": "industrialise le MLOps"},
        {"hypothesis": "renforce l'anti-fraude"},
    ]}
    report = evaluate(good, golden)
    assert report.passed(only=["hypotheses"])

    empty = {"qualifiedHypotheses": []}
    assert not evaluate(empty, golden).passed(only=["hypotheses"])
