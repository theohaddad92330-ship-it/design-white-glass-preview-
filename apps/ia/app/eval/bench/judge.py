"""Le juge du banc — choisissable, enregistré, et jamais décisionnaire.

Trois règles, et elles sont tenues par du code, pas par une convention.

1. **Choisissable à chaque fois.** ``--judge <modèle>``, éventuellement chez un
   autre fournisseur (``--judge openai:gpt-4o``). Le défaut est nommé à UN seul
   endroit : :data:`DEFAULT_JUDGE_MODEL` (garde GA-26 en esprit — un réglage vit
   à un seul endroit ; ``tests/test_model_bench.py`` compte les occurrences).

2. **Un candidat ne peut pas être son propre juge.** Le banc REFUSE le run
   (:class:`JudgeConflictError`), il n'avertit pas. Un modèle qui se note
   lui-même rend un chiffre flatteur, et un chiffre flatteur qu'on affiche est
   pire que pas de chiffre.

3. **Sa note ne décide de rien.** ``app/eval/strategy/rubric.py`` porte la
   doctrine, citée telle quelle :

       « An LLM judge can be layered on top […] but it must never be the thing
       that decides "quality >= baseline" — it is not reproducible. »

   Ici elle est exécutable : la note du juge vit dans une colonne à part et
   ``Comparison.deterministic_dict()`` ne la contient pas. Un test nourrit deux
   jeux de notes opposés et vérifie que le déterministe est byte-identique.

Le juge passe par la **passerelle** (``llm_gateway.complete``), pas par
``call_claude_sync`` comme ``evals/judge.py`` : c'est ce qui lui permet d'être
d'un autre fournisseur, et de payer sa télémétrie comme tout le monde.
"""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, Field

from app.eval.bench.corpus import CallRecord
from app.eval.strategy.variants import ModelSpec, Variant, applied

logger = logging.getLogger(__name__)

#: Le défaut, nommé UNE seule fois dans tout ce module.
DEFAULT_JUDGE_MODEL = "claude-sonnet-5"

#: La tâche sous laquelle le juge est routé. Elle n'existe dans aucune table de
#: production : router le juge ne peut donc pas dérouter un appel du produit.
JUDGE_TASK = "bench_judge"
JUDGE_ROUTE_ENV = f"LLM_ROUTE_{JUDGE_TASK.upper()}"
JUDGE_MODEL_ENV = "BENCH_JUDGE_MODEL"

JUDGE_MAX_SCORE = 10.0

_SYSTEM = (
    "Tu es un expert avant-vente ESN qui audite une sortie produite par un modèle. "
    "On te donne le prompt métier qui a été envoyé et la sortie obtenue. "
    "Note de 0 à 10 la PLAUSIBILITÉ et l'UTILITÉ COMMERCIALE de cette sortie pour un "
    "commercial ESN qui prépare un rendez-vous : les faits sont-ils cohérents avec ce "
    "que le prompt fournit, les recommandations sont-elles actionnables et spécifiques ? "
    "Une sortie générique, vague ou contredisant le contexte fourni descend sous 5. "
    "Tu ne notes PAS la longueur, ni le style, ni le respect du schéma — d'autres "
    "colonnes du banc les mesurent déjà. Justifie en une phrase."
)


class JudgeVerdict(BaseModel):
    """Ce que le juge rend. Volontairement minuscule : un chiffre et sa raison."""

    score: float = Field(ge=0.0, le=JUDGE_MAX_SCORE)
    reason: str = ""


class JudgeConflictError(RuntimeError):
    """Le juge figure parmi les candidats — le banc refuse de mesurer."""


@dataclass(frozen=True)
class JudgeScore:
    """Une note de juge sur un (enregistrement, bras). ``measured=False`` = pas de note."""

    record_id: str
    arm: str
    judge: str
    score: float | None
    reason: str
    measured: bool

    def as_dict(self) -> dict[str, Any]:
        return dict(self.__dict__)


# ── choisir le juge ───────────────────────────────────────────────────────────


def default_judge() -> ModelSpec:
    """Le juge par défaut : l'env s'il est posé, sinon la constante unique."""
    override = (os.getenv(JUDGE_MODEL_ENV) or "").strip()
    return ModelSpec.parse(override or DEFAULT_JUDGE_MODEL)


def resolve_judge(spec: str | None) -> ModelSpec:
    """``--judge`` s'il est donné, sinon :func:`default_judge`."""
    text = (spec or "").strip()
    return ModelSpec.parse(text) if text else default_judge()


def assert_judge_is_not_a_candidate(judge: ModelSpec, candidates: Iterable[ModelSpec]) -> None:
    """Refuse le run si le juge est aussi jugé. C'est une garde, pas un warning."""
    clash = [c for c in candidates if c.label == judge.label or c.model == judge.model]
    if clash:
        raise JudgeConflictError(
            f"le juge {judge.label} est aussi candidat ({', '.join(c.label for c in clash)}). "
            "Un modèle qui se note lui-même rend un chiffre flatteur : choisir un juge tiers "
            "avec --judge, ou retirer ce bras."
        )


# ── juger ─────────────────────────────────────────────────────────────────────


def _judge_variant(judge: ModelSpec) -> Variant:
    """Route la tâche du juge — et RIEN d'autre — vers le modèle choisi."""
    return Variant(f"judge:{judge.label}", "routage du juge du banc",
                   {JUDGE_ROUTE_ENV: judge.route_value})


def _user_prompt(record: CallRecord) -> str:
    import json

    output = json.dumps(record.output, ensure_ascii=False, indent=2) if record.output else "(sortie non conservée)"
    return (
        f"Prompt métier ({record.prompt_name}) envoyé au modèle :\n"
        f"--- SYSTEM ---\n{record.system}\n"
        f"--- UTILISATEUR ---\n{record.user}\n"
        f"--- SORTIE OBTENUE ---\n{output}\n\n"
        "Note cette sortie de 0 à 10."
    )


async def judge_call(
    record: CallRecord,
    judge: ModelSpec,
    *,
    complete: Callable[..., Any] | None = None,
) -> JudgeScore:
    """Note UNE sortie, indépendamment des autres bras.

    Notation indépendante et non comparative : présenter deux sorties côte à
    côte introduirait un biais de position que le banc ne saurait pas mesurer.
    Un échec du juge donne ``measured=False``, jamais un zéro — un juge muet
    n'est pas un modèle nul.
    """
    if not record.ok or not record.output:
        return JudgeScore(record.record_id, record.arm, judge.label, None,
                          "rien à juger (appel en échec ou sortie non conservée)", False)
    fn = complete
    if fn is None:
        from app.services import llm_gateway

        fn = llm_gateway.complete
    try:
        with applied(_judge_variant(judge)):
            verdict, _usage = await fn(
                JUDGE_TASK, _SYSTEM, _user_prompt(record),
                response_model=JudgeVerdict, model=judge.model,
            )
    except Exception as exc:  # noqa: BLE001 — le juge ne casse jamais le banc
        logger.warning("juge %s en échec sur %s — %s", judge.label, record.record_id, exc)
        return JudgeScore(record.record_id, record.arm, judge.label, None, f"juge indisponible : {exc}", False)
    return JudgeScore(record.record_id, record.arm, judge.label,
                      float(verdict.score), str(verdict.reason or ""), True)


async def judge_records(
    records: Sequence[CallRecord],
    judge: ModelSpec,
    *,
    complete: Callable[..., Any] | None = None,
) -> list[JudgeScore]:
    return [await judge_call(r, judge, complete=complete) for r in records]


def judge_records_sync(records: Sequence[CallRecord], judge: ModelSpec) -> list[JudgeScore]:
    return asyncio.run(judge_records(records, judge))
