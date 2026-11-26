"""#3278.3 (#3259.3) — « preuves » et « historique des canaux » : deux entrées de la route
lues sur ce que l'espace a déjà ACCUMULÉ (pont d'accès, `accumulated_route_criteria`), pas
saisies. Évaluables avec le texte reçu, jamais un zéro ; absents = nommés « non évalué »."""

from __future__ import annotations

from app.services.compilers.account_preflight import compile_account_preflight
from app.services.opening_movement import ACCUMULATED_STRATEGY_CRITERIA, strategy_selection_criteria


def test_accumulated_criteria_are_exactly_proofs_and_channel_history():
    assert ACCUMULATED_STRATEGY_CRITERIA == ("proofs", "channel_history")


def test_an_accumulated_fact_is_evaluable_with_its_text_an_equal_weight_and_its_source():
    criteria = strategy_selection_criteria(
        "etablie",
        "pme_eti",
        "froid",
        accumulated_criteria={"proofs": "2 références client publiables dans le secteur Banque"},
    )
    by_key = {c["key"]: c for c in criteria}
    assert by_key["proofs"] == {
        "key": "proofs",
        "label": "preuves mobilisables",
        "evaluable": True,
        "value": "2 références client publiables dans le secteur Banque",
        "weight": 1 / 4,
        "source": "accumulated",
    }
    assert by_key["esn_stage"]["weight"] == 1 / 4
    assert by_key["channel_history"] == {
        "key": "channel_history",
        "label": "historique des canaux",
        "evaluable": False,
        "reason": "no_source",
    }


def test_says_no_blank_unknown_or_non_text_accumulations_change_nothing():
    base = strategy_selection_criteria("etablie", "pme_eti", "froid")
    for noise in (None, {}, {"proofs": "  "}, {"proofs": None}, {"proofs": 3}, {"inconnu": "x"}, {"scope": "a"}):
        assert strategy_selection_criteria("etablie", "pme_eti", "froid", accumulated_criteria=noise) == base


def test_a_declared_key_cannot_ride_the_accumulated_channel():
    # `scope` est déclaratif : il ne s'évalue que par la saisie du commercial, jamais par ce canal.
    out = strategy_selection_criteria("etablie", "pme_eti", "froid", accumulated_criteria={"scope": "inventé"})
    assert {c["key"]: c for c in out}["scope"]["evaluable"] is False


def _account():
    return {
        "id": "a-1",
        "company_name": "Acme",
        "raw_analysis": {
            "salesContext": {
                "esnProfile": {"stage": "etablie"},
                "account": {"archetype": "pme_eti"},
                "relationship": {"state": "froid"},
            }
        },
    }


def test_laura_cites_the_accumulated_criteria_and_still_names_the_empty_ones():
    section = compile_account_preflight(
        _account(),
        contacts=None,
        contacts_available=False,
        account_access={
            "accumulated_route_criteria": {"channel_history": "email ×2 (messages préparés sur ce compte)"}
        },
    )["known_sections"]["commercial_route"]
    assert section["accumulated_criteria"] == [
        {"label": "historique des canaux", "value": "email ×2 (messages préparés sur ce compte)"}
    ]
    not_evaluable = {c["label"] for c in section["not_evaluable_criteria"]}
    assert "historique des canaux" not in not_evaluable
    assert "preuves mobilisables" in not_evaluable
    assert "declared_criteria" not in section


def test_without_accumulation_no_accumulated_criteria_key():
    section = compile_account_preflight(_account(), contacts=None, contacts_available=False)["known_sections"][
        "commercial_route"
    ]
    assert "accumulated_criteria" not in section


# #3278.a (recette R39, EDF) — la route était nommée SANS preuve de canal : ni citée, ni dite absente.
def _route_section(account_access):
    return compile_account_preflight(
        _account(), contacts=None, contacts_available=False, account_access=account_access
    )["known_sections"]["commercial_route"]


def test_3278a_laura_says_in_one_sentence_when_the_account_has_no_channel_history():
    section = _route_section({"accumulated_route_criteria": {}})
    assert {a["label"]: a["sentence"] for a in section["accumulated_absent"]} == {
        "historique des canaux": "aucun historique de canal sur ce compte",
        "preuves mobilisables": "aucune référence client publiable dans le secteur de ce compte",
    }


def test_3278a_the_absence_is_named_only_for_the_missing_fact():
    section = _route_section({"accumulated_route_criteria": {"channel_history": "email ×2 (messages préparés)"}})
    assert [a["label"] for a in section["accumulated_absent"]] == ["preuves mobilisables"]


def test_3278a_never_invented_when_the_bridge_did_not_report_at_all():
    assert "accumulated_absent" not in _route_section(None)
    assert "accumulated_absent" not in _route_section({})


def test_3278a_the_prompt_tells_laura_to_say_the_absence_and_cite_the_history():
    from app.services.compilers.account_preflight import ACCOUNT_PREFLIGHT_TOOL  # noqa: PLC0415

    assert "accumulated_absent" in ACCOUNT_PREFLIGHT_TOOL["description"]


def test_3278a_the_plan_prompt_carries_the_accumulated_criteria():
    from app.services.opening_movement import movement_prompt_block  # noqa: PLC0415

    ctx = {"esnProfile": {"stage": "etablie"}, "account": {"archetype": "pme_eti"}, "relationship": {"state": "froid"}}
    with_history = movement_prompt_block(ctx, None, {"channel_history": "email ×2 (messages préparés sur ce compte)"})
    assert "email ×2 (messages préparés sur ce compte)" in with_history
    without = movement_prompt_block(ctx, None, {})
    assert "aucun historique de canal sur ce compte" in without
    # Pont absent (None) : rien de dit, rien d'inventé — prompt inchangé.
    assert "aucun historique de canal" not in movement_prompt_block(ctx, None)


def test_3278a_plan_request_accepts_accumulated_route_criteria():
    from app.models.plan import PlanRequest  # noqa: PLC0415

    assert "accumulated_route_criteria" in PlanRequest.model_fields


def test_3278a_the_criteria_travel_graph_request_to_state_to_plan():
    from app.graph.state import AnalysisState  # noqa: PLC0415
    from app.routers.graph_analyze import GraphAnalyzeRequest  # noqa: PLC0415

    assert "accumulated_route_criteria" in GraphAnalyzeRequest.model_fields
    assert "accumulated_route_criteria" in AnalysisState.__annotations__
