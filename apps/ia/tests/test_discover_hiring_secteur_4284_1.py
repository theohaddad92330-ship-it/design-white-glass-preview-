"""#4284.1 (recette 23/10) — le bloc RECRUTEMENT ne garde que les métiers du SECTEUR de l'ESN de l'espace.

Décision Louis 09/10 : industrie → industrie, cyber → cyber, pas de filtre IT fixe. Vente, restauration,
logistique sortent ; une entrée sans intitulé d'offre (vidéo, article) n'est pas une offre."""

from __future__ import annotations

import pytest

from app.services.discover_hiring_scope import drop_off_scope_hiring

ESN_PLACEUR = {"placedRoles": [], "recruitsForClients": True, "inferredPlacedRoles": [
    {"role": "Développeur", "terms": ["développeur", "devops", "data", "cloud"]}]}
ESN_INDUS = {"placedRoles": ["automaticien", "électrotechnicien"], "inferredPlacedRoles": []}


def _labels(labels: list[str], profile: dict, **extra: object) -> list[str]:
    signals = [{"type": "hiring", "label": label, "date": "2026-10-20", **extra} for label in labels]
    return [s["label"] for s in drop_off_scope_hiring(signals, profile)]


@pytest.mark.parametrize("profile", [ESN_PLACEUR, ESN_INDUS])
@pytest.mark.parametrize(
    "label",
    ["Vendeur / Vendeuse en boulangerie", "Commercial terrain B to B Site internet", "Employé polyvalent de restauration rapide",
     "Équipier logistique entrepôt", "Responsable de rayon", "Chef de partie restaurant"],
)
def test_vente_restauration_logistique_sortent_meme_pour_un_placeur(profile: dict, label: str) -> None:
    assert _labels([label], profile) == []


def test_chaque_secteur_garde_son_metier() -> None:
    assert _labels(["Développeur Java H/F", "Ingénieur Cloud AWS"], ESN_PLACEUR) == ["Développeur Java H/F", "Ingénieur Cloud AWS"]
    assert _labels(["Automaticien confirmé", "Ingénieur commercial"], ESN_INDUS) == ["Automaticien confirmé"]
    assert _labels(["Ingénieur d'affaires IT"], ESN_PLACEUR) == ["Ingénieur d'affaires IT"]


def test_un_profil_sans_famille_ne_devine_rien() -> None:
    assert _labels(["Vendeur"], {"placedRoles": ["consultant"], "recruitsForClients": True}) == ["Vendeur"]


def test_une_entree_sans_intitule_ou_une_video_n_est_pas_une_offre() -> None:
    assert _labels(["", "Recrutement"], ESN_PLACEUR) == []
    assert _labels(["Découvrir notre équipe"], ESN_PLACEUR, url="https://www.youtube.com/watch?v=abc") == []
    assert _labels(["Développeur Java H/F"], ESN_PLACEUR, url="https://offres.example/1") == ["Développeur Java H/F"]
