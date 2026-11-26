"""Cross-language contracts consumed by the IA service.

The canonical artifacts live in ``packages/shared/schemas`` (one JSON Schema per
pipeline step). This package is the Python *reader* of those artifacts — it owns
no schema of its own, so TS and Python can never drift onto two sources of truth.
"""

from app.contracts.shared_schemas import (
    STEPS,
    SharedSchemasNotFound,
    branchable_fields,
    load_step_schema,
    missing_branchable,
    schemas_dir,
    validate_step,
    validate_step_output,
)

__all__ = [
    "STEPS",
    "SharedSchemasNotFound",
    "branchable_fields",
    "load_step_schema",
    "missing_branchable",
    "schemas_dir",
    "validate_step",
    "validate_step_output",
]
