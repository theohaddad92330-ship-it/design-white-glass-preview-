from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.routers import companies
from app.services.pappers.models import CompanySearchHit


def test_companies_discover_returns_suggestions(client: TestClient) -> None:
    hits = [
        CompanySearchHit.model_validate(
            {
                "siren": "542107651",
                "nom_entreprise": "Engie",
                "city": "Courbevoie",
                "libelle_code_naf": "Production d'électricité",
            }
        )
    ]

    with patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=hits):
        res = client.get("/companies/discover?q=energie&limit=1")

    assert res.status_code == 200
    assert res.json()["suggestions"] == [
        {
            "name": "Engie",
            "siren": "542107651",
            "city": "Courbevoie",
            "sector": "Production d'électricité",
            # Provenance registre absente du hit → null, jamais inventée.
            "postal_code": None,
            "employees_min": None,
            "employees_max": None,
            "creation_date": None,
            # Identité cross-border absente sur le chemin FR (dédup #494).
            "country": None,
            "registryId": None,
            "registryIdLabel": None,
            "is_esn_naf": None,
            "is_intermediary": False,
            # Les deux faits qui départagent deux homonymes (30/08/2026).
            # Absents du hit Pappers ⇒ `None`, jamais inventés.
            "headcount_label": None,
            "size_class": None,
            # #2162.9 — pas de `denomination` distincte sur ce hit ⇒ absente.
            "legal_name": None,
            # #2162.14 — hit sans `entreprise_cessee` ⇒ active.
            "is_active": True,
        }
    ]


def test_companies_discover_exposes_postal_code_and_headcount(client: TestClient) -> None:
    # Scoring hybride « comptes similaires » (addendum Théo) : le dept/région se
    # dérive du code postal du siège et la taille des effectifs registre — les
    # deux doivent transiter jusqu'à l'API NestJS quand Pappers les expose.
    hits = [
        CompanySearchHit.model_validate(
            {
                "siren": "552100554",
                "nom_entreprise": "Schneider Electric",
                "siege": {"ville": "Rueil-Malmaison", "code_postal": "92500"},
                "libelle_code_naf": "Fabrication de matériel électrique",
                "effectif_min": 5000,
                "effectif_max": 9999,
            }
        )
    ]

    with patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=hits):
        res = client.get("/companies/discover?q=electrique&limit=1")

    assert res.status_code == 200
    suggestion = res.json()["suggestions"][0]
    # Flattened from `siege` by the model validator.
    assert suggestion["city"] == "Rueil-Malmaison"
    assert suggestion["postal_code"] == "92500"
    assert suggestion["employees_min"] == 5000
    assert suggestion["employees_max"] == 9999


# ── #2162.9 — raison sociale (registre) distincte du nom commercial affiché ──


def test_companies_search_surfaces_the_legal_name_when_it_differs_from_the_displayed_name(
    client: TestClient,
) -> None:
    """`nom_entreprise` (le nom commercial, souvent) devient `name` ; la
    `denomination` (raison sociale registre) ne part qu'à part, et seulement
    parce qu'elle dit quelque chose de plus que `name`."""
    hits = [
        CompanySearchHit.model_validate(
            {
                "siren": "810669754",
                "nom_entreprise": "Kicklox",
                "denomination": "LINNAEUS",
                "libelle_code_naf": "Programmation informatique",
            }
        )
    ]

    with patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=hits):
        res = client.get("/companies/search?q=kicklox&limit=1")

    suggestion = res.json()["suggestions"][0]
    assert suggestion["name"] == "Kicklox"
    assert suggestion["legal_name"] == "LINNAEUS"


def test_companies_search_hides_the_legal_name_when_it_matches_the_displayed_name(client: TestClient) -> None:
    """Un fait redondant n'aide à rien distinguer (loi 4) : `denomination`
    identique à `name` ne s'affiche pas une seconde fois."""
    hits = [
        CompanySearchHit.model_validate(
            {
                "siren": "330703844",
                "nom_entreprise": "Capgemini",
                "denomination": "Capgemini",
                "libelle_code_naf": "Conseil",
            }
        )
    ]

    with patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=hits):
        res = client.get("/companies/search?q=capgemini&limit=1")

    suggestion = res.json()["suggestions"][0]
    assert suggestion["name"] == "Capgemini"
    assert suggestion["legal_name"] is None


# ── #2162.14 — statut administratif (actif / cessé) ──


def test_companies_search_marks_a_ceased_entity_as_inactive(client: TestClient) -> None:
    """`entreprise_cessee` était déjà parsé sur le hit Pappers (`has_ceased`)
    mais aucun appelant ne le lisait sur `/search` — une coquille radiée avait
    exactement la même apparence qu'une entité vivante."""
    hits = [
        CompanySearchHit.model_validate(
            {
                "siren": "111111111",
                "nom_entreprise": "SOCIETE RADIEE",
                "libelle_code_naf": "Programmation informatique",
                "entreprise_cessee": True,
            }
        )
    ]

    with patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=hits):
        res = client.get("/companies/search?q=radiee&limit=1")

    assert res.json()["suggestions"][0]["is_active"] is False


def test_companies_search_marks_an_active_entity_as_active(client: TestClient) -> None:
    hits = [
        CompanySearchHit.model_validate(
            {
                "siren": "330703844",
                "nom_entreprise": "Capgemini",
                "libelle_code_naf": "Conseil",
            }
        )
    ]

    with patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=hits):
        res = client.get("/companies/search?q=capgemini&limit=1")

    assert res.json()["suggestions"][0]["is_active"] is True


def test_companies_discover_forwards_naf_code_filter(client: TestClient) -> None:
    # Théo p.41 : comptes similaires par NAF — le code doit atteindre la recherche
    # Pappers comme filtre `code_naf`, pas seulement un match texte flou.
    with patch(
        "app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=[]
    ) as suggest:
        res = client.get("/companies/discover?q=programmation&limit=6&naf_code=62.01Z")

    assert res.status_code == 200
    filters = suggest.await_args.kwargs["filters"]
    assert filters.naf_code == "62.01Z"
    # Serializes to Pappers' wire name.
    assert filters.model_dump(exclude_none=True, by_alias=True)["code_naf"] == "62.01Z"


def test_companies_discover_without_naf_code_leaves_filter_empty(client: TestClient) -> None:
    with patch(
        "app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=[]
    ) as suggest:
        client.get("/companies/discover?q=programmation")
    assert suggest.await_args.kwargs["filters"].naf_code is None


# ── Multi-country autocomplete (recherche multi-pays #494) ────────────────────


def test_companies_search_fr_default_uses_pappers(client: TestClient) -> None:
    """No `country` (or `FR`) keeps the recherche-entreprises path byte-identical:
    the country-pack helper is NEVER consulted for the French default."""
    hits = [
        CompanySearchHit.model_validate(
            {"siren": "330703844", "nom_entreprise": "Capgemini", "libelle_code_naf": "Conseil"}
        )
    ]
    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=hits) as pappers,
        patch("app.routers.companies.suggest_registry_entities", new_callable=AsyncMock) as pack,
    ):
        res = client.get("/companies/search?q=cap&limit=1")

    assert res.status_code == 200
    suggestion = res.json()["suggestions"][0]
    assert suggestion["siren"] == "330703844"
    # FR suggestion carries no cross-border identity (byte-identical shape).
    assert suggestion["country"] is None
    assert suggestion["registryId"] is None
    pappers.assert_awaited_once()
    pack.assert_not_awaited()  # the country pack is never touched on the FR path


def test_companies_search_us_delegates_to_country_pack(client: TestClient) -> None:
    """A non-FR market delegates to the country pack; the resolved registry entity
    maps to a suggestion carrying its national id (CIK) — NOT a SIREN — so the
    international dedup (#494) key travels to the client. Fixes « Apple Inc
    introuvable »."""
    entity = {
        "source": "sec_edgar",
        "country": "US",
        "name": "Apple Inc.",
        "registryId": "0000320193",
        "registryIdLabel": "CIK",
        "seat": "Cupertino, CA",
        "legalForm": "",
    }
    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock) as pappers,
        patch(
            "app.routers.companies.suggest_registry_entities", new_callable=AsyncMock, return_value=[entity]
        ) as pack,
    ):
        res = client.get("/companies/search?q=apple&country=US&limit=5")

    assert res.status_code == 200
    suggestion = res.json()["suggestions"][0]
    assert suggestion == {
        "name": "Apple Inc.",
        "siren": "",  # no SIREN abroad — never fabricated
        "city": "Cupertino, CA",
        "sector": "",
        "postal_code": None,
        "employees_min": None,
        "employees_max": None,
        "creation_date": None,
        "country": "US",
        "registryId": "0000320193",
        "registryIdLabel": "CIK",
        "is_esn_naf": None,
        "is_intermediary": False,
        # Les faits de départage viennent du registre FRANÇAIS : un pack pays ne
        # les publie pas sous cette forme, ils restent absents plutôt que devinés.
        "headcount_label": None,
        "size_class": None,
        # #2162.9 — aucun équivalent Pappers `denomination` côté country pack.
        "legal_name": None,
        # #2162.14 — le pack pays ne publie pas ce fait ⇒ absent, jamais deviné.
        "is_active": None,
    }
    pappers.assert_not_awaited()  # Pappers never called for a foreign market
    assert pack.await_args.args[0] == "US"


def test_companies_search_country_without_source_returns_empty(client: TestClient) -> None:
    """A market whose pack resolves nothing (e.g. a LU company without an LEI) yields an empty list — the UI then falls back to « launch with the
    exact name ». No fabricated suggestion, ever."""
    with patch(
        "app.routers.companies.suggest_registry_entities", new_callable=AsyncMock, return_value=[]
    ):
        res = client.get("/companies/search?q=whatever&country=LU")

    assert res.status_code == 200
    assert res.json()["suggestions"] == []


# ── Fallback registre gratuit quand Pappers ne trouve rien (marque ≠ raison sociale) ──


def _registry_candidate(**overrides) -> dict:
    candidate = {
        "source": "recherche-entreprises",
        "siren": "810669754",
        "name": "LINNAEUS (KICKLOX)",
        "nafCode": "62.01Z",
        "nafLabel": "Programmation informatique",
        "city": "PARIS",
        "department": "75",
        "headcountTranche": "11",
        "isActive": True,
    }
    candidate.update(overrides)
    return candidate


def test_companies_search_falls_back_to_free_registry_when_pappers_is_empty(client: TestClient) -> None:
    """Pappers matche la RAISON SOCIALE : « Kicklox » (marque) ne remonte rien
    alors que la boîte existe (LINNAEUS). Le registre gratuit, lui, indexe la
    marque — sans ce fallback l'onboarding s'ouvre sur un menu vide."""
    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=[]),
        patch.object(
            companies.recherche_entreprises,
            "search_companies",
            new=AsyncMock(return_value=[_registry_candidate()]),
        ) as registry,
    ):
        res = client.get("/companies/search?q=Kicklox&limit=5")

    assert res.status_code == 200
    assert res.json()["suggestions"] == [
        {
            "name": "LINNAEUS (KICKLOX)",
            "siren": "810669754",
            "city": "PARIS",
            "sector": "Programmation informatique",
            # Le registre gratuit n'expose ni code postal ni bornes d'effectif :
            # absents plutôt qu'inventés.
            "postal_code": None,
            "employees_min": None,
            "employees_max": None,
            "creation_date": None,
            "country": None,
            "registryId": None,
            "registryIdLabel": None,
            "is_esn_naf": None,
            "is_intermediary": False,
            # Le registre publie la TRANCHE d'effectif : on la décode, on ne
            # l'estime pas. C'est le fait qui départage deux homonymes.
            "headcount_label": "10 à 19 salariés",
            "size_class": None,
            # #2162.9 — le registre gratuit ne distingue pas raison sociale et
            # marque : `name` porte déjà les deux (« LINNAEUS (KICKLOX) »).
            "legal_name": None,
            # #2162.14 — ce chemin filtre déjà les entités cessées en amont.
            "is_active": True,
        }
    ]
    # Le bassin RÉCUPÉRÉ n'est plus le bassin AFFICHÉ : la source rend de quoi
    # classer, l'écran en montre `limit`. Et elle est interrogée avec le rappel
    # par taille, sans lequel aucun classement ne peut trouver la bonne société.
    assert registry.await_args.kwargs["limit"] == companies.REGISTRY_SUGGESTION_POOL
    assert registry.await_args.kwargs["staffed_recall"] is True


def test_companies_search_never_calls_the_fallback_when_pappers_has_hits(client: TestClient) -> None:
    """Strictement ADDITIF : dès que Pappers répond, le comportement est
    byte-identique à avant (aucun appel au registre gratuit)."""
    hits = [
        CompanySearchHit.model_validate(
            {"siren": "330703844", "nom_entreprise": "Capgemini", "libelle_code_naf": "Conseil"}
        )
    ]
    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=hits),
        patch.object(companies.recherche_entreprises, "search_companies", new=AsyncMock()) as registry,
    ):
        res = client.get("/companies/search?q=capgemini&limit=5")

    assert res.json()["suggestions"][0]["name"] == "Capgemini"
    registry.assert_not_awaited()


def test_companies_search_returns_empty_when_both_sources_are_empty(client: TestClient) -> None:
    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=[]),
        patch.object(companies.recherche_entreprises, "search_companies", new=AsyncMock(return_value=[])),
    ):
        res = client.get("/companies/search?q=nexistepas&limit=5")

    assert res.status_code == 200
    assert res.json()["suggestions"] == []


def test_companies_search_fallback_soft_fails_on_registry_error(client: TestClient) -> None:
    """Le fallback en erreur rend une liste vide, jamais un 5xx."""
    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=[]),
        patch.object(
            companies.recherche_entreprises,
            "search_companies",
            new=AsyncMock(side_effect=RuntimeError("registry down")),
        ),
    ):
        res = client.get("/companies/search?q=Kicklox")

    assert res.status_code == 200
    assert res.json()["suggestions"] == []


def test_companies_search_fallback_decodes_the_naf_label_when_missing(client: TestClient) -> None:
    """Le registre gratuit renvoie souvent le CODE sans son libellé (cas réel :
    Kicklox comme Capgemini) — on le décode pour que la ligne du menu porte un
    secteur, sinon elle est difficile à choisir."""
    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=[]),
        patch.object(
            companies.recherche_entreprises,
            "search_companies",
            new=AsyncMock(return_value=[_registry_candidate(nafLabel=None, nafCode="62.01Z")]),
        ),
    ):
        res = client.get("/companies/search?q=Kicklox")

    assert res.json()["suggestions"][0]["sector"] == "Programmation informatique"


def test_companies_search_fallback_decodes_the_naf_division_for_a_non_it_row(client: TestClient) -> None:
    """Hors nomenclature IT, on retombe sur le libellé de DIVISION NAF.

    Ce test disait auparavant « sector reste vide ». C'était trop prudent : une
    ligne sans secteur est précisément celle que le commercial ne peut pas
    distinguer d'une SCI homonyme. Décoder une nomenclature PUBLIQUE n'est pas
    fabriquer une donnée — même principe que les libellés de tranche INSEE.
    """
    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=[]),
        patch.object(
            companies.recherche_entreprises,
            "search_companies",
            new=AsyncMock(return_value=[_registry_candidate(nafLabel=None, nafCode="70.22Z")]),
        ),
    ):
        res = client.get("/companies/search?q=conseil")

    assert res.json()["suggestions"][0]["sector"] == "Conseil de gestion"


def test_companies_search_fallback_leaves_sector_empty_when_undecodable(client: TestClient) -> None:
    """Une division hors table ne produit AUCUN libellé inventé."""
    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=[]),
        patch.object(
            companies.recherche_entreprises,
            "search_companies",
            new=AsyncMock(return_value=[_registry_candidate(nafLabel=None, nafCode="99.00Z")]),
        ),
    ):
        res = client.get("/companies/search?q=organisation")

    assert res.json()["suggestions"][0]["sector"] == ""


def test_companies_search_fallback_drops_ceased_entities(client: TestClient) -> None:
    """Une coquille radiée n'est pas « votre entreprise » — mieux vaut ne rien
    proposer que de proposer une entité morte."""
    candidates = [
        _registry_candidate(siren="111111111", name="KICKLOX RADIÉE", isActive=False),
        _registry_candidate(),
    ]
    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=[]),
        patch.object(
            companies.recherche_entreprises, "search_companies", new=AsyncMock(return_value=candidates)
        ),
    ):
        res = client.get("/companies/search?q=Kicklox")

    suggestions = res.json()["suggestions"]
    assert [s["siren"] for s in suggestions] == ["810669754"]


def test_companies_search_fallback_is_not_used_on_the_country_pack_path(client: TestClient) -> None:
    """Le chemin non-FR reste inchangé : un marché étranger sans résultat ne
    retombe PAS sur le registre français."""
    with (
        patch("app.routers.companies.suggest_registry_entities", new_callable=AsyncMock, return_value=[]),
        patch.object(companies.recherche_entreprises, "search_companies", new=AsyncMock()) as registry,
    ):
        res = client.get("/companies/search?q=whatever&country=US")

    assert res.json()["suggestions"] == []
    registry.assert_not_awaited()


def test_companies_search_unknown_country_falls_back_to_fr(client: TestClient) -> None:
    """An unregistered / malformed country normalises to FR (recherche-entreprises)
    rather than silently activating a pack — the safe default."""
    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=[]) as pappers,
        patch("app.routers.companies.suggest_registry_entities", new_callable=AsyncMock) as pack,
    ):
        res = client.get("/companies/search?q=cap&country=ZZ")

    assert res.status_code == 200
    pappers.assert_awaited_once()
    pack.assert_not_awaited()


# ── Lentille ESN sur l'autocomplétion ────────────────────────────────────────
#
# L'autocomplete souffre du même mal que le prefill : le top-N brut du registre
# libre est truffé de parasites, et choisir une suggestion ÉPINGLE son SIREN —
# ce qui court-circuite la désambiguïsation. Elle doit donc être classée AUSSI.
# Mais `/companies/search` sert aussi la recherche de comptes prospects : le
# classement ESN est opt-in via `lens=esn`, jamais global.

_SCI_ROW = {
    "source": "recherche-entreprises",
    "siren": "352000000",
    "name": "SCI CARREFOUR DU CANNET",
    "legalName": "SCI CARREFOUR DU CANNET",
    "nafCode": "68.20A",
    "nafLabel": None,
    "city": "LE CANNET",
    "department": "06",
    "headcountTranche": "00",
    "establishmentCount": 1,
    "isActive": True,
}

_CARREFOUR_ROW = {
    "source": "recherche-entreprises",
    "siren": "652014051",
    "name": "CARREFOUR",
    "legalName": "CARREFOUR",
    "nafCode": "70.10Z",
    "nafLabel": None,
    "city": "MASSY",
    "department": "91",
    "headcountTranche": "52",
    "establishmentCount": 12,
    "isActive": True,
}




def test_esn_lens_ranks_the_sci_below_the_real_company(client: TestClient) -> None:
    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=[]),
        patch.object(
            companies.recherche_entreprises,
            "search_companies",
            new=AsyncMock(return_value=[_SCI_ROW, _CARREFOUR_ROW]),
        ),
    ):
        res = client.get("/companies/search?q=Carrefour&limit=5&lens=esn")

    names = [s["name"] for s in res.json()["suggestions"]]
    assert names == ["CARREFOUR", "SCI CARREFOUR DU CANNET"]


def test_esn_lens_never_removes_a_suggestion(client: TestClient) -> None:
    """Une ESN peut avoir un NAF atypique : on classe, on ne supprime pas."""
    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=[]),
        patch.object(
            companies.recherche_entreprises,
            "search_companies",
            new=AsyncMock(return_value=[_SCI_ROW, _CARREFOUR_ROW]),
        ),
    ):
        res = client.get("/companies/search?q=Carrefour&limit=5&lens=esn")

    assert len(res.json()["suggestions"]) == 2


def test_esn_lens_flags_a_row_whose_naf_contradicts_an_esn(client: TestClient) -> None:
    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=[]),
        patch.object(
            companies.recherche_entreprises,
            "search_companies",
            new=AsyncMock(return_value=[_SCI_ROW]),
        ),
    ):
        res = client.get("/companies/search?q=Carrefour&limit=5&lens=esn")

    row = res.json()["suggestions"][0]
    assert row["is_esn_naf"] is False
    # ... et la ligne porte un secteur LISIBLE, décodé de la division NAF, alors
    # que le registre n'a renvoyé aucun libellé : sans ça le commercial ne peut
    # pas distinguer la SCI d'un vrai résultat.
    assert row["sector"] == "Activités immobilières"


def test_generic_lens_does_not_carry_the_esn_flag(client: TestClient) -> None:
    """La recherche de comptes prospects passe par le MÊME endpoint : elle ne
    doit pas subir le drapeau de cohérence ESN — un prospect n'est PAS une ESN,
    l'y juger n'aurait aucun sens.

    ⚠️ Ce test s'appelait « keeps the registry order untouched » et affirmait
    l'inverse de la ligne ci-dessous. Il décrivait fidèlement un défaut : l'ordre
    brut du registre, c'est la SCI en tête, et sur « ROCHE » c'était CINQ SCI sans
    le laboratoire — un dossier de production a été bâti sur le mauvais homonyme
    (30/08/2026). L'ordre générique est désormais celui du barème PROSPECT, où la
    taille prime ; ce qui reste vrai, et ce que ce test garde, c'est que la
    lentille ESN, elle, ne déborde pas sur ce chemin.
    """
    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=[]),
        patch.object(
            companies.recherche_entreprises,
            "search_companies",
            new=AsyncMock(return_value=[_SCI_ROW, _CARREFOUR_ROW]),
        ),
    ):
        res = client.get("/companies/search?q=Carrefour&limit=5")

    suggestions = res.json()["suggestions"]
    assert [s["name"] for s in suggestions] == ["CARREFOUR", "SCI CARREFOUR DU CANNET"]
    assert all(s["is_esn_naf"] is None for s in suggestions)


def test_esn_lens_leaves_the_pappers_path_alone(client: TestClient) -> None:
    """Pappers matche la raison sociale et ne présente pas le problème des
    homonymes parasites — son ordre reste intact, même sous `lens=esn`."""
    hits = [
        CompanySearchHit.model_validate({"siren": "111111111", "nom_entreprise": "ZZZ", "libelle_code_naf": "Conseil"}),
        CompanySearchHit.model_validate({"siren": "222222222", "nom_entreprise": "AAA", "libelle_code_naf": "Conseil"}),
    ]
    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=hits),
        patch.object(companies.recherche_entreprises, "search_companies", new=AsyncMock()) as registry,
    ):
        res = client.get("/companies/search?q=conseil&limit=5&lens=esn")

    assert [s["name"] for s in res.json()["suggestions"]] == ["ZZZ", "AAA"]
    registry.assert_not_awaited()


# ── #2265.14 (épopée #2851) — badge « intermédiaire » aussi sur la recherche prospect ──


def test_companies_search_pappers_path_flags_a_recruitment_agency(client: TestClient) -> None:
    """Même jugement que /discover (`classify_actor_type`), sur le NAF Pappers
    déjà résolu par ce hit — pas gated sur `lens=esn` : un cabinet de
    recrutement n'est pas moins un intermédiaire vu depuis la recherche
    prospect générique."""
    hits = [
        CompanySearchHit.model_validate(
            {"siren": "300000001", "nom_entreprise": "ACME RECRUTEMENT", "libelle_code_naf": "78.10Z", "code_naf": "78.10Z"}
        )
    ]
    with patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=hits):
        res = client.get("/companies/search?q=acme")

    assert res.json()["suggestions"][0]["is_intermediary"] is True


def test_companies_search_fallback_flags_a_placement_platform(client: TestClient) -> None:
    """Même jugement, chemin registre gratuit (`_registry_candidates_to_response`)."""
    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=[]),
        patch.object(
            companies.recherche_entreprises,
            "search_companies",
            new=AsyncMock(return_value=[_registry_candidate(nafCode="78.30Z", nafLabel="Autre mise à disposition")]),
        ),
    ):
        res = client.get("/companies/search?q=Kicklox")

    assert res.json()["suggestions"][0]["is_intermediary"] is True


# ── #3434.2 — la tranche ouverte « 10 000 et plus » donne son plancher ──────


def test_pappers_open_tranche_label_gives_a_headcount_floor(client: TestClient) -> None:
    """Pappers dit « 10 000 salariés et plus » sans `effectif_min` : le plancher publié
    (10 000) voyage, sinon le garde-fou de périmètre ne voit jamais Michelin."""
    hits = [
        CompanySearchHit.model_validate(
            {"siren": "855200507", "nom_entreprise": "Michelin", "city": "Clermont-Ferrand", "effectif": "10 000 salariés et plus"}
        )
    ]
    with patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=hits):
        res = client.get("/companies/discover?q=michelin&limit=1")

    suggestion = res.json()["suggestions"][0]
    assert suggestion["employees_min"] == 10000
    assert suggestion["employees_max"] is None
    assert suggestion["headcount_label"] == "10 000 salariés et plus"


def test_pappers_closed_tranche_never_invents_a_floor(client: TestClient) -> None:
    hits = [
        CompanySearchHit.model_validate(
            {"siren": "1", "nom_entreprise": "Acme", "effectif": "100 à 199 salariés"}
        )
    ]
    with patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=hits):
        res = client.get("/companies/discover?q=acme&limit=1")

    suggestion = res.json()["suggestions"][0]
    assert suggestion["employees_min"] is None
    assert suggestion["headcount_label"] == "100 à 199 salariés"


def test_registry_open_tranche_code_gives_a_headcount_floor() -> None:
    rows = [
        {"name": "MICHELIN", "siren": "855200507", "city": "CLERMONT", "headcountTranche": "53", "isActive": True},
        {"name": "PETITE", "siren": "2", "city": "X", "headcountTranche": "11", "isActive": True},
    ]
    out = companies._registry_candidates_to_response(rows, esn_lens=False)
    by_name = {s.name: s for s in out.suggestions}
    assert by_name["MICHELIN"].employees_min == 10000
    assert by_name["MICHELIN"].headcount_label == "10 000 salariés et plus"
    assert by_name["PETITE"].employees_min is None
