from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.prompts import bellum_contacts, bellum_organigramme

from app.models.outputs.contacts import (
    ApproachStep,
    ContactsOutput,
    DecisionChain,
    EnrichedContact,
    OrgEntity,
    OrganigrammeOutput,
    UncoveredZone,
)


def _contacts_output(*items: EnrichedContact) -> tuple[ContactsOutput, dict]:
    return ContactsOutput(contacts=list(items)), {"input_tokens": 100, "output_tokens": 50}


def _org_output(
    *,
    organigramme: list[OrgEntity] | None = None,
    decision_chain: DecisionChain | None = None,
    uncovered_zones: list[UncoveredZone] | None = None,
    approach_order: list[ApproachStep] | None = None,
) -> tuple[OrganigrammeOutput, dict]:
    return (
        OrganigrammeOutput(
            organigramme=organigramme or [],
            decision_chain=decision_chain or DecisionChain(),
            uncovered_zones=uncovered_zones or [],
            approach_order=approach_order or [],
        ),
        {"input_tokens": 100, "output_tokens": 50},
    )


def _gather_side_effect(contacts_result, org_result):
    """BELLUM-CONTACTS is now batched: every batch uses a prompt_name of
    the form ``bellum_contacts_batch_<n>_of_<m>``. The fixture matches that
    family and returns ``contacts_result`` once (small test fixtures fit in
    a single batch); BELLUM-ORGANIGRAMME keeps its stable prompt_name."""

    async def side_effect(*_args, **kwargs):
        prompt_name = kwargs.get("prompt_name") or ""
        if prompt_name.startswith("bellum_contacts"):
            return contacts_result
        if prompt_name == "bellum_organigramme":
            return org_result
        raise AssertionError(f"unexpected prompt_name: {prompt_name}")

    return side_effect


def test_phase3_classify_calls_both_prompts_in_parallel(client: TestClient) -> None:
    """Both BELLUM-CONTACTS and BELLUM-ORGANIGRAMME are called; results merged."""
    contacts_result = _contacts_output(
        EnrichedContact(
            full_name="Jean Dupont",
            title="DSI",
            entity="SNCF SA",
            role="sponsor",
            priority=1,
            summary="Décideur principal IT",
            why_contact="Sponsor budget IT",
        )
    )
    org_result = _org_output(
        organigramme=[OrgEntity(entity="SNCF SA", level="groupe", contacts=["Jean Dupont"])],
    )

    with patch(
        "app.services.classification.call_claude",
        new_callable=AsyncMock,
        side_effect=_gather_side_effect(contacts_result, org_result),
    ) as mock_claude:
        res = client.post(
            "/phase/3/classify",
            json={
                "account_id": "abc-123",
                "contacts": [{"fullName": "Jean Dupont", "title": "DSI"}],
                "profile_data": {"companyName": "MonESN", "offers": ["Cloud"]},
            },
        )

    assert res.status_code == 200
    body = res.json()
    assert body["status"] in ("success", "partial_success")
    assert body["data"]["contacts"][0]["fullName"] == "Jean Dupont"
    assert body["data"]["organigramme"][0]["entity"] == "SNCF SA"
    # 1 batch for contacts + 1 organigramme call.
    assert mock_claude.call_count == 2
    prompt_names = sorted(call.kwargs.get("prompt_name") or "" for call in mock_claude.call_args_list)
    assert prompt_names == ["bellum_contacts_batch_1_of_1", "bellum_organigramme"]


def test_organigramme_model_lever_overrides_only_the_organigramme_call(client: TestClient) -> None:
    """ORGANIGRAMME_MODEL (A/B lever) routes only the organigramme call to the
    override model; the contacts batch keeps the default."""
    contacts_result = _contacts_output(
        EnrichedContact(
            full_name="Jean Dupont",
            title="DSI",
            entity="SNCF SA",
            role="sponsor",
            priority=1,
            summary="x",
            why_contact="y",
        )
    )
    org_result = _org_output(organigramme=[OrgEntity(entity="SNCF SA", level="groupe", contacts=["Jean Dupont"])])

    # Distinctive sentinel so it can't collide with the batch's own (Haiku) model.
    with patch("app.services.classification._ORGANIGRAMME_MODEL", "sentinel-model"), patch(
        "app.services.classification.call_claude",
        new_callable=AsyncMock,
        side_effect=_gather_side_effect(contacts_result, org_result),
    ) as mock_claude:
        res = client.post(
            "/phase/3/classify",
            json={
                "account_id": "abc-123",
                "contacts": [{"fullName": "Jean Dupont", "title": "DSI"}],
                "profile_data": {"companyName": "MonESN", "offers": ["Cloud"]},
            },
        )

    assert res.status_code == 200
    org_call = next(c for c in mock_claude.call_args_list if c.kwargs.get("prompt_name") == "bellum_organigramme")
    assert org_call.kwargs.get("model") == "sentinel-model"
    # The contacts batch keeps its own model, not the organigramme override.
    contacts_call = next(
        c for c in mock_claude.call_args_list if (c.kwargs.get("prompt_name") or "").startswith("bellum_contacts")
    )
    assert contacts_call.kwargs.get("model") != "sentinel-model"


def test_organigramme_defaults_to_haiku(client: TestClient) -> None:
    """With no ORGANIGRAMME_MODEL override, the organigramme call routes to Haiku
    (validated at parity vs Sonnet on SG + Crédit Mutuel, ~half the latency)."""
    import app.services.classification as classification
    from app.services.claude_service import CLAUDE_HAIKU_MODEL

    contacts_result = _contacts_output(
        EnrichedContact(
            full_name="Jean Dupont", title="DSI", entity="SNCF SA", role="sponsor", priority=1, summary="x", why_contact="y"
        )
    )
    org_result = _org_output(organigramme=[OrgEntity(entity="SNCF SA", level="groupe", contacts=["Jean Dupont"])])

    with patch.object(classification, "_ORGANIGRAMME_MODEL", CLAUDE_HAIKU_MODEL), patch(
        "app.services.classification.call_claude",
        new_callable=AsyncMock,
        side_effect=_gather_side_effect(contacts_result, org_result),
    ) as mock_claude:
        res = client.post(
            "/phase/3/classify",
            json={
                "account_id": "abc-123",
                "contacts": [{"fullName": "Jean Dupont", "title": "DSI"}],
                "profile_data": {"companyName": "MonESN", "offers": ["Cloud"]},
            },
        )

    assert res.status_code == 200
    org_call = next(c for c in mock_claude.call_args_list if c.kwargs.get("prompt_name") == "bellum_organigramme")
    assert org_call.kwargs.get("model") == CLAUDE_HAIKU_MODEL


def test_phase3_classify_returns_terminal_failure_on_claude_error(client: TestClient) -> None:
    """A prompt failing surfaces as a terminal_failure envelope (HTTP 422)."""
    with patch(
        "app.services.classification.call_claude",
        new_callable=AsyncMock,
        side_effect=ValueError("Claude API error: status=500"),
    ):
        res = client.post(
            "/phase/3/classify",
            json={"account_id": "abc-123", "contacts": [], "profile_data": {"companyName": "MonESN"}},
        )

    assert res.status_code == 422
    body = res.json()
    assert body["status"] == "terminal_failure"
    assert "Claude API error" in body["error"]["debug_message"]


def test_phase3_classify_with_empty_contacts(client: TestClient) -> None:
    """Empty contact list still goes through both prompts."""
    contacts_result = _contacts_output()
    org_result = _org_output(
        uncovered_zones=[
            UncoveredZone(zone="DSI", importance="critique"),
            UncoveredZone(zone="CTO", importance="importante"),
        ]
    )
    with patch(
        "app.services.classification.call_claude",
        new_callable=AsyncMock,
        side_effect=_gather_side_effect(contacts_result, org_result),
    ):
        res = client.post("/phase/3/classify", json={"account_id": "abc", "contacts": [], "profile_data": {}})

    assert res.status_code == 200
    data = res.json()["data"]
    assert data["contacts"] == []
    assert len(data["uncoveredZones"]) == 2


def test_phase3_classify_preserves_apollo_names(client: TestClient) -> None:
    """Phase 3 must echo back the exact contact names handed in."""
    contacts_result = _contacts_output(
        EnrichedContact(full_name="Marie Curie", title="DSI", role="champion")
    )
    org_result = _org_output()
    with patch(
        "app.services.classification.call_claude",
        new_callable=AsyncMock,
        side_effect=_gather_side_effect(contacts_result, org_result),
    ):
        res = client.post(
            "/phase/3/classify",
            json={"account_id": "abc", "contacts": [{"fullName": "Marie Curie", "title": "DSI"}]},
        )
    assert res.json()["data"]["contacts"][0]["fullName"] == "Marie Curie"


def test_batch_size_never_exceeds_safe_ceiling() -> None:
    """A stale env override must not push the batch back into the Haiku-truncation
    zone (whole-batch data loss). The ceiling makes the safe value self-applying."""
    from app.services import classification as c

    assert c.CONTACTS_BATCH_SIZE <= c._MAX_SAFE_BATCH


def test_phase3_only_enriches_top_n_deciders_and_drops_interns(client: TestClient) -> None:
    """Cost/latency guard: only the top-N ranked deciders reach the (expensive)
    per-contact LLM pass AND the organigramme; interns are dropped; the noise
    tail never costs tokens/latency (it keeps its Phase-2 DB seed)."""
    contacts_result = _contacts_output(EnrichedContact(full_name="x", role="champion"))
    org_result = _org_output()

    # Spy on what gets batched into BELLUM-CONTACTS and what the organigramme sees.
    batched: list[list[dict]] = []
    org_contacts: list[list[dict]] = []
    real_contacts_build = bellum_contacts.build_user_prompt
    real_org_build = bellum_organigramme.build_user_prompt

    def spy_contacts(**kwargs):
        batched.append(json.loads(kwargs["contacts"]))
        return real_contacts_build(**kwargs)

    def spy_org(**kwargs):
        org_contacts.append(json.loads(kwargs["contacts"]))
        return real_org_build(**kwargs)

    contacts = [
        {"fullName": "A", "title": "Chief Technology Officer"},
        {"fullName": "B", "title": "Directeur des Systèmes d'Information"},
        {"fullName": "C", "title": "VP Engineering"},
        {"fullName": "D", "title": "Chargé de communication"},
        {"fullName": "E", "title": "Stagiaire développeur"},  # out of scope → dropped
    ]

    with (
        patch("app.services.classification.CONTACTS_ENRICH_MAX", 2),
        patch.object(bellum_contacts, "build_user_prompt", side_effect=spy_contacts),
        patch.object(bellum_organigramme, "build_user_prompt", side_effect=spy_org),
        patch(
            "app.services.classification.call_claude",
            new_callable=AsyncMock,
            side_effect=_gather_side_effect(contacts_result, org_result),
        ),
    ):
        res = client.post(
            "/phase/3/classify",
            json={"account_id": "abc", "contacts": contacts, "profile_data": {"companyName": "MyESN"}},
        )

    assert res.status_code == 200
    # The organigramme also sees only the capped top-N (not the full 5).
    assert org_contacts and len(org_contacts[0]) == 2
    enriched = [c for batch in batched for c in batch]
    # Cap honoured: exactly 2 contacts enriched, both strong deciders.
    assert len(enriched) == 2
    titles = {c["title"] for c in enriched}
    assert "Chief Technology Officer" in titles
    assert "Stagiaire développeur" not in titles  # intern never enriched
    assert "Chargé de communication" not in titles  # weakest, cut by the cap


def test_phase3_classify_returns_the_rebuilt_org_graph(client: TestClient) -> None:
    """La route HTTP rend le MÊME bloc ``org_graph`` que le nœud du run complet.

    Sans lui, « Enrichir l'organigramme » sur un dossier déjà livré renvoyait des
    contacts sans graphe : l'API n'avait rien à persister et la carte d'influence
    restait figée sur le graphe du run initial — les contacts trouvés par une
    recherche ciblée n'apparaissaient jamais dessus."""
    contacts_result = _contacts_output(
        EnrichedContact(
            full_name="Jean Dupont",
            title="DSI",
            entity="SNCF SA",
            role="sponsor",
            priority=1,
            summary="Décideur IT",
            why_contact="Sponsor budget",
        )
    )
    org_result = _org_output(
        organigramme=[OrgEntity(entity="SNCF SA", level="groupe", contacts=["Jean Dupont"])],
        uncovered_zones=[UncoveredZone(zone="Cybersécurité", importance="critique")],
    )
    with patch(
        "app.services.classification.call_claude",
        new_callable=AsyncMock,
        side_effect=_gather_side_effect(contacts_result, org_result),
    ):
        res = client.post(
            "/phase/3/classify",
            json={
                "account_id": "abc",
                "contacts": [{"fullName": "Jean Dupont", "title": "DSI"}],
                "profile_data": {"companyName": "MonESN"},
            },
        )

    assert res.status_code == 200
    org_graph = res.json()["data"]["org_graph"]
    assert [p["fullName"] for p in org_graph["orgGraph"]["people"]] == ["Jean Dupont"]
    assert org_graph["orgGraph"]["graphVersion"] == 1
    # Les clés héritées voyagent dans le même bloc — c'est ce que persiste l'API.
    assert org_graph["organigramme"][0]["entity"] == "SNCF SA"


def test_phase3_classify_carries_apollo_source_status_into_coverage(client: TestClient) -> None:
    """#2543.5a — un rejeu de classification (« Enrichir l'organigramme ») ne
    doit pas EFFACER l'état de la source qu'une phase 2 précédente a mesuré :
    l'appelant le repasse explicitement, et ``coverage.sourceStatus`` /
    ``sourceTotalEntries`` le portent, exactement comme le nœud du run complet."""
    contacts_result = _contacts_output(
        EnrichedContact(
            full_name="Jean Dupont",
            title="DSI",
            entity="SNCF SA",
            role="sponsor",
            priority=1,
            summary="Décideur IT",
            why_contact="Sponsor budget",
        )
    )
    org_result = _org_output(organigramme=[OrgEntity(entity="SNCF SA", contacts=["Jean Dupont"])])
    with patch(
        "app.services.classification.call_claude",
        new_callable=AsyncMock,
        side_effect=_gather_side_effect(contacts_result, org_result),
    ):
        res = client.post(
            "/phase/3/classify",
            json={
                "account_id": "abc",
                "contacts": [{"fullName": "Jean Dupont", "title": "DSI"}],
                "profile_data": {"companyName": "MonESN"},
                "apollo_source_status": "plan_blocked",
                "apollo_total_entries": 6,
            },
        )

    assert res.status_code == 200
    coverage = res.json()["data"]["org_graph"]["orgGraph"]["coverage"]
    assert coverage["sourceStatus"] == "plan_blocked"
    assert coverage["sourceTotalEntries"] == 6


def test_phase3_classify_honours_the_graph_memory(client: TestClient) -> None:
    """Reconstruire le graphe ne doit PAS ressusciter ce que l'utilisateur a
    écarté : la version et l'ardoise des rejets voyagent dans la requête."""
    contacts_result = _contacts_output(
        EnrichedContact(full_name="Jean Dupont", title="DSI", entity="SNCF SA", role="sponsor", priority=1),
        EnrichedContact(full_name="Marie Curie", title="CTO", entity="SNCF SA", role="technical", priority=2),
    )
    org_result = _org_output(organigramme=[OrgEntity(entity="SNCF SA", contacts=["Jean Dupont", "Marie Curie"])])
    with patch(
        "app.services.classification.call_claude",
        new_callable=AsyncMock,
        side_effect=_gather_side_effect(contacts_result, org_result),
    ):
        res = client.post(
            "/phase/3/classify",
            json={
                "account_id": "abc",
                "contacts": [{"fullName": "Jean Dupont"}, {"fullName": "Marie Curie"}],
                "profile_data": {"companyName": "MonESN"},
                "org_graph_version": 4,
                "org_rejected_items": [{"sourceId": "p-jean-dupont", "reason": "signalé parti"}],
            },
        )

    assert res.status_code == 200
    graph = res.json()["data"]["org_graph"]["orgGraph"]
    assert graph["graphVersion"] == 4
    names = [p["fullName"] for p in graph["people"]]
    assert "Marie Curie" in names
    assert "Jean Dupont" not in names


def test_phase3_classify_survives_a_graph_assembly_failure(client: TestClient) -> None:
    """Un raté d'assemblage ne fait pas tomber une classification qui a abouti :
    les contacts partent quand même, sans ``orgGraph`` inventé."""
    contacts_result = _contacts_output(EnrichedContact(full_name="Jean Dupont", role="sponsor"))
    org_result = _org_output(organigramme=[OrgEntity(entity="SNCF SA", contacts=["Jean Dupont"])])

    def boom(**_kwargs):
        raise RuntimeError("assemblage impossible")

    with patch("app.services.org_graph_build.assemble_org_graph", side_effect=boom), patch(
        "app.services.classification.call_claude",
        new_callable=AsyncMock,
        side_effect=_gather_side_effect(contacts_result, org_result),
    ):
        res = client.post(
            "/phase/3/classify",
            json={"account_id": "abc", "contacts": [{"fullName": "Jean Dupont"}], "profile_data": {}},
        )

    assert res.status_code == 200
    data = res.json()["data"]
    assert data["contacts"][0]["fullName"] == "Jean Dupont"
    assert "orgGraph" not in data.get("org_graph", {})


def test_phase3_classify_merges_outputs(client: TestClient) -> None:
    """The two prompt outputs are merged into a single response payload."""
    contacts_result = _contacts_output(
        EnrichedContact(full_name="Jean", entity="SNCF SA", role="sponsor", priority=1)
    )
    org_result = _org_output(
        organigramme=[OrgEntity(entity="SNCF SA", contacts=["Jean"])],
        approach_order=[ApproachStep(step=1, contact="Jean", role="sponsor")],
    )
    with patch(
        "app.services.classification.call_claude",
        new_callable=AsyncMock,
        side_effect=_gather_side_effect(contacts_result, org_result),
    ):
        res = client.post(
            "/phase/3/classify",
            json={"account_id": "abc", "contacts": [{"fullName": "Jean"}], "profile_data": {"companyName": "MyESN"}},
        )

    assert res.status_code == 200
    data = res.json()["data"]
    assert data["contacts"][0]["fullName"] == "Jean"
    assert data["organigramme"][0]["entity"] == "SNCF SA"
    assert data["approach_order"][0]["contact"] == "Jean"
