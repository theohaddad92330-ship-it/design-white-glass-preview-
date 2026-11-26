import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import contactsSchema from '../../../shared/schemas/contacts.schema.json' with { type: 'json' }
import classifySchema from '../../../shared/schemas/classify.schema.json' with { type: 'json' }
import planSchema from '../../../shared/schemas/plan.schema.json' with { type: 'json' }
import researchSchema from '../../../shared/schemas/research.schema.json' with { type: 'json' }
import { classifiedDataSchema, enrichedContactSchema } from './classified-data.js'
import { researchDataSchema } from './research-data.js'
import { strategyDataSchema } from './strategy-data.js'

/**
 * #273 — SINGLE SOURCE OF TRUTH guard.
 *
 * The issue proposed generating `packages/shared/schemas/*.json` from the zod
 * contracts at build time. We deliberately did NOT do that, and this test is the
 * price we pay instead. The reasoning, so the next reader can overturn it with
 * eyes open:
 *
 * 1. **Generation would destroy the artifact's value.** The zod contracts are
 *    intentionally thin — `.passthrough()`, everything `.optional()`,
 *    `z.array(z.unknown())`. `zod-to-json-schema` would emit ~32 camelCase
 *    properties with no descriptions for `research`, where the hand-written
 *    schema documents 71 keys of the REAL stored payload, in French, with the
 *    enums and the legacy-wire caveats a consumer actually needs.
 * 2. **Generated schemas would not match the wire.** zod is camelCase; the wire
 *    emits `organigramme`, `approach_order`, `quick_wins`, `if_no_response`,
 *    `connection_path`, and the *stored* research payload is snake_case
 *    throughout. A schema generated from zod would validate nothing real — the
 *    fixtures in `packages/shared/schemas/__fixtures__` would all fail it.
 * 3. The issue itself asks for the zod-4 upgrade to be an isolated PR.
 *
 * So the schemas stay hand-written, and THIS test makes a silent divergence
 * impossible: every key a zod contract declares must be documented in the
 * corresponding JSON Schema (directly, via its snake_case spelling, via a
 * declared alias, or via an explicitly reviewed exception), and every enum must
 * carry the exact same values on both sides. Add a field to zod and forget the
 * JSON Schema → this fails. Change an enum on one side → this fails.
 */

type ZodObjectLike = z.ZodObject<z.ZodRawShape>
type JsonSchema = { properties?: Record<string, unknown>; definitions?: Record<string, unknown> }

/** camelCase → snake_case, the conversion the API worker applies when it stores
 *  the research payload (`priorityScore` → `priority_score`). */
const toSnake = (key: string): string => key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()

/** Unwrap Optional/Nullable/Default/Array wrappers down to the core zod type. */
const unwrap = (schema: unknown): unknown => {
  // zod 4 : les internes vivent sous `_zod.def` (`element` = l'item d'un tableau,
  // `in` = l'entrée d'un `.transform()`/`.pipe()`).
  let node = schema as { _zod?: { def?: { innerType?: unknown; element?: unknown; in?: unknown } } }
  for (let i = 0; i < 10 && node?._zod?.def; i += 1) {
    const inner = node._zod.def.innerType ?? node._zod.def.element ?? node._zod.def.in
    if (!inner) break
    node = inner as typeof node
  }
  return node
}

/** Every zod enum reachable from a schema, keyed by the PROPERTY name that holds
 *  it — the name a JSON Schema documents it under too. */
const collectZodEnums = (schema: unknown, out = new Map<string, string[]>()): Map<string, string[]> => {
  const node = unwrap(schema) as { _zod?: { def?: { type?: string } }; shape?: z.ZodRawShape }
  if (node?._zod?.def?.type === 'enum') return out
  const shape = node?.shape
  if (!shape) return out
  for (const [key, value] of Object.entries(shape)) {
    const inner = unwrap(value) as { _zod?: { def?: { type?: string; entries?: Record<string, string> } } }
    if (inner?._zod?.def?.type === 'enum' && inner._zod.def.entries) {
      out.set(key, Object.values(inner._zod.def.entries))
    } else {
      collectZodEnums(value, out)
    }
  }
  return out
}

/** Every enum a JSON Schema declares, keyed by the property name holding it. */
const collectJsonEnums = (node: unknown, key: string | null = null, out = new Map<string, string[]>()) => {
  if (!node || typeof node !== 'object') return out
  const obj = node as Record<string, unknown>
  if (key && Array.isArray(obj.enum)) out.set(key, obj.enum as string[])
  for (const container of ['properties', 'definitions'] as const) {
    for (const [k, v] of Object.entries((obj[container] ?? {}) as Record<string, unknown>)) {
      collectJsonEnums(v, k, out)
    }
  }
  if (obj.items) collectJsonEnums(obj.items, key, out)
  return out
}

type StepParity = {
  step: string
  zod: ZodObjectLike
  json: JsonSchema
  /** zod key → the key the JSON Schema documents it under, when neither the
   *  identity nor the snake_case conversion applies. Each entry is a documented
   *  wire-format drift, not a rename we are free to make. */
  aliases?: Record<string, string>
  /** zod keys the JSON Schema intentionally does NOT document, each with the
   *  reason. Reviewed on sight in a PR — that is the whole point. */
  zodOnly?: Record<string, string>
  /** Sub-object of the JSON Schema holding the per-item contract, when the zod
   *  schema describes one row and the JSON Schema nests it under `definitions`. */
  jsonProperties?: () => Record<string, unknown>
}

const STEPS: StepParity[] = [
  {
    step: 'research',
    zod: researchDataSchema as unknown as ZodObjectLike,
    json: researchSchema as JsonSchema,
    aliases: {
      // The Python prompts still emit the French / legacy spellings.
      orgChartLogic: 'organigramme_logic',
      accountOpeningStrategy: 'comment_ouvrir_compte',
    },
  },
  {
    step: 'contacts',
    zod: enrichedContactSchema as unknown as ZodObjectLike,
    json: contactsSchema as JsonSchema,
    aliases: {
      // The persisted `topContacts[]` row renames two classifier fields.
      role: 'decisionRole',
      summary: 'profileSummary',
    },
    zodOnly: {
      // Classifier-stage fields that are NOT persisted onto the topContacts row.
      // They are fully documented one step upstream, in classify.schema.json.
      reportingTo: 'classifier-stage only — see classify.schema.json#/definitions/enrichedContact',
      influenceLevel: 'classifier-stage only — see classify.schema.json',
      bestApproach: 'classifier-stage only — see classify.schema.json',
      personalizedHook: 'classifier-stage only — see classify.schema.json',
      careerLevers: 'classifier-stage only — see classify.schema.json',
      implicitFears: 'classifier-stage only — see classify.schema.json',
      connectionPath: 'classifier-stage only — see classify.schema.json',
      source: 'the persisted row exposes the coarser `sourceTag` (INTERNE/PUBLIC/HYPOTHESE/RISQUE) instead',
    },
  },
  {
    step: 'classify',
    zod: classifiedDataSchema as unknown as ZodObjectLike,
    json: classifySchema as JsonSchema,
  },
  {
    step: 'classify (contact rows)',
    zod: enrichedContactSchema as unknown as ZodObjectLike,
    json: classifySchema as JsonSchema,
    jsonProperties: () =>
      (classifySchema as unknown as { definitions: { enrichedContact: { properties: Record<string, unknown> } } })
        .definitions.enrichedContact.properties,
  },
  {
    step: 'plan',
    zod: strategyDataSchema as unknown as ZodObjectLike,
    json: planSchema as JsonSchema,
    aliases: {
      // The Python prompt still emits the snake_case spellings.
      quickWins: 'quick_wins',
      ifNoResponse: 'if_no_response',
    },
  },
]

describe.each(STEPS)('zod ↔ JSON Schema parity — $step (#273)', config => {
  const props = config.jsonProperties?.() ?? config.json.properties ?? {}
  const zodKeys = Object.keys(config.zod.shape)
  const aliases = config.aliases ?? {}
  const zodOnly = config.zodOnly ?? {}

  it('documents every field the zod contract declares', () => {
    const undocumented = zodKeys.filter(key => {
      if (key in zodOnly) return false
      const documented = aliases[key] ?? key
      return !(documented in props) && !(toSnake(key) in props)
    })
    expect(undocumented).toEqual([])
  })

  it('carries no stale alias (every alias still exists on both sides)', () => {
    for (const [zodKey, jsonKey] of Object.entries(aliases)) {
      expect(zodKeys, `alias ${zodKey} → ${jsonKey}: zod key gone`).toContain(zodKey)
      expect(Object.keys(props), `alias ${zodKey} → ${jsonKey}: JSON key gone`).toContain(jsonKey)
    }
  })

  it('carries no stale exception (an excepted field must still be in zod)', () => {
    // Prevents the exception list from becoming a graveyard that hides real gaps.
    for (const key of Object.keys(zodOnly)) expect(zodKeys).toContain(key)
    // …and an excepted field must genuinely be absent from the JSON Schema,
    // otherwise the exception is a lie left over from an earlier shape.
    for (const key of Object.keys(zodOnly)) {
      expect(props[aliases[key] ?? key], `${key} is documented — drop its exception`).toBeUndefined()
    }
  })
})

describe('enum parity — the taxonomies must be byte-identical on both sides (#273)', () => {
  const jsonEnums = new Map<string, string[]>([
    ...collectJsonEnums(researchSchema),
    ...collectJsonEnums(contactsSchema),
    ...collectJsonEnums(classifySchema),
    ...collectJsonEnums(planSchema),
  ])
  const zodEnums = collectZodEnums(enrichedContactSchema)

  it('finds the deterministic triage taxonomies on the zod side', () => {
    // A sanity anchor: if zod stops declaring these, the parity loop below would
    // silently pass on an empty set.
    expect([...zodEnums.keys()].sort()).toEqual(['bucket', 'hierarchyLevel', 'qualifStatus'])
  })

  it.each([...collectZodEnums(enrichedContactSchema).entries()])(
    '`%s` has the same values in zod and in the published JSON Schema',
    (key, values) => {
      const published = jsonEnums.get(key)
      expect(published, `${key} is not declared as an enum in any published schema`).toBeDefined()
      expect([...(published ?? [])].sort()).toEqual([...values].sort())
    },
  )
})
