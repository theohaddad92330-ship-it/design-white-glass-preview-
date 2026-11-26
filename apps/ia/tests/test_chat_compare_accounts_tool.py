"""Épopée #2778 — `compare_accounts` reste en texte : aucune carte `comparison`.

Mesuré le 25/09/2026 : le bloc `comparison` existe (`reply_blocks.py`,
`reply-blocks.ts`), son rendu web existe (`ComparisonCard.tsx`), la
démonstration l'illustre déjà (`demo-chat-script.ts`, `p-priorities`) — mais
rien dans la description de l'outil `compare_accounts` ne dit au modèle de la
remplir. Même défaut que celui déjà corrigé pour `get_account_briefing` et
`get_account_timeline` (`account_card`, `timeline`) : sans l'instruction dans
l'outil lui-même, le modèle retombe sur une comparaison en prose, jamais
testée ni garantie.
"""

from __future__ import annotations

from app.services.chat_tools import CHAT_TOOLS


def _tool(name: str) -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == name)


def test_compare_accounts_instructs_the_comparison_card() -> None:
    description = _tool("compare_accounts")["description"]
    assert "carte `comparison`" in description
