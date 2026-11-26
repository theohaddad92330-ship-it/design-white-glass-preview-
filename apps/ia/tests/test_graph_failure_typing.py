"""Le graphe ne doit pas jeter le type des erreurs qu'il attrape.

`claude_service` construit des erreurs typées : `ClaudeIncompleteOutputError`
porte `code="CLAUDE_OUTPUT_TRUNCATED"` et une phrase française destinée à
l'utilisateur. `phase1_research` les relaie exprès sans y toucher.

Puis `nodes.py` les attrapait dans un `except Exception` et appelait
``_fail(phase, str(exc), code=type(exc).__name__)`` : le code devenait le nom de
la classe Python, et `user_message` disparaissait. Une couche plus loin, ce qui
restait s'aplatissait en « research failed ».

Ces tests épinglent la traversée : ce que l'erreur savait d'elle-même doit
arriver dans l'état d'échec.
"""

from __future__ import annotations

from app.graph.nodes import _fail, _fail_from_exc
from app.services.claude_service import ClaudeError, ClaudeIncompleteOutputError


class _QuotaError(ClaudeError):
    code = "CLAUDE_CREDIT_EXHAUSTED"
    user_message = "Crédits Claude épuisés."


def test_typed_error_keeps_its_own_code() -> None:
    update = _fail_from_exc("research", _QuotaError("credit balance too low"))

    assert update["error"]["code"] == "CLAUDE_CREDIT_EXHAUSTED"
    # Surtout PAS le nom de la classe Python.
    assert update["error"]["code"] != "_QuotaError"


def test_typed_error_surfaces_its_written_sentence() -> None:
    """`message` porte la phrase écrite pour l'humain — c'est elle qui atterrit
    telle quelle dans `account.error_message`."""
    update = _fail_from_exc("research", _QuotaError("credit balance too low"))

    assert update["error"]["message"] == "Crédits Claude épuisés."


def test_technical_message_is_kept_alongside_the_written_one() -> None:
    """Les deux servent : l'un pour l'utilisateur, l'autre pour le diagnostic.

    Choisir entre les deux est EXACTEMENT l'arbitrage qui a rendu le 400
    `temperature` illisible. On garde donc les deux plutôt que d'arbitrer.
    """
    update = _fail_from_exc("research", _QuotaError("credit balance too low"))

    assert update["error"]["debug_message"] == "credit balance too low"


def test_real_truncation_error_carries_its_contract_code() -> None:
    exc = ClaudeIncompleteOutputError(prompt_name="plan", model="sonnet", max_tokens=8192)
    update = _fail_from_exc("plan", exc)

    assert update["error"]["code"] == "CLAUDE_OUTPUT_TRUNCATED"
    assert "tronquée" in update["error"]["message"]
    # Le détail technique (prompt / modèle / budget) reste disponible à côté.
    assert "max_tokens" in update["error"]["debug_message"]


def test_untyped_error_falls_back_to_the_class_name() -> None:
    """Sans type connu on garde l'ancien comportement — c'est mieux que rien,
    et on n'invente pas un code de contrat qui n'existe pas."""
    update = _fail_from_exc("classify", RuntimeError("boom"))

    assert update["error"]["code"] == "RuntimeError"
    assert "boom" in update["error"]["message"]
    # Pas de phrase utilisateur inventée pour une erreur qui n'en porte pas, et
    # pas de `debug_message` qui ne ferait que répéter `message`.
    assert "user_message" not in update["error"]
    assert "debug_message" not in update["error"]


def test_failed_phase_is_set() -> None:
    update = _fail_from_exc("contacts", RuntimeError("boom"))

    assert update["failed_phase"] == "contacts"
    assert update["error"]["phase"] == "contacts"


def test_plain_fail_still_works_without_a_user_message() -> None:
    """`_fail` garde sa signature — les appels non liés à une exception typée
    (gate, contrat manquant) ne changent pas de forme."""
    update = _fail("classify", "message", code="CLASSIFY_TERMINAL")

    assert update["error"] == {
        "phase": "classify",
        "code": "CLASSIFY_TERMINAL",
        "message": "message",
    }
