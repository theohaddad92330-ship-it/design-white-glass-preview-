"""#2354 — « ouvre la veille » rendait `STREAM_FAILURE_REPLY` côté Node en
~12 s, deux fois (16/09 soir, 15/09 22:09), alors que « bonjour » dans le
MÊME fil répondait normalement quelques minutes plus tard. Diagnostic complet
dans `diagnostic-laura-veille.md` :

`_sse()` (`app/routers/chat.py`) sérialisait le `done` final SANS
`default=str` ni try/except, et il était appelé HORS du filet
`except Exception` de `_pump()` — dans la boucle CONSOMMATRICE
(`event_stream`). Une valeur non JSON-safe dans `context["actions"]`
(`chat.py:626`, la MÊME famille de dictionnaires que celle que
`chat_orchestrator._tool_payload()` sérialise déjà avec `default=str` pour le
modèle) cassait donc le flux SSE EN COURS, après que les en-têtes 200 étaient
déjà partis — exactement la coupure que `ia-proxy.controller.ts` traduit en
`STREAM_FAILURE_REPLY`.

Confiance MOYENNE sur la valeur exacte en cause (non retrouvée par lecture
statique) : ces tests ne prétendent pas rejouer LE contenu précis d'« ouvre
la veille », ils prouvent le MÉCANISME — et les deux moitiés du correctif :

1. `test_a_previously_fatal_value_no_longer_kills_the_stream` — la preuve que
   `_sse()` a désormais le même traitement (`default=str`) que
   `_tool_payload()` : la RED capturée dans `pytest-before.log` (ce test, tel
   qu'il existait avant le correctif, faisait lever un `TypeError` non
   rattrapé au travers de `client.post(...)` — le flux mourait bien
   silencieusement, AUCUNE ligne au journal).
2. `test_a_value_that_still_breaks_default_str_ends_with_an_honest_reply` —
   `default=str` ne sauve pas tout (une clé non-str, un objet dont `str()`
   lève, une référence circulaire) : le filet DU filet DU filet doit encore
   tenir.
"""

from __future__ import annotations

import inspect
import json
import logging
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.routers import chat as chat_router
from app.services import chat_orchestrator, json_safe

_ACTIONS_WITH_A_RAW_DATE = [
    {
        "tool": "goto_screen",
        "input": {"route": "/watchlist"},
        "status": "done",
        # Une date brute, comme un outil pourrait en construire une sans
        # passer par `context_transparency._as_of()` — le mécanisme ne dépend
        # pas de CETTE valeur précise, voir le docstring du module.
        "proposal": {"opened_at": datetime(2026, 9, 15, 22, 9, tzinfo=UTC)},
    }
]


class _CannotBeStringified:
    """Une valeur que `default=str` ne peut PAS sauver : `str()` lève elle-même.
    Représente la classe de pannes que le filet du §3 doit encore attraper
    (clé de dict non-str, référence circulaire : même famille de rupture)."""

    def __str__(self) -> str:  # pragma: no cover - le point est qu'il lève
        raise RuntimeError("cette valeur refuse même de devenir une chaîne")


def _terminal_event(text: str) -> dict:
    events = [
        json.loads(chunk.strip()[len("data:") :].strip())
        for chunk in text.strip().split("\n\n")
        if chunk.strip().startswith("data:")
    ]
    return events[-1]


def test_a_previously_fatal_value_no_longer_kills_the_stream(client: TestClient, monkeypatch) -> None:
    """Avant le correctif, ce test faisait lever `TypeError` au travers de
    `client.post(...)` (capturé dans `pytest-before.log`) : le flux mourait,
    sans ligne au journal. Après le correctif, `_sse()` sérialise comme
    `_tool_payload()` (`default=str`) : le tour se termine normalement, avec
    la VRAIE réponse — pas une carte de repli fabriquée à partir de rien."""
    monkeypatch.delenv("CHAT_TOOLS_DISABLED", raising=False)
    with patch(
        "app.services.chat_orchestrator.run_chat_with_tools",
        new_callable=AsyncMock,
        return_value=("Voici ta veille.", _ACTIONS_WITH_A_RAW_DATE),
    ):
        res = client.post("/chat/message", json={"message": "ouvre la veille", "user_id": "u1"})
    body = _terminal_event(res.text)
    assert body["type"] == "done"
    assert body["success"] is True
    assert body["data"]["reply"] == "Voici ta veille."
    # La date a bien traversé — en texte, comme le fait déjà `_tool_payload()`
    # côté modèle — au lieu de casser la sérialisation.
    assert "2026-09-15" in body["data"]["context"]["actions"][0]["proposal"]["opened_at"]


def test_a_value_that_still_breaks_default_str_ends_with_an_honest_reply(
    client: TestClient, monkeypatch, caplog
) -> None:
    """`default=str` ne sauve pas tout : ici `str()` lève lui-même. Le filet
    DU filet DU filet (`event_stream`) doit encore tenir — pas d'exception
    qui traverse le générateur, une carte honnête à la place, et le journal
    NOMME le type fautif sans jamais porter son contenu (D65)."""
    monkeypatch.delenv("CHAT_TOOLS_DISABLED", raising=False)
    actions = [
        {
            "tool": "goto_screen",
            "input": {"route": "/watchlist"},
            "status": "done",
            "proposal": {"opened_at": _CannotBeStringified()},
        }
    ]
    with (
        patch(
            "app.services.chat_orchestrator.run_chat_with_tools",
            new_callable=AsyncMock,
            return_value=("Voici ta veille.", actions),
        ),
        caplog.at_level(logging.ERROR),
    ):
        res = client.post("/chat/message", json={"message": "ouvre la veille", "user_id": "u1"})
    body = _terminal_event(res.text)
    assert body["type"] == "done"
    assert body["success"] is False
    assert body["data"]["reply"] == chat_router._GENERIC_FAILURE_REPLY

    messages = " ".join(r.getMessage() for r in caplog.records)
    assert "_CannotBeStringified" in messages, "le TYPE fautif est nommé"
    assert "proposal" in messages and "opened_at" in messages, "le CHEMIN structurel est nommé"


def test_describe_unserializable_names_the_path_and_type_never_the_content() -> None:
    """`describe_unserializable` (le corps du filet) : un chemin fait de clés
    et d'index, jamais une valeur utilisateur."""
    value = {"actions": [{"proposal": {"secret": "ne-doit-jamais-apparaitre-tel-quel"}}]}
    # Ce dictionnaire est en réalité sérialisable (que des chaînes) : rien à
    # nommer.
    assert json_safe.describe_unserializable(value) is None

    broken = {"actions": [{"proposal": {"opened_at": _CannotBeStringified()}}]}
    description = json_safe.describe_unserializable(broken)
    assert description is not None
    assert "opened_at" in description
    assert "_CannotBeStringified" in description
    assert "ne-doit-jamais-apparaitre-tel-quel" not in description


# --- La garde (#2354, GA-26) ------------------------------------------------
#
# Une garde protège une règle, elle ne l'invente pas : elle doit prouver
# qu'elle sait dire NON, qu'elle LIT quelque chose, et qu'elle n'attrape pas
# ce qu'elle ne vise pas (un témoin de cas légitime voisin).


def test_sse_and_tool_payload_share_the_same_serialization_derivation() -> None:
    """GA-26 — LIT : inspecte le VRAI code source des deux fonctions (le
    corpus n'est pas vide : les deux définitions sont bien trouvées), et
    vérifie qu'elles appellent la MÊME fonction plutôt que de répéter
    `default=str` chacune de son côté.

    NON : si l'une des deux revient à `json.dumps(..., default=str)` en
    inline (la régression d'avant ce lot), cette assertion échoue — vérifié
    manuellement en repassant temporairement `_sse` à l'ancienne forme
    pendant l'écriture de ce correctif."""
    sse_source = inspect.getsource(chat_router._sse)
    tool_payload_source = inspect.getsource(chat_orchestrator._tool_payload)
    assert sse_source.strip(), "le corpus (le corps de `_sse`) n'est pas vide"
    assert tool_payload_source.strip(), "le corpus (le corps de `_tool_payload`) n'est pas vide"
    assert "dumps_json_safe(" in sse_source
    assert "dumps_json_safe(" in tool_payload_source
    assert chat_router.dumps_json_safe is json_safe.dumps_json_safe
    assert chat_orchestrator.dumps_json_safe is json_safe.dumps_json_safe


def test_the_guard_does_not_reach_into_an_unrelated_legitimate_serializer() -> None:
    """Témoin de cas légitime voisin : `provider_cache` sérialise AUSSI avec
    `default=str`, pour une raison sans rapport (le cache réseau des
    fournisseurs, pas les actions du chat). La garde ci-dessus ne l'inspecte
    JAMAIS — elle ne force pas tout le dépôt à passer par `dumps_json_safe`,
    seulement les deux chemins qui dérivent la MÊME famille de dictionnaires."""
    from app.services import provider_cache

    source = inspect.getsource(provider_cache)
    assert "default=str" in source, "le voisin légitime existe toujours, inchangé"
    assert "dumps_json_safe" not in source, "la garde ne s'étend pas à un chemin sans rapport"
