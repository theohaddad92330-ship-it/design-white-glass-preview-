"""#2809 (#2293.11, #2294.*) — POST /phase/2/contacts/discover.

Découverte FRAÎCHE de contacts sur UN compte déjà connu : enveloppe fine sur
``search_people_with_status`` (la primitive cross-comptes qui existait déjà,
``apps/ia/app/services/apollo.py``), sans appelant atteignable avant ce lot.
Vérifie : le mapping vers la forme seed (``fullName``, ``apolloId``…) que
l'API persiste ensuite via ``ContactsService.bulkInsert`` ; l'ancrage
organisation transmis dans le bon ordre ; et le NO-OP strict — jamais un 500,
jamais un contact inventé — quand ``APOLLO_API_KEY`` est absente.
"""

import os
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.models.contacts import ApolloSearchHit
from app.services.apollo import ApolloSearchStatus

MOCK_HIT = ApolloSearchHit(
    id="apollo-123",
    first_name="Camille",
    last_name="Durand",
    title="RSSI",
    organization_name="ARQUUS",
    linkedin_url="https://linkedin.com/in/camilledurand",
    city="Versailles",
    country="France",
    has_email=True,
    has_phone=False,
)


def test_discover_contacts_returns_seeds_shaped_for_bulk_insert(client: TestClient) -> None:
    with patch(
        "app.routers.phase2_contacts.search_people_with_status",
        new_callable=AsyncMock,
        return_value=([MOCK_HIT], ApolloSearchStatus.OK, 1),
    ):
        res = client.post(
            "/phase/2/contacts/discover",
            json={"company_name": "ARQUUS", "titles": ["RSSI"]},
        )

    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert len(body["seeds"]) == 1
    seed = body["seeds"][0]
    # La MÊME forme que la collecte Phase 2 normale (`_apollo_hit_to_seed`) —
    # aucun moteur neuf, l'API la persiste par le même chemin (`bulkInsert`).
    assert seed["fullName"] == "Camille Durand"
    assert seed["source"] == "apollo"
    assert seed["apolloId"] == "apollo-123"
    assert seed["title"] == "RSSI"


def test_discover_contacts_scopes_by_organization_anchor_in_precedence_order(client: TestClient) -> None:
    with patch(
        "app.routers.phase2_contacts.search_people_with_status",
        new_callable=AsyncMock,
        return_value=([], ApolloSearchStatus.EMPTY, 0),
    ) as mock_search:
        client.post(
            "/phase/2/contacts/discover",
            json={
                "company_name": "ARQUUS",
                "organization_domain": "arquus-defense.com",
                "organization_id": "org-987",
                "titles": ["DAF", "RSSI"],
            },
        )

    mock_search.assert_awaited_once()
    kwargs = mock_search.call_args.kwargs
    assert kwargs["company_name"] == "ARQUUS"
    assert kwargs["organization_domains"] == ["arquus-defense.com"]
    assert kwargs["organization_ids"] == ["org-987"]
    assert kwargs["person_titles"] == ["DAF", "RSSI"]
    # Une découverte fraîche est bornée à UNE page (coût fournisseur borné par
    # compte) — jamais le waterfall complet d'une collecte Phase 2 entière.
    assert kwargs["max_pages"] == 1


def test_discover_contacts_without_domain_or_id_omits_those_anchors(client: TestClient) -> None:
    with patch(
        "app.routers.phase2_contacts.search_people_with_status",
        new_callable=AsyncMock,
        return_value=([], ApolloSearchStatus.EMPTY, 0),
    ) as mock_search:
        client.post("/phase/2/contacts/discover", json={"company_name": "ARQUUS"})

    kwargs = mock_search.call_args.kwargs
    assert kwargs["organization_domains"] is None
    assert kwargs["organization_ids"] is None


def test_discover_contacts_without_apollo_key_is_a_strict_no_op(client: TestClient) -> None:
    # #2809 — « sans clé fournisseur = no-op strict avec message clair » :
    # jamais un 500, jamais un contact inventé. `search_people_with_status`
    # porte déjà cette distinction (`ApolloSearchStatus.UNCONFIGURED`) ; ce
    # test vérifie que la ROUTE la laisse passer telle quelle jusqu'à l'appelant.
    with patch.dict(os.environ, {}, clear=True):
        os.environ.pop("APOLLO_API_KEY", None)
        res = client.post("/phase/2/contacts/discover", json={"company_name": "ARQUUS"})

    assert res.status_code == 200
    body = res.json()
    assert body["seeds"] == []
    assert body["status"] == "unconfigured"


def test_discover_contacts_caps_results_at_the_credible_limit(client: TestClient) -> None:
    many_hits = [
        ApolloSearchHit(id=f"apollo-{i}", first_name="Prenom", last_name=f"Nom{i}", organization_name="ARQUUS")
        for i in range(40)
    ]
    with patch(
        "app.routers.phase2_contacts.search_people_with_status",
        new_callable=AsyncMock,
        return_value=(many_hits, ApolloSearchStatus.OK, 40),
    ):
        res = client.post("/phase/2/contacts/discover", json={"company_name": "ARQUUS"})

    body = res.json()
    assert len(body["seeds"]) == 25
