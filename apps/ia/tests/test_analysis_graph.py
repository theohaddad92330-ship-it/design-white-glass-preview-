"""LangGraph analysis-pipeline orchestration (v2, increment 1).

Verifies the StateGraph wraps the four existing phase functions as nodes,
runs them in order, accumulates state + per-phase envelope metas, and
early-exits the moment a phase sets a terminal error — without ever calling
the downstream phases. The phase functions themselves are mocked here: this
suite is about the graph wiring, not Claude.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

import app.graph.nodes as nodes
from app.graph.builder import build_analysis_graph, run_analysis_graph, stream_analysis_graph
from app.models.agent_envelope import AgentStatus
from app.models.contacts import ApolloSearchHit, ContactsResponse
from app.models.plan import PlanResponse
from app.models.research import ResearchResponse


def _fake_classifier(contacts: list[dict], status: AgentStatus = AgentStatus.SUCCESS, extra: dict | None = None):
    """A stand-in ClassifierAgent whose ``run`` returns an envelope-shaped object.

    ``extra`` lets a test add the org-graph keys (decisionChain, uncoveredZones…)
    the real ClassifiedData carries alongside the contacts."""

    class _FakeData:
        def model_dump(self, **_kw):
            return {"contacts": contacts, **(extra or {})}

    env = SimpleNamespace(
        status=status,
        data=_FakeData() if status == AgentStatus.SUCCESS else None,
        error=None if status == AgentStatus.SUCCESS else {"code": "X"},
    )

    class _FakeAgent:
        run = AsyncMock(return_value=env)

    return _FakeAgent


@pytest.fixture
def patched_phases(monkeypatch: pytest.MonkeyPatch):
    """Patch all four phase entrypoints with deterministic fakes."""
    research = AsyncMock(
        return_value=ResearchResponse(
            data={
                "businessDescription": "Banque",
                "executives": [
                    {"first_name": "Hélène", "last_name": "Bernard", "role": "DG", "is_c_level": True},
                    {"first_name": "Marc", "last_name": "Petit", "role": "DSI", "is_c_level": False},
                ],
            }
        )
    )
    contacts = AsyncMock(
        return_value=ContactsResponse(data={"contacts": [{"fullName": "Hélène Bernard", "title": "DG"}]})
    )
    plan = AsyncMock(return_value=PlanResponse(data={"actionPlan": {"strategy": "S", "phases": []}}))
    fake_cls = _fake_classifier([{"fullName": "Hélène Bernard", "title": "DG", "decisionRole": "economic"}])

    # research_node now kicks off the Apollo prefetch concurrently; stub it so the
    # graph tests stay hermetic (no dependency on APOLLO_API_KEY / network). Tests
    # that exercise the prefetch handoff override this with their own return.
    prefetch = AsyncMock(return_value=[])

    monkeypatch.setattr(nodes, "_research", research)
    monkeypatch.setattr(nodes, "_contacts", contacts)
    monkeypatch.setattr(nodes, "_plan", plan)
    monkeypatch.setattr(nodes, "ClassifierAgent", fake_cls)
    monkeypatch.setattr(nodes, "prefetch_apollo_hits", prefetch)
    return SimpleNamespace(
        research=research, contacts=contacts, plan=plan, classifier=fake_cls, prefetch=prefetch
    )


def test_graph_compiles_with_the_four_phase_nodes() -> None:
    graph = build_analysis_graph(judge=False)
    node_names = set(graph.get_graph().nodes.keys())
    for phase in ("phase_research", "phase_contacts", "phase_classify", "phase_plan"):
        assert phase in node_names


@pytest.mark.asyncio
async def test_happy_path_runs_all_phases_in_order(patched_phases) -> None:
    final = await run_analysis_graph(
        {"company_name": "Crédit Mutuel", "profile_data": {"companyName": "Skaizen"}},
        thread_id="t-happy",
    )

    # Every phase ran exactly once.
    patched_phases.research.assert_awaited_once()
    patched_phases.contacts.assert_awaited_once()
    patched_phases.classifier.run.assert_awaited_once()
    patched_phases.plan.assert_awaited_once()

    # State accumulated each phase's output.
    assert final["research"]["businessDescription"] == "Banque"
    assert final["contacts"][0]["fullName"] == "Hélène Bernard"
    assert final["classified_contacts"][0]["decisionRole"] == "economic"
    assert final["plan"]["actionPlan"]["strategy"] == "S"
    assert final.get("error") is None
    # One envelope meta accumulated per executed phase.
    assert [e["phase"] for e in final["envelopes"]] == ["research", "contacts", "classify", "plan", "judge"]
    assert all(e["ok"] for e in final["envelopes"])


@pytest.mark.asyncio
async def test_contacts_node_keeps_out_of_scope_drops_in_state(patched_phases) -> None:
    # P0-03 : les contacts d'une entité hors périmètre étaient jetés en silence.
    # Le décompte remonte maintenant dans l'état du graphe (donc jusqu'au worker),
    # sous la clé que ``PHASE_OUTPUT_KEYS`` publie sur ``phase_completed``.
    patched_phases.contacts.return_value = ContactsResponse(
        data={
            "contacts": [{"fullName": "Hélène Bernard", "title": "DG"}],
            "outOfScope": {"dropped": 2, "entities": [{"name": "SGTM", "count": 2}]},
        }
    )
    final = await run_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="t-oos")

    assert final["contacts_out_of_scope"] == {"dropped": 2, "entities": [{"name": "SGTM", "count": 2}]}


@pytest.mark.asyncio
async def test_contacts_node_carries_source_status_into_state(patched_phases) -> None:
    """#2543.5a — ``_assemble_coverage``/``build_org_graph_payload`` acceptent
    déjà ``apollo_source_status``/``apollo_total_entries`` ; ce test prouve que
    ``contacts_node`` les alimente RÉELLEMENT depuis la réponse de phase 2,
    au lieu de les laisser se perdre entre les deux nœuds."""
    patched_phases.contacts.return_value = ContactsResponse(
        data={
            "contacts": [{"fullName": "Hélène Bernard", "title": "DG"}],
            "sourceStatus": "plan_blocked",
            "sourceTotalEntries": 6,
        }
    )
    final = await run_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="t-source-status")

    assert final["apollo_source_status"] == "plan_blocked"
    assert final["apollo_total_entries"] == 6


@pytest.mark.asyncio
async def test_contacts_node_omits_source_status_when_not_measured(patched_phases) -> None:
    """Aucune recherche live cette requête-ci (préchargement seul, sans ancre) :
    la clé reste ABSENTE de l'état — jamais un "ok" deviné."""
    final = await run_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="t-no-source-status")

    assert final.get("apollo_source_status") is None
    assert final.get("apollo_total_entries") is None


@pytest.mark.asyncio
async def test_contacts_node_omits_out_of_scope_when_nothing_dropped(patched_phases) -> None:
    # Rétro-compatibilité : rien d'écarté (ou IA plus ancienne) ⇒ clé absente,
    # donc le dossier n'affiche rien plutôt qu'un « 0 écarté » trompeur.
    final = await run_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="t-no-oos")

    assert final.get("contacts_out_of_scope") is None


@pytest.mark.asyncio
async def test_classify_node_persists_org_graph(patched_phases, monkeypatch: pytest.MonkeyPatch) -> None:
    # A classifier returning the org graph alongside the contacts — the node must
    # keep it in state (org_graph) so the API can persist raw_analysis.org.
    org_fields = {
        "decisionChain": {"description": "ITIM décide", "estimatedCycleLength": "4 mois"},
        "uncoveredZones": [{"zone": "Cybersécurité", "importance": "critique"}],
        "stakeholderMap": [{"fullName": "Hélène Bernard", "stance": "advocate"}],
        "approach_order": [{"step": 1, "contact": "Marc Petit", "why_first": "accessible"}],
    }
    monkeypatch.setattr(
        nodes, "ClassifierAgent", _fake_classifier([{"fullName": "Hélène Bernard", "title": "DG"}], extra=org_fields)
    )
    final = await run_analysis_graph(
        {"company_name": "Crédit Mutuel", "profile_data": {}}, thread_id="t-org"
    )
    org = final["org_graph"]
    assert org["decisionChain"]["estimatedCycleLength"] == "4 mois"
    assert org["uncoveredZones"][0]["zone"] == "Cybersécurité"
    assert org["approach_order"][0]["contact"] == "Marc Petit"
    # The contacts list is NOT duplicated into the org graph.
    assert "contacts" not in org


@pytest.mark.asyncio
async def test_a_cancelled_classify_fails_the_phase_instead_of_emptying_the_dossier(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A cancelled classify must NOT read as a successful phase.

    ``ClassifierAgent.run`` converts a cancellation into a CANCELLED envelope with
    ``data=None``. CANCELLED was absent from the node's failure set, so the node
    took the success path, read ``contacts`` off an empty dict, and returned a
    perfectly well-formed phase result carrying ZERO contacts — marked
    ``completed``. The run then continued to the plan and produced a dossier with
    no decision-makers that claimed to be finished. A dossier that lost its
    contacts must say so; presenting the remains of an interrupted phase as a
    complete one is the one failure mode this project forbids.
    """
    monkeypatch.setattr(nodes, "ClassifierAgent", _fake_classifier([], status=AgentStatus.CANCELLED))

    result = await nodes.classify_node(
        {"company_name": "Qonto", "profile_data": {}, "research": {}, "contacts": [], "completed": []}
    )

    assert result["error"]["phase"] == "classify"
    assert "classify" not in result.get("completed", [])


def test_reattach_apollo_keys_restores_id_and_linkedin_from_seeds() -> None:
    # The classifier's EnrichedContact model drops apolloId/linkedinUrl (the LLM
    # never echoes them). Re-attach copies them back from the phase-2 seeds by name
    # so auto-enrich holds the strongest People-Match key — present-only.
    classified = [
        {"fullName": "Julien Da***r", "title": "CTO"},  # id was obfuscated + dropped
        {"fullName": "Marc Petit", "title": "DSI", "apolloId": "keep-me"},  # already set
        {"fullName": "Inconnu", "title": "X"},  # no matching seed → untouched
    ]
    seeds = [
        {"fullName": "julien da***r", "apolloId": "apollo-1", "linkedinUrl": "https://li/in/j"},
        {"fullName": "Marc Petit", "apolloId": "apollo-2"},
    ]
    nodes._reattach_apollo_keys(classified, seeds)
    assert classified[0]["apolloId"] == "apollo-1"  # matched despite case diff
    assert classified[0]["linkedinUrl"] == "https://li/in/j"
    assert classified[1]["apolloId"] == "keep-me"  # never clobbered
    assert "apolloId" not in classified[2]  # no seed → left alone


@pytest.mark.asyncio
async def test_classify_node_reattaches_apollo_id_before_auto_enrich(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # End-to-end wiring: the phase-2 seed's apolloId must reach the auto-enrich
    # call even though the classifier output carries only the (obfuscated) name.
    captured: dict = {}

    async def _spy_enrich(contacts, company_name, **_):
        captured["contacts"] = contacts
        return contacts

    monkeypatch.setattr(nodes, "enrich_top_deciders", _spy_enrich)
    monkeypatch.setattr(
        nodes, "ClassifierAgent", _fake_classifier([{"fullName": "Julien Da***r", "title": "CTO"}])
    )
    state = {
        "company_name": "Qonto",
        "profile_data": {},
        "research": {},
        # Phase-2 seed carries the Apollo person id (the classifier dropped it).
        "contacts": [{"fullName": "Julien Da***r", "apolloId": "apollo-xyz", "linkedinUrl": ""}],
        "completed": [],
    }
    await nodes.classify_node(state)
    assert captured["contacts"][0]["apolloId"] == "apollo-xyz"


@pytest.mark.asyncio
async def test_classify_node_attaches_buying_committee(patched_phases, monkeypatch: pytest.MonkeyPatch) -> None:
    # The classify node types the contacts into the buying committee (Knowledge
    # Pack v2) and rides it on org_graph so it lands in raw_analysis.org.
    monkeypatch.setattr(
        nodes,
        "ClassifierAgent",
        _fake_classifier(
            [
                {"fullName": "Marc Petit", "title": "DSI"},
                {"fullName": "Léa Roux", "title": "Développeur"},
            ]
        ),
    )
    final = await run_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="t-committee")
    committee = final["org_graph"]["buyingCommittee"]
    roles = {m["fullName"]: m["committeeRole"] for m in committee["members"]}
    assert roles == {"Marc Petit": "technical_buyer", "Léa Roux": "user_buyer"}
    assert committee["roleCoverage"]["technical_buyer"] == 1
    assert "champion" in committee["missingRoles"]


@pytest.mark.asyncio
async def test_classify_event_emits_org_graph_to_the_worker(patched_phases, monkeypatch: pytest.MonkeyPatch) -> None:
    # The classify node produced org_graph but PHASE_OUTPUT_KEYS dropped it from
    # the phase_completed event → raw_analysis.org stayed empty. It must now ride
    # the event's data.output so the NestJS worker persists it.
    org_fields = {"decisionChain": {"description": "ITIM décide"}, "uncoveredZones": [{"zone": "Cyber"}]}
    monkeypatch.setattr(
        nodes, "ClassifierAgent", _fake_classifier([{"fullName": "H B", "title": "DG"}], extra=org_fields)
    )
    classify_out = None
    async for ev in stream_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="t-emit"):
        if ev.type == "phase_completed" and ev.phase == "classify":
            classify_out = ev.data.get("output") or {}
    assert classify_out is not None
    assert "classified_contacts" in classify_out
    assert classify_out.get("org_graph", {}).get("decisionChain", {}).get("description") == "ITIM décide"


@pytest.mark.asyncio
async def test_seed_contacts_extracted_from_research_executives(patched_phases) -> None:
    await run_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="t-seed")

    # contacts phase received the Pappers executives as typed seed contacts.
    call = patched_phases.contacts.await_args
    req = call.args[0]
    seeds = req.seed_contacts
    assert [s.last_name for s in seeds] == ["Bernard", "Petit"]
    assert seeds[0].title == "DG" and seeds[0].is_c_level is True
    assert seeds[1].title == "DSI" and seeds[1].is_c_level is False
    assert all(s.source == "pappers" for s in seeds)


@pytest.mark.asyncio
async def test_research_failure_early_exits_without_downstream(patched_phases) -> None:
    patched_phases.research.side_effect = RuntimeError("research boom")

    final = await run_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="t-fail")

    assert final["failed_phase"] == "research"
    assert "research boom" in final["error"]["message"]
    # Downstream phases must NOT have run.
    patched_phases.contacts.assert_not_awaited()
    patched_phases.classifier.run.assert_not_awaited()
    patched_phases.plan.assert_not_awaited()
    assert final.get("plan") is None


@pytest.mark.asyncio
async def test_research_prefetches_apollo_hits_and_contacts_consumes_them(
    patched_phases, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Latency optimization: research_node runs the FREE Apollo People-Search
    # concurrently with research, stashes the hits into prefetched_contacts, and
    # contacts_node hands them to the ContactsRequest instead of searching live.
    hits = [
        ApolloSearchHit(first_name="Jean", last_name="Dupont", title="DSI", organization_name="X"),
        ApolloSearchHit(first_name="Marie", last_name="Martin", title="CTO", organization_name="X"),
    ]
    monkeypatch.setattr(nodes, "prefetch_apollo_hits", AsyncMock(return_value=hits))

    final = await run_analysis_graph(
        {"company_name": "X", "profile_data": {"personas": ["DSI"]}}, thread_id="t-prefetch"
    )

    # research_node stashed the prefetched Apollo hits into state (as dicts).
    prefetched = final["prefetched_contacts"]
    assert [h["first_name"] for h in prefetched] == ["Jean", "Marie"]

    # contacts_node consumed them: the ContactsRequest it built carried the
    # rehydrated hits, so the live search was bypassed.
    req = patched_phases.contacts.await_args.args[0]
    assert req.prefetched_hits is not None
    assert [h.first_name for h in req.prefetched_hits] == ["Jean", "Marie"]


@pytest.mark.asyncio
async def test_contacts_searches_live_when_prefetch_absent(patched_phases) -> None:
    # No prefetched_contacts in state (e.g. the prefetch failed) → contacts_node
    # builds a ContactsRequest with prefetched_hits=None so _contacts searches live.
    async def _no_prefetch(*_a, **_k):
        raise RuntimeError("apollo down")

    patched_phases.prefetch.side_effect = _no_prefetch

    final = await run_analysis_graph(
        {"company_name": "X", "profile_data": {}}, thread_id="t-noprefetch"
    )

    assert final.get("prefetched_contacts") is None
    req = patched_phases.contacts.await_args.args[0]
    assert req.prefetched_hits is None


@pytest.mark.asyncio
async def test_classify_terminal_failure_stops_before_plan(monkeypatch, patched_phases) -> None:
    # Swap the classifier for one that reports a terminal failure.
    monkeypatch.setattr(
        nodes, "ClassifierAgent", _fake_classifier([], status=AgentStatus.TERMINAL_FAILURE)
    )

    final = await run_analysis_graph({"company_name": "X", "profile_data": {}}, thread_id="t-cfail")

    assert final["failed_phase"] == "classify"
    patched_phases.plan.assert_not_awaited()
