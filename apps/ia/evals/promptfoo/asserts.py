"""Assertions déterministes Python (#4111) pour le cas d'analyse `org_declare`."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

_IA_ROOT = Path(__file__).resolve().parents[2]
if str(_IA_ROOT) not in sys.path:
    sys.path.insert(0, str(_IA_ROOT))


def _extract_json(raw: str) -> str:
    # Règle du dépôt : du premier `{` au dernier `}`.
    start, end = raw.find("{"), raw.rfind("}")
    return raw[start : end + 1] if 0 <= start < end else raw


def org_schema(output: str, context: dict[str, Any]) -> dict[str, Any]:
    """JSON valide au schéma `OrgDeclareOutput`."""
    from app.models.outputs.org_declare import OrgDeclareOutput

    try:
        OrgDeclareOutput.model_validate_json(_extract_json(output))
    except Exception as exc:  # noqa: BLE001
        return {"pass": False, "score": 0, "reason": f"JSON non conforme à OrgDeclareOutput : {exc}"}
    return {"pass": True, "score": 1, "reason": "JSON conforme à OrgDeclareOutput"}


def org_names_in_source(output: str, context: dict[str, Any]) -> dict[str, Any]:
    """Aucune personne inventée : chaque nom rendu figure dans le texte source."""
    from app.models.outputs.org_declare import OrgDeclareOutput

    source = str((context.get("vars") or {}).get("text", "")).lower()
    try:
        parsed = OrgDeclareOutput.model_validate_json(_extract_json(output))
    except Exception as exc:  # noqa: BLE001
        return {"pass": False, "score": 0, "reason": f"JSON illisible : {exc}"}
    invented = [p.full_name for p in parsed.people if p.full_name.strip().lower() not in source]
    if invented:
        return {"pass": False, "score": 0, "reason": f"Noms absents du texte : {json.dumps(invented, ensure_ascii=False)}"}
    return {"pass": True, "score": 1, "reason": "Tous les noms figurent dans le texte source"}


def org_empty_when_no_name(output: str, context: dict[str, Any]) -> dict[str, Any]:
    """Un texte qui ne nomme personne -> liste vide."""
    from app.models.outputs.org_declare import OrgDeclareOutput

    try:
        parsed = OrgDeclareOutput.model_validate_json(_extract_json(output))
    except Exception as exc:  # noqa: BLE001
        return {"pass": False, "score": 0, "reason": f"JSON illisible : {exc}"}
    if parsed.people:
        return {"pass": False, "score": 0, "reason": "Des personnes rendues alors que le texte n'en nomme aucune"}
    return {"pass": True, "score": 1, "reason": "Liste vide, comme attendu"}


#: #4438 — ce qui n'est PAS un résultat : demander, proposer un choix, noter le fil.
_NOT_A_RESULT = frozenset({"ask_clarification", "offer_reply_options", "note_thread_context"})


def laura_acts(output: str, context: dict[str, Any]) -> dict[str, Any]:
    """#4438 — Laura AGIT : aucune question d'élargissement, un résultat rendu
    (au moins `min_tool_calls` appels de travail, 1 par défaut), et la prose
    bornée par `CHAT_PROSE_MAX_WORDS` — la MÊME constante que le prompt."""
    from app.prompts.laura_acts import (
        CHAT_PROSE_MAX_WORDS,
        asks_to_widen_or_continue,
        prose_word_count,
        strip_relaunch_tail,
    )

    try:
        parsed = json.loads(output)
    except (TypeError, ValueError) as exc:
        return {"pass": False, "score": 0, "reason": f"Sortie illisible : {exc}"}
    text = str(parsed.get("text") or "")
    names = [str(call.get("name", "")) for call in parsed.get("tool_calls") or []]
    if "ask_clarification" in names:
        return {"pass": False, "score": 0, "reason": "Question de cadrage posée au lieu de chercher"}
    if asks_to_widen_or_continue(text):
        return {"pass": False, "score": 0, "reason": "Propose d'élargir ou de continuer au lieu de le faire"}
    # R22-LG (recette prod 22/10) — la MÊME lecture que la garde de sortie (`strip_relaunch_tail`).
    if strip_relaunch_tail(text) != text:
        return {"pass": False, "score": 0, "reason": "Relance, phrase-gabarit ou « reste à faire » en fin de réponse"}
    words = prose_word_count(text)
    if words > CHAT_PROSE_MAX_WORDS:
        return {"pass": False, "score": 0, "reason": f"{words} mots de prose (plafond {CHAT_PROSE_MAX_WORDS})"}
    minimum = int((context.get("vars") or {}).get("min_tool_calls") or 1)
    work = [name for name in names if name not in _NOT_A_RESULT]
    if len(work) < minimum:
        return {"pass": False, "score": 0, "reason": f"{len(work)} appel(s) de travail, {minimum} attendu(s)"}
    return {"pass": True, "score": 1, "reason": f"Agit : {len(work)} appel(s), {words} mots de prose"}


def talent_message_informal(output: str, context: dict[str, Any]) -> dict[str, Any]:
    """#4347.2 — le message au consultant tutoie : la même règle que le post-contrôle de l'endpoint."""
    from app.services.talent_message import accept_draft

    channel = str((context.get("vars") or {}).get("channel", "email"))
    try:
        raw = json.loads(_extract_json(output))
    except Exception as exc:  # noqa: BLE001
        return {"pass": False, "score": 0, "reason": f"JSON illisible : {exc}"}
    if accept_draft(raw, channel) is None:
        return {"pass": False, "score": 0, "reason": "message refusé (vouvoiement, trou ou éditeur nommé)"}
    return {"pass": True, "score": 1, "reason": "message au tutoiement"}
