"""Le rejoueur — la même entrée, un autre modèle, aucune collecte.

C'est la moitié qui donne son sens au corpus. ``replay_record`` reprend un
enregistrement et le renvoie **tel quel** : même system, même user, même
``response_model``, même ``max_tokens``, même tâche routée. Rien ne repasse par
Brave, Firecrawl, Pappers ou Apollo — donc l'écart mesuré entre deux bras est
celui du MODÈLE, pas celui de deux collectes qui n'ont pas rendu la même chose.

Le routage du bras passe par le mécanisme existant : une ``Variant`` de
``app/eval/strategy/variants.py`` posée par ``applied()``, restaurée à la
sortie. La passerelle relit ``LLM_ROUTE_<TÂCHE>`` à chaque appel, donc aucun
redémarrage, et surtout aucune ligne de code de production à modifier.

Reprise : un enregistrement déjà rejoué ``ok`` sur ce bras est SAUTÉ. Un rejeu
coûte de l'argent ; un ``Ctrl-C`` ne doit pas le faire re-payer.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable, Iterable, Sequence
from pathlib import Path
from typing import Any

from app.eval.bench.corpus import (
    STATUS_ERROR,
    STATUS_OK,
    CallRecord,
    append_call,
    load_calls,
    replayed_ok_ids,
    resolve_response_model,
)
from app.eval.bench.recorder import _serialisable, classify_failure
from app.eval.strategy.variants import ModelSpec, applied, model_variant

logger = logging.getLogger(__name__)

CompleteFn = Callable[..., Any]


def _gateway() -> CompleteFn:
    """La passerelle, résolue à l'appel — pour qu'un test puisse la remplacer."""
    from app.services import llm_gateway

    return llm_gateway.complete


async def replay_record(
    record: CallRecord,
    arm: str,
    spec: ModelSpec,
    *,
    store: Path,
    store_output: bool = True,
    complete: CompleteFn | None = None,
) -> CallRecord:
    """Rejoue une entrée sur ``spec`` et ÉCRIT la mesure. Ne lève jamais.

    Un échec est une MESURE (``schema_error`` / ``truncated`` / ``error``), pas
    un incident : c'est précisément ce que la 4ᵉ colonne du banc compte.
    """
    fn = complete or _gateway()
    response_model = resolve_response_model(record.response_model)
    variant = model_variant(spec, tasks=(record.task,), name=f"replay:{arm}")

    started = time.perf_counter()
    try:
        with applied(variant):
            result, usage = await fn(
                record.task,
                record.system,
                record.user,
                response_model=response_model,
                max_tokens=record.max_tokens,
                max_retries=record.max_retries,
                model=spec.model,
            )
    except Exception as exc:  # noqa: BLE001 — un bras qui casse est une mesure
        logger.warning("rejeu %s/%s en échec — %s", arm, record.prompt_name, exc)
        out = CallRecord(
            record_id=record.record_id, corpus=record.corpus, case=record.case,
            prompt_name=record.prompt_name, task=record.task,
            system=record.system, user=record.user,
            response_model=record.response_model, max_tokens=record.max_tokens,
            max_retries=record.max_retries, model_requested=record.model_requested,
            arm=arm, model=spec.model, provider=spec.provider,
            status=classify_failure(exc), error=f"{type(exc).__name__}: {exc}"[:2000],
            latency_s=round(time.perf_counter() - started, 3),
        )
        append_call(store, out)
        return out

    out = CallRecord(
        record_id=record.record_id, corpus=record.corpus, case=record.case,
        prompt_name=record.prompt_name, task=record.task,
        system=record.system, user=record.user,
        response_model=record.response_model, max_tokens=record.max_tokens,
        max_retries=record.max_retries, model_requested=record.model_requested,
        arm=arm, model=spec.model, provider=spec.provider,
        status=STATUS_OK,
        latency_s=round(time.perf_counter() - started, 3),
        input_tokens=int(getattr(usage, "input_tokens", 0) or 0),
        output_tokens=int(getattr(usage, "output_tokens", 0) or 0),
        cost_usd=float(getattr(usage, "cost_usd", 0.0) or 0.0),
        output=_serialisable(result) if store_output else None,
    )
    append_call(store, out)
    return out


async def replay_corpus(
    inputs: Sequence[CallRecord],
    arm: str,
    spec: ModelSpec,
    *,
    store: Path,
    store_output: bool = True,
    complete: CompleteFn | None = None,
    limit: int | None = None,
) -> list[CallRecord]:
    """Rejoue le corpus sur un bras, en sautant ce qui est déjà mesuré ``ok``."""
    already = replayed_ok_ids(load_calls(store), arm)
    todo = [r for r in inputs if r.record_id not in already]
    if limit is not None:
        todo = todo[:limit]
    logger.info("rejeu %s : %d entrée(s) à jouer, %d déjà mesurées", arm, len(todo), len(already))
    produced: list[CallRecord] = []
    for record in todo:
        produced.append(await replay_record(
            record, arm, spec, store=store, store_output=store_output, complete=complete,
        ))
    return produced


def replay_corpus_sync(
    inputs: Iterable[CallRecord],
    arm: str,
    spec: ModelSpec,
    *,
    store: Path,
    store_output: bool = True,
    limit: int | None = None,
) -> list[CallRecord]:
    return asyncio.run(replay_corpus(
        list(inputs), arm, spec, store=store, store_output=store_output, limit=limit,
    ))


__all__ = ["replay_corpus", "replay_corpus_sync", "replay_record", "STATUS_ERROR"]
