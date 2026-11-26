"""#3704.B (recette prod 08/10, W 5b4b10d2f3) RÉFUTÉE — même relance que #3704.2 (« donne-moi
aussi des besoins » juste après un tour d'horizon), mais cette fois Laura pose une QUESTION de
clarification avant de rappeler l'outil, et son second appel reformule lui-même `sectors`/
`department` (traduits, généralisés) au lieu de reprendre ceux du tour précédent : 2 entreprises
sur 3 remplacées, « Région IDF » disparu de « Classé selon ».

Le filet déterministe de #3704.A/#3762 (`ThreadStateCollector.prepare` /
`_is_needs_only_follow_up`, `chat_thread_state.py`) ne fusionne QUE les appels qui ne portent NI
secteur NI zone NI mot-clé — par CONCEPTION (une relance qui redonne elle-même un secteur ou une
zone part SCIEMMENT de zéro, #3762 : jamais fusionnée, pour ne pas écraser un vrai changement de
critères). Ce nouveau symptôme n'est donc PAS une reformulation de ce filet mais un nouveau mode
d'échec : le modèle reformule au lieu d'omettre. Seul levier déterministe disponible ici est la
description de l'outil (probabiliste, comme #3704.2 l'a déjà été) : elle doit dire sans détour de
ne JAMAIS poser de question sur cette relance, et de ne JAMAIS reformuler/traduire les critères —
soit les omettre, soit les reprendre identiques.
"""

from __future__ import annotations

from app.services.chat_tools import CHAT_TOOLS


def _tool(name: str) -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == name)


def test_run_account_search_forbids_a_clarifying_question_on_the_needs_follow_up() -> None:
    description = _tool("run_account_search")["description"]
    assert "pose AUCUNE question avant de rappeler l'outil" in description


def test_run_account_search_forbids_reformulating_the_previous_criteria() -> None:
    description = _tool("run_account_search")["description"]
    assert "jamais une reformulation ni une traduction" in description
    assert "OMETTRE entièrement" in description
