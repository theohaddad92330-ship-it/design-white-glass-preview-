"""#2313.1 (LAU-FINAL-054) — l'outil `declare_known_contact` : le point
d'ENTRÉE qui bootstrape une stratégie à partir d'un contact connu ou d'une
ancienne relation, plutôt que d'un compte analysé.

Ce que ces tests tiennent :
- l'outil est au catalogue, en fin de liste (préfixe d'outils en cache) ;
- il applique `relation_first_entry` (#2313.2 à .7, .10) — jamais de logique
  dupliquée ici ;
- il ne suppose JAMAIS une capacité d'introduction : sans confirmation
  explicite, `can_introduce` reste faux même si l'utilisateur la réclame ;
- une relation qui appartient à un collègue (owner différent) est BLOQUÉE
  sans sa permission, et l'outil PROPOSE de le solliciter plutôt que de
  contacter la personne ;
- lecture pure, sans I/O : aucun connecteur requis, disponible pour tous.
"""

from __future__ import annotations

from app.services.chat_tools import CHAT_TOOLS, TOOL_REQUIRED_FAMILIES, WRITE_TOOL_NAMES, execute_chat_tool

USER = "55555555-5555-5555-8555-555555555555"


def test_the_tool_is_registered_and_needs_no_connector() -> None:
    names = [tool["name"] for tool in CHAT_TOOLS]
    assert "declare_known_contact" in names
    assert "declare_known_contact" not in TOOL_REQUIRED_FAMILIES
    # Pure lecture — jamais une proposition qui écrit ou débite.
    assert "declare_known_contact" not in WRITE_TOOL_NAMES


async def test_entry_kind_is_required() -> None:
    result = await execute_chat_tool(
        "declare_known_contact",
        {},
        user_id=USER,
        profile_data=None,
    )
    assert "error" in result


async def test_unverified_relation_never_reports_an_introduction_capacity() -> None:
    # #2313.4 — même si l'utilisateur réclame "introduce", sans vérification
    # complète ET sans confirmation du référent, can_introduce reste faux.
    result = await execute_chat_tool(
        "declare_known_contact",
        {"entry_kind": "former_colleague", "claimed_capability": "introduce"},
        user_id=USER,
        profile_data=None,
    )
    assert result["capability"] == "none"
    assert result["can_introduce"] is False
    assert result["verification"]["ready"] is False
    assert len(result["verification"]["missing"]) == 10


async def test_fully_verified_and_confirmed_relation_can_introduce() -> None:
    known = {
        "identity": "Marie Martin",
        "current_title": "DSI",
        "company": "Latecoere",
        "entity": "DSI groupe",
        "last_contact_date": "2026-03-01",
        "relation_nature": "ancien collègue",
        "owner_user_id": USER,
        "visibility_permission": True,
        "context": "mission ESN 2023",
        "relation_state": "dormant",
        "entry_kind": "former_colleague",
        "claimed_capability": "introduce",
        "referrer_confirmed": True,
    }
    result = await execute_chat_tool("declare_known_contact", known, user_id=USER, profile_data=None)
    assert result["verification"]["ready"] is True
    assert result["capability"] == "introduce"
    assert result["can_introduce"] is True


async def test_sequence_next_step_starts_at_resume_or_open() -> None:
    result = await execute_chat_tool(
        "declare_known_contact",
        {"entry_kind": "consultant"},
        user_id=USER,
        profile_data=None,
    )
    assert result["sequence"]["next_step"] == "resume_or_open"
    assert result["sequence"]["done"] == []


async def test_sequence_advances_with_done_steps() -> None:
    result = await execute_chat_tool(
        "declare_known_contact",
        {"entry_kind": "consultant", "done_steps": ["resume_or_open", "ask_their_context"]},
        user_id=USER,
        profile_data=None,
    )
    assert result["sequence"]["next_step"] == "identify_topic_owner"


async def test_relation_owned_by_a_colleague_is_blocked_without_their_permission() -> None:
    # #2313.7 — la relation appartient à un collègue (owner_user_id différent
    # du demandeur) : Laura ne contacte pas, elle PROPOSE de le solliciter.
    result = await execute_chat_tool(
        "declare_known_contact",
        {"entry_kind": "crm_relation", "owner_user_id": "colleague-1"},
        user_id=USER,
        profile_data=None,
    )
    assert result["team_network"]["allowed"] is False
    assert result["team_network"]["propose_soliciting_owner"] is True


async def test_relation_owned_by_a_colleague_with_permission_is_allowed() -> None:
    result = await execute_chat_tool(
        "declare_known_contact",
        {"entry_kind": "crm_relation", "owner_user_id": "colleague-1", "owner_permission_granted": True},
        user_id=USER,
        profile_data=None,
    )
    assert result["team_network"]["allowed"] is True


async def test_draft_message_asking_directly_for_an_introduction_is_flagged() -> None:
    # #2313.6 / #2313.10 — NO-GO : la première approche ne demande pas
    # d'emblée une présentation au décideur.
    result = await execute_chat_tool(
        "declare_known_contact",
        {"entry_kind": "met_before", "draft_message": "Bonjour, peux-tu me présenter au décideur ?"},
        user_id=USER,
        profile_data=None,
    )
    assert result["message_guard"]["allowed"] is False
    assert result["message_guard"]["reason"] is not None


async def test_draft_message_without_a_direct_ask_is_allowed() -> None:
    result = await execute_chat_tool(
        "declare_known_contact",
        {"entry_kind": "met_before", "draft_message": "Ça fait longtemps ! Comment va la nouvelle mission ?"},
        user_id=USER,
        profile_data=None,
    )
    assert result["message_guard"] == {"allowed": True, "reason": None}


async def test_no_draft_message_reports_no_message_guard() -> None:
    result = await execute_chat_tool(
        "declare_known_contact",
        {"entry_kind": "met_before"},
        user_id=USER,
        profile_data=None,
    )
    assert result["message_guard"] is None


async def test_not_departed_reports_no_departed_contact_block() -> None:
    # Aucun signal de départ : `departed_contact` reste `None`, jamais un bloc
    # vide qui laisserait croire qu'un statut a été vérifié.
    result = await execute_chat_tool(
        "declare_known_contact",
        {"entry_kind": "met_before"},
        user_id=USER,
        profile_data=None,
    )
    assert result["departed_contact"] is None


async def test_departed_contact_without_a_verified_capability_reclassifies_nothing() -> None:
    # #2313.9 — partir ne crée pas, à lui seul, une capacité que rien n'a
    # vérifiée : sans les dix champs de vérification, `capability` reste
    # "none" et aucun rôle ne s'ouvre.
    result = await execute_chat_tool(
        "declare_known_contact",
        {"entry_kind": "former_colleague", "departed_from_account": True},
        user_id=USER,
        profile_data=None,
    )
    assert result["departed_contact"] == {"applies": True, "roles": [], "current_contact": False}


async def test_departed_contact_with_a_verified_relation_opens_the_three_roles() -> None:
    # #2313.8 / #2313.9 — l'exclusion reste DÉFINITIVE (`current_contact`
    # False) mais la personne redevient joignable comme relation réseau,
    # ancien terrain, ou nouvel employeur — jamais comme contact ACTUEL.
    known = {
        "identity": "Marie Martin",
        "current_title": "DSI",
        "company": "Nouvel Employeur SAS",
        "entity": "DSI groupe",
        "last_contact_date": "2026-03-01",
        "relation_nature": "ancienne collègue, partie du compte",
        "owner_user_id": USER,
        "visibility_permission": True,
        "context": "mission ESN 2023, a quitté Latecoere depuis",
        "relation_state": "dormant",
        "entry_kind": "former_colleague",
        "claimed_capability": "orient",
        "departed_from_account": True,
    }
    result = await execute_chat_tool("declare_known_contact", known, user_id=USER, profile_data=None)
    assert result["departed_contact"] == {
        "applies": True,
        "roles": ["explain_former_terrain", "open_new_employer", "network_relation"],
        "current_contact": False,
    }
