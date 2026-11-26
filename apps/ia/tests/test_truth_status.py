"""The 5 statuts de vérité (V1-vendable cadrage §4) — canonical vocabulary +
deterministic output-category → status mapping."""

from __future__ import annotations

from app.services.truth_status import (
    FRONT_LABEL,
    TRUTH_STATUSES,
    category_status_map,
    front_label,
    legend,
    normalise_status,
    status_for_category,
)


def test_seven_statuses_each_with_a_label():
    # 5 cadrage §4 + `inconnu` (01_METHOD_CORE §6) + `registre` (Théo #1).
    assert TRUTH_STATUSES == ("fait", "registre", "signal", "hypothese", "recommandation", "risque", "inconnu")
    for s in TRUTH_STATUSES:
        assert FRONT_LABEL[s]  # non-empty label


def test_labels_match_the_cadrage():
    assert front_label("fait") == "Fait — source visible"
    assert front_label("registre") == "Donnée registre — officielle (Pappers/INSEE)"
    assert front_label("signal") == "Signal détecté — à interpréter"
    assert front_label("hypothese") == "Hypothèse Bellum — à valider"
    assert front_label("recommandation") == "Recommandation Bellum"
    assert front_label("risque") == "Risque à vérifier"


def test_registry_data_is_separated_from_web_facts():
    # Théo #1 : la donnée registre (Pappers/INSEE/INPI/BODACC) est distincte du
    # fait web/Apollo — corporate graph, établissements, bénéficiaires, annonces.
    for registry in ("entities", "sites", "beneficial_owners", "legal_signals"):
        assert status_for_category(registry) == "registre"
    # Web/Apollo facts stay `fait`.
    for fact in ("identity", "detected_tech_stack", "contact_identity"):
        assert status_for_category(fact) == "fait"


def test_category_mapping_by_epistemic_class():
    assert status_for_category("entities") == "registre"
    assert status_for_category("recent_signals") == "signal"
    assert status_for_category("qualified_hypotheses") == "hypothese"
    assert status_for_category("organigramme") == "hypothese"  # inferred, never official
    assert status_for_category("action_plan") == "recommandation"
    assert status_for_category("score_verdict") == "recommandation"
    assert status_for_category("risks") == "risque"
    assert status_for_category("competitors") == "risque"  # incumbent = risk
    assert status_for_category("unknown_block") is None


def test_never_a_hypothesis_as_a_fact():
    # The whole point: inferred blocks must not be tagged fait.
    for inferred in ("qualified_hypotheses", "organigramme", "decision_role", "entity_zones"):
        assert status_for_category(inferred) == "hypothese"


def test_normalise_legacy_tags():
    assert normalise_status("PUBLIC") == "fait"
    assert normalise_status("HYPOTHÈSE") == "hypothese"
    assert normalise_status("HYPOTHESE") == "hypothese"
    assert normalise_status("signal") == "signal"
    assert normalise_status("nope") is None
    assert normalise_status(None) is None


def test_legend_and_map_shapes():
    lg = legend()
    assert [x["status"] for x in lg] == list(TRUTH_STATUSES)
    m = category_status_map()
    assert m["entities"] == {"status": "registre", "label": "Donnée registre — officielle (Pappers/INSEE)"}
    assert m["identity"] == {"status": "fait", "label": "Fait — source visible"}
    assert m["risks"]["status"] == "risque"
