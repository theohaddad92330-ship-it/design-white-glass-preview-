"""#3274.3 — la gouvernance du corpus méthode (`enabled`), branchée sur le
retrieval runtime (`method_knowledge.retrieve_method_chunks`), pas seulement
déclarée côté schéma TypeScript.

Deux niveaux, comme pour `test_ingestion_guard.py` :
  1. la parité JSON ↔ Python (le miroir ne diverge pas de METHOD_CORPUS_V1) ;
  2. la preuve de branchement : désactiver une règle la fait DISPARAÎTRE du
     retrieval, pas seulement d'un champ jamais lu.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.knowledge import method_corpus_governance
from app.knowledge.method_rules import METHOD_RULES
from app.services import method_knowledge

# ── 1) La parité TypeScript ↔ JSON ↔ Python ───────────────────────────────────
#
# Les deux copies existent parce que la racine Railway du service IA est
# `apps/ia` : `packages/` n'est pas dans son contexte de build, donc rien ne
# peut être importé (même contrainte que `RAG_DECAY_HORIZON_DAYS` et que
# `test_ingestion_guard.py`). Ce qui n'était pas inévitable, c'est qu'elles
# divergent.

SHARED = (
    Path(__file__).resolve().parents[3]
    / "packages"
    / "contracts"
    / "src"
    / "schemas"
    / "method-corpus.runtime-governance.json"
)


def _shared() -> list[dict]:
    assert SHARED.exists(), f"photo de gouvernance introuvable : {SHARED}"
    return json.loads(SHARED.read_text(encoding="utf-8"))


def test_le_miroir_python_ne_diverge_pas_du_json_partage():
    shared_by_id = {entry["rule_id"]: entry for entry in _shared()}

    # La preuve que ce test LIT vraiment quelque chose : un JSON vidé ou
    # tronqué ferait disparaître les identifiants qu'on cherche ci-dessous,
    # donc `KeyError` plutôt qu'un succès vide.
    for rule_id in method_corpus_governance._ENABLED_BY_RULE_ID:
        assert rule_id in shared_by_id, f"« {rule_id} » absent du corpus TypeScript partagé"
        entry = shared_by_id[rule_id]
        assert entry["feature_flag_key"] is None, (
            f"« {rule_id} » porte un feature_flag_key côté TypeScript — "
            "ce module ne gère pas encore les flags (voir sa docstring), la copie "
            "Python mentirait par omission"
        )
        assert not entry["superseded"], f"« {rule_id} » est SUPERSEDED côté TypeScript"
        assert method_corpus_governance._ENABLED_BY_RULE_ID[rule_id] == entry["enabled"], (
            f"« {rule_id} » diverge : Python dit {method_corpus_governance._ENABLED_BY_RULE_ID[rule_id]}, "
            f"TypeScript dit {entry['enabled']}"
        )


def test_les_18_regles_de_discipline_sont_toutes_couvertes():
    # Les 18 identifiants de `method_rules.py` doivent tous avoir une entrée —
    # une règle absente de la gouvernance serait active par défaut (voir
    # `is_rule_active`), silencieusement, sans que rien ne le signale.
    python_ids = {rule.id for rule in METHOD_RULES}
    from app.knowledge.method_rules import METHOD_REFUSALS

    python_ids |= {rule.id for rule in METHOD_REFUSALS}
    # #3262.22/.29 — plus les deux règles de compte de BEL-SC-233.
    from app.knowledge.method_account_rules import METHOD_ACCOUNT_RULES

    python_ids |= {rule.id for rule in METHOD_ACCOUNT_RULES}
    assert python_ids == set(method_corpus_governance._ENABLED_BY_RULE_ID)


# ── 2) La preuve de branchement — désactiver EXCLUT réellement du retrieval ───


@pytest.fixture
def _cleared_corpus_cache():
    """`method_knowledge._corpus()` est mis en cache par process
    (`lru_cache(maxsize=1)`) — sans vider ce cache avant ET après le test, une
    désactivation appliquée ici polluerait tous les tests qui s'exécutent
    ensuite dans le même process pytest."""
    method_knowledge._corpus.cache_clear()
    yield
    method_knowledge._corpus.cache_clear()


def test_desactiver_une_regle_la_retire_du_retrieval(_cleared_corpus_cache, monkeypatch):
    # « Les quotas historiques sont des exemples, jamais des valeurs de
    # produit. » — une des dix règles gardées, retrouvable aujourd'hui.
    rule_id = "quotas_historiques_sont_des_exemples"
    query = "quels quotas historiques dois-je viser ce trimestre ?"

    before = method_knowledge.retrieve_method_chunks(query)
    assert any("quotas historiques" in c["title"].lower() for c in before), before

    monkeypatch.setitem(method_corpus_governance._ENABLED_BY_RULE_ID, rule_id, False)
    method_knowledge._corpus.cache_clear()

    after = method_knowledge.retrieve_method_chunks(query)
    assert not any("quotas historiques" in c["title"].lower() for c in after), after


def test_une_regle_absente_de_la_gouvernance_reste_active_par_defaut():
    # Byte-identique à avant ce module : l'ABSENCE n'est jamais une exclusion.
    assert method_corpus_governance.is_rule_active("un_identifiant_jamais_gouverne") is True


# ── 3) #3285.6 — exceptions / stop_condition / user_override_allowed LUS ─────


def test_les_champs_de_garde_python_ne_divergent_pas_du_json_partage():
    shared_by_id = {entry["rule_id"]: entry for entry in _shared()}
    for rule_id in method_corpus_governance.wired_rule_ids():
        guard = method_corpus_governance.rule_guard(rule_id)
        entry = shared_by_id[rule_id]
        assert list(guard.exceptions) == entry["exceptions"], rule_id
        assert guard.stop_condition == entry["stop_condition"], rule_id
        assert guard.user_override_allowed == entry["user_override_allowed"], rule_id


def test_une_exception_et_une_condition_darret_sortent_dans_le_chunk_cite(_cleared_corpus_cache, monkeypatch):
    rule = METHOD_RULES[0]
    guard = method_corpus_governance.RuleGuard(
        exceptions=("Compte en gel budgétaire déclaré",),
        stop_condition="Le commercial a clos la route.",
        user_override_allowed=True,
    )
    monkeypatch.setattr(
        method_corpus_governance, "_GUARD_BY_RULE_ID", {rule.id: guard}
    )
    method_knowledge._corpus.cache_clear()
    body = next(str(c) for c in method_knowledge._corpus() if rule.statement in str(c))
    assert "Compte en gel budgétaire déclaré" in body
    assert "Le commercial a clos la route." in body
    assert "correction" in body.lower()


def test_sans_exception_le_chunk_reste_identique(_cleared_corpus_cache):
    rule = METHOD_RULES[0]
    chunks = method_knowledge._corpus()
    body = next(str(c) for c in chunks if rule.statement in str(c))
    assert "Exceptions" not in body and "S'arrête si" not in body
