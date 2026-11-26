"""``POST /chat/message`` — diffusé en SSE (LOT STREAM, 12/09/2026).

Le corps métier (préparation RAG, plafond dur, orchestrateur, persistance) est
prouvé ailleurs (`test_chat_turn_ceiling.py`, `test_chat_turn_budget.py`,
`test_chat_orchestrator.py`) et reste inchangé : `_run_chat_turn` en est
l'exacte continuation. Ce fichier prouve le CONTRAT DE FIL — la forme des
événements, et que le dernier est toujours `done` dans la même forme que
l'ancien corps JSON — pas le calcul métier.

`TestClient` (comme pour `test_graph_analyze.py`) draine le
`StreamingResponse` en entier avant de rendre `res` : ce n'est pas ce qui
prouve l'ORDRE d'arrivée (ça, c'est le rôle de
`test_chat_orchestrator.py::test_deltas_arrive_before_the_turn_completes…`,
qui observe `emit` EN DIRECT depuis l'intérieur du tour) — c'est ce qui
prouve que le FIL a la forme attendue.
"""

from __future__ import annotations

import json
import logging
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient


def _parse_sse(text: str) -> list[dict]:
    events: list[dict] = []
    for block in text.strip().split("\n\n"):
        block = block.strip()
        if block.startswith("data:"):
            events.append(json.loads(block[len("data:") :].strip()))
    return events


def test_chat_returns_reply(client: TestClient) -> None:
    # Les outils du copilote sont ON par défaut (politique zéro-flag) : le chemin
    # nominal de `/chat/message` est l'orchestrateur, pas `call_claude`.
    with patch(
        "app.services.chat_orchestrator.run_chat_with_tools",
        new_callable=AsyncMock,
        return_value=("Bonjour ! Voici mon conseil.", []),
    ):
        res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")
    events = _parse_sse(res.text)
    assert events, "le flux n'a rendu AUCUN événement"
    # Le DERNIER événement porte la réponse — dans la MÊME forme que l'ancien
    # corps JSON de cet endpoint : un client qui n'attend que `done` retrouve
    # le comportement d'avant ce lot au bit près.
    terminal = events[-1]
    assert terminal["type"] == "done"
    assert terminal["success"] is True
    assert terminal["data"]["reply"] == "Bonjour ! Voici mon conseil."


# #214.1 (réel, épopée #3229) — un marqueur de population large construit un
# SearchUniverse déterministe, câblé sur le message RÉEL du tour, ADDITIF
# comme `source_plan` (même contrat : absent sans marqueur détecté).
def test_chat_attaches_search_universe_on_a_broad_population_request(client: TestClient) -> None:
    with patch(
        "app.services.chat_orchestrator.run_chat_with_tools",
        new_callable=AsyncMock,
        return_value=("Voici les meilleurs vérifiés, le reste part en job.", []),
    ):
        res = client.post(
            "/chat/message", json={"message": "Donne-moi tous les décideurs de ce compte", "user_id": "u1"}
        )

    events = _parse_sse(res.text)
    search_universe = events[-1]["data"]["context"]["search_universe"]
    assert search_universe["population"] == "Donne-moi tous les décideurs de ce compte"
    assert search_universe["roles"] == ["Décideur budget", "Décideur technique"]


# #3229 (reste) — le rapport de couverture construit par l'OUTIL sur ses
# résultats réels voyage jusqu'au contexte de la réponse (ADDITIF : absent si
# aucun outil n'en a construit).
def test_chat_attaches_the_coverage_report_an_tool_built_from_real_results(client: TestClient) -> None:
    async def _fake_run(*_args, **kwargs):
        sink = kwargs.get("coverage_sink")
        assert sink is not None, "le routeur doit passer coverage_sink"
        sink.append({"detected": 3, "resolved": 2, "verified": None, "estimated_coverage": None})
        return ("Deux DSI connus de l'espace.", [{"tool": "search_workspace_contacts", "status": "done"}])

    with patch("app.services.chat_orchestrator.run_chat_with_tools", side_effect=_fake_run):
        res = client.post("/chat/message", json={"message": "Quels DSI connaît-on ?", "user_id": "u1"})

    context = _parse_sse(res.text)[-1]["data"]["context"]
    assert context["coverage_report"]["detected"] == 3
    assert context["coverage_report"]["verified"] is None


def test_chat_omits_the_coverage_report_when_no_tool_built_one(client: TestClient) -> None:
    with patch(
        "app.services.chat_orchestrator.run_chat_with_tools",
        new_callable=AsyncMock,
        return_value=("Bonjour ! Voici mon conseil.", []),
    ):
        res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})

    assert "coverage_report" not in _parse_sse(res.text)[-1]["data"]["context"]


def test_chat_omits_search_universe_without_a_broad_population_marker(client: TestClient) -> None:
    with patch(
        "app.services.chat_orchestrator.run_chat_with_tools",
        new_callable=AsyncMock,
        return_value=("Bonjour ! Voici mon conseil.", []),
    ):
        res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})

    events = _parse_sse(res.text)
    assert "search_universe" not in events[-1]["data"]["context"]


# #2257.1 — le contrat de demande structuré : construit UNE FOIS par tour et
# journalisé SANS le contenu (le routeur ne connaît ici ni compte actif ni
# clarification déjà demandée : les deux champs connus restent nommés `false`).
def test_chat_journalise_le_contrat_de_demande_structure(client: TestClient, caplog) -> None:
    with patch(
        "app.services.chat_orchestrator.run_chat_with_tools",
        new_callable=AsyncMock,
        return_value=("Bonjour ! Voici mon conseil.", []),
    ):
        with caplog.at_level(logging.INFO, logger="app.routers.chat"):
            client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})
    contract_logs = [r for r in caplog.records if "Contrat de demande structuré (#2257.1)" in r.message]
    assert contract_logs, "le contrat de demande structuré n'a pas été journalisé"
    assert "has_objet_depart" in contract_logs[0].message
    assert "False" in contract_logs[0].message or "false" in contract_logs[0].message.lower()


# #2257.7/.8/.12/.13/.14 — reste du 25/09 : le tour journalise maintenant le
# lieu, le secteur, l'horizon, l'urgence et le niveau de détail quand le
# message en porte un marqueur déclaré — sans second appel au modèle.
def test_chat_journalise_le_lieu_le_secteur_lhorizon_lurgence_et_le_detail(client: TestClient, caplog) -> None:
    message = "Trouve-moi pour demain des comptes dans l'aéronautique en Île-de-France, c'est urgent, réponds en bref"
    with patch(
        "app.services.chat_orchestrator.run_chat_with_tools",
        new_callable=AsyncMock,
        return_value=("Bonjour ! Voici mon conseil.", []),
    ):
        with caplog.at_level(logging.INFO, logger="app.routers.chat"):
            client.post("/chat/message", json={"message": message, "user_id": "u1"})
    contract_logs = [r for r in caplog.records if "Contrat de demande structuré (#2257.1)" in r.message]
    assert contract_logs, "le contrat de demande structuré n'a pas été journalisé"
    logged = contract_logs[0].message
    for key in ("has_perimetre_geographique", "has_secteur", "has_horizon", "has_urgence", "has_niveau_detail"):
        assert f"'{key}': True" in logged, f"{key} absent ou faux dans {logged}"


# #3192.8 — l'APPELANT réel du signal de densité (#2257.14) : avant ce lot,
# `detail_level_from_message` était calculé ci-dessus pour le seul journal,
# jamais transmis à `build_system_prompt` — recette en prod du 30/09 :
# « contrôle de densité de réponse non prouvé ». Ce test observe le VRAI
# routeur `/chat`, pas la fonction en isolation (déjà prouvée dans
# `test_reply_density_controller.py`).
def test_chat_transmet_le_niveau_de_detail_a_build_system_prompt(client: TestClient) -> None:
    from unittest.mock import MagicMock

    captured: dict = {}
    real_build_system_prompt = __import__(
        "app.prompts.bellum_advisor", fromlist=["build_system_prompt"]
    ).build_system_prompt

    def _spy(*args, **kwargs):
        captured.update(kwargs)
        return real_build_system_prompt(*args, **kwargs)

    with (
        patch("app.services.chat_orchestrator.run_chat_with_tools", new_callable=AsyncMock, return_value=("ok", [])),
        patch("app.routers.chat.build_system_prompt", new=MagicMock(side_effect=_spy)),
    ):
        client.post(
            "/chat/message",
            json={"message": "Explique-moi en détail le modèle d'achat de SG", "user_id": "u1"},
        )
    assert captured.get("niveau_detail") == "detaille"


def test_chat_transmet_le_classement_implicite_a_build_system_prompt(client: TestClient) -> None:
    """#3192.10 — recette prod du 30/09 : « SG prend des consultants ? » n'a
    AUCUN marqueur explicite (`niveau_detail` reste `None`) mais doit quand
    même atteindre `build_system_prompt` classée MICRO — l'appelant réel du
    vrai routeur `/chat`, pas seulement la fonction en isolation."""
    from unittest.mock import MagicMock

    captured: dict = {}
    real_build_system_prompt = __import__(
        "app.prompts.bellum_advisor", fromlist=["build_system_prompt"]
    ).build_system_prompt

    def _spy(*args, **kwargs):
        captured.update(kwargs)
        return real_build_system_prompt(*args, **kwargs)

    with (
        patch("app.services.chat_orchestrator.run_chat_with_tools", new_callable=AsyncMock, return_value=("ok", [])),
        patch("app.routers.chat.build_system_prompt", new=MagicMock(side_effect=_spy)),
    ):
        client.post(
            "/chat/message",
            json={"message": "SG prend des consultants ?", "user_id": "u1"},
        )
    assert captured.get("niveau_detail") is None
    assert captured.get("expected_density") == "micro"


def test_chat_crm_presence_exclue_n_atteint_jamais_build_system_prompt(client: TestClient) -> None:
    """#3708 — recette prod 09/10 (aef69661e9) : HubSpot/Salesforce/Odoo décochés
    puis « dans mon CRM, dernière activité sur SG » — Laura citait quand même
    « une activité CRM au 31 août 2026 », SANS aucun appel d'outil ce tour.
    Cause : `req.crm_presence` est résolu côté API avant la requête IA, hors du
    catalogue d'outils que `_apply_excluded_families` filtre déjà (lot F02,
    `get_account_preflight`) — ce texte-ci entrait quand même dans le prompt.
    Prouvé sur le vrai routeur `/chat`, pas seulement `build_system_prompt` en
    isolation."""
    from unittest.mock import MagicMock

    captured: dict = {}
    real_build_system_prompt = __import__(
        "app.prompts.bellum_advisor", fromlist=["build_system_prompt"]
    ).build_system_prompt

    def _spy(*args, **kwargs):
        captured.update(kwargs)
        return real_build_system_prompt(*args, **kwargs)

    with (
        patch("app.services.chat_orchestrator.run_chat_with_tools", new_callable=AsyncMock, return_value=("ok", [])),
        patch("app.routers.chat.build_system_prompt", new=MagicMock(side_effect=_spy)),
    ):
        client.post(
            "/chat/message",
            json={
                "message": "Dans mon CRM, dernière activité sur SG ?",
                "user_id": "u1",
                "crm_presence": "Dernière activité : 31 août 2026 — 3 affaires ouvertes.",
                "crm_connected": True,
                "excluded_families": ["crm"],
            },
        )
    assert captured.get("crm_presence") == ""


def test_chat_crm_presence_non_exclue_atteint_toujours_build_system_prompt(client: TestClient) -> None:
    """Témoin : sans exclusion, la présence CRM réelle atteint toujours le
    prompt — cette garde ne doit pas en faire disparaître plus que visé."""
    from unittest.mock import MagicMock

    captured: dict = {}
    real_build_system_prompt = __import__(
        "app.prompts.bellum_advisor", fromlist=["build_system_prompt"]
    ).build_system_prompt

    def _spy(*args, **kwargs):
        captured.update(kwargs)
        return real_build_system_prompt(*args, **kwargs)

    with (
        patch("app.services.chat_orchestrator.run_chat_with_tools", new_callable=AsyncMock, return_value=("ok", [])),
        patch("app.routers.chat.build_system_prompt", new=MagicMock(side_effect=_spy)),
    ):
        client.post(
            "/chat/message",
            json={
                "message": "Dans mon CRM, dernière activité sur SG ?",
                "user_id": "u1",
                "crm_presence": "Dernière activité : 31 août 2026 — 3 affaires ouvertes.",
                "crm_connected": True,
            },
        )
    assert captured.get("crm_presence") == "Dernière activité : 31 août 2026 — 3 affaires ouvertes."


# #3198 (épopée #3223) — le branchement live de la trace de raisonnement, sur
# sa tranche pré-tour prouvable (detected_intent, source_plan, entity_scope,
# method_rules_used) : voir `test_chat_reasoning_trace.py` pour le vocabulaire
# et ses gardes, ce test-ci prouve l'APPELANT réel sur le vrai routeur `/chat`.
def test_chat_journalise_la_trace_de_raisonnement_pre_tour(client: TestClient, caplog) -> None:
    with (
        patch(
            "app.services.chat_orchestrator.run_chat_with_tools",
            new_callable=AsyncMock,
            return_value=("Bonjour ! Voici mon conseil.", []),
        ),
        caplog.at_level(logging.INFO, logger="app.routers.chat"),
    ):
        client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})
    trace_logs = [r for r in caplog.records if "Trace de raisonnement — champs pré-tour (#3198" in r.message]
    assert trace_logs, "la trace de raisonnement pré-tour n'a pas été journalisée"
    logged = trace_logs[0].message
    assert "detected_intent" in logged
    assert "source_plan" in logged
    assert "entity_scope" in logged
    assert "method_rules_used" in logged
    # Sans périmètre persistant posé par ce fil : nommé comme absent, jamais
    # une case vide ou un « 0 » silencieux (doctrine GA-18/GA-19).
    assert "aucun périmètre persistant nommé" in logged


# #3198 (épopée #3223) — le branchement live, suite : la tranche POST-tour
# (`tools_called`, `verifier_status`), connue seulement après la boucle
# d'outils. Voir `test_chat_reasoning_trace.py` pour le vocabulaire et ses
# gardes ; ce test-ci prouve l'APPELANT réel sur le vrai routeur `/chat`.
def test_chat_journalise_la_trace_de_raisonnement_post_tour(client: TestClient, caplog) -> None:
    async def _fake_run(*_args, **kwargs):
        sink = kwargs.get("verifier_status_sink")
        if sink is not None:
            sink.append("pass")
        return (
            "Bonjour ! Voici mon conseil.",
            [
                {
                    "tool": "get_account_briefing",
                    "status": "done",
                    "profile_version": "esn:1/context:1",
                }
            ],
        )

    with (
        patch("app.services.chat_orchestrator.run_chat_with_tools", side_effect=_fake_run),
        caplog.at_level(logging.INFO, logger="app.routers.chat"),
    ):
        client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})
    trace_logs = [r for r in caplog.records if "Trace de raisonnement — champs post-tour (#3198" in r.message]
    assert trace_logs, "la trace de raisonnement post-tour n'a pas été journalisée"
    logged = trace_logs[0].message
    assert "tools_called" in logged
    assert "get_account_briefing" in logged
    assert "verifier_status" in logged
    assert "pass" in logged
    assert "profile_version" in logged
    assert "esn:1/context:1" in logged


def test_chat_journalise_un_verifier_status_absent_quand_le_sink_reste_vide(client: TestClient, caplog) -> None:
    # Un tour arrêté sur une clarification n'appelle jamais le vérificateur
    # commercial (voir le docstring de `run_chat_with_tools`) : le sink reste
    # vide, et la trace le NOMME plutôt que de deviner un statut (GA-18/GA-19).
    with (
        patch(
            "app.services.chat_orchestrator.run_chat_with_tools",
            new_callable=AsyncMock,
            return_value=("Bonjour ! Voici mon conseil.", []),
        ),
        caplog.at_level(logging.INFO, logger="app.routers.chat"),
    ):
        client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})
    trace_logs = [r for r in caplog.records if "Trace de raisonnement — champs post-tour (#3198" in r.message]
    assert trace_logs, "la trace de raisonnement post-tour n'a pas été journalisée"
    assert "non vérifié ce tour" in trace_logs[0].message
    # Aucun dossier consulté ce tour : nommé comme absent, jamais deviné
    # (même discipline GA-18/GA-19 que `verifier_status` ci-dessus).
    assert "aucun dossier de compte consulté ce tour" in trace_logs[0].message


# #3223.1 (#3198) — la trace de raisonnement quitte les journaux : elle voyage
# dans `context["reasoning_trace"]`, que l'API range (liste blanche) pour que le
# tableau de pilotage la lise sur le trafic réel, sans échantillonner un corps
# de message (diagnostic seulement, jamais la chaîne de pensée).
def test_chat_expose_la_trace_de_raisonnement_dans_le_contexte(client: TestClient) -> None:
    async def _fake_run(*_args, **kwargs):
        sink = kwargs.get("verifier_status_sink")
        if sink is not None:
            sink.append("pass")
        return ("Voici.", [{"tool": "get_account_briefing", "status": "done"}])

    with patch("app.services.chat_orchestrator.run_chat_with_tools", side_effect=_fake_run):
        res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})
    trace = _parse_sse(res.text)[-1]["data"]["context"]["reasoning_trace"]
    assert trace["tools_called"] == ["get_account_briefing"]
    assert trace["verifier_status"] == "pass"
    assert isinstance(trace["detected_intent"], str)
    assert isinstance(trace["tools_planned"], list)
    # Jamais un corps de message ni une chaîne de pensée libre.
    assert "Bonjour" not in str(trace)


def test_chat_trace_de_raisonnement_porte_le_verdict_rendu_par_l_outil(client: TestClient) -> None:
    async def _fake_run(*_args, **_kwargs):
        return (
            "Pas maintenant.",
            [
                {"tool": "get_account_suitability_verdict", "status": "done", "account_verdict": "NO_GO_NOW"},
                {"tool": "suggest_account_alternatives", "status": "done"},
            ],
        )

    with patch("app.services.chat_orchestrator.run_chat_with_tools", side_effect=_fake_run):
        res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})
    trace = _parse_sse(res.text)[-1]["data"]["context"]["reasoning_trace"]
    assert trace["account_verdict"] == "NO_GO_NOW"
    assert trace["tools_called"] == ["get_account_suitability_verdict", "suggest_account_alternatives"]


def test_chat_trace_de_raisonnement_sans_verdict_n_en_invente_pas(client: TestClient) -> None:
    with patch(
        "app.services.chat_orchestrator.run_chat_with_tools",
        new_callable=AsyncMock,
        return_value=("Voici.", [{"tool": "get_account_briefing", "status": "done"}]),
    ):
        res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})
    trace = _parse_sse(res.text)[-1]["data"]["context"]["reasoning_trace"]
    assert "account_verdict" not in trace


def test_chat_trace_de_raisonnement_nomme_un_verifier_absent(client: TestClient) -> None:
    with patch(
        "app.services.chat_orchestrator.run_chat_with_tools",
        new_callable=AsyncMock,
        return_value=("Voici.", []),
    ):
        res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})
    trace = _parse_sse(res.text)[-1]["data"]["context"]["reasoning_trace"]
    assert trace["tools_called"] == []
    assert trace["verifier_status"] == "non vérifié ce tour"


# #3223 (lot X17) — « taux de corrections utilisateur » et « rerun après
# correction » : deux FAITS du tour (jamais un jugement) qui rejoignent la trace
# persistée. Rejeu du tour : l'utilisateur corrige, le modèle note la correction
# (`note_thread_context`), puis relance (ou non) l'outil qu'elle invalide.
def _correcting_run(tools: list[str], invalidates: tuple[str, ...]):
    from app.services.chat_thread_state import ThreadCorrection

    async def _fake_run(*_args, **kwargs):
        kwargs["thread"].state.active_correction = ThreadCorrection(
            correction_type="wrong_scope", summary="Mauvaise couche", invalidates=invalidates
        )
        return ("Corrigé.", [{"tool": t, "status": "done"} for t in tools])

    return _fake_run


def test_chat_trace_marque_une_correction_reconnue_et_son_rerun(client: TestClient) -> None:
    fake = _correcting_run(["find_accounts"], ("find_accounts",))
    with patch("app.services.chat_orchestrator.run_chat_with_tools", side_effect=fake):
        res = client.post("/chat/message", json={"message": "Non, pas la couche publique", "user_id": "u1"})
    trace = _parse_sse(res.text)[-1]["data"]["context"]["reasoning_trace"]
    assert trace["correction_recognized"] is True
    assert trace["correction_rerun"] is True


def test_chat_trace_correction_sans_rerun_de_l_outil_invalide(client: TestClient) -> None:
    fake = _correcting_run(["get_account_briefing"], ("find_accounts",))
    with patch("app.services.chat_orchestrator.run_chat_with_tools", side_effect=fake):
        res = client.post("/chat/message", json={"message": "Non, pas la couche publique", "user_id": "u1"})
    trace = _parse_sse(res.text)[-1]["data"]["context"]["reasoning_trace"]
    assert trace["correction_recognized"] is True
    assert trace["correction_rerun"] is False


def test_chat_trace_correction_sans_invalidation_nommee_ne_devine_pas_le_rerun(client: TestClient) -> None:
    fake = _correcting_run(["find_accounts"], ())
    with patch("app.services.chat_orchestrator.run_chat_with_tools", side_effect=fake):
        res = client.post("/chat/message", json={"message": "Non, pas la couche publique", "user_id": "u1"})
    trace = _parse_sse(res.text)[-1]["data"]["context"]["reasoning_trace"]
    assert trace["correction_recognized"] is True
    assert "correction_rerun" not in trace


# #3223 (lot R17, épopée #3223) — « correction sans changement de résultat » :
# la correction a été SUIVIE d'un rerun (l'outil invalidé a été réellement
# rappelé), mais le verdict de compte rendu ce tour est le MÊME que le dernier
# connu dans le fil (`ThreadState.last_account_verdict`) — jamais deviné sans
# les deux verdicts connus ET un rerun réel.
def _correcting_run_with_verdict(verdict: str):
    from app.services.chat_thread_state import ThreadCorrection

    async def _fake_run(*_args, **kwargs):
        kwargs["thread"].state.active_correction = ThreadCorrection(
            correction_type="wrong_scope",
            summary="Mauvaise couche",
            invalidates=("get_account_suitability_verdict",),
        )
        return (
            "Corrigé.",
            [{"tool": "get_account_suitability_verdict", "status": "done", "account_verdict": verdict}],
        )

    return _fake_run


def test_chat_trace_correction_suivie_d_un_rerun_sans_changement_de_verdict(client: TestClient) -> None:
    fake = _correcting_run_with_verdict("GO_AFTER_PROOF")
    with patch("app.services.chat_orchestrator.run_chat_with_tools", side_effect=fake):
        res = client.post(
            "/chat/message",
            json={
                "message": "Non, pas la couche publique",
                "user_id": "u1",
                "thread_state": {"version": 1, "last_account_verdict": "GO_AFTER_PROOF"},
            },
        )
    trace = _parse_sse(res.text)[-1]["data"]["context"]["reasoning_trace"]
    assert trace["correction_rerun"] is True
    assert trace["correction_without_result_change"] is True


def test_chat_trace_correction_suivie_d_un_rerun_avec_changement_de_verdict(client: TestClient) -> None:
    fake = _correcting_run_with_verdict("GO_NOW")
    with patch("app.services.chat_orchestrator.run_chat_with_tools", side_effect=fake):
        res = client.post(
            "/chat/message",
            json={
                "message": "Non, pas la couche publique",
                "user_id": "u1",
                "thread_state": {"version": 1, "last_account_verdict": "GO_AFTER_PROOF"},
            },
        )
    trace = _parse_sse(res.text)[-1]["data"]["context"]["reasoning_trace"]
    assert trace["correction_rerun"] is True
    assert trace["correction_without_result_change"] is False


def test_chat_trace_correction_sans_verdict_connu_avant_ne_devine_pas_le_changement(client: TestClient) -> None:
    fake = _correcting_run_with_verdict("GO_AFTER_PROOF")
    with patch("app.services.chat_orchestrator.run_chat_with_tools", side_effect=fake):
        res = client.post("/chat/message", json={"message": "Non, pas la couche publique", "user_id": "u1"})
    trace = _parse_sse(res.text)[-1]["data"]["context"]["reasoning_trace"]
    assert trace["correction_rerun"] is True
    assert "correction_without_result_change" not in trace


# #3223 (lot R17, épopée #3223) — « GO sur grand compte sans accès » : nommé
# tel quel par `compute_account_suitability` (GA-26, jamais un second calcul
# ici), simplement relayé dans la trace de raisonnement.
def test_chat_trace_porte_go_apres_preuve_sur_grand_compte_sans_acces(client: TestClient) -> None:
    async def _fake_run(*_args, **_kwargs):
        return (
            "D'abord une preuve.",
            [
                {
                    "tool": "get_account_suitability_verdict",
                    "status": "done",
                    "account_verdict": "GO_AFTER_PROOF",
                    "large_account_without_access": True,
                }
            ],
        )

    with patch("app.services.chat_orchestrator.run_chat_with_tools", side_effect=_fake_run):
        res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})
    trace = _parse_sse(res.text)[-1]["data"]["context"]["reasoning_trace"]
    assert trace["large_account_without_access"] is True


def test_chat_trace_sans_grand_compte_n_invente_pas_le_drapeau(client: TestClient) -> None:
    async def _fake_run(*_args, **_kwargs):
        return (
            "D'abord une preuve.",
            [{"tool": "get_account_suitability_verdict", "status": "done", "account_verdict": "GO_AFTER_PROOF"}],
        )

    with patch("app.services.chat_orchestrator.run_chat_with_tools", side_effect=_fake_run):
        res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})
    trace = _parse_sse(res.text)[-1]["data"]["context"]["reasoning_trace"]
    assert "large_account_without_access" not in trace


def test_chat_trace_sans_correction_dit_false_et_n_invente_pas_de_rerun(client: TestClient) -> None:
    with patch(
        "app.services.chat_orchestrator.run_chat_with_tools",
        new_callable=AsyncMock,
        return_value=("Voici.", [{"tool": "find_accounts", "status": "done"}]),
    ):
        res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})
    trace = _parse_sse(res.text)[-1]["data"]["context"]["reasoning_trace"]
    assert trace["correction_recognized"] is False
    assert "correction_rerun" not in trace


# #2879 (lot X17, #2442.15) — « fausse réussite » et « mauvais zéro » : les deux
# motifs du vérificateur (`action_declaree_sans_preuve`, `inconnue_convertie_en_zero`)
# rejoignent la trace persistée. Rejeu : le vérificateur rend `repair` avec ses
# motifs → le contexte du tour les porte ; sans vérificateur, le champ est absent.
def test_chat_trace_porte_les_motifs_du_verificateur(client: TestClient) -> None:
    async def _fake_run(*_args, **kwargs):
        kwargs["verifier_status_sink"].append("repair")
        kwargs["verifier_reasons_sink"].append(("action_declaree_sans_preuve", "inconnue_convertie_en_zero"))
        return ("Voici.", [])

    with patch("app.services.chat_orchestrator.run_chat_with_tools", side_effect=_fake_run):
        res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})
    trace = _parse_sse(res.text)[-1]["data"]["context"]["reasoning_trace"]
    assert trace["verifier_status"] == "repair"
    assert trace["verifier_reasons"] == ["action_declaree_sans_preuve", "inconnue_convertie_en_zero"]


def test_chat_trace_verifie_sans_motif_dit_liste_vide(client: TestClient) -> None:
    async def _fake_run(*_args, **kwargs):
        kwargs["verifier_status_sink"].append("pass")
        kwargs["verifier_reasons_sink"].append(())
        return ("Voici.", [])

    with patch("app.services.chat_orchestrator.run_chat_with_tools", side_effect=_fake_run):
        res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})
    trace = _parse_sse(res.text)[-1]["data"]["context"]["reasoning_trace"]
    assert trace["verifier_reasons"] == []


def test_chat_trace_non_verifie_n_invente_aucun_motif(client: TestClient) -> None:
    with patch(
        "app.services.chat_orchestrator.run_chat_with_tools",
        new_callable=AsyncMock,
        return_value=("Voici.", []),
    ):
        res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})
    trace = _parse_sse(res.text)[-1]["data"]["context"]["reasoning_trace"]
    assert "verifier_reasons" not in trace


# #3229 (recette prod 30/09) — Laura affichait « demande courante, donc j'ai
# répondu directement avec ce que je savais déjà » (mode_explanation, reason
# « default ») sur le MÊME tour où « Approfondissement » affichait « délai du
# tour atteint / mode dégradé » (turn_observability.degraded_answer) : les
# deux panneaux sont décidés séparément (l'un avant le tour sur le texte de
# la demande, l'autre après sur l'exécution réelle) et pouvaient se
# contredire. Un tour dégradé n'a justement PAS répondu directement.
def test_chat_omits_mode_explanation_default_when_the_turn_is_degraded(client: TestClient) -> None:
    from app.services.chat_turn_plan import TurnObservability

    async def _fake_run(*_args, **kwargs):
        sink = kwargs.get("observability_sink")
        if sink is not None:
            sink.append(
                TurnObservability(
                    execution_plan="tool_loop",
                    planned_steps=3,
                    completed_steps=3,
                    skipped_steps=0,
                    parallel_calls=0,
                    budget_exhausted=True,
                    degraded_answer=True,
                    job_created=False,
                )
            )
        return ("Voici ce que j'ai pu vérifier avant la coupure.", [])

    with patch("app.services.chat_orchestrator.run_chat_with_tools", side_effect=_fake_run):
        # Message court, sans compte actif ni mode explicite : `choose_chat_tier`
        # rend `reason="default"` — celui qui affirme « répondu directement ».
        res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})

    events = _parse_sse(res.text)
    context = events[-1]["data"]["context"]
    assert context["turn_observability"]["degraded_answer"] is True
    assert "mode_explanation" not in context


def test_chat_keeps_mode_explanation_default_when_the_turn_is_not_degraded(client: TestClient) -> None:
    # Non-régression : un tour NORMAL (pas dégradé) garde son explication —
    # seule la contradiction mesurée est supprimée, jamais l'explication elle-même.
    with patch(
        "app.services.chat_orchestrator.run_chat_with_tools",
        new_callable=AsyncMock,
        return_value=("Bonjour ! Voici mon conseil.", []),
    ):
        res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})

    events = _parse_sse(res.text)
    context = events[-1]["data"]["context"]
    assert "turn_observability" not in context
    assert context["mode_explanation"]["reason"] == "default"


def test_chat_handles_missing_api_key(client: TestClient) -> None:
    # With no ANTHROPIC_API_KEY, call_claude raises; the router catches it and
    # returns success=False + a generic message (no raw exception leak, #16).
    with patch.dict("os.environ", {}, clear=True):
        import os

        os.environ.pop("ANTHROPIC_API_KEY", None)
        res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})
    assert res.status_code == 200
    events = _parse_sse(res.text)
    terminal = events[-1]
    assert terminal["type"] == "done"
    assert terminal["success"] is False
    assert not terminal["data"]["reply"].startswith("Erreur")  # plus d'exception brute


def test_chat_streams_deltas_before_the_terminal_event(client: TestClient) -> None:
    """Le PREMIER token du texte final, diffusé — la métrique perçue du lot.

    Preuve par ORDRE, pas par durée : au moins un `delta` précède le `done`
    dans le flux rendu. `run_chat_with_tools` est ici la VRAIE fonction (pas
    un mock qui rendrait juste un tuple) — c'est elle qui appelle `emit`, donc
    c'est elle qu'il faut exercer pour que ce test lise quelque chose plutôt
    que de compter les événements d'un mock déjà figé.
    """
    from app.services import chat_orchestrator

    class _DummyThrottle:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_a):
            return False

    class _Stream:
        def __init__(self, response):
            self._response = response

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_exc):
            return False

        async def __aiter__(self):
            for chunk in ["Bon", "jour !"]:
                yield type("Ev", (), {"type": "text", "text": chunk})()

        async def get_final_message(self):
            return self._response

    class _Messages:
        def __init__(self, response):
            self._response = response

        def stream(self, **_kw):
            return _Stream(self._response)

    class _Client:
        def __init__(self, response):
            self.messages = _Messages(response)

    import anthropic

    text_block = type("Blk", (), {"type": "text", "text": "Bonjour !"})()
    response = type("Resp", (), {"stop_reason": "end_turn", "content": [text_block], "usage": None})()

    with (
        patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}),
        patch.object(chat_orchestrator, "throttle", lambda _p: _DummyThrottle()),
        patch.object(anthropic, "AsyncAnthropic", lambda **_kw: _Client(response)),
        patch("app.services.conversation_service.save_turn", new_callable=AsyncMock),
        patch(
            "app.services.conversation_service.load_recent_history",
            new_callable=AsyncMock,
            return_value=[],
        ),
    ):
        res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})

    assert res.status_code == 200
    events = _parse_sse(res.text)
    assert events[-1]["type"] == "done"
    assert events[-1]["success"] is True
    deltas = [e for e in events if e["type"] == "delta"]
    assert len(deltas) >= 2, f"un seul fragment ne prouve pas la diffusion : {deltas}"
    # Le delta arrive AVANT le terminal dans la séquence rendue — c'est
    # l'ordre, jamais une horloge, qui porte la preuve.
    assert events.index(deltas[0]) < events.index(events[-1])
    assert "".join(d["text"] for d in deltas) == events[-1]["data"]["reply"]


def test_a_broken_stream_falls_back_to_an_honest_terminal_event(client: TestClient) -> None:
    """Garde GA-308 (côté routeur) : un flux qui casse EN COURS (ni le budget
    nommé, ni le kill-switch — une vraie exception imprévue) ne pend jamais et
    ne rend jamais un 500 muet. Le client obtient quand même un `done` avec
    `success: false` et une phrase en français, exactement comme le filet
    générique tenait déjà `_run_chat_turn` avant ce lot."""
    with patch(
        "app.services.chat_orchestrator.run_chat_with_tools",
        new_callable=AsyncMock,
        side_effect=RuntimeError("connexion perdue en plein flux"),
    ):
        res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})

    assert res.status_code == 200
    events = _parse_sse(res.text)
    assert events, "un flux cassé doit quand même rendre un événement terminal"
    terminal = events[-1]
    assert terminal["type"] == "done"
    assert terminal["success"] is False
    # #1914.9 — le repli est une carte « donnée manquante » (`test_chat_error_replies.py`),
    # plus une phrase : c'est la constante du routeur, pas une copie de son texte.
    from app.routers.chat import _GENERIC_FAILURE_REPLY

    assert terminal["data"]["reply"] == _GENERIC_FAILURE_REPLY
    assert "erreur est survenue côté assistant" in terminal["data"]["reply"]


def test_a_secret_split_across_two_deltas_never_reaches_the_wire(client: TestClient) -> None:
    """COP-SEC sur le FLUX, pas seulement sur l'agrégat.

    `redact_secrets` masque le `reply` agrégé (`chat.py:349`) depuis toujours,
    mais les fragments `delta` diffusés en SSE (LOT STREAM, 12/09/2026) partent
    directement du texte brut du SDK — voir `_AnthropicTurns.send`. Le SDK
    coupe sa réponse sur SES frontières de streaming, jamais sur celles d'un
    motif de secret : ce test le simule en livrant la clé factice coupée en
    deux morceaux, exactement au milieu du jeton, comme `_text_chunks` le fait
    pour `test_deltas_arrive_before_the_turn_completes…`
    (`test_chat_orchestrator.py`) — sauf qu'ici le contenu diffusé a la FORME
    d'un secret.

    Masquer chaque fragment isolément ne suffit pas : pris séparément, ni
    « sk-ant-api03-AbCdEf01 » ni « 23456789xyz » n'a la forme d'un secret — le
    filtre ne les verrait pas. Ce test prouve donc que NI un delta pris seul
    NI leur concaténation ne laisse fuir la clé, et que le `done` terminal
    reste masqué comme avant ce lot.
    """
    from app.services import chat_orchestrator

    SECRET = "sk-ant-api03-AbCdEf0123456789xyz"
    full_text = f"Voici la clé : {SECRET} — à ne pas partager."
    # Coupure choisie EN PLEIN MILIEU du jeton, jamais sur un espace : c'est le
    # scénario que le lot précédent ne couvrait pas.
    chunk_a = "Voici la clé : sk-ant-api03-AbCdEf01"
    chunk_b = "23456789xyz — à ne pas partager."
    assert chunk_a + chunk_b == full_text  # la coupure reconstitue bien le texte d'origine

    class _DummyThrottle:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_a):
            return False

    class _Stream:
        def __init__(self, response):
            self._response = response

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_exc):
            return False

        async def __aiter__(self):
            for chunk in [chunk_a, chunk_b]:
                yield type("Ev", (), {"type": "text", "text": chunk})()

        async def get_final_message(self):
            return self._response

    class _Messages:
        def __init__(self, response):
            self._response = response

        def stream(self, **_kw):
            return _Stream(self._response)

    class _Client:
        def __init__(self, response):
            self.messages = _Messages(response)

    import anthropic

    text_block = type("Blk", (), {"type": "text", "text": full_text})()
    response = type("Resp", (), {"stop_reason": "end_turn", "content": [text_block], "usage": None})()

    with (
        patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}),
        patch.object(chat_orchestrator, "throttle", lambda _p: _DummyThrottle()),
        patch.object(anthropic, "AsyncAnthropic", lambda **_kw: _Client(response)),
        patch("app.services.conversation_service.save_turn", new_callable=AsyncMock),
        patch(
            "app.services.conversation_service.load_recent_history",
            new_callable=AsyncMock,
            return_value=[],
        ),
    ):
        res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})

    assert res.status_code == 200
    events = _parse_sse(res.text)
    terminal = events[-1]
    assert terminal["type"] == "done"
    assert terminal["success"] is True

    deltas = [e for e in events if e["type"] == "delta"]
    assert deltas, "aucun delta reçu — le scénario ne testerait plus rien"
    # Ni un delta PRIS SEUL...
    for d in deltas:
        assert SECRET not in d["text"], f"secret en clair dans un seul delta : {d}"
    # ...ni leur CONCATÉNATION : c'est précisément le piège qu'un masquage
    # fragment par fragment rate (chaque moitié, seule, n'a pas la forme d'un
    # secret).
    streamed = "".join(d["text"] for d in deltas)
    assert SECRET not in streamed
    assert "[valeur masquée]" in streamed

    # Le terminal reste masqué comme avant ce lot (COP-SEC, `chat.py:349`).
    assert SECRET not in terminal["data"]["reply"]
    assert "[valeur masquée]" in terminal["data"]["reply"]


# #3857 (BEL-LAU-1008-006) — /chat sélectionne la méthode sur le travail en
# cours (`thread_state.current_job`/`current_step`), pas seulement le dernier
# message : une relance « GO » ne doit pas faire perdre la méthode d'ouverture
# de compte retrouvée au tour précédent.
def test_chat_enrichit_la_requete_methode_avec_le_travail_en_cours(client: TestClient) -> None:
    with (
        patch(
            "app.services.chat_orchestrator.run_chat_with_tools",
            new_callable=AsyncMock,
            return_value=("D'accord.", []),
        ),
        patch(
            "app.services.method_knowledge.retrieve_method_chunks_with_rules",
            return_value=([], frozenset()),
        ) as retrieve_method,
    ):
        client.post(
            "/chat/message",
            json={
                "message": "GO",
                "user_id": "u1",
                "thread_state": {
                    "version": 1,
                    "current_job": "Ouverture du compte Renault (compte froid)",
                },
            },
        )

    called_query = retrieve_method.call_args.args[0]
    assert called_query == "GO Ouverture du compte Renault (compte froid)"


def test_chat_sans_travail_en_cours_declare_la_requete_methode_reste_le_message_seul(
    client: TestClient,
) -> None:
    # Non-régression : sans `current_job`/`current_step`, la requête méthode
    # reste byte-identique au message — comportement d'avant ce lot.
    with (
        patch(
            "app.services.chat_orchestrator.run_chat_with_tools",
            new_callable=AsyncMock,
            return_value=("D'accord.", []),
        ),
        patch(
            "app.services.method_knowledge.retrieve_method_chunks_with_rules",
            return_value=([], frozenset()),
        ) as retrieve_method,
    ):
        client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})

    called_query = retrieve_method.call_args.args[0]
    assert called_query == "Bonjour"
