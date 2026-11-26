"""Garde-fous de pertinence déterministes (audit optimisation) : bruit filiales,
convergence signaux→confiance, hallucination chiffres, contact d'action inexistant."""

from __future__ import annotations

from app.models.outputs.research import QualifiedHypothesis
from app.routers.phase4_plan import _sort_for_cap, _trim_account_data
from app.services.entities import classify_entity_relevance
from app.services.quality_judge import _FUNDING_RE, _GROWTH_PCT_RE, judge_quality
from app.services.rag_service import format_knowledge_context


# ── #1 : le dump des filiales (bruit) ne part PAS dans le prompt plan ─────────
def test_trim_drops_the_full_subsidiary_noise_dump():
    account = {
        "sector": "Banque",
        "subsidiaries": [{"name": f"SCI {i}"} for i in range(98)],
        "entitiesExhaustive": [{"name": "ITIM", "getsPlay": True}],
    }
    trimmed = _trim_account_data(account)
    assert "subsidiaries" not in trimmed  # le bruit ne dilue plus le bloc caché ~11×
    assert "entitiesExhaustive" in trimmed  # la vue gated reste


# ── #2 : la confiance d'une hypothèse est plafonnée par la convergence ────────
def test_confidence_capped_by_signal_convergence():
    # 1 signal → ne peut PAS être "confirmée" (plafonné à a_verifier).
    h = QualifiedHypothesis(hypothesis="x", basedOnSignals=["s1"], confidence="confirmee")
    assert h.confidence == "a_verifier"
    # 2 signaux → plafond "probable".
    h2 = QualifiedHypothesis(hypothesis="x", basedOnSignals=["s1", "s2"], confidence="confirmee")
    assert h2.confidence == "probable"
    # 3 signaux → "confirmée" autorisée.
    h3 = QualifiedHypothesis(hypothesis="x", basedOnSignals=["s1", "s2", "s3"], confidence="confirmee")
    assert h3.confidence == "confirmee"
    # Modèle prudent NON remonté : 3 signaux mais LLM "a_verifier" → reste a_verifier.
    h4 = QualifiedHypothesis(hypothesis="x", basedOnSignals=["s1", "s2", "s3"], confidence="a_verifier")
    assert h4.confidence == "a_verifier"


# ── #3 : garde hallucination élargie (croissance % / levée de fonds) ──────────
def test_growth_and_funding_figures_are_flagged():
    assert _GROWTH_PCT_RE.search("croissance de 30% sur le cloud")
    assert _FUNDING_RE.search("levée de 50M€ en série B")
    # Un % random ou une confiance /100 ne sont PAS attrapés (contextuel).
    assert not _GROWTH_PCT_RE.search("confiance 95/100")
    assert not _GROWTH_PCT_RE.search("taux de 12% quelque part")


# ── #4 : un plan ne peut pas cibler un contact inexistant ────────────────────
def _plan_with_action_contact(name: str) -> dict:
    return {"actionPlan": {"phases": [{"actions": [{"action": "call", "contact": name}]}]}}


def test_action_to_unknown_contact_is_flagged():
    contacts = [{"fullName": "Sophie Martin"}]
    res = judge_quality(research={}, contacts=contacts, plan=_plan_with_action_contact("Jean Fantôme"))
    assert "Jean Fantôme" in res["hallucinatedContacts"]
    assert any(i["type"] == "contact_inexistant" for i in res["issues"])


def test_known_contact_and_placeholder_are_not_flagged():
    contacts = [{"fullName": "Sophie Martin"}]
    assert judge_quality(research={}, contacts=contacts, plan=_plan_with_action_contact("Sophie Martin"))[
        "hallucinatedContacts"
    ] == []
    assert judge_quality(research={}, contacts=contacts, plan=_plan_with_action_contact("à identifier"))[
        "hallucinatedContacts"
    ] == []


def test_no_contacts_no_false_flag():
    # Sans contacts pour comparer, on ne flag rien (pas de faux positif).
    assert judge_quality(research={}, contacts=[], plan=_plan_with_action_contact("Qui Que Ce Soit"))[
        "hallucinatedContacts"
    ] == []


# ── #22 : véhicules d'investissement = bruit (pas de play) ────────────────────
def test_investment_vehicles_are_noise():
    for name in ("Groupe SOPARFI Lux", "VINCI Asset Management", "SG SICAV Monétaire"):
        assert classify_entity_relevance(name)[0] == "noise"
    assert classify_entity_relevance("VINCI Energies")[0] == "operating"  # pas de faux positif


# ── #18 : tri par pertinence avant le cap (signaux par date, pains par urgence) ─
def test_sort_for_cap_keeps_freshest_signal_and_urgent_pain():
    signals = [{"date": "2024-01"}, {"date": "2026-06"}, {"date": "2025-03"}]
    assert _sort_for_cap("recentSignals", signals)[0]["date"] == "2026-06"
    pains = [{"pain": "a", "urgency": "basse"}, {"pain": "b", "urgency": "critique"}]
    assert _sort_for_cap("pains", pains)[0]["urgency"] == "critique"


def test_trim_caps_keep_the_freshest_signals():
    account = {"recentSignals": [{"date": f"20{10 + i}-01", "s": i} for i in range(9)]}  # 9 > cap 6
    kept = _trim_account_data(account)["recentSignals"]
    assert len(kept) == 6
    assert kept[0]["date"] == "2018-01"  # newest first, oldest dropped


# ── #12 : dedup + tri par similarité dans le contexte RAG ─────────────────────
def test_format_knowledge_context_dedups_and_sorts_by_similarity():
    docs = [
        {"title": "A", "content": "faible signal", "similarity": 0.2},
        {"title": "B", "content": "fort signal utile", "similarity": 0.9},
        {"title": "A", "content": "faible signal", "similarity": 0.2},  # doublon
    ]
    ctx = format_knowledge_context(docs)
    assert ctx.index("fort signal") < ctx.index("faible signal")  # plus fort d'abord
    assert ctx.count("faible signal") == 1  # dédupliqué
