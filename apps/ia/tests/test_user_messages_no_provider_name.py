"""#4068 — aucun message destiné à l'utilisateur ne nomme le fournisseur du modèle.

Doctrine : « nos fournisseurs ne se nomment jamais ». Le nom de classe, le code
(`CLAUDE_*`) et `debug_message` restent techniques ; seul `user_message` voyage
jusqu'à l'écran.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import anthropic
import httpx

from app.models import agent_error_adapters as adapters
from app.models.agent_envelope import AgentError
from app.services.claude_service import ClaudeError, ClaudeIncompleteOutputError

_APP = Path(__file__).resolve().parent.parent / "app"
_PROVIDER = re.compile(r"claude|anthropic", re.IGNORECASE)


def _string_parts(node: ast.AST) -> list[str]:
    return [n.value for n in ast.walk(node) if isinstance(n, ast.Constant) and isinstance(n.value, str)]


def _user_message_literals() -> list[tuple[str, int, str]]:
    found: list[tuple[str, int, str]] = []
    for path in _APP.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            value: ast.AST | None = None
            if isinstance(node, ast.keyword) and node.arg == "user_message":
                value = node.value
            elif isinstance(node, ast.Assign) and any(
                isinstance(t, ast.Name) and t.id == "user_message" for t in node.targets
            ):
                value = node.value
            if value is not None:
                for text in _string_parts(value):
                    found.append((str(path.relative_to(_APP)), node.lineno, text))
    return found


def test_scan_reads_something() -> None:
    # Une garde qui ne lit rien ne dit jamais NON.
    assert len(_user_message_literals()) >= 8


def test_no_user_message_literal_names_the_provider() -> None:
    offenders = [(f, line, text) for f, line, text in _user_message_literals() if _PROVIDER.search(text)]
    assert offenders == []


def test_guard_says_no_when_the_word_comes_back() -> None:
    tree = ast.parse('AgentError(user_message="Surcharge Claude temporaire.")')
    texts = [t for n in ast.walk(tree) if isinstance(n, ast.keyword) for t in _string_parts(n.value)]
    assert any(_PROVIDER.search(t) for t in texts)


def test_runtime_messages_from_adapters_are_provider_free() -> None:
    req = httpx.Request("POST", "https://example.invalid")
    rate = anthropic.RateLimitError("x", response=httpx.Response(429, request=req), body=None)
    server = anthropic.APIStatusError("x", response=httpx.Response(503, request=req), body=None)
    client = anthropic.APIStatusError("x", response=httpx.Response(400, request=req), body=None)
    errors = [
        adapters.agent_error_from_anthropic_exception(rate),
        adapters.agent_error_from_anthropic_exception(server),
        adapters.agent_error_from_anthropic_exception(client),
        adapters.agent_error_invalid_json(prompt_name="p", model="m", details="d"),
        AgentError.from_claude_error(ClaudeError()),
        AgentError.from_claude_error(
            ClaudeIncompleteOutputError(prompt_name="p", model="m", max_tokens=1)
        ),
    ]
    for err in errors:
        assert not _PROVIDER.search(err.user_message), err.user_message
