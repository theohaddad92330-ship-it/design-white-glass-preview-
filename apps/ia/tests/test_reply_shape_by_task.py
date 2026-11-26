"""#3707 / #3708 — rejeu de tours réels : entrée → prompt système et outils transmis au modèle.

Zéro appel modèle : on intercepte ``run_chat_with_tools`` juste avant l'appel (même patron que
``test_3175_5_recette_bout_en_bout.py``) pour lire ce que le tour RÉEL assemble.

Question exacte à poser en recette (ouvrir /chat) :
- #3707 : « Trouve-moi des comptes Java dans la banque », puis « Approfondis » — la sélection et sa
  raison viennent en tête, chaque entreprise suit l'ordre périmètre → pourquoi → fait → besoins →
  action, aucune colonne « Aucun » ; « Approfondis » ajoute du fond, pas des tableaux.
- #3708 : décocher le CRM dans « Outils et sources », puis « Prépare un export de ce contact vers mon
  CRM » — Laura dit que la source est exclue pour ce fil (pas « non connecté ») et n'appelle aucun
  outil CRM.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.services.chat_tools import tools_for


def _run(client: TestClient, payload: dict) -> dict:
    captured: dict = {}

    async def _capture(system: str, *_args: object, **kwargs: object) -> tuple[str, list]:
        captured["system"] = system
        captured["kwargs"] = kwargs
        return "Réponse de Laura.", []

    with patch(
        "app.services.chat_orchestrator.run_chat_with_tools",
        new_callable=AsyncMock,
        side_effect=_capture,
    ):
        res = client.post("/chat/message", json=payload)
    assert res.status_code == 200
    assert captured, "run_chat_with_tools n'a jamais été appelé"
    return captured


def test_3707_le_tour_reel_porte_la_forme_stable_par_type_de_tache(client: TestClient) -> None:
    system = _run(client, {"message": "Trouve-moi des comptes Java dans la banque", "user_id": "u1"})["system"]
    assert "FORME STABLE PAR TYPE DE TÂCHE" in system
    # Découverte : la sélection et sa raison d'abord, puis l'ordre par entreprise.
    discovery = system.split("DÉCOUVERTE (« trouve-moi des comptes… ») :")[1].split("STRATÉGIE DE COMPTE")[0]
    positions = [discovery.index(word) for word in ("sélection proposée", "périmètre", "pourquoi elle répond", "prochaine action", "preuves")]
    assert positions == sorted(positions)
    # Stratégie : pas cinq rubriques vides ; message : texte d'abord ; action : trois états.
    assert "tu ne titres jamais les cinq P" in system
    assert "le texte utilisable D'ABORD" in system
    assert "PROPOSES" in system and "VALIDER" in system and "RÉELLEMENT été fait" in system


def test_3707_pas_de_colonne_vide_pas_de_fournisseur_une_reserve_une_fois(client: TestClient) -> None:
    system = _run(client, {"message": "Compare Airbus et Thales", "user_id": "u1"})["system"]
    rules = system.split("RÈGLES COMMUNES.")[1].split("\n\n")[0]
    assert "AUCUNE colonne" in rules and "Non mesuré" in rules
    assert "UNE fois" in rules
    assert "une erreur de recherche se dit comme une erreur" in rules
    assert "plus de FOND" in rules
    assert "%" not in rules  # aucune probabilité, même dans la consigne


def test_3708_exclusion_crm_retire_les_outils_crm_et_le_dit(client: TestClient) -> None:
    captured = _run(
        client,
        {
            "message": "Prépare un export de ce contact vers mon CRM",
            "user_id": "u1",
            "connected_families": ["crm", "email"],
            "excluded_families": ["crm"],
        },
    )
    families = captured["kwargs"]["connected_families"]
    assert "crm" not in families and "email" in families
    names = {str(tool["name"]) for tool in tools_for(families)}
    assert "export_contact_to_crm" not in names
    assert "SOURCES EXCLUES PAR LA PERSONNE POUR CE FIL : ton CRM" in captured["system"]
    assert "ne dis jamais qu'ils ne sont pas connectés" in captured["system"]


def test_3708_sans_exclusion_aucun_bloc(client: TestClient) -> None:
    captured = _run(client, {"message": "Bonjour", "user_id": "u1", "connected_families": ["crm"]})
    assert "SOURCES EXCLUES" not in captured["system"]
    assert captured["kwargs"]["connected_families"] == ["crm"]
