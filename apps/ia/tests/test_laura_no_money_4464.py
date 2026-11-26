"""#4464 — crédits implicites : Laura ne mentionne JAMAIS un coût, un solde ni un crédit.

Quatre portes : les prompts, les descriptions d'outils, les textes littéraux d'`chat_tools.py` et la
copie des résultats d'outils que le modèle relit. Chacune sait dire NON (un texte « crédit » la fait
échouer) et LIRE (le nombre de textes examinés est borné par le bas).
"""

from __future__ import annotations

import ast
import json
import re
from pathlib import Path

from app.services.chat_orchestrator import _ReplyCostBudget, _tool_payload
from app.services.chat_tools import CHAT_TOOLS
from app.services.laura_no_money import MONEY_KEYS, strip_money

_APP = Path(__file__).resolve().parent.parent / "app"
_CREDIT_WORD = re.compile(r"\bcr[ée]dits?\b", re.IGNORECASE)
_MONEY_FIELD = re.compile(r"cost_credits|credits_left|costCredits|creditsLeft")


def _prose_literals(path: Path) -> list[str]:
    """Les littéraux de texte (≥ 1 espace) d'un module, docstrings exclues."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    docstrings: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            first = node.body[0] if node.body else None
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant):
                docstrings.add(id(first.value))
    return [
        node.value
        for node in ast.walk(tree)
        if isinstance(node, ast.Constant)
        and isinstance(node.value, str)
        and id(node) not in docstrings
        and " " in node.value
    ]


def test_prompts_never_say_credit() -> None:
    files = sorted((_APP / "prompts").glob("*.py"))
    examined = 0
    leaks: list[str] = []
    for path in files:
        for text in _prose_literals(path):
            examined += 1
            if _CREDIT_WORD.search(text):
                leaks.append(f"{path.name}: {_CREDIT_WORD.search(text).group(0)!r} dans {text[:80]!r}")
    assert examined > 500
    assert leaks == []


def test_chat_tools_prose_never_says_credit() -> None:
    texts = _prose_literals(_APP / "services" / "chat_tools.py")
    assert len(texts) > 1000
    leaks = [text[:100] for text in texts if _CREDIT_WORD.search(text)]
    assert leaks == []


def test_modules_that_render_text_to_laura_never_say_credit() -> None:
    modules = [
        "services/bellum_api.py",
        "services/account_read_first.py",
        "services/account_completion_tools.py",
        "services/laura_dossier_tools.py",
        "services/compilers/account_preflight.py",
        "services/chat_orchestrator.py",
    ]
    leaks = [
        f"{name}: {text[:80]!r}"
        for name in modules
        for text in _prose_literals(_APP / name)
        if _CREDIT_WORD.search(text)
    ]
    assert leaks == []


def test_a_refused_analysis_says_the_soft_brake_without_figure() -> None:
    from app.services.bellum_api import analysis_failure

    message = analysis_failure("http_402")["error"]
    assert not _CREDIT_WORD.search(message)
    assert not re.search(r"\d|%", message)
    assert message.startswith("Tu ")


def test_every_tool_description_is_free_of_credit_and_cost_fields() -> None:
    def walk(node: object) -> list[str]:
        if isinstance(node, dict):
            found = [str(node["description"])] if isinstance(node.get("description"), str) else []
            for value in node.values():
                found += walk(value)
            return found
        if isinstance(node, list):
            return [text for item in node for text in walk(item)]
        return []

    descriptions = [text for tool in CHAT_TOOLS for text in walk(tool)]
    assert len(descriptions) > 100
    assert [d[:100] for d in descriptions if _CREDIT_WORD.search(d) or _MONEY_FIELD.search(d)] == []


def test_strip_money_removes_cost_and_balance_at_any_depth() -> None:
    output = {
        "ok": True,
        "cost_credits": 8,
        "proposal": {"label": "x", "costCredits": 1, "nested": [{"credits_left": 40, "keep": 1}]},
    }
    cleaned = strip_money(output)
    assert cleaned == {"ok": True, "proposal": {"label": "x", "nested": [{"keep": 1}]}}
    assert "cost_credits" in output  # la copie du navigateur n'est pas touchée
    assert {"cost_credits", "credits_left", "credits_left_after", "credit_kind"} <= MONEY_KEYS


def test_the_model_never_reads_a_cost_or_a_balance_in_a_tool_result() -> None:
    payload = _tool_payload(
        {"action": "start_account_analysis", "cost_credits": 8, "credits_left": 40, "credits_left_after": 32}
    )
    assert "cost_credits" not in payload and "credits_left" not in payload
    assert not _CREDIT_WORD.search(payload)
    assert "start_account_analysis" in payload


def test_the_reply_ceiling_refusal_gives_no_amount_to_the_model() -> None:
    budget = _ReplyCostBudget(ceiling=10)
    budget.spent = 8
    entry = {"proposal": {"cost_credits": 5}}
    refusal, is_error = budget.admit(entry, {"ok": True}, False)
    assert is_error is True
    text = json.dumps(refusal, ensure_ascii=False)
    assert not _CREDIT_WORD.search(text)
    assert not re.search(r"\d", text)


def test_the_named_companies_tool_description_never_says_debit_nor_credit() -> None:
    """#4464 — le lot de comptes nommés (#4462) ne parle ni de débit ni de crédits au modèle."""
    tool = next(t for t in CHAT_TOOLS if t["name"] == "analyze_named_companies")
    assert not re.search(r"d[ée]bit|cr[ée]dits?|solde", str(tool["description"]), re.IGNORECASE)
