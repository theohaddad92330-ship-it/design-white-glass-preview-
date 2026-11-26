"""#AM.20 (#4054.5) — « la suite » d'une priorité enchaîne, sans que la personne ressaisisse le compte.

Après « que travailler lundi » (`get_portfolio_priorities`), « la suite » mène au premier compte rendu :
la liste de ses personnes (`get_account_contacts`) ; après cette liste, « la suite » mène à un brouillon
(`prepare_message_for_contact`) pour la première personne. Le compte voyage par l'état du fil
(`ThreadStateCollector`), jamais par une phrase : ce module ne fait que RECONNAÎTRE l'enchaînement et nommer
l'appel. Rien ne part seul — le brouillon est une carte à valider, le commercial envoie.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from app.services.chat_thread_state import ThreadState

_PRIORITIES_TOOL = "get_portfolio_priorities"
_CONTACTS_TOOL = "get_account_contacts"
_DRAFT_TOOL = "prepare_message_for_contact"

# « la suite », « on continue », « ensuite » : la demande ENTIÈRE, courte — « la suite logicielle de Thales »
# n'en est pas une.
_NEXT_STEP_RE = re.compile(
    r"^(?:et\s+)?(?:(?:vas[- ]?y\s*,?\s*)?(?:la\s+suite|on\s+continue|continue|ensuite|et\s+apres|apres|go|suivant)"
    r"|vas[- ]?y)(?:\s+(?:stp|s'il\s+te\s+plait|please))?\s*[.!?]*$"
)


def _fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text or "")
    plain = "".join(char for char in decomposed if unicodedata.category(char) != "Mn")
    return " ".join(plain.lower().replace("’", "'").split())


def asks_for_the_next_step(message: str | None) -> bool:
    """« la suite », « on continue »… — seule, sans sujet nouveau."""
    return bool(message) and _NEXT_STEP_RE.match(_fold(message or "")) is not None


@dataclass(frozen=True)
class NextStep:
    tool: str
    arguments: dict[str, str]
    label: str
    account_label: str | None = None


def next_step(message: str | None, previous: ThreadState) -> NextStep | None:
    """L'enchaînement que « la suite » désigne, ou ``None`` (aucune priorité ni liste de personnes sous les yeux)."""
    if not asks_for_the_next_step(message) or not previous.last_list:
        return None
    first = previous.last_list[0]
    if previous.last_list_tool == _PRIORITIES_TOOL and first.kind == "account":
        return NextStep(_CONTACTS_TOOL, {"account_id": first.id}, first.label, first.label)
    if previous.last_list_tool == _CONTACTS_TOOL and first.kind == "contact":
        account = previous.focus_of("account")
        return NextStep(
            _DRAFT_TOOL, {"contact_id": first.id}, first.label, account.label if account is not None else None
        )
    return None


def next_step_note(step: NextStep) -> str:
    """La consigne du tour : l'appel exact, jamais une nouvelle question."""
    if step.tool == _CONTACTS_TOOL:
        return (
            f"\n\n« LA SUITE » = le compte {step.label} que tu viens de prioriser (#4054.5). Appelle "
            f"`{_CONTACTS_TOOL}` avec account_id = « {step.arguments['account_id']} » et rends la carte "
            "`contact_list` : ne redemande ni le compte ni ce que la personne veut, tutoie, agis."
        )
    where = f" chez {step.account_label}" if step.account_label else ""
    return (
        f"\n\n« LA SUITE » = un brouillon pour {step.label}{where} (#4054.5). Appelle `{_DRAFT_TOOL}` avec "
        f"contact_id = « {step.arguments['contact_id']} » : le brouillon part À VALIDER, le commercial envoie, "
        "ne redemande pas qui."
    )


def forced_next_step_kwargs(
    step: NextStep | None,
    round_index: int,
    available_tools: list[dict[str, Any]],
    *,
    called: Sequence[str],
) -> dict[str, Any]:
    """L'outil de « la suite » est FORCÉ au premier round, une fois. Outil non exposé ou déjà appelé ⇒ ``{}``."""
    if step is None or round_index != 0 or step.tool in called:
        return {}
    if not any(tool.get("name") == step.tool for tool in available_tools):
        return {}
    return {"force_tool": step.tool}
