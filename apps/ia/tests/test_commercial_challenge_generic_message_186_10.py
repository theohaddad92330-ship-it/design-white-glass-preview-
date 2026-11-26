"""#3243 (#186.10, lot M09) — « message trop générique » : le volet restant.

Le contrôle de masse #2204.73 (`outreachDuplicateGroups`, contrats) est livré et
appelé par l'onglet Messages (`TabMessages.tsx`). Laura, elle, ne lisait aucune
demande d'envoi IDENTIQUE à plusieurs personnes. Le détecteur lit la DEMANDE du
tour (ce que le commercial vient d'écrire), jamais le corps d'un message déjà
rédigé — doctrine : le corps des messages ne sort jamais vers le modèle."""

from __future__ import annotations

import pytest

from app.prompts.commercial_challenge_policy import active_challenges_block
from app.services.commercial_challenge import CHALLENGE_CASES, detect_generic_mass_message


@pytest.mark.parametrize(
    "request_text",
    [
        "Envoie le même message à tous les DSI de la liste",
        "Prépare un message identique pour les 50 contacts",
        "fais un copier-coller du message pour toutes les personnes du compte",
        "Un seul message générique pour tout le monde, ça ira",
        "écris un template unique que j'enverrai à cinquante prospects",
    ],
)
def test_une_demande_denvoi_identique_a_plusieurs_est_challengee(request_text: str) -> None:
    challenge = detect_generic_mass_message(request_text)
    assert challenge is not None
    assert challenge["case"] == "message trop agressif ou trop générique"
    assert challenge["strength"] == "firm"
    # Toujours une alternative (forme du challenge) — jamais un refus sec.
    assert challenge["alternative"]


@pytest.mark.parametrize(
    "request_text",
    [
        "",
        None,
        "Écris un message à Claire Dubois sur leur projet data",
        "Prépare les messages des 3 contacts prioritaires",
        "Envoie-lui le même message que la semaine dernière",
        "Quel est le message type pour un DSI ?",
    ],
)
def test_sait_dire_non(request_text: str | None) -> None:
    assert detect_generic_mass_message(request_text) is None


def test_le_cas_a_desormais_un_detecteur() -> None:
    assert CHALLENGE_CASES["message trop agressif ou trop générique"] == "detect_generic_mass_message"


def test_le_challenge_atteint_le_bloc_du_tour() -> None:
    block = active_challenges_block(request_text="Envoie le même message à tous les contacts")
    assert "CHALLENGE(S) ACTIF(S)" in block
    assert "message trop agressif ou trop générique" in block
    assert active_challenges_block(request_text="Écris à Claire") == ""


def test_la_route_chat_porte_la_demande_au_detecteur() -> None:
    from app.prompts.bellum_advisor import build_system_prompt

    avec = build_system_prompt({}, {}, "", "", request_text="Envoie le même message à tous les contacts")
    sans = build_system_prompt({}, {}, "", "")
    assert "message trop agressif ou trop générique —" in avec
    assert "message trop agressif ou trop générique —" not in sans
    assert build_system_prompt({}, {}, "", "", request_text="") == sans
