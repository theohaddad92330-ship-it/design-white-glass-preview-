"""Filtres d'ÉCRAN → filtres de REGISTRE (`POST /discover/registry`).

Le bug que ces tests verrouillent : le routeur passait aux deux sources le
`model_dump()` BRUT des filtres d'écran, alors qu'elles attendent un
`CompanyDiscoveryFilters` validé. Chaque recherche remontait donc

    pappers — 'dict' object has no attribute 'q'
    recherche-entreprises — 'dict' object has no attribute 'is_empty'

dans `degraded[]`, et l'écran n'affichait jamais que « Résultats partiels ».

Ce qui est verrouillé ici :

1. Les sources reçoivent un OBJET FILTRES, jamais un dictionnaire.
2. La conversion est fidèle : effectifs en nombre → tranches INSEE, secteur →
   section NAF, ancienneté → fenêtre de dates.
3. Ce que la source ne peut pas honorer est DIT (`unsupported_filters`), jamais
   deviné ni silencieusement ignoré.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.routers.discover import DiscoverFilters, _registry_filters, _registry_row
from app.services.company_filters import CompanyDiscoveryFilters, tranche_code_for_headcount, tranche_codes_union

# ── La conversion elle-même ─────────────────────────────────────────────────


def test_screen_filters_become_validated_registry_filters() -> None:
    registry = _registry_filters(
        DiscoverFilters(
            sector="it",
            nafCode="6202A",
            department="69",
            headcountMin=10,
            headcountMax=49,
            createdAfter="2015-01-01",
            freetext="ESN",
        )
    )

    assert isinstance(registry, CompanyDiscoveryFilters)
    assert registry.naf_code == "62.02A"  # normalisé au format pointé
    assert registry.naf_section == "J"  # « it » = information et communication
    assert registry.department == "69"
    assert registry.headcount_tranche_min == "11"  # 10 à 19 salariés
    assert registry.headcount_tranche_max == "12"  # 20 à 49 salariés
    assert registry.creation_date_min == "2015-01-01"
    assert registry.q == "ESN"
    assert not registry.is_empty()


# #3908 — plusieurs tranches cochées ensemble (cumul, non contiguës) : le rail
# envoie `headcountRanges`, la conversion doit en tirer l'UNION exacte des codes
# INSEE, jamais l'enveloppe (qui ferait remonter la tranche intermédiaire
# jamais cochée).
def test_several_headcount_ranges_become_the_exact_union_not_the_envelope() -> None:
    registry = _registry_filters(
        DiscoverFilters(
            headcountRanges=[{"headcountMin": 10, "headcountMax": 49}, {"headcountMin": 250, "headcountMax": 999}]
        )
    )

    assert registry.headcount_tranches == ["11", "12", "32", "41"]
    # L'intervalle unique n'est JAMAIS posé en même temps que l'union — sinon un
    # provider qui ne lirait que `headcount_tranche_min`/`max` remonterait
    # l'enveloppe (10-999) au lieu de l'union.
    assert registry.headcount_tranche_min is None
    assert registry.headcount_tranche_max is None


def test_a_single_entry_in_headcount_ranges_still_unions_correctly() -> None:
    """Défensif : le rail n'envoie `headcountRanges` qu'à partir de deux
    tranches cochées (une seule part en `headcountMin`/`headcountMax`), mais
    la conversion ne doit pas dépendre de cette convention côté appelant."""
    registry = _registry_filters(DiscoverFilters(headcountRanges=[{"headcountMin": 10, "headcountMax": 49}]))

    assert registry.headcount_tranches == ["11", "12"]


def test_no_headcount_ranges_leaves_the_plain_interval_untouched() -> None:
    registry = _registry_filters(DiscoverFilters(headcountMin=10, headcountMax=49))

    assert registry.headcount_tranche_min == "11"
    assert registry.headcount_tranche_max == "12"
    assert registry.headcount_tranches is None


# #3907 — « la carte ne dit pas ce que fait la boîte » : `_registry_row`
# (projection source → contrat) ne doit jamais laisser passer un code NAF brut
# en guise de secteur.
def test_registry_row_decodes_the_naf_code_when_the_source_gives_no_label() -> None:
    row = _registry_row({"siren": "552100554", "name": "KICKLOX", "nafCode": "6202A"})

    assert row is not None
    assert row["nafCode"] == "6202A"
    assert row["sector"] == "Conseil en systèmes et logiciels informatiques"


def test_registry_row_prefers_the_source_label_over_the_decoded_one() -> None:
    row = _registry_row(
        {"siren": "552100554", "name": "KICKLOX", "nafCode": "6202A", "sector": "Édition de logiciels sur mesure"}
    )

    assert row is not None
    assert row["sector"] == "Édition de logiciels sur mesure"


def test_registry_row_falls_back_to_the_broader_naf_division_label() -> None:
    # 71.xx (ingénierie) n'est pas dans la table IT précise, mais la division
    # 71 est couverte par le filet plus large (`naf_family_label`).
    row = _registry_row({"siren": "552100554", "name": "BET STRUCTURE", "nafCode": "7112B"})

    assert row is not None
    assert row["sector"] == "Architecture et ingénierie"


def test_registry_row_never_invents_a_sector_outside_both_tables() -> None:
    row = _registry_row({"siren": "552100554", "name": "FERME DU LAC", "nafCode": "99.99Z"})

    assert row is not None
    assert row["nafCode"] == "99.99Z"
    assert row["sector"] is None


def test_a_five_digit_city_is_a_postal_code_not_a_full_text_search() -> None:
    assert _registry_filters(DiscoverFilters(city="69003")).postal_code == "69003"
    assert _registry_filters(DiscoverFilters(city="69003")).q is None


_TOULOUSE = {"code": "31555", "name": "Toulouse", "latitude": 43.6045, "longitude": 1.4442}


def test_2642_2_a_radius_around_a_resolved_commune_becomes_a_near_point_search() -> None:
    """#2642.2 — ville + rayon retire RÉELLEMENT des résultats : le cercle part
    sur les coordonnées de la commune RÉSOLUE (`geo_communes.py`), jamais
    devinées."""
    registry = _registry_filters(DiscoverFilters(city="Toulouse", radiusKm=15), commune=_TOULOUSE)

    assert registry.latitude == 43.6045
    assert registry.longitude == 1.4442
    assert registry.radius_km == 15
    # Le cercle REMPLACE la commune exacte, il ne s'y ajoute pas.
    assert registry.commune_code is None


def test_2642_2_a_radius_without_a_resolved_commune_has_no_effect() -> None:
    """Une ville tapée mais jamais résolue (faute de frappe, source muette) :
    le rayon n'a pas de centre — il ne se rabat PAS sur un autre périmètre."""
    registry = _registry_filters(DiscoverFilters(city="Toulouse", radiusKm=15), commune=None)

    assert registry.latitude is None
    assert registry.longitude is None
    assert registry.radius_km is None


def test_2642_2_a_radius_on_a_postal_code_has_no_effect_either() -> None:
    """Un code postal est déjà un critère exact — le cercle ne s'y superpose pas."""
    registry = _registry_filters(DiscoverFilters(city="69003", radiusKm=15), commune=_TOULOUSE)

    assert registry.radius_km is None
    assert registry.postal_code == "69003"


def test_an_unknown_sector_never_invents_a_naf_section() -> None:
    assert _registry_filters(DiscoverFilters(sector="all")).naf_section is None
    assert _registry_filters(DiscoverFilters(sector="")).naf_section is None


@pytest.mark.parametrize(
    ("headcount", "expected"),
    [(0, "00"), (1, "01"), (10, "11"), (49, "12"), (250, "32"), (999, "41"), (1000, "42"), (250_000, "53")],
)
def test_headcount_maps_onto_the_insee_tranche_that_contains_it(headcount: int, expected: str) -> None:
    assert tranche_code_for_headcount(headcount) == expected


def test_an_absent_or_negative_headcount_yields_no_tranche() -> None:
    assert tranche_code_for_headcount(None) is None
    assert tranche_code_for_headcount(-1) is None


# #3908 — l'UNION de plusieurs tranches NON CONTIGUËS, jamais l'enveloppe.
def test_tranche_codes_union_keeps_each_range_separate() -> None:
    # 10-49 → codes 11,12 ; 250-999 → 32,41. L'enveloppe (10-999) inclurait
    # aussi 21/22/31 (50 à 249 salariés), jamais cochés.
    assert tranche_codes_union([("11", "12"), ("32", "41")]) == ["11", "12", "32", "41"]


def test_tranche_codes_union_dedupes_overlapping_ranges() -> None:
    assert tranche_codes_union([("11", "22"), ("12", "32")]) == ["11", "12", "21", "22", "31", "32"]


def test_tranche_codes_union_of_nothing_is_empty() -> None:
    assert tranche_codes_union([]) == []
    assert tranche_codes_union([(None, None)]) == []


# ── Ce que le routeur passe réellement aux sources ──────────────────────────


@pytest.fixture
def sources(monkeypatch):
    """Capture ce que chaque source reçoit, sans réseau."""

    class _Spy:
        def __init__(self) -> None:
            self.calls: list[tuple[Any, int]] = []

        async def __call__(self, filters, limit, degraded=None):
            self.calls.append((filters, limit))
            return []

    registry, fallback = _Spy(), _Spy()
    monkeypatch.setattr("app.routers.discover._registry_search", registry)
    monkeypatch.setattr("app.routers.discover._fallback_search", fallback)
    return registry, fallback


def test_both_sources_receive_a_filters_object_never_a_dict(client: TestClient, sources) -> None:
    registry, fallback = sources

    response = client.post(
        "/discover/registry",
        # #4433 — la requête EXACTE ; la tranche voisine (palier) a ses tests dans test_criteria_paliers_4433.py.
        json={
            "filters": {"nafCode": "62.02A", "department": "69", "headcountMin": 10, "headcountMax": 49},
            "strictCriteria": True,
        },
    )

    assert response.status_code == 200
    assert [type(call[0]) for call in registry.calls] == [CompanyDiscoveryFilters]
    assert [type(call[0]) for call in fallback.calls] == [CompanyDiscoveryFilters]
    # Et surtout : plus aucune trace de l'erreur d'attribut dans degraded.
    reasons = " ".join(entry["reason"] for entry in response.json()["degraded"])
    assert "has no attribute" not in reasons


def test_a_city_in_plain_words_only_reaches_the_source_that_can_honour_it(client: TestClient, sources) -> None:
    registry, fallback = sources

    client.post("/discover/registry", json={"filters": {"department": "69", "city": "Lyon"}})

    # Pappers cherche une raison sociale : « Lyon » n'y entre pas…
    assert registry.calls[0][0].q is None
    # …alors que le plein-texte gouv.fr couvre l'adresse.
    assert fallback.calls[0][0].q == "Lyon"


def test_a_filter_pappers_cannot_honour_is_said_not_silently_dropped(client: TestClient, sources) -> None:
    response = client.post("/discover/registry", json={"filters": {"sector": "it", "department": "69"}})

    degraded = response.json()["degraded"]
    # Dit, nommé, et CADRÉ : une limite de capacité (la liste est plus large),
    # pas une panne (voir tests/test_discover_degraded_kinds.py).
    assert {
        "source": "pappers",
        "reason": "unsupported_filters",
        "kind": "capability",
        "fields": ["sector"],
    } in degraded


def test_an_invalid_criterion_is_a_422_not_a_dead_source(client: TestClient, sources) -> None:
    response = client.post("/discover/registry", json={"filters": {"nafCode": "pas-un-naf"}})

    assert response.status_code == 422


# ── L'ORDRE de la cascade (retour du 31/08) ─────────────────────────────────
#
# « Découvrir redonnait des entreprises qui n'avaient rien à voir avec ce qu'il
# cherchait dans les filtres. »
#
# Cause : la cascade demandait TOUJOURS Pappers en premier. Or Pappers ne sait
# pas filtrer sur une SECTION NAF — il la jette, délibérément et c'est écrit
# (`pappers/discovery.py` : « intentionally dropped rather than approximated »).
# Il répondait donc avec une liste bâtie sur le RESTE des critères, et le
# `if resolved: return resolved` rendait cette liste-là. `recherche-entreprises`
# — la SEULE source qui sait le faire (`section_activite_principale`) — n'était
# jamais appelée.
#
# Résultat : dès que `PAPPERS_API_KEY` est posée, cocher un secteur n'avait
# AUCUN effet sur les résultats. La note « non appliqué » existait, posée à côté
# du filtre ; mais c'est la LISTE qu'on lit, pas le rail.
#
# La règle posée ici : **une source qui ne sait pas honorer un critère
# RÉELLEMENT DEMANDÉ ne passe pas devant une source qui le sait.**


@pytest.fixture
def answering_sources(monkeypatch):
    """Deux sources qui RÉPONDENT — c'est ce qui rend l'ordre observable.

    Le spy voisin rend `[]`, donc les deux sources sont toujours appelées et
    l'ordre n'a aucune conséquence visible : il ne pouvait pas voir ce défaut.
    """
    order: list[str] = []

    def _spy(name: str, siren: str):
        async def _call(filters, limit, degraded=None):
            order.append(name)
            return [
                {
                    "siren": siren,
                    "nom_entreprise": f"{name.upper()} SAS",
                    "siege": {"code_postal": "69003", "ville": "Lyon"},
                    "code_naf": "62.02A",
                    "libelle_code_naf": "Conseil en systèmes informatiques",
                }
            ]

        return _call

    monkeypatch.setattr("app.routers.discover._registry_search", _spy("pappers", "552100554"))
    monkeypatch.setattr("app.routers.discover._fallback_search", _spy("gouv", "552100555"))
    return order


def test_without_an_unhonourable_criterion_pappers_still_goes_first(client: TestClient, answering_sources) -> None:
    """Aucune régression : sans secteur ni ville en clair, Pappers garde la main
    — il est plus riche, et il sait répondre à la question posée."""
    client.post("/discover/registry", json={"filters": {"department": "69", "headcountMin": 10}})

    assert answering_sources[0] == "pappers"


def test_a_requested_sector_sends_gouv_first_because_pappers_would_drop_it(
    client: TestClient, answering_sources
) -> None:
    client.post("/discover/registry", json={"filters": {"sector": "it", "department": "69"}})

    # La source qui SAIT appliquer le critère est interrogée d'abord…
    assert answering_sources[0] == "gouv"
    # …et comme elle répond, Pappers n'est pas consulté : sa liste plus large
    # n'a aucune occasion de gagner.
    assert answering_sources == ["gouv"]


def test_a_city_in_plain_words_also_reorders_the_waterfall(client: TestClient, answering_sources) -> None:
    """Même défaut, autre critère : Pappers jette une ville en toutes lettres
    (son `q` cherche une raison sociale), gouv.fr la traite en plein-texte."""
    client.post("/discover/registry", json={"filters": {"department": "69", "city": "Lyon"}})

    assert answering_sources[0] == "gouv"


def test_a_postal_code_does_NOT_reorder_it(client: TestClient, answering_sources) -> None:
    """Un code postal passe très bien chez Pappers — il ne doit rien réordonner.
    Sans ce test, « toute ville réordonne » passerait pour juste."""
    client.post("/discover/registry", json={"filters": {"city": "69003"}})

    assert answering_sources[0] == "pappers"


def test_a_requested_region_sends_gouv_first_pappers_support_is_unverified(
    client: TestClient, answering_sources
) -> None:
    """#2544.1 — réfuté en PRODUCTION le 18/09 au soir : `region="27"`
    (Bourgogne-Franche-Comté) + `freetext=arquus` rendait ARQUUS toujours
    localisé VERSAILLES/78 (le siège), avec le MÊME nombre de résultats (24)
    filtre région posé ou non — la preuve que la région n'atteignait jamais la
    source qui sait la filtrer ET l'afficher correctement.

    Cause : `_unhonoured_by` ne nommait jamais `region` parmi les critères que
    Pappers ne sait pas honorer. Son support de `region` n'a pourtant jamais
    été VÉRIFIÉ sur une instance réelle (contrairement à `department`, mesuré
    le 04/09/2026 — voir `to_pappers_search_params`), et Pappers n'a aucun
    équivalent à `_matching_establishment` : sa ligne vient toujours du SIÈGE
    (`pappers/discovery.py::_to_row`). Pappers restait donc premier et
    répondait toujours, sans jamais laisser la main à `recherche-entreprises`
    — la seule source dont le filtre ET l'affichage région sont mesurés
    (`test_discover_establishment_geo.py`)."""
    client.post("/discover/registry", json={"filters": {"region": "27", "freetext": "arquus"}})

    assert answering_sources[0] == "gouv"
    assert answering_sources == ["gouv"]


def test_a_region_pappers_ignores_is_reread_on_its_rows_never_said_unapplied(client: TestClient, monkeypatch) -> None:
    """Lot DÉCOUVRIR-ZONE (27/10) — Pappers ignore la région (#2544.1) : ses lignes sont RELUES sur leur département.
    Une ligne hors région sort ; la note « non appliqué — résultats plus larges » serait donc fausse : elle n'est plus
    émise (avant : la note, ET la ligne hors région à l'écran — « le rayon affiché n'est pas appliqué »)."""

    async def _pappers(filters, limit, degraded=None):
        return [
            {"siren": "552100554", "nom_entreprise": "DIJON SAS", "departement": "21", "code_naf": "62.02A"},
            {"siren": "552100556", "nom_entreprise": "NICE SAS", "departement": "06", "code_naf": "62.02A"},
        ]

    async def _gouv(filters, limit, degraded=None):
        return []

    monkeypatch.setattr("app.routers.discover._registry_search", _pappers)
    monkeypatch.setattr("app.routers.discover._fallback_search", _gouv)
    response = client.post("/discover/registry", json={"filters": {"region": "27"}})

    body = response.json()
    assert not any("region" in (e.get("fields") or []) for e in body["degraded"])
    assert "552100556" not in {c["siren"] for c in body["candidates"]}, "Nice n'est pas en Bourgogne-Franche-Comté"


def test_a_criterion_that_WAS_honoured_raises_no_capability_note(client: TestClient, answering_sources) -> None:
    """Quand gouv.fr applique le secteur et répond, il n'y a plus rien à
    signaler : la liste EST restreinte au critère demandé.

    Annoncer « pappers ne sait pas appliquer sector » parlerait d'une source
    qu'on n'a pas interrogée — et l'écran poserait une note « non appliqué » à
    côté d'un filtre qui, lui, a bien été appliqué. C'est le sens même du
    correctif : la note doit disparaître avec le défaut."""
    response = client.post("/discover/registry", json={"filters": {"sector": "it", "department": "69"}})

    degraded = response.json()["degraded"]
    assert not any("sector" in (e.get("fields") or []) for e in degraded)


def test_but_the_note_comes_back_when_the_waterfall_falls_through_to_pappers(client: TestClient, monkeypatch) -> None:
    """Si gouv.fr ne rend rien, Pappers reprend la main — et là, le critère
    n'est RÉELLEMENT pas appliqué. La note doit revenir.

    Sans ce test, « on ne dit plus jamais rien » passerait pour le correctif."""

    async def _empty(filters, limit, degraded=None):
        return []

    async def _answers(filters, limit, degraded=None):
        return [
            {
                "siren": "552100554",
                "nom_entreprise": "PAPPERS SAS",
                "siege": {"code_postal": "69003", "ville": "Lyon"},
                "code_naf": "62.02A",
                "libelle_code_naf": "Conseil en systèmes informatiques",
            }
        ]

    monkeypatch.setattr("app.routers.discover._fallback_search", _empty)
    monkeypatch.setattr("app.routers.discover._registry_search", _answers)

    response = client.post("/discover/registry", json={"filters": {"sector": "it", "department": "69"}})

    degraded = response.json()["degraded"]
    assert any(e["source"] == "pappers" and e.get("fields") == ["sector"] for e in degraded)


def test_naf_code_accepts_a_LIST_of_codes() -> None:
    """Plusieurs secteurs = plusieurs codes NAF, en UNE requête.

    ⚠️ RÉGRESSION DE PRODUCTION, trouvée par la recette live du 04/09/2026 et
    invisible pour 5 600 tests.

    Depuis que Découvrir envoie les codes NAF de chaque secteur coché, `nafCode`
    porte une LISTE (`30.30Z,25.40Z,30.40Z`). Le validateur n'acceptait qu'un
    code unique : la requête sortait en 422 et l'écran affichait « La recherche
    a échoué — le service n'a pas pu être joint ». **Toute recherche croisant
    plus d'un secteur était morte.**

    Le registre, lui, lit la liste : `30.30Z,29.10Z` rend 1423 = 745 + 678,
    c'est un OU.
    """
    assert CompanyDiscoveryFilters(naf_code="30.30Z,25.40Z,30.40Z").naf_code == "30.30Z,25.40Z,30.40Z"


def test_naf_code_normalizes_EVERY_code_of_the_list() -> None:
    """Chaque code est normalisé, pas seulement le premier — sinon la liste
    partirait à moitié au format pointé et à moitié au format compact."""
    assert CompanyDiscoveryFilters(naf_code="3030z, 2910Z ,62.02a").naf_code == "30.30Z,29.10Z,62.02A"


def test_naf_code_still_rejects_a_bad_code_INSIDE_a_list() -> None:
    """Un seul code illisible fait échouer la liste ENTIÈRE.

    Le laisser tomber en silence rendrait une recherche plus large que demandée,
    présentée comme exacte — le pire des deux échecs possibles.
    """
    with pytest.raises(ValidationError):
        CompanyDiscoveryFilters(naf_code="30.30Z,pas-un-code")


def test_naf_code_ignores_empty_segments() -> None:
    """Une virgule en trop n'est pas une erreur de l'utilisateur."""
    assert CompanyDiscoveryFilters(naf_code="30.30Z,,25.40Z,").naf_code == "30.30Z,25.40Z"
