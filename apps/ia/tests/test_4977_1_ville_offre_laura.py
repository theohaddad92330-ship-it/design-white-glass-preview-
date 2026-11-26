"""#4977.1 — l'offre d'emploi que Laura lit porte sa VILLE (quel que soit le champ source) ; sans ville, aucune n'est inventée."""

from __future__ import annotations

from typing import Any

from app.services import chat_tools


def _candidate(**extra: Any) -> dict[str, Any]:
    return {"name": "Cartier", "siren": "123456789", "signalsSearched": True, **extra}


def _evidence(city: str | None) -> dict[str, Any]:
    offer = {"title": "Chargé de Développement Technique", "date": "2026-10-20", "city": city}
    return {"skill": "java", "offerCount": 1, "latestOffer": offer, "offers": [offer]}


def test_l_offre_du_moteur_competence_porte_sa_ville() -> None:
    item = chat_tools._search_item(_candidate(skillEvidence=_evidence("Paris (75)")))
    assert item is not None
    first = item["signals"][0]
    assert first["label"] == "Chargé de Développement Technique"
    assert first["location"] == "Paris (75)"


def test_sans_ville_aucune_ville_n_est_inventee() -> None:
    item = chat_tools._search_item(_candidate(skillEvidence=_evidence(None)))
    assert item is not None
    assert "location" not in item["signals"][0]


def test_un_signal_de_recrutement_garde_son_lieu_sous_location_ou_city() -> None:
    signals = [
        {"type": "recrutement", "label": "Chargé de Développement Technique", "date": "2026-10-20", "location": "Paris (75)"},
        {"type": "recrutement", "label": "Data engineer", "date": "2026-10-19", "city": "Lyon"},
        {"type": "recrutement", "label": "Développeur Java", "date": "2026-10-18"},
    ]
    item = chat_tools._search_item(_candidate(signals=signals))
    assert item is not None
    by_label = {s["label"]: s for s in item["signals"]}
    assert by_label["Chargé de Développement Technique"]["location"] == "Paris (75)"
    assert by_label["Data engineer"]["location"] == "Lyon"
    assert "location" not in by_label["Développeur Java"]


def test_l_outil_demande_de_citer_poste_et_ville_quand_elle_est_connue() -> None:
    description = chat_tools.GET_ACCOUNT_SIGNALS_TOOL["description"]
    assert "poste ET la ville" in description
