"""#4419.23 bis (lot récolte 24/10) — le filtre ``skillAbsent`` jetait ~95 % des offres récoltées.

Mesure prod du 24/10 : rejets ``skillAbsent`` 188/192, 160/180, 142/172 — presque toutes des offres Adzuna. Cause
lue dans le code : la ligne Adzuna ne portait NI la description NI les compétences de l'offre, alors que la source
avait trouvé le mot dans la description ; le contrôle ne lisait que l'intitulé. Et « Vue.js » tapé ne reconnaissait
pas « Vue 3 » ni « VueJS » dans l'offre (variantes du référentiel).

La garde dit NON : une offre qui ne porte la compétence nulle part (ni intitulé, ni description, ni compétences)
reste rejetée, et « Java » ne lit toujours pas « JavaScript ».
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.services import discover_skill_offers as skill
from app.services.data_sources.job_aggregators import _adzuna_row

TODAY = datetime.now(UTC).date()
CUTOFF = TODAY - timedelta(days=90)


def _adzuna_hit(title: str, description: str, company: str = "DECATHLON") -> dict:
    """Une réponse Adzuna RÉELLE (forme publiée de l'API : ``description`` = extrait de l'annonce)."""
    return {
        "title": title,
        "description": description,
        "company": {"display_name": company},
        "location": {"display_name": "Lille, Nord", "area": ["France", "Hauts-de-France", "Nord", "Lille"]},
        "created": f"{TODAY.isoformat()}T08:00:00Z",
        "redirect_url": f"https://adzuna.example/{abs(hash(title)) % 10_000}",
        "contract_type": "permanent",
    }


def _reason(offer: dict, term: str) -> str | None:
    return skill._reject_reason(offer, term, frozenset({"59"}), CUTOFF, None, False)


def _from_adzuna(title: str, description: str) -> dict:
    employer, row = _adzuna_row(_adzuna_hit(title, description))
    return {**row, "employer": employer, "siren": None, "department": "59"}


def test_la_ligne_adzuna_porte_la_description_de_l_offre() -> None:
    _employer, row = _adzuna_row(_adzuna_hit("Développeur front-end H/F", "Stack : VueJS, TypeScript, Nuxt."))
    assert row["description"] == "Stack : VueJS, TypeScript, Nuxt."


@pytest.mark.parametrize(
    ("title", "description"),
    [
        # La compétence n'est que dans la description (le cas qui faisait 95 % des rejets).
        ("Développeur front-end H/F", "Vous développerez nos interfaces en VueJS 3 et TypeScript."),
        ("Ingénieur logiciel", "Environnement technique : Vue.js, Node, PostgreSQL."),
        # Les variantes du référentiel dans l'intitulé.
        ("Développeur Vue 3 confirmé", ""),
        ("Développeur VueJS", ""),
        ("Développeur Vue.js / Nuxt", ""),
    ],
)
@pytest.mark.parametrize("term", ["Vue", "Vue.js", "vuejs", "vue"])
def test_une_offre_qui_porte_vraiment_vue_passe(term: str, title: str, description: str) -> None:
    assert _reason(_from_adzuna(title, description), term) is None


@pytest.mark.parametrize(
    ("title", "term"),
    [
        ("Data Engineer H/F", "Data engineer"),
        ("Data Engineer confirmé (Spark)", "data engineer"),
        ("Ingénieur data (data engineering)", "Data engineer"),
        ("Data Scientist senior", "data scientist"),
    ],
)
def test_un_metier_data_passe_dans_ses_formes_ecrites(title: str, term: str) -> None:
    assert _reason(_from_adzuna(title, ""), term) is None


def test_les_competences_listees_par_l_offre_comptent() -> None:
    offer = {**_from_adzuna("Développeur front-end", ""), "skills": ["Vue.js", "Pinia"]}
    assert _reason(offer, "Vue") is None


@pytest.mark.parametrize(
    ("title", "description", "term"),
    [
        # La garde dit NON : la compétence n'est nulle part.
        ("Développeur React", "Stack React, Redux, Next.js.", "Vue"),
        ("Agent clientèle terrain", "Relation client, tournées, permis B.", "Vue"),
        ("Développeur JavaScript", "Front-end en JavaScript et TypeScript.", "Java"),
        # « vue » n'est pas une compétence quand l'annonce parle d'une « vue sur mer » : seul le MOT reconnu
        # par le référentiel compte, et « vue » isolée y est un alias — l'offre reste donc hors métier par
        # le tri métier, pas ici ; celle-ci n'a aucun mot de la compétence.
        ("Chef de rang", "Restaurant panoramique, service soigné.", "Vue.js"),
    ],
)
def test_une_offre_sans_la_competence_reste_rejetee(title: str, description: str, term: str) -> None:
    assert _reason(_from_adzuna(title, description), term) == "skillAbsent"


def test_une_competence_du_referentiel_nommee_dans_la_description_prouve_le_metier_it() -> None:
    # « Chef de projet digital » n'a aucun mot IT dans son intitulé ; l'offre nomme Vue.js dans son corps : la
    # compétence du référentiel (#4434, compétences IT) prouve le métier, l'offre n'est plus « outsideTrade ».
    offer = _from_adzuna("Chef de projet digital H/F", "Vous piloterez une équipe front Vue.js et Nuxt.")
    assert _reason(offer, "Vue") is None
    # La garde dit NON : sans la compétence, l'intitulé hors IT reste hors métier ou sans compétence.
    assert _reason(_from_adzuna("Chef de projet digital H/F", "Pilotage d'agences."), "Vue") == "skillAbsent"


def test_le_lieu_et_l_employeur_ne_prouvent_toujours_pas_la_competence() -> None:
    # #4469 gardé : « cloud » dans Saint-Cloud ne prouve rien, même avec la description qui voyage.
    offer = {
        **_from_adzuna("Comptable H/F", "Poste basé à Saint-Cloud, au sein de CLOUD SERVICES SA."),
        "employer": "CLOUD SERVICES SA",
        "city": "Saint-Cloud",
    }
    assert _reason(offer, "cloud") == "skillAbsent"
