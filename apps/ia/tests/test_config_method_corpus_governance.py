"""GET /config/method-corpus-governance — #3274.5 (épopée #3274) : les
identifiants de règle que `method_corpus_governance.is_rule_active` consulte
RÉELLEMENT au retrieval, pour la console d'opérations IA. Introspection seule.

Ce que cette route NE prétend PAS : les 162 règles SalesConnect — aucune n'a de
chunk Python qui la consulte (#3274.3).
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.knowledge.method_corpus_governance import wired_rule_ids


def test_rend_exactement_les_identifiants_consultes_par_is_rule_active(client: TestClient) -> None:
    res = client.get("/config/method-corpus-governance")
    assert res.status_code == 200
    body = res.json()
    assert set(body["wiredRuleIds"]) == set(wired_rule_ids())
    assert len(body["wiredRuleIds"]) == 20


def test_porte_les_deux_regles_de_compte_bel_sc_233_mais_aucune_regle_salesconnect(client: TestClient) -> None:
    # #3262.22/.29 — la cadence et le logo prestigieux ont désormais un chunk Python.
    wired = set(client.get("/config/method-corpus-governance").json()["wiredRuleIds"])
    assert "cadence_de_revue_configurable" in wired
    assert "logo_prestigieux_ne_justifie_jamais_la_priorite" in wired
    assert not any(rule_id.startswith("sc_") for rule_id in wired)
