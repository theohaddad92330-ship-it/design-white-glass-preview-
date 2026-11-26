"""#2490 / #2496 — une recherche en langage naturel ne rend JAMAIS le registre non filtré.

Mesuré en production le 17/09/2026 : « ESN spécialisées cybersécurité à
Toulouse » rendait CARGLASS, l'ANPAA, APF France Handicap, BNP Paribas et le
CNRS — aucune ESN, aucune à Toulouse. Cause : la phrase entière partait telle
quelle dans le plein-texte du registre (`q`), qui la compare aux NOMS et aux
ADRESSES de tous les établissements ; les grands réseaux nationaux, qui ont un
établissement partout, arrivaient en tête. Aucune étape ne LISAIT la demande.

Ce fichier tient les trois promesses du correctif :

1. la demande est LUE (lieu, secteur, type d'entreprise) avant d'interroger le
   registre, et ce qui est lu FILTRE la requête ;
2. une demande dont rien n'est reconnu ne rend AUCUN résultat, avec la raison ;
3. la lecture a SA part du budget : une résolution de lieu lente ne mange plus
   celui du registre.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.services.discover_request_reading import read_request
from app.services.esn_naf import ESN_NAF_CODES

_TOULOUSE = {"code": "31555", "name": "Toulouse", "postalCodes": ["31000"], "department": "31"}


def _row(index: int, **over: Any) -> dict:
    return {
        "name": f"SOCIETE {index:03d} SAS",
        "siren": f"{200000000 + index}",
        "nafCode": "62.02A",
        "sector": "Conseil en systèmes et logiciels informatiques",
        "city": "TOULOUSE",
        "department": "31",
        "headcountRange": "50 à 99 salariés",
        "headcountTranche": "21",
        "legalCategory": "5710",
        **over,
    }


class _Gouv:
    """La source gouv.fr : garde chaque requête reçue, rend ses lignes."""

    def __init__(self, rows: list[dict] | None = None, delay: float = 0.0) -> None:
        self.rows = rows if rows is not None else [_row(i) for i in range(5)]
        self.delay = delay
        self.calls: list[Any] = []

    async def __call__(self, filters, limit, degraded=None, *, page: int = 1):
        self.calls.append(filters)
        if self.delay:
            await asyncio.sleep(self.delay)
        return [dict(row) for row in self.rows[:limit]]


async def _no_pappers(filters, limit, degraded=None):
    return []


@pytest.fixture
def gouv(monkeypatch) -> _Gouv:
    source = _Gouv()
    monkeypatch.setattr("app.routers.discover._registry_search", _no_pappers)
    monkeypatch.setattr("app.routers.discover._fallback_search", source)
    monkeypatch.setattr("app.routers.discover._fallback_search_page", source)
    monkeypatch.setattr("app.routers.discover.call_claude", AsyncMock(return_value=({"angles": []}, None)))
    return source


def _post(client: TestClient, filters: dict) -> dict:
    response = client.post("/discover/registry", json={"filters": filters, "limit": 20})
    assert response.status_code == 200, response.text
    return response.json()


def _assert_filtered_on_toulouse_and_esn(body: dict, gouv: _Gouv) -> None:
    """Ce qu'une lecture de « ESN … à Toulouse » DOIT produire au registre."""
    assert gouv.calls, "le registre doit avoir été interrogé"
    # Le secteur : les codes NAF d'une ESN (convention `esn_naf.py`) — répartis
    # sur une requête par section NAF (62 et 70.22), d'où l'union.
    sent_codes = {code for sent in gouv.calls for code in (sent.naf_code or "").split(",") if code}
    assert sent_codes == set(ESN_NAF_CODES), gouv.calls
    # #4429.2 — sous 10 comptes, la ville s'élargit par PALIERS (100 km, région, France),
    # vérifiés par `test_4429_zone_tiers.py` et DITS dans `zoneWidening`. Ici : la maille ville.
    city_calls = [sent for sent in gouv.calls if sent.commune_code or sent.q]
    assert city_calls, gouv.calls
    for sent in city_calls:
        # Le lieu : la commune résolue OU, à défaut, la ville en plein-texte —
        # jamais la phrase entière, qui ramène les réseaux nationaux.
        assert sent.commune_code == "31555" or (sent.q or "").strip().lower() == "toulouse", sent
    for sent in gouv.calls:
        assert "cybers" not in (sent.q or "").lower(), sent
    assert body["query"]["reading"]["place"] == "Toulouse"
    assert body["query"]["reading"]["activities"] == ["esn"]


# ── La lecture elle-même (déterministe, sans réseau) ─────────────────────────


def test_the_measured_request_reads_as_esn_in_toulouse() -> None:
    reading = read_request("ESN spécialisées cybersécurité à Toulouse")

    assert reading.activities == ("esn",)
    assert set(reading.naf_codes) == set(ESN_NAF_CODES)
    assert reading.place_candidates[0] == "Toulouse"
    # « spécialisées » est un mot-outil : ni appliqué, ni reproché.
    assert "spécialisées" not in reading.leftover


def test_a_sector_word_reads_through_the_existing_sector_table() -> None:
    reading = read_request("aéronautique Toulouse")

    assert reading.activities == ("aerospace",)
    assert reading.naf_codes == ("30.30Z",)
    # Pas de préposition : le mot restant est ESSAYÉ comme lieu, pas affirmé.
    assert reading.place_candidates == ("Toulouse",)


def test_consulting_firms_follow_the_esn_convention() -> None:
    assert read_request("sociétés de conseil à Lyon").activities == ("esn",)
    assert read_request("SSII").activities == ("esn",)


def test_a_region_and_a_department_number_need_no_network() -> None:
    idf = read_request("cabinets qui recrutent des développeurs Python en Île-de-France")
    assert idf.region == "11"
    assert idf.place_label == "Île-de-France"
    assert "Python" not in idf.leftover

    assert read_request("éditeurs dans le 31").department == "31"
    assert read_request("ESN 69003").postal_code == "69003"


def test_2165_60_an_intent_verb_is_recognised_not_reproached() -> None:
    """#2165.60 — RÉFUTÉ EN PRODUCTION le 20/09/2026 : « qui recrute des
    développeurs Java à Toulouse » listait « recrute » parmi les mots NON pris
    en compte, comme s'il n'avait aucun sens. Le mot EST compris — aucun champ
    du registre ne sait filtrer sur une intention de recrutement, mais ce n'est
    pas la même chose que ne rien y lire : il ne doit ni être deviné en filtre
    inventé, ni compter comme un reproche. Même vocabulaire que le mode Besoins
    (`discover-needs-freetext.ts`, `NATURE_TRIGGERS`), pour une lecture
    cohérente entre les deux modes."""
    reading = read_request("qui recrute des développeurs Java à Toulouse")

    assert reading.intent == "hiring"
    assert "recrute" not in reading.leftover
    assert reading.place_candidates == ("Toulouse",)
    assert reading.profile_words == ("développeurs", "Java")
    assert reading.leftover == ()


def test_3512_a_hired_profile_is_never_a_company_name() -> None:
    """#3512 — prod 01/10 : « entreprises qui recrutent des développeurs Python
    en Île-de-France » filtrait sur le NOM « développeurs Python » → 0 résultat.
    Le métier et la techno recrutés sont un PROFIL, lu et nommé comme tel."""
    reading = read_request("entreprises qui recrutent des développeurs Python en Île-de-France")
    assert reading.intent == "hiring"
    assert reading.region == "11"
    assert reading.profile_words == ("développeurs", "Python")
    assert reading.leftover == ()
    # « en Python » n'est pas un lieu.
    assert read_request("qui recrute des développeurs en Python à Lyon").place_candidates == ("Lyon",)


def test_3512_a_real_company_name_is_still_a_name() -> None:
    """Le témoin qui sait dire NON : sans intention de recrutement, ou avec un
    vrai nom, rien n'est pris pour un profil."""
    assert read_request("Python Software").profile_words == ()
    assert read_request("Python Software").leftover == ("Python", "Software")
    named = read_request("Capgemini recrute des développeurs Python")
    assert named.profile_words == ("développeurs", "Python")
    assert named.leftover == ("Capgemini",)


def test_generic_words_never_pick_a_sector() -> None:
    """Témoin : des mots d'usage courant ne doivent pas désigner un secteur par
    ressemblance de préfixe (« grandes » ↔ « grande distribution », « recherche »
    ↔ « éducation & recherche », « services » ↔ « services financiers »)."""
    reading = read_request("je recherche des grandes entreprises de services")
    assert reading.activities == ()
    assert reading.naf_codes == ()


# ── La route : lieu + secteur appliqués, jamais le registre entier ──────────


def test_a_resolved_place_and_the_esn_reading_filter_the_registry(client: TestClient, gouv: _Gouv, monkeypatch) -> None:
    monkeypatch.setattr("app.routers.discover.search_communes", AsyncMock(return_value=[_TOULOUSE]))

    body = _post(client, {"freetext": "ESN spécialisées cybersécurité à Toulouse"})

    _assert_filtered_on_toulouse_and_esn(body, gouv)
    assert gouv.calls[0].commune_code == "31555"
    assert gouv.calls[0].q is None
    assert body["query"]["reading"]["placeUnverified"] is False


def test_a_failed_place_lookup_still_filters_on_the_place_named_after_a_preposition(
    client: TestClient, gouv: _Gouv, monkeypatch
) -> None:
    """La lecture du lieu échoue (source muette) : « à Toulouse » reste un lieu
    NOMMÉ par la demande — il part en plein-texte d'adresse, seul, et c'est dit."""
    monkeypatch.setattr("app.routers.discover.search_communes", AsyncMock(side_effect=RuntimeError("geo down")))

    body = _post(client, {"freetext": "ESN spécialisées cybersécurité à Toulouse"})

    _assert_filtered_on_toulouse_and_esn(body, gouv)
    assert body["query"]["reading"]["placeUnverified"] is True


def test_2165_60_a_named_place_the_source_does_not_recognise_still_reaches_the_query(
    client: TestClient, gouv: _Gouv, monkeypatch
) -> None:
    """#2165.60 — RÉFUTÉ EN PRODUCTION le 20/09/2026 : la source répond (pas de
    panne, pas de délai dépassé) mais ne rend aucune commune EXACTE pour
    « Toulouse » — et le lieu, pourtant NOMMÉ explicitement par la phrase avec
    « à », partait alors dans « Non pris en compte » plutôt qu'en recherche
    plein-texte d'adresse, laissant le registre chercher SANS aucun lieu. Un nom
    posé après une préposition de lieu est un signal trop fort pour être jeté
    sur un simple aléa de source — il part en adresse, exactement comme le cas
    « source injoignable » (test au-dessus) le fait déjà."""
    monkeypatch.setattr("app.routers.discover.search_communes", AsyncMock(return_value=[]))

    body = _post(client, {"freetext": "ESN spécialisées cybersécurité à Toulouse"})

    assert gouv.calls, "le registre doit avoir été interrogé"
    assert (gouv.calls[0].q or "").strip().lower() == "toulouse"
    assert "Toulouse" not in body["query"]["reading"]["notApplied"]
    assert body["query"]["reading"]["place"] == "Toulouse"
    assert body["query"]["reading"]["placeUnverified"] is False


def test_2165_60_understood_residual_words_reach_the_query_once_a_place_is_read(
    client: TestClient, gouv: _Gouv, monkeypatch
) -> None:
    """#2165.60 — la mesure exacte du 20/09/2026 : « qui recrute des
    développeurs Java à Toulouse » rendait 14 résultats hors sujet, aucun à
    Toulouse ni dans le 31, et listait TOUS les mots (y compris Toulouse) en
    « Non pris en compte ». Une fois le lieu lu, ce qui reste de la phrase
    (métier/compétence) doit filtrer AUSSI — jamais partir au silence pendant
    qu'un registre non filtré répond quand même."""
    monkeypatch.setattr("app.routers.discover.search_communes", AsyncMock(return_value=[_TOULOUSE]))

    body = _post(client, {"freetext": "qui recrute des développeurs Java à Toulouse"})

    assert gouv.calls, "le registre doit avoir été interrogé"
    assert gouv.calls[0].commune_code == "31555"
    # #3512 — le métier/la techno recrutés sont un PROFIL, jamais un nom.
    assert gouv.calls[0].q is None
    assert body["query"]["reading"]["name"] is None
    assert body["query"]["reading"]["hiringProfile"] == "développeurs Java"
    assert body["query"]["reading"]["notApplied"] == []


def test_3512_free_query_with_region_and_hired_profile_does_not_filter_on_a_name(
    client: TestClient, gouv: _Gouv
) -> None:
    body = _post(client, {"freetext": "entreprises qui recrutent des développeurs Python en Île-de-France"})

    assert gouv.calls, "le registre doit avoir été interrogé"
    assert gouv.calls[0].q is None
    assert gouv.calls[0].region == "11"
    reading = body["query"]["reading"]
    assert reading["name"] is None
    assert reading["hiringProfile"] == "développeurs Python"
    assert reading["notApplied"] == []


def test_a_request_with_nothing_recognisable_returns_nothing_and_says_why(
    client: TestClient, gouv: _Gouv, monkeypatch
) -> None:
    monkeypatch.setattr("app.routers.discover.search_communes", AsyncMock(return_value=[]))

    body = _post(client, {"freetext": "des boîtes sympas qui bougent beaucoup"})

    assert body["candidates"] == []
    assert gouv.calls == [], "le registre entier ne doit jamais être interrogé sur une phrase illisible"
    assert body["query"]["reading"]["unreadable"] is True


def test_an_unreadable_sentence_with_rail_criteria_keeps_the_rail_and_names_the_rest(
    client: TestClient, gouv: _Gouv, monkeypatch
) -> None:
    monkeypatch.setattr("app.routers.discover.search_communes", AsyncMock(return_value=[]))

    body = _post(client, {"freetext": "des boîtes sympas qui bougent", "nafCode": "30.30Z"})

    assert gouv.calls and gouv.calls[0].naf_code == "30.30Z"
    assert gouv.calls[0].q is None
    assert body["query"]["reading"]["unreadable"] is False
    assert "sympas" in body["query"]["reading"]["notApplied"]


def test_the_rail_zone_wins_over_the_place_read_in_the_text(client: TestClient, gouv: _Gouv, monkeypatch) -> None:
    monkeypatch.setattr("app.routers.discover.search_communes", AsyncMock(return_value=[]))

    body = _post(client, {"freetext": "ESN à Toulouse", "department": "69", "departments": ["69"]})

    assert gouv.calls[0].departments == ["69"]
    assert gouv.calls[0].q is None
    assert "Toulouse" in body["query"]["reading"]["notApplied"]


def test_a_company_name_stays_a_name_search(client: TestClient, gouv: _Gouv, monkeypatch) -> None:
    """Témoin : un NOM (« Capgemini ») n'est pas une phrase — la recherche par
    raison sociale reste celle d'avant, byte-identique."""
    monkeypatch.setattr("app.routers.discover.search_communes", AsyncMock(return_value=[]))

    body = _post(client, {"freetext": "Capgemini"})

    assert gouv.calls[0].q == "Capgemini"
    assert "reading" not in body["query"]


def test_a_short_name_keeps_its_unread_words_as_a_name_search(client: TestClient, gouv: _Gouv, monkeypatch) -> None:
    """« Banque Populaire » (ce que Laura envoie comme raison sociale) : le mot
    reconnu filtre le secteur, le reste RESTE une recherche par nom — jamais
    la liste de toutes les banques."""
    monkeypatch.setattr("app.routers.discover.search_communes", AsyncMock(return_value=[]))

    body = _post(client, {"freetext": "Banque Populaire"})

    assert gouv.calls, "le registre a été interrogé"
    assert {call.q for call in gouv.calls} == {"Populaire"}
    assert all(call.naf_code for call in gouv.calls)
    assert body["query"]["reading"]["name"] == "Populaire"
    assert body["query"]["reading"]["notApplied"] == []


# ── Le budget réparti ────────────────────────────────────────────────────────


async def test_a_slow_place_lookup_is_cut_at_its_share_and_the_registry_keeps_its_own(
    async_client, gouv: _Gouv, monkeypatch, virtual_clock
) -> None:
    # Horloge simulée + client dans la boucle du test : le budget se lit en secondes
    # VIRTUELLES (CI annulée #4253 / #4254). Les sources de signaux sont stubbées : leur
    # réseau n'est pas ce qu'on mesure, et un vrai appel coûte du temps réel invisible.
    async def _no_signals(*args: Any, **kwargs: Any) -> list[dict]:
        return []

    for name in ("public_tenders", "it_job_signals", "legal_signals", "funding_signals", "_press_for",
                 "_ats_for_card", "_peek_shared_jobs", "_adzuna_for_card", "_page_volumes"):  # fmt: skip
        monkeypatch.setattr(f"app.routers.discover.{name}", _no_signals)

    async def slow_communes(query: str, *, limit: int = 10, client=None):
        await asyncio.sleep(2.0)
        return [_TOULOUSE]

    monkeypatch.setattr("app.routers.discover.search_communes", slow_communes)
    monkeypatch.setattr("app.routers.discover.DISCOVER_READING_BUDGET_S", 0.05)
    monkeypatch.setattr("app.routers.discover.DISCOVER_TIME_BUDGET_S", 5.0)

    started = time.monotonic()
    response = await async_client.post(
        "/discover/registry", json={"filters": {"freetext": "ESN à Toulouse"}, "limit": 20}
    )
    elapsed = time.monotonic() - started
    assert response.status_code == 200, response.text
    body = response.json()

    # Temps virtuel : la part de la lecture (0.05 s) + le registre, jamais les 2 s du lieu.
    assert elapsed < 1.0, f"la lecture a mangé {elapsed:.2f}s — elle n'est pas bornée à sa part"
    assert gouv.calls, "le registre a gardé sa part du budget"
    assert body["candidates"], "la liste (vraie) est rendue"
    assert body["query"]["reading"]["placeUnverified"] is True


# ── Une garde qui sait dire NON ──────────────────────────────────────────────


def test_without_the_reading_the_sentence_goes_raw_and_the_guard_fails(
    client: TestClient, gouv: _Gouv, monkeypatch
) -> None:
    """Retirer la lecture (le comportement d'avant) : la phrase entière part en
    plein-texte, sans secteur — exactement la liste mesurée en production. La
    vérification ci-dessus DOIT alors échouer."""

    async def no_reading(filters, deadline):
        return filters, None, None

    monkeypatch.setattr("app.routers.discover._apply_reading", no_reading)
    monkeypatch.setattr("app.routers.discover.search_communes", AsyncMock(return_value=[_TOULOUSE]))

    body = _post(client, {"freetext": "ESN spécialisées cybersécurité à Toulouse"})

    assert gouv.calls[0].q == "ESN spécialisées cybersécurité à Toulouse"
    with pytest.raises(AssertionError):
        _assert_filtered_on_toulouse_and_esn(body, gouv)


# ── #4842.1 — un compte ne sort pas par son nom seul ─────────────────────────


@pytest.mark.parametrize("text", ["talend en occitanie", "talend", "Talend"])
async def test_4842_a_skill_word_is_a_need_to_prove_never_a_company_name(text: str) -> None:
    """Prod 29/10 : « talend en occitanie » rendait BC TALEND CONSULTING, trouvé par sa RAISON SOCIALE (`q`), sans
    offre. Une compétence du référentiel se prouve par des offres (chemin compétence) : elle ne part JAMAIS en recherche
    par nom."""
    from app.routers.discover import DiscoverFilters, _apply_reading

    filters, trace, _ = await _apply_reading(DiscoverFilters(freetext=text), time.monotonic() + 5)

    assert not (filters.freetext or "").strip()
    assert [k.lower() for k in filters.keywords or []] == ["talend"]
    assert trace is not None and trace["name"] is None
    assert [w.lower() for w in trace["skillRead"]] == ["talend"]


async def test_4842_a_company_name_and_a_mixed_name_stay_name_searches() -> None:
    """Témoins qui savent dire NON : un vrai nom, ou un nom qui contient un mot de compétence, reste un nom."""
    from app.routers.discover import DiscoverFilters, _apply_reading

    for text in ("Capgemini", "Python Software"):
        filters, _, _ = await _apply_reading(DiscoverFilters(freetext=text), time.monotonic() + 5)
        assert filters.freetext == text, text
        assert not filters.keywords


# ---------------------------------------------------------------------------
# Lot D (recette prod 31/10) — #4419 : un métier / une techno sont LUS, sans « recrute »
# ---------------------------------------------------------------------------


def test_4419_a_trade_and_a_techno_are_read_without_a_hiring_verb() -> None:
    """« développeur Java dans les Hauts-de-France » : région 32, profil lu, aucun NOM (prod : registry=5, 0 compte)."""
    reading = read_request("développeur Java dans les Hauts-de-France")
    assert reading.region == "32"
    assert reading.profile_words == ("développeur", "Java")
    assert reading.leftover == ()


def test_4419_a_short_trade_alone_is_not_a_name_but_a_known_name_stays_one() -> None:
    assert read_request("dev à Lyon").profile_words == ("dev",)
    assert read_request("dev à Lyon").leftover == ()
    # Les témoins qui savent dire NON (#4842) : un nom, ou un nom qui contient une techno.
    assert read_request("Capgemini").profile_words == ()
    assert read_request("Python Software").profile_words == ()
    assert read_request("Python Software").leftover == ("Python", "Software")


def test_4419_trade_and_techno_become_keywords_and_no_name() -> None:
    """Le besoin lu part en mots-clés (chemin offres) : jamais une raison sociale, avec ou sans zone."""
    from app.routers.discover import DiscoverFilters, _apply_reading

    deadline = time.monotonic() + 5
    filters, trace, _ = asyncio.run(
        _apply_reading(DiscoverFilters(freetext="développeur Java dans les Hauts-de-France"), deadline)
    )
    assert filters.region == "32"
    assert filters.freetext is None
    assert "Java" in (filters.keywords or [])
    assert trace is not None and trace["name"] is None and trace["hiringProfile"] == "développeur Java"

    filters, trace, _ = asyncio.run(_apply_reading(DiscoverFilters(freetext="développeur"), deadline))
    assert filters.keywords == ["développeur"]
    assert filters.freetext is None

    # Témoin : un nom reste un nom, sans mot-clé.
    filters, trace, _ = asyncio.run(_apply_reading(DiscoverFilters(freetext="Capgemini"), deadline))
    assert trace is None and not filters.keywords
