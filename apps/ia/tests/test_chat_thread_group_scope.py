"""#3178.1 / #3178.2 (LAU-FINAL-184) — LE PÉRIMÈTRE PERSISTANT, LE FACET LEDGER.

Le retour bêta #3178 : Laura réduisait une demande sur un GROUPE à la
dernière filiale mentionnée (« et les autres filiales ? » après avoir cité
BoursoBank repartait sur les seules filiales de BoursoBank, jamais sur
Société Générale). `ThreadState.focus` (#1927.1) bascule PAR CONCEPTION au
dernier compte cité — c'est sa raison d'être pour « ce compte », « lui ». Le
Facet Ledger de ce lot ajoute un second état, séparé, qui NE bascule PAS de
la même façon : `persistent_scope`, nommé par le modèle via
`note_thread_context.group_scope_root/_includes/_excludes`, jamais extrait
d'une phrase — même refus que #1927.3/#1927.4.

Antériorité vérifiée avant d'écrire ce lot : le résolveur d'entité
(`app/services/entity_resolution.py`, #2284) connaît déjà les KINDS
group/parent_company/subsidiary/business_unit/brand et la hiérarchie de
sources (legal_identifier → group_graph → normalized_name → clarification),
mais seulement au moment de l'ANALYSE d'un compte (`phase1_research.py`,
`test_entity_resolution_is_wired.py`) — rien ne le portait d'un TOUR DE CHAT
à l'autre. Ce lot ne réimplémente pas cette hiérarchie : il ajoute la
PERSISTANCE conversationnelle qui manquait, sur la même voie que
`note_thread_context` (#2268).
"""

from __future__ import annotations

import asyncio

import pytest

from app.prompts.thread_state import THREAD_CONTINUITY_BLOCK, format_thread_state_block
from app.services import chat_orchestrator
from app.services.chat_thread_state import (
    SCOPE_ENTITIES_MAX,
    ThreadState,
    ThreadStateCollector,
    thread_state_from_wire,
)
from app.services.chat_tools import NOTE_THREAD_CONTEXT_TOOL, execute_chat_tool
from tests.test_unrouted_intent import USER, _resp, _text, _tool_use, fake_model  # noqa: F401

# ── La sortie TYPÉE ──────────────────────────────────────────────────────────


def test_the_tool_exposes_the_three_scope_fields_still_optional() -> None:
    schema = NOTE_THREAD_CONTEXT_TOOL["input_schema"]
    assert schema["required"] == []
    assert {"group_scope_root", "group_scope_includes", "group_scope_excludes"} <= set(schema["properties"])


def test_the_tool_exposes_the_unresolved_scope_field() -> None:
    """#3178.2b — la quatrième voie du Facet Ledger, toujours optionnelle."""
    schema = NOTE_THREAD_CONTEXT_TOOL["input_schema"]
    assert "group_scope_unresolved" in schema["properties"]
    assert schema["properties"]["group_scope_unresolved"]["items"]["type"] == "string"


async def _note(**fields: object) -> dict:
    return await execute_chat_tool("note_thread_context", fields, user_id="u-1", profile_data=None)


async def test_the_executor_keeps_the_scope_root_the_model_named() -> None:
    out = await _note(group_scope_root={"id": "acc-sg", "label": "Groupe Société Générale"})

    assert out["group_scope_root"] == {"id": "acc-sg", "label": "Groupe Société Générale"}


async def test_the_executor_keeps_included_and_excluded_entities() -> None:
    out = await _note(
        group_scope_root={"id": "acc-sg", "label": "Groupe Société Générale"},
        group_scope_includes=[{"id": "acc-bb", "label": "BoursoBank"}],
        group_scope_excludes=[{"id": "acc-homonym", "label": "Générale (homonyme)"}],
    )

    assert out["group_scope_includes"] == [{"id": "acc-bb", "label": "BoursoBank"}]
    assert out["group_scope_excludes"] == [{"id": "acc-homonym", "label": "Générale (homonyme)"}]


async def test_the_executor_keeps_unresolved_entities() -> None:
    out = await _note(group_scope_unresolved=["une filiale citée, compte non retrouvé"])

    assert out["group_scope_unresolved"] == ["une filiale citée, compte non retrouvé"]


async def test_a_scope_entity_without_id_or_label_is_dropped_not_guessed() -> None:
    out = await _note(group_scope_includes=[{"label": "sans id"}, {"id": "acc-bb", "label": "BoursoBank"}])

    assert out["group_scope_includes"] == [{"id": "acc-bb", "label": "BoursoBank"}]


async def test_a_call_with_only_scope_is_not_refused() -> None:
    out = await _note(group_scope_root={"id": "acc-sg", "label": "Groupe Société Générale"})

    assert "error" not in out


# ── La traversée jusqu'à l'état du fil ───────────────────────────────────────


def _collector(previous: ThreadState | None = None) -> ThreadStateCollector:
    return ThreadStateCollector(previous or ThreadState())


def _note_scope(collector: ThreadStateCollector, **fields: object) -> None:
    collector.record("note_thread_context", {}, {"status": "thread_note", **fields})


def test_the_state_remembers_the_scope_root() -> None:
    collector = _collector()
    _note_scope(collector, group_scope_root={"id": "acc-sg", "label": "Groupe Société Générale"})

    assert collector.state.persistent_scope is not None
    assert collector.state.persistent_scope.root_entity.label == "Groupe Société Générale"
    assert collector.state.persistent_scope.root_entity.id == "acc-sg"
    assert collector.state.persistent_scope.included_entities == ()
    assert collector.state.persistent_scope.excluded_entities == ()


def test_included_entities_accumulate_across_turns() -> None:
    collector = _collector()
    _note_scope(collector, group_scope_root={"id": "acc-sg", "label": "Groupe Société Générale"})
    _note_scope(collector, group_scope_includes=[{"id": "acc-bb", "label": "BoursoBank"}])
    _note_scope(collector, group_scope_includes=[{"id": "acc-sgcib", "label": "SG CIB"}])

    included = {obj.id for obj in collector.state.persistent_scope.included_entities}
    assert included == {"acc-bb", "acc-sgcib"}


def test_the_scope_lists_are_bounded() -> None:
    collector = _collector()
    _note_scope(collector, group_scope_root={"id": "acc-sg", "label": "Groupe Société Générale"})
    for index in range(SCOPE_ENTITIES_MAX + 2):
        _note_scope(collector, group_scope_includes=[{"id": f"acc-{index}", "label": f"Filiale {index}"}])

    assert len(collector.state.persistent_scope.included_entities) == SCOPE_ENTITIES_MAX
    # La plus récente en tête, comme `ruled_out`/`decisions`.
    assert collector.state.persistent_scope.included_entities[0].id == f"acc-{SCOPE_ENTITIES_MAX + 1}"


def test_an_entity_moved_to_excluded_leaves_included() -> None:
    collector = _collector()
    _note_scope(collector, group_scope_root={"id": "acc-sg", "label": "Groupe Société Générale"})
    _note_scope(collector, group_scope_includes=[{"id": "acc-x", "label": "Homonyme"}])
    _note_scope(collector, group_scope_excludes=[{"id": "acc-x", "label": "Homonyme"}])

    included_ids = {obj.id for obj in collector.state.persistent_scope.included_entities}
    excluded_ids = {obj.id for obj in collector.state.persistent_scope.excluded_entities}
    assert "acc-x" not in included_ids
    assert "acc-x" in excluded_ids


def test_a_new_root_opens_a_fresh_scope_and_drops_the_previous_entities() -> None:
    collector = _collector()
    _note_scope(collector, group_scope_root={"id": "acc-sg", "label": "Groupe Société Générale"})
    _note_scope(collector, group_scope_includes=[{"id": "acc-bb", "label": "BoursoBank"}])
    _note_scope(collector, group_scope_root={"id": "acc-vinci", "label": "Vinci"})

    scope = collector.state.persistent_scope
    assert scope.root_entity.id == "acc-vinci"
    assert scope.included_entities == ()


# ── #3178.2b (épopée #3227) — les entités CITÉES sans compte résolu ─────────


def test_the_state_remembers_an_unresolved_entity() -> None:
    collector = _collector()
    _note_scope(collector, group_scope_root={"id": "acc-vinci", "label": "Vinci"})
    _note_scope(collector, group_scope_unresolved=["une filiale liée, compte non retrouvé"])

    assert collector.state.persistent_scope.unresolved_entities == ("une filiale liée, compte non retrouvé",)


def test_unresolved_entities_accumulate_across_turns() -> None:
    collector = _collector()
    _note_scope(collector, group_scope_root={"id": "acc-vinci", "label": "Vinci"})
    _note_scope(collector, group_scope_unresolved=["Filiale A"])
    _note_scope(collector, group_scope_unresolved=["Filiale B"])

    assert set(collector.state.persistent_scope.unresolved_entities) == {"Filiale A", "Filiale B"}


def test_unresolved_entities_are_bounded() -> None:
    collector = _collector()
    _note_scope(collector, group_scope_root={"id": "acc-vinci", "label": "Vinci"})
    for index in range(SCOPE_ENTITIES_MAX + 2):
        _note_scope(collector, group_scope_unresolved=[f"Filiale {index}"])

    assert len(collector.state.persistent_scope.unresolved_entities) == SCOPE_ENTITIES_MAX
    assert collector.state.persistent_scope.unresolved_entities[0] == f"Filiale {SCOPE_ENTITIES_MAX + 1}"


def test_an_entity_that_becomes_included_leaves_unresolved() -> None:
    """Une entité RÉSOLUE quitte les non résolues : c'est précisément ce que
    « résolue » veut dire (même discipline que included/excluded)."""
    collector = _collector()
    _note_scope(collector, group_scope_root={"id": "acc-vinci", "label": "Vinci"})
    _note_scope(collector, group_scope_unresolved=["Vinci Energies"])
    _note_scope(collector, group_scope_includes=[{"id": "acc-ve", "label": "Vinci Energies"}])

    assert collector.state.persistent_scope.unresolved_entities == ()
    included = {obj.label for obj in collector.state.persistent_scope.included_entities}
    assert "Vinci Energies" in included


def test_a_new_root_also_drops_the_previous_unresolved_entities() -> None:
    collector = _collector()
    _note_scope(collector, group_scope_root={"id": "acc-sg", "label": "Groupe Société Générale"})
    _note_scope(collector, group_scope_unresolved=["Filiale non identifiée"])
    _note_scope(collector, group_scope_root={"id": "acc-vinci", "label": "Vinci"})

    assert collector.state.persistent_scope.unresolved_entities == ()


# ── LE NO-GO : citer une filiale ne réduit JAMAIS le périmètre ──────────────


def test_citing_a_subsidiary_as_the_current_focus_never_touches_the_persistent_scope() -> None:
    """Le cas exact du retour : Laura cite BoursoBank (le compte dont on parle
    CE tour, via `get_account_briefing`) après avoir fixé le groupe Société
    Générale comme périmètre — `focus` bascule sur BoursoBank (#1927.1, par
    conception), `persistent_scope` n'en sait rien."""
    collector = _collector()
    _note_scope(collector, group_scope_root={"id": "acc-sg", "label": "Groupe Société Générale"})

    collector.record(
        "get_account_briefing",
        {"account_id": "acc-bb"},
        {"account_id": "acc-bb", "company_name": "BoursoBank"},
    )

    assert collector.state.focus_of("account").label == "BoursoBank"
    assert collector.state.persistent_scope.root_entity.label == "Groupe Société Générale"


def test_a_reply_that_says_a_scope_puts_nothing_in_the_state() -> None:
    """Même refus que #1927.3/#1927.4 et #2268 : seule la sortie TYPÉE de
    `note_thread_context` entre dans l'état, jamais une phrase du modèle."""
    collector = _collector()
    collector.record(
        "ask_clarification",
        {},
        {
            "status": "clarification",
            "question": "Je garde le groupe Société Générale comme périmètre. Quelle filiale ?",
            "options": ["BoursoBank", "SG CIB"],
        },
    )

    assert collector.state.persistent_scope is None


# ── Le fil (IA → API → IA) ────────────────────────────────────────────────────


def test_the_scope_survives_the_round_trip_through_the_wire() -> None:
    collector = _collector()
    _note_scope(collector, group_scope_root={"id": "acc-sg", "label": "Groupe Société Générale"})
    _note_scope(collector, group_scope_includes=[{"id": "acc-bb", "label": "BoursoBank"}])
    _note_scope(collector, group_scope_excludes=[{"id": "acc-x", "label": "Homonyme"}])

    revived = thread_state_from_wire(collector.state.to_wire())

    assert revived.persistent_scope.root_entity.label == "Groupe Société Générale"
    assert [obj.label for obj in revived.persistent_scope.included_entities] == ["BoursoBank"]
    assert [obj.label for obj in revived.persistent_scope.excluded_entities] == ["Homonyme"]


def test_a_scope_without_a_root_is_read_as_no_scope_at_all() -> None:
    """Un périmètre SANS racine ne décrit rien — même refus qu'un critère exclu
    sans son texte."""
    state = thread_state_from_wire(
        {
            "version": 1,
            "objects": [],
            "focus": [],
            "last_list": None,
            "searches": [],
            "proposals": [],
            "questions": [],
            "persistent_scope": {"root_entity": None, "included_entities": [], "excluded_entities": []},
        }
    )

    assert state.persistent_scope is None


def test_an_empty_state_is_still_empty() -> None:
    assert ThreadState().is_empty()
    assert format_thread_state_block(ThreadState()) == ""


# ── Le prompt ─────────────────────────────────────────────────────────────────


def test_the_prompt_block_names_the_root_and_its_entities() -> None:
    state = thread_state_from_wire(
        {
            "version": 1,
            "objects": [],
            "focus": [],
            "last_list": None,
            "searches": [],
            "proposals": [],
            "questions": [],
            "persistent_scope": {
                "root_entity": {"kind": "account", "id": "acc-sg", "label": "Groupe Société Générale"},
                "included_entities": [{"kind": "account", "id": "acc-bb", "label": "BoursoBank"}],
                "excluded_entities": [],
            },
        }
    )

    block = format_thread_state_block(state)

    assert "Groupe Société Générale" in block
    assert "BoursoBank" in block
    assert "Périmètre persistant" in block
    # #3866 (VU EN PASSANT, recette prod 08/10, 2e passe) — pied de réponse
    # "Périmètre : compte ROCHE" affiché sur une question sans rapport avec ce
    # groupe. Le bloc dit maintenant explicitement de ne citer ce périmètre que
    # pour une question qui le concerne.
    assert "Ne cite ce périmètre QUE si la question porte sur ce groupe" in block


def test_the_continuity_block_states_the_no_go_rule() -> None:
    assert "group_scope_root" in THREAD_CONTINUITY_BLOCK
    assert "JAMAIS" in THREAD_CONTINUITY_BLOCK


# ── Silencieux, comme `note_thread_context` (#2268.1/.5/.10) ────────────────


def test_a_scope_note_next_to_the_answer_ends_the_turn_without_another_model_call(fake_model) -> None:
    messages = fake_model(
        [
            _resp(
                "tool_use",
                [
                    _text("Je garde le groupe Société Générale comme périmètre."),
                    _tool_use(
                        "note_thread_context",
                        {"group_scope_root": {"id": "acc-sg", "label": "Groupe Société Générale"}},
                        "t1",
                    ),
                ],
            )
        ]
    )
    events: list[dict] = []

    async def emit(event: dict) -> None:
        events.append(event)

    reply, actions = asyncio.run(
        chat_orchestrator.run_chat_with_tools(
            "system", "Cherche sur tout le groupe Société Générale", user_id=USER, profile_data=None, emit=emit
        )
    )

    assert reply.startswith("Je garde le groupe Société Générale")
    assert len(messages.calls) == 1, "la note ne doit pas payer un aller-retour de modèle de plus"
    assert not [event for event in events if event.get("type") == "step"], "l'outil silencieux n'affiche aucune étape"


# ── #3178.5 — LE CORPUS D'ÉVAL, les CINQ scénarios NOMMÉS par la spec ────────
#
# `test_citing_a_subsidiary_as_the_current_focus_never_touches_the_persistent_
# scope` (ci-dessus) prouve le NO-GO sur UN groupe, à l'intérieur d'UN test.
# Le ticket #3178.5 en demande un jeu NOMMÉ et MULTI-TOURS — chaque groupe de
# la spec, rejoué comme une CONVERSATION (racine posée, puis une entité citée
# en devient une autre, jamais une troisième), contre le collecteur
# déterministe (`ThreadStateCollector`) — distinct des tests unitaires
# ci-dessus qui vérifient chacun UN mécanisme (bornage, wire, prompt...),
# jamais un parcours complet nommé par la spec.
_GOLDEN_GROUP_SCENARIOS = (
    pytest.param(
        {"id": "acc-sg", "label": "Société Générale"},
        {"id": "acc-sgcib", "label": "SG CIB"},
        {"id": "acc-bb", "label": "BoursoBank"},
        id="societe_generale-sgcib-boursobank",
    ),
    pytest.param(
        {"id": "acc-bpce", "label": "Groupe BPCE"},
        {"id": "acc-bpce-si", "label": "BPCE SI"},
        {"id": "acc-banque-pop", "label": "Banque Populaire Occitane"},
        id="bpce-bpce_si-banques_regionales",
    ),
    pytest.param(
        {"id": "acc-vinci", "label": "Vinci"},
        {"id": "acc-vinci-energies", "label": "Vinci Energies"},
        {"id": "acc-vinci-construction", "label": "Vinci Construction France"},
        id="vinci-vinci_energies-filiales_francaises",
    ),
    pytest.param(
        {"id": "acc-airbus", "label": "Airbus"},
        {"id": "acc-airbus-atlantic", "label": "Airbus Atlantic"},
        {"id": "acc-airbus-helicopters", "label": "Airbus Helicopters"},
        id="airbus-airbus_atlantic-groupe",
    ),
    pytest.param(
        {"id": "acc-laposte", "label": "La Poste"},
        {"id": "acc-docaposte", "label": "Docaposte"},
        {"id": "acc-laposte-mobile", "label": "La Poste Mobile"},
        id="la_poste-docaposte-autres_entites_numeriques",
    ),
)


@pytest.mark.parametrize(("root", "first_cited", "later_cited"), _GOLDEN_GROUP_SCENARIOS)
def test_golden_group_scope_scenario(root: dict, first_cited: dict, later_cited: dict) -> None:
    """Un parcours à TROIS tours, sur le collecteur déterministe :

    1. Laura fixe le périmètre sur le GROUPE (`note_thread_context`).
    2. Un tour plus tard, elle cite une PREMIÈRE filiale/entité (le compte
       dont on parle change — `focus`, #1927.1) — le périmètre ne bouge pas.
    3. Un tour encore plus tard, elle en cite une SECONDE, plus profonde —
       même refus : `persistent_scope` ignore chaque bascule de `focus`,
       et la première entité citée reste dans `included_entities` (jamais
       remplacée par la seconde, jamais oubliée).

    « Et les autres entités du groupe ? » revient donc au GROUPE entier —
    jamais à la dernière filiale citée — sur les CINQ groupes de la spec,
    pas seulement Société Générale.
    """
    collector = _collector()

    # Tour 1 — le périmètre est fixé sur le groupe.
    _note_scope(collector, group_scope_root=root)
    assert collector.state.persistent_scope.root_entity.label == root["label"]

    # Tour 2 — une première entité est citée : le focus bascule, le
    # périmètre non (même cas que le test SG ci-dessus, rejoué ICI).
    collector.record(
        "get_account_briefing",
        {"account_id": first_cited["id"]},
        {"account_id": first_cited["id"], "company_name": first_cited["label"]},
    )
    _note_scope(collector, group_scope_includes=[first_cited])
    assert collector.state.focus_of("account").label == first_cited["label"]
    assert collector.state.persistent_scope.root_entity.label == root["label"]

    # Tour 3 — une entité PLUS profonde est citée : le focus bascule encore,
    # le périmètre toujours pas, et la première entité citée reste incluse
    # (« et les autres » doit pouvoir encore la citer).
    collector.record(
        "get_account_briefing",
        {"account_id": later_cited["id"]},
        {"account_id": later_cited["id"], "company_name": later_cited["label"]},
    )
    _note_scope(collector, group_scope_includes=[later_cited])

    scope = collector.state.persistent_scope
    assert collector.state.focus_of("account").label == later_cited["label"]
    assert scope.root_entity.label == root["label"], "le tour 3 ne doit JAMAIS réduire le périmètre à la 2e entité"
    included_labels = {obj.label for obj in scope.included_entities}
    assert first_cited["label"] in included_labels, "la 1re entité citée reste connue — jamais remplacée"
    assert later_cited["label"] in included_labels

    # Le tout survit le round-trip API → IA (comme un vrai 4e tour repartirait
    # de l'état sérialisé, pas de l'objet Python en mémoire).
    revived = thread_state_from_wire(collector.state.to_wire())
    assert revived.persistent_scope.root_entity.label == root["label"]


# ── #3177/#3225 (reste, lot M01 29/09) — ANCRER search_market_memory sur le
# périmètre persistant quand le modèle omet company_id ────────────────────
#
# Recette prod 29/09 puis 30/09 (#3177, #3225) : « Qu'est-ce que la mémoire
# marché sait du groupe La Poste et de ses filiales ? » → « la source n'a pas
# répondu dans ce tour », couche classée « Non demandé ». Diagnostic du lot
# M01 : le budget de lecture élargi (20 s) ne change rien, parce que
# `market_memory_context_for_group` n'est JAMAIS appelé — le modèle a fixé le
# périmètre via `note_thread_context.group_scope_root` mais n'a pas repassé
# `company_id` sur CET appel de `search_market_memory`, et l'axe identité
# (chat_tools.py, #3177.2) exige `company_id` explicitement : sans lui,
# l'appel tombe sur l'axe critères, qui refuse « aucun filtre » ou cherche à
# côté du périmètre annoncé. C'est l'appelant manquant.


def test_search_market_memory_is_anchored_on_the_persistent_scope_when_company_id_is_omitted() -> None:
    collector = _collector()
    _note_scope(collector, group_scope_root={"id": "acc-lp", "label": "Groupe La Poste"})

    effective, _ = collector.prepare("search_market_memory", {})

    assert effective["company_id"] == "acc-lp"
    assert effective["include_subsidiaries"] is True


def test_an_explicit_company_id_is_never_overridden_by_the_persistent_scope() -> None:
    """Le modèle garde la main : un `company_id` qu'il donne explicitement
    n'est jamais remplacé par le périmètre persistant, même différent."""
    collector = _collector()
    _note_scope(collector, group_scope_root={"id": "acc-lp", "label": "Groupe La Poste"})

    effective, _ = collector.prepare("search_market_memory", {"company_id": "acc-other"})

    assert effective["company_id"] == "acc-other"
    assert "include_subsidiaries" not in effective


def test_without_a_persistent_scope_search_market_memory_is_left_untouched() -> None:
    collector = _collector()
    raw = {"technology": "Java"}

    effective, refinement = collector.prepare("search_market_memory", raw)

    assert effective is raw
    assert refinement is None


def test_the_scope_anchor_combines_with_a_refine_on_criteria() -> None:
    """L'ancrage d'identité et l'affinage de critères (#1927.7) sont deux axes
    du MÊME outil (#3177.2) : les deux jouent sur le même appel."""
    collector = _collector()
    _note_scope(collector, group_scope_root={"id": "acc-lp", "label": "Groupe La Poste"})
    collector.record("search_market_memory", {"technology": "Java"}, {"matches": [], "truncated": False})

    effective, refinement = collector.prepare(
        "search_market_memory", {"refine": True, "location": "Île-de-France"}
    )

    assert effective["company_id"] == "acc-lp"
    assert effective["include_subsidiaries"] is True
    assert effective["technology"] == "Java"
    assert effective["location"] == "Île-de-France"
    assert refinement is not None
