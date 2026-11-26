"""#4469 — une compétence se cherche dans le MÉTIER de l'offre, jamais dans son lieu, son employeur ni une adresse.

« cloud » ramenait un pâtissier et une vendeuse situés à Saint-Cloud. Fixtures fictives, aucun réseau.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.services import discover_skill_offers as skill

NOW = datetime.now(UTC)
CUTOFF = (NOW - timedelta(days=90)).date()


def _offer(title: str, *, source: str, employer: str = "ELIOR RESTAURATION FRANCE", **extra) -> dict:
    return {
        "employer": employer,
        "siren": None,
        "title": title,
        "city": "Saint-Cloud",
        "department": "92",
        "date": (NOW - timedelta(days=3)).date().isoformat(),
        "url": f"https://offres.example/{source}/{title}",
        "source": source,
        "contractType": None,
        **extra,
    }


def _reason(offer: dict, term: str = "cloud") -> str | None:
    return skill._reject_reason(offer, term, frozenset(), CUTOFF, None, True)


@pytest.mark.parametrize(
    "source,extra",
    [("france_travail", {"termChecked": True}), ("adzuna", {}), ("cache", {})],
)
def test_patissier_a_saint_cloud_est_rejete_quelle_que_soit_la_source(source: str, extra: dict) -> None:
    offer = _offer("Pâtissier (H/F)", source=source, **extra)
    assert _reason(offer) == "skillAbsent"


@pytest.mark.parametrize("source", ["france_travail", "adzuna", "cache"])
def test_ingenieur_cloud_aws_a_saint_cloud_reste_retenue(source: str) -> None:
    extra = {"termChecked": True} if source == "france_travail" else {}
    assert _reason(_offer("Ingénieur Cloud AWS", source=source, **extra)) is None


@pytest.mark.parametrize("city", ["Saint-Cloud", "ST CLOUD", "St-Cloud", "Saint Cloud", "SAINT-CLOUD (92)"])
def test_le_lieu_de_l_offre_ne_porte_pas_la_competence(city: str) -> None:
    offer = _offer("Vendeuse en boulangerie", source="france_travail", city=city, termChecked=True)
    assert _reason(offer) == "skillAbsent"


def test_employeur_qui_contient_le_terme_ne_suffit_pas() -> None:
    offer = _offer("Vendeur/vendeuse en pâtisserie", source="adzuna", employer="LEKLA SAINT-CLOUD")
    assert _reason(offer) == "skillAbsent"
    offer = _offer(
        "Vendeur/vendeuse en pâtisserie", source="adzuna", employer="CLOUD BOULANGERIE", city="Lyon",
        description="Chez CLOUD BOULANGERIE, vous servez la clientèle.",
    )
    assert _reason(offer) == "skillAbsent"


def test_adresse_dans_la_description_ne_suffit_pas() -> None:
    offer = _offer(
        "Pâtissier (H/F)",
        source="adzuna",
        city="Boulogne",
        description="Poste situé au 12 rue X, 92210 Saint-Cloud. Vous préparez les desserts.",
    )
    assert _reason(offer) == "skillAbsent"


@pytest.mark.parametrize("address", ["St Cloud", "St-Cloud", "Saint Cloud", "SAINT-CLOUD"])
def test_toute_graphie_du_toponyme_compose(address: str) -> None:
    offer = _offer("Pâtissier", source="cache", city="Boulogne", description=f"Magasin à {address}.")
    assert _reason(offer) == "skillAbsent"


def test_description_qui_cite_reellement_le_cloud_est_retenue_meme_a_saint_cloud() -> None:
    offer = _offer(
        "Commercial terrain B to B",
        source="adzuna",
        description="Vous vendez nos offres cloud et hébergement. Bureau à Saint-Cloud.",
    )
    assert _reason(offer) is None


def test_jumeaux_toponymes_saint() -> None:
    # « Saint-Denis », « Saint-Étienne », « Sainte-Maxime » : le terme d'un toponyme composé ne matche pas dessus.
    offer = _offer("Vendeuse", source="france_travail", city="Saint-Denis", termChecked=True)
    assert _reason(offer, "denis") == "skillAbsent"
    offer = _offer("Aide cuisinier", source="adzuna", city="Lyon", description="Restaurant à Sainte-Maxime.")
    assert _reason(offer, "maxime") == "skillAbsent"


def test_france_travail_porte_la_description_de_l_offre() -> None:
    import inspect

    assert '"description"' in inspect.getsource(skill._france_travail_read)


def test_la_cle_de_moisson_change_de_version() -> None:
    key = skill._harvest_key(["cloud"], [], {})
    assert key.startswith(skill.HARVEST_KEY_VERSION + "|")
    assert skill.HARVEST_KEY_VERSION not in {"k1", "k2"}
