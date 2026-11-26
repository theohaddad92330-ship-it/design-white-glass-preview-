"""#4579 / #4563 — « vue » ne cherchait ni vue.js ni vuejs : une compétence n'était jamais déclinée.

La porte est RÉELLE : ``POST /discover/registry`` avec la recherche « dev vue et java à lille » (mots-clés
vue + java, ville Lille). Les trois sources sont simulées et gardent ce qu'on leur demande : aucun appel réseau.
Déclinaisons d'ÉCRITURE seulement (vue / vue.js / vuejs / vue 3) — l'écosystème et la proximité sont une autre
décision, non prise."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from app.services import discover_skill_offers as skill

NOW = datetime.now(UTC)
LILLE = {"name": "ACME LILLE", "siren": "100000009", "nafCode": "47.11F", "city": "LILLE", "department": "59"}


def _offer(employer: str, title: str, url: str, source: str = "france_travail") -> dict:
    return {
        "employer": employer,
        "siren": None,
        "title": title,
        "city": "59 - LILLE",
        "department": "59",
        "date": (NOW - timedelta(days=3)).date().isoformat(),
        "url": url,
        "source": source,
        "contractType": None,
        "termChecked": True,
    }


class Asked:
    """Ce que chaque source a reçu, et ce qu'elle rend selon la forme demandée."""

    def __init__(self) -> None:
        self.ft: list[str] = []
        self.adzuna: list[str] = []
        self.cache: list[str] = []
        self.by_form: dict[str, list[dict]] = {}


@pytest.fixture
def asked(monkeypatch: pytest.MonkeyPatch) -> Asked:
    state = Asked()

    async def ft(term: str, department: str | None, profile: dict, *, page: int = 0) -> list[dict]:
        state.ft.append(term)
        return list(state.by_form.get(term.lower(), []))

    async def adzuna(term: str, department: str | None = None) -> list[dict]:
        state.adzuna.append(term)
        return []

    async def cache(term: str, zone: frozenset[str] = frozenset()) -> list[dict]:
        state.cache.append(term)
        return []

    async def resolve(name: str, siren: str | None = None, **_: Any) -> skill.EmployerResolution:
        siren = {"ACME LILLE": "100000009", "BETA SAS": "100000017"}[name]
        return skill.EmployerResolution({**LILLE, "name": name, "siren": siren}, None)

    monkeypatch.setattr(skill, "france_travail_offers", ft)
    monkeypatch.setattr(skill, "adzuna_offers", adzuna)
    monkeypatch.setattr(skill, "cached_offers", cache)
    monkeypatch.setattr(skill, "resolve_employer", resolve)
    monkeypatch.setattr(skill, "_harvest_cache_get", AsyncMock(return_value=None))
    monkeypatch.setattr(skill, "_harvest_cache_put", AsyncMock(return_value=None))

    async def _registry(filters, limit, degraded=None):
        return []

    monkeypatch.setattr("app.routers.discover._registry_search", _registry)
    monkeypatch.setattr("app.routers.discover._fallback_search", _registry)
    return state


def _post(client: Any, **filters: Any) -> dict:
    body = {"departments": ["59"], "keywords": ["vue", "java"], "technologiesObserved": ["vue", "java"], **filters}
    with patch("app.routers.discover.call_claude", new_callable=AsyncMock, return_value=({"angles": []}, None)):
        res = client.post("/discover/registry", json={"filters": body, "profile_data": {}})
    assert res.status_code == 200, res.text
    return res.json()


def test_dev_vue_et_java_a_lille_interroge_les_sources_sur_les_declinaisons(client: Any, asked: Asked) -> None:
    _post(client, freetext="dev vue et java à lille", city="Lille")
    for source in (asked.ft, asked.adzuna, asked.cache):
        forms = {t.lower() for t in source}
        assert {"vue", "vue.js", "vuejs", "vue 3"} <= forms, forms
        assert {"java", "java 17", "j2ee", "jee"} <= forms, forms


def test_une_offre_trouvee_par_vuejs_est_une_offre_vue_sans_doublon(client: Any, asked: Asked) -> None:
    same = _offer("ACME LILLE", "Développeur VueJS", "https://o/1")
    asked.by_form = {
        "vue": [same],
        "vuejs": [same],
        "vue.js": [_offer("ACME LILLE", "Développeur Vue.js", "https://o/2")],
        "j2ee": [_offer("BETA SAS", "Architecte J2EE", "https://o/3")],
    }
    body = _post(client)
    by_siren = {c["name"]: c for c in body["candidates"]}
    acme = by_siren["ACME LILLE"]["skillEvidence"]
    assert acme["offerCount"] == 2  # o/1 vu par deux formes = UNE offre ; o/2 par vue.js
    assert acme["skill"] == "vue"
    # Vague IX — « Architecte J2EE » est TROUVÉE par la déclinaison, puis ÉCARTÉE `outsideTrade` par le tri
    # métier de #4284.1 (arrivé en parallèle) : son intitulé ne porte aucun terme de MÉTIER IT — « architecte »
    # seul est ambigu (architecte du bâtiment) — et `_IT_TERMS` exclut à dessein les technologies seules.
    # La déclinaison d'écriture fait donc son travail ; c'est le tri métier qui tranche derrière.
    # ⚠️ QUESTION POSÉE À LOUIS, pas tranchée ici : une technologie seule dans l'intitulé (« J2EE », « K8s »)
    # doit-elle prouver qu'une offre est une offre IT ? Aujourd'hui non, et ce compte n'est pas rendu.
    assert "BETA SAS" not in by_siren


def test_une_competence_inconnue_est_cherchee_telle_quelle(client: Any, asked: Asked) -> None:
    _post(client, keywords=["zorglub"], technologiesObserved=["zorglub"])
    # (sous le seuil, les paliers de PROXIMITÉ du référentiel existent déjà : ce test ne parle que de l'écriture)
    assert {t.lower() for t in asked.ft if "zorglub" in t.lower()} == {"zorglub"}


async def test_le_plafond_porte_sur_les_competences_demandees_pas_sur_les_declinaisons(asked: Asked) -> None:
    # Le plafond se LIT (`SKILL_MAX_TERMS`), il ne se recopie pas : `main` l'a relevé de 2 à 3 (#4419.24) et
    # une valeur en dur faisait échouer ce test sans que rien de ce qu'il prouve ait changé.
    demandees = ["vue", "java", "react", "python", "php", "go", "rust", "kotlin"][: skill.SKILL_MAX_TERMS + 2]
    terms = skill.skill_terms(demandees, [])
    assert terms == demandees[: skill.SKILL_MAX_TERMS]  # le plafond, AVANT toute déclinaison
    hors_plafond = demandees[skill.SKILL_MAX_TERMS]
    await skill.harvest_skill_offers(terms, ["59"], {}, deadline=None)
    forms = {t.lower() for t in asked.ft}
    assert {"vue 3", "java 17"} <= forms  # décliner vue n'a pas pris la place de java
    assert hors_plafond not in forms  # la compétence au-delà du plafond ne part pas, même déclinée


def test_le_referentiel_ne_decline_que_l_ecriture() -> None:
    from app.services.criteria_referential import skill_written_forms

    assert skill_written_forms("vue") == ["vue.js", "vuejs", "vue 3", "nuxt", "nuxt.js"]  # nuxt : #4579 L5
    assert skill_written_forms("Java") == ["java 17", "j2ee", "jee", "spring", "spring boot", "jakarta ee"]
    assert skill_written_forms("zorglub") == []
    assert skill_written_forms("vue java") == []  # une saisie de deux mots n'est pas une compétence du référentiel
    everything = {f for term in ("vue", "java") for f in skill_written_forms(term)}
    assert not {"pinia", "react", "javascript"} & everything


async def test_la_meme_offre_lue_sous_deux_ecritures_ne_gonfle_aucun_compteur(asked: Asked) -> None:
    same = _offer("ACME LILLE", "Développeur VueJS", "https://o/1")
    asked.by_form = {"vue": [same], "vuejs": [same], "vue.js": [same], "vue 3": [same]}
    harvest = await skill.harvest_skill_offers(["vue"], ["59"], {}, deadline=None)
    assert harvest.received["france_travail"] == 1
    assert len(harvest.offers) == 1 and harvest.offers[0]["skill"] == "vue"
    assert harvest.calls["france_travail"] == 6  # l'appel se compte À L'ACHAT : six écritures (nuxt, nuxt.js inclus), six lectures


def test_la_reponse_dit_sous_quelles_formes_chaque_competence_a_ete_cherchee(client: Any, asked: Asked) -> None:
    """#4579.5 — la porte réelle rend ``query.skillSearch.searched`` : « vue » a été cherché aussi sous vue.js…"""
    searched = _post(client, freetext="dev vue et java à lille", city="Lille")["query"]["skillSearch"]["searched"]
    by_skill = {entry["skill"]: {f.lower() for f in entry["forms"]} for entry in searched}
    assert {"vue", "vue.js", "vuejs", "vue 3"} <= by_skill["vue"]
    assert {"java", "j2ee"} <= by_skill["java"]
    assert "vue.js" not in by_skill["java"]  # sait dire NON : une écriture n'est jamais prêtée à une autre compétence
