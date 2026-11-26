# @bellum/shared

Language-neutral, **frozen contracts** for the BellumAI pipeline — the stable
surface a consumer (front, Python, anyone) can branch on without depending on
the TypeScript/zod internals.

## What's here

One JSON Schema (draft-07) **per pipeline step** — the language-neutral contract
for that step's output. All permissive (passthrough), but each documents the
branchable fields a consumer relies on:

| Step       | File                           | What it describes                                                                                                                                                                          |
| ---------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `research` | `schemas/research.schema.json` | **Phase 1** dossier de conquête, in its **STORED** (mostly `snake_case`) shape: firmographics, `subsidiaries` + `meaningful_subsidiaries`, `entities_exhaustive`, `confidence`, `sources`. |
| `contacts` | `schemas/contacts.schema.json` | One **persisted `topContacts[]` row** (`camelCase`): identity, `decisionRole` (MEDDIC), deterministic triage axes `bucket` / `hierarchyLevel` / `qualifStatus`, `sourceTag`, Apollo blob.  |
| `classify` | `schemas/classify.schema.json` | **Phase 3** classifier output: `contacts[]` (classifier-stage shape), `organigramme`, `decisionChain`, `uncoveredZones`, `stakeholderMap`, `approach_order`, `buyingCommittee`.            |
| `plan`     | `schemas/plan.schema.json`     | **Phase 4** stratège output (the `plan` sub-object): `actionPlan`, `evaluation`, `competitiveStrategy`, `contactMessages`, `offersToPropose`, `commercialScore`, `scoreFactors`.           |

Plus `schemas/analysis-input.schema.json` (the analysis **input** contract) and
`src/index.ts`, which exports each schema and `SCHEMA_IDS` (one `$id` per step).

> ⚠️ `contacts` and `classify` describe the **same person at two different
> stages**. The classifier emits `role` / `summary` / `influenceLevel`; the
> persisted row exposes `decisionRole` / `profileSummary` / `sourceTag`. Read the
> schema that matches the boundary you sit on.

## Usage — TypeScript

```ts
import Ajv from 'ajv'
import { classifySchema, SCHEMA_IDS } from '@bellum/shared'
// …or import a single file: import plan from '@bellum/shared/schemas/plan'

const validate = new Ajv({ allErrors: true, strict: false }).compile(classifySchema)
if (!validate(payload)) console.error(validate.errors)
```

## Usage — Python

The IA service reads these schemas through `apps/ia/app/contracts/shared_schemas.py`
— these very files in the monorepo, or the byte-identical copy that ships in the
container (see [Environment variables](#usage--python) below):

```python
from app.contracts.shared_schemas import validate_step, validate_step_output

errors = validate_step("plan", payload)             # pure: returns error strings
validate_step_output("plan", payload)               # pipeline hook: logs, non-blocking
validate_step_output("plan", payload, strict=True)  # raises jsonschema.ValidationError
```

The four graph nodes (`apps/ia/app/graph/nodes.py`) call `validate_step_output`
on every phase's output.

**Environment variables**

| Var                         | Effect                                                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BELLUM_SHARED_SCHEMAS_DIR` | Absolute path to a directory holding the four step schemas. Escape hatch for an unusual layout — **not needed in normal operation**, the container ships its own copy (see below). |
| `BELLUM_SCHEMA_STRICT`      | `true` → a violation raises instead of logging. **Set on the `Test (IA / Python)` CI job**, so drift fails the build; leave it off in production.                                  |

Resolution order:

1. `BELLUM_SHARED_SCHEMAS_DIR`
2. `packages/shared/schemas`, found by walking up from the module — the
   **canonical** copy, so in the monorepo the source of truth always wins
3. `apps/ia/app/contracts/schemas/` — the copy that **ships in the container**
4. **explicit failure** (loud `logger.error`, validation off, service still starts)

A directory only counts when it holds all four step schemas, so an env var
pointing at a stale/partial copy is rejected rather than silently accepted.

### Why the IA service carries its own copy

The IA service deploys **alone**. Its `railway.json` runs
`pip install -r requirements.txt` and `uvicorn app.main:app`, neither of which
resolves anywhere but `apps/ia` (there is no `requirements.txt` nor `app/` at the
repo root), and `apps/ia/docker/Dockerfile` builds from the `apps/ia` context
too. `packages/shared` is therefore **not on disk in production** — unlike
`apps/api`, whose `railway.json` uses root-level `pnpm turbo` commands and so
builds from the monorepo root.

A validation hook that never runs in prod rots silently, so
`apps/ia/app/contracts/schemas/` holds a copy of the five `*.schema.json` files
(68 KB; the `__fixtures__/` stay behind — nothing reads them at runtime) and
ships via the plain `COPY . .`.

That copy is a duplicate, and duplicates drift. **Never hand-edit it.** It is
owned by one script and guarded on two levels:

```bash
cd apps/ia
python -m app.contracts.sync_schemas            # refresh after editing a schema
python -m app.contracts.sync_schemas --check    # exit 1 if stale
```

`--check` runs as its own CI step in `Test (IA / Python)`, and
`tests/test_shared_schemas.py::TestVendoredCopy` byte-compares the two
directories (content, not size/mtime). Edit a schema in `packages/shared` and
forget to re-sync → CI fails with the exact command to run.

## Behaviour on divergence

Three different things can drift, and each fails in its own place:

1. **A payload violates a schema** (a field changed type, an enum value left the
   taxonomy). In production this is **non-blocking**: `validate_step_output`
   emits `logger.error(...)` with structured meta — the project convention, so
   the logging transport forwards it to Sentry with the correlation id — and the
   dossier ships anyway. Rationale: the schemas document the wire; refusing to
   deliver an analysis the user paid a credit for, because a field changed type,
   would turn a documentation bug into an outage. In CI the `Test (IA / Python)`
   job runs with `BELLUM_SCHEMA_STRICT=true`, so the same violation raises and
   fails the build there.
2. **A branched field disappears.** The schemas are permissive — nothing is
   `required` — so a _vanishing_ key would sail through plain validation. Each
   schema therefore carries an `x-bellum-branchable` block listing the keys
   consumers actually branch on. Both languages read that same block
   (`missingBranchable` in vitest, `missing_branchable` in pytest), so the guard
   is identical on both sides and an amputated payload fails the round-trip.
3. **A zod contract and its JSON Schema diverge.** See below.

## Source of truth

The zod contracts in `@bellum/contracts` (`researchDataSchema`,
`enrichedContactSchema`, `classifiedDataSchema`, `strategyDataSchema`) are the
source of truth. The JSON Schemas here are **maintained by hand**, not generated
from zod — a deliberate choice, documented in full at the top of
`packages/contracts/src/schemas/shared-schema-parity.test.ts`. In short:

- the zod contracts are intentionally thin (`.passthrough()`, everything
  optional), so `zod-to-json-schema` would emit a strictly _weaker_ artifact —
  ~32 undocumented camelCase keys for `research` where the hand-written schema
  documents 71 keys of the real stored payload, with enums and caveats;
- zod is camelCase while the wire is not (`organigramme`, `approach_order`,
  `quick_wins`, `connection_path`, and the whole snake_case stored research
  payload), so a generated schema would validate none of the real fixtures;
- the issue asks for the zod-4 upgrade to be an isolated PR anyway.

Hand-maintained does **not** mean unguarded. `shared-schema-parity.test.ts`
asserts that every key a zod contract declares is documented in the corresponding
JSON Schema — directly, via its `snake_case` spelling, via a declared alias, or
via an explicitly reviewed exception with a written reason — and that every enum
carries byte-identical values on both sides. It also fails on _stale_ aliases and
exceptions, so the escape hatches cannot rot into a graveyard. Adding a field to
zod and forgetting the JSON Schema fails CI.

## CI — the cross-lang round-trip

Both halves validate the SAME fixtures against the SAME schema files:

| Half       | Where                                                                                                          | CI job                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| TypeScript | `packages/shared/src/*.contract.test.ts` (ajv) + `packages/contracts/src/schemas/shared-schema-parity.test.ts` | `Test (contracts / cross-lang schemas)` |
| Python     | `apps/ia/tests/test_shared_schemas.py` (`jsonschema`)                                                          | `Test (IA / Python)`                    |

```bash
pnpm --filter @bellum/shared test
pnpm --filter @bellum/contracts test
cd apps/ia && pytest -q tests/test_shared_schemas.py
```

Fixtures live in `schemas/__fixtures__/` (a real Société Générale run) plus
`packages/contracts/src/fixtures/` (Société Générale + Doctolib research).
`real-run-sg.classify.json` is **emitted by the production Pydantic models
themselves**, so its shape cannot drift from the wire; its content is real SG
data already committed in this repo. Re-dump a fixture whenever a new output
field ships — the drift guards will tell you when.

## Known gaps

- **The vendored copy is a duplicate.** Guarded by a byte-comparison test and a
  CI step (see above), so it cannot drift silently — but it is still two files
  where one would be nicer. The clean fix is to widen the IA service's Railway
  **Root Directory** to the repo root (as `apps/api` already does) and adjust its
  `buildCommand` / `startCommand` accordingly; that is a dashboard change, not a
  repo change, so it was deliberately left out of this PR.
- **Phase 2 `contacts`.** The graph validates each phase-2 row against
  `contacts.schema.json`, but phase 2 emits raw Apollo hits while the schema
  describes the _persisted_ row; only the shared identity keys (`fullName`,
  `title`, `email`, `linkedinUrl`, `city`, `country`) are effectively checked
  there. The classifier-stage fields are covered by `classify.schema.json`.
- **`contacts.schema.json` has no 1:1 zod counterpart** — the persisted
  `topContacts[]` row is a DB/telemetry shape. Parity is asserted against
  `enrichedContactSchema` with a documented alias + exception list.
