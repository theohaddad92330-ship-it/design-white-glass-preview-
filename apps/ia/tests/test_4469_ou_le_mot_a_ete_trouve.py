"""#4469 — la carte dit OÙ le mot a été trouvé quand il n'est pas dans l'intitulé (recette lot 22, 29/10/2026)."""

from __future__ import annotations

from app.services import discover_skill_offers as skill


def _offer(title: str, description: str = "", **extra) -> dict:
    return {
        "employer": "ACME",
        "title": title,
        "city": "Paris",
        "date": "2026-10-20",
        "url": "https://offres.example/1",
        "source": "france_travail",
        "description": description,
        **extra,
    }


def test_mot_dans_l_intitule():
    evidence = skill._evidence([_offer("Ingénieur Cloud AWS (H/F)", skill="cloud")])
    assert evidence["latestOffer"]["foundIn"] == "title"


def test_mot_seulement_dans_la_description():
    offer = _offer("Data Scientist (H/F)", "Vous déployez nos modèles sur le cloud AWS.", skill="cloud")
    evidence = skill._evidence([offer])
    assert evidence["latestOffer"]["foundIn"] == "description"


def test_toponyme_ne_vaut_pas_un_mot_trouve():
    offer = _offer("Pâtissier (H/F)", "Poste à Saint-Cloud.", skill="cloud", city="Saint-Cloud")
    assert skill._evidence([offer])["latestOffer"]["foundIn"] is None
