"""L'enregistreur de prompts — branché sur le goulot, éteint par défaut.

Le goulot
---------
``claude_service.call_claude`` délègue **tout** à
``app.services.llm_gateway.complete``, et il le fait par un import LOCAL à la
fonction (``from app.services.llm_gateway import complete``) : l'attribut du
module est relu à chaque appel. C'est le seul point par lequel passent les cinq
sites à ``response_model`` strict du chemin payant.

Pourquoi un enveloppement et pas un ``if`` dans la passerelle
--------------------------------------------------------------
Parce que « sans drapeau = no-op STRICT » se PROUVE ici, et pas seulement se
promet : quand l'enregistreur n'est pas installé, ``llm_gateway.complete`` est
**le même objet fonction** qu'avant l'import de ce module. Il n'y a pas un
branchement de plus dans le chemin de production — il n'y a pas une ligne de
plus. ``tests/test_model_bench.py`` le vérifie par identité (``is``), pas par
comportement.

Corollaire assumé : rien dans le service ne s'auto-installe. L'enregistrement
est un geste explicite (``with recording(...)``), fait par la CLI du banc qui
pilote elle-même le pipeline. Un enregistreur qu'un ``.env`` de production
pourrait allumer serait un chemin d'écriture de données personnelles activable
par mégarde.

Ce qui est classé, et pourquoi séparément
------------------------------------------
* ``schema_error`` — la sortie n'a pas validé le ``response_model``. C'est LE
  risque d'un changement de modèle, et rien ne le mesurait.
* ``truncated`` — la génération a heurté son plafond. Un réglage, pas un modèle.
  Les fondre accuserait un modèle d'un défaut de configuration.
* ``error`` — le reste.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.eval.bench.corpus import (
    ARM_RECORDED,
    STATUS_ERROR,
    STATUS_OK,
    STATUS_SCHEMA_ERROR,
    STATUS_TRUNCATED,
    CallRecord,
    append_call,
    compute_record_id,
    describe_response_model,
)
from app.services import claude_service, llm_gateway

logger = logging.getLogger(__name__)

_ACTIVE: Recorder | None = None
_ORIGINAL: Any = None


# ── classer un échec ──────────────────────────────────────────────────────────


def classify_failure(exc: BaseException) -> str:
    """``schema_error`` / ``truncated`` / ``error``, en remontant la chaîne.

    ``instructor`` enveloppe la ``ValidationError`` de pydantic dans sa propre
    exception de retry : regarder le seul type de surface raterait la quasi-
    totalité des vrais échecs de schéma.
    """
    seen: set[int] = set()
    node: BaseException | None = exc
    while node is not None and id(node) not in seen:
        seen.add(id(node))
        if isinstance(node, claude_service.ClaudeIncompleteOutputError):
            return STATUS_TRUNCATED
        name = type(node).__name__
        if "ValidationError" in name or "InstructorRetry" in name:
            return STATUS_SCHEMA_ERROR
        node = node.__cause__ or node.__context__
    if claude_service._is_truncation(exc):
        return STATUS_TRUNCATED
    return STATUS_ERROR


def _serialisable(result: Any) -> dict[str, Any] | None:
    """La sortie sous forme de dict quand c'est possible, ``None`` sinon.

    ``None`` veut dire « non conservée », jamais « vide » — la distinction est
    la même que partout ailleurs dans le produit.
    """
    if isinstance(result, dict):
        return dict(result)
    dump = getattr(result, "model_dump", None)
    if callable(dump):
        try:
            return dict(dump(mode="json"))
        except Exception:  # noqa: BLE001 — un dump qui échoue ne casse pas un run payant
            logger.warning("sortie non sérialisable — non conservée")
            return None
    if isinstance(result, str):
        return {"text": result}
    return None


def _gateway_defaults() -> dict[str, Any]:
    """Les défauts EFFECTIFS d'un appel qui ne les passe pas.

    Un appelant qui n'écrit pas ``max_tokens`` en a quand même un : celui de la
    signature de ``llm_gateway.complete``, qui n'est lui-même qu'un renvoi vers
    ``claude_service``. On lit donc la SOURCE (``claude_service``) plutôt que la
    signature intermédiaire — un réglage vit à un seul endroit, et enregistrer
    ``None`` rendrait le rejeu non byte-identique le jour où le défaut bouge.
    """
    return {
        "response_model": None,
        "max_tokens": claude_service.DEFAULT_MAX_TOKENS,
        "max_retries": claude_service.DEFAULT_MAX_RETRIES,
        "model": claude_service.CLAUDE_MODEL,
    }


# ── l'enregistreur ────────────────────────────────────────────────────────────


@dataclass
class Recorder:
    """Où écrire, et sous quelle étiquette."""

    store: Path
    corpus: str
    case: str = ""
    arm: str = ARM_RECORDED
    store_output: bool = True
    written: list[CallRecord] = field(default_factory=list)

    def set_case(self, case: str) -> None:
        """Étiqueter les appels suivants (un compte du golden set, typiquement)."""
        self.case = case

    def write(self, record: CallRecord) -> None:
        append_call(self.store, record)
        self.written.append(record)


def is_recording() -> bool:
    return _ACTIVE is not None


def active() -> Recorder | None:
    return _ACTIVE


async def _wrapped(task: Any, system_prompt: str, user_prompt: str, **kwargs: Any):
    """L'enveloppe. Ne change NI les arguments NI le résultat NI les exceptions."""
    rec = _ACTIVE
    original = _ORIGINAL
    if rec is None or original is None:  # pragma: no cover - désinstallé entre-temps
        return await (original or llm_gateway.complete)(task, system_prompt, user_prompt, **kwargs)

    defaults = _gateway_defaults()
    response_model = kwargs.get("response_model", defaults["response_model"])
    max_tokens = int(kwargs.get("max_tokens", defaults["max_tokens"]) or 0)
    max_retries = int(kwargs.get("max_retries", defaults["max_retries"]) or 0)
    model_requested = str(kwargs.get("model", defaults["model"]) or "")
    rm_name = describe_response_model(response_model)
    prompt_name = str(task or "unknown")
    metadata = kwargs.get("metadata")
    if metadata is not None and getattr(metadata, "prompt_name", ""):
        prompt_name = str(metadata.prompt_name)

    entry = dict(
        record_id=compute_record_id(
            prompt_name=prompt_name, system=system_prompt, user=user_prompt,
            response_model=rm_name, max_tokens=max_tokens,
        ),
        corpus=rec.corpus,
        case=rec.case,
        prompt_name=prompt_name,
        task=llm_gateway.canonical_task(str(task or prompt_name)),
        system=system_prompt,
        user=user_prompt,
        response_model=rm_name,
        max_tokens=max_tokens,
        max_retries=max_retries,
        model_requested=model_requested,
        arm=rec.arm,
    )

    started = time.perf_counter()
    try:
        result, usage = await original(task, system_prompt, user_prompt, **kwargs)
    except BaseException as exc:
        rec.write(CallRecord(
            **entry,
            model=model_requested,
            status=classify_failure(exc) if isinstance(exc, Exception) else STATUS_ERROR,
            error=f"{type(exc).__name__}: {exc}"[:2000],
            latency_s=round(time.perf_counter() - started, 3),
        ))
        raise

    rec.write(CallRecord(
        **entry,
        model=getattr(usage, "model", model_requested),
        status=STATUS_OK,
        latency_s=round(time.perf_counter() - started, 3),
        input_tokens=int(getattr(usage, "input_tokens", 0) or 0),
        output_tokens=int(getattr(usage, "output_tokens", 0) or 0),
        cost_usd=float(getattr(usage, "cost_usd", 0.0) or 0.0),
        output=_serialisable(result) if rec.store_output else None,
    ))
    return result, usage


def install(
    store: Path | str,
    *,
    corpus: str,
    case: str = "",
    arm: str = ARM_RECORDED,
    store_output: bool = True,
) -> Recorder:
    """Enveloppe ``llm_gateway.complete``. Idempotent : une seule enveloppe."""
    global _ACTIVE, _ORIGINAL
    if _ACTIVE is None:
        _ORIGINAL = llm_gateway.complete
        llm_gateway.complete = _wrapped  # type: ignore[assignment]
    _ACTIVE = Recorder(Path(store), corpus=corpus, case=case, arm=arm, store_output=store_output)
    return _ACTIVE


def uninstall() -> None:
    """Restaure **l'objet fonction d'origine**, pas un équivalent."""
    global _ACTIVE, _ORIGINAL
    if _ORIGINAL is not None:
        llm_gateway.complete = _ORIGINAL  # type: ignore[assignment]
    _ACTIVE = None
    _ORIGINAL = None


@contextmanager
def recording(
    store: Path | str,
    *,
    corpus: str,
    case: str = "",
    arm: str = ARM_RECORDED,
    store_output: bool = True,
) -> Iterator[Recorder]:
    """Enregistre le temps du bloc, puis restaure — même si le bloc lève."""
    rec = install(store, corpus=corpus, case=case, arm=arm, store_output=store_output)
    try:
        yield rec
    finally:
        uninstall()
