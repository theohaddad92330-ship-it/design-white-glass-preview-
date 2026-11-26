"""#1820 — Laura remarque son propre manque de contexte, et le dit.

Le retour : « si Laura se rend compte qu'elle manque de contexte pour aider le
user, alors elle peut lui conseiller de faire [l'import] ». Le point mesuré le
09/09 : rien ne distinguait « j'ai regardé, il n'y a rien » de « je n'ai pas pu
regarder ».

Ce que cette recherche a trouvé : le signal EXISTE déjà, mais ailleurs qu'on ne
l'attendait. `get_workspace_health` relaie `main_cause`, un AXE du score de
santé d'espace (`packages/contracts/src/schemas/workspace-health.ts`) —
`dataDensity` pèse « comptes suivis, talents qualifiés, missions actives » — et
`measurable: false` quand trop peu d'axes sont évaluables pour qu'un score
existe (typiquement un espace tout neuf). C'est EXACTEMENT le manque de
contexte que le retour nomme : pas une panne, une absence de matière.

Le trou n'était donc pas dans les DONNÉES (elles distinguent déjà « rien à
mesurer » de « tout va mal », `null` de `0`) mais dans le PROMPT : rien ne
disait à Laura QUOI FAIRE de `dataDensity` ou de `measurable: false`. Ce test
vérifie le câblage minimal : la description de l'outil doit conduire vers
`get_import_overview` puis `propose_guided_action` — jamais vers une
conclusion inventée à partir d'un silence.
"""

from __future__ import annotations

from app.services import chat_tools


def _tool_description(name: str) -> str:
    return str(next(t for t in chat_tools.CHAT_TOOLS if t["name"] == name)["description"])


def test_workspace_health_tells_laura_what_dataDensity_means_and_what_to_do() -> None:
    description = _tool_description("get_workspace_health")
    assert "dataDensity" in description
    assert "get_import_overview" in description
    assert "propose_guided_action" in description


def test_workspace_health_does_not_conclude_from_silence() -> None:
    """`measurable: false` doit rester distinct d'un verdict négatif — la
    description ne doit jamais dire qu'un espace non mesurable va mal."""
    description = _tool_description("get_workspace_health").lower()
    assert "measurable" in description or "mesurable" in description
    # Ne doit pas suggérer qu'un espace non mesurable est un espace qui va mal.
    assert "espace neuf" in description or "encore vide" in description or "pas encore" in description


def test_import_overview_points_to_the_real_import_screen_not_the_generic_settings_route() -> None:
    """Corrélat direct (#1822) : la route devinable `/settings` est remplacée
    par la route RÉELLE, maintenant que le catalogue la connaît."""
    description = _tool_description("get_import_overview")
    assert "/settings/import" in description
    assert "propose_guided_action` vers la route\n        `/settings`" not in description


def test_no_vendor_name_leaks_into_the_enriched_descriptions() -> None:
    forbidden = ("hubspot", "boondmanager", "salesconnect", "salesforce", "pipedrive", "attio")
    for name in ("get_workspace_health", "get_import_overview", "get_blocking_issues"):
        description = _tool_description(name).lower()
        assert not any(word in description for word in forbidden), name
