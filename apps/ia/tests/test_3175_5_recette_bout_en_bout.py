"""#3175.5 (épopée #3215) — « étendre la recette du ticket à un test
d'intégration bout en bout une fois l'objet CommercialIntent construit ».

L'objet ``CommercialIntent`` complet à treize champs reste hors lot (système
de plusieurs jours, tranché sans Louis dans le commentaire de #3215) : la
tranche livrée porte sur la RECETTE mesurable du ticket #3175 (qualification
littérale d'un compte nommé). Avant ce test, seule la couche « marqueur →
bloc de prompt » était testée UNITAIREMENT
(``test_3175_qualification_compte_elargie.py``, appelle directement
``account_qualification_widening_block``) : rien ne prouvait que le tour de
chat RÉEL — la route HTTP, la construction du prompt système,
l'orchestrateur — assemble effectivement ce bloc pour une des phrases de la
section RECETTE du ticket.

Ce test ferme cet écart, bout en bout : ``POST /chat/message`` avec une des
phrases EXACTES du ticket (« Est-ce que je peux ouvrir Airbus ? »), en
interceptant ``run_chat_with_tools`` juste avant l'appel modèle pour lire le
``system`` prompt RÉELLEMENT construit par ``_run_chat_turn`` — pas une
reconstruction séparée en test.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient


def test_3175_5_la_recette_du_ticket_assemble_le_bloc_de_qualification_et_le_verdict_bout_en_bout(
    client: TestClient,
) -> None:
    captured_system: list[str] = []

    async def _capture_system(system: str, *_args: object, **_kwargs: object) -> tuple[str, list]:
        captured_system.append(system)
        return "Réponse de Laura.", []

    with patch(
        "app.services.chat_orchestrator.run_chat_with_tools",
        new_callable=AsyncMock,
        side_effect=_capture_system,
    ):
        res = client.post(
            "/chat/message",
            # Phrase EXACTE de la section RECETTE d'#3175 (« je peux ouvrir Airbus ? »).
            json={"message": "Est-ce que je peux ouvrir Airbus ?", "user_id": "u1"},
        )

    assert res.status_code == 200
    assert captured_system, "run_chat_with_tools n'a jamais été appelé — le tour s'est arrêté avant"
    system = captured_system[0]

    # #185.13 (épopée #3242) — le point d'entrée du ticket #3179 lui-même :
    # avant toute proposition de prospection, Laura doit consulter le verdict.
    assert "get_account_suitability_verdict" in system
    assert "NOT_EVALUABLE" in system

    # #3175.1 — les dimensions de la qualification élargie, dans le prompt réel.
    for dimension in ("références bancaires", "anciens consultants", "coût d'opportunité"):
        assert dimension in system, dimension

    # Doctrine : aucune probabilité affichée, même dans le prompt système réel.
    assert "%" not in system.split("QUALIFICATION D'UN COMPTE")[-1].split("\n\n")[0]
