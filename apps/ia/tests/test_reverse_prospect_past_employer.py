"""#1611.6 — la passe PAST-EMPLOYER, celle qui NOURRIT la prospection inversée.

Le défaut qu'elle referme : `find_reverse_prospects` ne tourne que sur le pool du
dossier, ancré sur le NOM de la société — donc sur des salariés ACTUELS, que le
filtre écarte à 100 %. Le bloc agrégé « Ce que Bellum observe dans les
trajectoires » ne pouvait jamais s'allumer, et la fonction que le docstring
promettait (`apollo.search_past_employees`) n'existait pas.

Ce que ces tests tiennent :
· le DOMAINE part SEUL (ni nom ni id d'organisation, qui re-restreindraient aux
  salariés actuels) — c'est la seule chose qui fait marcher la passe ;
· sans domaine, ou à `REVERSE_PROSPECT_SEARCH_PAGES=0`, aucun appel réseau ;
· les ex-collaborateurs n'entrent JAMAIS dans `contacts` ;
· une panne de la passe ne coûte pas le dossier.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services.apollo import (
    REVERSE_PROSPECT_SEARCH_PAGES_ENV,
    reverse_prospect_search_pages,
    search_past_employees,
)


def _mock_response(status: int, json_data: dict) -> httpx.Response:
    return httpx.Response(status, json=json_data, request=httpx.Request("POST", "https://x.io"))


def _person(first: str, org: str, history: list[tuple[str, bool]]) -> dict:
    """⚠️ Apollo écrit `organization_name` dans `employment_history`, et
    `organization` dans le bloc racine. Une fixture qui confond les deux rend un
    historique VIDE — donc zéro prospect inversé — sans qu'aucune ligne n'échoue
    ailleurs : c'est exactement le silence que cette passe existe pour lever."""
    return {
        "id": f"id-{first.lower()}",
        "first_name": first,
        "last_name": "Test",
        "title": "DSI",
        "organization": {"name": org},
        "employment_history": [{"organization_name": o, "current": c} for o, c in history],
    }


@pytest.fixture(autouse=True)
def _apollo_key(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("APOLLO_API_KEY", "test-key")
    monkeypatch.delenv(REVERSE_PROSPECT_SEARCH_PAGES_ENV, raising=False)


@pytest.mark.asyncio
async def test_le_domaine_part_seul_sans_nom_ni_id():
    """Le cœur de la passe : Apollo ANDe ses ancres, donc un nom ou un id
    d'organisation la ramènerait aux salariés ACTUELS — le pool qui ne contient
    par définition aucun ex-collaborateur."""
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post.return_value = _mock_response(
        200, {"people": [], "pagination": {"total_entries": 0, "total_pages": 1, "page": 1}}
    )

    await search_past_employees(["thalesgroup.com"], http_client=client)

    payload = client.post.call_args.kwargs["json"]
    assert payload["q_organization_domains_list"] == ["thalesgroup.com"]
    assert "q_organization_name" not in payload
    assert "organization_ids" not in payload


@pytest.mark.asyncio
async def test_rend_les_hits_avec_leur_historique_de_poste():
    """Sans `employment_history`, `is_reverse_prospect` ne peut rien conclure :
    c'est le champ que la passe existe pour rapporter."""
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post.return_value = _mock_response(
        200,
        {
            "people": [_person("Marie", "Capgemini", [("Capgemini", True), ("Thales", False)])],
            "pagination": {"total_entries": 1, "total_pages": 1, "page": 1},
        },
    )

    hits = await search_past_employees(["thalesgroup.com"], http_client=client)

    assert len(hits) == 1
    assert hits[0].organization_name == "Capgemini"
    assert [e["organization"] for e in hits[0].employment_history] == ["Capgemini", "Thales"]


@pytest.mark.asyncio
async def test_sans_domaine_aucun_appel_reseau():
    client = AsyncMock(spec=httpx.AsyncClient)
    assert await search_past_employees([], http_client=client) == []
    assert await search_past_employees(["   "], http_client=client) == []
    client.post.assert_not_called()


@pytest.mark.asyncio
async def test_zero_page_est_un_no_op_strict(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv(REVERSE_PROSPECT_SEARCH_PAGES_ENV, "0")
    client = AsyncMock(spec=httpx.AsyncClient)
    assert await search_past_employees(["thalesgroup.com"], http_client=client) == []
    client.post.assert_not_called()


def test_le_reglage_de_pages_ne_jette_jamais(monkeypatch: pytest.MonkeyPatch):
    assert reverse_prospect_search_pages() == 1
    monkeypatch.setenv(REVERSE_PROSPECT_SEARCH_PAGES_ENV, "trois")
    assert reverse_prospect_search_pages() == 1
    monkeypatch.setenv(REVERSE_PROSPECT_SEARCH_PAGES_ENV, "-4")
    assert reverse_prospect_search_pages() == 0
    monkeypatch.setenv(REVERSE_PROSPECT_SEARCH_PAGES_ENV, "99")
    assert reverse_prospect_search_pages() == 5


@pytest.mark.asyncio
async def test_les_ex_collaborateurs_nourrissent_reverse_sans_entrer_dans_contacts():
    """Le test de CÂBLAGE : la passe alimente `reverseProspects`, et le dossier
    garde la strate de décision actuelle."""
    from app.routers import phase2_contacts as mod

    current = {"fullName": "Paul Actuel", "apolloDetails": {"organization": "Thales"}}
    hit = _person("Marie", "Capgemini", [("Capgemini", True), ("Thales", False)])

    from app.services.apollo import _to_search_hit

    with patch.object(mod, "search_past_employees", AsyncMock(return_value=[_to_search_hit(hit)])):
        past = await mod._past_employer_seeds(["thalesgroup.com"], person_titles=None, seniorities=None)

    from app.services.contact_identity import merge_contact_seeds
    from app.services.reverse_prospecting import find_reverse_prospects

    candidates = merge_contact_seeds([current] + past)
    reverse = find_reverse_prospects(candidates, "Thales")

    assert [c["fullName"] for c in reverse] == ["Marie Test"]
    assert [c["fullName"] for c in [current]] == ["Paul Actuel"]  # `contacts` intact


@pytest.mark.asyncio
async def test_une_panne_de_la_passe_ne_coute_pas_le_dossier():
    from app.routers import phase2_contacts as mod

    with patch.object(mod, "search_past_employees", AsyncMock(side_effect=RuntimeError("apollo down"))):
        assert await mod._past_employer_seeds(["x.com"], person_titles=None, seniorities=None) == []
