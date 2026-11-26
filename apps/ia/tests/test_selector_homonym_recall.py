"""GA-104 — le sélecteur d'entreprise ne prend jamais l'ordre brut du registre.

─────────────────────────────────────────────────────────────────────────────
LE DÉFAUT, MESURÉ EN PRODUCTION LE 30/08/2026
─────────────────────────────────────────────────────────────────────────────
Le bouton « Analyser une entreprise » ouvre une modale qui promet, textuellement,
« Bellum n'analyse que des sociétés qu'il a identifiées, **pour ne pas se tromper
d'homonyme** ». On y tape ``ROCHE`` : la liste rend cinq SCI et de l'immobilier.
Le laboratoire Roche — SIREN 552012031, ETI, 500 à 999 salariés, siège à
Boulogne-Billancourt — n'y est pas. Il n'existe donc AUCUN chemin pour l'analyser
depuis l'écran qui promet de ne pas se tromper d'homonyme.

Le dossier ROCHE de Louis, en production, a été bâti sur ROCHE BOBOIS.

─────────────────────────────────────────────────────────────────────────────
LA CAUSE : UN PROBLÈME DE RAPPEL, PAS DE TRI
─────────────────────────────────────────────────────────────────────────────
``recherche-entreprises.api.gouv.fr`` rend **10 000** résultats pour ``q=ROCHE``
et son tri par défaut ne tient aucun compte de la taille. Mesuré : les **25**
premières lignes sont des SCI, de l'immobilier et du commerce de détail — le
laboratoire n'y figure PAS.

Deux conséquences qui ont dicté le correctif :

* **monter le nombre de lignes ne suffit pas.** Le plafond de cinq décidait bien
  à la place de l'utilisateur, mais le passer à vingt-cinq ne fait pas apparaître
  la bonne société — elle n'est dans aucune des vingt-cinq ;
* **reclasser ne suffit pas non plus.** Un classement ne peut ordonner que ce que
  la source a rendu. Classer parfaitement vingt-cinq SCI donne vingt-cinq SCI.

Il fallait donc élargir le RAPPEL. Et l'élargir sans EXCLURE personne : filtrer
sur ``categorie_entreprise=ETI,GE`` remonterait ROCHE au premier rang et
casserait tout le reste — les clients d'une ESN ne sont pas tous des ETI, et une
PME de 200 personnes est une cible parfaitement légitime.

Le correctif est donc un rappel **ADDITIF** : la même requête est posée une
seconde fois au registre, restreinte aux entités qui DÉCLARENT dix salariés ou
plus, et l'union des deux pages est classée. Aucune ligne de la page historique
ne disparaît ; on ajoute celles que son tri enterrait. Puis on classe avec le
barème qui existait déjà pour « quel THALES est mon prospect ? »
(``homonym_disambiguation``), où la TAILLE prime — celui-là même que le chemin
d'analyse utilise depuis des mois et que le sélecteur n'appelait pas.

─────────────────────────────────────────────────────────────────────────────
CE QUE CETTE GARDE VÉRIFIE
─────────────────────────────────────────────────────────────────────────────
 1. sur la capture RÉELLE du registre, ``ROCHE`` fait apparaître le SIREN
    552012031 dans les suggestions rendues, à un rang utilisable ;
 2. le rappel est ADDITIF — aucune ligne de la page historique ne sort du bassin ;
 3. le classement CLASSE (une garde qui vérifierait qu'un classement « existe »
    sans vérifier qu'il ordonne serait borgne) ;
 4. le classement ne SUPPRIME jamais : l'utilisateur choisit, on ne choisit pas
    pour lui — c'est la nuance avec ``/discover``, où écarter un homonyme non
    tranché est le bon geste parce qu'on y explore un volume ;
 5. la lentille ESN de l'onboarding reste intacte, et le chemin Pappers aussi.

Les deux preuves exigées d'une garde sont en fin de fichier : elle LIT quelque
chose (§ « le corpus n'est pas vide ») et elle sait dire NON (§ « la garde sait
dire non »).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.routers import companies
from app.services import homonym_disambiguation
from app.services.data_sources import _http_pool, recherche_entreprises

# apps/ia/tests/<ce fichier> → golden/registry/…
_FIXTURE = Path(__file__).resolve().parent / "golden" / "registry" / "roche_homonyms.json"

#: Le SIREN du laboratoire Roche. Valeur PUBLIQUE du registre — aucune donnée
#: fabriquée (règle projet).
LABORATOIRE_ROCHE = "552012031"

#: Le rang au-delà duquel une suggestion n'aide plus : la liste en montre cinq.
RANG_UTILISABLE = 3


def _fixture() -> dict[str, Any]:
    return json.loads(_FIXTURE.read_text(encoding="utf-8"))


class _FakeResponse:
    """Juste ce que le client de source lit : ``status_code``, ``json()``,
    ``raise_for_status()``, ``is_success``, ``headers``."""

    status_code = 200
    is_success = True
    headers: dict[str, str] = {}

    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def json(self) -> dict[str, Any]:
        return self._payload

    def raise_for_status(self) -> None:
        return None


class _RegistryFromFixture:
    """Le registre, servi depuis la capture réelle — jamais depuis le réseau.

    Il répond comme le vrai : la présence de ``tranche_effectif_salarie`` dans la
    requête sélectionne la page de rappel, son absence la page historique. Les
    requêtes reçues sont conservées pour que les tests puissent affirmer ce qui a
    été RÉELLEMENT demandé à la source.
    """

    def __init__(self, payloads: dict[str, Any]) -> None:
        self._payloads = payloads
        self.requests: list[dict[str, str]] = []

    async def get(self, _url: str, params: dict[str, str] | None = None) -> _FakeResponse:
        query = dict(params or {})
        self.requests.append(query)
        page = "staffed" if query.get("tranche_effectif_salarie") else "plain"
        payload = dict(self._payloads[page])
        per_page = int(query.get("per_page") or len(payload["results"]))
        payload["results"] = payload["results"][:per_page]
        return _FakeResponse(payload)

    async def aclose(self) -> None:
        return None


@pytest.fixture
def registry(monkeypatch: pytest.MonkeyPatch) -> _RegistryFromFixture:
    """Branche la capture réelle à la place du transport HTTP du client de source.

    #2604.2 — `recherche_entreprises.py` ne construit plus son propre
    `httpx.AsyncClient()` : il va chercher le client partagé de PROCESS via
    `get_shared_client("recherche_entreprises")`. On sème donc directement
    `_http_pool._clients["recherche_entreprises"]` avec le faux registre,
    plutôt que de monkeypatcher `recherche_entreprises.httpx.AsyncClient`
    (qui n'est plus lu)."""
    fake = _RegistryFromFixture(_fixture())
    monkeypatch.setitem(_http_pool._clients, "recherche_entreprises", fake)
    return fake


def _search(client: TestClient, url: str) -> list[dict[str, Any]]:
    """La recherche d'autocomplétion, Pappers muet — c'est l'état de la
    production depuis que sa clé est à court de crédits, et donc le chemin qui a
    produit le dossier corrompu."""
    with patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=[]):
        res = client.get(url)
    assert res.status_code == 200
    return res.json()["suggestions"]


# ─────────────────────────────────────────────────────────────────────────────
# 1. Le défaut lui-même
# ─────────────────────────────────────────────────────────────────────────────


def test_roche_fait_apparaitre_le_laboratoire(client: TestClient, registry: _RegistryFromFixture) -> None:
    """Le cas de recette, sur la capture réelle du registre."""
    suggestions = _search(client, "/companies/search?q=ROCHE&limit=5")

    sirens = [s["siren"] for s in suggestions]
    assert LABORATOIRE_ROCHE in sirens, (
        "Le laboratoire Roche (SIREN 552012031, ETI, 500 à 999 salariés) n'est pas "
        f"dans les suggestions rendues pour « ROCHE ». Rendus : {sirens}"
    )
    rang = sirens.index(LABORATOIRE_ROCHE) + 1
    assert rang <= RANG_UTILISABLE, f"Trouvé, mais au rang {rang} — hors de portée d'un choix."


def test_la_ligne_porte_de_quoi_distinguer_deux_homonymes(
    client: TestClient, registry: _RegistryFromFixture
) -> None:
    """« 5 des résultats portent le nom ROCHE » sous cinq lignes n'aide à choisir
    entre aucune d'elles. L'effectif, la catégorie et le SIREN, si."""
    suggestions = _search(client, "/companies/search?q=ROCHE&limit=5")
    labo = next(s for s in suggestions if s["siren"] == LABORATOIRE_ROCHE)

    assert labo["headcount_label"] == "500 à 999 salariés"
    assert labo["size_class"] == "ETI"
    assert labo["city"] == "BOULOGNE-BILLANCOURT"


def test_une_ligne_sans_effectif_publie_ne_dit_pas_zero(
    client: TestClient, registry: _RegistryFromFixture
) -> None:
    """Le registre écrit ``NN`` quand il ne sait pas. « Non mesuré » n'est jamais
    « 0 salarié » : le champ reste absent, il ne se replie sur rien."""
    suggestions = _search(client, "/companies/search?q=ROCHE&limit=5")
    inconnus = [s for s in suggestions if s["headcount_label"] is None]
    assert inconnus, "La capture réelle contient des lignes à tranche NN — le test ne lirait rien sans elles."
    for row in inconnus:
        assert row["headcount_label"] is None


# ─────────────────────────────────────────────────────────────────────────────
# 2. Le rappel est ADDITIF, jamais un filtre
# ─────────────────────────────────────────────────────────────────────────────


def test_le_rappel_pose_les_deux_requetes(client: TestClient, registry: _RegistryFromFixture) -> None:
    """Une requête historique, une requête de rappel — et la seconde porte le
    MÊME ``q``. Un rappel qui changerait la question ne répondrait plus à ce que
    l'utilisateur a tapé."""
    _search(client, "/companies/search?q=ROCHE&limit=5")

    posees = [r for r in registry.requests if r.get("q") == "ROCHE"]
    assert len(posees) == 2, f"Attendu deux requêtes (historique + rappel), vu : {registry.requests}"
    tranches = [r.get("tranche_effectif_salarie") for r in posees]
    assert None in tranches, "La requête historique a disparu — le rappel est devenu un filtre."
    assert any(t for t in tranches), "Aucune requête de rappel : la source ne peut pas rendre la bonne société."


def test_aucune_ligne_de_la_page_historique_ne_sort_du_bassin(
    client: TestClient, registry: _RegistryFromFixture
) -> None:
    """La preuve que ce n'est pas une exclusion : le bassin classé CONTIENT
    toujours toute la page historique. Une SCI reste choisissable — elle est
    peut-être la société que le commercial cherche."""
    rows = recherche_entreprises.merge_registry_pages(
        [recherche_entreprises._candidate(r) for r in _fixture()["plain"]["results"]],
        [recherche_entreprises._candidate(r) for r in _fixture()["staffed"]["results"]],
    )
    bassin = {r["siren"] for r in rows}
    historiques = {str(r["siren"]) for r in _fixture()["plain"]["results"]}
    assert historiques <= bassin, f"Lignes perdues : {sorted(historiques - bassin)}"
    assert LABORATOIRE_ROCHE in bassin


# ─────────────────────────────────────────────────────────────────────────────
# 3. Le classement CLASSE — et ne supprime rien
# ─────────────────────────────────────────────────────────────────────────────


def test_le_classement_remonte_la_societe_qui_a_des_salaries(client: TestClient) -> None:
    """À nom égal, une société dont le registre PUBLIE une tranche d'effectif
    passe devant une SCI dont il ne publie rien. Ce n'est pas une probabilité
    affichée : c'est un ordre de liste, et rien de ce barème n'atteint l'écran."""
    plain = [recherche_entreprises._candidate(r) for r in _fixture()["plain"]["results"]]
    staffed = [recherche_entreprises._candidate(r) for r in _fixture()["staffed"]["results"]]
    pool = recherche_entreprises.merge_registry_pages(plain, staffed)

    avant = [r["siren"] for r in pool]
    apres = [r["siren"] for r in homonym_disambiguation.order_prospect_suggestions("ROCHE", pool)]

    assert avant != apres, "Le « classement » rend l'ordre reçu : il ne classe rien."
    assert apres[0] == LABORATOIRE_ROCHE, f"Premier rang : {apres[0]}"


def test_le_classement_ne_supprime_jamais_une_ligne(client: TestClient) -> None:
    """La nuance avec ``/discover`` : là-bas on ÉCARTE l'homonymie non tranchée
    parce qu'on explore un volume ; ici l'utilisateur cherche une société précise
    et doit pouvoir la choisir. Le point commun des deux n'est pas « écarter »,
    c'est ne jamais trancher à sa place."""
    pool = [recherche_entreprises._candidate(r) for r in _fixture()["plain"]["results"]]
    ordonne = homonym_disambiguation.order_prospect_suggestions("ROCHE", pool)

    assert len(ordonne) == len(pool)
    assert {r["siren"] for r in ordonne} == {r["siren"] for r in pool}


def test_le_classement_ne_prime_jamais_sur_un_bien_meilleur_nom(client: TestClient) -> None:
    """Une grosse société au nom lointain ne passe pas devant la petite société
    dont le nom est EXACTEMENT ce qui a été tapé. Sans cette borne, chercher une
    PME reviendrait à se voir proposer le plus gros voisin."""
    petite_exacte = {
        "siren": "810669754",
        "name": "KICKLOX",
        "legalName": "LINNAEUS",
        "nafCode": "62.01Z",
        "headcountTranche": "02",
        "sizeClass": "PME",
        "establishmentCount": 1,
        "isActive": True,
    }
    grosse_lointaine = {
        "siren": "652014051",
        "name": "KICKLOX PARTICIPATIONS ET IMMOBILIER DU SUD",
        "legalName": "KICKLOX PARTICIPATIONS ET IMMOBILIER DU SUD",
        "nafCode": "68.20A",
        "headcountTranche": "52",
        "sizeClass": "GE",
        "establishmentCount": 40,
        "isActive": True,
    }
    ordonne = homonym_disambiguation.order_prospect_suggestions("KICKLOX", [grosse_lointaine, petite_exacte])
    assert [r["siren"] for r in ordonne][0] == "810669754"


# ─────────────────────────────────────────────────────────────────────────────
# 4. Ce qui ne bouge pas
# ─────────────────────────────────────────────────────────────────────────────


def test_la_lentille_esn_garde_son_propre_classement(client: TestClient, registry: _RegistryFromFixture) -> None:
    """L'onboarding demande « quelle est VOTRE ESN ? » : là c'est la cohérence NAF
    qui prime, pas la taille. Les deux lentilles restent distinctes."""
    suggestions = _search(client, "/companies/search?q=ROCHE&limit=5&lens=esn")
    assert suggestions, "La lentille ESN ne rend plus rien."
    assert all(s["is_esn_naf"] is not None or s["sector"] for s in suggestions)


def test_le_chemin_pappers_reste_intact(client: TestClient) -> None:
    """Pappers matche la raison sociale et ne présente pas le problème des
    homonymes parasites : son ordre n'est pas touché, et le registre n'est même
    pas appelé."""
    from app.services.pappers.models import CompanySearchHit

    hits = [
        CompanySearchHit.model_validate({"siren": "111111111", "nom_entreprise": "ZZZ"}),
        CompanySearchHit.model_validate({"siren": "222222222", "nom_entreprise": "AAA"}),
    ]
    with (
        patch("app.routers.companies.search_company_suggestions", new_callable=AsyncMock, return_value=hits),
        patch.object(companies.recherche_entreprises, "search_companies", new=AsyncMock()) as registre,
    ):
        res = client.get("/companies/search?q=conseil&limit=5")

    assert [s["name"] for s in res.json()["suggestions"]] == ["ZZZ", "AAA"]
    registre.assert_not_awaited()


def test_un_siren_tape_dans_le_champ_trouve_la_societe(client: TestClient, registry: _RegistryFromFixture) -> None:
    """Le registre matche un SIREN posé en texte libre : il n'y a donc rien à
    ajouter pour que ``552012031`` trouve le laboratoire — mais il y a un rappel
    à NE PAS poser. Une requête à un seul résultat n'a rien à élargir, et la
    seconde requête serait un appel réseau pour rien à chaque frappe."""
    _search(client, f"/companies/search?q={LABORATOIRE_ROCHE}&limit=5")
    assert len(registry.requests) == 1, f"Un rappel inutile a été posé : {registry.requests}"


# ─────────────────────────────────────────────────────────────────────────────
# 5. Preuve n°1 — la garde LIT quelque chose
# ─────────────────────────────────────────────────────────────────────────────


def test_le_corpus_nest_pas_vide() -> None:
    """Une garde dont le corpus est vide passe au vert sans rien lire — six
    gardes borgnes en deux jours l'ont prouvé."""
    data = _fixture()
    assert _FIXTURE.is_file(), f"capture registre introuvable : {_FIXTURE}"
    assert len(data["plain"]["results"]) >= 10
    assert len(data["staffed"]["results"]) >= 10
    # La capture est bien la MESURE du défaut : le laboratoire est absent de la
    # page historique et présent dans celle du rappel. Si un jour ce n'est plus
    # vrai, cette garde le dira au lieu de continuer à protéger un fait périmé.
    assert LABORATOIRE_ROCHE not in {str(r["siren"]) for r in data["plain"]["results"]}
    assert LABORATOIRE_ROCHE in {str(r["siren"]) for r in data["staffed"]["results"]}
    assert data["plain"]["total_results"] > 1000


def test_la_capture_porte_les_faits_qui_departagent() -> None:
    """Sans tranche d'effectif ni catégorie dans la capture, le classement ne
    serait mesuré par rien."""
    labo = next(r for r in _fixture()["staffed"]["results"] if str(r["siren"]) == LABORATOIRE_ROCHE)
    assert labo["tranche_effectif_salarie"] == "41"
    assert labo["categorie_entreprise"] == "ETI"
    assert labo["activite_principale"] == "46.46Z"


# ─────────────────────────────────────────────────────────────────────────────
# 6. Preuve n°2 — la garde sait dire NON
# ─────────────────────────────────────────────────────────────────────────────


def test_la_garde_refuse_un_bassin_ampute() -> None:
    """Servie SANS le rappel, la règle de rang doit ROUGIR. C'est la preuve
    qu'elle mesure le rappel et pas la chance."""
    plain = [recherche_entreprises._candidate(r) for r in _fixture()["plain"]["results"]]
    ordonne = homonym_disambiguation.order_prospect_suggestions("ROCHE", plain)
    assert LABORATOIRE_ROCHE not in {r["siren"] for r in ordonne[:5]}


def test_la_garde_refuse_un_classement_qui_ne_classe_pas() -> None:
    """Un « classement » qui rendrait l'ordre reçu doit être vu comme tel."""
    pool = recherche_entreprises.merge_registry_pages(
        [recherche_entreprises._candidate(r) for r in _fixture()["plain"]["results"]],
        [recherche_entreprises._candidate(r) for r in _fixture()["staffed"]["results"]],
    )
    identite = list(pool)  # le faux classement : il rend ce qu'il reçoit
    assert [r["siren"] for r in identite] == [r["siren"] for r in pool]
    vrai = homonym_disambiguation.order_prospect_suggestions("ROCHE", pool)
    assert [r["siren"] for r in vrai] != [r["siren"] for r in identite]


def test_la_garde_refuse_un_classement_qui_ignore_la_taille() -> None:
    """Un barème réduit au seul nom laisse les homonymes à égalité et rend
    l'ordre du registre — donc la SCI en tête. La garde doit le voir."""
    pool = recherche_entreprises.merge_registry_pages(
        [recherche_entreprises._candidate(r) for r in _fixture()["plain"]["results"]],
        [recherche_entreprises._candidate(r) for r in _fixture()["staffed"]["results"]],
    )
    par_nom_seul = sorted(
        pool,
        key=lambda row: homonym_disambiguation.autocomplete_name_score("ROCHE", row.get("name"), row.get("legalName")),
        reverse=True,
    )
    assert par_nom_seul[0]["siren"] != LABORATOIRE_ROCHE
    vrai = homonym_disambiguation.order_prospect_suggestions("ROCHE", pool)
    assert vrai[0]["siren"] == LABORATOIRE_ROCHE
