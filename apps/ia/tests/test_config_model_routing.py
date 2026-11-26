"""GET /config/model-routing — #2445.2 (épopée #2766) : la politique de
routage modèle EFFECTIVE, par capacité (tâche canonique), pour la console
d'opérations IA. Introspection seule, ne change rien."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.services import llm_gateway

_GATEWAY_ENV = ("LLM_GATEWAY_ROUTING", "OPENAI_API_KEY")
_ROUTE_ENV = tuple(f"LLM_ROUTE_{t.upper()}" for t in llm_gateway.CANONICAL_TASKS)


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for name in (*_GATEWAY_ENV, *_ROUTE_ENV):
        monkeypatch.delenv(name, raising=False)
    yield


def test_sans_reglage_chaque_tache_part_anthropic_non_surchargee(client: TestClient) -> None:
    res = client.get("/config/model-routing")
    assert res.status_code == 200
    routes = {r["task"]: r for r in res.json()["routes"]}
    assert set(routes) == set(llm_gateway.CANONICAL_TASKS)
    for task, route in routes.items():
        assert route["provider"] == "anthropic", task
        assert route["model"] is None, task
        assert route["overridden"] is False, task


def test_un_reglage_pose_se_voit_et_se_nomme_surcharge(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("LLM_ROUTE_STRATEGY", "openai:gpt-4o")
    routes = {r["task"]: r for r in client.get("/config/model-routing").json()["routes"]}
    assert routes["strategy"] == {
        "task": "strategy",
        "provider": "openai",
        "model": "gpt-4o",
        "overridden": True,
        "inheritsFrom": None,
        # #2975 (#2440.82, lot W04) — un fournisseur autre que la référence
        # reste « à évaluer » et nomme la commande qui rejoue l'éval.
        "evalStatus": "to_evaluate",
        "evalReplayCommand": "python -m app.eval.run --live <entreprise> --check-baseline",
    }
    # Une tâche non touchée reste honnêtement au défaut.
    assert routes["research"]["overridden"] is False


def test_org_herite_de_classify_tant_quaucun_reglage_propre(client: TestClient, monkeypatch) -> None:
    monkeypatch.setenv("LLM_ROUTE_CLASSIFY", "openai:gpt-5.6-luna")
    routes = {r["task"]: r for r in client.get("/config/model-routing").json()["routes"]}
    assert routes["org"]["provider"] == "openai"
    assert routes["org"]["model"] == "gpt-5.6-luna"
    assert routes["org"]["inheritsFrom"] == "classify"
    assert routes["org"]["overridden"] is True


def test_org_avec_son_propre_reglage_narrete_pas_dheriter_a_lecran(client: TestClient, monkeypatch) -> None:
    """Une fois `LLM_ROUTE_ORG` posé, `org` a SON réglage — plus celui de
    `classify` — et l'écran ne doit pas prétendre qu'elle hérite encore."""
    monkeypatch.setenv("LLM_ROUTE_CLASSIFY", "openai:gpt-5.6-luna")
    monkeypatch.setenv("LLM_ROUTE_ORG", "anthropic:claude-haiku-4-5")
    routes = {r["task"]: r for r in client.get("/config/model-routing").json()["routes"]}
    assert routes["org"] == {
        "task": "org",
        "provider": "anthropic",
        "model": "claude-haiku-4-5",
        "overridden": True,
        "inheritsFrom": None,
        # #2975 — le fournisseur de référence n'a rien à rejouer.
        "evalStatus": "reference",
        "evalReplayCommand": None,
    }
