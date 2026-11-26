"""#3763 — recette prod 07/10 (8d7c6957f0) RÉFUTÉE : « Pourquoi LONGCHAMP prioritaire vs
MESSIKA ? » sortait en prose + tableau — 0 section Résumé/Verdict/Réserves/Prochaine action,
0 « Voir pourquoi », 0 dépliable.

Cause : la description de ``compare_accounts`` dit SANS exception de rendre la carte
``comparison`` — une table brute à 2-4 colonnes (``ComparisonBlock``, ``columns``/``rows``/
``note``), sans verdict, sans raison nommée, sans rien à déplier. Un côté-à-côte convient à
« compare-moi ces comptes », mais pas à une question qui demande explicitement la RAISON
d'une priorité entre deux comptes nommés : cette forme-là existe déjà (le gabarit CONSEIL,
``_BLOCK_FORMAT`` dans ``bellum_advisor.py`` — Verdict :/Pourquoi :/Ce qui manque :/Prochaine
action :, rendu dépliable par ``StructuredReply.tsx`` / ``ReplyDisclosure``) ; il manquait
seulement d'être BRANCHÉ sur ce type de question, comme le demande l'issue.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt
from app.services.chat_tools import CHAT_TOOLS


def _tool(name: str) -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == name)


def test_compare_accounts_carves_out_the_reasoned_priority_question() -> None:
    description = _tool("compare_accounts")["description"]
    assert "prioritaire" in description
    assert "comparison" in description
    # La carte comparison ne doit plus être présentée comme LA seule réponse : la raison
    # d'une priorité pointe vers le gabarit CONSEIL, dépliable.
    assert "Verdict" in description or "CONSEIL" in description


def test_prompt_routes_why_x_over_y_questions_to_the_disclosable_advice_sections() -> None:
    prompt = build_system_prompt({}, {}, "", "")
    # Le même rapprochement doit être écrit là où TOUS les gabarits se départagent
    # (règle 1 de `_BLOCK_FORMAT`), pour que le choix ne dépende pas d'un seul outil, et
    # pointer vers le gabarit CONSEIL plutôt que la carte `comparison` brute.
    assert "prioritaire par rapport" in prompt or "prioritaire vs" in prompt
    assert "comparison" in prompt
