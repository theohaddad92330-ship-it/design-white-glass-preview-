// @bellum/shared — the language-neutral, frozen contract Mattéo branches on.
// The per-step JSON Schemas are the canonical cross-lang artifacts (consumable
// from TS, Python, anywhere); the zod source of truth lives in @bellum/contracts.

import researchSchema from '../schemas/research.schema.json' with { type: 'json' }
import contactsSchema from '../schemas/contacts.schema.json' with { type: 'json' }
import classifySchema from '../schemas/classify.schema.json' with { type: 'json' }
import planSchema from '../schemas/plan.schema.json' with { type: 'json' }

export { researchSchema, contactsSchema, classifySchema, planSchema }

/** JSON Schema `$id`s exported by this package, one per pipeline step.
 *  The four keys are the four pipeline STEP NAMES — the same identifiers the
 *  Python validator keys on (`app/contracts/shared_schemas.py::STEPS`), so a
 *  step added on one side without the other fails the cross-lang round-trip. */
export const SCHEMA_IDS = {
  research: 'https://bellum.ai/schemas/research.schema.json',
  contacts: 'https://bellum.ai/schemas/contacts.schema.json',
  classify: 'https://bellum.ai/schemas/classify.schema.json',
  plan: 'https://bellum.ai/schemas/plan.schema.json',
} as const
