"""#2302.38/.44 (épopée #2961) — masquage par défaut d'une entité inactive et
d'une adresse administrative sans équipe.

Ni l'un ni l'autre n'avait de champ producteur : `entitiesExhaustive` ne
demandait ni statut ni équipe (constat audit 25/09/2026). Le prompt demande
maintenant `isActive` / `hasTeam` — JAMAIS devinés (le champ s'omet plutôt que
d'être recalculé), donc le résolveur (`territory_resolver.py`) peut écarter
sans fabriquer la donnée.
"""

from __future__ import annotations

from app.prompts.bellum_facts import build_user_prompt


def test_prompt_demande_isactive_sans_deviner() -> None:
    prompt = build_user_prompt("Société Générale", "", "", "")
    assert '"isActive"' in prompt
    assert "ne devine JAMAIS" in prompt


def test_prompt_demande_hasteam_sans_deviner() -> None:
    prompt = build_user_prompt("Société Générale", "", "", "")
    assert '"hasTeam"' in prompt
    assert "administrative" in prompt


def test_4327_1_filiales_hors_marque_groupe_sont_demandees() -> None:
    """#4327.1 (recette prod 23/10) — Fortuneo absent des 25 filiales d'Arkéa : le prompt ne filtre pas sur la marque."""
    prompt = build_user_prompt("Arkéa", "", "", "")
    assert "ne porte PAS la marque du groupe" in prompt
    assert "Fortuneo" in prompt
    assert "Ne filtre jamais sur la marque du groupe" in prompt
