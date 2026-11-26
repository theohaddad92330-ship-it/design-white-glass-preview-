"""#2440.82 — un changement de fournisseur/modèle déclenche les évaluations.

La route résolue d'une tâche qui n'est NI la référence (Anthropic, sur laquelle
les prompts et le banc sont calibrés) NI une destination dont l'opérateur a
déclaré les évaluations rejouées (`LLM_ROUTING_EVALS_PASSED`) est « à évaluer »
— nommée, avec la commande de rejeu. Jamais « ok » par défaut.
"""

from __future__ import annotations

import pytest

from app.services import llm_gateway, provider_evals


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LLM_ROUTING_EVALS_PASSED", raising=False)
    monkeypatch.delenv("LLM_GATEWAY_ROUTING", raising=False)
    for task in llm_gateway.CANONICAL_TASKS:
        monkeypatch.delenv(f"LLM_ROUTE_{task.upper()}", raising=False)


def _by_task(rows: tuple[provider_evals.EvalStatus, ...]) -> dict[str, provider_evals.EvalStatus]:
    return {r.task: r for r in rows}


async def test_sans_reglage_tout_est_reference() -> None:
    rows = await provider_evals.eval_status_by_task()
    assert rows and all(r.status == "reference" for r in rows)
    assert all(r.replay_command is None for r in rows)


async def test_un_fournisseur_non_evalue_est_a_evaluer_avec_la_commande(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_ROUTE_STRATEGY", "openai:gpt-4o")
    row = _by_task(await provider_evals.eval_status_by_task())["strategy"]
    assert row.status == "to_evaluate"
    assert row.replay_command and "app.eval.run" in row.replay_command
    # les autres tâches ne bougent pas
    assert _by_task(await provider_evals.eval_status_by_task())["signals"].status == "reference"


async def test_declarer_les_evals_rejouees_les_fait_passer_a_evaluated(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_ROUTE_STRATEGY", "openai:gpt-4o")
    monkeypatch.setenv("LLM_ROUTING_EVALS_PASSED", "openai:gpt-4o")
    assert _by_task(await provider_evals.eval_status_by_task())["strategy"].status == "evaluated"


async def test_un_autre_modele_du_meme_fournisseur_redevient_a_evaluer(monkeypatch: pytest.MonkeyPatch) -> None:
    """Le garde sait dire NON : évaluer gpt-4o ne vaut pas pour gpt-4o-mini."""
    monkeypatch.setenv("LLM_ROUTE_STRATEGY", "openai:gpt-4o-mini")
    monkeypatch.setenv("LLM_ROUTING_EVALS_PASSED", "openai:gpt-4o")
    assert _by_task(await provider_evals.eval_status_by_task())["strategy"].status == "to_evaluate"


async def test_un_fournisseur_sans_modele_pose_demande_le_fournisseur_entier(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_ROUTE_SIGNALS", "openai")
    assert _by_task(await provider_evals.eval_status_by_task())["signals"].status == "to_evaluate"
    monkeypatch.setenv("LLM_ROUTING_EVALS_PASSED", "openai")
    assert _by_task(await provider_evals.eval_status_by_task())["signals"].status == "evaluated"


async def test_la_liste_declaree_tolere_espaces_et_casse(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_ROUTE_PLAN", "openai:gpt-4o")
    monkeypatch.setenv("LLM_ROUTING_EVALS_PASSED", " OpenAI:GPT-4o , anthropic:x ")
    assert _by_task(await provider_evals.eval_status_by_task())["plan"].status == "evaluated"


async def test_routes_a_evaluer_nomme_chaque_tache(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_ROUTE_STRATEGY", "openai:gpt-4o")
    monkeypatch.setenv("LLM_ROUTE_PLAN", "openai:gpt-4o")
    assert {r.task for r in await provider_evals.pending()} == {"strategy", "plan"}


async def test_la_console_rend_le_statut_par_tache(monkeypatch: pytest.MonkeyPatch) -> None:
    """Appelant réel : `GET /config/model-routing` porte `evalStatus`."""
    from app.routers import config_admin

    monkeypatch.setenv("LLM_ROUTE_STRATEGY", "openai:gpt-4o")
    body = await config_admin.model_routing()
    rows = {r["task"]: r for r in body["routes"]}
    assert rows["strategy"]["evalStatus"] == "to_evaluate"
    assert "app.eval.run" in rows["strategy"]["evalReplayCommand"]
    assert rows["signals"]["evalStatus"] == "reference"
    assert rows["signals"]["evalReplayCommand"] is None


# #2975 / #2440.82 — déclarer via la TABLE (console d'opérations, sans
# redéploiement) a le même effet que la variable d'env : les deux chemins
# répondent à la même question, fusionnés.
async def test_declarer_via_la_table_vaut_la_meme_chose_que_l_env(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import provider_eval_declarations

    class _Res:
        def __init__(self, data):
            self.data = data

    class _Query:
        def __init__(self, rows):
            self._rows = rows

        def select(self, _columns="*"):
            return self

        async def aexecute(self):
            return _Res(self._rows)

    class _Client:
        def table(self, _name):
            return _Query([{"destination_key": "openai:gpt-4o"}])

    monkeypatch.setenv("LLM_ROUTE_STRATEGY", "openai:gpt-4o")
    row = _by_task(await provider_evals.eval_status_by_task(sb=_Client()))["strategy"]
    assert row.status == "evaluated"
    assert (await provider_eval_declarations.declared_keys(sb=_Client())) == frozenset({"openai:gpt-4o"})


async def test_la_console_peut_declarer_une_destination_evaluee(monkeypatch: pytest.MonkeyPatch) -> None:
    """Appelant réel : `POST /config/model-routing/evals`."""
    from app.routers import config_admin
    from app.services import provider_eval_declarations

    class _Res:
        def __init__(self, data):
            self.data = data

    class _Query:
        def __init__(self, store, key=None):
            self._store = store
            self._key = key

        def select(self, _columns="*"):
            return self

        def insert(self, payload):
            self._insert_payload = payload
            return self

        def update(self, payload):
            self._update_payload = payload
            return self

        def eq(self, _column, value):
            self._key = value
            return self

        async def aexecute(self):
            if hasattr(self, "_insert_payload"):
                self._store[self._key or self._insert_payload["destination_key"]] = self._insert_payload
                return _Res([self._insert_payload])
            if hasattr(self, "_update_payload"):
                self._store[self._key] = self._update_payload
                return _Res([self._update_payload])
            rows = [r for r in self._store.values() if self._key is None or r["destination_key"] == self._key]
            return _Res(rows)

    class _Client:
        def __init__(self):
            self.store: dict = {}

        def table(self, _name):
            return _Query(self.store)

    client = _Client()
    monkeypatch.setattr(provider_eval_declarations, "get_supabase", lambda: client)
    body = config_admin._DeclareModelRoutingEvalBody(
        destinationKey="openai:gpt-4o", declaredBy="matteo@bellum-it.com", note="rejoué 08/10"
    )
    result = await config_admin.declare_model_routing_eval(body)
    assert result == {"ok": True}
    assert client.store["openai:gpt-4o"]["declared_by"] == "matteo@bellum-it.com"


async def test_la_console_refuse_une_declaration_sans_auteur() -> None:
    from fastapi import HTTPException

    from app.routers import config_admin

    body = config_admin._DeclareModelRoutingEvalBody(destinationKey="openai:gpt-4o", declaredBy="  ")
    with pytest.raises(HTTPException) as exc_info:
        await config_admin.declare_model_routing_eval(body)
    assert exc_info.value.status_code == 400
