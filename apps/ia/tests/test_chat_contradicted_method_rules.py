"""#3289 (suivi #3264.41) — une règle méthode que l'ESPACE a contredite par ses
résultats n'est plus citée à Laura pour cet espace.

Question exacte à poser en recette dans /chat (sur un espace où plusieurs actions
posées sous la règle « couverture multi-rôles » sont closes sans réponse) :
« combien de contacts je dois viser sur ce compte ? ». Attendu : la règle
« Une couverture de compte traverse plusieurs rôles… » n'apparaît plus dans les
sources citées ; sur un autre espace, elle apparaît toujours.
"""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.knowledge.method_rules import METHOD_RULES
from app.services import bellum_api, method_knowledge

QUESTION = "Une couverture de compte traverse plusieurs rôles, plusieurs niveaux et plusieurs entités ?"
RULE = next(rule for rule in METHOD_RULES if rule.id == "couverture_multi_roles_niveaux_entites")


@pytest.fixture(autouse=True)
def _fresh_corpus():
    method_knowledge._corpus.cache_clear()
    yield
    method_knowledge._corpus.cache_clear()


def test_sans_exclusion_la_regle_est_citee_et_ses_identifiants_sont_rendus():
    chunks, rule_ids = method_knowledge.retrieve_method_chunks_with_rules(QUESTION)
    assert any(RULE.statement in c["content"] for c in chunks)
    assert RULE.id in rule_ids


def test_une_regle_contredite_disparait_des_citations():
    chunks, _ = method_knowledge.retrieve_method_chunks_with_rules(QUESTION, excluded_rule_ids=frozenset({RULE.id}))
    assert not any(RULE.statement in c["content"] for c in chunks)


def test_la_fonction_historique_reste_byte_identique():
    plain = method_knowledge.retrieve_method_chunks(QUESTION)
    with_rules, _ = method_knowledge.retrieve_method_chunks_with_rules(QUESTION)
    assert plain == with_rules


def test_le_pont_est_appele_avec_lutilisateur_et_rend_un_ensemble(monkeypatch):
    async def fake_post(path, payload, **_kw):
        assert path == "/internal/copilot/method/contradicted-rules"
        assert payload == {"userId": "u-1"}
        return {"ruleIds": ["a", "b"]}

    monkeypatch.setattr(bellum_api, "_post", fake_post)
    assert asyncio.run(bellum_api.contradicted_method_rules("u-1")) == frozenset({"a", "b"})


def test_pont_eteint_ou_erreur_ne_contredit_rien(monkeypatch):
    async def none_post(*_a, **_k):
        return None

    async def err_post(*_a, **_k):
        return {"error": "method_rule_outcomes_unreadable"}

    monkeypatch.setattr(bellum_api, "_post", none_post)
    assert asyncio.run(bellum_api.contradicted_method_rules("u-1")) == frozenset()
    monkeypatch.setattr(bellum_api, "_post", err_post)
    assert asyncio.run(bellum_api.contradicted_method_rules("u-1")) == frozenset()


# ── Le tour REJOUÉ dans /chat : entrée → pont interrogé → sources citées ───────


def _terminal(text: str) -> dict:
    events = [
        json.loads(block.strip()[len("data:") :].strip())
        for block in text.strip().split("\n\n")
        if block.strip().startswith("data:")
    ]
    return events[-1]


def _method_labels(client: TestClient, contradicted: frozenset[str]) -> list[str]:
    async def _run(*_a, **_k):
        return ("Réponse.", [])

    async def _contradicted(user_id):
        assert user_id == "u-1"
        return contradicted

    with (
        patch("app.services.chat_orchestrator.run_chat_with_tools", new=_run),
        patch("app.services.rag_service.retrieve_knowledge_docs", new_callable=AsyncMock, return_value=[]),
        patch.object(bellum_api, "contradicted_method_rules", new=_contradicted),
    ):
        res = client.post("/chat/message", json={"message": QUESTION, "user_id": "u-1"})
    context = _terminal(res.text)["data"]["context"]
    return [s["label"] for s in context["sources"] if s["kind"] == "method_rule"]


def test_le_tour_cite_la_regle_quand_lespace_ne_la_contredit_pas(client: TestClient):
    labels = _method_labels(client, frozenset())
    assert any("couverture" in label.lower() for label in labels), labels


def test_le_tour_ne_cite_plus_la_regle_quand_lespace_la_contredit(client: TestClient):
    labels = _method_labels(client, frozenset({RULE.id}))
    assert not any("couverture" in label.lower() for label in labels), labels
