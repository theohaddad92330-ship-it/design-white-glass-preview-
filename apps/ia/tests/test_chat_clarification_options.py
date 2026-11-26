"""#1951.10 / #1951.12 à .16 — la carte de désambiguïsation nomme la personne.

L'issue #1951 (« Laura — scope multi-objet et désambiguïsation ») demande que,
quand plusieurs personnes ou entreprises portent le même nom, Laura montre les
options avec entreprise, rôle, localisation, statut et logo/avatar — pas
seulement un texte plat (« tu veux dire quoi ? »).

`ask_clarification` ne portait jusqu'ici que des OPTIONS TEXTE (`options:
string[]`) — vérifié en lisant `chat_tools.py:4262-4284` avant ce lot : aucun
champ structuré n'existe. Ce fichier tient la FORME, pas le choix du modèle de
s'en servir ou non :

1. une option reste une simple chaîne (rétrocompatibilité — l'existant, testé
   par ailleurs dans `test_chat_orchestrator.py`, ne doit pas casser) ;
2. une option peut être un objet `{label, company, role, location, status,
   avatar_url}` — `label` est ce que le clic enverra comme message, les autres
   champs sont l'enrichissement affiché par la carte ;
3. un objet sans `label` est rejeté (silencieusement retiré, pas une chaîne
   vide affichée) ;
4. les deux formes peuvent se mélanger dans la même liste ;
5. la borne — 4 options depuis #2269.13 (trois choix simples plus « autre ») —
   survit au mélange ;
6. un champ vide ou non-texte n'est jamais recopié tel quel (pas de valeur
   inventée) — GA de robustesse générale de ce dépôt.
"""

from __future__ import annotations

import pytest

from app.services.chat_tools import execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"


async def _ask(options: list[object], question: str = "Tu parles de qui ?") -> dict:
    return await execute_chat_tool(
        "ask_clarification",
        {"question": question, "options": options},
        user_id=USER,
        profile_data=None,
    )


@pytest.mark.asyncio
async def test_plain_string_options_still_work() -> None:
    """Té moin : le format historique (chaînes) n'est pas cassé par ce lot."""
    result = await _ask(["Lyon", "Toute la France"])

    assert result["status"] == "clarification"
    assert result["options"] == ["Lyon", "Toute la France"]


@pytest.mark.asyncio
async def test_structured_option_carries_disambiguation_fields() -> None:
    result = await _ask(
        [
            {
                "label": "Sophie Martin",
                "company": "Sopra Steria",
                "role": "Consultante Java",
                "location": "Lyon",
                "status": "En mission",
                "avatar_url": "https://cdn.example.com/sophie.jpg",
            },
            {"label": "Sophie Dubois", "role": "Consultante Java", "location": "Nantes"},
        ]
    )

    assert result["status"] == "clarification"
    first = result["options"][0]
    assert first == {
        "label": "Sophie Martin",
        "company": "Sopra Steria",
        "role": "Consultante Java",
        "location": "Lyon",
        "status": "En mission",
        "avatar_url": "https://cdn.example.com/sophie.jpg",
    }
    # Un champ absent n'est jamais inventé : l'objet ne porte que ce qu'on lui a donné.
    second = result["options"][1]
    assert second == {"label": "Sophie Dubois", "role": "Consultante Java", "location": "Nantes"}
    assert "company" not in second
    assert "avatar_url" not in second


@pytest.mark.asyncio
async def test_mixed_string_and_object_options() -> None:
    result = await _ask(["Toute la France", {"label": "SNCF", "location": "Paris"}])

    assert result["options"] == ["Toute la France", {"label": "SNCF", "location": "Paris"}]


@pytest.mark.asyncio
async def test_object_without_label_is_dropped() -> None:
    # Deux entrées valides restent nécessaires : celle sans label ne compte pas.
    result = await _ask(
        [
            {"company": "Sopra Steria", "location": "Lyon"},
            {"label": "Sophie Martin"},
            {"label": "Sophie Dubois"},
        ]
    )

    assert result["status"] == "clarification"
    assert result["options"] == [{"label": "Sophie Martin"}, {"label": "Sophie Dubois"}]


@pytest.mark.asyncio
async def test_only_invalid_objects_still_errors_as_before() -> None:
    result = await _ask([{"company": "Sopra Steria"}, {"role": "Consultante"}])

    assert result == {"error": "Propose 2 ou 3 options cliquables — jamais une question ouverte."}


@pytest.mark.asyncio
async def test_cap_at_four_survives_mixed_options() -> None:
    # #2269.13 — trois choix simples plus « autre » : la borne technique est
    # passée à 4 pour laisser sa place au catch-all, mais elle reste une borne
    # dure — un cinquième élément est toujours coupé.
    result = await _ask(
        [
            "Lyon",
            {"label": "Paris"},
            "Nantes",
            {"label": "Toulouse"},
            "Autre",
        ]
    )

    assert len(result["options"]) == 4
    assert result["options"] == ["Lyon", {"label": "Paris"}, "Nantes", {"label": "Toulouse"}]


@pytest.mark.asyncio
async def test_non_string_detail_fields_are_never_copied_verbatim() -> None:
    result = await _ask(
        [
            {"label": "Sophie Martin", "company": 42, "role": None, "status": ["En mission"]},
            {"label": "Sophie Dubois"},
        ]
    )

    assert result["options"][0] == {"label": "Sophie Martin"}
