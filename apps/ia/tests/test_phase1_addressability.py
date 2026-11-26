"""#1579 — L'ADRESSABILITÉ REJOINT LE PORTEFEUILLE, DE LA MÊME MANIÈRE QUE LA
BARRIÈRE D'ACCÈS.

─────────────────────────────────────────────────────────────────────────────
LE DÉFAUT
─────────────────────────────────────────────────────────────────────────────
`discover_scoring.py` sait calculer l'adressabilité d'un candidat de
Découvrir — deux axes réels (le verrouillage A1, la proportion A2), trois axes
NOMMÉS mais non connaissables au stade registre (chemin, relation, coût
d'accès).

⚠️ #1631.5 — la RELATION a quitté ce troisième groupe SUR CE CHEMIN-LÀ : Phase 1
reçoit le relevé de la couche zéro (`crm_presence`), que Découvrir n'a pas. Elle
reste non mesurée quand aucun relevé n'arrive — jamais un zéro, voir les deux
tests dédiés en bas de fichier et la garde GA-272
(`test_discover_scoring_addressability_axes.py`).

Mais une fois le compte AJOUTÉ au portefeuille, cette valeur n'était
ni persistée ni recalculée comme une donnée du dossier : Phase 1
(`phase1_research.py`) calculait déjà `result["accessBarrier"]`
(`barrier_for_company`) et ne calculait JAMAIS `result["addressability"]`.

─────────────────────────────────────────────────────────────────────────────
CE QUE CE FICHIER TIENT
─────────────────────────────────────────────────────────────────────────────
Le même principe que celui déjà écrit sur `barrier_for_company` : « la
barrière d'un candidat de Découvrir OU d'un compte analysé ». Une SEULE
dérivation (`addressability_for_company`, ex-`_addressability`, rendue
PUBLIQUE pour ça) : Phase 1 l'appelle avec le MÊME `accessBarrier` qu'elle
vient de calculer, sur les MÊMES signaux de marché public — jamais un second
calcul qui pourrait diverger du premier.
"""

from __future__ import annotations

from contextlib import contextmanager
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.services.pappers import CompanyProfile, HeadquartersAddress

from tests.test_phase1_research import (
    MOCK_BRAVE_RESULTS,
    MOCK_BUNDLE_WITH_CONTENT,
    _claude_side_effect,
    _facts,
    _signals,
    _strategy,
)

MOCK_PROFILE = CompanyProfile(
    siren="552081317",
    legal_name="ACME INDUSTRIE",
    legal_form="SA",
    capital=1_000_000,
    creation_date="1990-01-01",
    naf_code="6202A",
    naf_label="Conseil en systèmes informatiques",
    activity_label="6202A - Conseil en systèmes informatiques",
    headcount_label="10 000 salariés et plus",
    revenue_latest=500_000_000,
    headquarters=HeadquartersAddress(address_line_1="1 rue de la Tech", postal_code="69000", city="Lyon"),
    executives=[],
    branch_count=0,
)

# `fetch_company` (recherche-entreprises) — le registre TEL QUE Phase 1 le lit
# pour construire la barrière (voir `_barrier_company` dans `phase1_research.py`).
# `category: "GE"` + `headcountRange` + `creationDate` donnent TROIS proxies
# mesurables (statut, effectif, ancienneté) — le plancher exact du §4.4 pour
# qu'une classe soit produite, sans dépendre du marché public (non mocké ici).
MOCK_ANNUAIRE = {
    "source": "recherche-entreprises",
    "name": "ACME INDUSTRIE",
    "siren": "552081317",
    "nafCode": "6202A",
    "category": "GE",
    "headcountRange": "10 000 salariés et plus",
    "etablissementCount": 3,
    "creationDate": "1990-01-01",
    "address": None,
    "city": "Lyon",
    "postalCode": "69000",
    "legalForm": "SA",
    "dirigeants": [],
}


@contextmanager
def _mocks():
    with (
        patch("app.routers.phase1_research.research_brave", new_callable=AsyncMock, return_value=MOCK_BRAVE_RESULTS),
        patch("app.routers.phase1_research.research_pappers", new_callable=AsyncMock, return_value=MOCK_PROFILE),
        patch(
            "app.routers.phase1_research.research_firecrawl",
            new_callable=AsyncMock,
            return_value=MOCK_BUNDLE_WITH_CONTENT,
        ),
        patch(
            "app.routers.phase1_research.call_claude",
            new_callable=AsyncMock,
            side_effect=_claude_side_effect(_facts(), _signals(), _strategy()),
        ),
        patch("app.routers.phase1_research.fetch_company", new_callable=AsyncMock, return_value=MOCK_ANNUAIRE),
    ):
        yield


def test_phase1_persists_addressability_alongside_the_access_barrier(client: TestClient) -> None:
    """`raw_analysis.addressability` existe désormais, avec la FORME du contrat
    (`score` | `max` | `unmeasured` | `factors`) — jamais un `0` sur un axe non
    couvert : les trois axes non connaissables au stade registre (chemin,
    relation, coût d'accès) sont NOMMÉS dans `unmeasured`, pas absents."""
    with _mocks():
        res = client.post(
            "/phase/1/research",
            json={"company_name": "ACME INDUSTRIE", "profile_data": {"size": "200-500"}},
        )

    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert "accessBarrier" in data
    assert "addressability" in data
    addressability = data["addressability"]
    assert set(addressability.keys()) >= {"score", "max", "unmeasured", "factors"}
    # Les trois axes que le stade registre ne peut PAS connaître restent NOMMÉS.
    for axis in ("path", "relation", "access_cost"):
        assert axis in addressability["unmeasured"], addressability

    # ⚠️ Ne JAMAIS transformer un axe non couvert en zéro : le score global n'est
    # `None` QUE si aucun axe n'a pu être mesuré — ici deux le sont (lock via la
    # barrière mesurable, proportion via le profil ESN), donc un chiffre réel.
    assert addressability["score"] is not None
    assert addressability["max"] > 0


def test_phase1_addressability_computes_proportion_from_the_seller_profile(client: TestClient) -> None:
    """A2 — la proportion compare la taille du COMPTE à celle du VENDEUR
    (`profile_data.size`). Sans cette donnée, la source (§6.4) dit que l'axe
    n'est pas connaissable au stade registre — ce test prouve qu'avec elle,
    Phase 1 le calcule VRAIMENT, pas seulement en théorie côté Découvrir."""
    with _mocks():
        res = client.post(
            "/phase/1/research",
            json={"company_name": "ACME INDUSTRIE", "profile_data": {"size": "200-500"}},
        )

    assert res.status_code == 200, res.text
    factors = res.json()["data"]["addressability"]["factors"]
    assert any(f["axis"] == "proportion" for f in factors), factors


def test_phase1_addressability_reuses_the_persisted_access_barrier_verbatim(client: TestClient) -> None:
    """#1579 — « réutiliser la MÊME vérité dans Découvrir ET dans Comptes » :
    l'axe de verrouillage (A1) de l'adressabilité doit citer EXACTEMENT le
    score et la classe du `accessBarrier` PERSISTÉ à côté — jamais une seconde
    barrière recalculée séparément, qui pourrait diverger de la première."""
    with _mocks():
        res = client.post(
            "/phase/1/research",
            json={"company_name": "ACME INDUSTRIE", "profile_data": {"size": "200-500"}},
        )

    assert res.status_code == 200, res.text
    data = res.json()["data"]
    barrier = data["accessBarrier"]
    assert barrier["measurable"] is True, barrier
    assert barrier["access_class"] is not None

    lock = next((f for f in data["addressability"]["factors"] if f["axis"] == "lock"), None)
    assert lock is not None, data["addressability"]
    # La preuve de la RÉUTILISATION, pas d'une simple présence : le score ET la
    # classe de la barrière PERSISTÉE se retrouvent, au caractère près, dans
    # l'evidence de l'axe — parce que c'est LE MÊME dict Python qui a voyagé,
    # jamais deux appels séparés à `barrier_for_company` / la classe estimée.
    assert str(barrier["score"]) in lock["evidence"]
    assert barrier["access_class"] in lock["evidence"]


def test_phase1_addressability_never_turns_an_uncovered_axis_into_zero(client: TestClient) -> None:
    """⚠️ Sans AUCUNE donnée de registre ni profil ESN, l'adressabilité doit
    rester ENTIÈREMENT non mesurée — jamais un 0/20 qui se lirait comme un
    compte inatteignable alors qu'on n'a simplement rien pu observer."""
    with (
        patch("app.routers.phase1_research.research_brave", new_callable=AsyncMock, return_value=MOCK_BRAVE_RESULTS),
        patch("app.routers.phase1_research.research_pappers", new_callable=AsyncMock, return_value=None),
        patch(
            "app.routers.phase1_research.research_firecrawl",
            new_callable=AsyncMock,
            return_value=MOCK_BUNDLE_WITH_CONTENT,
        ),
        patch(
            "app.routers.phase1_research.call_claude",
            new_callable=AsyncMock,
            side_effect=_claude_side_effect(_facts(), _signals(), _strategy()),
        ),
        patch("app.routers.phase1_research.fetch_company", new_callable=AsyncMock, return_value=None),
    ):
        res = client.post("/phase/1/research", json={"company_name": "Société Inconnue Du Registre"})

    assert res.status_code == 200, res.text
    addressability = res.json()["data"]["addressability"]
    assert addressability["score"] is None
    assert addressability["max"] == 0
    assert set(addressability["unmeasured"]) == {"lock", "proportion", "path", "relation", "access_cost"}


# ── #1631.5 — LA RELATION ARRIVE PAR LA COUCHE ZÉRO, PAS PAR LA MÉMOIRE ─────
#
# Le CÂBLE, pas le calcul : le calcul et sa règle « jamais zéro » sont tenus par
# GA-272 (`test_discover_scoring_addressability_axes.py`). Ces deux tests-ci
# prouvent la seule chose qu'une garde d'unité ne peut pas prouver — que la
# donnée VOYAGE vraiment du corps de la requête jusqu'au champ persisté.


def test_phase1_measures_the_relation_axis_when_the_zero_layer_matched(client: TestClient) -> None:
    """#1631.5 — « le nom vient TOUJOURS du CRM de l'utilisateur ».

    `crm_presence` n'est renseigné par l'API que sur un match RÉEL (au moins un
    contact ou un deal ouvert chez ce compte). Quand il arrive, l'axe RELATION
    est mesuré — et son plafond ENTRE au dénominateur.
    """
    with _mocks():
        res = client.post(
            "/phase/1/research",
            json={
                "company_name": "ACME INDUSTRIE",
                "profile_data": {"size": "200-500"},
                "crm_presence": (
                    "Votre CRM consulté pour « ACME INDUSTRIE » :\n"
                    "- 3 contact(s) déjà dans votre CRM chez ce groupe : Alice Martin (DSI)\n"
                    "- 1 deal(s) ouvert(s) : Refonte SI (negotiation, 50000 €)"
                ),
            },
        )

    assert res.status_code == 200, res.text
    addressability = res.json()["data"]["addressability"]
    relation = next((f for f in addressability["factors"] if f["axis"] == "relation"), None)
    assert relation is not None, addressability
    assert relation["points"] == 3
    assert "relation" not in addressability["unmeasured"]

    # ⚠️ RBAC (#1606.3) : `raw_analysis` est lu par TOUT l'espace, alors que le
    # relevé CRM est obtenu avec les identifiants d'UNE personne. Le nom du
    # contact d'un collègue ne doit jamais s'y retrouver.
    serialised = res.text
    assert "Alice Martin" not in serialised
    assert "Refonte SI (negotiation" not in serialised


def test_phase1_leaves_the_relation_unmeasured_without_a_crm_reading(client: TestClient) -> None:
    """⚠️ La moitié qui compte : sans relevé, l'axe reste NON MESURÉ.

    Un relevé vide recouvre trois causes indiscernables — pas de CRM connecté,
    un CRM consulté sans match, une lecture en échec. Un `0/3` affirmerait « ce
    compte n'est connu de personne », et ferait baisser l'adressabilité de tout
    espace sans CRM : le score mesurerait alors la complétude de NOS données.
    """
    with _mocks():
        res = client.post(
            "/phase/1/research",
            json={"company_name": "ACME INDUSTRIE", "profile_data": {"size": "200-500"}, "crm_presence": ""},
        )

    assert res.status_code == 200, res.text
    addressability = res.json()["data"]["addressability"]
    assert all(f["axis"] != "relation" for f in addressability["factors"]), addressability
    assert "relation" in addressability["unmeasured"]
    # Le plafond de la relation est SORTI du dénominateur — il n'y est pas resté
    # à zéro. Verrou (estimation de registre) + proportion, jamais + 3.
    assert addressability["max"] == 11, addressability


# ── #1631.3/.4, #1606.2 (lot 14) — LE CHEMIN ARRIVE PAR MarketMemoryService,
# PAS PAR UN SECOND CALCUL ──────────────────────────────────────────────────
#
# Le CÂBLE, pas le calcul : le barème et la règle « jamais un 0 » sont tenus
# par `test_discover_scoring_path_axis.py` (GA-272). Ces deux tests-ci prouvent
# la seule chose qu'une garde d'unité ne peut pas prouver — que le compte de
# parcours VOYAGE vraiment du corps de la requête jusqu'au champ persisté.
# Même défaut, même correctif que la relation ci-dessus (#1631.5) : le lot 13
# avait livré la fonction, aucun appelant ne lui passait l'ingrédient.


def test_phase1_measures_the_path_axis_when_the_market_memory_transmits_it(client: TestClient) -> None:
    """Le compte de parcours + l'ESN dominante, résolus côté API par
    `MarketMemoryService.pathAxisFor`, arrivent dans `ResearchRequest` — l'axe
    CHEMIN est mesuré et son plafond ENTRE au dénominateur."""
    with _mocks():
        res = client.post(
            "/phase/1/research",
            json={
                "company_name": "ACME INDUSTRIE",
                "profile_data": {"size": "200-500"},
                "market_paths_observed": 9,
                "market_top_esn": "ALTEN",
            },
        )

    assert res.status_code == 200, res.text
    addressability = res.json()["data"]["addressability"]
    path = next((f for f in addressability["factors"] if f["axis"] == "path"), None)
    assert path is not None, addressability
    assert "path" not in addressability["unmeasured"]
    assert "ALTEN" in path["evidence"]
    # « à qualifier » — jamais une présence actuelle (doctrine, #1631.3/.4).
    assert "qualifier" in path["evidence"]


def test_phase1_leaves_the_path_axis_unmeasured_without_a_market_memory_reading(client: TestClient) -> None:
    """⚠️ La moitié qui compte : sans compte de parcours transmis, l'axe reste
    NON MESURÉ — jamais un `0` qui ferait baisser l'adressabilité de tout
    compte que la mémoire marché n'a simplement pas encore vu."""
    with _mocks():
        res = client.post(
            "/phase/1/research",
            json={"company_name": "ACME INDUSTRIE", "profile_data": {"size": "200-500"}},
        )

    assert res.status_code == 200, res.text
    addressability = res.json()["data"]["addressability"]
    assert all(f["axis"] != "path" for f in addressability["factors"]), addressability
    assert "path" in addressability["unmeasured"]
    # Plafond SORTI du dénominateur — verrou + proportion, jamais + 5.
    assert addressability["max"] == 11, addressability
