"""#4386 — recherche d'une personne par nom : la CASCADE multi-sources.

Symptôme prod (Louis, 20/10/2026) : Découvrir › « Chercher une personne par nom »,
« Theo Haddad » + « Bellum » → « Aucun homonyme trouvé », alors que Théo Haddad
est le CEO de Bellum AI. Cause prouvée : UN fournisseur, UN essai, nom seulement
``strip()`` — aucune normalisation, aucun repli, aucune autre source.

Jeu de cas FIGÉ (≥ 15) — chaque source est un faux injecté : base de contacts,
registre des dirigeants, recherche web (moteur 1 puis moteur 2 en repli).
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest

from app.models.contacts import ApolloSearchHit
from app.services import person_name_search as pns
from app.services.apollo import ApolloSearchStatus
from app.services.source_health import record_degradation

# ── Fixtures de sources ────────────────────────────────────────────────────


def _hit(
    first: str, last: str = "", *, obf: str = "", org: str = "", title: str = "", hid: str = ""
) -> ApolloSearchHit:
    return ApolloSearchHit(
        id=hid or f"ap-{first}-{last or obf}".lower(),
        first_name=first,
        last_name=last,
        last_name_obfuscated=obf,
        title=title,
        organization_name=org,
        city="Paris",
        country="France",
    )


class FakeBase:
    """Base de contacts : ``responder(full_name, organization_name)`` → (hits, status)."""

    def __init__(self, responder: Callable[[str, str | None], tuple[list[ApolloSearchHit], ApolloSearchStatus]]):
        self.responder = responder
        self.calls: list[tuple[str, str | None]] = []

    async def __call__(self, *, full_name: str, organization_name: str | None = None, **_: Any):
        self.calls.append((full_name, organization_name))
        return self.responder(full_name, organization_name)


class FakeRegistry:
    """Registre : ``companies`` (requête → fiche) ; ``fail`` simule une panne."""

    def __init__(self, companies: dict[str, dict] | None = None, *, fail: bool = False):
        self.companies = companies or {}
        self.fail = fail
        self.calls: list[str] = []

    async def __call__(self, name: str, **_: Any) -> dict | None:
        self.calls.append(name)
        if self.fail:
            record_degradation(None, source="recherche_entreprises", reason="HTTP 503")
            return None
        for query, company in self.companies.items():
            if query.lower() == name.lower():
                return company
        return None


class FakeWeb:
    """Un moteur de recherche web : ``results`` (prédicat sur la requête → résultats)."""

    def __init__(
        self,
        provider: str,
        results: list[tuple[Callable[[str], bool], list[dict]]] | None = None,
        *,
        fail: bool = False,
    ):
        self.provider = provider
        self.results = results or []
        self.fail = fail
        self.calls: list[str] = []

    async def __call__(self, query: str, *, limit: int = 10, client: Any = None) -> list[dict]:
        self.calls.append(query)
        if self.fail:
            record_degradation(None, source="data_gateway", reason=f"{self.provider}: HTTP 500")
            return []
        for predicate, rows in self.results:
            if predicate(query):
                return rows
        return []


def _li(name: str, title: str, company: str, slug: str, description: str = "") -> dict:
    return {
        "title": f"{name} - {title} - {company} | LinkedIn",
        "url": f"https://fr.linkedin.com/in/{slug}",
        "description": description,
        "source": "brave",
        "date": "",
    }


THEO_REGISTRY = {
    "Bellum": {
        "name": "BELLUM AI",
        "siren": "912345678",
        "dirigeants": [
            {"name": "Theo HADDAD", "role": "Président"},
            {"name": "CABINET AUDIT SA", "role": "Commissaire aux comptes"},
        ],
    }
}


def _empty_base() -> FakeBase:
    return FakeBase(lambda *_: ([], ApolloSearchStatus.EMPTY))


@pytest.fixture
def wire(monkeypatch: pytest.MonkeyPatch):
    """Branche les faux et pose les clés ; rend une fonction de configuration."""

    def _wire(
        *,
        base: FakeBase | None = None,
        registry: FakeRegistry | None = None,
        brave: FakeWeb | None = None,
        serper: FakeWeb | None = None,
        keys: tuple[str, ...] = ("BRAVE_API_KEY", "SERPER_API_KEY"),
    ):
        base = base or _empty_base()
        registry = registry or FakeRegistry()
        brave = brave or FakeWeb("brave")
        serper = serper or FakeWeb("serper")
        monkeypatch.setattr(pns, "search_people_by_name", base)
        monkeypatch.setattr(pns, "fetch_company", registry)
        monkeypatch.setattr(pns, "brave_search_single", brave)
        monkeypatch.setattr(pns, "serper_search", serper)
        for env in ("BRAVE_API_KEY", "SERPER_API_KEY"):
            if env in keys:
                monkeypatch.setenv(env, "test-key")
            else:
                monkeypatch.delenv(env, raising=False)
        return base, registry, brave, serper

    return _wire


def _queried(result: pns.PersonNameSearchOutcome) -> dict[str, str]:
    return {s.family: s.outcome for s in result.sources_queried}


# ── 1. Le cas du symptôme ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_theo_haddad_bellum_absent_from_base_found_by_registry_and_web(wire) -> None:
    web_hit = _li("Théo Haddad", "CEO", "Bellum AI", "theo-haddad")
    base, registry, brave, _ = wire(
        registry=FakeRegistry(THEO_REGISTRY),
        brave=FakeWeb("brave", [(lambda q: "haddad" in q.lower(), [web_hit])]),
    )

    out = await pns.search_person_by_name(full_name="Theo Haddad", organization_name="Bellum")

    assert len(out.hits) == 1
    hit = out.hits[0]
    assert (hit.first_name, hit.last_name) == ("Théo", "Haddad")
    assert hit.linkedin_url == "https://fr.linkedin.com/in/theo-haddad"
    assert hit.title == "CEO"
    assert hit.organization_name == "BELLUM AI"
    assert hit.match == "name_and_company"
    assert hit.sources == ["legal_registry", "web"]
    assert _queried(out) == {"contact_base": "empty", "legal_registry": "found", "web": "found"}
    assert out.status == "ok"
    # La personne-morale du registre (commissaire aux comptes) n'est jamais une personne.
    assert all("cabinet" not in h.last_name.lower() for h in out.hits)
    # Le moteur 2 n'est jamais appelé quand le moteur 1 a répondu.
    assert len(brave.calls) <= 2


@pytest.mark.parametrize("typed_org", ["BellumAI", "BellumIO"])
@pytest.mark.asyncio
async def test_glued_brand_suffix_is_split_for_the_registry_lookup(wire, typed_org: str) -> None:
    """Recette 21/10 — « Théo Haddad » + « BellumAI » rendait 4 homonymes : le registre était
    interrogé avec « BellumAI » collé, qu'il ne connaît pas. La marque collée se coupe (« Bellum »)."""
    _, registry, _, _ = wire(registry=FakeRegistry(THEO_REGISTRY))
    out = await pns.search_person_by_name(full_name="Théo Haddad", organization_name=typed_org)
    assert "Bellum" in registry.calls
    assert [h.match for h in out.hits] == ["name_and_company"]
    assert out.hits[0].organization_name == "BELLUM AI"


@pytest.mark.parametrize("typed_org", ["Thai", "Kaizen", "BELLUMAI", "Mai"])
def test_glued_split_says_no_without_a_case_boundary(typed_org: str) -> None:
    """Sait dire NON : sans frontière de casse (« Thai », « BELLUMAI »), rien n'est coupé."""
    assert pns._clean_org_display(typed_org) == typed_org


# ── 2. Normalisation ───────────────────────────────────────────────────────


@pytest.mark.parametrize("typed", ["Théo Haddad", "theo haddad", "THEO HADDAD", "Haddad Theo"])
@pytest.mark.asyncio
async def test_accents_case_and_inverted_name_all_find_the_same_person(wire, typed: str) -> None:
    wire(registry=FakeRegistry(THEO_REGISTRY))
    out = await pns.search_person_by_name(full_name=typed, organization_name="Bellum")
    assert [h.match for h in out.hits] == ["name_and_company"]
    assert out.hits[0].last_name.lower() == "haddad"


@pytest.mark.asyncio
async def test_probable_accented_form_is_also_sent_to_the_base(wire) -> None:
    base = _empty_base()
    wire(base=base)
    await pns.search_person_by_name(full_name="Theo Haddad", organization_name="Bellum AI")
    sent = [name for name, _ in base.calls]
    assert "Theo Haddad" in sent
    assert "Théo Haddad" in sent
    assert len(base.calls) <= 3


@pytest.mark.asyncio
async def test_company_variants_are_tried_and_suffixes_cleaned(wire) -> None:
    base = _empty_base()
    wire(base=base)
    await pns.search_person_by_name(full_name="Marion Sagnard", organization_name="Bedrock SAS")
    orgs = [org for _, org in base.calls]
    assert orgs[0] == "Bedrock SAS"
    assert "Bedrock" in orgs
    # Dernier essai : nom seul, filtré ensuite localement sur l'entreprise.
    assert orgs[-1] is None
    assert len(base.calls) <= 3


@pytest.mark.parametrize(
    ("typed", "registered"),
    [
        ("Bellum", "BELLUM AI"),
        ("BellumAI", "Bellum AI SAS"),
        ("Bellum AI", "BELLUM"),
        ("bellum.com", "Bellum Group"),
        ("Capgemini", "CAPGEMINI TECHNOLOGY SERVICES"),
    ],
)
def test_company_brand_and_legal_name_correspond(typed: str, registered: str) -> None:
    assert pns.companies_correspond(typed, registered)


@pytest.mark.parametrize(("typed", "other"), [("Bellum", "Bel Air"), ("Orange", "Orano"), ("AI", "AI Partners")])
def test_company_fuzzy_match_says_no_to_different_companies(typed: str, other: str) -> None:
    assert not pns.companies_correspond(typed, other)


# ── 3. Noms composés ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_hyphenated_first_name_matches_spaced_form(wire) -> None:
    wire(
        base=FakeBase(
            lambda name, org: ([_hit("Jean Marc", "Dupont", org="Sopra Steria", title="DSI")], ApolloSearchStatus.OK)
        )
    )
    out = await pns.search_person_by_name(full_name="Jean-Marc Dupont", organization_name="Sopra Steria")
    assert [h.match for h in out.hits] == ["name_and_company"]


@pytest.mark.asyncio
async def test_particle_surname_matches_registry_casing(wire) -> None:
    wire(
        registry=FakeRegistry(
            {
                "Fables SA": {
                    "name": "FABLES",
                    "dirigeants": [{"name": "Jean DE LA FONTAINE", "role": "Directeur général"}],
                }
            }
        )
    )
    out = await pns.search_person_by_name(full_name="Jean de La Fontaine", organization_name="Fables SA")
    assert len(out.hits) == 1
    assert out.hits[0].match == "name_and_company"
    assert out.hits[0].title == "Directeur général"


@pytest.mark.asyncio
async def test_masked_surname_from_base_is_a_partial_match_merged_with_registry(wire) -> None:
    wire(
        base=FakeBase(
            lambda name, org: (
                [_hit("Theo", obf="Ha***d", org="Bellum AI", title="CEO", hid="ap-1")],
                ApolloSearchStatus.OK,
            )
        ),
        registry=FakeRegistry(THEO_REGISTRY),
    )
    out = await pns.search_person_by_name(full_name="Theo Haddad", organization_name="Bellum")
    assert len(out.hits) == 1
    hit = out.hits[0]
    # Fusion : l'id de la base est gardé (le reveal payant s'en sert), le nom complet vient du registre.
    assert hit.id == "ap-1"
    assert hit.last_name == "Haddad"
    assert hit.title == "CEO"
    assert hit.sources == ["contact_base", "legal_registry"]
    assert hit.match == "name_and_company"


@pytest.mark.asyncio
async def test_masked_surname_alone_is_named_partial(wire) -> None:
    wire(
        base=FakeBase(lambda name, org: ([_hit("Theo", obf="Ha***d", org="Bellum AI")], ApolloSearchStatus.OK)),
        keys=(),
    )
    out = await pns.search_person_by_name(full_name="Theo Haddad", organization_name="Bellum")
    assert [h.match for h in out.hits] == ["partial_name_and_company"]


# ── 4. Homonymes sans entreprise ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_many_homonyms_without_company_stop_at_the_base_no_web_cost(wire) -> None:
    homonyms = [_hit("Marie", "Martin", org=f"Société {i}", hid=f"ap-{i}") for i in range(12)]
    _, registry, brave, serper = wire(base=FakeBase(lambda *_: (homonyms, ApolloSearchStatus.OK)))
    out = await pns.search_person_by_name(full_name="Marie Martin", organization_name=None)
    assert len(out.hits) == 12
    assert {h.match for h in out.hits} == {"name_only"}
    assert brave.calls == [] and serper.calls == []
    # Sans entreprise, il n'y a pas d'entreprise à résoudre au registre.
    assert registry.calls == []
    assert _queried(out) == {"contact_base": "found"}


@pytest.mark.asyncio
async def test_ranking_puts_name_and_company_first(wire) -> None:
    wire(
        base=FakeBase(
            lambda name, org: (
                [
                    _hit("Marion", "Sagnard", org="Une Autre Société", hid="ap-other"),
                    _hit("Marion", "Sagnard", org="Bedrock", hid="ap-bedrock"),
                ],
                ApolloSearchStatus.OK,
            )
        ),
        keys=(),
    )
    out = await pns.search_person_by_name(full_name="Marion Sagnard", organization_name="Bedrock")
    assert [h.id for h in out.hits] == ["ap-bedrock", "ap-other"]
    assert [h.match for h in out.hits] == ["name_and_company", "name_only"]


@pytest.mark.asyncio
async def test_a_different_person_is_never_returned(wire) -> None:
    wire(base=FakeBase(lambda *_: ([_hit("Marion", "Durand", org="Bedrock")], ApolloSearchStatus.OK)), keys=())
    out = await pns.search_person_by_name(full_name="Marion Sagnard", organization_name="Bedrock")
    assert out.hits == []


# ── 5. Sources en panne, sans clé ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_failing_source_does_not_end_the_cascade(wire) -> None:
    web_hit = _li("Théo Haddad", "CEO", "Bellum AI", "theo-haddad")
    wire(
        base=FakeBase(lambda *_: ([], ApolloSearchStatus.DOWN)),
        registry=FakeRegistry(fail=True),
        brave=FakeWeb("brave", [(lambda q: True, [web_hit])]),
    )
    out = await pns.search_person_by_name(full_name="Theo Haddad", organization_name="Bellum")
    assert [h.sources for h in out.hits] == [["web"]]
    assert _queried(out) == {"contact_base": "down", "legal_registry": "down", "web": "found"}


@pytest.mark.asyncio
async def test_web_engine_one_down_falls_back_to_engine_two(wire) -> None:
    web_hit = _li("Théo Haddad", "CEO", "Bellum AI", "theo-haddad")
    _, _, brave, serper = wire(
        brave=FakeWeb("brave", fail=True),
        serper=FakeWeb("serper", [(lambda q: True, [web_hit])]),
    )
    out = await pns.search_person_by_name(full_name="Theo Haddad", organization_name="Bellum")
    assert len(out.hits) == 1
    assert len(brave.calls) + len(serper.calls) <= 2
    assert _queried(out)["web"] == "found"


@pytest.mark.asyncio
async def test_sources_without_key_make_zero_calls_and_no_error(wire) -> None:
    base = FakeBase(lambda *_: ([], ApolloSearchStatus.UNCONFIGURED))
    _, _, brave, serper = wire(base=base, keys=())
    out = await pns.search_person_by_name(full_name="Theo Haddad", organization_name=None)
    assert out.hits == []
    assert brave.calls == [] and serper.calls == []
    # Une famille non branchée n'est pas « interrogée » — et rien n'est « en panne ».
    assert out.sources_queried == []
    assert out.status == "unconfigured"


@pytest.mark.asyncio
async def test_web_budget_is_two_requests_max(wire) -> None:
    _, _, brave, serper = wire()
    out = await pns.search_person_by_name(full_name="Theo Haddad", organization_name="Bellum")
    assert len(brave.calls) + len(serper.calls) <= 2
    assert len(brave.calls) == 2  # les deux requêtes, sur le moteur 1 qui a répondu (vide)
    assert any("site:linkedin.com/in" in q for q in brave.calls)
    assert _queried(out)["web"] == "empty"


@pytest.mark.asyncio
async def test_web_results_that_are_not_the_person_are_dropped(wire) -> None:
    other = _li("Théo Dupuis", "CTO", "Bellum AI", "theo-dupuis")
    company_page = {
        "title": "Bellum AI | LinkedIn",
        "url": "https://www.linkedin.com/company/bellum-ai",
        "description": "",
    }
    wire(brave=FakeWeb("brave", [(lambda q: True, [other, company_page])]))
    out = await pns.search_person_by_name(full_name="Theo Haddad", organization_name="Bellum")
    assert out.hits == []


# ── 6. Dédoublonnage ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_same_linkedin_profile_from_two_queries_is_one_person(wire) -> None:
    a = _li("Théo Haddad", "CEO", "Bellum AI", "theo-haddad")
    b = {
        **_li("Theo Haddad", "Fondateur", "Bellum AI", "theo-haddad/"),
        "url": "https://www.linkedin.com/in/theo-haddad/?trk=x",
    }
    wire(brave=FakeWeb("brave", [(lambda q: True, [a, b])]))
    out = await pns.search_person_by_name(full_name="Theo Haddad", organization_name="Bellum")
    assert len(out.hits) == 1
    assert out.hits[0].linkedin_url.endswith("/in/theo-haddad")


@pytest.mark.asyncio
async def test_base_linkedin_and_web_linkedin_merge_keeping_base_title(wire) -> None:
    # Sans entreprise côté base : « nom seul », donc pas encore solide — le web tourne.
    base_hit = _hit("Theo", "Haddad", org="", title="Chief Executive Officer", hid="ap-9")
    base_hit = base_hit.model_copy(update={"linkedin_url": "http://www.linkedin.com/in/theo-haddad"})
    web_hit = _li("Théo Haddad", "CEO", "Bellum AI", "theo-haddad")
    wire(
        base=FakeBase(lambda *_: ([base_hit], ApolloSearchStatus.OK)),
        brave=FakeWeb("brave", [(lambda q: True, [web_hit])]),
    )
    out = await pns.search_person_by_name(full_name="Theo Haddad", organization_name="Bellum")
    assert len(out.hits) == 1
    assert out.hits[0].title == "Chief Executive Officer"
    assert out.hits[0].id == "ap-9"
    assert out.hits[0].organization_name == "Bellum AI"
    assert out.hits[0].match == "name_and_company"


# ── 7. Rien nulle part ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_nothing_anywhere_is_an_honest_empty_naming_the_families_asked(wire) -> None:
    wire()
    out = await pns.search_person_by_name(full_name="Zyx Qwerty", organization_name="Nulle Part")
    assert out.hits == []
    assert out.status == "empty"
    assert _queried(out) == {"contact_base": "empty", "legal_registry": "empty", "web": "empty"}
    assert all(s.count == 0 for s in out.sources_queried)


@pytest.mark.asyncio
async def test_empty_name_makes_no_call(wire) -> None:
    base, registry, brave, _ = wire()
    out = await pns.search_person_by_name(full_name="   ", organization_name="Bellum")
    assert out.hits == [] and out.status == "empty"
    assert base.calls == [] and registry.calls == [] and brave.calls == []


# ── 8. Journal ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_log_carries_normalized_query_and_counts_per_source(wire, caplog: pytest.LogCaptureFixture) -> None:
    wire(registry=FakeRegistry(THEO_REGISTRY), keys=())
    with caplog.at_level("INFO", logger=pns.logger.name):
        await pns.search_person_by_name(full_name="Théo  Haddad", organization_name="Bellum SAS")
    line = next(r.getMessage() for r in caplog.records if "person name search" in r.getMessage())
    assert "theo haddad" in line
    assert "bellum" in line
    assert "legal_registry=found:1" in line


# ── 9. Cache versionné ─────────────────────────────────────────────────────


def test_cache_namespace_is_versioned() -> None:
    # Recette 21/10 B.0 (#4386) — un résultat écrit avant le correctif (4 homonymes « Nom seul »)
    # ne doit jamais être relu : l espace de noms porte une version.
    assert pns._CACHE_NAMESPACE != "people:name_search"
    assert pns._CACHE_NAMESPACE.startswith("people:name_search:v")
