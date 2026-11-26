"""Runtime validation of each pipeline step against the SHARED JSON Schemas.

The schemas in ``packages/shared/schemas/{research,contacts,classify,plan}.schema.json``
are the single, language-neutral contract of the pipeline (#273). TypeScript
consumes them through ``@bellum/shared``; this module is their Python face, so a
contract that drifts on one side is caught on the other instead of silently
diverging between zod (TS) and Pydantic (Py).

Design decisions
----------------

**Non-blocking by default.** ``validate_step_output`` NEVER raises in the default
mode: a schema violation is a *contract* signal, not a runtime fault, and the
dossier is still worth shipping to the sales rep. It goes out through
``logger.error(...)`` with structured meta — the project convention (Winston/
Python logging → Sentry via the transport, never ``capture_exception`` directly).
Set ``BELLUM_SCHEMA_STRICT=true`` (CI, tests, local dev) to turn violations into
a raised ``jsonschema.ValidationError`` so a drift fails the build instead of
just paging.

**The schemas ship WITH the service.** The IA service deploys alone: its
``railway.json`` runs ``pip install -r requirements.txt`` and ``uvicorn
app.main:app``, neither of which resolves anywhere but ``apps/ia`` (there is no
``requirements.txt`` nor ``app/`` at the repo root), and the Dockerfile's build
context is ``apps/ia`` too. ``packages/shared`` is therefore simply NOT on disk
in production. A validation hook that never runs in prod is worse than none — it
rots silently — so a copy of the step schemas is vendored next to this module, at
:data:`VENDORED_DIR`, and ships inside the image via the plain ``COPY . .``.

That copy is a DUPLICATE, and duplicates drift. The guard is
``tests/test_shared_schemas.py::TestVendoredCopy``, which byte-compares it
against ``packages/shared/schemas`` and fails CI on any difference; refresh it
with ``python -m app.contracts.sync_schemas`` (or ``--check`` to dry-run).

Resolution order for the schemas directory:

1. ``BELLUM_SHARED_SCHEMAS_DIR`` (absolute or relative to the cwd) — the escape
   hatch for an unusual layout.
2. ``packages/shared/schemas`` found by walking up from this file — the CANONICAL
   copy. First in the monorepo (dev, CI, pytest) so the source of truth always
   wins locally and a stale vendored copy can never mask it.
3. :data:`VENDORED_DIR` — the copy that ships in the container, where step 2
   finds nothing.
4. Not found → ``SharedSchemasNotFound``, logged once at error level; validation
   degrades to a no-op unless strict mode is on (then it raises). The service
   still starts: a missing contract must never take the API down.
"""

from __future__ import annotations

import json
import logging
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft7Validator, ValidationError

logger = logging.getLogger(__name__)

#: The four pipeline steps, in execution order. Mirrors ``SCHEMA_IDS`` in
#: ``packages/shared/src/index.ts`` — a step added on one side without the other
#: fails the cross-lang round-trip test.
STEPS: tuple[str, ...] = ("research", "contacts", "classify", "plan")

_ENV_DIR = "BELLUM_SHARED_SCHEMAS_DIR"
_ENV_STRICT = "BELLUM_SCHEMA_STRICT"

#: Relative location of the shared schemas inside the monorepo.
_MONOREPO_REL = Path("packages") / "shared" / "schemas"

#: The copy that ships inside the container, next to this module. Kept
#: byte-identical to the canonical directory by ``app.contracts.sync_schemas``
#: and guarded by ``tests/test_shared_schemas.py::TestVendoredCopy``.
VENDORED_DIR = Path(__file__).resolve().parent / "schemas"

#: How many violations we log per step. A payload that drifts badly would
#: otherwise produce hundreds of near-identical lines (one per array item).
_MAX_LOGGED_ERRORS = 5


class SharedSchemasNotFound(RuntimeError):
    """``packages/shared/schemas`` could not be located on this machine."""


def _candidate_dirs() -> list[Path]:
    override = os.getenv(_ENV_DIR, "").strip()
    candidates: list[Path] = []
    if override:
        candidates.append(Path(override).expanduser())
    here = Path(__file__).resolve()
    # Walk up: app/contracts → app → apps/ia → apps → <repo root>. The repo root
    # is where `packages/` lives; cwd is deliberately NOT trusted (pytest runs
    # from apps/ia, uvicorn from apps/ia, a script from anywhere).
    for parent in here.parents:
        candidates.append(parent / _MONOREPO_REL)
    # Last: the vendored copy that ships in the image. AFTER the monorepo walk on
    # purpose — locally the source of truth must win, so a stale vendored copy can
    # never silently shadow it (the sync guard catches the staleness instead).
    candidates.append(VENDORED_DIR)
    return candidates


@lru_cache(maxsize=1)
def schemas_dir() -> Path:
    """Absolute path of the shared schemas directory.

    Cached: the lookup walks the filesystem, and the answer cannot change within
    a process. Raises :class:`SharedSchemasNotFound` (after logging the full list
    of paths tried) when nothing matches — an explicit failure, never a silent
    skip.
    """
    tried: list[str] = []
    for candidate in _candidate_dirs():
        tried.append(str(candidate))
        # A directory only counts when it actually holds the step schemas —
        # guards against an env var pointing at an empty/wrong folder.
        if all((candidate / f"{step}.schema.json").is_file() for step in STEPS):
            logger.info("Shared JSON Schemas resolved at %s", candidate)
            return candidate
    logger.error(
        "Shared JSON Schemas introuvables — la validation de contrat inter-langages "
        "est DESACTIVEE pour ce process. Renseigner %s (chemin d'une copie de "
        "packages/shared/schemas) ou embarquer le dossier dans l'image.",
        _ENV_DIR,
        extra={
            "tags": {"component": "contracts", "issue": "273"},
            "contexts": {"shared_schemas": {"tried": tried[:12], "env_var": _ENV_DIR}},
        },
    )
    raise SharedSchemasNotFound(f"packages/shared/schemas not found; tried: {tried[:12]}")


@lru_cache(maxsize=len(STEPS))
def load_step_schema(step: str) -> dict[str, Any]:
    """The JSON Schema of ``step`` (one of :data:`STEPS`), read from disk once."""
    if step not in STEPS:
        raise ValueError(f"unknown pipeline step {step!r}; expected one of {STEPS}")
    path = schemas_dir() / f"{step}.schema.json"
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache(maxsize=len(STEPS))
def _validator(step: str) -> Draft7Validator:
    return Draft7Validator(load_step_schema(step))


def branchable_fields(step: str) -> dict[str, Any]:
    """The ``x-bellum-branchable`` block of ``step``'s schema.

    The schemas are permissive on purpose (nothing is ``required``, so an
    enrichment can add keys freely) — which means a DISAPPEARING field would slip
    through plain JSON-Schema validation. This annotation is the counterweight:
    the explicit list of keys a consumer branches on. Both languages read it from
    the same file, so the "a branched field vanished" guard is identical in
    vitest and pytest.

    Shape: ``{"root": [...], "items": {"<array key>": [...]}}``.
    """
    block = load_step_schema(step).get("x-bellum-branchable") or {}
    return {"root": list(block.get("root") or []), "items": dict(block.get("items") or {})}


_CAMEL_BOUNDARY = re.compile(r"(?<!^)(?=[A-Z])")


def _to_snake(key: str) -> str:
    return _CAMEL_BOUNDARY.sub("_", key).lower()


def _normalize_keys(payload: dict[str, Any], schema: dict[str, Any]) -> dict[str, Any]:
    """Map camelCase wire keys onto the snake_case keys a schema documents.

    Phase 1 emits camelCase on the IA wire (``entitiesExhaustive``) while
    ``research.schema.json`` documents the STORED snake_case shape
    (``entities_exhaustive``) — the API worker converts between them. Without
    this, validating the IA payload against the stored schema would be VACUOUS:
    every camel key would fall through ``additionalProperties: true`` unchecked.

    Top-level only, on a shallow copy, and only when the snake variant is
    actually documented and the camel one is not — so a schema that documents
    camelCase (contacts / classify / plan) is untouched.
    """
    properties = schema.get("properties") or {}
    if not properties:
        return payload
    normalized = dict(payload)
    for key in list(normalized):
        if key in properties:
            continue
        snake = _to_snake(key)
        if snake != key and snake in properties and snake not in normalized:
            normalized[snake] = normalized.pop(key)
    return normalized


def _declared_types(prop: dict[str, Any]) -> tuple[str, ...]:
    declared = prop.get("type")
    if isinstance(declared, str):
        return (declared,)
    return tuple(declared) if isinstance(declared, list) else ()


def conform_to_contract(step: str, payload: dict[str, Any]) -> dict[str, Any]:
    """#4454 — ramène les champs de PREMIER niveau à la forme que le contrat documente.

    Le payload research est le JSON du modèle, enrichi : une dérive de type (``employees: 5000`` au lieu
    de ``"5000"``, ``siren: null`` sur un champ non nullable) violait le contrat à chaque run. Côté
    producteur, donc, deux gestes — et seulement ceux-là, jamais une valeur inventée :

    * un nombre posé là où le contrat veut une chaîne devient sa chaîne ; une chaîne numérique là où il
      veut un nombre devient ce nombre ;
    * un ``null`` sur un champ qui n'est pas déclaré nullable est RETIRÉ (absent = non renseigné).

    Tout le reste (clé inconnue, valeur d'un autre type, booléen) est laissé tel quel : la validation le
    signale. Les clés camelCase de la voie IA sont lues comme leur jumelle snake_case documentée.
    """
    properties = load_step_schema(step).get("properties") or {}
    for key in list(payload):
        prop = properties.get(key) or properties.get(_to_snake(key))
        if isinstance(prop, dict):
            _conform_entry(payload, key, prop)
    return payload


_MISSING = object()


def _coerced(value: Any, types: tuple[str, ...]) -> Any:
    """La valeur ramenée au type déclaré, ou ``_MISSING`` si elle n'a pas de forme sans invention."""
    wants_number = bool({"number", "integer"} & set(types))
    if isinstance(value, (int, float)) and "string" in types and not wants_number:
        return str(value)
    if isinstance(value, str) and wants_number and "string" not in types:
        try:
            number = float(value)
        except ValueError:
            return _MISSING
        return int(number) if "number" not in types and number.is_integer() else number
    if isinstance(value, float) and "integer" in types and "number" not in types and value.is_integer():
        return int(value)  # R23 — 3.0 où le contrat veut un entier : la même quantité, sans décimale
    return _MISSING


def _conform_entry(container: dict[str, Any] | list[Any], key: Any, prop: dict[str, Any]) -> None:
    """Ramène ``container[key]`` au schéma ``prop`` — récursif (objets et éléments de tableaux, R23 #4454).
    ``null`` non déclaré nullable : l'entrée est RETIRÉE d'un objet (absent = non renseigné), laissée dans un tableau."""
    types = _declared_types(prop)
    value = container[key]
    if isinstance(value, bool):
        return
    if value is None:
        if types and "null" not in types and isinstance(container, dict):
            del container[key]
        return
    if isinstance(value, dict) and isinstance(prop.get("properties"), dict):
        for sub_key in list(value):
            sub = prop["properties"].get(sub_key)
            if isinstance(sub, dict):
                _conform_entry(value, sub_key, sub)
        return
    if isinstance(value, list) and isinstance(prop.get("items"), dict):
        for index in range(len(value)):
            _conform_entry(value, index, prop["items"])
        return
    if types:
        fixed = _coerced(value, types)
        if fixed is not _MISSING:
            container[key] = fixed


def validate_step(step: str, payload: Any) -> list[str]:
    """Validate ``payload`` against ``step``'s schema. Returns error messages.

    Pure: it neither logs nor raises, so tests and the runtime hook can each
    decide what to do. An empty list means the payload honours the contract.
    """
    schema = load_step_schema(step)
    subject = _normalize_keys(payload, schema) if isinstance(payload, dict) else payload
    errors = sorted(_validator(step).iter_errors(subject), key=lambda e: list(e.absolute_path))
    return [f"{'/'.join(str(p) for p in err.absolute_path) or '<root>'}: {err.message}" for err in errors]


def missing_branchable(step: str, payload: Any) -> list[str]:
    """Branched fields absent from ``payload`` (see :func:`branchable_fields`).

    Returns dotted paths, e.g. ``contacts[0].bucket``. Empty = nothing a
    consumer relies on has disappeared.
    """
    spec = branchable_fields(step)
    if not isinstance(payload, dict):
        return []
    missing = [key for key in spec["root"] if key not in payload]
    for array_key, item_keys in spec["items"].items():
        rows = payload.get(array_key)
        if not isinstance(rows, list):
            continue
        for index, row in enumerate(rows):
            if not isinstance(row, dict):
                continue
            missing.extend(f"{array_key}[{index}].{k}" for k in item_keys if k not in row)
    return missing


def _strict_enabled() -> bool:
    # Read at CALL time (not import time) so a test can flip the env var.
    return os.getenv(_ENV_STRICT, "").strip().lower() in ("1", "true", "yes", "on")


def validate_step_output(step: str, payload: Any, *, strict: bool | None = None) -> list[str]:
    """Pipeline hook — validate a step's output and report the drift.

    NON-BLOCKING by default: a contract violation is reported via
    ``logger.error`` (project convention: the logging transport forwards to
    Sentry with the correlation id — never ``capture_exception`` directly) and
    the run continues. Rationale: the schemas are advisory documentation of the
    wire, and refusing to ship a dossier because a field changed type would turn
    a documentation bug into a customer-facing outage.

    ``strict=True`` (or ``BELLUM_SCHEMA_STRICT=true``) raises
    ``jsonschema.ValidationError`` instead — that is what CI and the tests use,
    so a drift fails the build.

    Returns the (possibly empty) list of violations, so a caller can attach them
    to its own telemetry.
    """
    strict = _strict_enabled() if strict is None else strict
    try:
        errors = validate_step(step, payload)
    except SharedSchemasNotFound:
        # Already logged (once) by `schemas_dir`. Degrade to a no-op unless the
        # caller explicitly asked for strictness — in strict mode a missing
        # contract IS the failure.
        if strict:
            raise
        return []
    if not errors:
        return []
    if strict:
        raise ValidationError(f"[{step}] contrat partagé violé: " + " | ".join(errors[:_MAX_LOGGED_ERRORS]))
    logger.error(
        "Contrat partagé violé sur l'étape %s (%d violation(s)) — payload livré quand même",
        step,
        len(errors),
        extra={
            "tags": {"component": "contracts", "step": step, "issue": "273"},
            "contexts": {"shared_schema": {"errors": errors[:_MAX_LOGGED_ERRORS], "total": len(errors)}},
        },
    )
    return errors
