"""#3708 — « Outils et sources » : l'exclusion choisie dans la saisie est RÉELLE.

Ce que le test prouve, tour rejoué (entrée → outils présentés → consigne) :
- une famille exclue retire ses outils du catalogue du tour (pas une mention) ;
- une famille non exclue garde les siens ;
- la consigne dit « exclu pour cette demande », jamais « non connecté » ;
- sans exclusion, le corps du tour est byte-identique (aucun bloc).
"""

from __future__ import annotations

from app.models.chat import ChatRequest
from app.prompts.excluded_sources import excluded_sources_block
from app.services.chat_tools import tools_for


def _req(**kwargs) -> ChatRequest:
    return ChatRequest(message="relance mon contact", user_id="u", **kwargs)


def _names(tools: list[dict]) -> set[str]:
    return {str(tool["name"]) for tool in tools}


def test_excluded_family_removes_its_tools_for_the_turn() -> None:
    req = _req(connected_families=["crm", "email"], excluded_families=["crm"])
    names = _names(tools_for(req.connected_families))
    assert "export_contact_to_crm" not in names
    assert req.connected_families == ["email"]


def test_other_families_keep_their_tools() -> None:
    plain = _names(tools_for(["crm", "email"]))
    req = _req(connected_families=["crm", "email"], excluded_families=["crm"])
    kept = _names(tools_for(req.connected_families))
    assert "export_contact_to_crm" in plain
    assert kept < plain


def test_unknown_connection_state_still_honours_exclusion() -> None:
    """`connected_families=None` rend tous les outils — l'exclusion ne s'y perd pas."""
    req = _req(excluded_families=["crm"])
    assert req.connected_families is not None
    assert "export_contact_to_crm" not in _names(tools_for(req.connected_families))


def test_no_exclusion_leaves_the_request_untouched() -> None:
    assert _req(connected_families=["crm"]).connected_families == ["crm"]
    assert _req().connected_families is None


def test_block_says_excluded_not_disconnected() -> None:
    block = excluded_sources_block(["crm"], "fr")
    assert "exclu" in block.lower()
    assert "non connect" not in block.lower()
    assert "ton CRM" in block


def test_block_is_empty_without_exclusion_and_in_english() -> None:
    assert excluded_sources_block(None, "fr") == ""
    assert excluded_sources_block([], "fr") == ""
    assert "excluded" in excluded_sources_block(["email"], "en").lower()


# ── #3708.fournisseur — l'exclusion par OUTIL branché, pas par famille ───────


def test_excluded_provider_that_is_the_read_crm_removes_the_crm_tools() -> None:
    """HubSpot est le CRM que le pont lit : le décocher coupe la lecture CRM, même
    quand l'API n'a pas (encore) exclu la famille entière."""
    req = _req(
        connected_families=["crm", "email"],
        crm_provider="hubspot",
        excluded_providers=["hubspot"],
    )
    names = _names(tools_for(req.connected_families))
    assert "get_crm_presence" not in names and "export_contact_to_crm" not in names
    assert req.connected_families == ["email"]
    # La famille entre dans `excluded_families` : toutes les lectures CRM du tour
    # (aperçu de dossier, reçu, consigne) lisent LA MÊME donnée.
    assert "crm" in (req.excluded_families or [])


def test_excluding_another_crm_leaves_the_read_crm_alone() -> None:
    req = _req(
        connected_families=["crm", "email"],
        crm_provider="hubspot",
        excluded_providers=["salesforce"],
    )
    assert "get_crm_presence" in _names(tools_for(req.connected_families))
    assert req.connected_families == ["crm", "email"]
    assert not req.excluded_families


def test_excluded_provider_without_crm_match_changes_nothing() -> None:
    req = _req(connected_families=["email"], excluded_providers=["gmail"])
    assert req.connected_families == ["email"]
    assert not req.excluded_families


def test_no_excluded_provider_is_byte_identical() -> None:
    req = _req(connected_families=["crm"], crm_provider="hubspot")
    assert req.connected_families == ["crm"]
    assert req.excluded_providers is None


def test_provider_exclusion_composes_with_family_exclusion() -> None:
    req = _req(
        connected_families=["crm", "email", "calendar"],
        crm_provider="hubspot",
        excluded_families=["calendar"],
        excluded_providers=["hubspot"],
    )
    assert req.connected_families == ["email"]
    assert sorted(req.excluded_families or []) == ["calendar", "crm"]


# #3973 (décision Louis 11/10/2026) — Microsoft 365 compte dans `email` ET
# `calendar` au registre : l'API envoie donc l'agenda dans les familles
# connectées d'un espace qui n'a que Microsoft, et ne déclare la famille
# `calendar` exclue que quand son DERNIER outil (Google ou Microsoft) est décoché.


def test_microsoft_only_workspace_sees_the_agenda_tools() -> None:
    names = _names(tools_for(_req(connected_families=["calendar", "email"]).connected_families))
    assert {"list_agenda", "find_free_slots", "prepare_day_brief", "search_mailbox"} <= names


def test_unchecking_google_calendar_keeps_microsoft_agenda_readable() -> None:
    req = _req(connected_families=["calendar", "email"], excluded_providers=["google-calendar"])
    assert not req.excluded_families
    assert "list_agenda" in _names(tools_for(req.connected_families))


def test_unchecking_microsoft_alone_removes_mail_and_agenda() -> None:
    req = _req(
        connected_families=["calendar", "email"],
        excluded_providers=["microsoft"],
        excluded_families=["calendar", "email"],
    )
    names = _names(tools_for(req.connected_families))
    assert "list_agenda" not in names
    assert "search_mailbox" not in names
