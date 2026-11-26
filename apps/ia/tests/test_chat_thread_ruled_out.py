"""#1927.3 / #1927.4 — LES OPTIONS ÉCARTÉES ET LES HYPOTHÈSES, PAR LA VOIE STRUCTURÉE.

─────────────────────────────────────────────────────────────────────────────
CE QUI ÉTAIT REFUSÉ, ET RESTE REFUSÉ
─────────────────────────────────────────────────────────────────────────────
`chat_thread_state.py` portait un refus écrit : « les extraire par mots-clés
serait un détecteur fragile qui rate en silence ». Ce refus N'EST PAS LEVÉ —
aucun détecteur textuel n'est posé ici, et le dernier test de ce fichier en est
le TÉMOIN : une réponse qui dit « j'écarte Lyon » et « je pars sur Toulouse » en
toutes lettres ne met rien dans l'état.

Ce qui change, c'est que le modèle a désormais un endroit TYPÉ où le dire :
`ask_clarification` porte `ruled_out` et `assumptions`, exactement comme elle
porte déjà `question` et `options`. Une sortie d'outil, pas une phrase à relire.

⚠️ Et la borne se dit : `ask_clarification` est retirée de la boîte à outils dès
qu'une clarification a été posée dans la conversation (`chat_orchestrator.py`,
§9.4). Le porteur est donc limité à ce tour-là ; un tour sans clarification ne
produit toujours aucune option écartée. C'est une frontière, pas un oubli.
"""

from __future__ import annotations

from app.prompts.thread_state import format_thread_state_block
from app.services.chat_thread_state import (
    ASSUMPTIONS_MAX,
    RULED_OUT_MAX,
    ThreadStateCollector,
    ThreadState,
    thread_state_from_wire,
)
from app.services.chat_tools import ASK_CLARIFICATION_TOOL, execute_chat_tool


# ── La sortie TYPÉE ──────────────────────────────────────────────────────────


def test_the_tool_declares_both_fields_and_neither_is_required() -> None:
    schema = ASK_CLARIFICATION_TOOL["input_schema"]
    assert "ruled_out" in schema["properties"]
    assert "assumptions" in schema["properties"]
    # Une clarification sans option écartée reste une clarification valide :
    # exiger le champ ferait inventer des refus pour satisfaire le schéma.
    assert schema["required"] == ["question", "options"]


async def _clarify(**extra: object) -> dict:
    return await execute_chat_tool(
        "ask_clarification",
        {"question": "Quel compte ?", "options": ["ACME", "BETA"], **extra},
        user_id="u-1",
        profile_data=None,
    )


async def test_the_executor_keeps_what_the_model_named() -> None:
    out = await _clarify(
        ruled_out=[{"option": "Lyon", "reason": "aucun compte ouvert là-bas"}],
        assumptions=["disponibilité sous 30 jours"],
    )

    assert out["ruled_out"] == [{"option": "Lyon", "reason": "aucun compte ouvert là-bas"}]
    assert out["assumptions"] == ["disponibilité sous 30 jours"]


async def test_an_option_without_a_label_is_dropped_not_guessed() -> None:
    # Un refus sans son objet ne dit rien. La raison, elle, peut manquer : « j'ai
    # écarté Lyon » est déjà une information, « j'ai écarté » n'en est pas une.
    out = await _clarify(ruled_out=[{"reason": "trop loin"}, {"option": "Lyon"}])

    assert out["ruled_out"] == [{"option": "Lyon"}]


async def test_a_clarification_without_them_is_byte_identical_to_before() -> None:
    out = await _clarify()

    assert "ruled_out" not in out
    assert "assumptions" not in out


# ── La traversée jusqu'à l'état du fil ───────────────────────────────────────


def _collector() -> ThreadStateCollector:
    return ThreadStateCollector(ThreadState())


def test_the_state_remembers_what_was_ruled_out_and_assumed() -> None:
    collector = _collector()
    collector.record(
        "ask_clarification",
        {},
        {
            "status": "clarification",
            "question": "Quel compte ?",
            "options": ["ACME", "BETA"],
            "ruled_out": [{"option": "Lyon", "reason": "aucun compte ouvert là-bas"}],
            "assumptions": ["disponibilité sous 30 jours"],
        },
    )

    assert [(r.option, r.reason) for r in collector.state.ruled_out] == [("Lyon", "aucun compte ouvert là-bas")]
    assert collector.state.assumptions == ["disponibilité sous 30 jours"]


def test_the_most_recent_comes_first_and_the_lists_are_bounded() -> None:
    collector = _collector()
    for index in range(RULED_OUT_MAX + 2):
        collector.record(
            "ask_clarification",
            {},
            {
                "status": "clarification",
                "question": "Quel compte ?",
                "options": ["ACME", "BETA"],
                "ruled_out": [{"option": f"option-{index}"}],
                "assumptions": [f"hypothese-{index}"],
            },
        )

    assert len(collector.state.ruled_out) == RULED_OUT_MAX
    assert collector.state.ruled_out[0].option == f"option-{RULED_OUT_MAX + 1}"
    assert len(collector.state.assumptions) == ASSUMPTIONS_MAX
    assert collector.state.assumptions[0] == f"hypothese-{RULED_OUT_MAX + 1}"


def test_the_state_survives_the_round_trip_through_the_wire() -> None:
    collector = _collector()
    collector.record(
        "ask_clarification",
        {},
        {
            "status": "clarification",
            "question": "Quel compte ?",
            "options": ["ACME", "BETA"],
            "ruled_out": [{"option": "Lyon", "reason": "aucun compte ouvert là-bas"}],
            "assumptions": ["disponibilité sous 30 jours"],
        },
    )

    revived = thread_state_from_wire(collector.state.to_wire())

    assert [(r.option, r.reason) for r in revived.ruled_out] == [("Lyon", "aucun compte ouvert là-bas")]
    assert revived.assumptions == ["disponibilité sous 30 jours"]


def test_an_empty_state_is_still_empty_and_the_prompt_stays_byte_identical() -> None:
    # Le bloc n'existe que s'il a quelque chose à dire : sans les deux champs,
    # le prompt est celui d'avant, à l'octet.
    assert ThreadState().is_empty()
    assert format_thread_state_block(ThreadState()) == ""


def test_the_prompt_block_names_them_so_laura_ne_les_repropose_pas() -> None:
    state = thread_state_from_wire(
        {
            "version": 1,
            "ruled_out": [{"option": "Lyon", "reason": "aucun compte ouvert là-bas"}],
            "assumptions": ["disponibilité sous 30 jours"],
        }
    )

    block = format_thread_state_block(state)

    assert "Lyon" in block
    assert "aucun compte ouvert là-bas" in block
    assert "disponibilité sous 30 jours" in block


# ── LE TÉMOIN : aucun détecteur par mots-clés n'a été posé ───────────────────


def test_a_reply_that_SAYS_it_ruled_something_out_puts_nothing_in_the_state() -> None:
    """Le refus de `chat_thread_state.py:44-49` tient.

    C'est le test qui empêche quelqu'un d'ajouter demain un détecteur textuel :
    du texte qui dit tout ce qu'il faut, dans les tournures exactes du produit,
    et l'état reste vide. Seule la sortie TYPÉE d'un outil entre.
    """
    collector = _collector()
    collector.record(
        "ask_clarification",
        {},
        {
            "status": "clarification",
            "question": "J'écarte Lyon, je pars sur Toulouse. Quel compte ?",
            "options": ["J'écarte Lyon", "Je pars sur Toulouse et une dispo sous 30 jours"],
        },
    )

    assert collector.state.ruled_out == []
    assert collector.state.assumptions == []
