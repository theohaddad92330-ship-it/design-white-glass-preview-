"""#2442.3 — l'IDENTITÉ d'un tour de Laura dans sa trace, sans rien de personnel.

La trace d'un tour (``langfuse_client.bind_trace("chat_turn", summarize=True)``)
porte déjà son identifiant (dérivé du correlation-id posé par l'API, #2442.2),
sa version de prompt, son issue et — depuis ce lot — son récapitulatif de
consommation. Il lui manquait QUI et DANS QUEL CONTEXTE, sous une forme qu'un
support peut recouper sans que la trace ne devienne un double des données :

* ``user`` / ``workspace`` : des PSEUDONYMES (empreinte stable, préfixée par la
  nature de l'identifiant). Ce n'est pas une anonymisation — un support qui
  tient déjà l'identifiant d'une personne retrouve ses tours en recalculant
  l'empreinte — mais la trace, seule, ne nomme personne ;
* le contexte résolu se dit en NOMBRES et en DRAPEAUX (tours d'historique,
  documents joints, faits épinglés, CRM branché) — jamais leur contenu ;
* la demande elle-même se dit en TAILLE (``messageChars``) — jamais son texte.

Liste FERMÉE : un attribut neuf passe par ``turn_identity`` et par le test
``test_aucune_donnee_personnelle_ni_corps_ni_secret_dans_la_trace``, qui la
tient clé par clé.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Any

#: Préfixe de domaine de l'empreinte : la même valeur hachée pour un autre usage
#: ailleurs dans le dépôt ne donne jamais le même pseudonyme.
_DOMAIN = "bellum-trace"


def pseudonymize(kind: str, value: str | None) -> str | None:
    """Pseudonyme stable d'un identifiant (``kind`` = ``user``, ``workspace``…).

    Vide → ``None`` : une absence reste une absence, jamais l'empreinte de la
    chaîne vide (qui rangerait tous les inconnus sous un même faux identifiant).
    """
    raw = (value or "").strip()
    if not raw:
        return None
    digest = hashlib.sha256(f"{_DOMAIN}:{kind}:{raw}".encode()).hexdigest()[:16]
    # `nature:empreinte` — jamais `xx_…` : le masque des secrets de
    # `langfuse_client._redact` reconnaît cette forme et avalerait le pseudonyme.
    return f"{kind}:{digest}"


@dataclass(frozen=True)
class TurnIdentity:
    user: str | None
    metadata: dict[str, Any]


def turn_identity(
    *,
    user_id: str,
    workspace_id: str,
    conversation_id: str,
    account_id: str,
    message: str,
    history: list[Any] | None,
    document_ids: list[str] | None,
    pinned_facts: list[Any] | None,
    crm_connected: bool,
    interface_language: str,
) -> TurnIdentity:
    """Ce que la trace d'un tour dit de son contexte — métadonnées seulement."""
    metadata: dict[str, Any] = {
        "accountInScope": bool((account_id or "").strip()),
        "historyTurns": len(history or []),
        "attachedDocuments": len(document_ids or []),
        "pinnedFacts": len(pinned_facts or []),
        "crmConnected": bool(crm_connected),
        "interfaceLanguage": interface_language if interface_language in ("fr", "en") else "fr",
        "messageChars": len(message or ""),
    }
    workspace = pseudonymize("workspace", workspace_id)
    if workspace:
        metadata["workspace"] = workspace
    # L'identifiant de conversation est un UUID technique du dépôt, pas une
    # donnée de la personne : il reste lisible pour que le support rouvre le fil.
    if (conversation_id or "").strip():
        metadata["conversationId"] = conversation_id.strip()
    return TurnIdentity(user=pseudonymize("user", user_id), metadata=metadata)


#: #2442.3 — l'en-tête posé par l'API (`chat-turn-trace.ts:ChatTurnClock`).
TURN_HEADER = "x-bellum-turn"

#: Liste FERMÉE, la même que `CHAT_TURN_STAGES` côté API : un autre nom est ignoré.
#: #2442.4 (épopée #2879) — `auth` mesure tout ce qui s'exécute entre la
#: réception de la requête et l'entrée dans le contrôleur (routage + guards
#: Nest), span manquant nommé par l'épopée.
_API_STAGES = ("auth", "quota", "context")

#: Au-delà, ce n'est pas une durée d'étape (le tour entier plafonne à ~105 s).
_MAX_STAGE_MS = 600_000

_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)


@dataclass(frozen=True)
class TurnHeader:
    message_id: str | None
    stages_ms: dict[str, int]


def parse_turn_header(raw: str | None) -> TurnHeader:
    """Lit `id=<uuid>;quota=<ms>;context=<ms>`. Tout ce qui n'a pas la forme
    attendue est IGNORÉ, jamais deviné : un en-tête vient d'un client HTTP, et
    la trace ne doit accueillir que des nombres et un UUID."""
    message_id: str | None = None
    stages: dict[str, int] = {}
    for part in (raw or "").split(";"):
        key, sep, value = part.partition("=")
        key, value = key.strip(), value.strip()
        if not sep:
            continue
        if key == "id" and _UUID_RE.match(value):
            message_id = value.lower()
        elif key in _API_STAGES and value.isdigit() and int(value) <= _MAX_STAGE_MS:
            stages[key] = int(value)
    return TurnHeader(message_id=message_id, stages_ms=stages)


__all__ = ["TURN_HEADER", "TurnHeader", "TurnIdentity", "parse_turn_header", "pseudonymize", "turn_identity"]
