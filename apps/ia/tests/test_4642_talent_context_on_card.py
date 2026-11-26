"""#4642 — la carte « Comptes où placer X » porte la DEMANDE dont elle est la réponse.

Pour que l'analyse lancée depuis la carte ne perde pas le travail de Laura : la fiche du talent
(`talent_id`), ses compétences et la zone lue au niveau de la carte ; les offres relevées sur la ligne
du compte. Posés par le SERVEUR depuis la sortie de l'outil, jamais devinés — et jamais une zone
STRUCTURÉE (`search_zone`) : ici le contexte PRIORISE, il ne devient pas un périmètre (#4432 est un autre lot).
"""

from __future__ import annotations

from typing import Any

from app.services.known_shape_gate import shape_read_from_tool

TOOL = "find_accounts_for_talent"
CAMILLE = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d"


def _out(**account_over: Any) -> dict[str, Any]:
    account = {
        "name": "JEMS",
        "department": "69",
        "observed_on": "2026-10-20",
        "offers": 6,
        "matched_skills": ["Java", "Kafka"],
        "why": ["JEMS publie 6 offres citant Java, une compétence de la fiche, sur le 69."],
        "not_evaluated": [],
        "needs": [
            {"title": "Dev Java Kafka", "date": "2026-10-20", "skill": "Java"},
            {"title": "Architecte SI", "date": "2026-10-12"},
            {"title": "Offre sans date"},
        ],
    }
    account.update(account_over)
    return {
        "status": "ok",
        "consultant": {"id": CAMILLE, "name": "Camille Fournier"},
        "accounts": [account, {**account, "name": "Alten", "matched_skills": ["Java"], "needs": []}],
        "limits": [],
    }


def _card(out: dict[str, Any]) -> dict[str, Any]:
    read = shape_read_from_tool(TOOL, out, language="fr")
    assert read is not None
    return read["blocks"]["account_ranking"]


def test_la_carte_porte_la_fiche_les_competences_et_la_zone() -> None:
    context = _card(_out())["talent_context"]
    assert context["talent_id"] == CAMILLE
    assert context["skills"] == ["Java", "Kafka"]  # l'union, dans l'ordre de la carte, sans doublon
    assert "Rhône" in context["zone"]


def test_la_carte_nomme_le_talent_pour_que_le_dossier_le_nomme() -> None:
    # Mesure prod 27/10 : « Camille » et « Fournier » absents (0 occurrence) du dossier lancé depuis la carte.
    assert _card(_out())["talent_context"]["talent_name"] == "Camille Fournier"


def test_dit_non_un_nom_sans_fiche_ni_axe_ne_fait_pas_de_contexte() -> None:
    out = _out(matched_skills=[], department=None, needs=[])
    out["consultant"] = {"id": "pas-un-uuid", "name": "Camille Fournier"}
    out["accounts"] = out["accounts"][:1]
    assert "talent_name" not in (_card(out).get("talent_context") or {})


def test_chaque_compte_porte_ses_offres_datees_telles_que_la_carte_les_affiche() -> None:
    items = _card(_out())["items"]
    assert items[0]["offers"] == [
        {"title": "Dev Java Kafka", "date": "2026-10-20"},
        {"title": "Architecte SI", "date": "2026-10-12"},
        {"title": "Offre sans date"},
    ]
    # Un compte sans offre relevée ne fait AUCUNE clé (« on n'affiche pas ce qu'on n'a pas »).
    assert "offers" not in items[1]


def test_dit_non_la_zone_du_contexte_n_est_jamais_un_perimetre() -> None:
    card = _card(_out())
    assert "search_zone" not in card


def test_dit_non_un_identifiant_qui_n_est_pas_un_uuid_ne_voyage_pas() -> None:
    out = _out()
    out["consultant"]["id"] = "camille"
    card = _card(out)
    assert "talent_id" not in (card.get("talent_context") or {})


def test_dit_non_sans_competence_ni_fiche_aucun_contexte_invente() -> None:
    out = _out(matched_skills=[], department=None, needs=[])
    out["consultant"] = {"name": "Camille Fournier"}
    out["accounts"] = out["accounts"][:1]
    assert "talent_context" not in _card(out)
