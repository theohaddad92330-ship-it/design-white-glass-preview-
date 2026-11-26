"""#1924 — le cas d'évaluation du VERDICT : la carte, et une seule fois.

─────────────────────────────────────────────────────────────────────────────
POURQUOI CE MODULE EXISTE
─────────────────────────────────────────────────────────────────────────────
Le 14/09/2026, en production, « Est-ce que je peux placer un expert cybersécurité
chez THALES ? Réponds par un verdict net. » a rendu un verdict en TEXTE sectionné,
écrit DEUX FOIS, sans carte `verdict` dans le DOM. Aucun test n'a rougi, et c'est
normal : `test_reply_formats_prompt.py` lit le PROMPT, `test_reply_blocks.py`
mocke `call_claude` et ne lit donc que le PARSING, `app.eval.run` ne rejoue que
des fixtures d'ANALYSE. Personne ne regardait une RÉPONSE.

Ce module regarde une réponse. Il porte :
  * le contrôleur déterministe `audit_answer(question, answer)` — ce qu'une
    réponse à une question de verdict doit rendre, et ce qu'elle ne doit pas
    rendre deux fois ;
  * le corpus committé (`chat/verdict_cases.json`), rejoué à chaque CI par
    `tests/test_copilote_verdict_card_eval.py` — hors ligne, zéro appel payant ;
  * le chemin `--live`, OPT-IN et payant, qui pose la vraie question au vrai
    modèle avec le VRAI prompt système et applique le même contrôleur. C'est le
    seul chemin qui teste l'ÉMISSION ; il ne tourne jamais en CI.

        python -m app.eval.chat_verdict                      # rejoue le corpus
        python -m app.eval.chat_verdict --live --yes-run-live  # appel PAYANT

─────────────────────────────────────────────────────────────────────────────
CE QU'IL NE FAIT PAS
─────────────────────────────────────────────────────────────────────────────
Il ne juge ni le fond, ni le ton, ni la justesse d'un verdict : il ne lit que la
FORME — une carte plutôt que des sections, et rien qui soit rendu deux fois.
Juger le fond demanderait un juge modèle, donc un appel par cas.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from app.services.reply_blocks import split_reply_blocks

CASES_PATH = Path(__file__).resolve().parent / "chat" / "verdict_cases.json"

# Les constats. Ce sont des CODES : un rapport les cite, un test les compare.
MISSING_VERDICT_BLOCK = "bloc_verdict_absent"
DUPLICATE_VERDICT = "verdict_rendu_deux_fois"
REPEATED_CARD_CONTENT = "carte_reecrite_en_texte"

# Un intitulé de section « Verdict » en TÊTE DE LIGNE : « Verdict : … »,
# « **Verdict** », « ## Verdict », « 1. VERDICT — une phrase ». Une mention en
# milieu de phrase (« mon verdict tient en une ligne ») n'est pas une section.
_VERDICT_HEADING = re.compile(
    r"^[ \t]*(?:[-*]\s*)?(?:\d+[.)]\s*)?(?:#{1,4}\s*)?\**\s*verdicts?\b",
    re.IGNORECASE | re.MULTILINE,
)

# Ce qui fait d'une question une demande de VERDICT. Volontairement étroit : une
# question factuelle ou une recherche n'en est pas une, et réclamer une carte
# partout ferait de la garde un bruit permanent.
_VERDICT_QUESTION_MARKERS = (
    "verdict",
    "est-ce que je peux",
    "est-ce qu'on peut",
    "est-ce que je dois",
    "dois-je",
    "faut-il",
    "ça vaut le coup",
    "est-ce pertinent",
)

# Sous ce nombre de caractères, une phrase de la carte reprise en texte peut être
# une coïncidence de vocabulaire, pas une redite.
_REDITE_MIN_CHARS = 25


@dataclass(frozen=True)
class VerdictCase:
    """Un cas du corpus : la question telle qu'elle est posée, la réponse telle
    qu'elle a été rendue, et les constats attendus (vide = réponse acceptée)."""

    name: str
    why: str
    question: str
    answer: str
    expected: tuple[str, ...]


def _fold(text: str) -> str:
    """Minuscules, sans accent, sans ponctuation — pour comparer deux phrases
    sans se faire piéger par une majuscule ou un tiret cadratin."""
    decomposed = unicodedata.normalize("NFKD", (text or "").lower())
    stripped = "".join(char for char in decomposed if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", " ", stripped).strip()


def is_verdict_question(question: str) -> bool:
    folded = _fold(question)
    return any(_fold(marker) in folded for marker in _VERDICT_QUESTION_MARKERS)


def audit_answer(question: str, answer: str) -> list[str]:
    """Les constats sur une réponse. Liste vide = elle tient la règle.

    Deux choses seulement, ce sont les deux symptômes de production :
      1. une question de verdict se rend en CARTE (`verdict`), pas en sections ;
      2. le verdict n'est écrit qu'UNE fois — ni deux sections, ni une carte
         doublée d'un texte qui la réécrit.
    """
    segments = split_reply_blocks(answer)
    cards = [
        segment.block
        for segment in segments
        if segment.kind == "block" and (segment.block or {}).get("type") == "verdict"
    ]
    prose = "\n".join(segment.text for segment in segments if segment.kind == "text")
    headings = _VERDICT_HEADING.findall(prose)

    findings: list[str] = []
    if is_verdict_question(question) and not cards:
        findings.append(MISSING_VERDICT_BLOCK)
    if len(cards) + len(headings) > 1:
        findings.append(DUPLICATE_VERDICT)

    folded_prose = _fold(prose)
    for card in cards:
        sentences = [str(card.get("conclusion") or ""), *[str(r) for r in (card.get("reasons") or [])]]
        if any(len(_fold(s)) >= _REDITE_MIN_CHARS and _fold(s) in folded_prose for s in sentences):
            findings.append(REPEATED_CARD_CONTENT)
            break

    return list(dict.fromkeys(findings))


def load_cases() -> list[VerdictCase]:
    raw = json.loads(CASES_PATH.read_text(encoding="utf-8"))
    return [
        VerdictCase(
            name=str(case["name"]),
            why=str(case.get("why") or ""),
            question=str(case["question"]),
            answer=str(case["answer"]),
            expected=tuple(case.get("expected") or ()),
        )
        for case in raw["cases"]
    ]


def replay() -> list[tuple[VerdictCase, list[str]]]:
    """Le corpus committé, rejoué hors ligne. Rend (cas, écart) par cas."""
    results: list[tuple[VerdictCase, list[str]]] = []
    for case in load_cases():
        found = sorted(audit_answer(case.question, case.answer))
        results.append((case, [] if found == sorted(case.expected) else found))
    return results


async def ask_live(question: str) -> str:
    """Le VRAI prompt système, la vraie question, le vrai modèle. PAYANT.

    ⚠️ Le tour porte le nom de prompt du chat (`bellum_chat`) et son modèle : une
    mesure qui tournerait sous un autre nom mesurerait un autre modèle que celui
    de la production, et ne dirait donc rien d'elle.
    """
    from app.prompts.bellum_advisor import build_system_prompt
    from app.services.claude_service import call_claude
    from app.services.model_policy import model_for

    system_prompt = build_system_prompt({}, {}, "", "")
    reply, _usage = await call_claude(
        system_prompt, question, max_tokens=4000, prompt_name="bellum_chat", model=model_for("bellum_chat")
    )
    return reply if isinstance(reply, str) else json.dumps(reply, ensure_ascii=False)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Cas d'évaluation du verdict (carte, une seule fois).")
    parser.add_argument("--live", action="store_true", help="pose les questions au vrai modèle (PAYANT)")
    parser.add_argument("--yes-run-live", action="store_true", help="confirme la dépense de --live")
    args = parser.parse_args(argv)

    if args.live and not args.yes_run_live:
        print("--live est un appel PAYANT : relance avec --yes-run-live.")
        return 2

    failures = 0
    if args.live:
        for case in load_cases():
            if not is_verdict_question(case.question):
                continue
            answer = asyncio.run(ask_live(case.question))
            found = audit_answer(case.question, answer)
            print(f"[{'OK ' if not found else 'NON'}] {case.name}: {found or 'carte verdict, une seule fois'}")
            failures += 1 if found else 0
        return 1 if failures else 0

    for case, gap in replay():
        print(f"[{'OK ' if not gap else 'NON'}] {case.name}: {gap or 'conforme au corpus'}")
        failures += 1 if gap else 0
    return 1 if failures else 0


if __name__ == "__main__":  # pragma: no cover - CLI
    raise SystemExit(main())
