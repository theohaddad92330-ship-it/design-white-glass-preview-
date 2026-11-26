import asyncio
from typing import Any
from unittest.mock import ANY, AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.models.contacts import ApolloSearchHit, ContactScope, ContactsRequest
from app.services.apollo import ApolloSearchStatus


@pytest.fixture(autouse=True)
def _relance_famille_eteinte_par_defaut(monkeypatch) -> None:
    """#4923.7 — la relance par famille est ACTIVE par défaut : ces tests comptent les
    appels de la recherche primaire, la relance se rallume dans les tests qui la visent."""
    monkeypatch.setattr("app.routers.phase2_contacts._AUTO_THEME_RELAUNCH_ENABLED", False)


MOCK_CONTACTS: list[ApolloSearchHit] = [
    ApolloSearchHit(
        first_name="Jean",
        last_name="Dupont",
        title="DSI",
        organization_name="SNCF",
        linkedin_url="https://linkedin.com/in/jeandupont",
        city="Paris",
        country="France",
    ),
    ApolloSearchHit(
        first_name="Marie",
        last_name="Martin",
        title="CTO",
        organization_name="SNCF",
        linkedin_url="https://linkedin.com/in/mariemartin",
        city="Lyon",
        country="France",
    ),
]


def test_drop_out_of_scope_hits_filters_bad_scope_bu() -> None:
    from app.routers.phase2_contacts import _drop_out_of_scope_hits

    hits = [
        ApolloSearchHit(first_name="Jean", last_name="Dupont", title="DSI", organization_name="Société Générale"),
        ApolloSearchHit(first_name="Amine", last_name="X", title="Directeur", organization_name="SGTM (Société Générale des Travaux du Maroc)"),
        ApolloSearchHit(first_name="Koffi", last_name="Y", title="DSI", organization_name="Société Générale Côte d'Ivoire"),
    ]
    kept, dropped = _drop_out_of_scope_hits(
        hits,
        ["SGTM (Société Générale des Travaux du Maroc)", "Société Générale Côte d'Ivoire"],
    )
    assert len(dropped) == 2
    # Les LABELS des entités écartées voyagent, pas seulement leur nombre : c'est ce
    # qui permet d'écrire « 2 écartés (hors périmètre) — SGTM, SG Côte d'Ivoire ».
    assert dropped == [
        "SGTM (Société Générale des Travaux du Maroc)",
        "Société Générale Côte d'Ivoire",
    ]
    assert [h.organization_name for h in kept] == ["Société Générale"]


def test_out_of_scope_summary_groups_by_entity() -> None:
    from app.routers.phase2_contacts import _out_of_scope_summary

    summary = _out_of_scope_summary(["SGTM", "SG Côte d'Ivoire", "SGTM", "  "])
    assert summary["dropped"] == 4  # tout hit écarté compte, même sans employeur nommé
    # Trié par volume décroissant puis nom → même dossier ⇒ même objet.
    assert summary["entities"] == [
        {"name": "SGTM", "count": 2},
        {"name": "SG Côte d'Ivoire", "count": 1},
    ]


def test_out_of_scope_summary_empty_when_nothing_dropped() -> None:
    from app.routers.phase2_contacts import _out_of_scope_summary

    assert _out_of_scope_summary([]) == {"dropped": 0, "entities": []}


def test_apollo_details_carries_availability_flags() -> None:
    # The free-tier has_email / has_phone flags ride the seed's apolloDetails
    # (jsonb, no migration) so the web can badge "email dispo" and the auto-enrich
    # can target credits. Always emitted, even when False.
    from app.routers.phase2_contacts import _apollo_details, _apollo_hit_to_seed

    hit = ApolloSearchHit(first_name="Jean", last_name="Dupont", title="DSI",
                          organization_name="SNCF", has_email=True, has_phone=False)
    details = _apollo_details(hit)
    assert details["hasEmail"] is True
    assert details["hasPhone"] is False
    # And it survives into the wire seed the API persists.
    seed = _apollo_hit_to_seed(hit)
    assert seed["apolloDetails"]["hasEmail"] is True


def test_apollo_details_names_an_unverified_employer() -> None:
    # #3911.1 — une recherche retombée sur le nom en texte libre (aucune
    # ancre id/domaine) pose le signal sur le hit ; il doit survivre jusqu'au
    # seed pour que l'API puisse dégrader la confiance affichée.
    from app.routers.phase2_contacts import _apollo_details, _apollo_hit_to_seed

    hit = ApolloSearchHit(
        first_name="Jean", last_name="Dupont", title="DSI",
        organization_name="SNCF", employer_unverified=True,
    )
    details = _apollo_details(hit)
    assert details["employerUnverified"] is True
    seed = _apollo_hit_to_seed(hit)
    assert seed["apolloDetails"]["employerUnverified"] is True


def test_apollo_details_omits_the_unverified_key_when_verified() -> None:
    # Jamais un "employerUnverified: false" qui laisserait croire à une
    # vérification positive qu'on n'a pas faite — la clé est juste absente.
    from app.routers.phase2_contacts import _apollo_details

    hit = ApolloSearchHit(first_name="Jean", last_name="Dupont", title="DSI", organization_name="SNCF")
    details = _apollo_details(hit)
    assert "employerUnverified" not in details


def test_drop_out_of_scope_hits_noop_without_names() -> None:
    from app.routers.phase2_contacts import _drop_out_of_scope_hits

    hits = [ApolloSearchHit(first_name="Jean", last_name="Dupont", title="DSI", organization_name="SNCF")]
    kept, dropped = _drop_out_of_scope_hits(hits, [])
    assert dropped == [] and kept == hits


def test_seed_carries_the_masked_last_name() -> None:
    # Apollo's search tier ships `first_name` + `last_name_obfuscated` ("Mo***y").
    # The seed carries the mask so the UI can render an honest "Séverine M."
    # instead of a bare first name — the full name arrives with the People-Match.
    from app.routers.phase2_contacts import _apollo_hit_to_seed

    hit = ApolloSearchHit(
        id="54a2617474686933187f271e",
        first_name="Severine",
        last_name_obfuscated="Mo***y",
        title="Responsable de la Communication Interne",
        organization_name="Dassault Aviation",
        has_email=True,
    )
    seed = _apollo_hit_to_seed(hit)
    assert seed["fullName"] == "Severine"
    assert seed["lastNameObfuscated"] == "Mo***y"
    assert seed["apolloId"] == "54a2617474686933187f271e"


def test_seed_omits_the_mask_when_the_real_last_name_is_known() -> None:
    # A Pappers / enriched hit has a real last name; publishing a mask alongside
    # it would make the UI hide a name we already hold.
    from app.routers.phase2_contacts import _apollo_hit_to_seed

    hit = ApolloSearchHit(first_name="Jean", last_name="Dupont", title="DSI", organization_name="SNCF")
    seed = _apollo_hit_to_seed(hit)
    assert seed["fullName"] == "Jean Dupont"
    assert "lastNameObfuscated" not in seed


def test_unreachable_hits_are_dropped() -> None:
    # « Toujours au moins une façon de les contacter » : Apollo tells us up front
    # whether a work email or a direct phone EXISTS behind the paywall. A hit with
    # neither — and no LinkedIn — can never be contacted, so it would only pad the
    # org chart with dead rows. Free flags, so this costs nothing to check.
    from app.routers.phase2_contacts import _drop_unreachable_hits

    reachable_email = ApolloSearchHit(id="a", first_name="Severine", has_email=True)
    reachable_phone = ApolloSearchHit(id="b", first_name="Marc", has_phone=True)
    reachable_linkedin = ApolloSearchHit(
        id="c", first_name="Paul", linkedin_url="https://linkedin.com/in/paulonnen"
    )
    unreachable = ApolloSearchHit(id="d", first_name="Fantome")

    kept, dropped = _drop_unreachable_hits(
        [reachable_email, reachable_phone, reachable_linkedin, unreachable]
    )
    assert kept == [reachable_email, reachable_phone, reachable_linkedin]
    assert dropped == 1


def test_named_hits_without_apollo_flags_are_kept() -> None:
    # Non-Apollo seeds (Pappers legal reps, Brave web hits) carry no availability
    # flag at all. A full name IS an identity, and the registry mandataires are the
    # backbone of the org chart — dropping them for lack of an Apollo flag would
    # trade one blind spot for another.
    from app.routers.phase2_contacts import _drop_unreachable_hits

    pappers = ApolloSearchHit(first_name="Loik", last_name="Segalen", title="Directeur général délégué")
    kept, dropped = _drop_unreachable_hits([pappers])
    assert kept == [pappers] and dropped == 0


def test_contacts_returns_list(client: TestClient) -> None:
    # 2 Apollo hits is below _MIN_CONTACTS_BEFORE_FALLBACK (3), so the router
    # invokes the Brave+Claude fallback. Stub it out (returns nothing) so the
    # count reflects only the Apollo seeds and no real network call fires.
    with (
        patch(
            "app.routers.phase2_contacts.search_people",
            new_callable=AsyncMock,
            return_value=MOCK_CONTACTS,
        ),
        patch(
            "app.routers.phase2_contacts._fallback_brave_claude",
            new_callable=AsyncMock,
            return_value=[],
        ),
    ):
        res = client.post("/phase/2/contacts", json={"company_name": "SNCF"})

    assert res.status_code == 200
    body = res.json()
    assert body["status"] in ("success", "partial_success")
    assert body["data"]["count"] == 2
    assert body["data"]["contacts"][0]["country"] == "France"


def test_contacts_passes_personas_as_titles(client: TestClient, monkeypatch) -> None:
    # #2543.5g est ACTIF par défaut et rejouerait un 3e appel sur ce mock
    # (return_value=[] est en dessous du seuil) ; ce test porte sur le
    # ciblage par titres, pas sur l'élargissement automatique.
    monkeypatch.setattr("app.routers.phase2_contacts._CONTACTS_AUTO_WIDEN_DISABLED", True)
    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        return_value=[],
    ) as mock_search:
        client.post(
            "/phase/2/contacts",
            json={"company_name": "SNCF", "profile_data": {"personas": ["CEO", "CFO"]}},
        )

    # ⚠️ DEUX appels depuis le 28/08, et c'est voulu : la première passe porte
    # les personas, la seconde élargit parce qu'elle n'a rien rendu (0 < 25).
    # Ce test gardait `assert_called_once_with` ; le garder tel quel aurait
    # figé le « 8-10-contacts symptom » dans une garde.
    # #2543.5a — la passe PRIMAIRE porte aussi ``outcome`` (l'out-param qui
    # rapporte l'état de la source) ; ``ANY`` car c'est un objet ``SearchOutcome``
    # frais à chaque appel, pas une valeur comparable par égalité.
    assert mock_search.call_args_list[0].kwargs == {
        "company_name": "SNCF",
        "person_titles": ["CEO", "CFO"],
        "locations": None,
        "seniorities": None,
        "organization_ids": None,
        "organization_domains": None,
        "outcome": ANY,
    }
    assert mock_search.call_count == 2
    assert mock_search.call_args_list[1].kwargs["person_titles"] is None


def test_default_decider_titles_cover_the_buying_committee() -> None:
    # Regression: a pure-IT default title list makes every discovered contact a
    # TECHNICAL_BUYER (Vinci run: 27/27 technical), breaking §4 role coverage and
    # the multi-thread plays. The default list must span economic + procurement +
    # champion, not just technical.
    from app.routers.phase2_contacts import _DEFAULT_DECIDER_TITLES
    from app.services.decision_role import classify_decision_role

    roles = {classify_decision_role(t) for t in _DEFAULT_DECIDER_TITLES}
    assert {"technical", "economic", "procurement", "champion"} <= roles


def test_contacts_scope_narrows_the_search(client: TestClient, monkeypatch) -> None:
    # S6 re-run scope: entity (BU), geo and seniority narrow the Apollo search
    # without redoing the analysis; scope titles override personas.
    # #2543.5g est ACTIF par défaut ; hors périmètre de ce test (ciblage S6).
    monkeypatch.setattr("app.routers.phase2_contacts._CONTACTS_AUTO_WIDEN_DISABLED", True)
    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        return_value=[],
    ) as mock_search:
        client.post(
            "/phase/2/contacts",
            json={
                "company_name": "Société Générale",
                "profile_data": {"personas": ["DSI"]},
                "scope": {
                    "entity": "Boursorama",
                    "titles": ["RSSI", "Head of Cyber"],
                    "geographies": ["France"],
                    "seniorities": ["director", "c_suite"],
                },
            },
        )

    mock_search.assert_called_once_with(
        company_name="Boursorama",
        person_titles=["RSSI", "Head of Cyber"],
        locations=["France"],
        seniorities=["director", "c_suite"],
        organization_ids=None,
        organization_domains=None,
        outcome=ANY,
    )


def test_contacts_scope_by_family_and_level_targets_that_cell(client: TestClient, monkeypatch) -> None:
    # Zone blanche « Cyber × N-1 » cliquée dans la matrice de couverture : on
    # cherche les titres de CETTE case, pas les personas du profil (annexe §6).
    # #2543.5g est ACTIF par défaut ; hors périmètre de ce test.
    monkeypatch.setattr("app.routers.phase2_contacts._CONTACTS_AUTO_WIDEN_DISABLED", True)
    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        return_value=[],
    ) as mock_search:
        client.post(
            "/phase/2/contacts",
            json={
                "company_name": "TF1",
                "profile_data": {"personas": ["DSI"]},
                "scope": {"family": "cyber", "level": "n1"},
            },
        )

    kwargs = mock_search.call_args.kwargs
    assert kwargs["company_name"] == "TF1"
    assert "RSSI" in kwargs["person_titles"]
    assert kwargs["person_titles"] != ["DSI"]
    # Le titre porte déjà le niveau : pas de bande de séniorité en plus (Apollo
    # ANDe les deux et la recherche reviendrait vide).
    assert kwargs["seniorities"] is None


def test_contacts_scope_by_level_alone_searches_the_whole_stratum(client: TestClient) -> None:
    # Un niveau seul (L2 = direction) cherche TOUTE la strate : aucun filtre de
    # titre, donc pas de repli sur les personas du profil.
    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        return_value=[],
    ) as mock_search:
        client.post(
            "/phase/2/contacts",
            json={
                "company_name": "TF1",
                "profile_data": {"personas": ["DSI"]},
                "scope": {"level": "L2"},
            },
        )

    kwargs = mock_search.call_args.kwargs
    assert kwargs["person_titles"] is None
    assert "director" in kwargs["seniorities"]


def test_contacts_explicit_scope_titles_win_over_family(client: TestClient, monkeypatch) -> None:
    # #2543.5g est ACTIF par défaut ; hors périmètre de ce test.
    monkeypatch.setattr("app.routers.phase2_contacts._CONTACTS_AUTO_WIDEN_DISABLED", True)
    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        return_value=[],
    ) as mock_search:
        client.post(
            "/phase/2/contacts",
            json={
                "company_name": "TF1",
                "scope": {"family": "cyber", "level": "n1", "titles": ["Directeur des Achats"]},
            },
        )

    assert mock_search.call_args.kwargs["person_titles"] == ["Directeur des Achats"]


def test_contacts_returns_500_on_missing_key(client: TestClient) -> None:
    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        side_effect=ValueError("APOLLO_API_KEY environment variable is not set"),
    ):
        res = client.post("/phase/2/contacts", json={"company_name": "SNCF"})

    assert res.status_code == 500


def _search_people_reporting(status: "ApolloSearchStatus", total_entries: int | None, contacts: list):
    """Fake ``search_people`` that fills the ``outcome`` out-param the way the
    real function does (see ``SearchOutcome`` in ``apollo.py``) — a plain
    ``AsyncMock(return_value=...)`` never touches it, since the mock replaces
    the whole body."""

    async def _fake(*args: object, **kwargs: object) -> list:
        outcome = kwargs.get("outcome")
        if outcome is not None:
            outcome.status = status
            outcome.total_entries = total_entries
        return contacts

    return _fake


def test_contacts_reports_source_status_and_total_entries(client: TestClient) -> None:
    """#2543.5a — la réponse porte l'état de la source + la population qu'elle
    ANNONCE pour cette recherche, pas seulement ce que le run a retenu."""
    from app.services.apollo import ApolloSearchStatus

    with patch(
        "app.routers.phase2_contacts.search_people",
        side_effect=_search_people_reporting(ApolloSearchStatus.OK, 6, MOCK_CONTACTS),
    ):
        res = client.post("/phase/2/contacts", json={"company_name": "ARQUUS"})

    body = res.json()
    assert body["data"]["sourceStatus"] == "ok"
    assert body["data"]["sourceTotalEntries"] == 6


def test_contacts_reports_plan_blocked_as_a_named_status(client: TestClient) -> None:
    """#2543.5a/#2543.5e(1) — PLAN_BLOCKED n'est ni « ok » ni silencieux : la
    population annoncée reste non mesurée (jamais None -> 0 deviné)."""
    from app.services.apollo import ApolloSearchStatus

    with (
        patch(
            "app.routers.phase2_contacts.search_people",
            side_effect=_search_people_reporting(ApolloSearchStatus.PLAN_BLOCKED, None, []),
        ),
        patch(
            "app.routers.phase2_contacts._fallback_brave_claude",
            new_callable=AsyncMock,
            return_value=[],
        ),
    ):
        res = client.post("/phase/2/contacts", json={"company_name": "ARQUUS"})

    body = res.json()
    assert body["data"]["sourceStatus"] == "plan_blocked"
    assert "sourceTotalEntries" not in body["data"]


def test_contacts_fallback_reports_attempted_and_found_count(client: TestClient) -> None:
    """#2543.5b — la réponse dit si le repli a été tenté et combien il a trouvé."""
    with (
        patch(
            "app.routers.phase2_contacts.search_people",
            new_callable=AsyncMock,
            return_value=[MOCK_CONTACTS[0]],
        ),
        patch(
            "app.routers.phase2_contacts._fallback_brave_claude",
            new_callable=AsyncMock,
            return_value=[
                {"first_name": "Paul", "last_name": "Durand", "title": "CTO", "linkedin_url": "", "city": "", "country": "France"}
            ],
        ),
    ):
        res = client.post("/phase/2/contacts", json={"company_name": "SNCF"})

    body = res.json()
    # ``exclude_none=True`` sur l'enveloppe retire les clés None, y compris à
    # l'intérieur d'un sous-objet — absent, jamais `null` explicite.
    assert body["data"]["fallback"]["attempted"] is True
    assert body["data"]["fallback"]["foundCount"] == 1
    assert "failure" not in body["data"]["fallback"]


def test_contacts_fallback_not_attempted_is_reported(client: TestClient) -> None:
    """Stock déjà suffisant : le repli n'a jamais été tenté, jamais un
    ``foundCount: 0`` inventé pour un geste qui n'a pas eu lieu."""
    plentiful = [
        ApolloSearchHit(
            first_name=f"Prenom{i}",
            last_name=f"Nom{i}",
            title="Directeur",
            organization_name="SNCF",
            linkedin_url=f"https://linkedin.com/in/prenom{i}",
            city="Paris",
            country="France",
        )
        for i in range(8)  # au-dessus du seuil de repli (5), tous distincts
    ]
    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        return_value=plentiful,
    ):
        res = client.post("/phase/2/contacts", json={"company_name": "SNCF"})

    body = res.json()
    assert body["data"]["fallback"]["attempted"] is False
    assert "foundCount" not in body["data"]["fallback"]
    assert "failure" not in body["data"]["fallback"]


def test_contacts_fallback_failure_is_named_not_swallowed(client: TestClient) -> None:
    """#2543.5b — un ``except Exception`` qui journalise sans le dire est
    interdit : l'échec du repli se NOMME dans la réponse, et la collecte
    continue (200, pas de crash)."""
    with (
        patch(
            "app.routers.phase2_contacts.search_people",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch(
            "app.routers.phase2_contacts._fallback_brave_claude",
            new_callable=AsyncMock,
            side_effect=RuntimeError("brave timeout"),
        ),
    ):
        res = client.post("/phase/2/contacts", json={"company_name": "SNCF"})

    assert res.status_code == 200
    body = res.json()
    assert body["data"]["fallback"]["attempted"] is True
    assert "foundCount" not in body["data"]["fallback"]
    assert "brave timeout" in body["data"]["fallback"]["failure"]


def test_contacts_fallback_not_attempted_never_poses_null_keys() -> None:
    """#2755.1 — SOPRA STERIA GROUP : `raw_analysis.org.orgGraph.coverage.fallback`
    portait `foundCount: null, failure: null` (fallback non tenté), ce que le
    contrat Zod refusait avant #2755.1. Cette clé null venait du payload
    INTERNE que `_contacts` construit — celui que le pipeline graphe stocke
    tel quel, SANS l'`exclude_none` appliqué à l'enveloppe HTTP (voir
    `test_contacts_fallback_not_attempted_is_reported` ci-dessus, qui ne
    voit que le JSON déjà nettoyé). Le payload interne ne doit donc plus
    poser ces clés à `None` — jamais les poser plutôt que compter sur un
    nettoyage en aval que le pipeline graphe n'applique pas."""
    from app.routers.phase2_contacts import _contacts

    plentiful = [
        ApolloSearchHit(
            first_name=f"Prenom{i}",
            last_name=f"Nom{i}",
            title="Directeur",
            organization_name="SNCF",
        )
        for i in range(8)  # au-dessus du seuil de repli (5) : jamais tenté
    ]
    req = ContactsRequest(company_name="SNCF", prefetched_hits=plentiful)
    resp = asyncio.run(_contacts(req))

    assert resp.data["fallback"]["attempted"] is False
    assert "foundCount" not in resp.data["fallback"]
    assert "failure" not in resp.data["fallback"]


def test_contacts_fallback_when_apollo_insufficient(client: TestClient) -> None:
    with (
        patch(
            "app.routers.phase2_contacts.search_people",
            new_callable=AsyncMock,
            return_value=[MOCK_CONTACTS[0]],
        ),
        patch(
            "app.routers.phase2_contacts._fallback_brave_claude",
            new_callable=AsyncMock,
            return_value=[
                {
                    "first_name": "Paul",
                    "last_name": "Durand",
                    "title": "CTO",
                    "linkedin_url": "https://linkedin.com/in/pauldurand",
                    "city": "Paris",
                    "country": "France",
                    "source": "brave_search",
                },
            ],
        ) as mock_fallback,
    ):
        res = client.post("/phase/2/contacts", json={"company_name": "SNCF"})
    assert res.status_code == 200
    assert res.json()["data"]["count"] >= 2
    mock_fallback.assert_called_once()


def test_contacts_fallback_dedupes_same_full_name(client: TestClient) -> None:
    with (
        patch(
            "app.routers.phase2_contacts.search_people",
            new_callable=AsyncMock,
            return_value=[MOCK_CONTACTS[0]],
        ),
        patch(
            "app.routers.phase2_contacts._fallback_brave_claude",
            new_callable=AsyncMock,
            return_value=[
                {
                    "first_name": "Jean",
                    "last_name": "Dupont",
                    "title": "DSI Groupe",
                    "linkedin_url": "",
                    "city": "Paris",
                    "country": "France",
                    "source": "brave_search",
                },
            ],
        ),
    ):
        res = client.post("/phase/2/contacts", json={"company_name": "SNCF"})
    assert res.status_code == 200
    contacts = res.json()["data"]["contacts"]
    jean_contacts = [c for c in contacts if c["fullName"].lower() == "jean dupont"]
    assert len(jean_contacts) == 1


# === Apollo contacts prefetch (latency optimization) ===

# Three hits keep the count ≥ _MIN_CONTACTS_BEFORE_FALLBACK so the Brave+Claude
# fallback never fires and no test needs a network stub for it.
PREFETCH_HITS: list[ApolloSearchHit] = [
    ApolloSearchHit(first_name="Anne", last_name="Roy", title="DSI", organization_name="SNCF"),
    ApolloSearchHit(first_name="Luc", last_name="Blanc", title="CTO", organization_name="SNCF"),
    ApolloSearchHit(first_name="Eva", last_name="Noir", title="DAF", organization_name="SNCF"),
]


def test_contacts_uses_prefetched_hits_without_searching(monkeypatch) -> None:
    # When the graph handed the phase pre-searched Apollo hits, _contacts must
    # skip the (already-run) live search entirely.
    from app.routers.phase2_contacts import _contacts

    # 3 hits <= seuil : #2543.5g (ACTIF par défaut) élargirait sinon — hors
    # périmètre de ce test (le préchargement doit sauter la recherche LIVE).
    monkeypatch.setattr("app.routers.phase2_contacts._CONTACTS_AUTO_WIDEN_DISABLED", True)
    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
    ) as mock_search:
        req = ContactsRequest(company_name="SNCF", prefetched_hits=PREFETCH_HITS)
        resp = asyncio.run(_contacts(req))

    mock_search.assert_not_called()
    names = {c["fullName"] for c in resp.data["contacts"]}
    assert {"Anne Roy", "Luc Blanc", "Eva Noir"} <= names
    assert resp.data["count"] == 3


def test_contacts_reports_out_of_scope_drops_to_the_dossier() -> None:
    # P0-03 : les contacts d'une entité hors périmètre étaient retirés en silence.
    # La réponse porte maintenant le décompte + le détail par entité, pour que
    # l'écran puisse dire « X écartés (hors périmètre) ».
    from app.routers.phase2_contacts import _contacts

    hits = [
        *PREFETCH_HITS,
        ApolloSearchHit(first_name="Koffi", last_name="Y", title="DSI", organization_name="SNCF Côte d'Ivoire"),
    ]
    req = ContactsRequest(
        company_name="SNCF",
        prefetched_hits=hits,
        out_of_scope_entities=["SNCF Côte d'Ivoire"],
    )
    resp = asyncio.run(_contacts(req))

    assert resp.data["count"] == 3
    assert resp.data["outOfScope"] == {
        "dropped": 1,
        "entities": [{"name": "SNCF Côte d'Ivoire", "count": 1}],
    }


def test_contacts_omits_out_of_scope_key_when_nothing_dropped() -> None:
    # Rétro-compatibilité : sans exclusion, la réponse est inchangée — pas de clé
    # à zéro, donc rien à afficher et rien qui écrase un dossier existant.
    from app.routers.phase2_contacts import _contacts

    req = ContactsRequest(company_name="SNCF", prefetched_hits=PREFETCH_HITS)
    resp = asyncio.run(_contacts(req))

    assert "outOfScope" not in resp.data


def test_contacts_empty_prefetch_is_a_genuine_zero_hit(monkeypatch) -> None:
    # An empty list (not None) means the prefetch genuinely found 0 contacts —
    # still skip the live search, and let the < 3 Brave+Claude fallback run.
    from app.routers.phase2_contacts import _contacts

    # #2543.5g (ACTIF par défaut) élargirait sinon un stock resté à 0 — hors
    # périmètre de ce test (skip de la recherche LIVE sur préchargement vide).
    monkeypatch.setattr("app.routers.phase2_contacts._CONTACTS_AUTO_WIDEN_DISABLED", True)
    with (
        patch(
            "app.routers.phase2_contacts.search_people",
            new_callable=AsyncMock,
        ) as mock_search,
        patch(
            "app.routers.phase2_contacts._fallback_brave_claude",
            new_callable=AsyncMock,
            return_value=[],
        ) as mock_fallback,
    ):
        req = ContactsRequest(company_name="SNCF", prefetched_hits=[])
        resp = asyncio.run(_contacts(req))

    mock_search.assert_not_called()
    mock_fallback.assert_called_once()
    assert resp.data["count"] == 0


def test_contacts_searches_live_when_no_prefetch(monkeypatch) -> None:
    # prefetched_hits=None (the default) keeps the existing live-search path.
    from app.routers.phase2_contacts import _contacts

    # 3 hits <= seuil : #2543.5g (ACTIF par défaut) ajouterait un 3e appel —
    # hors périmètre de ce test (le chemin LIVE, pas l'élargissement).
    monkeypatch.setattr("app.routers.phase2_contacts._CONTACTS_AUTO_WIDEN_DISABLED", True)
    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        return_value=PREFETCH_HITS,
    ) as mock_search:
        req = ContactsRequest(company_name="SNCF", profile_data={"personas": ["DSI"]})
        resp = asyncio.run(_contacts(req))

    # ⚠️ DEUX appels depuis le 28/08 : PREFETCH_HITS ne rend que 3 personnes,
    # donc sous le seuil d'élargissement (25) la bande de séniorité est rejouée.
    # Ce test posait `assert_called_once` ; le laisser tel quel aurait gardé le
    # défaut au lieu de la règle. Ce qu'il garde vraiment — le chemin live est
    # emprunté quand il n'y a pas de préchargement — est intact.
    assert mock_search.call_count == 2
    assert mock_search.call_args_list[0].kwargs["person_titles"] == ["DSI"]
    assert mock_search.call_args_list[1].kwargs["person_titles"] is None
    assert resp.data["count"] == 3


def test_prefetch_apollo_hits_uses_personas_as_titles() -> None:
    from app.routers.phase2_contacts import prefetch_apollo_hits

    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        return_value=[],
    ) as mock_search:
        asyncio.run(prefetch_apollo_hits("SNCF", {"personas": ["CEO", "CFO"]}))

    mock_search.assert_called_once_with(
        company_name="SNCF",
        person_titles=["CEO", "CFO"],
        locations=None,
        seniorities=None,
        organization_domains=None,
    )


def test_prefetch_apollo_hits_defaults_to_wide_seniority_search() -> None:
    # No personas → go WIDE by seniority band (whole management layer), NOT the
    # short IT title list. A big account then yields the hundreds of deciders
    # Apollo holds instead of the ~10 with one of a dozen exact French titles.
    # No title filter is sent (it would AND with the bands and re-narrow).
    #
    # No `max_pages` either: the wide search used to stop at 5 pages (500 people)
    # while Apollo held 1379 for Dassault Aviation. People-Search costs nothing,
    # so the only remaining bound is the shared safety ceiling in
    # ``apollo.APOLLO_SEARCH_MAX_PAGES`` — and the loop stops on `total` anyway.
    from app.routers.phase2_contacts import (
        _DEFAULT_DECIDER_SENIORITIES,
        prefetch_apollo_hits,
    )

    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        return_value=[],
    ) as mock_search:
        asyncio.run(prefetch_apollo_hits("SNCF", {}))

    mock_search.assert_called_once_with(
        company_name="SNCF",
        person_titles=None,
        locations=None,
        seniorities=_DEFAULT_DECIDER_SENIORITIES,
        organization_domains=None,
    )


def test_prefetch_apollo_hits_anchors_on_the_account_domain() -> None:
    """#1101 : le domaine du compte est connu dès t=0 — c'est une ancre d'org
    EXACTE là où le nom est un rapprochement flou. L'ancrer ici ne coûte rien et
    évite le second appel."""
    from app.routers.phase2_contacts import prefetch_apollo_hits

    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        return_value=[],
    ) as mock_search:
        asyncio.run(prefetch_apollo_hits("MUTUELLE UNEO", {}, ["uneo.fr"]))

    assert mock_search.call_args.kwargs["organization_domains"] == ["uneo.fr"]


def test_contacts_live_no_personas_goes_wide_by_seniority(monkeypatch) -> None:
    # The live search path (no prefetch, no scope, no personas) must mirror the
    # prefetch: wide seniority-band search, no title filter, no page cap.
    from app.routers.phase2_contacts import (
        _DEFAULT_DECIDER_SENIORITIES,
        _contacts,
    )

    # 3 hits <= seuil : #2543.5g (ACTIF par défaut) ajouterait un 2e appel —
    # hors périmètre de ce test (le ciblage par bande large, pas l'élargissement).
    monkeypatch.setattr("app.routers.phase2_contacts._CONTACTS_AUTO_WIDEN_DISABLED", True)
    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        return_value=PREFETCH_HITS,
    ) as mock_search:
        req = ContactsRequest(company_name="SNCF")
        asyncio.run(_contacts(req))

    mock_search.assert_called_once_with(
        company_name="SNCF",
        person_titles=None,
        locations=None,
        seniorities=_DEFAULT_DECIDER_SENIORITIES,
        organization_ids=None,
        organization_domains=None,
        outcome=ANY,
    )


# === Enrich endpoint ===


from app.models.contacts import ApolloEnrichmentResult

MOCK_ENRICHMENT = ApolloEnrichmentResult(
    matched=True,
    email="jean.dupont@sncf.fr",
    email_status="verified",
    phone="+33612345678",
    linkedin_url="https://linkedin.com/in/jeandupont",
    title="DSI",
    organization_name="SNCF",
    city="Paris",
    country="France",
)


def test_enrich_returns_enriched_data(client: TestClient) -> None:
    with patch(
        "app.routers.phase2_contacts.enrich_person_with_fallback",
        new_callable=AsyncMock,
        return_value=MOCK_ENRICHMENT,
    ):
        res = client.post(
            "/phase/2/enrich",
            json={
                "first_name": "Jean",
                "last_name": "Dupont",
                "organization_name": "SNCF",
            },
        )

    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert body["data"]["email"] == "jean.dupont@sncf.fr"
    assert body["data"]["phone"] == "+33612345678"
    assert body["data"]["matched"] is True


def test_enrich_returns_502_on_api_error(client: TestClient) -> None:
    with patch(
        "app.routers.phase2_contacts.enrich_person_with_fallback",
        new_callable=AsyncMock,
        side_effect=ValueError("Apollo enrichment failed: 402"),
    ):
        res = client.post(
            "/phase/2/enrich",
            json={
                "first_name": "Jean",
                "last_name": "Dupont",
                "organization_name": "SNCF",
            },
        )

    assert res.status_code == 502


def test_enrich_accepts_name_without_last_name(client: TestClient) -> None:
    """Mononym contacts (single-word full_name) have no last name. first_name
    + organization_name is enough for Apollo to attempt a match."""
    with patch(
        "app.routers.phase2_contacts.enrich_person_with_fallback",
        new_callable=AsyncMock,
        return_value=MOCK_ENRICHMENT,
    ):
        res = client.post(
            "/phase/2/enrich",
            json={"first_name": "Beshara", "organization_name": "Acme"},
        )

    assert res.status_code == 200
    assert res.json()["data"]["matched"] is True


def test_enrich_validates_required_fields(client: TestClient) -> None:
    # first_name alone (no org, no linkedin) is still an insufficient match key.
    res = client.post("/phase/2/enrich", json={"first_name": "Jean"})
    assert res.status_code == 422


# ── #2727 — POST /phase/2/people/search-by-name ──────────────────────────────

MARION_HIT = ApolloSearchHit(
    id="apollo-1",
    first_name="Marion",
    last_name="Sagnard",
    title="Responsable Recrutement",
    organization_name="Bedrock",
    city="Paris",
    country="France",
)


def test_search_by_name_returns_homonyms(client: TestClient) -> None:
    with patch(
        "app.routers.phase2_contacts.search_people_by_name",
        new_callable=AsyncMock,
        return_value=([MARION_HIT], ApolloSearchStatus.OK),
    ) as mocked:
        res = client.post("/phase/2/people/search-by-name", json={"full_name": "Marion Sagnard"})

    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert body["status"] == "ok"
    assert body["hits"][0]["organization_name"] == "Bedrock"
    mocked.assert_called_once_with(full_name="Marion Sagnard", organization_name=None)


def test_search_by_name_reports_a_typed_status_when_unconfigured(client: TestClient) -> None:
    # #2727 critère — l'écran dit explicitement pourquoi elle est introuvable,
    # jamais un 500 ni une liste vide muette.
    with patch(
        "app.routers.phase2_contacts.search_people_by_name",
        new_callable=AsyncMock,
        return_value=([], ApolloSearchStatus.UNCONFIGURED),
    ):
        res = client.post("/phase/2/people/search-by-name", json={"full_name": "Marion Sagnard"})

    assert res.status_code == 200
    body = res.json()
    assert body["hits"] == []
    assert body["status"] == "unconfigured"


def test_search_by_name_threads_organization_name(client: TestClient) -> None:
    with patch(
        "app.routers.phase2_contacts.search_people_by_name",
        new_callable=AsyncMock,
        return_value=([MARION_HIT], ApolloSearchStatus.OK),
    ) as mocked:
        client.post(
            "/phase/2/people/search-by-name",
            json={"full_name": "Marion Sagnard", "organization_name": "Bedrock"},
        )

    mocked.assert_called_once_with(full_name="Marion Sagnard", organization_name="Bedrock")


def test_search_by_name_cascade_flag_runs_the_multi_source_cascade(client: TestClient) -> None:
    # #4386 — le panneau Découvrir passe `cascade=true` : la réponse porte les
    # familles de sources interrogées et, par résultat, ses sources + l'indice en mots.
    from app.models.contacts import PersonNameSearchHit, PersonNameSourceQueried
    from app.services.person_name_search import PersonNameSearchOutcome

    outcome = PersonNameSearchOutcome(
        hits=[
            PersonNameSearchHit(
                id="web:linkedin.com/in/theo-haddad",
                first_name="Théo",
                last_name="Haddad",
                organization_name="BELLUM AI",
                linkedin_url="https://fr.linkedin.com/in/theo-haddad",
                sources=["legal_registry", "web"],
                match="name_and_company",
            )
        ],
        status="ok",
        sources_queried=[PersonNameSourceQueried(family="legal_registry", outcome="found", count=1)],
    )
    with (
        patch(
            "app.routers.phase2_contacts.search_person_by_name", new_callable=AsyncMock, return_value=outcome
        ) as cascade,
        patch("app.routers.phase2_contacts.search_people_by_name", new_callable=AsyncMock) as legacy,
    ):
        res = client.post(
            "/phase/2/people/search-by-name",
            json={"full_name": "Theo Haddad", "organization_name": "Bellum", "cascade": True},
        )

    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["hits"][0]["last_name"] == "Haddad"
    assert body["hits"][0]["sources"] == ["legal_registry", "web"]
    assert body["hits"][0]["match"] == "name_and_company"
    assert body["sources_queried"] == [{"family": "legal_registry", "outcome": "found", "count": 1}]
    cascade.assert_awaited_once_with(full_name="Theo Haddad", organization_name="Bellum")
    legacy.assert_not_called()


def test_search_by_name_without_cascade_keeps_the_legacy_shape(client: TestClient) -> None:
    with patch(
        "app.routers.phase2_contacts.search_people_by_name",
        new_callable=AsyncMock,
        return_value=([MARION_HIT], ApolloSearchStatus.OK),
    ):
        body = client.post("/phase/2/people/search-by-name", json={"full_name": "Marion Sagnard"}).json()
    assert body["hits"][0]["id"] == "apollo-1"
    assert body["sources_queried"] == []


def test_search_by_name_validates_required_field(client: TestClient) -> None:
    res = client.post("/phase/2/people/search-by-name", json={})
    assert res.status_code == 422


# ── L'ancre d'org Apollo (#1101, #1102) ──────────────────────────────────────
#
# « Bellum n'a trouvé qu'un seul contact sur UNEO. Il ne me donne même pas la
# DSI (Caroline JAOUEN) qui a bien son LinkedIn à jour. »
#
# `search_people` déclare `organization_ids` / `organization_domains` depuis le
# retour Théo P0, et son docstring écrit noir sur blanc que « le libellé d'entité
# brouillon ne doit JAMAIS être la seule ancre ». Aucun appelant du service IA ne
# les passait : le pipeline scopait Apollo sur « MUTUELLE UNEO » en texte libre.
# La correction avait été faite pour le bouton « Enrichir » d'une fiche ; le
# chemin du RUN, lui, est resté sur le nom.


def test_live_search_is_anchored_on_the_apollo_org(client: TestClient) -> None:
    from app.routers.phase2_contacts import _contacts

    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        return_value=MOCK_CONTACTS,
    ) as mock_search:
        req = ContactsRequest(
            company_name="MUTUELLE UNEO",
            organization_ids=["5f2b0a1c9d"],
            organization_domains=["uneo.fr"],
        )
        asyncio.run(_contacts(req))

    kwargs = mock_search.call_args.kwargs
    assert kwargs["organization_ids"] == ["5f2b0a1c9d"]
    assert kwargs["organization_domains"] == ["uneo.fr"]


def test_an_anchored_pass_completes_a_thin_name_only_prefetch(monkeypatch) -> None:
    """Le préchargement tourne EN PARALLÈLE de la recherche, donc avant que
    l'identité Apollo du compte ne soit résolue : il ne peut chercher que par
    nom. Quand la phase 1 a ensuite rendu une ancre, on repasse — People-Search
    ne facture aucun crédit par contact, la seule dépense est de la latence — et
    on FUSIONNE. Sans quoi l'ancre résolue ne sert jamais au run qui l'a payée.
    """
    from app.routers.phase2_contacts import _contacts

    # 4 hits après fusion <= seuil : #2543.5g (ACTIF par défaut) ajouterait un
    # 2e appel — hors périmètre de ce test (la repasse ancrée, pas l'élargissement).
    monkeypatch.setattr("app.routers.phase2_contacts._CONTACTS_AUTO_WIDEN_DISABLED", True)
    anchored = [
        ApolloSearchHit(
            id="apollo-caroline",
            first_name="Caroline",
            last_name="Jaouen",
            title="Directrice des Systèmes d'Information",
            organization_name="Unéo",
            linkedin_url="https://linkedin.com/in/carolinejaouen",
        ),
    ]
    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        return_value=anchored,
    ) as mock_search:
        req = ContactsRequest(
            company_name="MUTUELLE UNEO",
            # #4928.1 — des résultats d'un AUTRE employeur (SNCF) sont écartés par le garde : le préchargement
            # de ce test est celui du compte.
            prefetched_hits=[h.model_copy(update={"organization_name": "Unéo"}) for h in PREFETCH_HITS],
            organization_ids=["5f2b0a1c9d"],
        )
        resp = asyncio.run(_contacts(req))

    mock_search.assert_called_once()
    names = {c["fullName"] for c in resp.data["contacts"]}
    # Les trois du préchargement ET la personne que seule l'ancre ramène.
    assert {"Anne Roy", "Luc Blanc", "Eva Noir", "Caroline Jaouen"} <= names


def test_the_anchored_pass_never_duplicates_someone_already_found() -> None:
    from app.routers.phase2_contacts import _contacts

    duplicate = ApolloSearchHit(**PREFETCH_HITS[0].model_dump())
    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        return_value=[duplicate],
    ):
        req = ContactsRequest(
            company_name="SNCF",
            prefetched_hits=PREFETCH_HITS,
            organization_domains=["sncf.fr"],
        )
        resp = asyncio.run(_contacts(req))

    assert resp.data["count"] == len(PREFETCH_HITS)


def test_no_anchor_means_no_second_search(monkeypatch) -> None:
    """Sans ancre, repasser ne ferait que rejouer la MÊME recherche par nom :
    de la latence pour zéro résultat neuf."""
    from app.routers.phase2_contacts import _contacts

    # 3 hits <= seuil : #2543.5g (ACTIF par défaut) appellerait sinon
    # search_people pour la passe d'élargissement — hors périmètre de ce test.
    monkeypatch.setattr("app.routers.phase2_contacts._CONTACTS_AUTO_WIDEN_DISABLED", True)
    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
    ) as mock_search:
        req = ContactsRequest(company_name="SNCF", prefetched_hits=PREFETCH_HITS)
        asyncio.run(_contacts(req))

    mock_search.assert_not_called()


# ──────────────────────────────────────────────────────────────────────
#  L'ÉLARGISSEMENT — un filtre de titres qui ne rend presque rien se rejoue
#  en bande de séniorité, parce que People-Search ne coûte AUCUN crédit.
# ──────────────────────────────────────────────────────────────────────
#
# Mesuré le 28/08/2026 sur le compte SAFRAN AIRCRAFT ENGINES (issue #1189) :
# 8 contacts, en 228 ms, un seul appel, zéro pagination. Apollo avait résolu le
# GROUPE (Safran S.A., ~92 000 personnes) et le filtre de titres l'a réduit à 8.
#
# Le code nommait déjà la cause (l.542-547 : « the root cause of the
# 8-10-contacts symptom ») et prévoyait la bande large — mais SEULEMENT quand
# aucun titre n'est posé, puisque Apollo ANDe titres et séniorité. Un profil
# avec personas ne bénéficie donc jamais du garde-fou.
#
# Le repli Brave+Claude, lui, ne se déclenche que sous 5. Sur les 126 comptes de
# la base : 14 % sont sous 5 (repli OK), et **15 % sont entre 5 et 20** — trop
# peu pour être exploitables, trop pour déclencher le secours. Médiane : 50.


def test_un_filtre_de_titres_pauvre_est_rejoue_en_bande_large(client: TestClient) -> None:
    """Deux appels : les titres d'abord, la strate de direction ensuite."""
    maigre = [
        ApolloSearchHit(
            first_name="A", last_name="B", title="Property Manager",
            organization_name="SAFRAN", linkedin_url="https://linkedin.com/in/ab",
        )
    ]
    large = [
        ApolloSearchHit(
            first_name=f"P{i}", last_name="X", title="Directeur",
            organization_name="SAFRAN", linkedin_url=f"https://linkedin.com/in/p{i}",
        )
        for i in range(30)
    ]
    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        side_effect=[maigre, large],
    ) as mock_search:
        r = client.post(
            "/phase/2/contacts",
            json={"company_name": "SAFRAN", "profile_data": {"personas": ["Data Officer"]}},
        )

    assert r.status_code == 200
    assert mock_search.call_count == 2, "la recherche large n'a pas été rejouée"

    premier = mock_search.call_args_list[0].kwargs
    second = mock_search.call_args_list[1].kwargs
    assert premier["person_titles"] == ["Data Officer"]
    assert premier["seniorities"] is None
    # ⚠️ Apollo ANDe titres et séniorité : la seconde passe ne DOIT pas porter de
    # titres, sinon elle re-rétrécit exactement comme la première.
    assert second["person_titles"] is None
    assert second["seniorities"], "la bande de séniorité doit porter la seconde passe"
    assert second["company_name"] == premier["company_name"]


def test_la_passe_dirigeants_part_meme_quand_la_recherche_rend_deja_assez(client: TestClient) -> None:
    """#4923.2 (REVIENT SUR l'ancien « un compte bien servi ne paie pas une seconde
    latence ») — sur un grand compte, 40 DSI au titre exact ne disent rien du Head of
    Data : la passe dirigeants (c_suite, vp, head, director, SANS titres) part TOUJOURS
    après les personas. Le test sait dire NON : si le seuil revient, il casse."""
    assez = [
        ApolloSearchHit(
            first_name=f"P{i}", last_name="X", title="DSI",
            organization_name="SNCF", linkedin_url=f"https://linkedin.com/in/p{i}",
        )
        for i in range(40)
    ]
    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        return_value=assez,
    ) as mock_search:
        client.post(
            "/phase/2/contacts",
            json={"company_name": "SNCF", "profile_data": {"personas": ["DSI"]}},
        )
    assert mock_search.call_count == 2
    second = mock_search.call_args_list[1].kwargs
    assert second["person_titles"] is None
    assert second["seniorities"] == ["c_suite", "vp", "head", "director"]
    assert second["exhaust_anchors"] is True  # #4923.9 — toutes les ancres sur cette passe
    assert "exhaust_anchors" not in mock_search.call_args_list[0].kwargs  # la recherche générale garde sa cascade


def test_pas_d_elargissement_quand_aucun_titre_n_a_ete_pose(client: TestClient, monkeypatch) -> None:
    """Sans titres, la bande large portait DÉJÀ la première passe — la rejouer
    serait rejouer la même requête à l'identique."""
    # 0 hit <= seuil : #2543.5g (ACTIF par défaut) ajouterait un 2e appel —
    # hors périmètre de ce test (l'élargissement PAR TITRES, pas l'auto-widen).
    monkeypatch.setattr("app.routers.phase2_contacts._CONTACTS_AUTO_WIDEN_DISABLED", True)
    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        return_value=[],
    ) as mock_search:
        client.post("/phase/2/contacts", json={"company_name": "SNCF"})
    assert mock_search.call_count == 1
    assert mock_search.call_args_list[0].kwargs["person_titles"] is None


def test_l_elargissement_fusionne_sans_doublon(client: TestClient) -> None:
    from app.services.criteria_referential import CRITERIA_WIDEN_MIN_RESULTS

    """La même personne dans les deux passes ne compte qu'une fois."""
    commun = ApolloSearchHit(
        first_name="Jean", last_name="Dupont", title="DSI",
        organization_name="SAFRAN", linkedin_url="https://linkedin.com/in/jeandupont",
    )
    autres = [
        ApolloSearchHit(
            first_name=f"P{i}", last_name="X", title="Directeur",
            organization_name="SAFRAN", linkedin_url=f"https://linkedin.com/in/p{i}",
        )
        for i in range(CRITERIA_WIDEN_MIN_RESULTS)
    ]
    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        side_effect=[[commun], [commun, *autres]],
    ):
        r = client.post(
            "/phase/2/contacts",
            json={"company_name": "SAFRAN", "profile_data": {"personas": ["DSI"]}},
        )
    corps = r.json()["data"]
    noms = [c["fullName"] for c in corps["contacts"]]
    assert noms.count("Jean Dupont") == 1, noms
    # 1 de la passe étroite + N nouveaux de la large = N + 1, pas N + 2.
    assert corps["count"] == CRITERIA_WIDEN_MIN_RESULTS + 1, corps["count"]


# ── #2290.4/.5/.6/.7/.8/.9 — provenance de correspondance sur chaque résultat ──


def test_theme_scope_reports_direct_term_and_family_on_results() -> None:
    """#2290.4/.5/.6 — un résultat trouvé via un thème porte sa provenance :
    famille, terme direct déclencheur, chemin exact (pas élargi)."""
    from app.routers.phase2_contacts import _contacts

    hit = ApolloSearchHit(id="apollo-1", first_name="Yann", last_name="K", title="RSSI", organization_name="TF1")
    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        return_value=[hit],
    ):
        req = ContactsRequest(company_name="TF1", scope={"theme": "cyber"})
        resp = asyncio.run(_contacts(req))

    prov = resp.data["contacts"][0]["matchProvenance"]
    assert prov["family"] == "cyber"
    assert prov["matchedTerm"] == "cyber"
    assert prov["matchedVia"] == "direct"
    assert prov["widened"] is False
    assert prov["dictionaryVersion"]


def test_theme_scope_reports_acronym_provenance() -> None:
    """#2290.4/.5 — un thème tapé comme acronyme (RSSI) le dit, distinct d'un
    terme direct ou d'un synonyme générique (GA-26 : une seule notion)."""
    from app.routers.phase2_contacts import _contacts

    hit = ApolloSearchHit(id="apollo-2", first_name="Awa", last_name="D", title="CISO", organization_name="TF1")
    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        return_value=[hit],
    ):
        req = ContactsRequest(company_name="TF1", scope={"theme": "RSSI"})
        resp = asyncio.run(_contacts(req))

    prov = resp.data["contacts"][0]["matchProvenance"]
    assert prov["family"] == "cyber"
    assert prov["matchedVia"] == "acronym"
    assert prov["matchedTerm"] == "rssi"


def test_general_search_reports_theme_coverage_without_extra_calls_by_default(monkeypatch) -> None:
    """#2290.2 — une recherche générale mesure la couverture des familles,
    SANS appel Apollo supplémentaire (la relance #2290.3 est opt-in, cf. test
    ci-dessous) : le comportement réseau reste inchangé par défaut."""
    from app.routers.phase2_contacts import _contacts

    # 1 hit <= seuil : #2543.5g (ACTIF par défaut) ajouterait un 2e appel —
    # hors périmètre de ce test (la couverture des thèmes, pas l'auto-widen).
    monkeypatch.setattr("app.routers.phase2_contacts._CONTACTS_AUTO_WIDEN_DISABLED", True)
    hit = ApolloSearchHit(id="apollo-3", first_name="Ana", last_name="D", title="RSSI", organization_name="TF1")
    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        return_value=[hit],
    ) as mock_search:
        req = ContactsRequest(company_name="TF1")
        resp = asyncio.run(_contacts(req))

    assert mock_search.call_count == 1
    coverage = resp.data["themeCoverage"]
    assert coverage["families"]["cyber"]["status"] == "couverte_tete"
    assert coverage["families"]["cloud"]["status"] == "non_couverte"
    assert "matchProvenance" not in resp.data["contacts"][0]  # pas de thème : non mesuré, pas un "exact" inventé


def test_auto_theme_relaunch_marks_widened_results_never_exact(monkeypatch) -> None:
    """#2290.3/.8 — activée, la relance automatique sur une famille non
    couverte ramène des contacts marqués `widened: true` : un résultat élargi
    n'est JAMAIS présenté comme une correspondance exacte au dictionnaire.
    C'est le test qui sait dire NON : si un futur changement fait passer un
    résultat élargi pour exact, cette assertion casse."""
    from app.routers.phase2_contacts import _contacts

    monkeypatch.setattr("app.routers.phase2_contacts._AUTO_THEME_RELAUNCH_ENABLED", True)

    general_hit = ApolloSearchHit(
        id="general-1", first_name="Ana", last_name="D", title="RSSI", organization_name="TF1"
    )
    relaunch_hit = ApolloSearchHit(
        id="relaunch-1", first_name="Rui", last_name="M", title="Acheteur IT", organization_name="TF1"
    )

    async def fake_search_people(**kwargs: Any) -> list[ApolloSearchHit]:
        if kwargs.get("person_titles") is None:
            return [general_hit]
        return [relaunch_hit]

    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        side_effect=fake_search_people,
    ):
        req = ContactsRequest(company_name="TF1", organization_ids=["anchor-1"])
        resp = asyncio.run(_contacts(req))

    by_name = {c["fullName"]: c for c in resp.data["contacts"]}
    # Non mesuré (recherche générale, aucun thème) — jamais un faux "exact".
    assert "matchProvenance" not in by_name["Ana D"]
    relaunched = by_name["Rui M"]
    assert relaunched["matchProvenance"]["widened"] is True
    assert relaunched["matchProvenance"]["matchedVia"] == "family"
    assert resp.data["themeCoverage"]["dictionaryVersion"]


# #2655.1 — la relance automatique par famille (#2290.3) reconstruit ses
# propres kwargs et figeait `locations` à `None`, jetant une géographie que le
# commercial avait explicitement posée au scope (S6 re-run) : la recherche
# primaire ET l'élargissement de bande la respectaient déjà, seule cette
# troisième passe la perdait.
def test_auto_theme_relaunch_keeps_the_scoped_geographies(monkeypatch) -> None:
    """Le test qui sait dire NON : remettre `locations=None` en dur ici fait
    échouer l'assertion sur le kwarg vu par la relance."""
    from app.routers.phase2_contacts import _contacts

    monkeypatch.setattr("app.routers.phase2_contacts._AUTO_THEME_RELAUNCH_ENABLED", True)

    general_hit = ApolloSearchHit(
        id="general-3", first_name="Ana", last_name="D", title="RSSI", organization_name="TF1"
    )
    relaunch_hit = ApolloSearchHit(
        id="relaunch-3", first_name="Rui", last_name="M", title="Acheteur IT", organization_name="TF1"
    )
    seen_locations: list[Any] = []

    async def fake_search_people(**kwargs: Any) -> list[ApolloSearchHit]:
        if kwargs.get("person_titles") is None:
            return [general_hit]
        seen_locations.append(kwargs.get("locations"))
        return [relaunch_hit]

    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        side_effect=fake_search_people,
    ):
        req = ContactsRequest(
            company_name="TF1",
            organization_ids=["anchor-1"],
            scope=ContactScope(geographies=["France"]),
        )
        resp = asyncio.run(_contacts(req))

    assert resp.data["contacts"]  # la relance a bien eu lieu
    assert seen_locations  # au moins une famille non couverte a déclenché une relance
    assert all(loc == ["France"] for loc in seen_locations)


def test_auto_theme_relaunch_is_active_by_default_and_targets_head_roles(monkeypatch) -> None:
    """#4923.7/.8 — la relance est ACTIVE par défaut (la variable n'est plus qu'un
    interrupteur d'arrêt), elle cherche les RÔLES DE TÊTE des familles cibles, et part
    SANS ancre (par nom, #4923.8)."""
    import importlib

    import app.routers.phase2_contacts as mod

    monkeypatch.delenv("CONTACTS_AUTO_THEME_RELAUNCH_ENABLED", raising=False)
    monkeypatch.delenv("CONTACTS_MAX_AUTO_THEME_RELAUNCH", raising=False)
    fresh = importlib.reload(mod)
    try:
        assert fresh._AUTO_THEME_RELAUNCH_ENABLED is True
        assert fresh._MAX_AUTO_THEME_RELAUNCH == 6
        monkeypatch.setattr(fresh, "_CONTACTS_AUTO_WIDEN_DISABLED", True)
        general_hit = ApolloSearchHit(
            id="general-2", first_name="Ana", last_name="D", title="MLOps Engineer", organization_name="TF1"
        )
        seen: list[list[str] | None] = []

        async def fake_search_people(**kwargs: Any) -> list[ApolloSearchHit]:
            if kwargs.get("person_titles") is None:
                return [general_hit]
            seen.append(kwargs["person_titles"])
            assert kwargs["exhaust_anchors"] is True  # #4923.9
            return []

        with patch.object(fresh, "search_people", new_callable=AsyncMock, side_effect=fake_search_people):
            # AUCUNE ancre (organization_ids / domains vides) : la relance part quand même.
            asyncio.run(fresh._contacts(ContactsRequest(company_name="TF1", profile_data={"offers": ["data"]})))
        assert seen, "la relance doit partir sans ancre"
        assert "Head of Data" in seen[0]  # data : famille du profil, sans tête (MLOps Engineer ≠ tête)
        assert len(seen) <= 6
    finally:
        importlib.reload(mod)


def test_auto_theme_relaunch_stop_switch(monkeypatch) -> None:
    """``CONTACTS_AUTO_THEME_RELAUNCH_ENABLED=false`` éteint la relance."""
    import importlib

    import app.routers.phase2_contacts as mod

    monkeypatch.setenv("CONTACTS_AUTO_THEME_RELAUNCH_ENABLED", "false")
    try:
        assert importlib.reload(mod)._AUTO_THEME_RELAUNCH_ENABLED is False
    finally:
        monkeypatch.delenv("CONTACTS_AUTO_THEME_RELAUNCH_ENABLED", raising=False)
        importlib.reload(mod)


# ── #2532.2 bis — retour BOUYGUES CONSTRUCTION (19/09/2026) : « Coordinateur
# de chantier » remontait 5 contacts SANS rapport, l'écran ne disant rien du
# thème. Le compte de contacts passait de 2563 à 2568 en silence. ─────────


def test_theme_scope_sends_btp_family_titles_to_the_provider() -> None:
    """#2532.2 (21/09/2026, REVIREMENT — voir docstring de tête de
    `contact_themes.py`) — "Coordinateur de chantier" rejoint désormais le
    preset NOMMÉ "btp" (synonyme "chantier") : le fournisseur Apollo reçoit
    les titres CURATÉS de la famille (plus riches qu'une simple variante de
    genre du mot-clé saisi), même mécanique que "cyber"/"dsi"."""
    from app.routers.phase2_contacts import _contacts

    with (
        patch(
            "app.routers.phase2_contacts.search_people",
            new_callable=AsyncMock,
            return_value=[],
        ) as mock_search,
        patch("app.routers.phase2_contacts._fallback_brave_claude", new_callable=AsyncMock, return_value=[]),
    ):
        req = ContactsRequest(company_name="BOUYGUES CONSTRUCTION", scope={"theme": "Coordinateur de chantier"})
        asyncio.run(_contacts(req))

    assert mock_search.call_count == 1  # thème = titres explicites ⇒ pas d'élargissement séniorité
    sent_titles = mock_search.call_args_list[0].kwargs["person_titles"]
    lowered = [t.lower() for t in (sent_titles or [])]
    assert "chef de chantier" in lowered
    assert "conducteur de travaux" in lowered


def test_theme_scope_sends_gender_variants_for_a_theme_outside_all_presets() -> None:
    """#3 du brief — le mécanisme d'origine (#2532.2 bis) : pour un métier
    encore hors des 10 presets (ici, éducation/formation), la requête
    réellement CONSTRUITE porte les DEUX variantes de genre au fournisseur
    Apollo (`person_titles`)."""
    from app.routers.phase2_contacts import _contacts

    with (
        patch(
            "app.routers.phase2_contacts.search_people",
            new_callable=AsyncMock,
            return_value=[],
        ) as mock_search,
        patch("app.routers.phase2_contacts._fallback_brave_claude", new_callable=AsyncMock, return_value=[]),
    ):
        req = ContactsRequest(company_name="ACADEMIA FORMATION", scope={"theme": "Coordinateur pédagogique"})
        asyncio.run(_contacts(req))

    assert mock_search.call_count == 1
    sent_titles = mock_search.call_args_list[0].kwargs["person_titles"]
    lowered = [t.lower() for t in (sent_titles or [])]
    assert "coordinateur pédagogique" in lowered
    assert "coordinatrice pédagogique" in lowered


def test_theme_scope_makes_the_fallback_theme_aware() -> None:
    """Avant ce correctif, le repli Brave+Claude interrogeait les personas
    GÉNÉRIQUES du profil (DSI, DAF…) même pour une recherche par thème — c'est
    ce qui a produit les 5 contacts sans rapport sur BOUYGUES CONSTRUCTION. Un
    thème explicite doit désormais gagner sur les personas du profil."""
    from app.routers.phase2_contacts import _contacts

    with (
        patch("app.routers.phase2_contacts.search_people", new_callable=AsyncMock, return_value=[]),
        patch(
            "app.routers.phase2_contacts._fallback_brave_claude",
            new_callable=AsyncMock,
            return_value=[],
        ) as mock_fallback,
    ):
        req = ContactsRequest(
            company_name="BOUYGUES CONSTRUCTION",
            profile_data={"personas": ["DSI", "RSSI"]},
            scope={"theme": "Coordinateur de chantier"},
        )
        asyncio.run(_contacts(req))

    sent_personas = [p.lower() for p in mock_fallback.call_args.args[1]]
    # #2532.2 (21/09) — "Coordinateur de chantier" matche le preset "btp" :
    # le repli reçoit les titres CURATÉS de la famille, pas le mot-clé saisi.
    assert "chef de chantier" in sent_personas
    assert "dsi" not in sent_personas  # le thème gagne sur les personas du profil


def test_fallback_contacts_unrelated_to_the_theme_are_not_attributed() -> None:
    """#2 et #3 du brief — un contact de repli SANS rapport avec le thème ne
    porte JAMAIS sa provenance et n'est JAMAIS compté dans `matchedCount` :
    il est compté À PART (`outOfThemeCount`), jamais silencieusement
    attribué. Un contact de repli qui, lui, porte réellement le thème dans
    son titre EST attribué, marqué `widened` (texte web, pas le dictionnaire
    exact)."""
    from app.routers.phase2_contacts import _contacts

    with (
        patch("app.routers.phase2_contacts.search_people", new_callable=AsyncMock, return_value=[]),
        patch(
            "app.routers.phase2_contacts._fallback_brave_claude",
            new_callable=AsyncMock,
            return_value=[
                {"full_name": "Awa Diallo", "title": "Directeur Financier", "source": "brave_search"},
                {"full_name": "Léo Petit", "title": "Chef de Chantier Grand Paris", "source": "brave_search"},
            ],
        ),
    ):
        req = ContactsRequest(company_name="BOUYGUES CONSTRUCTION", scope={"theme": "Coordinateur de chantier"})
        resp = asyncio.run(_contacts(req))

    by_name = {c["fullName"]: c for c in resp.data["contacts"]}
    assert "matchProvenance" not in by_name["Awa Diallo"]
    assert by_name["Léo Petit"]["matchProvenance"]["widened"] is True

    theme_search = resp.data["themeSearch"]
    assert theme_search["theme"] == "Coordinateur de chantier"
    assert theme_search["matchedCount"] == 1
    assert theme_search["matchedNames"] == ["Léo Petit"]
    assert theme_search["outOfThemeCount"] == 1


def test_theme_search_summary_absent_without_a_theme() -> None:
    """#1 du brief — `themeSearch` n'existe QUE pour une recherche
    thématisée : une recherche générale ne doit jamais lire un compteur
    « thème » qui ne voudrait rien dire pour elle."""
    from app.routers.phase2_contacts import _contacts

    with (
        patch(
            "app.routers.phase2_contacts.search_people",
            new_callable=AsyncMock,
            return_value=[MOCK_CONTACTS[0], MOCK_CONTACTS[1]],
        ),
        patch("app.routers.phase2_contacts._fallback_brave_claude", new_callable=AsyncMock, return_value=[]),
    ):
        req = ContactsRequest(company_name="SNCF")
        resp = asyncio.run(_contacts(req))

    assert "themeSearch" not in resp.data


# ── #2532.2 (21/09/2026) — l'écran doit savoir dire NON : un thème SANS
# preset connu ne doit jamais laisser croire à une expansion sectorielle
# silencieuse (« aucun préréglage pour ce thème : recherche sur le mot-clé
# seul », voir ResearchExpansionCallout.tsx). ─────────────────────────────


def test_theme_search_reports_preset_matched_for_a_known_family() -> None:
    from app.routers.phase2_contacts import _contacts

    with (
        patch("app.routers.phase2_contacts.search_people", new_callable=AsyncMock, return_value=[]),
        patch("app.routers.phase2_contacts._fallback_brave_claude", new_callable=AsyncMock, return_value=[]),
    ):
        req = ContactsRequest(company_name="BOUYGUES CONSTRUCTION", scope={"theme": "BTP"})
        resp = asyncio.run(_contacts(req))

    assert resp.data["themeSearch"]["presetMatched"] is True


def test_theme_search_reports_no_preset_matched_for_an_uncovered_theme() -> None:
    """Un thème hors des 10 presets (ex. « Coordinateur pédagogique »,
    éducation) retombe sur le mot-clé brut + sa variante de genre — jamais un
    silence : `presetMatched` doit rester `False` pour que l'écran nomme la
    limite plutôt que de laisser croire à une expansion sectorielle."""
    from app.routers.phase2_contacts import _contacts

    with (
        patch("app.routers.phase2_contacts.search_people", new_callable=AsyncMock, return_value=[]),
        patch("app.routers.phase2_contacts._fallback_brave_claude", new_callable=AsyncMock, return_value=[]),
    ):
        req = ContactsRequest(company_name="ACADEMIA FORMATION", scope={"theme": "Coordinateur pédagogique"})
        resp = asyncio.run(_contacts(req))

    assert resp.data["themeSearch"]["presetMatched"] is False


# ── #2543.5g : la collecte mince s'élargit UNE FOIS, dans le même run ──────


def _thin_stock_hits(n: int) -> list[ApolloSearchHit]:
    return [
        ApolloSearchHit(id=f"thin-{i}", first_name="Stock", last_name=str(i), title="DSI", organization_name="SNCF")
        for i in range(n)
    ]


def test_auto_widen_fires_by_default_without_any_env_var() -> None:
    """ACTIF PAR DÉFAUT (décision Louis 18/09/2026) : sans AUCUNE variable
    posée (ni monkeypatch sur le module — l'état importé, celui d'un process
    de production sans la clé), stock 5 (au seuil, après repli + amorces) ⇒
    UNE passe d'élargissement part, et une seule — le cas ARQUUS que le
    défaut éteint ne corrigeait pas."""
    from app.routers.phase2_contacts import _contacts

    primary_hits = _thin_stock_hits(5)
    widen_hit = ApolloSearchHit(
        id="widen-1", first_name="Elargi", last_name="Un", title="Manager", organization_name="SNCF"
    )

    async def fake_search_people(**kwargs: Any) -> list[ApolloSearchHit]:
        fake_search_people.calls += 1  # type: ignore[attr-defined]
        if fake_search_people.calls == 1:  # type: ignore[attr-defined]
            return list(primary_hits)
        return [widen_hit]

    fake_search_people.calls = 0  # type: ignore[attr-defined]

    with (
        patch(
            "app.routers.phase2_contacts.search_people",
            new_callable=AsyncMock,
            side_effect=fake_search_people,
        ) as mock_search,
        patch("app.routers.phase2_contacts._fallback_brave_claude", new_callable=AsyncMock, return_value=[]),
    ):
        req = ContactsRequest(company_name="SNCF")
        resp = asyncio.run(_contacts(req))

    # Primaire + UNE passe d'élargissement, jamais plus.
    assert mock_search.call_count == 2
    assert resp.data["widened"] == {"attempted": True, "initialStock": 5, "added": 1}


def test_auto_widen_uses_the_shared_threshold_not_a_private_one() -> None:
    """#4433.9 — « trop peu de décideurs » se mesure avec LE seuil des critères
    (``CRITERIA_WIDEN_MIN_RESULTS``, GA-26) et plus avec un 5 propre à cette
    passe : un stock de 9 s'élargit (une passe, dite), un stock de 10 non."""
    from app.routers.phase2_contacts import _contacts
    from app.services.criteria_referential import CRITERIA_WIDEN_MIN_RESULTS

    def run(stock: int) -> tuple[int, bool]:
        primary_hits = _thin_stock_hits(stock)
        calls = 0

        async def fake_search_people(**kwargs: Any) -> list[ApolloSearchHit]:
            nonlocal calls
            calls += 1
            return list(primary_hits) if calls == 1 else []

        with (
            patch("app.routers.phase2_contacts.search_people", new_callable=AsyncMock, side_effect=fake_search_people),
            patch("app.routers.phase2_contacts._fallback_brave_claude", new_callable=AsyncMock, return_value=[]),
        ):
            resp = asyncio.run(_contacts(ContactsRequest(company_name="SNCF")))
        return calls, "widened" in resp.data

    assert run(CRITERIA_WIDEN_MIN_RESULTS - 1) == (2, True)
    assert run(CRITERIA_WIDEN_MIN_RESULTS) == (1, False)


def test_auto_widen_does_not_fire_above_the_threshold() -> None:
    """Stock seuil + 2 (au-dessus de _MIN_CONTACTS_BEFORE_FALLBACK) ⇒ aucune passe,
    alors que la passe est ACTIVE par défaut — c'est le seuil qui protège,
    pas l'interrupteur."""
    from app.routers.phase2_contacts import _contacts
    from app.services.criteria_referential import CRITERIA_WIDEN_MIN_RESULTS

    primary_hits = _thin_stock_hits(CRITERIA_WIDEN_MIN_RESULTS + 2)

    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        return_value=primary_hits,
    ) as mock_search:
        req = ContactsRequest(company_name="SNCF")
        resp = asyncio.run(_contacts(req))

    assert mock_search.call_count == 1
    assert "widened" not in resp.data


def test_auto_widen_disabled_by_the_kill_switch(monkeypatch) -> None:
    """Coupe-circuit posé (``CONTACTS_AUTO_WIDEN_DISABLED=true``) ⇒ aucune
    passe même à stock 5 — chemin byte-identique, comportement d'avant
    #2543.5g. C'est désormais l'exception qu'il faut POSER, plus le défaut."""
    from app.routers.phase2_contacts import _contacts

    monkeypatch.setattr("app.routers.phase2_contacts._CONTACTS_AUTO_WIDEN_DISABLED", True)

    primary_hits = _thin_stock_hits(5)

    with (
        patch(
            "app.routers.phase2_contacts.search_people",
            new_callable=AsyncMock,
            return_value=primary_hits,
        ) as mock_search,
        patch("app.routers.phase2_contacts._fallback_brave_claude", new_callable=AsyncMock, return_value=[]),
    ):
        req = ContactsRequest(company_name="SNCF")
        resp = asyncio.run(_contacts(req))

    # Un seul appel (le primaire) : ni élargissement, ni appel Apollo de plus.
    assert mock_search.call_count == 1
    assert "widened" not in resp.data


def test_auto_widen_says_when_it_finds_nothing() -> None:
    """La passe qui ne trouve rien le DIT (``added: 0``) au lieu de se taire
    (clé absente) — GA-18/19 : une mesure à zéro n'est pas un silence."""
    from app.routers.phase2_contacts import _contacts

    primary_hits = _thin_stock_hits(5)

    async def fake_search_people(**kwargs: Any) -> list[ApolloSearchHit]:
        fake_search_people.calls += 1  # type: ignore[attr-defined]
        if fake_search_people.calls == 1:  # type: ignore[attr-defined]
            return list(primary_hits)
        return []

    fake_search_people.calls = 0  # type: ignore[attr-defined]

    with (
        patch(
            "app.routers.phase2_contacts.search_people",
            new_callable=AsyncMock,
            side_effect=fake_search_people,
        ) as mock_search,
        patch("app.routers.phase2_contacts._fallback_brave_claude", new_callable=AsyncMock, return_value=[]),
    ):
        req = ContactsRequest(company_name="SNCF")
        resp = asyncio.run(_contacts(req))

    assert mock_search.call_count == 2
    assert resp.data["widened"] == {"attempted": True, "initialStock": 5, "added": 0}


# C.2 (Cédric 20/10) — « Agrandir la recherche » partait SANS ancre d'organisation
# (logs prod : org_ids=0 org_domains=0) : l'API ne passe que ``profile_data``
# (= raw_analysis), jamais les ancres que le run complet dérive de
# ``apolloEnrichment``. Ces tests disent NON tant que la phase 2 ne les dérive pas
# elle-même.
def test_contacts_derive_l_ancre_de_apollo_enrichment_du_profil(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr("app.routers.phase2_contacts._CONTACTS_AUTO_WIDEN_DISABLED", True)
    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        return_value=[],
    ) as mock_search:
        r = client.post(
            "/phase/2/contacts",
            json={
                "company_name": "SAFRAN AIRCRAFT ENGINES",
                "profile_data": {"apolloEnrichment": {"organizationId": "org-safran-1", "domain": "safran-group.com"}},
            },
        )
    assert r.status_code == 200
    kwargs = mock_search.call_args_list[0].kwargs
    assert kwargs["organization_ids"] == ["org-safran-1"]
    assert kwargs["organization_domains"] == ["safran-group.com"]
    assert r.json()["data"]["orgAnchorSource"] == "enrichment"


def test_contacts_ancre_repli_sur_le_site_du_compte(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr("app.routers.phase2_contacts._CONTACTS_AUTO_WIDEN_DISABLED", True)
    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        return_value=[],
    ) as mock_search:
        r = client.post(
            "/phase/2/contacts",
            json={"company_name": "SAFRAN", "profile_data": {"website": "https://www.safran-group.com/fr"}},
        )
    kwargs = mock_search.call_args_list[0].kwargs
    assert kwargs["organization_ids"] is None
    assert kwargs["organization_domains"] == ["safran-group.com"]
    assert r.json()["data"]["orgAnchorSource"] == "website"


def test_contacts_sans_aucune_ancre_le_dit(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr("app.routers.phase2_contacts._CONTACTS_AUTO_WIDEN_DISABLED", True)
    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        return_value=[],
    ) as mock_search:
        r = client.post("/phase/2/contacts", json={"company_name": "SAFRAN", "profile_data": {}})
    kwargs = mock_search.call_args_list[0].kwargs
    assert kwargs["organization_ids"] is None
    assert kwargs["organization_domains"] is None
    assert r.json()["data"]["orgAnchorSource"] == "none"


def test_contacts_ancre_explicite_gagne_sur_le_profil(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr("app.routers.phase2_contacts._CONTACTS_AUTO_WIDEN_DISABLED", True)
    with patch(
        "app.routers.phase2_contacts.search_people",
        new_callable=AsyncMock,
        return_value=[],
    ) as mock_search:
        client.post(
            "/phase/2/contacts",
            json={
                "company_name": "SAFRAN",
                "organization_ids": ["explicit-1"],
                "profile_data": {"apolloEnrichment": {"organizationId": "from-profile"}},
            },
        )
    assert mock_search.call_args_list[0].kwargs["organization_ids"] == ["explicit-1"]


def test_4928_contacts_drops_homonym_employers_and_says_so() -> None:
    # #4928.1 — « Boulanger » ne ramène plus « Boulangerie Ange » dans le dossier.
    from app.routers.phase2_contacts import _contacts

    hits = [
        ApolloSearchHit(id="ok", first_name="Aline", last_name="B", title="DSI", organization_name="Boulanger", has_email=True),
        ApolloSearchHit(id="ko", first_name="Youen", last_name="L", title="DSI", organization_name="Boulangerie Ange", has_email=True),
    ]
    resp = asyncio.run(_contacts(ContactsRequest(company_name="Boulanger", prefetched_hits=hits)))
    assert {c["apolloId"] for c in resp.data["contacts"]} == {"ok"}


def test_web_role_search_adds_head_found_by_the_web_and_never_names_the_provider(monkeypatch) -> None:
    """#4923.10 — une famille cible sans tête après Apollo reçoit sa tête de la recherche
    web ; la source interne reste ``web_role_search`` (jamais le fournisseur)."""
    from app.routers.phase2_contacts import _contacts

    monkeypatch.setattr("app.routers.phase2_contacts._CONTACTS_AUTO_WIDEN_DISABLED", True)
    hit = ApolloSearchHit(id="a1", first_name="Ana", last_name="D", title="RSSI", organization_name="AXA")

    async def fake_web(company: str, families: list[str], **_: Any) -> list[dict]:
        assert company == "AXA" and "data" in families and "cyber" not in families  # cyber a sa tête
        return [
            {
                "fullName": "Jane Doe",
                "title": "Head of Data",
                "linkedinUrl": "https://linkedin.com/in/jd",
                "contactEmployer": "AXA",
                "source": "web_role_search",
            }
        ]

    with (
        patch("app.routers.phase2_contacts.search_people", new_callable=AsyncMock, return_value=[hit]),
        patch("app.routers.phase2_contacts.web_role_search", side_effect=fake_web),
    ):
        resp = asyncio.run(_contacts(ContactsRequest(company_name="AXA", profile_data={"offers": ["data"]})))

    by_name = {c["fullName"]: c for c in resp.data["contacts"]}
    assert by_name["Jane Doe"]["source"] == "web_role_search"
    assert "serper" not in str(by_name["Jane Doe"]).lower()
