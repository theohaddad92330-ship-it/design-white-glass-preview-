"""#2283.6/.8/.9/.10/.13/.14/.16 — taxonomie d'erreurs typée pour les outils du
chat, absente jusqu'ici (chaque outil rendait un ``{"error": "<texte libre>"}``
sans code ni signal « faut-il retenter »).

Ce test verrouille le contrat minimal : un code par famille d'échec citée dans
LAU-FINAL-024 (#2283), une exception que les outils peuvent lever explicitement
plutôt que d'inventer un texte, et une classification par défaut des exceptions
Python courantes — jamais une classification devinée depuis un message libre
(ça resterait "internal", le repli sûr, pas un code inventé)."""

from __future__ import annotations

import asyncio

import httpx
import pytest

from app.services.tool_error_taxonomy import (
    RETRYABLE_CODES,
    ToolErrorCode,
    ToolTaxonomyError,
    classify_exception,
    tool_error_payload,
)


def test_every_epic_failure_family_has_a_code() -> None:
    # Les onze familles de LAU-FINAL-024 (#2283, "TYPOLOGIE D'ÉCHEC") — "job
    # annulé" est déjà couvert par AgentStatus.CANCELLED (agent_envelope.py),
    # pas dupliqué ici.
    expected = {
        "input_invalid",
        "ambiguous_object",
        "permission",
        "quota",
        "source_not_covered",
        "temporarily_unavailable",
        "timeout",
        "malformed_response",
        "no_result",
        "internal",
        "conflict",
    }
    assert {code.value for code in ToolErrorCode} == expected


def test_only_transient_families_are_retryable() -> None:
    # Retenter un input invalide, une permission ou un quota dans la même
    # seconde ne change rien — seul ce qui peut guérir tout seul l'est.
    assert RETRYABLE_CODES == {ToolErrorCode.TEMPORARILY_UNAVAILABLE, ToolErrorCode.TIMEOUT}
    for code in ToolErrorCode:
        if code not in RETRYABLE_CODES:
            assert code not in RETRYABLE_CODES  # tautologique mais documente l'intention


def test_tool_error_payload_is_additive_to_the_existing_error_key() -> None:
    payload = tool_error_payload(ToolErrorCode.PERMISSION, "Vous n'avez pas accès à ce compte.")
    # Le champ historique que ~190 sites de chat_tools.py et tous les
    # consommateurs (`_execute_one_tool`) lisent déjà ne doit jamais bouger.
    assert payload["error"] == "Vous n'avez pas accès à ce compte."
    assert payload["error_code"] == "permission"
    assert payload["retryable"] is False


def test_tool_error_payload_marks_transient_families_retryable() -> None:
    payload = tool_error_payload(ToolErrorCode.TIMEOUT, "L'appel a expiré.")
    assert payload["retryable"] is True


def test_tool_taxonomy_error_carries_its_code() -> None:
    exc = ToolTaxonomyError(ToolErrorCode.SOURCE_NOT_COVERED, "Cette source n'est pas branchée ici.")
    assert exc.code is ToolErrorCode.SOURCE_NOT_COVERED
    assert str(exc) == "Cette source n'est pas branchée ici."


@pytest.mark.parametrize(
    ("exc", "expected"),
    [
        (asyncio.TimeoutError(), ToolErrorCode.TIMEOUT),
        (httpx.TimeoutException("boom"), ToolErrorCode.TIMEOUT),
        (ValueError("bad input"), ToolErrorCode.INPUT_INVALID),
        (KeyError("missing"), ToolErrorCode.INPUT_INVALID),
    ],
)
def test_classify_exception_common_python_exceptions(exc: BaseException, expected: ToolErrorCode) -> None:
    assert classify_exception(exc) is expected


@pytest.mark.parametrize(
    ("status_code", "expected"),
    [
        (401, ToolErrorCode.PERMISSION),
        (403, ToolErrorCode.PERMISSION),
        (404, ToolErrorCode.SOURCE_NOT_COVERED),
        (409, ToolErrorCode.CONFLICT),
        (429, ToolErrorCode.QUOTA),
        (500, ToolErrorCode.TEMPORARILY_UNAVAILABLE),
        (503, ToolErrorCode.TEMPORARILY_UNAVAILABLE),
    ],
)
def test_classify_exception_http_status_error(status_code: int, expected: ToolErrorCode) -> None:
    request = httpx.Request("GET", "https://example.test")
    response = httpx.Response(status_code, request=request)
    exc = httpx.HTTPStatusError("boom", request=request, response=response)
    assert classify_exception(exc) is expected


def test_classify_exception_default_is_internal_never_guessed_from_text() -> None:
    # Un texte comme "quota dépassé" dans un `RuntimeError` ne doit PAS être
    # relu pour deviner un code — seul le TYPE de l'exception ou un code HTTP
    # explicite classent. Le repli est "internal", jamais une supposition.
    assert classify_exception(RuntimeError("quota dépassé, permission refusée")) is ToolErrorCode.INTERNAL
