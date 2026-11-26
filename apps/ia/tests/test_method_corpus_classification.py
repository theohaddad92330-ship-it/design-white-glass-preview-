"""#3274.1 — le CLASSEMENT règle par règle des sources méthode.

Le fichier de données `method_corpus_classification.json` classe chaque unité
des sources (règles métier, objections, playbooks sectoriels, concurrents,
discipline, packs) en KEEP / MERGE / SUPERSEDED / REMOVE_AFTER_MIGRATION.
Deux gardes : une unité non classée fait rougir la CI ; une unité SUPERSEDED ou
REMOVE_AFTER_MIGRATION ne se sert plus au retrieval.
"""

from __future__ import annotations

import pytest

from app.knowledge import method_corpus_governance as gov
from app.services import method_knowledge

ALLOWED = {"KEEP", "MERGE", "SUPERSEDED", "REMOVE_AFTER_MIGRATION"}


@pytest.fixture
def _fresh_corpus():
    method_knowledge._corpus.cache_clear()
    yield
    method_knowledge._corpus.cache_clear()


def test_chaque_unite_des_sources_est_classee_et_inversement():
    units = set(gov.all_unit_ids())
    assert len(units) >= 90, "le test ne lit rien"
    classified = set(gov.classification_table())
    assert units - classified == set(), f"unités non classées : {sorted(units - classified)[:5]}"
    assert classified - units == set(), f"classement orphelin : {sorted(classified - units)[:5]}"


def test_chaque_entree_a_une_classe_valide_et_une_raison():
    for unit_id, entry in gov.classification_table().items():
        assert entry["classification"] in ALLOWED, unit_id
        assert str(entry["reason"]).strip(), f"{unit_id} sans raison"
        if entry["classification"] == "MERGE":
            assert entry.get("merge_into") in gov.classification_table(), unit_id


def test_une_unite_superseded_ou_remove_n_est_jamais_servie(_fresh_corpus):
    served = {c["_unit_id"] for c in method_knowledge._corpus() if c["_unit_id"]}
    for unit_id, entry in gov.classification_table().items():
        if entry["classification"] in ("SUPERSEDED", "REMOVE_AFTER_MIGRATION"):
            assert unit_id not in served, unit_id
    assert len(served) >= 60, "le corpus servi ne porte pas d'identifiant d'unité"


@pytest.mark.parametrize("klass", ["SUPERSEDED", "REMOVE_AFTER_MIGRATION"])
def test_le_garde_sait_dire_non(_fresh_corpus, monkeypatch, klass):
    unit_id = "sector:banque"
    table = {k: dict(v) for k, v in gov.classification_table().items()}
    table[unit_id]["classification"] = klass
    monkeypatch.setattr(gov, "classification_table", lambda: table)
    served = {c["_unit_id"] for c in method_knowledge._corpus()}
    assert unit_id not in served
    assert "business_rule:account_fit_score_25" in served


def test_une_unite_non_classee_reste_servie_par_defaut():
    assert gov.is_unit_served("unite:jamais_vue") is True
